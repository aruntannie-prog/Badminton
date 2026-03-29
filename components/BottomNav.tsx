import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname, useGlobalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KVStore } from '../database/KVStore';

export function BottomNav() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useGlobalSearchParams();
    const currentTab = params.tab;
    const insets = useSafeAreaInsets();
    const [hasActiveMatch, setHasActiveMatch] = useState(false);

    useEffect(() => {
        KVStore.getItem('active_match_setup').then(val => setHasActiveMatch(!!val));
    }, [pathname]); // re-check whenever screen changes

    const tabs = [
        { name: 'Home', icon: 'home-outline', activeIcon: 'home', path: '/' },
        { name: 'History', icon: 'file-tray-full-outline', activeIcon: 'file-tray-full', path: '/stats?tab=history' },
        { name: 'Stats', icon: 'stats-chart-outline', activeIcon: 'stats-chart', path: '/stats?tab=leaderboard' },
    ];

    return (
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom + 10, 25) }]}>
            {tabs.map((tab) => {
                let isActive = false;
                if (tab.path === '/') {
                    isActive = pathname === '/';
                } else if (tab.name === 'History') {
                    isActive = pathname === '/stats' && currentTab === 'history';
                } else if (tab.name === 'Stats') {
                    // Active for dashboard, leaderboard, pairs, or undefined (default)
                    isActive = pathname === '/stats' && currentTab !== 'history';
                }

                const handlePress = async () => {
                    if (tab.path === '/') {
                        // If a match is in progress, go back to it instead of home
                        const activeMatch = await KVStore.getItem('active_match_setup');
                        if (activeMatch) {
                            router.push('/match');
                        } else {
                            router.push('/');
                        }
                        return;
                    }
                    const from = pathname === '/' ? 'home' : (pathname === '/match' ? 'match' : '');
                    let targetPath = tab.path;
                    if (tab.path.includes('/stats')) {
                        const connector = tab.path.includes('?') ? '&' : '?';
                        targetPath = `${tab.path}${connector}from=${from}`;
                    }
                    router.push(targetPath as any);
                };

                return (
                    <TouchableOpacity
                        key={tab.name}
                        style={styles.tab}
                        onPress={handlePress}
                    >
                        <Ionicons
                            name={(isActive ? tab.activeIcon : tab.icon) as any}
                            size={24}
                            color={isActive ? '#76FF03' : '#666'}
                        />
                        <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                            {tab.name}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        backgroundColor: '#0A0A0A',
        paddingVertical: 12,
        // paddingBottom handled via inline style with safe area
        borderTopWidth: 1,
        borderTopColor: '#1A1A1A',
        justifyContent: 'space-around',
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    tab: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabText: {
        fontSize: 10,
        color: '#666',
        marginTop: 4,
        fontWeight: '500',
    },
    activeTabText: {
        color: '#76FF03',
        fontWeight: 'bold',
    },
});
