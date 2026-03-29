import { getDatabase } from './db';

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
        await db.runAsync('INSERT INTO players (name, avatar) VALUES (?, ?)', name, avatar || null);
    },

    async updatePlayer(player: Player): Promise<void> {
        const db = await getDatabase();
        await db.runAsync(
            'UPDATE players SET name = ?, avatar = ?, matchesPlayed = ?, wins = ?, losses = ? WHERE id = ?',
            player.name, player.avatar || null, player.matchesPlayed, player.wins, player.losses, player.id
        );
    },

    async deletePlayer(id: number): Promise<void> {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM players WHERE id = ?', id);
    },

    async resetAllPlayerStats(): Promise<void> {
        const db = await getDatabase();
        await db.runAsync('UPDATE players SET matchesPlayed = 0, wins = 0, losses = 0');
    }
};
