import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { CloudSyncService } from '../database/CloudSyncService';
import { ErrorLogger } from '../database/ErrorLogger';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

/**
 * Install a global JS error handler that persists every unhandled exception
 * to the local SQLite error_log table via ErrorLogger.
 *
 * React Native's ErrorUtils.setGlobalHandler replaces the default red-screen
 * handler in production. We log the error first, then optionally re-throw
 * (isFatal === true means the JS thread is about to be torn down anyway).
 *
 * This gives us field crash diagnostics without needing Sentry or any
 * external service — errors are readable via ErrorLogger.getRecentErrors().
 */
function installGlobalErrorHandler() {
    const globalErrorUtils = (global as any).ErrorUtils;
    if (!globalErrorUtils) return;

    const existingHandler = globalErrorUtils.getGlobalHandler();

    globalErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        const source = isFatal ? 'FATAL_JS_ERROR' : 'UNHANDLED_JS_ERROR';
        // Fire-and-forget — must not block or throw
        ErrorLogger.logError(source, error).catch(() => {});
        console.error(`[GlobalErrorHandler] ${source}:`, error?.message, error?.stack);

        // Delegate to the previous handler so existing behaviour is preserved
        if (existingHandler) {
            existingHandler(error, isFatal);
        }
    });
}

export default function RootLayout() {
    const colorScheme = useColorScheme();

    useEffect(() => {
        // Install global JS crash handler (before any other async work)
        installGlobalErrorHandler();

        // Hide splash screen
        SplashScreen.hideAsync();

        // Perform initial cloud sync (restores data if local DB is empty)
        CloudSyncService.initialSync().catch(err => {
            console.error('Initial sync failed:', err);
            ErrorLogger.logError('initialSync', err);
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
