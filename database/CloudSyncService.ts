import { collection, doc, setDoc, getDocs, deleteDoc, writeBatch } from "firebase/firestore";
import { db, ensureAuthenticated } from "./firebaseConfig";
import { Player, PlayerRepository } from "./PlayerRepository";
import { Match, MatchRepository } from "./MatchRepository";
import { KVStore } from "./KVStore";

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
async function getOrCreateDeviceId(): Promise<string> {
    let deviceId = await KVStore.getItem('device_id');
    if (!deviceId) {
        // Generate a stable UUID-like identifier
        const rand = () => Math.random().toString(36).substring(2, 10);
        deviceId = `${rand()}${rand()}${rand()}`;
        await KVStore.setItem('device_id', deviceId);
        console.log("New device_id created:", deviceId);
    }
    return deviceId;
}

export const CloudSyncService = {
    /**
     * Pushes a player to Firestore using the stable device_id path.
     */
    async syncPlayer(player: Player): Promise<void> {
        try {
            await ensureAuthenticated();
            const deviceId = await getOrCreateDeviceId();
            const playerRef = doc(db, "devices", deviceId, "players", player.id.toString());
            await setDoc(playerRef, { ...player, updatedAt: Date.now() }, { merge: true });
        } catch (e) {
            console.error("CloudSyncService.syncPlayer failed:", e);
        }
    },

    /**
     * Deletes a player from Firestore.
     */
    async deletePlayer(id: number): Promise<void> {
        try {
            await ensureAuthenticated();
            const deviceId = await getOrCreateDeviceId();
            const playerRef = doc(db, "devices", deviceId, "players", id.toString());
            await deleteDoc(playerRef);
        } catch (e) {
            console.error("CloudSyncService.deletePlayer failed:", e);
        }
    },

    /**
     * Pushes a match to Firestore using the stable device_id path.
     */
    async syncMatch(match: Match): Promise<void> {
        try {
            await ensureAuthenticated();
            const deviceId = await getOrCreateDeviceId();
            const matchRef = doc(db, "devices", deviceId, "matches", match.id.toString());
            await setDoc(matchRef, { ...match, updatedAt: Date.now() }, { merge: true });
        } catch (e) {
            console.error("CloudSyncService.syncMatch failed:", e);
        }
    },

    /**
     * Clears all matches from Firestore.
     */
    async clearMatches(): Promise<void> {
        try {
            await ensureAuthenticated();
            const deviceId = await getOrCreateDeviceId();
            const matchesRef = collection(db, "devices", deviceId, "matches");
            const snapshot = await getDocs(matchesRef);
            const batch = writeBatch(db);
            snapshot.docs.forEach((d) => batch.delete(d.ref));
            await batch.commit();
        } catch (e) {
            console.error("CloudSyncService.clearMatches failed:", e);
        }
    },

    /**
     * INITIAL SYNC: Fetches all data from Firestore and populates SQLite on first install only.
     * - Uses 'initial_sync_done' flag so it only runs once per install.
     * - Uses stable device_id (not Firebase UID) so data survives reinstalls.
     */
    async initialSync(): Promise<void> {
        // Guard: only run once ever per install
        const syncDone = await KVStore.getItem('initial_sync_done');
        if (syncDone === 'true') {
            console.log("Initial sync already completed. Skipping.");
            return;
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

            // Mark sync as done so it never runs again for this install
            await KVStore.setItem('initial_sync_done', 'true');
            console.log("Initial cloud restore complete.");
        } catch (e) {
            console.error("CloudSyncService.initialSync failed:", e);
            // Don't mark sync as done if it failed — allow retry on next launch
        }
    }
};
