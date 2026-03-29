export interface MatchState {
    teamAScore: number;
    teamBScore: number;
    isMatchOver: boolean;
    winner: 'A' | 'B' | null;
}

export const MatchEngine = {
    createInitialState(): MatchState {
        return {
            teamAScore: 0,
            teamBScore: 0,
            isMatchOver: false,
            winner: null
        };
    },

    /**
     * Validate and submit final scores.
     * Returns the match state with winner determined.
     * Rules: No ties allowed - scores must be different.
     */
    submitFinalScore(scoreA: number, scoreB: number): { valid: boolean; error?: string; state?: MatchState } {
        if (isNaN(scoreA) || isNaN(scoreB)) {
            return { valid: false, error: 'Please enter valid scores' };
        }
        if (scoreA < 0 || scoreB < 0) {
            return { valid: false, error: 'Scores cannot be negative' };
        }
        if (scoreA === scoreB) {
            return { valid: false, error: 'No ties allowed! Scores must be different' };
        }

        const winner: 'A' | 'B' = scoreA > scoreB ? 'A' : 'B';

        return {
            valid: true,
            state: {
                teamAScore: scoreA,
                teamBScore: scoreB,
                isMatchOver: true,
                winner
            }
        };
    }
};
