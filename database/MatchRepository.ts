import { getDatabase } from './db';

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

    async saveMatch(match: Omit<Match, 'id'>): Promise<void> {
        const db = await getDatabase();
        await db.runAsync(
            `INSERT INTO matches (timestamp, teamAPlayers, teamBPlayers, teamAScore, teamBScore, winnerTeam)
       VALUES (?, ?, ?, ?, ?, ?)`,
            match.timestamp, match.teamAPlayers, match.teamBPlayers, match.teamAScore, match.teamBScore, match.winnerTeam
        );
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
    }
};
