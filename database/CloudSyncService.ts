import { collection, doc, setDoc, getDocs, deleteDoc, writeBatch } from "firebase/firestore";
import * as SecureStore from 'expo-secure-store';
import { db, ensureAuthenticated } from "./firebaseConfig";
import { Player, PlayerRepository } from "./PlayerRepository";
import { Match, MatchRepository } from "./MatchRepository";
import { KVStore } from "./KVStore";

/**
 * Bug fix: Process-lifetime guard for initialSync.
 *
 * The old code only checked the SQLite KV flag. If the native DB connection
 * was reclaimed by the OS (stale handle), KVStore.getItem returned null and
 * initialSync would run again — potentially overwriting fresh local data with
 * stale cloud data via INSERT OR REPLACE.
 *
 * This module-level boolean is set to true the moment sync completes and
 * remains true for the entire JS runtime, regardless of SQLite state.
 */
let syncDoneInMemory = false;

/**
 * Retries an async operation up to `maxAttempts` times with exponential backoff.
 *
 * Delays: 500ms → 1000ms → 2000ms (doubles each attempt).
 * Throws on final failure so the caller can decide what to log.
 *
 * Used by syncPlayer / syncMatch / deletePlayer / clearMatches to silently
 * recover from transient network blips without losing cloud backup data.
 */
async function withRetry<T>(
    label: string,
    fn: () => Promise<T>,
    maxAttempts = 3,
    delayMs = 500
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            if (attempt < maxAttempts) {
                console.warn(`${label}: attempt ${attempt} failed — retrying in ${delayMs}ms…`);
                await new Promise(res => setTimeout(res, delayMs));
                delayMs *= 2; // exponential backoff
            }
        }
    }
    throw lastError;
}

/**
 * Returns a stable device ID that persists across reinstalls.
 *
 * Bug #6 fix: Firebase anonymous auth generates a NEW uid on every reinstall,
 * meaning cloud data lives at a different Firestore path after each reinstall.
 * Solution: generate a UUID once on first launch, store it in KVStore, and use
 * that as the Firestore namespace for all operations.
 *
 * KVStore itself is backed by SQLite which also resets on reinstall — however
 * we generate the device_id as early as possible (before any wipe) and rely
 * on the fact that SQLite data typically survives minor updates. On a true
 * full reinstall, the user gets a fresh device_id and the initial sync
 * restores their cloud data from the old device_id path if provided.
 * For most users (APK update, not uninstall+reinstall), data is preserved.
 */
/**
 * Dual-store device_id persistence.
 *
 * Problem: device_id was previously stored only in SQLite (via KVStore).
 * On a full Android uninstall+reinstall, SQLite is wiped, generating a new
 * device_id — the old Firestore path becomes orphaned and data is unreachable.
 *
 * Fix: write device_id to BOTH SQLite AND expo-secure-store (Android Keystore
 * / iOS Keychain). SecureStore survives APK updates and, on many Android OEMs,
 * even a reinstall. On first run after a fresh install:
 *   1. SecureStore check first (most likely to have survived)
 *   2. SQLite check second
 *   3. If neither has it: generate a new ID and write to both
 *
 * This guarantees the same Firestore path is used as long as at least one
 * of the two stores survived — significantly reducing orphaned-data scenarios.
 */
async function getOrCreateDeviceId(): Promise<string> {
    // 1. Try SecureStore first — survives APK updates and many reinstalls
    try {
        const secureId = await SecureStore.getItemAsync('device_id');
        if (secureId) {
            // Backfill SQLite in case it was wiped
            await KVStore.setItem('device_id', secureId);
            return secureId;
        }
    } catch (secureErr) {
        console.warn('SecureStore read failed (non-fatal):', secureErr);
    }

    // 2. Try SQLite (KVStore)
    let deviceId = await KVStore.getItem('device_id');

    if (!deviceId) {
        // 3. Neither store has it — generate a new stable UUID-like identifier
        const rand = () => Math.random().toString(36).substring(2, 10);
        deviceId = `${rand()}${rand()}${rand()}`;
        console.log("New device_id created:", deviceId);
    }

    // Write to BOTH stores so both survive independently
    await KVStore.setItem('device_id', deviceId);
    try {
        await SecureStore.setItemAsync('device_id', deviceId);
    } catch (secureWriteErr) {
        console.warn('SecureStore write failed (non-fatal):', secureWriteErr);
    }

    return deviceId;
}

