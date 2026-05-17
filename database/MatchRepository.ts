import { getDatabase } from './db';
import { CloudSyncService } from './CloudSyncService';

export interface Match {
    id: number;
    timestamp: number;
    teamAPlayers: string; // "id1,id2"
    teamBPlayers: string; // "id3,id4"
    teamAScore: number;
    teamBScore: number;
    winnerTeam: 'A' | 'B';
}

export const MatchRepository = {
    async getAllMatches(): Promise<Match[]> {
        const db = await getDatabase();
        return await db.getAllAsync<Match>('SELECT * FROM matches ORDER BY timestamp DESC');
    },

    async saveMatch(match: Omit<Match, 'id'>): Promise<number> {
        const db = await getDatabase();
        const result = await db.runAsync(
            `INSERT INTO matches (timestamp, teamAPlayers, teamBPlayers, teamAScore, teamBScore, winnerTeam)
       VALUES (?, ?, ?, ?, ?, ?)`,
            match.timestamp, match.teamAPlayers, match.teamBPlayers, match.teamAScore, match.teamBScore, match.winnerTeam
        );

        // Sync to cloud in background — don't block or throw on network failure
        const fullMatch: Match = { ...match, id: result.lastInsertRowId };
        CloudSyncService.syncMatch(fullMatch).catch(e => console.warn('Cloud sync failed (saveMatch):', e));
        return result.lastInsertRowId;
    },


    async updateMatchScore(id: number, teamAScore: number, teamBScore: number, winnerTeam: 'A' | 'B'): Promise<void> {
        const db = await getDatabase();
        await db.runAsync(
            'UPDATE matches SET teamAScore = ?, teamBScore = ?, winnerTeam = ? WHERE id = ?',
            teamAScore, teamBScore, winnerTeam, id
        );
    },

    async clearAllMatches(): Promise<void> {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM matches');
        // Sync to cloud in background
        CloudSyncService.clearMatches().catch(e => console.warn('Cloud sync failed (clearMatches):', e));
    },

    /**
     * Internal use only: Restores a match from cloud without triggering a re-sync
     */
    async restoreMatch(match: Match): Promise<void> {
        const db = await getDatabase();
        await db.runAsync(
            `INSERT OR REPLACE INTO matches (id, timestamp, teamAPlayers, teamBPlayers, teamAScore, teamBScore, winnerTeam)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
            match.id, match.timestamp, match.teamAPlayers, match.teamBPlayers, match.teamAScore, match.teamBScore, match.winnerTeam
        );
    },

    /**
     * Deletes a single match by ID. Used by the undo-last-score feature in match.tsx.
     */
    async deleteMatchById(id: number): Promise<void> {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM matches WHERE id = ?', id);
    }
};

