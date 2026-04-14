import { getDatabase } from './db';
import { CloudSyncService } from './CloudSyncService';

export interface Player {
    id: number;
    name: string;
    matchesPlayed: number;
    wins: number;
    losses: number;
    selected?: boolean; // UI state helper
    avatar?: string;
}

export const PlayerRepository = {
    async getAllPlayers(): Promise<Player[]> {
        const db = await getDatabase();
        const result = await db.getAllAsync<Player>('SELECT * FROM players ORDER BY name ASC');
        return result;
    },

    async addPlayer(name: string, avatar?: string): Promise<void> {
        const db = await getDatabase();
        const result = await db.runAsync('INSERT INTO players (name, avatar) VALUES (?, ?)', name, avatar || null);
        
        // Sync to cloud in background
        const players = await this.getAllPlayers();
        const newPlayer = players.find(p => p.id === result.lastInsertRowId);
        if (newPlayer) {
            CloudSyncService.syncPlayer(newPlayer).catch(e => console.warn('Cloud sync failed (addPlayer):', e));
        }
    },

    async updatePlayer(player: Player): Promise<void> {
        const db = await getDatabase();
        await db.runAsync(
            'UPDATE players SET name = ?, avatar = ?, matchesPlayed = ?, wins = ?, losses = ? WHERE id = ?',
            player.name, player.avatar || null, player.matchesPlayed, player.wins, player.losses, player.id
        );
        // Sync to cloud in background
        CloudSyncService.syncPlayer(player).catch(e => console.warn('Cloud sync failed (updatePlayer):', e));
    },

    async deletePlayer(id: number): Promise<void> {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM players WHERE id = ?', id);
        // Sync to cloud in background
        CloudSyncService.deletePlayer(id).catch(e => console.warn('Cloud sync failed (deletePlayer):', e));
    },

    async resetAllPlayerStats(): Promise<void> {
        const db = await getDatabase();
        await db.runAsync('UPDATE players SET matchesPlayed = 0, wins = 0, losses = 0');
    },

    /**
     * Internal use only: Restores a player from cloud without triggering a re-sync
     */
    async restorePlayer(player: Player): Promise<void> {
        const db = await getDatabase();
        await db.runAsync(
            'INSERT OR REPLACE INTO players (id, name, matchesPlayed, wins, losses, avatar) VALUES (?, ?, ?, ?, ?, ?)',
            player.id, player.name, player.matchesPlayed, player.wins, player.losses, player.avatar || null
        );
    }
};
