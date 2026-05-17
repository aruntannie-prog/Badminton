import React from 'react';
import { View, Text, StyleSheet, FlatList, Image, RefreshControl } from 'react-native';
import { ExtendedPlayerStats } from '../../logic/StatisticsEngine';

interface Props {
    playerStats: ExtendedPlayerStats[];
    refreshing: boolean;
    onRefresh: () => void;
}

export function LeaderboardTab({ playerStats, refreshing, onRefresh }: Props) {
    return (
        <FlatList
            data={playerStats}
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
                            {item.avatar
                                ? <Image source={{ uri: item.avatar }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                : <Text style={{ color: '#AAA', fontSize: 12, fontWeight: 'bold' }}>{item.name.charAt(0)}</Text>
                            }
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
}

const styles = StyleSheet.create({
    listContent: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 10 },
    tableHeader: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#333', marginBottom: 5 },
    colName: { color: '#666', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
    colStat: { flex: 1, textAlign: 'center', color: '#666', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    rankNum: { color: '#555', fontSize: 14, fontWeight: 'bold', width: 20 },
    rowName: { color: 'white', fontSize: 15, fontWeight: '500' },
    rowStat: { flex: 1, textAlign: 'center', color: '#AAA', fontSize: 14 },
});
