/**
 * Khabar Ghor - Firebase Configuration
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional.
const firebaseConfig = {
  apiKey: "AIzaSyDWNETnTYWlkIJShZ3CzBQUhRU4PsTUJDA",
  authDomain: "khabarghor-bd.firebaseapp.com",
  databaseURL: "https://khabarghor-bd-default-rtdb.firebaseio.com",
  projectId: "khabarghor-bd",
  storageBucket: "khabarghor-bd.firebasestorage.app",
  messagingSenderId: "243370074435",
  appId: "1:243370074435:web:60dfdd09545679120f0ff6",
  measurementId: "G-953FD62Z3X"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith('YOUR_');

// Admin emails — must match firestore.rules
export const ADMIN_EMAILS = ['admin@gmail.com'];

// WhatsApp support number (country code + number, no + or spaces)
// Change this to your real number, e.g. '88017XXXXXXXX'
export const SUPPORT_WHATSAPP = '8801700000000';

export { app, auth, db };
