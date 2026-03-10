import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCSfBcYpTKfuTzKO_56JBtyBgQqXiggvM4",
  authDomain: "morganex-60185.firebaseapp.com",
  projectId: "morganex-60185",
  storageBucket: "morganex-60185.firebasestorage.app",
  messagingSenderId: "417098187610",
  appId: "1:417098187610:web:9df5e07cc627c4f6212963"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
