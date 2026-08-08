import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, setPersistence, browserSessionPersistence, inMemoryPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCSfBcYpTKfuTzKO_56JBtyBgQqXiggvM4",
  authDomain: "morganex-60185.firebaseapp.com",
  projectId: "morganex-60185",
  storageBucket: "morganex-60185.firebasestorage.app",
  messagingSenderId: "417098187610",
  appId: "1:417098187610:web:9df5e07cc627c4f6212963"
};

const app = initializeApp(firebaseConfig);

// Secondary Firebase app/auth instance.
// IMPORTANT: this is used only when an Administrator creates a new CRM user.
// Creating a user with the primary Auth instance automatically signs the browser
// into the newly created account, which replaces the Administrator session.
// The secondary Auth instance isolates that operation and keeps the Admin logged in.
const secondaryApp =
  getApps().find((firebaseApp) => firebaseApp.name === "SecondaryAuthApp") ||
  initializeApp(firebaseConfig, "SecondaryAuthApp");

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const secondaryAuth = getAuth(secondaryApp);

// Primary CRM login is isolated per browser tab/session.
// Secondary user-creation auth never persists at all.
export const authPersistenceReady = Promise.all([
  setPersistence(auth, browserSessionPersistence),
  setPersistence(secondaryAuth, inMemoryPersistence)
]).catch((error) => {
  console.error("Failed to configure Firebase Auth persistence:", error);
});
