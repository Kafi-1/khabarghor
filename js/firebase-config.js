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

// WhatsApp support number (country code + number, no + or spaces), e.g. '8801712345678'.
// Leave empty to hide the WhatsApp buttons.
export const SUPPORT_WHATSAPP = '';
export const WHATSAPP_READY = /^8801[3-9]\d{8}$/.test(SUPPORT_WHATSAPP);

// Push notifications (FCM): Firebase Console -> Project settings -> Cloud Messaging
// -> Web Push certificates -> "Generate key pair", then paste the public key here.
// Leave empty to keep push notifications switched off.
export const VAPID_KEY = 'BPLd9Pl8XBMaGCX6jgJRa6aAJcYXfSD8PsLlbTYG7SQM6BjSYmEk8y01EaUELQhJZRYsmbijU5922yhMzYexX70';

export { app, auth, db };
