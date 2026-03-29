import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View, Dimensions, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KVStore } from '../database/KVStore';
import { MatchRepository } from '../database/MatchRepository';
import { Player, PlayerRepository } from '../database/PlayerRepository';
import { MatchEngine } from '../logic/MatchEngine';
import { RotationEngine, RotationResult } from '../logic/RotationEngine';
import { BottomNav } from '../components/BottomNav';

const { width } = Dimensions.get('window');

export default function MatchScreen() {
    const router = useRouter();
    const [rotation, setRotation] = useState<RotationResult | null>(null);
    const [matchNumber, setMatchNumber] = useState(1);

    // Manual Score Entry
    const [scoreA, setScoreA] = useState('');
    const [scoreB, setScoreB] = useState('');
    const [scoreError, setScoreError] = useState('');

    useEffect(() => {
        loadMatchState();
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
            const setupJson = await KVStore.getItem('active_match_setup');
            const matchNum = await KVStore.getItem('match_number');

            if (setupJson) {
                setRotation(JSON.parse(setupJson));
            } else {
                // If no active match is found (e.g. after clear), go back to home
                router.replace('/');
            }
            if (matchNum) {
                setMatchNumber(parseInt(matchNum, 10));
            } else {
                setMatchNumber(1);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleSubmitScore = async () => {
        if (!rotation) return;

        const sA = parseInt(scoreA);
        const sB = parseInt(scoreB);

        const result = MatchEngine.submitFinalScore(sA, sB);

        if (!result.valid || !result.state) {
            setScoreError(result.error || 'Invalid scores');
            return;
        }

        setScoreError('');

        // 1. Save match result
        const matchData = {
            timestamp: Date.now(),
            teamAPlayers: rotation.teamA.map(p => p.id).join(','),
            teamBPlayers: rotation.teamB.map(p => p.id).join(','),
            teamAScore: result.state.teamAScore,
            teamBScore: result.state.teamBScore,
            winnerTeam: result.state.winner!
        };
        await MatchRepository.saveMatch(matchData);

        // 2. Calculate next rotation
        const winners = result.state.winner === 'A' ? rotation.teamA : rotation.teamB;
        const losers = result.state.winner === 'A' ? rotation.teamB : rotation.teamA;
        const nextRotation = RotationEngine.calculateNextMatch(
            winners,
            losers,
            rotation.waitingPair,
            rotation.sittingPlayers
        );

        // 3. Update state
        setRotation(nextRotation);
        const nextMatchNum = matchNumber + 1;
        setMatchNumber(nextMatchNum);
        setScoreA('');
        setScoreB('');

        await KVStore.setItem('active_match_setup', JSON.stringify(nextRotation));
        await KVStore.setItem('match_number', nextMatchNum.toString());

        Alert.alert(
            `Match ${matchNumber} Complete!`,
            `${result.state.winner === 'A' ? 'Team A' : 'Team B'} wins ${result.state.teamAScore}-${result.state.teamBScore}.\nRotation updated for Match ${nextMatchNum}.`
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
                <View style={styles.topHeader}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                        <Ionicons name="chevron-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Live Match</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                        <TouchableOpacity onPress={handleShuffle} style={styles.shuffleBtn}>
                            <Ionicons name="shuffle" size={24} color="#76FF03" />
                        </TouchableOpacity>
                        <Text style={styles.matchNumBadge}>#{matchNumber}</Text>
                    </View>
                </View>

                <View style={styles.scrollInner}>
                    {/* Scoreboard Card */}
                    <View style={styles.scoreboardWrapper}>
                        <LinearGradient colors={['#1E1E1E', '#141414']} style={styles.scoreboardCard}>
                            {/* Team Headers */}
                            <View style={styles.teamHeaderRow}>
                                <Text style={[styles.teamTab, styles.teamTabActive]}>TEAM A</Text>
                                <Text style={styles.teamTab}>TEAM B</Text>
                            </View>

                            {/* Players Row */}
                            <View style={styles.playersRow}>
                                <View style={styles.teamPlayersCol}>
                                    {rotation.teamA.map(p => (
                                        <PlayerAvatar key={p.id} player={p} />
                                    ))}
                                </View>
                                <View style={styles.glowSeparator}>
                                    <View style={styles.dotRow}>
                                        <View style={styles.glowDot} />
                                        <View style={styles.glowDot} />
                                    </View>
                                    <View style={styles.dotRow}>
                                        <View style={[styles.glowDot, styles.glowDotActive]} />
                                        <View style={[styles.glowDot, styles.glowDotActive]} />
                                    </View>
                                    <View style={styles.dotRow}>
                                        <View style={styles.glowDot} />
                                        <View style={styles.glowDot} />
                                    </View>
                                </View>
                                <View style={styles.teamPlayersCol}>
                                    {rotation.teamB.map(p => (
                                        <PlayerAvatar key={p.id} player={p} />
                                    ))}
                                </View>
                            </View>
                        </LinearGradient>
                    </View>

                    {/* Score Entry */}
                    <View style={[styles.scoreEntryCard, { marginBottom: 15 }]}>
                        <Text style={styles.scoreEntryTitle}>Enter Final Score</Text>
                        <View style={styles.scoreInputRow}>
                            <View style={styles.scoreInputGroup}>
                                <Text style={styles.scoreInputLabel}>Team A</Text>
                                <TextInput
                                    style={styles.scoreInput}
                                    keyboardType="number-pad"
                                    value={scoreA}
                                    onChangeText={(t) => { setScoreA(t); setScoreError(''); }}
                                    placeholder="0"
                                    placeholderTextColor="#333"
                                    maxLength={3}
                                />
                            </View>
                            <Text style={styles.vsDivider}>vs</Text>
                            <View style={styles.scoreInputGroup}>
                                <Text style={styles.scoreInputLabel}>Team B</Text>
                                <TextInput
                                    style={styles.scoreInput}
                                    keyboardType="number-pad"
                                    value={scoreB}
                                    onChangeText={(t) => { setScoreB(t); setScoreError(''); }}
                                    placeholder="0"
                                    placeholderTextColor="#333"
                                    maxLength={3}
                                />
                            </View>
                        </View>
                        {scoreError ? <Text style={styles.errorText}>{scoreError}</Text> : null}
                    </View>

                    {/* Submit Button (Moved UP) */}
                    <TouchableOpacity onPress={handleSubmitScore} disabled={!scoreA || !scoreB}>
                        <LinearGradient
                            colors={scoreA && scoreB ? ['#76FF03', '#388E3C'] : ['#222', '#111']}
                            style={[styles.submitBtn, { marginBottom: 15 }]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        >
                            <Text style={[styles.submitBtnText, (!scoreA || !scoreB) && { color: '#444' }]}>
                                Submit Score
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Pending Players (Queue) */}
                    {(rotation.waitingPair.length > 0 || rotation.sittingPlayers.length > 0) && (
                        <View style={styles.queueCard}>
                            {rotation.waitingPair.length > 0 && (
                                <View style={styles.queueSection}>
                                    <Text style={styles.queueTitle}>Up Next (Waiting)</Text>
                                    <View style={styles.queueRow}>
                                        {rotation.waitingPair.map(p => <PlayerAvatar key={p.id} player={p} />)}
                                    </View>
                                </View>
                            )}

                            {rotation.sittingPlayers.length > 0 && (
                                <View style={[styles.queueSection, rotation.waitingPair.length > 0 && { marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#333' }]}>
                                    <Text style={[styles.queueTitle, { color: '#AAA' }]}>Sitting Out</Text>
                                    <View style={styles.queueRow}>
                                        {rotation.sittingPlayers.map(p => <PlayerAvatar key={p.id} player={p} />)}
                                    </View>
                                </View>
                            )}
                        </View>
                    )}




                </View>
            </SafeAreaView>

            <BottomNav />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    backgroundImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    backgroundOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    rootContent: { flex: 1 },
    scrollInner: { flex: 1, paddingHorizontal: 20, paddingBottom: 20 },

    topHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginVertical: 15,
    },
    headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
    iconBtn: { padding: 5 },
    shuffleBtn: { padding: 5, marginRight: 5 },
    matchNumBadge: { color: '#76FF03', fontSize: 16, fontWeight: 'bold' },

    scoreboardWrapper: { width: '100%', marginBottom: 25 },
    scoreboardCard: {
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: '#2A2A2A',
        alignItems: 'center',
    },

    teamHeaderRow: {
        flexDirection: 'row',
        width: '100%',
        marginBottom: 15,
    },
    teamTab: {
        flex: 1,
        textAlign: 'center',
        color: '#555',
        fontSize: 13,
        fontWeight: 'bold',
        letterSpacing: 1,
        paddingBottom: 8,
        borderBottomWidth: 2,
        borderBottomColor: '#222',
    },
    teamTabActive: {
        color: '#AAA',
        borderBottomColor: '#76FF03',
    },

    playersRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        alignItems: 'center',
    },
    teamPlayersCol: { flex: 1, alignItems: 'center', gap: 4 },
    playerNameOnBoard: { color: '#CCC', fontSize: 16, fontWeight: '500' },

    glowSeparator: { gap: 6, alignItems: 'center' },
    dotRow: { flexDirection: 'row', gap: 6 },
    glowDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#444' },
    glowDotActive: { backgroundColor: '#76FF03', shadowColor: '#76FF03', shadowRadius: 5, shadowOpacity: 0.8 },

    scoreEntryCard: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#1A1A1A',
    },
    scoreEntryTitle: { color: '#888', fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1 },
    scoreInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15 },
    scoreInputGroup: { alignItems: 'center', flex: 1 },
    scoreInputLabel: { color: '#666', fontSize: 12, marginBottom: 8, fontWeight: 'bold' },
    scoreInput: {
        backgroundColor: '#111',
        color: 'white',
        fontSize: 36,
        fontWeight: '900',
        padding: 15,
        borderRadius: 12,
        textAlign: 'center',
        width: '100%',
        minHeight: 70,
        borderWidth: 1,
        borderColor: '#333',
    },
    vsDivider: { color: '#444', fontSize: 16, fontWeight: 'bold', marginTop: 20 },
    errorText: { color: '#ef5350', fontSize: 13, textAlign: 'center', marginTop: 12 },

    // Queue Styles
    queueCard: { padding: 20, marginBottom: 30 },
    queueSection: {},
    queueTitle: { color: '#76FF03', fontSize: 14, fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
    queueRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

    submitBtn: {
        paddingVertical: 18,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 25,
    },
    submitBtnText: { color: 'white', fontSize: 18, fontWeight: 'bold', textTransform: 'uppercase' },

    infoFooter: { gap: 10, marginBottom: 30 },
    infoLabel: { color: '#666', fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
    nextPairRow: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.03)',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#1A1A1A',
        gap: 15,
    },
    playerChip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    avatarCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#222',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#333',
    },
    avatarLetter: { color: '#AAA', fontWeight: 'bold', fontSize: 14 },
    playerChipName: { color: '#AAA', fontSize: 14 },
    sittingLabel: { color: '#888', fontSize: 14, fontWeight: '600', marginTop: 5 },
});
