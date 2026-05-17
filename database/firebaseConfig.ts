import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAwTHy3IzlfRcxF8xFYiXN1kdNK_iq20q8",
    authDomain: "badmintonsmartscore.firebaseapp.com",
    projectId: "badmintonsmartscore",
    storageBucket: "badmintonsmartscore.firebasestorage.app",
    messagingSenderId: "433615711937",
    appId: "1:433615711937:web:65e7c0f9fa13aa7947ae40",
    measurementId: "G-1KLQEBWXV6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

/**
 * Token refresh guard.
 *
 * Firebase anonymous auth tokens expire after ~1 hour. If the app stays open
 * for a long session without a fresh Firestore call, the next sync attempt
 * silently fails with a permission/token error.
 *
 * Fix: track the last time we validated the token. If it's been more than
 * 30 minutes, call getIdToken(true) to force a silent server-side refresh
 * before the token actually expires. This costs one network round-trip at
 * most once every 30 minutes — negligible compared to the Firestore writes.
 *
 * If force-refresh itself fails (e.g. network is down), we attempt a fresh
 * anonymous sign-in as a fallback.
 */
const TOKEN_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
let lastTokenRefreshAt = 0;

export const ensureAuthenticated = async () => {
    const now = Date.now();

    if (!auth.currentUser) {
        // No session at all — sign in fresh
        try {
            const userCredential = await signInAnonymously(auth);
            lastTokenRefreshAt = now;
            console.log("Authenticated anonymously as:", userCredential.user.uid);
        } catch (error) {
            console.error("Authentication error:", error);
        }
    } else if (now - lastTokenRefreshAt > TOKEN_REFRESH_INTERVAL_MS) {
        // Session exists but the token may be stale — force-refresh proactively
        try {
            await auth.currentUser.getIdToken(/* forceRefresh */ true);
            lastTokenRefreshAt = now;
            console.log("Firebase token refreshed successfully.");
        } catch (refreshError) {
            console.warn("Token force-refresh failed — attempting re-auth:", refreshError);
            // Fallback: sign in again anonymously (gets a new token)
            try {
                await signInAnonymously(auth);
                lastTokenRefreshAt = now;
            } catch (reAuthError) {
                console.error("Re-authentication also failed:", reAuthError);
                // Sync ops will fail; withRetry in CloudSyncService will handle retries
            }
        }
    }

    return auth.currentUser;
};
