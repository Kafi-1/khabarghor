/**
 * Khabar Ghor - Push notifications (Firebase Cloud Messaging)
 * Loaded on demand by pwa.js / profile.js. The device token is saved in Firestore
 * (fcm_tokens/{token}) so the Cloud Function in /functions can send order alerts.
 */
import { getMessaging, getToken, onMessage, isSupported }
  from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging.js';
import { doc, setDoc, deleteDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js';
import { app, db, VAPID_KEY } from './firebase-config.js';

const TOKEN_KEY = 'kg_fcm_token';
let listening = false;

export function pushConfigured() {
  return !!VAPID_KEY && !VAPID_KEY.startsWith('PASTE');
}

export async function pushSupported() {
  try {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && await isSupported();
  } catch { return false; }
}

export function pushPermission() {
  return 'Notification' in window ? Notification.permission : 'denied';
}

/** Ask permission (must be called from a tap), then link this device to the user. */
export async function enablePush(user) {
  if (!pushConfigured()) return { ok: false, reason: 'not-configured' };
  if (!(await pushSupported())) return { ok: false, reason: 'unsupported' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };
  return syncToken(user);
}

/** Get (or refresh) the FCM token and save it for this user. No prompt if permission is already granted. */
export async function syncToken(user, { write = true } = {}) {
  try {
    if (!user || !pushConfigured() || pushPermission() !== 'granted' || !(await pushSupported())) {
      return { ok: false, reason: 'unavailable' };
    }
    const reg = await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return { ok: false, reason: 'no-token' };

    if (write) {
      await setDoc(doc(db, 'fcm_tokens', token), {
        uid: user.uid,
        platform: /android/i.test(navigator.userAgent) ? 'android' : /iphone|ipad/i.test(navigator.userAgent) ? 'ios' : 'web',
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    localStorage.setItem(TOKEN_KEY, token);

    if (!listening) {
      listening = true;
      // App is open: show an in-app toast + add to the notification list
      onMessage(messaging, async (payload) => {
        const d = payload.data || {};
        try {
          const [{ showToast }, { pushNotif }] = await Promise.all([import('./ui.js'), import('./notifications.js')]);
          pushNotif(d.title || 'Khabar Ghor', d.body || '', d.type || 'info');
          showToast(`${d.title || 'Khabar Ghor'}${d.body ? ' – ' + d.body : ''}`, 'info', 5000);
        } catch { /* ignore */ }
      });
    }
    return { ok: true, token };
  } catch (e) {
    console.warn('Push setup failed:', e);
    return { ok: false, reason: 'error' };
  }
}

/** Call before logout so the next person on this phone does not get your alerts. */
export async function unlinkPush() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await deleteDoc(doc(db, 'fcm_tokens', token));
    localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}
