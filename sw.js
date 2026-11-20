/* Khabar Ghor – service worker
 * 1) Speed: app shell + Firebase SDK cached, so repeat opens are almost instant
 * 2) Offline: friendly offline page
 * 3) FCM: background push notifications
 *
 * Bump VERSION when you change this file's caching rules or the precache list.
 * (Normal HTML / CSS / JS edits do NOT need a bump – they refresh in the background.)
 */
const VERSION = 'kg-v1';
const SHELL = `${VERSION}-shell`;
const SDK = `${VERSION}-sdk`;

const PRECACHE = [
  'offline.html',
  'manifest.json',
  'assets/logo/logo.svg',
  'assets/icons/icon-192.png',
  'css/style.css',
  'css/components.css',
  'css/responsive.css'
];

/* ---------- Firebase Cloud Messaging (background) ---------- */
try {
  importScripts(
    'https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js'
  );
  firebase.initializeApp({
    apiKey: 'AIzaSyDWNETnTYWlkIJShZ3CzBQUhRU4PsTUJDA',
    authDomain: 'khabarghor-bd.firebaseapp.com',
    projectId: 'khabarghor-bd',
    storageBucket: 'khabarghor-bd.firebasestorage.app',
    messagingSenderId: '243370074435',
    appId: '1:243370074435:web:60dfdd09545679120f0ff6'
  });
  const messaging = firebase.messaging();
  // Our Cloud Function sends data-only messages, so we show the notification ourselves.
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return; // the browser already shows it
    const d = payload.data || {};
    return self.registration.showNotification(d.title || 'Khabar Ghor', {
      body: d.body || '',
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/badge-96.png',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      vibrate: [120, 60, 120],
      data: { url: d.url || 'index.html' }
    });
  });
} catch (e) {
  // Offline while installing, etc. Caching still works; push resumes on the next SW update.
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || 'index.html', self.registration.scope).href;
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
        try { await c.navigate(target); } catch (e) { /* ignore */ }
        return c.focus();
      }
    }
    return clients.openWindow(target);
  })());
});

/* ---------- Install / activate ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* ---------- Fetch strategies ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase SDK files are versioned URLs -> cache first
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(cacheFirst(req, SDK));
    return;
  }

  // Everything else cross-origin (Firestore, Auth, images, fonts, ImgBB...) -> browser handles it
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  // Pages: network first (always fresh), fall back to cache, then offline page
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstPage(req));
    return;
  }

  // CSS / JS / icons / manifest: instant from cache, refresh in the background
  event.respondWith(staleWhileRevalidate(req));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

async function networkFirstPage(req) {
  const cache = await caches.open(SHELL);
  const net = fetch(req);
  try {
    const res = await Promise.race([
      net,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
    ]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    // Slow or offline: show the cached page right away if we have one
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // Nothing cached (first visit): keep waiting for the network, offline page only if it really fails
    try { return await net; } catch (err) { return (await cache.match('offline.html')) || Response.error(); }
  }
}
