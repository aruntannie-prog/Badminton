import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { CloudSyncService } from '../database/CloudSyncService';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Hide splash screen
    SplashScreen.hideAsync();
    
    // Perform initial cloud sync (restores data if local DB is empty)
    CloudSyncService.initialSync().catch(err => {
      console.error("Initial sync failed:", err);
    });
  }, []);

  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="select-players" />
        <Stack.Screen name="match" />
        <Stack.Screen name="stats" />
      </Stack>
    </ThemeProvider>
  );
}
