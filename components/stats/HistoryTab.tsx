import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Match } from '../../database/MatchRepository';
import { Player } from '../../database/PlayerRepository';

interface Props {
    matches: Match[];
    /** Pre-computed O(1) lookup map — avoids .find() on every render cell */
    playerMap: Map<number, Player>;
    timeFilter: 'today' | 'overall';
    refreshing: boolean;
    onRefresh: () => void;
    onEditMatch: (match: Match) => void;
    onClearHistory: () => void;
}

export function HistoryTab({ matches, playerMap, timeFilter, refreshing, onRefresh, onEditMatch, onClearHistory }: Props) {
    /**
     * Performance fix: player name resolution was previously O(n) per player ID
     * per match cell (via .find() inside getNames). playerMap gives O(1) lookups.
     * useMemo here ensures the filtered list is only recomputed when matches or
     * the filter changes, not on every render cycle.
     */
    const historyMatches = useMemo(() => {
        if (timeFilter === 'today') {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            return matches.filter(m => m.timestamp >= todayStart.getTime());
        }
        return matches;
    }, [matches, timeFilter]);

    /** O(1) name resolution using the pre-computed map */
    const getNames = (ids: string): string => {
        if (!ids) return 'Unknown';
        return ids
            .split(',')
            .map(id => playerMap.get(parseInt(id))?.name ?? `P#${id}`)
            .join(' & ');
    };

    return (
        <FlatList
            data={historyMatches}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#76FF03" />}
            ListFooterComponent={<View style={{ height: 200 }} />}
            ListHeaderComponent={
                <View style={{ marginBottom: 15, alignItems: 'flex-end', paddingHorizontal: 5 }}>
                    <TouchableOpacity onPress={onClearHistory} style={styles.clearButton}>
                        <LinearGradient colors={['#FF5252', '#D32F2F']} style={styles.actionGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                            <Ionicons name="trash-outline" size={18} color="#FFF" />
                            <Text style={styles.actionText}>Clear All History</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            }
            renderItem={({ item }) => {
                const date = new Date(item.timestamp);
                const isAWin = item.winnerTeam === 'A';

                return (
                    <View style={styles.matchCard}>
                        <View style={styles.matchHeader}>
                            <Text style={styles.matchDate}>
                                {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                            <TouchableOpacity style={styles.editBtn} onPress={() => onEditMatch(item)}>
                                <Ionicons name="pencil" size={16} color="#666" />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.scoreRow}>
                            {/* Team A */}
                            <View style={[styles.teamBox, isAWin ? styles.winnerBox : null]}>
                                <View style={{ flexDirection: 'row', marginBottom: 5 }}>
                                    {item.teamAPlayers.split(',').map(id => {
                                        const p = playerMap.get(parseInt(id)); // O(1)
                                        return (
                                            <View key={id} style={styles.avatarChip}>
                                                {p?.avatar
                                                    ? <Image source={{ uri: p.avatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                    : <Text style={styles.avatarChipText}>{p?.name?.charAt(0)}</Text>
                                                }
                                            </View>
                                        );
                                    })}
                                </View>
                                <Text style={styles.teamScore}>{item.teamAScore}</Text>
                                <Text style={styles.teamNames}>{getNames(item.teamAPlayers)}</Text>
                            </View>

                            <Text style={styles.vsText}>VS</Text>

                            {/* Team B */}
                            <View style={[styles.teamBox, !isAWin ? styles.winnerBox : null]}>
                                <View style={{ flexDirection: 'row', marginBottom: 5 }}>
                                    {item.teamBPlayers.split(',').map(id => {
                                        const p = playerMap.get(parseInt(id)); // O(1)
                                        return (
                                            <View key={id} style={styles.avatarChip}>
                                                {p?.avatar
                                                    ? <Image source={{ uri: p.avatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                    : <Text style={styles.avatarChipText}>{p?.name?.charAt(0)}</Text>
                                                }
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
}

const styles = StyleSheet.create({
    listContent: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 10 },
    matchCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#222' },
    matchHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, alignItems: 'center' },
    matchDate: { color: '#666', fontSize: 12 },
    editBtn: { padding: 4 },
    scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    teamBox: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.2)' },
    winnerBox: { backgroundColor: 'rgba(76, 175, 80, 0.1)', borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.3)' },
    teamScore: { color: 'white', fontSize: 24, fontWeight: '900' },
    teamNames: { color: '#888', fontSize: 12, textAlign: 'center', marginTop: 4 },
    vsText: { color: '#444', fontWeight: 'bold', marginHorizontal: 10 },
    avatarChip: { width: 30, height: 30, borderRadius: 15, overflow: 'hidden', backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginHorizontal: -2, borderWidth: 1, borderColor: '#222' },
    avatarChipText: { color: '#AAA', fontSize: 10, fontWeight: 'bold' },
    clearButton: { borderRadius: 20, overflow: 'hidden', shadowColor: '#FF5252', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    actionGradient: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 20, gap: 8 },
    actionText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
});
