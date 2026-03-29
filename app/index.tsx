import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KVStore } from '../database/KVStore';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomNav } from '../components/BottomNav';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
    const router = useRouter();
    const [selectedCount, setSelectedCount] = useState<number | null>(null);
    const [hasActiveMatch, setHasActiveMatch] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const count = await KVStore.getItem('player_count');
        if (count) setSelectedCount(parseInt(count));
        const activeMatch = await KVStore.getItem('active_match_setup');
        setHasActiveMatch(!!activeMatch);
    };

    const handleSelectCount = async (count: number) => {
        setSelectedCount(count);
        await KVStore.setItem('player_count', count.toString());
    };

    const handleStartMatch = () => {
        if (selectedCount) {
            router.push('/select-players');
        }
    };

    const renderPlayerOption = (count: number) => {
        const isActive = selectedCount === count;
        return (
            <TouchableOpacity
                key={count}
                onPress={() => handleSelectCount(count)}
                style={[styles.playerTab, isActive && styles.activePlayerTab]}
            >
                <Text style={[styles.playerTabText, isActive && styles.activePlayerTabText]}>{count}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Background Image/Gradient */}
            <Image
                source={require('../assets/images/background_blue_gold.jpg')}
                style={styles.backgroundImage}
                resizeMode="cover"
            />
            <LinearGradient
                colors={['rgba(0,10,25,0.95)', 'rgba(0,12,30,0.88)', 'rgba(0,0,5,0.98)']}
                locations={[0, 0.4, 1]}
                style={styles.backgroundOverlay}
            />

            <SafeAreaView style={styles.safeArea}>
                <View style={styles.scrollContent}>
                    {/* Header Section */}
                    <View style={styles.headerContainer}>
                        <View style={styles.logoRow}>
                            <MaterialCommunityIcons name="badminton" size={54} color="#76FF03" style={styles.logoIcon} />
                            <View>
                                <Text style={styles.logoTitleText}>BADMINTON</Text>
                                <Text style={styles.logoTitleSub}>SCORECARD</Text>
                            </View>
                        </View>
                    </View>

                    {/* Selector Section */}
                    <View style={styles.pickerSection}>
                        <View style={styles.pickerLabelRow}>
                            <View style={styles.selectorGlow} />
                            <Text style={styles.pickerTitle}>Select Players:</Text>
                            <View style={styles.pickerContainer}>
                                {[4, 5, 6, 7, 8].map(renderPlayerOption)}
                            </View>
                        </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.mainBtnGroup}>
                        {/* Resume Match button — only shown when a match is active */}
                        {hasActiveMatch && (
                            <TouchableOpacity
                                onPress={() => router.push('/match')}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={['#29B6F6', '#0277BD']}
                                    style={styles.actionBtn}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                >
                                    <Text style={styles.actionBtnText}>▶ Resume Match</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            onPress={handleStartMatch}
                            disabled={!selectedCount}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={selectedCount ? ['#76FF03', '#388E3C'] : ['#222', '#111']}
                                style={styles.actionBtn}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            >
                                <Text style={[styles.actionBtnText, !selectedCount && { color: '#444' }]}>
                                    {hasActiveMatch ? 'New Match' : 'Start Match'}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.historyBtn}
                            onPress={() => router.push('/stats?tab=history&from=home')}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={['#2A2A2A', '#1A1A1A']}
                                style={styles.secondaryBtnInner}
                            >
                                <Text style={styles.secondaryBtnText}>Match History</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.historyBtn}
                            onPress={() => router.push('/stats?tab=leaderboard&from=home')}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={['#2A2A2A', '#1A1A1A']}
                                style={styles.secondaryBtnInner}
                            >
                                <Text style={styles.secondaryBtnText}>Player Stats</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>

                    {/* Bottom visual decoration */}
                    <View style={styles.bottomDecoration}>
                        <Image source={require('../assets/images/background.jpg')} style={styles.decorationImage} blurRadius={2} />
                        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)', '#000']} style={styles.decorationDrip} />
                    </View>
                </View>
            </SafeAreaView>

            <BottomNav />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    backgroundImage: {
        ...StyleSheet.absoluteFillObject,
        width: Dimensions.get('screen').width,
        height: Dimensions.get('screen').height,
    },
    backgroundOverlay: {
        ...StyleSheet.absoluteFillObject,
        width: Dimensions.get('screen').width,
        height: Dimensions.get('screen').height,
    },
    safeArea: { flex: 1 },
    scrollContent: { flex: 1, paddingHorizontal: 25 },

    headerContainer: { marginTop: 50, marginBottom: 40 },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 15 },
    logoIcon: { opacity: 0.9 },
    logoTitleText: { color: 'white', fontSize: 32, fontWeight: '900', letterSpacing: 1.5 },
    logoTitleSub: { color: 'white', fontSize: 32, fontWeight: '300', letterSpacing: 4, marginTop: -8 },

    pickerSection: { marginBottom: 30 },
    pickerLabelRow: { flexDirection: 'row', alignItems: 'center' },
    selectorGlow: { width: 15, height: 15, borderRadius: 5, backgroundColor: '#388E3C', marginRight: 10, shadowColor: '#76FF03', shadowRadius: 10, shadowOpacity: 0.8 },
    pickerTitle: { color: 'white', fontSize: 18, fontWeight: '700', marginRight: 15 },
    pickerContainer: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 5, gap: 5 },
    playerTab: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
    activePlayerTab: { backgroundColor: '#333', borderWidth: 1, borderColor: '#444' },
    playerTabText: { color: '#666', fontSize: 16, fontWeight: 'bold' },
    activePlayerTabText: { color: 'white' },

    mainBtnGroup: { gap: 20 },
    actionBtn: { paddingVertical: 18, borderRadius: 15, alignItems: 'center', justifyContent: 'center', shadowColor: '#76FF03', shadowRadius: 15, shadowOpacity: 0.4, elevation: 10 },
    actionBtnText: { color: 'white', fontSize: 20, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },

    historyBtn: { borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
    secondaryBtnInner: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
    secondaryBtnText: { color: '#AAA', fontSize: 18, fontWeight: 'bold', letterSpacing: 0.5 },

    bottomDecoration: {
        position: 'absolute',
        bottom: 80,
        left: -25,
        right: -25,
        height: 200,
        zIndex: -1,
        opacity: 0.5
    },
    decorationImage: { width: '100%', height: '100%' },
    decorationDrip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});


