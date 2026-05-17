import { ActionSheetIOS, Alert, Dimensions, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, Platform, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
// Using legacy API for compatibility as per Expo 54+ changes
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KVStore } from '../database/KVStore';
import { Player, PlayerRepository } from '../database/PlayerRepository';
import { RotationEngine } from '../logic/RotationEngine';
import { BottomNav } from '../components/BottomNav';

export default function SelectPlayersScreen() {
    const router = useRouter();
    const [targetCount, setTargetCount] = useState<number>(4);
    const [players, setPlayers] = useState<Player[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // Modal state
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
    const [playerNameInput, setPlayerNameInput] = useState('');
    const [nameError, setNameError] = useState('');
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    // Tracks whether the avatars storage directory was created successfully.
    // If false, avatar uploads are blocked with a user-facing message.
    const [avatarDirReady, setAvatarDirReady] = useState(true);

    // Ensure avatars directory exists
    useEffect(() => {
        ensureDirExists();
    }, []);

    const ensureDirExists = async () => {
        try {
            const dirInfo = await FileSystem.getInfoAsync(FileSystem.documentDirectory + 'avatars/');
            if (!dirInfo.exists) {
                await FileSystem.makeDirectoryAsync(FileSystem.documentDirectory + 'avatars/', { intermediates: true });
            }
            setAvatarDirReady(true);
        } catch (e) {
            console.error('Error creating avatars dir — avatar uploads will be unavailable:', e);
            setAvatarDirReady(false);
        }
    };

    const pickImage = async () => {
        if (!avatarDirReady) {
            Alert.alert(
                'Storage Unavailable',
                'Unable to create the avatars folder on this device. Avatar uploads are disabled. You can still add players without a photo.',
                [{ text: 'OK' }]
            );
            return;
        }
        Alert.alert('Upload Avatar', 'Choose an option', [
            { text: 'Camera', onPress: launchCamera },
            { text: 'Gallery', onPress: launchGallery },
            { text: 'Cancel', style: 'cancel' }
        ]);
    };

    const launchCamera = async () => {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (permissionResult.granted === false) {
            alert("You've refused to allow this app to access your camera!");
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });
        if (!result.canceled) {
            setAvatarUri(result.assets[0].uri);
        }
    };

    const launchGallery = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });
        if (!result.canceled) {
            setAvatarUri(result.assets[0].uri);
        }
    };

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            const count = await KVStore.getItem('player_count');
            if (count) setTargetCount(parseInt(count, 10));

            const allPlayers = await PlayerRepository.getAllPlayers();
            setPlayers(allPlayers);
        } catch (e) {
            console.error(e);
        }
    };

    const toggleSelection = (id: number) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            if (newSet.size < targetCount) {
                newSet.add(id);
            } else {
                Alert.alert('Limit Reached', `You can only select ${targetCount} players.`);
            }
        }
        setSelectedIds(newSet);
    };

    const handleSavePlayer = async () => {
        if (!playerNameInput.trim()) return;

        // Check for duplicate name
        const isDuplicate = players.some(p =>
            p.name.toLowerCase() === playerNameInput.trim().toLowerCase() &&
            (!editingPlayer || p.id !== editingPlayer.id)
        );
        if (isDuplicate) {
            setNameError('Player name already exists');
            return;
        }

        try {
            let finalAvatarPath = editingPlayer?.avatar;

            // If a new image was selected (uri starts with file:// or content:// from cache)
            if (avatarUri && (!editingPlayer || avatarUri !== editingPlayer.avatar)) {
                const fileName = `avatar_${Date.now()}.jpg`;
                const newPath = FileSystem.documentDirectory + 'avatars/' + fileName;
                await FileSystem.copyAsync({
                    from: avatarUri,
                    to: newPath
                });
                finalAvatarPath = newPath;
            }

            if (editingPlayer) {
                await PlayerRepository.updatePlayer({
                    ...editingPlayer,
                    name: playerNameInput.trim(),
                    avatar: finalAvatarPath
                });
            } else {
                await PlayerRepository.addPlayer(playerNameInput.trim(), finalAvatarPath);
            }
            setPlayerNameInput('');
            setAvatarUri(null);
            setNameError('');
            setEditingPlayer(null);
            setIsModalVisible(false);
            const allPlayers = await PlayerRepository.getAllPlayers();
            setPlayers(allPlayers);
        } catch (e) {
            setNameError('Failed to save player');
        }
    };

    const handleDeletePlayer = async (player: Player) => {
        if (selectedIds.has(player.id)) {
            Alert.alert('Cannot Delete', 'Deselect this player first.');
            return;
        }

        Alert.alert('Delete Player', `Delete ${player.name}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    await PlayerRepository.deletePlayer(player.id);
                    const allPlayers = await PlayerRepository.getAllPlayers();
                    setPlayers(allPlayers);
                }
            }
        ]);
    };

    const openAddModal = () => {
        setEditingPlayer(null);
        setPlayerNameInput('');
        setAvatarUri(null);
        setNameError('');
        setIsModalVisible(true);
    };

    const openEditModal = (player: Player) => {
        setEditingPlayer(player);
        setPlayerNameInput(player.name);
        setAvatarUri(player.avatar || null);
        setIsModalVisible(true);
    };

    const handleStartMatch = async () => {
        if (selectedIds.size !== targetCount) {
            Alert.alert('Hold on', `Please select exactly ${targetCount} players.`);
            return;
        }

        const selectedPlayers = players.filter(p => selectedIds.has(p.id));
        const setup = RotationEngine.initialSetup(selectedPlayers);

        await KVStore.setItem('active_match_setup', JSON.stringify(setup));
        await KVStore.setItem('match_number', '1');

        router.replace('/match');
    };

    const renderItem = ({ item }: { item: Player }) => {
        const isSelected = selectedIds.has(item.id);
        return (
            <TouchableOpacity
                onPress={() => toggleSelection(item.id)}
                onLongPress={() => openEditModal(item)}
                activeOpacity={0.8}
            >
                <LinearGradient
                    colors={isSelected ? ['#1a472a', '#0d2615'] : ['#1E1E1E', '#111']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.playerItem, isSelected && styles.playerItemSelected]}
                >
                    <View style={styles.avatarContainer}>
                        {item.avatar ? (
                            <Image source={{ uri: item.avatar }} style={styles.avatarImage} />
                        ) : (
                            <LinearGradient colors={['#333', '#111']} style={styles.avatar}>
                                <Text style={styles.avatarText}>{item.name.substring(0, 1).toUpperCase()}</Text>
                            </LinearGradient>
                        )}
                    </View>

                    <Text style={[styles.playerText, isSelected && styles.playerTextSelected]}>
                        {item.name}
                    </Text>

                    <View style={styles.checkboxContainer}>
                        {isSelected ? (
                            <Ionicons name="checkmark-circle" size={24} color="#76FF03" />
                        ) : (
                            <Ionicons name="ellipse-outline" size={24} color="#333" />
                        )}
                    </View>
                </LinearGradient>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <Image
                source={require('../assets/images/background.jpg')}
                style={styles.backgroundImage}
                resizeMode="cover"
            />
            <LinearGradient
                colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.95)']}
                style={styles.backgroundOverlay}
            />

            <SafeAreaView style={styles.rootContent}>
                <View style={styles.topHeader}>
                    <TouchableOpacity onPress={() => router.replace('/')} style={styles.iconBtn}>
                        <Ionicons name="chevron-back" size={28} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Add / Select Players</Text>
                    <View style={{ width: 40 }} />
                </View>

                <FlatList
                    data={players}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={styles.listContent}
                    ListFooterComponent={
                        <TouchableOpacity style={styles.addPlayerRow} onPress={openAddModal} activeOpacity={0.8}>
                            <View style={styles.addBtnIcon}>
                                <Ionicons name="add" size={24} color="#FFF" />
                            </View>
                            <Text style={styles.addPlayerRowText}>Add Player</Text>
                        </TouchableOpacity>
                    }
                    ListEmptyComponent={
                        <TouchableOpacity style={styles.emptyState} onPress={openAddModal}>
                            <Ionicons name="people-outline" size={60} color="#222" />
                            <Text style={styles.emptyText}>Tap + to add players</Text>
                        </TouchableOpacity>
                    }
                />

                <View style={styles.footerContainer}>
                    <TouchableOpacity
                        disabled={selectedIds.size !== targetCount}
                        onPress={handleStartMatch}
                        style={[styles.startButton, selectedIds.size !== targetCount && styles.startButtonDisabled]}
                    >
                        <LinearGradient
                            colors={selectedIds.size === targetCount ? ['#76FF03', '#388E3C'] : ['#222', '#111']}
                            style={styles.gradientBtn}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        >
                            <Text style={[styles.startButtonText, selectedIds.size !== targetCount && { color: '#444' }]}>
                                Start Match
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            <BottomNav />
            {/* Add/Edit Modal */}
            <Modal visible={isModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{editingPlayer ? 'Edit Player' : 'Add New Player'}</Text>

                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                            <TouchableOpacity onPress={pickImage} style={styles.avatarPicker}>
                                {avatarUri ? (
                                    <Image source={{ uri: avatarUri }} style={styles.avatarPreview} />
                                ) : (
                                    <View style={styles.avatarPlaceholder}>
                                        <Ionicons name="camera" size={30} color="#666" />
                                    </View>
                                )}
                                <View style={styles.editBadge}>
                                    <Ionicons name="pencil" size={12} color="#FFF" />
                                </View>
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={styles.input}
                            value={playerNameInput}
                            onChangeText={(text) => { setPlayerNameInput(text); setNameError(''); }}
                            placeholder="Player Name"
                            placeholderTextColor="#555"
                            autoFocus
                        />
                        {nameError ? <Text style={styles.nameErrorText}>{nameError}</Text> : null}
                        <View style={styles.modalButtons}>
                            <TouchableOpacity onPress={() => setIsModalVisible(false)} style={styles.modalButton}>
                                <Text style={styles.modalButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            {editingPlayer && (
                                <TouchableOpacity onPress={() => { setIsModalVisible(false); handleDeletePlayer(editingPlayer); }} style={styles.modalButton}>
                                    <Text style={[styles.modalButtonText, { color: '#ef5350' }]}>Delete</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={handleSavePlayer} style={[styles.modalButton, styles.saveButton]}>
                                <Text style={styles.saveButtonText}>{editingPlayer ? 'Update' : 'Add'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

        </View >
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
    rootContent: { flex: 1 },

    topHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    headerTitle: { color: 'white', fontSize: 22, fontWeight: 'bold', flex: 1, textAlign: 'center' },
    iconBtn: { padding: 10 },

    listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 180 },
    playerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        backgroundColor: '#1E1E1E',
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#2A2A2A',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    playerItemSelected: { borderColor: 'rgba(118, 255, 3, 0.4)', backgroundColor: '#1A1A1A' },
    avatarContainer: { marginRight: 20 },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#333' },
    avatarImage: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#333' },
    avatarText: { color: '#AAA', fontWeight: 'bold', fontSize: 18 },
    playerText: { fontSize: 18, color: '#DDD', flex: 1 },
    playerTextSelected: { color: 'white', fontWeight: 'bold' },
    checkboxContainer: { marginLeft: 10 },

    addPlayerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        backgroundColor: '#1A1A1A',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#222',
        marginBottom: 10
    },
    addBtnIcon: {
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 20
    },
    addPlayerRowText: { color: '#AAA', fontSize: 18, fontWeight: '500' },

    footerContainer: { paddingHorizontal: 20, paddingBottom: 80 },
    selectionPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A1A',
        borderRadius: 12,
        padding: 15,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#222',
    },
    previewAvatarWrap: { marginRight: 15 },
    previewAvatar: { width: 40, height: 40, borderRadius: 20 },
    previewText: { color: '#EEE', fontSize: 18, fontWeight: '500' },

    startButton: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    startButtonDisabled: { opacity: 0.6 },
    gradientBtn: { paddingVertical: 18, alignItems: 'center' },
    startButtonText: { color: '#FFF', fontSize: 18, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },

    emptyState: { alignItems: 'center', marginTop: 100 },
    emptyText: { color: '#333', fontSize: 16, marginTop: 15 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#1E1E1E', padding: 25, borderRadius: 20, width: '85%', borderWidth: 1, borderColor: '#333' },
    modalTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    input: { backgroundColor: '#111', color: 'white', fontSize: 18, padding: 15, borderRadius: 10, marginBottom: 25, borderWidth: 1, borderColor: '#333' },
    modalButtons: { flexDirection: 'row', gap: 15 },
    modalButton: { flex: 1, paddingVertical: 15, borderRadius: 10, alignItems: 'center', backgroundColor: '#2A2A2A' },
    modalButtonText: { color: '#AAA', fontWeight: 'bold' },
    saveButton: { backgroundColor: '#76FF03' },
    saveButtonText: { color: '#000', fontWeight: 'bold' },
    nameErrorText: { color: '#ef5350', fontSize: 13, marginTop: -15, marginBottom: 15, textAlign: 'center' },

    avatarPicker: { width: 100, height: 100 },
    avatarPreview: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: '#76FF03' },
    avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#444' },
    editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#76FF03', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#1E1E1E' },
});
