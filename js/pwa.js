/**
 * Khabar Ghor - PWA helper (loaded on every page)
 * - registers the service worker (fast repeat loads, offline page, push)
 * - "Install app" banner (Android/Chrome) + iPhone hint
 * - "Turn on order alerts" banner (push notifications)
 */
const page = location.pathname.split('/').pop() || 'index.html';
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

/* ---------- Service worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
  });
}

/* ---------- Small dismissible banner ---------- */
function dismissed(key, days) {
  try { return Date.now() - Number(localStorage.getItem(key) || 0) < days * 86400000; } catch { return false; }
}
function remember(key) { try { localStorage.setItem(key, String(Date.now())); } catch { /* ignore */ } }

function showBanner({ icon, text, action, onAction, key, days }) {
  if (document.getElementById('kg-banner')) return;
  const el = document.createElement('div');
  el.id = 'kg-banner';
  el.className = 'kg-banner';
  el.innerHTML = `
    <span class="kg-banner-icon">${icon}</span>
    <span class="kg-banner-text"></span>
    ${action ? '<button type="button" class="kg-banner-btn"></button>' : ''}
    <button type="button" class="kg-banner-x" aria-label="Dismiss">×</button>`;
  el.querySelector('.kg-banner-text').textContent = text;
  const close = () => { el.classList.add('kg-banner-out'); setTimeout(() => el.remove(), 250); };
  el.querySelector('.kg-banner-x').onclick = () => { remember(key); close(); };
  if (action) {
    const btn = el.querySelector('.kg-banner-btn');
    btn.textContent = action;
    btn.onclick = async () => { remember(key); close(); await onAction(); };
  }
  document.body.appendChild(el);
}

/* ---------- Install (Android / Chrome) ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (page === 'index.html' || page === '') maybeInstallBanner();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  document.getElementById('kg-banner')?.remove();
  // Next time the installed app opens, ask for notification permission.
  try { localStorage.setItem('kg_ask_push_after_install', '1'); } catch { /* ignore */ }
});

async function installApp() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

function maybeInstallBanner() {
  if (isStandalone() || dismissed('kg_install_dismissed', 7) || !deferredPrompt) return;
  // wait until the loading splash is gone
  setTimeout(() => showBanner({
    icon: '📲', text: 'Install Khabar Ghor on your phone', action: 'Install',
    onAction: installApp, key: 'kg_install_dismissed'
  }), 2500);
}

function maybeIosHint() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!ios || isStandalone() || dismissed('kg_ios_dismissed', 14)) return;
  setTimeout(() => showBanner({
    icon: '📲', text: 'Install: tap Share, then "Add to Home Screen"', key: 'kg_ios_dismissed'
  }), 3000);
}
if (page === 'index.html' || page === '') maybeIosHint();

// profile.js uses this for the "Install app" menu item
window.kgPWA = {
  isStandalone,
  canInstall: () => !!deferredPrompt,
  install: installApp
};

/* ---------- Push notifications ---------- */
const NO_PUSH_PAGES = ['login.html', 'checkout.html', 'cart.html'];

async function setupPush() {
  if (NO_PUSH_PAGES.includes(page)) return;
  try {
    const msg = await import('./messaging.js');
    if (!msg.pushConfigured() || !(await msg.pushSupported())) return;
    const { onAuthReady } = await import('./auth.js');
    const user = await new Promise((r) => onAuthReady(r));
    if (!user) return;

    const perm = msg.pushPermission();
    if (perm === 'granted') {
      // Re-link the device token whenever the logged-in account changes,
      // otherwise the phone keeps receiving the previous account's alerts.
      let syncedUid = null;
      try { syncedUid = localStorage.getItem('kg_fcm_uid'); } catch { /* ignore */ }
      if (syncedUid !== user.uid || !dismissed('kg_fcm_synced', 1)) {
        const r = await msg.syncToken(user);
        if (r.ok) {
          try { localStorage.setItem('kg_fcm_uid', user.uid); } catch { /* ignore */ }
          remember('kg_fcm_synced');
        }
      } else {
        msg.syncToken(user, { write: false }); // just start the foreground listener
      }
      return;
    }
    if (perm === 'default') {
      // Right after installing the app: ask for notification permission on this first open.
      let justInstalled = false;
      try {
        justInstalled = localStorage.getItem('kg_ask_push_after_install') === '1';
        if (justInstalled) localStorage.removeItem('kg_ask_push_after_install');
      } catch { /* ignore */ }
      if (justInstalled || !dismissed('kg_push_dismissed', 3)) {
        setTimeout(() => {
          if (document.getElementById('kg-banner')) return;
          showBanner({
            icon: '🔔', text: 'Turn on order alerts to get instant updates', action: 'Turn on',
            key: 'kg_push_dismissed',
            onAction: async () => {
              const r = await msg.enablePush(user);
              const { showToast } = await import('./ui.js');
              if (r.ok) showToast('Order alerts are on 🔔', 'success');
              else if (r.reason === 'denied') showToast('Notifications are blocked. Allow them in your browser settings.', 'error', 5000);
              else showToast('Could not turn on alerts on this device', 'error');
            }
          });
        }, justInstalled ? 400 : 3500);
      }
    }
  } catch (e) { /* push is optional */ }
}

if ('requestIdleCallback' in window) requestIdleCallback(() => setupPush(), { timeout: 4000 });
else setTimeout(setupPush, 1500);
