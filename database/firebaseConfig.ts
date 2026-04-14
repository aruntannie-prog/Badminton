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

// Helper to ensure user is authenticated anonymously
export const ensureAuthenticated = async () => {
  if (!auth.currentUser) {
    try {
      const userCredential = await signInAnonymously(auth);
      console.log("Authenticated anonymously as:", userCredential.user.uid);
    } catch (error) {
      console.error("Authentication error:", error);
    }
  }
  return auth.currentUser;
};
