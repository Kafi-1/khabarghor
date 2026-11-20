/**
 * Khabar Ghor - Authentication
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import { auth } from './firebase-config.js';
import { createUserProfile, getUserProfile } from './firestore.js';
import { showToast } from './ui.js';

let currentUser = null;
let authReady = false;
const authListeners = [];

export function onAuthReady(callback) {
  if (authReady) {
    callback(currentUser);
  } else {
    authListeners.push(callback);
  }
}

export function getCurrentUser() {
  return currentUser;
}

export function isLoggedIn() {
  return !!currentUser;
}

// One-shot message shown after a redirect/reload (e.g. "wrong panel account, signed out").
export function flash(msg) {
  try { sessionStorage.setItem('kg_flash', msg); } catch { /* ignore */ }
}
export function takeFlash() {
  try {
    const m = sessionStorage.getItem('kg_flash');
    sessionStorage.removeItem('kg_flash');
    return m;
  } catch { return null; }
}

// Initialize auth state listener
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  authReady = true;

  if (user) {
    try {
      const profile = await getUserProfile(user.uid);
      // Suspended accounts must not continue using customer/shop/rider pages.
      if (profile?.disabled === true) {
        await signOut(auth);
        showToast('This account is suspended. Contact support.', 'error');
        return;
      }
      // Ensure profile exists
      if (!profile) {
        await createUserProfile(user.uid, {
          name: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email || '',
          phone: user.phoneNumber || '',
          photoURL: user.photoURL || ''
        });
      }
    } catch (e) {
      console.warn('Profile/account check failed:', e);
    }
  }

  authListeners.forEach(cb => cb(user));
  authListeners.length = 0;

  // Update UI elements that depend on auth
  document.querySelectorAll('[data-auth-required]').forEach(el => {
    el.style.display = user ? '' : 'none';
  });
  document.querySelectorAll('[data-guest-only]').forEach(el => {
    el.style.display = user ? 'none' : '';
  });
});

export async function register(email, password, name) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) {
      await updateProfile(cred.user, { displayName: name });
    }
    await createUserProfile(cred.user.uid, {
      name: name || email.split('@')[0],
      email,
      phone: '',
      photoURL: ''
    });
    showToast('Registration successful! Welcome 🎉', 'success');
    return cred.user;
  } catch (error) {
    const msg = getAuthErrorMessage(error.code);
    showToast(msg, 'error');
    throw error;
  }
}

export async function login(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    showToast('Login successful!', 'success');
    return cred.user;
  } catch (error) {
    const msg = getAuthErrorMessage(error.code);
    showToast(msg, 'error');
    throw error;
  }
}

export async function loginWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const profile = await getUserProfile(cred.user.uid);
    if (!profile) {
      await createUserProfile(cred.user.uid, {
        name: cred.user.displayName || 'User',
        email: cred.user.email || '',
        phone: '',
        photoURL: cred.user.photoURL || ''
      });
    }
    showToast('Google login successful!', 'success');
    return cred.user;
  } catch (error) {
    if (error.code !== 'auth/popup-closed-by-user') {
      showToast(getAuthErrorMessage(error.code), 'error');
    }
    throw error;
  }
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    showToast('Reset link sent. Check your email (and spam folder).', 'success', 5000);
  } catch (error) {
    // Do not reveal whether an email is registered
    if (error.code === 'auth/invalid-email') showToast('Enter a valid email address', 'error');
    else if (error.code === 'auth/network-request-failed') showToast('Internet connection problem', 'error');
    else showToast('Reset link sent if this email is registered.', 'info', 5000);
  }
}

export async function logout(redirect = null) {
  try {
    // stop order alerts for this account on this phone
    try { (await import('./messaging.js')).unlinkPush(); } catch { /* optional */ }
    await signOut(auth);
    showToast('You have logged out', 'info');
    // Panels pass no target so they stay on their own login; the customer app passes 'login.html'.
    if (redirect) window.location.href = redirect;
    else window.location.reload();
  } catch (error) {
    showToast('Logout failed', 'error');
    throw error;
  }
}

function getAuthErrorMessage(code) {
  const messages = {
    'auth/email-already-in-use': 'Email already registered',
    'auth/invalid-email': 'Invalid email',
    'auth/weak-password': 'Password must be at least 6 characters',
    'auth/user-not-found': 'Wrong email or password',
    'auth/wrong-password': 'Wrong email or password',
    'auth/invalid-credential': 'Wrong email or password',
    'auth/too-many-requests': 'Too many attempts. Try later',
    'auth/network-request-failed': 'Internet connection problem',
    'auth/popup-closed-by-user': 'Login cancelled',
    'auth/unauthorized-domain': 'This website is not allowed for Google login yet. Tell the admin.'
  };
  return messages[code] || 'Something went wrong. Try again.';
}

// Require auth helper - redirects to login if not logged in
export function requireAuth(redirectUrl = 'index.html') {
  return new Promise((resolve) => {
    onAuthReady((user) => {
      if (!user) {
        showToast('Please login first', 'info');
        // Store intended destination
        sessionStorage.setItem('auth_redirect', window.location.href);
        window.location.href = 'login.html';
        resolve(null);
      } else {
        resolve(user);
      }
    });
  });
}
