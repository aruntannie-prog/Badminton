import { Match } from '../database/MatchRepository';
import { Player } from '../database/PlayerRepository';

export interface ExtendedPlayerStats {
    playerId: number;
    name: string;
    matchesPlayed: number;
    wins: number;
    losses: number;
    winRatio: number;
    totalPoints: number;
    avgPoints: number;
    rankingScore: number;
    avatar?: string;
}

export interface PairStats {
    player1Id: number;
    player2Id: number;
    player1Name: string;
    player2Name: string;
    matchesTogether: number;
    winsTogether: number;
    winRatio: number;
}

export interface GlobalStats {
    totalMatchesAllTime: number;
    totalMatchesToday: number;
    totalPointsScored: number;
    topPlayer: ExtendedPlayerStats | null;
    bestPair: PairStats | null;
    highestScoreMatch: { score: number; teamNames: string; matchId: number } | null;
}

export const StatisticsEngine = {
    calculateStats(matches: Match[], players: Player[]): {
        playerStats: ExtendedPlayerStats[],
        pairStats: PairStats[],
        globalStats: GlobalStats
    } {
        const playerMap = new Map<number, Player>(players.map(p => [p.id, p]));
        const playerStatsMap = new Map<number, {
            matches: number, wins: number, points: number
        }>();

        // Initialize player stats map
        players.forEach(p => {
            playerStatsMap.set(p.id, { matches: 0, wins: 0, points: 0 });
        });

        const pairStatsMap = new Map<string, {
            p1Id: number, p2Id: number, matches: number, wins: number
        }>();

        let totalPointsGlobal = 0;
        let todayMatches = 0;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayTimestamp = todayStart.getTime();

        let highestScore = 0;
        let highestScoreMatch: { score: number, teamNames: string, matchId: number } | null = null;

        matches.forEach(match => {
            // Check Highest Score
            const checkHigh = (score: number, tIds: string) => {
                if (score > highestScore) {
                    highestScore = score;
                    const names = tIds.split(',').map(id => playerMap.get(parseInt(id))?.name || '?').join(' & ');
                    highestScoreMatch = { score, teamNames: names, matchId: match.id };
                }
            };
            checkHigh(match.teamAScore, match.teamAPlayers);
            checkHigh(match.teamBScore, match.teamBPlayers);

            // Global Counters
            totalPointsGlobal += (match.teamAScore + match.teamBScore);
            if (match.timestamp >= todayTimestamp) {
                todayMatches++;
            }

            const teamAIds = match.teamAPlayers.split(',').map(Number);
            const teamBIds = match.teamBPlayers.split(',').map(Number); // Move up for name resolution

            // Process Team A
            const isAWin = match.winnerTeam === 'A';
            teamAIds.forEach(id => {
                const stats = playerStatsMap.get(id);
                if (stats) {
                    stats.matches++;
                    if (isAWin) {
                        stats.wins++;
                    }
                    stats.points += match.teamAScore;
                    playerStatsMap.set(id, stats);
                }
            });

            // Process Team B
            const isBWin = match.winnerTeam === 'B';
            teamBIds.forEach(id => {
                const stats = playerStatsMap.get(id);
                if (stats) {
                    stats.matches++;
                    if (isBWin) {
                        stats.wins++;
                    }
                    stats.points += match.teamBScore;
                    playerStatsMap.set(id, stats);
                }
            });

            // Process Pairs (Helper)
            const updatePair = (ids: number[], isWin: boolean) => {
                if (ids.length !== 2) return;
                const sorted = [...ids].sort((a, b) => a - b);
                const key = `${sorted[0]}-${sorted[1]}`;
                const current = pairStatsMap.get(key) || {
                    p1Id: sorted[0], p2Id: sorted[1], matches: 0, wins: 0
                };
                current.matches++;
                if (isWin) current.wins++;
                pairStatsMap.set(key, current);
            };

            updatePair(teamAIds, isAWin);
            updatePair(teamBIds, isBWin);
        });

        // 1. Finalize Player Stats
        const finalPlayerStats: ExtendedPlayerStats[] = [];
        playerStatsMap.forEach((stats, id) => {
            const player = playerMap.get(id);
            if (!player) return;

            // Only include players who have played at least one match in the rankings
            if (stats.matches === 0) return;

            const winRatio = stats.wins / stats.matches;
            const avgPoints = stats.points / stats.matches;

            // Formula: (Win% * 50) + (AvgPoints * 2)
            // Example: 80% win + 14 avg points => (0.8 * 50) + (14 * 2) = 40 + 28 = 68
            const rankingScore = (winRatio * 50) + (avgPoints * 2);

            finalPlayerStats.push({
                playerId: id,
                name: player.name,
                matchesPlayed: stats.matches,
                wins: stats.wins,
                losses: stats.matches - stats.wins,
                winRatio,
                totalPoints: stats.points,
                avgPoints: parseFloat(avgPoints.toFixed(1)),
                rankingScore: parseFloat(rankingScore.toFixed(1)),
                avatar: player.avatar
            });
        });

        // Sort by Ranking Score
        finalPlayerStats.sort((a, b) => b.rankingScore - a.rankingScore);

        // 2. Finalize Pair Stats
        const finalPairStats: PairStats[] = [];
        pairStatsMap.forEach((stats) => {
            const p1 = playerMap.get(stats.p1Id);
            const p2 = playerMap.get(stats.p2Id);
            if (p1 && p2) {
                finalPairStats.push({
                    player1Id: stats.p1Id,
                    player2Id: stats.p2Id,
                    player1Name: p1.name,
                    player2Name: p2.name,
                    matchesTogether: stats.matches,
                    winsTogether: stats.wins,
                    winRatio: stats.matches > 0 ? (stats.wins / stats.matches) : 0
                });
            }
        });

        // Sort pairs by Win Ratio (min 2 matches to be "best"), then by total wins
        finalPairStats.sort((a, b) => {
            const aQualifies = a.matchesTogether >= 2;
            const bQualifies = b.matchesTogether >= 2;

            if (aQualifies && !bQualifies) return -1;
            if (!aQualifies && bQualifies) return 1;

            if (b.winRatio !== a.winRatio) return b.winRatio - a.winRatio;
            return b.winsTogether - a.winsTogether;
        });

        // 3. Global Stats
        const topPlayer = finalPlayerStats.length > 0 ? finalPlayerStats[0] : null;
        let bestPair = null;
        if (finalPairStats.length > 0) {
            // Ensure best pair has decent win rate, else null
            bestPair = finalPairStats[0];
        }

        return {
            playerStats: finalPlayerStats,
            pairStats: finalPairStats,
            globalStats: {
                totalMatchesAllTime: matches.length,
                totalMatchesToday: todayMatches,
                totalPointsScored: totalPointsGlobal,
                topPlayer,
                bestPair,
                highestScoreMatch
            }
        };
    }
};
