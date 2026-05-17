import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Image, Dimensions,
    ScrollView, RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
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

// ── Tab sub-components ──
import { DashboardTab } from '../components/stats/DashboardTab';
import { LeaderboardTab } from '../components/stats/LeaderboardTab';
import { PairsTab } from '../components/stats/PairsTab';
import { HistoryTab } from '../components/stats/HistoryTab';

const { width } = Dimensions.get('window');
type Tab = 'dashboard' | 'leaderboard' | 'pairs' | 'history';

export default function StatsScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const [activeTab, setActiveTab] = useState<Tab>((params.tab as Tab) || 'dashboard');
    const [matches, setMatches] = useState<Match[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [timeFilter, setTimeFilter] = useState<'today' | 'overall'>('overall');
    const [loadError, setLoadError] = useState(false);

    // Edit Modal
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
    const [editScoreA, setEditScoreA] = useState('');
    const [editScoreB, setEditScoreB] = useState('');

    // Share Report
    const reportRef = React.useRef<View>(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);

    // ── Derived data ──────────────────────────────────────────────────────────

    /**
     * Pre-computed O(1) player lookup map. Passed to every tab that resolves
     * player IDs — eliminates the O(n) .find() calls that caused lag with
     * 100+ matches (red-high audit issue).
     */
    const playerMap = useMemo(
        () => new Map<number, Player>(players.map(p => [p.id, p])),
        [players]
    );

    const displayStats = useMemo(() => {
        if (!matches.length || !players.length) return null;
        let filtered = matches;
        if (timeFilter === 'today') {
            const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
            filtered = matches.filter(m => m.timestamp >= todayStart.getTime());
        }
        return StatisticsEngine.calculateStats(filtered, players);
    }, [matches, players, timeFilter]);

    const todayStats = useMemo(() => {
        if (!matches.length || !players.length) return null;
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayMatches = matches.filter(m => m.timestamp >= todayStart.getTime());
        if (!todayMatches.length) return null;
        return StatisticsEngine.calculateStats(todayMatches, players);
    }, [matches, players]);

    // ── Data loading ──────────────────────────────────────────────────────────

    const loadData = async () => {
        setLoadError(false);
        try {
            const [allMatches, allPlayers] = await Promise.all([
                MatchRepository.getAllMatches(),
                PlayerRepository.getAllPlayers()
            ]);
            setMatches(allMatches);
            setPlayers(allPlayers);
        } catch (e) {
            console.error('StatsScreen.loadData failed:', e);
            setLoadError(true);
        }
    };

    useFocusEffect(useCallback(() => { loadData(); }, []));

    useEffect(() => {
        if (params.tab) setActiveTab(params.tab as Tab);
    }, [params.tab]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, []);

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleBack = async () => {
        const from = params.from as string;
        if (from === 'home') { router.replace('/'); return; }
        if (from === 'match') { router.replace('/match'); return; }
        try {
            const activeMatch = await KVStore.getItem('active_match_setup');
            router.replace(activeMatch ? '/match' : '/');
        } catch { router.replace('/'); }
    };

    const handleEditMatch = (match: Match) => {
        setSelectedMatch(match);
        setEditScoreA(match.teamAScore.toString());
        setEditScoreB(match.teamBScore.toString());
        setEditModalVisible(true);
    };

    const saveMatchEdit = async () => {
        if (!selectedMatch) return;
        const sA = parseInt(editScoreA), sB = parseInt(editScoreB);
        if (isNaN(sA) || isNaN(sB)) { Alert.alert('Error', 'Please enter valid scores'); return; }
        if (sA === sB) { Alert.alert('Error', 'Scores cannot be equal (No ties allowed)'); return; }
        const winner = sA > sB ? 'A' : 'B';
        try {
            await MatchRepository.updateMatchScore(selectedMatch.id, sA, sB, winner);
            setEditModalVisible(false);
            const [allMatches, allPlayers] = await Promise.all([
                MatchRepository.getAllMatches(), PlayerRepository.getAllPlayers()
            ]);
            const statsMap = new Map<number, { matchesPlayed: number; wins: number; losses: number }>();
            for (const p of allPlayers) statsMap.set(p.id, { matchesPlayed: 0, wins: 0, losses: 0 });
            for (const match of allMatches) {
                const winIds = (match.winnerTeam === 'A' ? match.teamAPlayers : match.teamBPlayers).split(',').map(Number);
                const loseIds = (match.winnerTeam === 'A' ? match.teamBPlayers : match.teamAPlayers).split(',').map(Number);
                for (const id of winIds) { const s = statsMap.get(id); if (s) { s.matchesPlayed++; s.wins++; } }
                for (const id of loseIds) { const s = statsMap.get(id); if (s) { s.matchesPlayed++; s.losses++; } }
            }
            for (const player of allPlayers) {
                const s = statsMap.get(player.id);
                if (s) await PlayerRepository.updatePlayer({ ...player, ...s });
            }
            await loadData();
        } catch (e) { console.error('Failed to edit match:', e); Alert.alert('Error', 'Failed to update match score.'); }
    };

    const handleClearHistory = () => {
        Alert.alert('Clear All History?',
            'This will permanently delete all match records and reset player statistics to zero. Players themselves will NOT be deleted. Proceed?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear All', style: 'destructive',
                    onPress: async () => {
                        try {
                            await MatchRepository.clearAllMatches();
                            await PlayerRepository.resetAllPlayerStats();
                            await KVStore.removeItem('active_match_setup');
                            await KVStore.removeItem('match_number');
                            await loadData();
                            Alert.alert('Success', 'All match history and active session data have been cleared.');
                        } catch (e) { Alert.alert('Error', 'Failed to clear data.'); }
                    }
                }
            ]
        );
    };

    const handleShareReport = async () => {
        if (!todayStats) { Alert.alert('No Data', 'No matches recorded today yet.'); return; }
        setIsGeneratingReport(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 700));
            const uri = await captureRef(reportRef, { format: 'png', quality: 0.9 });
            setIsGeneratingReport(false);
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
                await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share Session Report', UTI: 'public.png' });
            } else {
                Alert.alert('Error', 'Sharing is not available on this device');
            }
        } catch (e) {
            console.error('Sharing failed', e);
            setIsGeneratingReport(false);
            Alert.alert('Error', 'Failed to generate report image');
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <View style={styles.container}>
            <Image source={require('../assets/images/background_home.jpg')} style={styles.bg} resizeMode="cover" />
            <LinearGradient colors={['rgba(18,18,18,0.95)', 'rgba(10,10,10,0.98)']} style={styles.bg} />

            <SafeAreaView style={{ flex: 1 }}>
                {/* Header */}
                <View style={[styles.header, { flexDirection: 'row', alignItems: 'center', gap: 15 }]}>
                    <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Statistics</Text>
                </View>

                {/* Today / All-Time filter */}
                <View style={styles.filterBar}>
                    {(['today', 'overall'] as const).map(f => (
                        <TouchableOpacity key={f} style={[styles.filterBtn, timeFilter === f && styles.filterBtnActive]} onPress={() => setTimeFilter(f)}>
                            <Text style={[styles.filterText, timeFilter === f && styles.filterTextActive]}>
                                {f === 'today' ? 'Today Only' : 'All-Time'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Tab bar */}
                <View style={styles.tabBar}>
                    {(['dashboard', 'leaderboard', 'pairs', 'history'] as Tab[]).map(tab => (
                        <TouchableOpacity key={tab} style={[styles.tabItem, activeTab === tab && styles.activeTab]} onPress={() => setActiveTab(tab)}>
                            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Content */}
                <View style={{ flex: 1 }}>
                    {loadError ? (
                        <View style={styles.errorBanner}>
                            <Ionicons name="cloud-offline-outline" size={40} color="#FF5252" />
                            <Text style={styles.errorTitle}>Failed to load data</Text>
                            <Text style={styles.errorSub}>Check your connection and try again.</Text>
                            <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
                                <Ionicons name="refresh" size={16} color="#000" style={{ marginRight: 6 }} />
                                <Text style={styles.retryBtnText}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            {activeTab === 'dashboard' && (
                                <DashboardTab
                                    displayStats={displayStats}
                                    timeFilter={timeFilter}
                                    refreshing={refreshing}
                                    onRefresh={onRefresh}
                                    onClearHistory={handleClearHistory}
                                    onShareReport={handleShareReport}
                                />
                            )}
                            {activeTab === 'leaderboard' && (
                                <LeaderboardTab
                                    playerStats={displayStats?.playerStats ?? []}
                                    refreshing={refreshing}
                                    onRefresh={onRefresh}
                                />
                            )}
                            {activeTab === 'pairs' && (
                                <PairsTab
                                    pairStats={displayStats?.pairStats ?? []}
                                    playerMap={playerMap}
                                    refreshing={refreshing}
                                    onRefresh={onRefresh}
                                />
                            )}
                            {activeTab === 'history' && (
                                <HistoryTab
                                    matches={matches}
                                    playerMap={playerMap}
                                    timeFilter={timeFilter}
                                    refreshing={refreshing}
                                    onRefresh={onRefresh}
                                    onEditMatch={handleEditMatch}
                                    onClearHistory={handleClearHistory}
                                />
                            )}
                        </>
                    )}
                </View>
            </SafeAreaView>

            {/* Edit Score Modal */}
            <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Edit Match Score</Text>
                        <View style={styles.modalInputRow}>
                            <View style={styles.modalInputGroup}>
                                <Text style={styles.modalLabel}>Team A</Text>
                                <TextInput style={styles.modalInput} value={editScoreA} onChangeText={setEditScoreA} keyboardType="number-pad" maxLength={2} />
                            </View>
                            <Text style={styles.modalVs}>VS</Text>
                            <View style={styles.modalInputGroup}>
                                <Text style={styles.modalLabel}>Team B</Text>
                                <TextInput style={styles.modalInput} value={editScoreB} onChangeText={setEditScoreB} keyboardType="number-pad" maxLength={2} />
                            </View>
                        </View>
                        <View style={styles.modalBtnRow}>
                            <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setEditModalVisible(false)}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.saveBtn]} onPress={saveMatchEdit}>
                                <Text style={[styles.modalBtnText, { color: '#000' }]}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <BottomNav />

            {/* Report Generation Modal (off-screen capture) */}
            <Modal visible={isGeneratingReport} transparent={false} animationType="none" statusBarTranslucent>
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    {todayStats && (
                        <View ref={reportRef} collapsable={false} style={{ backgroundColor: '#0D0D0D', padding: 16, width }}>
                            <View style={{ alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' }}>
                                <Text style={{ color: '#76FF03', fontSize: 20, fontWeight: '900', letterSpacing: 1 }}>🏸 BADMINTON REPORT</Text>
                                <Text style={{ color: '#555', fontSize: 12, marginTop: 4 }}>
                                    {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </Text>
                            </View>
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
                            {/* Leaderboard */}
                            <Text style={{ color: '#AAA', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>🏆 Leaderboard</Text>
                            <View style={{ backgroundColor: '#111', borderRadius: 10, overflow: 'hidden', marginBottom: 18, borderWidth: 1, borderColor: '#1E1E1E' }}>
                                <View style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, backgroundColor: '#1A1A1A' }}>
                                    {['#', 'Player', 'M', 'W', 'L', 'Win%'].map((h, i) => (
                                        <Text key={h} style={[{ color: '#555', fontSize: 10, fontWeight: 'bold' }, i === 0 && { width: 22 }, i === 1 && { flex: 1 }, i > 1 && { width: 32, textAlign: 'center' }]}>{h}</Text>
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
                            {/* Top Pairs */}
                            <Text style={{ color: '#AAA', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>🤝 Top Pairs</Text>
                            <View style={{ backgroundColor: '#111', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#1E1E1E' }}>
                                <View style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, backgroundColor: '#1A1A1A' }}>
                                    {['#', 'Pair', 'M', 'W', 'L', 'Win%'].map((h, i) => (
                                        <Text key={h} style={[{ color: '#555', fontSize: 10, fontWeight: 'bold' }, i === 0 && { width: 22 }, i === 1 && { flex: 1 }, i > 1 && { width: 32, textAlign: 'center' }]}>{h}</Text>
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
                            <Text style={{ color: '#2A2A2A', fontSize: 10, textAlign: 'center', marginTop: 14 }}>
                                BadmintonScore • {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </View>
                    )}
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
    bg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    header: { padding: 20, paddingTop: 10 },
    backBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
    headerTitle: { color: 'white', fontSize: 28, fontWeight: 'bold' },
    filterBar: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', marginHorizontal: 20, marginVertical: 10, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#222' },
    filterBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
    filterBtnActive: { backgroundColor: 'rgba(118, 255, 3, 0.15)', borderWidth: 1, borderColor: 'rgba(118, 255, 3, 0.3)' },
    filterText: { color: '#666', fontSize: 13, fontWeight: 'bold' },
    filterTextActive: { color: '#76FF03' },
    tabBar: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 15 },
    tabItem: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)' },
    activeTab: { backgroundColor: '#76FF03' },
    tabText: { color: '#888', fontWeight: 'bold', fontSize: 13 },
    activeTabText: { color: '#000' },
    // Error banner
    errorBanner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40, marginTop: 40 },
    errorTitle: { color: '#FF5252', fontSize: 18, fontWeight: '800', textAlign: 'center' },
    errorSub: { color: '#555', fontSize: 14, textAlign: 'center', lineHeight: 20 },
    retryBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#76FF03', borderRadius: 99, paddingVertical: 12, paddingHorizontal: 28, marginTop: 8 },
    retryBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },
    // Edit modal
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
});
