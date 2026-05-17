import React from 'react';
import { View, Text, StyleSheet, FlatList, Image, RefreshControl } from 'react-native';
import { Player } from '../../database/PlayerRepository';
import { PairStats } from '../../logic/StatisticsEngine';

interface Props {
    pairStats: PairStats[];
    playerMap: Map<number, Player>;
    refreshing: boolean;
    onRefresh: () => void;
}

export function PairsTab({ pairStats, playerMap, refreshing, onRefresh }: Props) {
    return (
        <FlatList
            data={pairStats}
            keyExtractor={(_, index) => index.toString()}
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
                                    const p = playerMap.get(pid);
                                    return (
                                        <View key={pid} style={{ width: 30, height: 30, borderRadius: 15, overflow: 'hidden', backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginLeft: idx > 0 ? -10 : 0, borderWidth: 1, borderColor: '#000', zIndex: idx === 0 ? 1 : 0 }}>
                                            {p?.avatar
                                                ? <Image source={{ uri: p.avatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                : <Text style={{ color: '#AAA', fontSize: 10, fontWeight: 'bold' }}>{p?.name?.charAt(0)}</Text>
                                            }
                                        </View>
                                    );
                                })}
                            </View>
                            <Text style={[styles.rowName, { fontSize: 13, flex: 1 }]} numberOfLines={2}>
                                {item.player1Name} & {item.player2Name}
                            </Text>
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
}

const styles = StyleSheet.create({
    listContent: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 10 },
    tableHeader: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#333', marginBottom: 5 },
    colName: { color: '#666', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
    colStat: { flex: 1, textAlign: 'center', color: '#666', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    rowName: { color: 'white', fontSize: 15, fontWeight: '500' },
    rowStat: { flex: 1, textAlign: 'center', color: '#AAA', fontSize: 14 },
});
