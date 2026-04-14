import { Player } from '../database/PlayerRepository';

export interface RotationResult {
    teamA: Player[];
    teamB: Player[];
    waitingPair: Player[];
    sittingPlayers: Player[];
}

export const RotationEngine = {
    /**
     * Odd-Player (5, 7) Rotation — Deterministic Round-Robin:
     *
     * 5 players: Team A (winners) stay. From the losing team [L0, L1]:
     *   - L0 stays on court, L1 rotates to sit out.
     *   - The current sitter (S) joins L0 as the new Team B.
     *   - Next round: L1 is the sitter, so L1 comes back in and so on.
     *
     * Example:
     *   Match 1 — TeamA: Arun & PD  |  TeamB: Ram & Karthick  |  Sitting: Logu
     *   TeamB loses →  Ram stays, Karthick sits out, Logu comes in
     *   Match 2 — TeamA: Arun & PD  |  TeamB: Ram & Logu       |  Sitting: Karthick
     *   TeamB loses →  Ram stays, Logu sits out, Karthick comes in
     *   Match 3 — TeamA: Arun & PD  |  TeamB: Ram & Karthick   |  Sitting: Logu
     *   ... cycle repeats
     *
     *   If Team A loses, the sitter still replaces one loser from Team A in the same fashion.
     *
     * 7 players: same loser-rotation logic, but the current waiting pair plays next
     *   and the rotated loser pair waits.
     *
     * Even players (4, 6, 8): Queue-based rotation — winners stay, losers join queue.
     */
    calculateNextMatch(
        winners: Player[],
        losers: Player[],
        waitingPair: Player[],
        sittingPlayers: Player[]
    ): RotationResult {
        const totalPlayers = winners.length + losers.length + waitingPair.length + sittingPlayers.length;

        if (totalPlayers % 2 !== 0 && sittingPlayers.length >= 1) {
            // ODD Players (5, 7) — Deterministic Round-Robin Rotation
            //
            // Bug #5 fix: Do NOT use losers[0] / losers[1] by index (arbitrary).
            // Instead treat sitting as a FIFO queue:
            //   - currentSitter (longest waiting) comes onto court
            //   - ONE loser goes to sit out (goes to END of sitting queue)
            //   - The other loser stays on court, partnered with currentSitter
            //
            // To break the tie of "which loser sits": we rotate based on who
            // was on court longest. Since losers is ordered as they appear in
            // the team array, we use sittingPlayers length as a cycle indicator.
            // The loser at index (sittingPlayers.length % losers.length) sits out,
            // ensuring both losers alternate fairly over successive rounds.

            const currentSitter = sittingPlayers[0];
            const otherSitters = sittingPlayers.slice(1);

            // Determine which loser sits by cycling the index deterministically
            const sitOutIndex = sittingPlayers.length % Math.max(losers.length, 1);
            const loserWhoSitsOut = losers[sitOutIndex] ?? losers[0];
            const loserWhoStays = losers.find(l => l.id !== loserWhoSitsOut.id) ?? losers[0];

            const newPair = [currentSitter, loserWhoStays];
            const newSitting = [...otherSitters, loserWhoSitsOut]; // loser goes to END of queue

            if (waitingPair.length >= 2) {
                // 7 Players: waiting pair challenges next; losers go to waiting
                return {
                    teamA: [...winners],
                    teamB: [...waitingPair],
                    waitingPair: newPair,
                    sittingPlayers: newSitting
                };
            } else {
                // 5 Players: new pair challenges winners directly
                return {
                    teamA: [...winners],
                    teamB: newPair,
                    waitingPair: [],
                    sittingPlayers: newSitting
                };
            }
        } else {
            // EVEN players (4, 6, 8): Fair queue-based rotation
            // Bug #13 fix: losers go to the VERY END of the queue so they
            // wait the full cycle before challenging again (was: losers could
            // re-challenge after only 1 round with some queue orderings).
            //
            // Queue order: waitingPair → sittingPlayers → losers (at end)
            const queue = [...waitingPair, ...sittingPlayers, ...losers];
            const nextChallengers = queue.splice(0, 2);
            const nextWaiting = queue.splice(0, 2);

            return {
                teamA: [...winners],
                teamB: nextChallengers,
                waitingPair: nextWaiting.length >= 2 ? nextWaiting : [],
                sittingPlayers: queue
            };
        }
    },

    /**
     * Initial setup: Shuffle all players, create pairs
     * - 4 players: 2 pairs on court, none waiting
     * - 5 players: 2 pairs on court, 1 sitting
     * - 6 players: 2 pairs on court, 1 pair waiting
     * - 7 players: 2 pairs on court, 1 pair waiting, 1 sitting
     * - 8 players: 2 pairs on court, 2 pairs waiting/sitting
     */
    initialSetup(allPlayers: Player[]): RotationResult {
        const shuffled = [...allPlayers];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const teamA = shuffled.slice(0, 2);
        const teamB = shuffled.slice(2, 4);
        const remaining = shuffled.slice(4);

        // For 7 players: remaining = [P5, P6, P7]
        // waitingPair = [P5, P6], sitting = [P7]
        // For 5 players: remaining = [P5]
        // waitingPair = [], sitting = [P5]
        // For 6 players: remaining = [P5, P6]
        // waitingPair = [P5, P6], sitting = []
        // For 8 players: remaining = [P5, P6, P7, P8]
        // waitingPair = [P5, P6], sitting = [P7, P8]

        let waitingPair: Player[] = [];
        let sitting: Player[] = [];

        if (remaining.length >= 2) {
            waitingPair = remaining.slice(0, 2);
            sitting = remaining.slice(2);
        } else {
            sitting = remaining;
        }

        return { teamA, teamB, waitingPair, sittingPlayers: sitting };
    }
};
