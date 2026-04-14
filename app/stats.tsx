import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Dimensions, ScrollView, RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Match, MatchRepository } from '../database/MatchRepository';
import { Player, PlayerRepository } from '../database/PlayerRepository';
import { StatisticsEngine, ExtendedPlayerStats, PairStats, GlobalStats } from '../logic/StatisticsEngine';
import { BottomNav } from '../components/BottomNav';
import { KVStore } from '../database/KVStore';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

const { width } = Dimensions.get('window');

type Tab = 'dashboard' | 'leaderboard' | 'pairs' | 'history';

export default function StatsScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const [activeTab, setActiveTab] = useState<Tab>((params.tab as Tab) || 'dashboard');
    const [matches, setMatches] = useState<Match[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [stats, setStats] = useState<{
        playerStats: ExtendedPlayerStats[],
        pairStats: PairStats[],
        globalStats: GlobalStats
    } | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [timeFilter, setTimeFilter] = useState<'today' | 'overall'>('overall');

    // Edit Modal State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
    const [editScoreA, setEditScoreA] = useState('');
    const [editScoreB, setEditScoreB] = useState('');

    // Share Ref
    const shareRef = React.useRef<View>(null);
    const reportRef = React.useRef<View>(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);

    // Share logic — captures combined today's report (Dashboard + Leaderboard + Pairs)
    const handleShareReport = async () => {
        if (!todayStats) {
            Alert.alert('No Data', 'No matches recorded today yet.');
            return;
        }
        setIsGeneratingReport(true);
        try {
            // Wait for the report modal to render
            await new Promise(resolve => setTimeout(resolve, 700));
            const uri = await captureRef(reportRef, { format: 'png', quality: 0.9 });
            setIsGeneratingReport(false);
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
                await Sharing.shareAsync(uri, {
                    mimeType: 'image/png',
                    dialogTitle: 'Share Session Report',
                    UTI: 'public.png',
                });
            } else {
                Alert.alert('Error', 'Sharing is not available on this device');
            }
        } catch (e) {
            console.error('Sharing failed', e);
            setIsGeneratingReport(false);
            Alert.alert('Error', 'Failed to generate report image');
        }
    };

    const handleEditMatch = (match: Match) => {
        setSelectedMatch(match);
        setEditScoreA(match.teamAScore.toString());
        setEditScoreB(match.teamBScore.toString());
        setEditModalVisible(true);
    };

    const saveMatchEdit = async () => {
        if (!selectedMatch) return;
        const sA = parseInt(editScoreA);
        const sB = parseInt(editScoreB);

        if (isNaN(sA) || isNaN(sB)) {
            Alert.alert('Error', 'Please enter valid scores');
            return;
        }

        if (sA === sB) {
            Alert.alert('Error', 'Scores cannot be equal (No ties allowed)');
            return;
        }

        const winner = sA > sB ? 'A' : 'B';

        try {
            // 1. Update match record in DB
            await MatchRepository.updateMatchScore(selectedMatch.id, sA, sB, winner);
            setEditModalVisible(false);

            // 2. Recalculate ALL player stats from match records (Bug #9 fix)
            //    Manual increments get out of sync; always derive from ground truth.
            const [allMatches, allPlayers] = await Promise.all([
                MatchRepository.getAllMatches(),
                PlayerRepository.getAllPlayers()
            ]);

            // Reset stats for every player to zero first
            const statsMap = new Map<number, { matchesPlayed: number; wins: number; losses: number }>();
            for (const p of allPlayers) {
                statsMap.set(p.id, { matchesPlayed: 0, wins: 0, losses: 0 });
            }

            // Accumulate from all match records
            for (const match of allMatches) {
                const winIds = (match.winnerTeam === 'A' ? match.teamAPlayers : match.teamBPlayers)
                    .split(',').map(Number);
                const loseIds = (match.winnerTeam === 'A' ? match.teamBPlayers : match.teamAPlayers)
                    .split(',').map(Number);
                for (const id of winIds) {
                    const s = statsMap.get(id);
                    if (s) { s.matchesPlayed++; s.wins++; }
                }
                for (const id of loseIds) {
                    const s = statsMap.get(id);
                    if (s) { s.matchesPlayed++; s.losses++; }
                }
            }

            // Write corrected stats back to each player
            for (const player of allPlayers) {
                const s = statsMap.get(player.id);
                if (s) {
                    await PlayerRepository.updatePlayer({ ...player, ...s });
                }
            }

            // 3. Reload UI
            await loadData();
        } catch (e) {
            console.error('Failed to edit match:', e);
            Alert.alert('Error', 'Failed to update match score.');
        }
    };

    useEffect(() => {
        if (params.tab) {
            setActiveTab(params.tab as Tab);
        }
    }, [params.tab]);

    const loadData = async () => {
        try {
            const [allMatches, allPlayers] = await Promise.all([
                MatchRepository.getAllMatches(),
                PlayerRepository.getAllPlayers()
            ]);
            setMatches(allMatches);
            setPlayers(allPlayers);
        } catch (e) {
            console.error(e);
        }
    };

    // Compute stats based on filter
    const displayStats = React.useMemo(() => {
        if (!matches.length || !players.length) return null;

        // Filter matches if needed
        let filteredMatches = matches;
        if (timeFilter === 'today') {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            filteredMatches = matches.filter(m => m.timestamp >= todayStart.getTime());
        }

        return StatisticsEngine.calculateStats(filteredMatches, players);
    }, [matches, players, timeFilter]);

    // Always today-only stats — used exclusively for the share report
    const todayStats = React.useMemo(() => {
        if (!matches.length || !players.length) return null;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayMatches = matches.filter(m => m.timestamp >= todayStart.getTime());
        if (!todayMatches.length) return null;
        return StatisticsEngine.calculateStats(todayMatches, players);
    }, [matches, players]);

    const handleBack = async () => {
        const from = params.from as string;
        
        console.log("Back button pressed. Origin:", from);

        if (from === 'home') {
            router.replace('/');
            return;
        }
        if (from === 'match') {
            router.replace('/match');
            return;
        }

        // Fallback or default behavior: check if there is an active match
        try {
            const activeMatch = await KVStore.getItem('active_match_setup');
            if (activeMatch) {
                router.replace('/match');
            } else {
                router.replace('/');
            }
        } catch (e) {
            console.error("Error in handleBack:", e);
            router.replace('/');
        }
    };

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, []);

    const handleClearHistory = () => {
        Alert.alert(
            "Clear All History?",
            "This will permanently delete all match records and reset player statistics to zero. Players themselves will NOT be deleted. Proceed?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Clear All",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await MatchRepository.clearAllMatches();
                            await PlayerRepository.resetAllPlayerStats();

                            // Clear active match session state
                            await KVStore.removeItem('active_match_setup');
                            await KVStore.removeItem('match_number');

                            await loadData();
                            Alert.alert("Success", "All match history and active session data have been cleared.");
                        } catch (e) {
                            console.error(e);
                            Alert.alert("Error", "Failed to clear data.");
                        }
                    }
                }
            ]
        );
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const renderDashboard = () => {
        if (!displayStats) return null;
        const { globalStats, playerStats, pairStats } = displayStats;

        const top4Players = playerStats.slice(0, 4);
        const top2Pairs = pairStats.slice(0, 2);
        const highestMatch = globalStats.highestScoreMatch;

        return (
            <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#76FF03" />}>
                {/* Header Action Row */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, marginBottom: 10, gap: 10 }}>
                    <TouchableOpacity onPress={handleClearHistory} style={styles.clearButton}>
                        <LinearGradient colors={['#FF5252', '#D32F2F']} style={styles.shareGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                            <Ionicons name="trash-outline" size={20} color="#FFF" />
                            <Text style={styles.shareText}>Clear Stats</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handleShareReport} style={styles.shareButton}>
                        <LinearGradient colors={['#25D366', '#128C7E']} style={styles.shareGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                            <Ionicons name="logo-whatsapp" size={20} color="#FFF" />
                            <Text style={styles.shareText}>Share Report</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                <View ref={shareRef as any} collapsable={false} style={{ backgroundColor: '#000', paddingVertical: 10 }}>
                    {/* Summary Cards — labels adapt to the current filter */}
                    <View style={[styles.statsGrid, { marginBottom: 20 }]}>
                        <LinearGradient colors={['#1F1F1F', '#121212']} style={styles.statCard}>
                            <Ionicons name="calendar-outline" size={24} color="#76FF03" />
                            <Text style={styles.statValue}>
                                {timeFilter === 'today'
                                    ? globalStats.totalMatchesToday
                                    : globalStats.totalMatchesAllTime}
                            </Text>
                            <Text style={styles.statLabel}>
                                {timeFilter === 'today' ? 'Matches Today' : 'Matches All-Time'}
                            </Text>
                        </LinearGradient>
                        <LinearGradient colors={['#1F1F1F', '#121212']} style={styles.statCard}>
                            <Ionicons name="flash-outline" size={24} color="#FF9100" />
                            <Text style={styles.statValue}>{globalStats.totalPointsScored}</Text>
                            <Text style={styles.statLabel}>
                                {timeFilter === 'today' ? 'Points Today' : 'Points All-Time'}
                            </Text>
                        </LinearGradient>
                    </View>

                    {/* Highest Score Record */}
                    {highestMatch && (
                        <View style={styles.highlightSection}>
                            <Text style={styles.sectionTitle}>Highest Score Record</Text>
                            <LinearGradient colors={['#2A2A2A', '#1A1A1A']} style={styles.highlightCard}>
                                <View style={styles.highlightHeader}>
                                    <View style={styles.avatarLarge}>
                                        <Ionicons name="trophy" size={24} color="#FFD700" />
                                    </View>
                                    <View>
                                        <Text style={styles.highlightName}>{highestMatch.score} Points</Text>
                                        <Text style={styles.highlightSub}>{highestMatch.teamNames} (Match #{highestMatch.matchId})</Text>
                                    </View>
                                </View>
                            </LinearGradient>
                        </View>
                    )}

                    {/* Top 4 Players */}
                    <View style={styles.highlightSection}>
                        <Text style={styles.sectionTitle}>Top 4 Players</Text>
                        <View style={styles.statsGrid}>
                            {top4Players.map((p, index) => (
                                <LinearGradient key={p.playerId} colors={['#1F1F1F', '#121212']} style={[styles.statCard, { marginBottom: 15 }]}>
                                    <Text style={{ color: index === 0 ? '#FFD700' : '#AAA', position: 'absolute', top: 10, left: 10, fontWeight: 'bold' }}>#{index + 1}</Text>
                                    <View style={[styles.avatarLarge, { width: 40, height: 40, marginBottom: 5, overflow: 'hidden', backgroundColor: '#333' }]}>
                                        {p.avatar ? (
                                            <Image source={{ uri: p.avatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                        ) : (
                                            <Text style={[styles.avatarTextLarge, { fontSize: 18 }]}>{p.name.charAt(0)}</Text>
                                        )}
                                    </View>
                                    <Text style={[styles.rowName, { fontSize: 14 }]} numberOfLines={1}>{p.name}</Text>

                                    <Text style={{ color: '#76FF03', fontWeight: 'bold', marginTop: 2 }}>{(p.winRatio * 100).toFixed(0)}%</Text>
                                    <Text style={[styles.statLabel, { marginBottom: 8 }]}>Win %</Text>

                                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 5, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#333', width: '100%', justifyContent: 'center' }}>
                                        <View style={{ alignItems: 'center' }}>
                                            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>{p.matchesPlayed}</Text>
                                            <Text style={{ color: '#666', fontSize: 10 }}>M</Text>
                                        </View>
                                        <View style={{ alignItems: 'center' }}>
                                            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>{p.wins}</Text>
                                            <Text style={{ color: '#666', fontSize: 10 }}>W</Text>
                                        </View>
                                        <View style={{ alignItems: 'center' }}>
                                            <Text style={{ color: '#FF5252', fontWeight: 'bold', fontSize: 12 }}>{p.losses}</Text>
                                            <Text style={{ color: '#666', fontSize: 10 }}>L</Text>
                                        </View>
                                    </View>
                                </LinearGradient>
                            ))}
                        </View>
                    </View>

                    {/* Top 2 Pairs */}
                    <View style={styles.highlightSection}>
                        <Text style={styles.sectionTitle}>Top 2 Pairs</Text>
                        {top2Pairs.map((pair, index) => (
                            <LinearGradient key={index} colors={['#2A2A2A', '#1A1A1A']} style={[styles.highlightCard, { marginBottom: 15 }]}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <Text style={{ color: '#FFD700', fontWeight: 'bold', fontSize: 18 }}>#{index + 1}</Text>
                                        <View>
                                            <Text style={styles.highlightName}>{pair.player1Name} & {pair.player2Name}</Text>
                                            <Text style={styles.highlightSub}>{pair.winsTogether} Wins / {pair.matchesTogether} Matches</Text>
                                        </View>
                                    </View>
                                    <Text style={{ color: '#76FF03', fontWeight: 'bold', fontSize: 20 }}>{(pair.winRatio * 100).toFixed(0)}%</Text>
                                </View>
                            </LinearGradient>
                        ))}
                    </View>

                </View>
                {/* Spacer */}
                <View style={{ height: 200 }} />
            </ScrollView>
        );
    };

    const renderLeaderboard = () => {
        if (!displayStats) return null;
        return (
            <FlatList
                data={displayStats.playerStats}
                keyExtractor={item => item.playerId.toString()}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#76FF03" />}
                ListFooterComponent={<View style={{ height: 200 }} />}
                ListHeaderComponent={
                    <View style={styles.tableHeader}>
                        <Text style={[styles.colName, { flex: 2.5 }]}>Player</Text>
                        <Text style={styles.colStat}>M</Text>
                        <Text style={styles.colStat}>W</Text>
                        <Text style={styles.colStat}>L</Text>
                        <Text style={styles.colStat}>Win%</Text>
                    </View>
                }
                renderItem={({ item, index }) => (
                    <View style={styles.tableRow}>
                        <View style={{ flex: 2.5, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={styles.rankNum}>{index + 1}</Text>
                            <View style={{ width: 30, height: 30, borderRadius: 15, overflow: 'hidden', backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }}>
                                {item.avatar ? (
                                    <Image source={{ uri: item.avatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                ) : (
                                    <Text style={{ color: '#AAA', fontSize: 12, fontWeight: 'bold' }}>{item.name.charAt(0)}</Text>
                                )}
                            </View>
                            <Text style={styles.rowName}>{item.name}</Text>
                        </View>
                        <Text style={styles.rowStat}>{item.matchesPlayed}</Text>
                        <Text style={styles.rowStat}>{item.wins}</Text>
                        <Text style={[styles.rowStat, { color: '#FF5252' }]}>{item.losses}</Text>
                        <Text style={[styles.rowStat, { color: '#76FF03', fontWeight: 'bold' }]}>
                            {(item.winRatio * 100).toFixed(0)}%
                        </Text>
                    </View>
                )}
            />
        );
    };

    const renderPairs = () => {
        if (!displayStats) return null;
        return (
            <FlatList
                data={displayStats.pairStats}
                keyExtractor={(item, index) => index.toString()}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#76FF03" />}
                ListFooterComponent={<View style={{ height: 200 }} />}
                ListHeaderComponent={
                    <View style={styles.tableHeader}>
                        <Text style={[styles.colName, { flex: 3 }]}>Pair</Text>
                        <Text style={styles.colStat}>M</Text>
                        <Text style={styles.colStat}>W</Text>
                        <Text style={styles.colStat}>L</Text>
                        <Text style={styles.colStat}>Win%</Text>
                    </View>
                }
                renderItem={({ item }) => {
                    const losses = item.matchesTogether - item.winsTogether;
                    return (
                        <View style={styles.tableRow}>
                        <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                                <View style={{ flexDirection: 'row', flexShrink: 0 }}>
                                    {[item.player1Id, item.player2Id].map((pid, idx) => {
                                        const p = players.find(pl => pl.id === pid);
                                        return (
                                            <View key={pid} style={{ width: 30, height: 30, borderRadius: 15, overflow: 'hidden', backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginLeft: idx > 0 ? -10 : 0, borderWidth: 1, borderColor: '#000', zIndex: idx === 0 ? 1 : 0 }}>
                                                {p?.avatar ? (
                                                    <Image source={{ uri: p.avatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                ) : (
                                                    <Text style={{ color: '#AAA', fontSize: 10, fontWeight: 'bold' }}>{p?.name?.charAt(0)}</Text>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                                <Text style={[styles.rowName, { fontSize: 13, flex: 1 }]} numberOfLines={2}>{item.player1Name} & {item.player2Name}</Text>
                            </View>
                            <Text style={styles.rowStat}>{item.matchesTogether}</Text>
                            <Text style={styles.rowStat}>{item.winsTogether}</Text>
                            <Text style={[styles.rowStat, { color: '#FF5252' }]}>{losses}</Text>
                            <Text style={[styles.rowStat, { color: '#76FF03', fontWeight: 'bold' }]}>
                                {(item.winRatio * 100).toFixed(0)}%
                            </Text>
                        </View>
                    );
                }}
            />
        );
    };

    const renderHistory = () => {
        const historyMatches = timeFilter === 'today'
            ? matches.filter(m => {
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                return m.timestamp >= todayStart.getTime();
            })
            : matches;

        return (
            <FlatList
                data={historyMatches}
                keyExtractor={item => item.id.toString()}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#76FF03" />}
                ListHeaderComponent={
                    <View style={{ marginBottom: 15, alignItems: 'flex-end', paddingHorizontal: 5 }}>
                        <TouchableOpacity onPress={handleClearHistory} style={styles.clearButton}>
                            <LinearGradient colors={['#FF5252', '#D32F2F']} style={styles.shareGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                                <Ionicons name="trash-outline" size={18} color="#FFF" />
                                <Text style={styles.shareText}>Clear All History</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                }
                ListFooterComponent={<View style={{ height: 200 }} />}
                renderItem={({ item }) => {
                    const date = new Date(item.timestamp);
                    const isAWin = item.winnerTeam === 'A';

                    // Simple logic to get names - finding from full list for now
                    const getNames = (ids: string) => {
                        if (!ids) return 'Unknown';
                        return ids.split(',')
                            .map(id => {
                                const p = players.find(p => p.id === parseInt(id));
                                return p ? p.name : `P#${id}`;
                            })
                            .join(' & ');
                    };

                    return (
                        <View style={styles.matchCard}>
                            <View style={styles.matchHeader}>
                                <Text style={styles.matchDate}>{date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                <TouchableOpacity
                                    style={styles.editBtn}
                                    onPress={() => handleEditMatch(item)}
                                >
                                    <Ionicons name="pencil" size={16} color="#666" />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.scoreRow}>
                                <View style={[styles.teamBox, isAWin ? styles.winnerBox : null]}>
                                    <View style={{ flexDirection: 'row', marginBottom: 5 }}>
                                        {item.teamAPlayers.split(',').map(id => {
                                            const p = players.find(pl => pl.id === parseInt(id));
                                            return (
                                                <View key={id} style={{ width: 30, height: 30, borderRadius: 15, overflow: 'hidden', backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginHorizontal: -2, borderWidth: 1, borderColor: '#222' }}>
                                                    {p?.avatar ? (
                                                        <Image source={{ uri: p.avatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                    ) : (
                                                        <Text style={{ color: '#AAA', fontSize: 10, fontWeight: 'bold' }}>{p?.name?.charAt(0)}</Text>
                                                    )}
                                                </View>
                                            );
                                        })}
                                    </View>
                                    <Text style={styles.teamScore}>{item.teamAScore}</Text>
                                    <Text style={styles.teamNames}>{getNames(item.teamAPlayers)}</Text>
                                </View>
                                <Text style={styles.vsText}>VS</Text>
                                <View style={[styles.teamBox, !isAWin ? styles.winnerBox : null]}>
                                    <View style={{ flexDirection: 'row', marginBottom: 5 }}>
                                        {item.teamBPlayers.split(',').map(id => {
                                            const p = players.find(pl => pl.id === parseInt(id));
                                            return (
                                                <View key={id} style={{ width: 30, height: 30, borderRadius: 15, overflow: 'hidden', backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginHorizontal: -2, borderWidth: 1, borderColor: '#222' }}>
                                                    {p?.avatar ? (
                                                        <Image source={{ uri: p.avatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                    ) : (
                                                        <Text style={{ color: '#AAA', fontSize: 10, fontWeight: 'bold' }}>{p?.name?.charAt(0)}</Text>
                                                    )}
                                                </View>
                                            );
                                        })}
                                    </View>
                                    <Text style={styles.teamScore}>{item.teamBScore}</Text>
                                    <Text style={styles.teamNames}>{getNames(item.teamBPlayers)}</Text>
                                </View>
                            </View>
                        </View>
                    );
                }}
            />
        );
    };

    return (
        <View style={styles.container}>
            <Image source={require('../assets/images/background_home.jpg')} style={styles.backgroundImage} resizeMode="cover" />
            <LinearGradient colors={['rgba(18,18,18,0.95)', 'rgba(10,10,10,0.98)']} style={styles.backgroundOverlay} />

            <SafeAreaView style={styles.content}>
                <View style={[styles.header, { flexDirection: 'row', alignItems: 'center', gap: 15 }]}>
                    <TouchableOpacity onPress={handleBack} style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 }}>
                        <Ionicons name="chevron-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Statistics</Text>
                </View>

                {/* Today / Overall Toggle */}
                <View style={styles.filterBar}>
                    <TouchableOpacity
                        style={[styles.filterBtn, timeFilter === 'today' && styles.filterBtnActive]}
                        onPress={() => setTimeFilter('today')}
                    >
                        <Text style={[styles.filterText, timeFilter === 'today' && styles.filterTextActive]}>Today Only</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterBtn, timeFilter === 'overall' && styles.filterBtnActive]}
                        onPress={() => setTimeFilter('overall')}
                    >
                        <Text style={[styles.filterText, timeFilter === 'overall' && styles.filterTextActive]}>All-Time</Text>
                    </TouchableOpacity>
                </View>

                {/* Tabs */}
                <View style={styles.tabBar}>
                    {(['dashboard', 'leaderboard', 'pairs', 'history'] as Tab[]).map(tab => (
                        <TouchableOpacity
                            key={tab}
                            style={[styles.tabItem, activeTab === tab && styles.activeTab]}
                            onPress={() => setActiveTab(tab)}
                        >
                            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Content Area */}
                <View style={styles.tabContainer}>
                    {activeTab === 'dashboard' && renderDashboard()}
                    {activeTab === 'leaderboard' && renderLeaderboard()}
                    {activeTab === 'pairs' && renderPairs()}
                    {activeTab === 'history' && renderHistory()}
                </View>
            </SafeAreaView>

            {/* Edit Score Modal */}
            <Modal
                visible={editModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setEditModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalOverlay}
                >
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Edit Match Score</Text>

                        <View style={styles.modalInputRow}>
                            <View style={styles.modalInputGroup}>
                                <Text style={styles.modalLabel}>Team A</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    value={editScoreA}
                                    onChangeText={setEditScoreA}
                                    keyboardType="number-pad"
                                    maxLength={2}
                                />
                            </View>
                            <Text style={styles.modalVs}>VS</Text>
                            <View style={styles.modalInputGroup}>
                                <Text style={styles.modalLabel}>Team B</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    value={editScoreB}
                                    onChangeText={setEditScoreB}
                                    keyboardType="number-pad"
                                    maxLength={2}
                                />
                            </View>
                        </View>

                        <View style={styles.modalBtnRow}>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.cancelBtn]}
                                onPress={() => setEditModalVisible(false)}
                            >
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.saveBtn]}
                                onPress={saveMatchEdit}
                            >
                                <Text style={[styles.modalBtnText, { color: '#000' }]}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <BottomNav />

            {/* ── Report Generation Modal ── */}
            <Modal visible={isGeneratingReport} transparent={false} animationType="none" statusBarTranslucent>
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    {/* Report content — this View is what captureRef captures */}
                    {todayStats && (
                        <View
                            ref={reportRef}
                            collapsable={false}
                            style={{ backgroundColor: '#0D0D0D', padding: 16, width }}
                        >
                            {/* ── Header ── */}
                            <View style={{ alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' }}>
                                <Text style={{ color: '#76FF03', fontSize: 20, fontWeight: '900', letterSpacing: 1 }}>🏸 BADMINTON REPORT</Text>
                                <Text style={{ color: '#555', fontSize: 12, marginTop: 4 }}>
                                    {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </Text>
                            </View>

                            {/* ── Summary Cards ── */}
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
                                {[
                                    { value: todayStats.globalStats.totalMatchesToday, label: 'Matches Today', color: '#76FF03' },
                                    { value: todayStats.globalStats.totalPointsScored, label: 'Total Points', color: '#FF9100' },
                                    { value: todayStats.playerStats.length, label: 'Players', color: '#29B6F6' },
                                ].map(card => (
                                    <View key={card.label} style={{ flex: 1, backgroundColor: '#1A1A1A', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#222' }}>
                                        <Text style={{ color: card.color, fontSize: 22, fontWeight: '900' }}>{card.value}</Text>
                                        <Text style={{ color: '#666', fontSize: 10, marginTop: 2, textAlign: 'center' }}>{card.label}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* ── Leaderboard ── */}
                            <Text style={{ color: '#AAA', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>🏆 Leaderboard</Text>
                            <View style={{ backgroundColor: '#111', borderRadius: 10, overflow: 'hidden', marginBottom: 18, borderWidth: 1, borderColor: '#1E1E1E' }}>
                                <View style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, backgroundColor: '#1A1A1A' }}>
                                    {['#', 'Player', 'M', 'W', 'L', 'Win%'].map((h, i) => (
                                        <Text key={h} style={[
                                            { color: '#555', fontSize: 10, fontWeight: 'bold' },
                                            i === 0 && { width: 22 },
                                            i === 1 && { flex: 1 },
                                            i > 1 && { width: 32, textAlign: 'center' },
                                        ]}>{h}</Text>
                                    ))}
                                </View>
                                {todayStats.playerStats.slice(0, 8).map((p, idx) => (
                                    <View key={p.playerId} style={{ flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#1A1A1A', alignItems: 'center' }}>
                                        <Text style={{ width: 22, color: idx === 0 ? '#FFD700' : '#555', fontSize: 11, fontWeight: 'bold' }}>{idx + 1}</Text>
                                        <Text style={{ flex: 1, color: '#DDD', fontSize: 12, fontWeight: '500' }} numberOfLines={1}>{p.name}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#888', fontSize: 12 }}>{p.matchesPlayed}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#FFF', fontSize: 12, fontWeight: 'bold' }}>{p.wins}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#FF5252', fontSize: 12 }}>{p.losses}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#76FF03', fontSize: 12, fontWeight: 'bold' }}>{(p.winRatio * 100).toFixed(0)}%</Text>
                                    </View>
                                ))}
                            </View>

                            {/* ── Top Pairs ── */}
                            <Text style={{ color: '#AAA', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>🤝 Top Pairs</Text>
                            <View style={{ backgroundColor: '#111', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#1E1E1E' }}>
                                <View style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, backgroundColor: '#1A1A1A' }}>
                                    {['#', 'Pair', 'M', 'W', 'L', 'Win%'].map((h, i) => (
                                        <Text key={h} style={[
                                            { color: '#555', fontSize: 10, fontWeight: 'bold' },
                                            i === 0 && { width: 22 },
                                            i === 1 && { flex: 1 },
                                            i > 1 && { width: 32, textAlign: 'center' },
                                        ]}>{h}</Text>
                                    ))}
                                </View>
                                {todayStats.pairStats.slice(0, 7).map((pair, idx) => (
                                    <View key={idx} style={{ flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#1A1A1A', alignItems: 'center' }}>
                                        <Text style={{ width: 22, color: idx === 0 ? '#FFD700' : '#555', fontSize: 11, fontWeight: 'bold' }}>{idx + 1}</Text>
                                        <Text style={{ flex: 1, color: '#DDD', fontSize: 12, fontWeight: '500' }} numberOfLines={1}>{pair.player1Name} & {pair.player2Name}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#888', fontSize: 12 }}>{pair.matchesTogether}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#FFF', fontSize: 12, fontWeight: 'bold' }}>{pair.winsTogether}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#FF5252', fontSize: 12 }}>{pair.matchesTogether - pair.winsTogether}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#76FF03', fontSize: 12, fontWeight: 'bold' }}>{(pair.winRatio * 100).toFixed(0)}%</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Footer */}
                            <Text style={{ color: '#2A2A2A', fontSize: 10, textAlign: 'center', marginTop: 14 }}>BadmintonScore • {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>
                        </View>
                    )}

                    {/* Overlay shown to user while capturing */}
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center' }]}>
                        <Ionicons name="share-social-outline" size={44} color="#76FF03" />
                        <Text style={{ color: '#76FF03', fontSize: 18, fontWeight: 'bold', marginTop: 16 }}>Generating Report…</Text>
                        <Text style={{ color: '#444', fontSize: 13, marginTop: 6 }}>Today's session data</Text>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    backgroundImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    backgroundOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    content: { flex: 1 },

    header: { padding: 20, paddingTop: 10 },
    headerTitle: { color: 'white', fontSize: 28, fontWeight: 'bold' },

    tabBar: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 15 },
    tabItem: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)' },
    activeTab: { backgroundColor: '#76FF03' },
    tabText: { color: '#888', fontWeight: 'bold', fontSize: 13 },
    activeTabText: { color: '#000' },

    tabContainer: { flex: 1 },
    tabContent: { flex: 1, paddingHorizontal: 20 },
    listContent: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 10 },

    filterBar: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginHorizontal: 20,
        marginVertical: 10,
        borderRadius: 12,
        padding: 4,
        borderWidth: 1,
        borderColor: '#222',
    },
    filterBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    filterBtnActive: {
        backgroundColor: 'rgba(118, 255, 3, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(118, 255, 3, 0.3)',
    },
    filterText: {
        color: '#666',
        fontSize: 13,
        fontWeight: 'bold',
    },
    filterTextActive: {
        color: '#76FF03',
    },

    // Dashboard Styles
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    statCard: { width: '48%', padding: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
    statValue: { color: 'white', fontSize: 24, fontWeight: 'bold', marginVertical: 5 },
    statLabel: { color: '#888', fontSize: 12 },

    highlightSection: { marginTop: 25 },
    sectionTitle: { color: '#AAA', fontSize: 16, fontWeight: 'bold', marginBottom: 10, paddingLeft: 5 },
    highlightCard: { borderRadius: 16, padding: 20 },
    highlightHeader: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 20 },
    avatarLarge: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
    avatarTextLarge: { color: 'white', fontSize: 24, fontWeight: 'bold' },
    highlightName: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    highlightSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
    highlightStatsRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 15 },
    hStat: { alignItems: 'center' },
    hValue: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    hLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
    pairAvatars: { flexDirection: 'row' },

    // Table Styles
    tableHeader: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#333', marginBottom: 5 },
    colName: { color: '#666', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
    colStat: { flex: 1, textAlign: 'center', color: '#666', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    rankNum: { color: '#555', fontSize: 14, fontWeight: 'bold', width: 20 },
    rowName: { color: 'white', fontSize: 15, fontWeight: '500' },
    rowStat: { flex: 1, textAlign: 'center', color: '#AAA', fontSize: 14 },

    // History Styles
    matchCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#222' },
    matchHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, alignItems: 'center' },
    editBtn: { padding: 4 },
    matchDate: { color: '#666', fontSize: 12 },
    winnerTag: { backgroundColor: '#1B5E20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
    winnerTagText: { color: '#4CAF50', fontSize: 10, fontWeight: 'bold' },
    scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    teamBox: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.2)' },
    winnerBox: { backgroundColor: 'rgba(76, 175, 80, 0.1)', borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.3)' },
    teamScore: { color: 'white', fontSize: 24, fontWeight: '900' },
    teamNames: { color: '#888', fontSize: 12, textAlign: 'center', marginTop: 4 },
    vsText: { color: '#444', fontWeight: 'bold', marginHorizontal: 10 },

    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '85%', backgroundColor: '#1E1E1E', borderRadius: 20, padding: 25, borderWidth: 1, borderColor: '#333' },
    modalTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 25 },
    modalInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15, marginBottom: 30 },
    modalInputGroup: { alignItems: 'center' },
    modalLabel: { color: '#888', marginBottom: 10, fontWeight: 'bold' },
    modalInput: { backgroundColor: '#111', color: 'white', fontSize: 24, fontWeight: 'bold', padding: 15, borderRadius: 12, width: 80, textAlign: 'center', borderWidth: 1, borderColor: '#333' },
    modalVs: { color: '#444', fontWeight: 'bold', marginTop: 20 },
    modalBtnRow: { flexDirection: 'row', gap: 15 },
    modalBtn: { flex: 1, paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
    cancelBtn: { backgroundColor: '#333' },
    saveBtn: { backgroundColor: '#76FF03' },
    modalBtnText: { color: '#AAA', fontWeight: 'bold', fontSize: 16 },

    // Share Report Styles
    clearButton: {
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#FF5252',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5
    },
    shareButton: {
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#25D366',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5
    },
    shareGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 20,
        gap: 8
    },
    shareText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 14
    }
});
