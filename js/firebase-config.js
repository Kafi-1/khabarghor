/**
 * Khabar Ghor - Firebase Configuration
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2n12GsRN3l5AS6FGFGq6S5DGyzlAmUZA",
  authDomain: "khabarghor2.firebaseapp.com",
  projectId: "khabarghor2",
  storageBucket: "khabarghor2.firebasestorage.app",
  messagingSenderId: "874555138235",
  appId: "1:874555138235:web:4ca363b71ddd77e53f899e",
  measurementId: "G-L7LR4G84SC"
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
