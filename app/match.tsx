import { Alert, BackHandler, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, Dimensions, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KVStore } from '../database/KVStore';
import { MatchRepository } from '../database/MatchRepository';
import { Player, PlayerRepository } from '../database/PlayerRepository';
import { MatchEngine } from '../logic/MatchEngine';
import { RotationEngine, RotationResult } from '../logic/RotationEngine';
import { BottomNav } from '../components/BottomNav';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

const { width } = Dimensions.get('window');

export default function MatchScreen() {
    const router = useRouter();
    const [rotation, setRotation] = useState<RotationResult | null>(null);
    const [matchNumber, setMatchNumber] = useState(1);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const reportRef = useRef<View>(null);
    const [reportData, setReportData] = useState<{ playerStats: any[], pairStats: any[], totalMatches: number } | null>(null);

    // Manual Score Entry
    const [scoreA, setScoreA] = useState('');
    const [scoreB, setScoreB] = useState('');
    const [scoreError, setScoreError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        loadMatchState();
    }, []);

    // Intercept Android hardware back button — always go home cleanly
    useEffect(() => {
        const handler = BackHandler.addEventListener('hardwareBackPress', () => {
            router.replace('/');
            return true; // prevent default back behavior
        });
        return () => handler.remove();
    }, []);

    const handleShuffle = () => {
        if (!rotation) return;

        Alert.alert(
            "Shuffle Teams?",
            "This will re-randomize all active players and reset the current score to 0. Continue?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Shuffle",
                    style: "destructive",
                    onPress: async () => {
                        // Collect all active players
                        const allActive = [
                            ...rotation.teamA,
                            ...rotation.teamB,
                            ...rotation.waitingPair,
                            ...rotation.sittingPlayers
                        ];

                        // Fresh random setup
                        const newRotation = RotationEngine.initialSetup(allActive);

                        // Update state and storage
                        setRotation(newRotation);
                        setScoreA('');
                        setScoreB('');
                        await KVStore.setItem('active_match_setup', JSON.stringify(newRotation));
                    }
                }
            ]
        );
    };

    const loadMatchState = async () => {
        try {
            console.log("Loading match state...");
            const setupJson = await KVStore.getItem('active_match_setup');
            const matchNum = await KVStore.getItem('match_number');

            if (setupJson) {
                const parsed = JSON.parse(setupJson);
                // Basic validation of parsed object
                if (parsed && Array.isArray(parsed.teamA) && Array.isArray(parsed.teamB)) {
                    setRotation(parsed);
                    console.log("Match state loaded successfully.");
                } else {
                    console.warn("Invalid match setup found in storage. Redirecting home...");
                    await KVStore.removeItem('active_match_setup');
                    router.replace('/');
                }
            } else {
                console.log("No active match found in storage. Redirecting home...");
                router.replace('/');
            }

            if (matchNum) {
                setMatchNumber(parseInt(matchNum, 10));
            } else {
                setMatchNumber(1);
            }
        } catch (e) {
            console.error("Error loading match state:", e);
            // Fallback: clear potentially corrupted state and go home
            await KVStore.removeItem('active_match_setup');
            router.replace('/');
        }
    };

    const handleSubmitScore = async () => {
        if (!rotation || isSubmitting) return; // prevent double-submit

        const sA = parseInt(scoreA);
        const sB = parseInt(scoreB);

        const result = MatchEngine.submitFinalScore(sA, sB);
        if (!result.valid || !result.state) {
            setScoreError(result.error || 'Invalid scores');
            return;
        }

        setScoreError('');
        setIsSubmitting(true);

        // ── Step 1: Pure logic — compute everything upfront, zero I/O ──
        const rotationWinners = result.state.winner === 'A' ? rotation.teamA : rotation.teamB;
        const rotationLosers  = result.state.winner === 'A' ? rotation.teamB : rotation.teamA;
        const nextRotation = RotationEngine.calculateNextMatch(
            rotationWinners,
            rotationLosers,
            rotation.waitingPair,
            rotation.sittingPlayers
        );
        const nextMatchNum = matchNumber + 1;
        const winnerIds = rotationWinners.map(p => p.id);
        const loserIds  = rotationLosers.map(p => p.id);
        const matchData = {
            timestamp: Date.now(),
            teamAPlayers: rotation.teamA.map(p => p.id).join(','),
            teamBPlayers: rotation.teamB.map(p => p.id).join(','),
            teamAScore: result.state.teamAScore,
            teamBScore: result.state.teamBScore,
            winnerTeam: result.state.winner!
        };

        // ── Step 2: Update UI immediately — user sees next match at once ──
        setRotation(nextRotation);
        setMatchNumber(nextMatchNum);
        setScoreA('');
        setScoreB('');
        setIsSubmitting(false);

        Alert.alert(
            `Match ${matchNumber} Complete!`,
            `${result.state.winner === 'A' ? 'Team A' : 'Team B'} wins ${result.state.teamAScore}-${result.state.teamBScore}.\nRotation updated for Match ${nextMatchNum}.`
        );

        // ── Step 3: Persist to DB & cloud in background (fire-and-forget) ──
        Promise.all([
            MatchRepository.saveMatch(matchData),
            KVStore.setItem('active_match_setup', JSON.stringify(nextRotation)),
            KVStore.setItem('match_number', nextMatchNum.toString()),
            PlayerRepository.getAllPlayers().then(freshPlayers => {
                const freshMap = new Map<number, Player>(freshPlayers.map(p => [p.id, p]));
                return Promise.all([
                    ...winnerIds.map(id => {
                        const p = freshMap.get(id);
                        return p
                            ? PlayerRepository.updatePlayer({ ...p, matchesPlayed: (p.matchesPlayed || 0) + 1, wins: (p.wins || 0) + 1 })
                            : Promise.resolve();
                    }),
                    ...loserIds.map(id => {
                        const p = freshMap.get(id);
                        return p
                            ? PlayerRepository.updatePlayer({ ...p, matchesPlayed: (p.matchesPlayed || 0) + 1, losses: (p.losses || 0) + 1 })
                            : Promise.resolve();
                    }),
                ]);
            }),
        ]).catch(e => console.error('Background save failed:', e));
    };


    const handleEndSession = () => {
        Alert.alert(
            'End Today\'s Session?',
            `${matchNumber - 1} match${matchNumber - 1 !== 1 ? 'es' : ''} played. A summary report will be generated and shared. You can choose whether to end the session after sharing.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Generate & Share Report',
                    onPress: () => doEndSession(),
                }
            ]
        );
    };

    const doEndSession = async () => {
        try {
            const [allMatches, allPlayers] = await Promise.all([
                MatchRepository.getAllMatches(),
                PlayerRepository.getAllPlayers()
            ]);
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayMatches = allMatches.filter(m => m.timestamp >= todayStart.getTime());

            if (!todayMatches.length) {
                // No matches today — just ask to end session
                askToEndSession();
                return;
            }

            // Build stats for report
            const playerMap = new Map(allPlayers.map(p => [p.id, p]));
            const statsMap = new Map<number, { name: string; avatar?: string; m: number; w: number; l: number }>();
            const pairMap = new Map<string, { p1: string; p2: string; m: number; w: number }>();

            for (const match of todayMatches) {
                const winTeam = match.winnerTeam === 'A' ? match.teamAPlayers : match.teamBPlayers;
                const allIds = [...match.teamAPlayers.split(','), ...match.teamBPlayers.split(',')];
                const winIds = winTeam.split(',');

                for (const id of allIds) {
                    const pid = parseInt(id);
                    const p = playerMap.get(pid);
                    if (!p) continue;
                    const s = statsMap.get(pid) || { name: p.name, avatar: p.avatar, m: 0, w: 0, l: 0 };
                    s.m++;
                    if (winIds.includes(id)) s.w++; else s.l++;
                    statsMap.set(pid, s);
                }

                const teamIds = [match.teamAPlayers.split(','), match.teamBPlayers.split(',')];
                for (const team of teamIds) {
                    if (team.length === 2) {
                        const key = [team[0], team[1]].sort().join('-');
                        const pair = pairMap.get(key) || {
                            p1: playerMap.get(parseInt(team[0]))?.name || team[0],
                            p2: playerMap.get(parseInt(team[1]))?.name || team[1],
                            m: 0, w: 0
                        };
                        pair.m++;
                        if (winTeam.split(',').includes(team[0])) pair.w++;
                        pairMap.set(key, pair);
                    }
                }
            }

            const playerStats = Array.from(statsMap.values()).sort((a, b) => (b.w / b.m) - (a.w / a.m));
            const pairStats = Array.from(pairMap.values()).sort((a, b) => (b.w / b.m) - (a.w / a.m)).slice(0, 7);

            setReportData({ playerStats, pairStats, totalMatches: todayMatches.length });
            setIsGeneratingReport(true);

            // Wait for reportRef to render before capture
            await new Promise(resolve => setTimeout(resolve, 800));

            const uri = await captureRef(reportRef, { format: 'png', quality: 0.95 });
            setIsGeneratingReport(false);

            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
                await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share Session Report', UTI: 'public.png' });
            }
        } catch (e) {
            console.error('Report generation failed:', e);
            setIsGeneratingReport(false);
        }

        // After share sheet closes (shared OR cancelled), ask separately if they want to end session
        // Bug #4 fix: don't auto-clear — give user the choice
        askToEndSession();
    };

    const askToEndSession = () => {
        Alert.alert(
            'End Session?',
            'All match results are saved. End today\'s session and return home?',
            [
                { text: 'Stay in Match', style: 'cancel' },
                {
                    text: 'End Session',
                    style: 'destructive',
                    onPress: async () => {
                        await KVStore.removeItem('active_match_setup');
                        await KVStore.removeItem('match_number');
                        router.replace('/');
                    }
                }
            ]
        );
    };

    if (!rotation) return (
        <View style={styles.container}>
            <Image source={require('../assets/images/background.jpg')} style={styles.backgroundImage} resizeMode="cover" />
            <LinearGradient colors={['rgba(18,18,18,0.9)', 'rgba(0,0,0,0.95)']} style={styles.backgroundOverlay} />
            <Text style={{ color: 'white', marginTop: 100, textAlign: 'center' }}>Loading...</Text>
        </View>
    );

    const PlayerAvatar = ({ player }: { player: Player }) => (
        <View style={styles.playerChip}>
            <View style={[styles.avatarCircle, { overflow: 'hidden' }]}>
                {player.avatar ? (
                    <Image source={{ uri: player.avatar }} style={{ width: '100%', height: '100%' }} />
                ) : (
                    <Text style={styles.avatarLetter}>{player.name[0].toUpperCase()}</Text>
                )}
            </View>
            <Text style={styles.playerChipName}>{player.name}</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <Image source={require('../assets/images/background.jpg')} style={styles.backgroundImage} resizeMode="cover" />
            <LinearGradient colors={['rgba(18,18,18,0.95)', 'rgba(10,10,10,0.98)']} style={styles.backgroundOverlay} />

            <SafeAreaView style={styles.rootContent}>
                {/* ── Header ── */}
                <View style={styles.topHeader}>
                    <TouchableOpacity onPress={() => router.replace('/')} style={styles.iconBtn}>
                        <Ionicons name="chevron-back" size={22} color="#FFF" />
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <View style={styles.liveDot} />
                        <Text style={styles.headerTitle}>Live Match</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <TouchableOpacity onPress={handleShuffle} style={styles.iconBtn}>
                            <Ionicons name="shuffle" size={20} color="#76FF03" />
                        </TouchableOpacity>
                        <View style={styles.matchBadge}>
                            <Text style={styles.matchBadgeText}>#{matchNumber}</Text>
                        </View>
                    </View>
                </View>

                <ScrollView
                    style={styles.scrollArea}
                    contentContainerStyle={styles.scrollInner}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* ── Team Card ── */}
                    <View style={styles.teamCard}>
                        <View style={styles.teamLabelRow}>
                            <View style={styles.teamLabelGroup}>
                                <Text style={styles.teamLabelActive}>TEAM A</Text>
                                <View style={styles.teamLabelUnderlineActive} />
                            </View>
                            <View style={styles.teamLabelGroup}>
                                <Text style={styles.teamLabelMuted}>TEAM B</Text>
                                <View style={styles.teamLabelUnderlineMuted} />
                            </View>
                        </View>
                        <View style={styles.playersRow}>
                            <View style={styles.teamPlayersCol}>
                                {rotation.teamA.map(p => <PlayerAvatar key={p.id} player={p} />)}
                            </View>
                            <View style={styles.separator}>
                                <View style={styles.separatorLine} />
                                <View style={styles.separatorBadge}>
                                    <Text style={styles.separatorVS}>VS</Text>
                                </View>
                                <View style={styles.separatorLine} />
                            </View>
                            <View style={styles.teamPlayersCol}>
                                {rotation.teamB.map(p => <PlayerAvatar key={p.id} player={p} />)}
                            </View>
                        </View>
                    </View>

                    {/* ── Score Entry ── */}
                    <View style={styles.scoreCard}>
                        <Text style={styles.scoreCardTitle}>ENTER FINAL SCORE</Text>
                        <View style={styles.scoreRow}>
                            <View style={styles.scoreInputGroup}>
                                <Text style={styles.scoreInputLabel}>Team A</Text>
                                <TextInput
                                    style={styles.scoreInput}
                                    keyboardType="number-pad"
                                    value={scoreA}
                                    onChangeText={t => { setScoreA(t); setScoreError(''); }}
                                    placeholder="0"
                                    placeholderTextColor="#333"
                                    maxLength={3}
                                />
                            </View>
                            <Text style={styles.scoreDivider}>:</Text>
                            <View style={styles.scoreInputGroup}>
                                <Text style={styles.scoreInputLabel}>Team B</Text>
                                <TextInput
                                    style={styles.scoreInput}
                                    keyboardType="number-pad"
                                    value={scoreB}
                                    onChangeText={t => { setScoreB(t); setScoreError(''); }}
                                    placeholder="0"
                                    placeholderTextColor="#333"
                                    maxLength={3}
                                />
                            </View>
                        </View>
                        {scoreError ? <Text style={styles.errorText}>{scoreError}</Text> : null}
                    </View>

                    {/* ── Submit Button ── */}
                    <TouchableOpacity
                        onPress={handleSubmitScore}
                        disabled={!scoreA || !scoreB || isSubmitting}
                        activeOpacity={0.82}
                        style={styles.submitBtnWrapper}
                    >
                        <LinearGradient
                            colors={scoreA && scoreB && !isSubmitting ? ['#9EFF57', '#76FF03', '#4CAF28'] : ['#1E1E1E', '#1A1A1A']}
                            style={styles.submitBtn}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        >
                            <Ionicons
                                name="checkmark-circle"
                                size={20}
                                color={scoreA && scoreB && !isSubmitting ? '#0A2800' : '#333'}
                                style={{ marginRight: 8 }}
                            />
                            <Text style={[styles.submitBtnText, (!scoreA || !scoreB || isSubmitting) && { color: '#444' }]}>
                                {isSubmitting ? 'Saving...' : 'Submit Score'}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* ── Queue Card ── */}
                    {(rotation.waitingPair.length > 0 || rotation.sittingPlayers.length > 0) && (
                        <View style={styles.queueCard}>
                            {rotation.waitingPair.length > 0 && (
                                <View style={styles.queueSection}>
                                    <View style={styles.queueLabelRow}>
                                        <View style={styles.queueDot} />
                                        <Text style={styles.queueTitleGreen}>Up Next</Text>
                                    </View>
                                    <View style={styles.queueChipRow}>
                                        {rotation.waitingPair.map(p => <PlayerAvatar key={p.id} player={p} />)}
                                    </View>
                                </View>
                            )}

                            {rotation.sittingPlayers.length > 0 && (
                                <View style={[styles.queueSection, rotation.waitingPair.length > 0 && styles.queueDivider]}>
                                    <View style={styles.queueLabelRow}>
                                        <View style={[styles.queueDot, { backgroundColor: '#555' }]} />
                                        <Text style={styles.queueTitleMuted}>Sitting Out</Text>
                                    </View>
                                    <View style={styles.queueChipRow}>
                                        {rotation.sittingPlayers.map(p => <PlayerAvatar key={p.id} player={p} />)}
                                    </View>
                                </View>
                            )}
                        </View>
                    )}

                    {/* ── End Session ── */}
                    <TouchableOpacity onPress={handleEndSession} style={styles.endSessionBtn} activeOpacity={0.8}>
                        <Ionicons name="stop-circle-outline" size={18} color="#FF5252" style={{ marginRight: 8 }} />
                        <Text style={styles.endSessionText}>End Session & Share Report</Text>
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>

            <BottomNav />

            {/* Report Generation Modal */}
            <Modal visible={isGeneratingReport} transparent={false} animationType="none" statusBarTranslucent>
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    {reportData && (
                        <View ref={reportRef} collapsable={false} style={{ backgroundColor: '#0D0D0D', padding: 16, width }}>
                            {/* Header */}
                            <View style={{ alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' }}>
                                <Text style={{ color: '#76FF03', fontSize: 20, fontWeight: '900', letterSpacing: 1 }}>🏸 BADMINTON SESSION REPORT</Text>
                                <Text style={{ color: '#555', fontSize: 12, marginTop: 4 }}>
                                    {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </Text>
                            </View>

                            {/* Summary */}
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
                                {[
                                    { value: reportData.totalMatches, label: 'Matches Today', color: '#76FF03' },
                                    { value: reportData.playerStats.length, label: 'Players', color: '#29B6F6' },
                                    { value: reportData.pairStats.length, label: 'Pairs', color: '#FF9100' },
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
                                {reportData.playerStats.slice(0, 8).map((p, idx) => (
                                    <View key={idx} style={{ flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#1A1A1A', alignItems: 'center' }}>
                                        <Text style={{ width: 22, color: idx === 0 ? '#FFD700' : '#555', fontSize: 11, fontWeight: 'bold' }}>{idx + 1}</Text>
                                        <Text style={{ flex: 1, color: '#DDD', fontSize: 12, fontWeight: '500' }} numberOfLines={1}>{p.name}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#888', fontSize: 12 }}>{p.m}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#FFF', fontSize: 12, fontWeight: 'bold' }}>{p.w}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#FF5252', fontSize: 12 }}>{p.l}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#76FF03', fontSize: 12, fontWeight: 'bold' }}>{p.m > 0 ? ((p.w / p.m) * 100).toFixed(0) : 0}%</Text>
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
                                {reportData.pairStats.map((pair, idx) => (
                                    <View key={idx} style={{ flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#1A1A1A', alignItems: 'center' }}>
                                        <Text style={{ width: 22, color: idx === 0 ? '#FFD700' : '#555', fontSize: 11, fontWeight: 'bold' }}>{idx + 1}</Text>
                                        <Text style={{ flex: 1, color: '#DDD', fontSize: 12, fontWeight: '500' }} numberOfLines={1}>{pair.p1} & {pair.p2}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#888', fontSize: 12 }}>{pair.m}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#FFF', fontSize: 12, fontWeight: 'bold' }}>{pair.w}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#FF5252', fontSize: 12 }}>{pair.m - pair.w}</Text>
                                        <Text style={{ width: 32, textAlign: 'center', color: '#76FF03', fontSize: 12, fontWeight: 'bold' }}>{pair.m > 0 ? ((pair.w / pair.m) * 100).toFixed(0) : 0}%</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Footer */}
                            <Text style={{ color: '#2A2A2A', fontSize: 10, textAlign: 'center', marginTop: 14 }}>BadmintonScore • {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>
                        </View>
                    )}

                    {/* Overlay */}
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center' }]}>
                        <Ionicons name="share-social-outline" size={44} color="#76FF03" />
                        <Text style={{ color: '#76FF03', fontSize: 18, fontWeight: 'bold', marginTop: 16 }}>Generating Report…</Text>
                        <Text style={{ color: '#444', fontSize: 13, marginTop: 6 }}>Today's session summary</Text>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0E0E0E' },
    backgroundImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    backgroundOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    rootContent: { flex: 1 },
    scrollArea: { flex: 1 },
    scrollInner: { paddingHorizontal: 16, paddingBottom: 100 },

    // Header
    topHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#76FF03' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconBtn: { padding: 6 },
    matchBadge: {
        backgroundColor: 'rgba(118,255,3,0.12)',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: 'rgba(118,255,3,0.3)',
    },
    matchBadgeText: { color: '#76FF03', fontSize: 13, fontWeight: '700' },

    // Team Card
    teamCard: {
        backgroundColor: '#131313',
        borderRadius: 20,
        padding: 20,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#1E1E1E',
    },
    teamLabelRow: { flexDirection: 'row', marginBottom: 20 },
    teamLabelGroup: { flex: 1, alignItems: 'center', gap: 6 },
    teamLabelActive: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
    teamLabelMuted: { color: '#555', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
    teamLabelUnderlineActive: {
        height: 2, width: '60%',
        backgroundColor: '#76FF03', borderRadius: 2,
    },
    teamLabelUnderlineMuted: { height: 2, width: '60%', backgroundColor: '#2A2A2A', borderRadius: 2 },
    playersRow: { flexDirection: 'row', alignItems: 'center' },
    teamPlayersCol: { flex: 1, alignItems: 'center', gap: 12 },

    // VS Separator
    separator: { width: 44, alignItems: 'center', gap: 4 },
    separatorLine: { width: 1, height: 24, backgroundColor: '#2A2A2A' },
    separatorBadge: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: '#1E1E1E',
        borderWidth: 1, borderColor: 'rgba(118,255,3,0.25)',
        alignItems: 'center', justifyContent: 'center',
    },
    separatorVS: { color: '#76FF03', fontSize: 10, fontWeight: '900', letterSpacing: 1 },

    // Player Chip
    playerChip: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#1A1919', borderRadius: 50,
        paddingVertical: 8, paddingHorizontal: 12,
        borderWidth: 1, borderColor: '#262626', width: '95%',
    },
    avatarCircle: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#262626',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: '#333',
    },
    avatarLetter: { color: '#76FF03', fontWeight: '800', fontSize: 14 },
    playerChipName: { color: '#E0E0E0', fontSize: 13, fontWeight: '600', flex: 1 },

    // Score Card
    scoreCard: {
        backgroundColor: '#131313', borderRadius: 20,
        padding: 20, marginBottom: 14,
        borderWidth: 1, borderColor: '#1E1E1E',
    },
    scoreCardTitle: {
        color: '#555', fontSize: 11, fontWeight: '800',
        letterSpacing: 2, textAlign: 'center', marginBottom: 16,
    },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    scoreInputGroup: { flex: 1, alignItems: 'center', gap: 8 },
    scoreInputLabel: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
    scoreInput: {
        backgroundColor: '#1E1E1E', color: '#FFFFFF',
        fontSize: 40, fontWeight: '900',
        padding: 12, borderRadius: 14,
        textAlign: 'center', width: '100%', minHeight: 72,
        borderWidth: 1, borderColor: '#2A2A2A',
    },
    scoreDivider: { color: '#333', fontSize: 28, fontWeight: '900', marginTop: 20 },
    errorText: { color: '#FF5252', fontSize: 12, textAlign: 'center', marginTop: 10 },

    // Submit Button
    submitBtnWrapper: { marginBottom: 14 },
    submitBtn: {
        paddingVertical: 17, borderRadius: 99,
        alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
    },
    submitBtnText: { color: '#0A2800', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

    // Queue Card
    queueCard: {
        backgroundColor: '#131313', borderRadius: 20,
        padding: 18, marginBottom: 14,
        borderWidth: 1, borderColor: '#1E1E1E', gap: 14,
    },
    queueSection: {},
    queueDivider: { paddingTop: 14, borderTopWidth: 1, borderTopColor: '#1E1E1E' },
    queueLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    queueDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#76FF03' },
    queueTitleGreen: { color: '#76FF03', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
    queueTitleMuted: { color: '#555', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
    queueChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

    // End Session
    endSessionBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 14, marginBottom: 20, borderRadius: 99,
        borderWidth: 1, borderColor: 'rgba(255,82,82,0.3)',
        backgroundColor: 'rgba(255,82,82,0.06)',
    },
    endSessionText: { color: '#FF5252', fontSize: 14, fontWeight: '700' },
});
