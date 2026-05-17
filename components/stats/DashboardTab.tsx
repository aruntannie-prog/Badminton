import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ExtendedPlayerStats, PairStats, GlobalStats } from '../../logic/StatisticsEngine';

interface Props {
    displayStats: { playerStats: ExtendedPlayerStats[]; pairStats: PairStats[]; globalStats: GlobalStats } | null;
    timeFilter: 'today' | 'overall';
    refreshing: boolean;
    onRefresh: () => void;
    onClearHistory: () => void;
    onShareReport: () => void;
}

export function DashboardTab({ displayStats, timeFilter, refreshing, onRefresh, onClearHistory, onShareReport }: Props) {
    if (!displayStats) return null;
    const { globalStats, playerStats, pairStats } = displayStats;
    const top4Players = playerStats.slice(0, 4);
    const top2Pairs = pairStats.slice(0, 2);
    const highestMatch = globalStats.highestScoreMatch;

    return (
        <ScrollView
            style={styles.tabContent}
            contentContainerStyle={{ paddingBottom: 20 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#76FF03" />}
        >
            {/* Action Row */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, marginBottom: 10, gap: 10 }}>
                <TouchableOpacity onPress={onClearHistory} style={styles.clearButton}>
                    <LinearGradient colors={['#FF5252', '#D32F2F']} style={styles.actionGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                        <Ionicons name="trash-outline" size={20} color="#FFF" />
                        <Text style={styles.actionText}>Clear Stats</Text>
                    </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={onShareReport} style={styles.shareButton}>
                    <LinearGradient colors={['#25D366', '#128C7E']} style={styles.actionGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                        <Ionicons name="logo-whatsapp" size={20} color="#FFF" />
                        <Text style={styles.actionText}>Share Report</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>

            <View style={{ backgroundColor: '#000', paddingVertical: 10 }}>
                {/* Summary Cards */}
                <View style={[styles.statsGrid, { marginBottom: 20 }]}>
                    <LinearGradient colors={['#1F1F1F', '#121212']} style={styles.statCard}>
                        <Ionicons name="calendar-outline" size={24} color="#76FF03" />
                        <Text style={styles.statValue}>
                            {timeFilter === 'today' ? globalStats.totalMatchesToday : globalStats.totalMatchesAllTime}
                        </Text>
                        <Text style={styles.statLabel}>{timeFilter === 'today' ? 'Matches Today' : 'Matches All-Time'}</Text>
                    </LinearGradient>
                    <LinearGradient colors={['#1F1F1F', '#121212']} style={styles.statCard}>
                        <Ionicons name="flash-outline" size={24} color="#FF9100" />
                        <Text style={styles.statValue}>{globalStats.totalPointsScored}</Text>
                        <Text style={styles.statLabel}>{timeFilter === 'today' ? 'Points Today' : 'Points All-Time'}</Text>
                    </LinearGradient>
                </View>

                {/* Highest Score */}
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
                                    {p.avatar
                                        ? <Image source={{ uri: p.avatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                        : <Text style={[styles.avatarTextLarge, { fontSize: 18 }]}>{p.name.charAt(0)}</Text>
                                    }
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
            <View style={{ height: 200 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    tabContent: { flex: 1 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    statCard: { width: '48%', padding: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
    statValue: { color: 'white', fontSize: 24, fontWeight: 'bold', marginVertical: 5 },
    statLabel: { color: '#888', fontSize: 12 },
    highlightSection: { marginTop: 25, paddingHorizontal: 20 },
    sectionTitle: { color: '#AAA', fontSize: 16, fontWeight: 'bold', marginBottom: 10, paddingLeft: 5 },
    highlightCard: { borderRadius: 16, padding: 20 },
    highlightHeader: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 4 },
    avatarLarge: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
    avatarTextLarge: { color: 'white', fontSize: 24, fontWeight: 'bold' },
    highlightName: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    highlightSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
    rowName: { color: 'white', fontSize: 15, fontWeight: '500' },
    clearButton: { borderRadius: 20, overflow: 'hidden', shadowColor: '#FF5252', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    shareButton: { borderRadius: 20, overflow: 'hidden', shadowColor: '#25D366', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    actionGradient: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 20, gap: 8 },
    actionText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
});
