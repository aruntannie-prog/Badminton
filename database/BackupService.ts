import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { PlayerRepository, Player } from './PlayerRepository';
import { MatchRepository, Match } from './MatchRepository';

const BACKUP_VERSION = 1;

interface BackupFile {
    version: number;
    exportedAt: string;
    appName: string;
    players: Player[];
    matches: Match[];
}

export interface ImportResult {
    playersRestored: number;
    matchesRestored: number;
}

/**
 * Local backup/restore service — exports and imports all app data as a
 * human-readable JSON file.
 *
 * Why this matters:
 *   - Cloud sync (Firestore) handles real-time backup, but a full uninstall
 *     breaks the device_id link even with SecureStore (some devices wipe both).
 *   - A local JSON export gives the user a physical copy they can store
 *     anywhere (WhatsApp, Google Drive, email to self, etc.).
 *   - Import is additive (INSERT OR REPLACE) — safe to run on a fresh install
 *     without losing any existing local data.
 *
 * Usage:
 *   Export → BackupService.exportBackup()   (opens share sheet with JSON file)
 *   Import → BackupService.pickAndImport()  (opens file picker, then restores)
 */
export const BackupService = {
    /**
     * Exports all players and matches to a timestamped JSON file, then opens
     * the native share sheet so the user can save it anywhere they like.
     */
    async exportBackup(): Promise<void> {
        const [players, matches] = await Promise.all([
            PlayerRepository.getAllPlayers(),
            MatchRepository.getAllMatches()
        ]);

        const backup: BackupFile = {
            version: BACKUP_VERSION,
            exportedAt: new Date().toISOString(),
            appName: 'BadmintonSmartScore',
            players,
            matches
        };

        const dateStr = new Date().toISOString().split('T')[0]; // "2026-05-17"
        const filename = `badminton_backup_${dateStr}.json`;
        const uri = FileSystem.documentDirectory + filename;

        await FileSystem.writeAsStringAsync(
            uri,
            JSON.stringify(backup, null, 2),
            { encoding: FileSystem.EncodingType.UTF8 }
        );

        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
            throw new Error('Sharing is not available on this device. The file has been saved locally.');
        }

        await Sharing.shareAsync(uri, {
            mimeType: 'application/json',
            dialogTitle: `Share Badminton Backup (${players.length} players, ${matches.length} matches)`,
            UTI: 'public.json'
        });
    },

    /**
     * Opens the system file picker, reads the selected JSON backup file,
     * validates it, and restores all players and matches using INSERT OR REPLACE
     * (additive — safe to run on an existing database without data loss).
     *
     * Returns the number of records restored.
     */
    async pickAndImport(): Promise<ImportResult> {
        const result = await DocumentPicker.getDocumentAsync({
            type: 'application/json',
            copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets?.length) {
            throw new Error('CANCELLED'); // Caller should handle this silently
        }

        const asset = result.assets[0];
        const json = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.UTF8
        });

        let backup: BackupFile;
        try {
            backup = JSON.parse(json);
        } catch {
            throw new Error('Invalid backup file: could not parse JSON.');
        }

        // Validate backup structure
        if (!backup.appName || backup.appName !== 'BadmintonSmartScore') {
            throw new Error('Invalid backup file: not a BadmintonSmartScore backup.');
        }
        if (!Array.isArray(backup.players) || !Array.isArray(backup.matches)) {
            throw new Error('Invalid backup file: missing players or matches data.');
        }
        if ((backup.version ?? 0) > BACKUP_VERSION) {
            throw new Error(`Backup was created with a newer app version (v${backup.version}). Please update the app.`);
        }

        // Restore players (INSERT OR REPLACE — preserves local data if IDs differ)
        for (const player of backup.players) {
            await PlayerRepository.restorePlayer(player);
        }

        // Restore matches (INSERT OR REPLACE)
        for (const match of backup.matches) {
            await MatchRepository.restoreMatch(match);
        }

        return {
            playersRestored: backup.players.length,
            matchesRestored: backup.matches.length
        };
    }
};