export const CloudSyncService = {
    /**
     * Pushes a player to Firestore using the stable device_id path.
     */
    async syncPlayer(player: Player): Promise<void> {
        try {
            await withRetry('CloudSyncService.syncPlayer', async () => {
                await ensureAuthenticated();
                const deviceId = await getOrCreateDeviceId();
                const playerRef = doc(db, "devices", deviceId, "players", player.id.toString());
                await setDoc(playerRef, { ...player, updatedAt: Date.now() }, { merge: true });
            });
        } catch (e) {
            console.error("CloudSyncService.syncPlayer failed after all retries:", e);
        }
    },

    /**
     * Deletes a player from Firestore.
     */
    async deletePlayer(id: number): Promise<void> {
        try {
            await withRetry('CloudSyncService.deletePlayer', async () => {
                await ensureAuthenticated();
                const deviceId = await getOrCreateDeviceId();
                const playerRef = doc(db, "devices", deviceId, "players", id.toString());
                await deleteDoc(playerRef);
            });
        } catch (e) {
            console.error("CloudSyncService.deletePlayer failed after all retries:", e);
        }
    },

    /**
     * Pushes a match to Firestore using the stable device_id path.
     */
    async syncMatch(match: Match): Promise<void> {
        try {
            await withRetry('CloudSyncService.syncMatch', async () => {
                await ensureAuthenticated();
                const deviceId = await getOrCreateDeviceId();
                const matchRef = doc(db, "devices", deviceId, "matches", match.id.toString());
                await setDoc(matchRef, { ...match, updatedAt: Date.now() }, { merge: true });
            });
        } catch (e) {
            console.error("CloudSyncService.syncMatch failed after all retries:", e);
        }
    },

    /**
     * Clears all matches from Firestore.
     */
    async clearMatches(): Promise<void> {
        try {
            await withRetry('CloudSyncService.clearMatches', async () => {
                await ensureAuthenticated();
                const deviceId = await getOrCreateDeviceId();
                const matchesRef = collection(db, "devices", deviceId, "matches");
                const snapshot = await getDocs(matchesRef);
                const batch = writeBatch(db);
                snapshot.docs.forEach((d) => batch.delete(d.ref));
                await batch.commit();
            });
        } catch (e) {
            console.error("CloudSyncService.clearMatches failed after all retries:", e);
        }
    },

    /**
     * INITIAL SYNC: Fetches all data from Firestore and populates SQLite on first install only.
     * - Uses 'initial_sync_done' flag so it only runs once per install.
     * - Uses stable device_id (not Firebase UID) so data survives reinstalls.
     */
    async initialSync(): Promise<void> {
        // Fast path: process-lifetime guard — immune to stale SQLite connections.
        // Once sync has run within this app session, never run again.
        if (syncDoneInMemory) {
            console.log("Initial sync already completed this session (in-memory). Skipping.");
            return;
        }

        // Persistence path: also check SQLite so we don't re-sync on cold app restarts.
        try {
            const syncDone = await KVStore.getItem('initial_sync_done');
            if (syncDone === 'true') {
                syncDoneInMemory = true; // prime the in-memory flag for this session
                console.log("Initial sync already completed (SQLite flag). Skipping.");
                return;
            }
        } catch (e) {
            // SQLite KV read failed — continue cautiously; in-memory flag takes priority.
            console.warn("CloudSyncService.initialSync: KVStore check failed:", e);
        }

        try {
            await ensureAuthenticated();
            const deviceId = await getOrCreateDeviceId();

            console.log("First launch: attempting to restore data from cloud for device:", deviceId);

            // Restore Players
            const playersRef = collection(db, "devices", deviceId, "players");
            const playerSnapshot = await getDocs(playersRef);
            for (const cloudDoc of playerSnapshot.docs) {
                const playerData = cloudDoc.data() as Player;
                await PlayerRepository.restorePlayer(playerData);
            }

            // Restore Matches
            const matchesRef = collection(db, "devices", deviceId, "matches");
            const matchSnapshot = await getDocs(matchesRef);
            for (const cloudDoc of matchSnapshot.docs) {
                const matchData = cloudDoc.data() as Match;
                await MatchRepository.restoreMatch(matchData);
            }

            // Mark sync as done — both layers for maximum durability.
            syncDoneInMemory = true;
            await KVStore.setItem('initial_sync_done', 'true');
            console.log("Initial cloud restore complete.");
        } catch (e) {
            console.error("CloudSyncService.initialSync failed:", e);
            // Do NOT set either flag — allow retry on next launch.
        }
    }
};
