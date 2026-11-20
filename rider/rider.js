/**
 * Khabar Ghor - Rider Panel
 * Riders pick up ready orders and deliver to customers.
 */
import { login, loginWithGoogle, logout, onAuthReady, getCurrentUser, flash, takeFlash } from '../js/auth.js';
import { isFirebaseConfigured } from '../js/firebase-config.js';
import { getUserProfile, getReadyOrders, getOrdersByRider, updateOrderStatus, updateUserProfile, mapsLink, acceptReadyOrder, loadAppConfig } from '../js/firestore.js';
import { escapeHtml as esc, formatCurrency, formatDateTime } from '../js/utils.js';
import { showToast, setupPanelDrawer } from '../js/ui.js';
import { renderNotifList, enableOrderAlerts, clearNotifs, unreadCount, renderPushStatus } from '../js/notifications.js';

const root = document.getElementById('rider-root');
const LAZY = 'loading="lazy" decoding="async" data-lz onload="this.classList.add(\'img-loaded\')" onerror="this.classList.add(\'img-loaded\')"';
const THUMB = (src, emoji = '🍽️') => src
  ? `<img src="${esc(src)}" alt="" ${LAZY}>`
  : `<div class="adm-thumb">${emoji}</div>`;

const TABS = { dashboard: 'Dashboard', available: 'Available', my: 'My deliveries', history: 'History', profile: 'Profile', notifications: 'Notifications' };
const ICONS = { dashboard: '📊', available: '📦', my: '🛵', history: '🕘', profile: '👤', notifications: '🔔' };

let tab = 'dashboard';
let profile = null;

if (!isFirebaseConfigured) {
  root.innerHTML = '<div class="adm-box"><h2>Firebase not set up</h2><p>Paste keys in <code>js/firebase-config.js</code>.</p></div>';
} else {
  onAuthReady(async (user) => {
    const userEl = document.getElementById('rider-user');
    if (userEl) userEl.textContent = user?.email || '';
    if (!user) return showLogin();
    profile = await getUserProfile(user.uid);
    if (!profile || profile.role !== 'rider') {
      // Wrong account for this app: sign out and show this app's own login.
      flash('This account is not a rider account. Please log in with a rider account.');
      return logout();
    }
    showApp();
  });
}

function showLogin() {
  root.innerHTML = `<div class="adm-box" style="max-width:380px;margin:40px auto">
    <h2>Rider login</h2>
    <div class="adm-form">
      <label class="full">Email<input id="r-email" type="email"></label>
      <label class="full">Password<input id="r-pass" type="password"></label>
      <button class="adm-btn primary full" id="r-go">Login</button>
      <button class="adm-btn full" id="r-google" type="button">Continue with Google</button>
    </div></div>`;
  const go = async () => {
    try {
      await login(document.getElementById('r-email').value.trim(), document.getElementById('r-pass').value);
      location.reload();
    } catch (e) { /* toast */ }
  };
  document.getElementById('r-go').onclick = go;
  document.getElementById('r-pass').onkeydown = e => e.key === 'Enter' && go();
  document.getElementById('r-google').onclick = async () => {
    try { await loginWithGoogle(); location.reload(); } catch (e) { /* toast */ }
  };
  const m = takeFlash();
  if (m) showToast(m, 'error', 6000);
}

function installApp() {
  const pwa = window.kgPWA;
  if (pwa?.canInstall?.()) {
    pwa.install().then(ok => showToast(ok ? 'Installing app…' : 'Install cancelled', 'info'));
  } else {
    showToast('Open your browser menu → "Install app" / "Add to Home Screen"', 'info', 5000);
  }
}

async function showApp() {
  setupPanelDrawer({
    items: [
      ...Object.keys(TABS).map(t => ({
        id: t, label: TABS[t], icon: ICONS[t],
        badge: t === 'notifications' && unreadCount() > 0
      })),
      { divider: true },
      { id: 'install', label: 'Install app', icon: '📲', action: installApp },
      { id: 'view', label: 'View site', icon: '🌐', action: () => { location.href = '../index.html'; } },
      { id: 'logout', label: 'Logout', icon: '🚪', danger: true, action: () => logout() }
    ],
    activeId: tab,
    onSelect: (id) => { tab = id; showApp(); }
  });

  root.innerHTML = '<div id="rider-view"></div>';
  try { await loadAppConfig(); } catch (e) { /* default fees */ }
  await load();
}

async function load() {
  const view = document.getElementById('rider-view');
  view.innerHTML = '<p class="adm-note">Loading...</p>';
  try {
    const uid = getCurrentUser().uid;

    if (tab === 'dashboard') {
      const mine = await getOrdersByRider(uid);
      renderRiderDashboard(view, mine);
    } else if (tab === 'available') {
      if (profile?.riderOnline !== true) {
        view.innerHTML = '<div class="adm-box"><h3>You are offline</h3><p>Go online from Dashboard to see and accept available deliveries.</p><button class="adm-btn primary" id="go-online">Go online</button></div>';
        document.getElementById('go-online').onclick = async () => {
          await updateUserProfile(uid, { riderOnline: true });
          profile = { ...profile, riderOnline: true };
          await load();
        };
        return;
      }
      const list = await getReadyOrders();
      renderAvailable(view, list);
    } else if (tab === 'my') {
      const mine = await getOrdersByRider(uid);
      const list = mine.filter(o => ['delivering', 'ready'].includes(o.status));
      renderMy(view, list);
    } else if (tab === 'history') {
      const mine = await getOrdersByRider(uid);
      const list = mine.filter(o => ['completed', 'cancelled'].includes(o.status));
      renderHistory(view, list);
    } else if (tab === 'profile') {
      renderProfile(view);
    } else if (tab === 'notifications') {
      renderNotifications(view);
    }
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="adm-box">Error: ${esc(err.message)}<br>
      Make sure Firestore rules are published and your role is <code>rider</code>.</div>`;
  }
}

async function run(fn, okMsg) {
  try {
    await fn();
    showToast(okMsg, 'success');
    await load();
  } catch (e) {
    console.error(e);
    showToast('Failed: ' + e.message, 'error');
  }
}

function orderBlock(o, actionsHtml = '') {
  const addrText = [o.address?.detail, o.address?.name].filter(Boolean).join(', ');
  const custMap = addrText ? mapsLink(addrText) : null;
  const restMap = o.restaurantAddress ? mapsLink(o.restaurantAddress) : null;
  const itemsHtml = (o.items || []).map(i => `
    <div class="ord-item">
      ${THUMB(i.image)}
      <div class="ord-item-lb">
        <strong>${esc(i.name)}</strong>
        <div class="ord-item-price">${formatCurrency(i.price || 0)} each</div>
      </div>
      <div class="ord-item-price">${esc(String(i.quantity))} ×</div>
    </div>`).join('');
  return `
    <div class="adm-order">
      <div class="ord-head">
        <strong>${esc(o.restaurantName || 'Order')}</strong>
        <span><strong>${formatCurrency(o.total || 0)}</strong> · <span class="adm-badge">${esc(o.status)}</span></span>
      </div>
      <small style="display:block;color:var(--text-muted)">${formatDateTime(o.createdAt)}</small>
      <small style="display:block"><strong>Customer:</strong> ${esc(o.address?.name || '—')} ·
        <a href="tel:${esc(o.address?.phone || '')}">${esc(o.address?.phone || '')}</a>
        ${custMap ? ` · <a href="${custMap}" target="_blank" rel="noopener">📍 Navigate</a>` : ''}
      </small>
      <small style="display:block"><strong>Address:</strong> ${esc(o.address?.detail || '—')}</small>
      ${restMap ? `<small style="display:block"><a href="${restMap}" target="_blank" rel="noopener">🏪 Restaurant map</a></small>` : ''}
      <div class="ord-items">${itemsHtml}</div>
      ${o.paymentMethod === 'cod' ? '<small style="display:block;color:#c62828"><strong>Cash on delivery</strong></small>' : ''}
      ${actionsHtml}
    </div>`;
}

function renderAvailable(view, list) {
  view.innerHTML = `
    <div class="adm-box">
      <h3>Ready for pickup (${list.length})</h3>
      <p class="adm-note" style="text-align:left;padding:0 0 8px">Orders marked <strong>ready</strong> by the shop.</p>
      ${list.map(o => orderBlock(o, `
        <div style="margin-top:10px">
          <button class="adm-btn primary" data-accept="${o.id}">Accept delivery</button>
        </div>`)).join('') || '<p class="adm-note">No ready orders right now.</p>'}
    </div>`;

  view.querySelectorAll('[data-accept]').forEach(b => {
    b.onclick = () => {
      const user = getCurrentUser();
      run(() => acceptReadyOrder(b.dataset.accept, user.uid, {
        name: profile?.name || user.displayName || user.email?.split('@')[0] || 'Rider',
        phone: profile?.phone || ''
      }), 'Delivery accepted');
    };
  });
}

function renderMy(view, list) {
  view.innerHTML = `
    <div class="adm-box">
      <h3>My active deliveries (${list.length})</h3>
      ${list.map(o => orderBlock(o, `
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <a class="adm-btn" href="tel:${esc(o.address?.phone || '')}">📞 Call customer</a>
          <button class="adm-btn primary" data-done="${o.id}">Mark delivered</button>
        </div>`)).join('') || '<p class="adm-note">No active deliveries. Pick one from Available.</p>'}
    </div>`;

  view.querySelectorAll('[data-done]').forEach(b => {
    b.onclick = () => {
      if (!confirm('Confirm order delivered?')) return;
      run(() => updateOrderStatus(b.dataset.done, 'completed'), 'Marked as delivered');
    };
  });
}

function renderHistory(view, list) {
  const completed = list.filter(o => o.status === 'completed');
  const totalEarn = completed.reduce((s, o) => s + (Number(o.riderEarning) || 0), 0);
  view.innerHTML = `
    <div class="adm-box">
      <div class="ord-head" style="margin-bottom:8px">
        <h3 style="margin:0">History (${list.length})</h3>
        <span class="ord-meta">Earnings: <strong>${formatCurrency(totalEarn)}</strong></span>
      </div>
      ${list.slice(0, 50).map(o => orderBlock(o,
        o.status === 'completed' && Number.isFinite(Number(o.riderEarning))
          ? `<div class="ord-meta" style="margin-top:6px;color:#2e7d32"><strong>Your earning: ${formatCurrency(o.riderEarning)}</strong></div>`
          : ''
      )).join('') || '<p class="adm-note">No completed deliveries yet.</p>'}
    </div>`;
}

/* -------- Notifications -------- */
function renderNotifications(view) {
  view.innerHTML = `
    <div class="adm-box">
      <div class="ord-head" style="margin-bottom:8px">
        <h2 style="margin:0">Notifications</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="adm-btn" id="n-notify">🔔 Enable alerts</button>
          <button class="adm-btn" id="n-clear">Clear</button>
        </div>
      </div>
      <div id="n-list"></div>
      <div id="n-push" class="adm-note" style="text-align:left;font-size:.8rem;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light)"></div>
    </div>`;
  renderNotifList(document.getElementById('n-list'));
  renderPushStatus(document.getElementById('n-push'));
  document.getElementById('n-clear').onclick = () => {
    clearNotifs();
    renderNotifList(document.getElementById('n-list'));
    showToast('Notifications cleared', 'info');
  };
  document.getElementById('n-notify').onclick = async () => {
    const r = await enableOrderAlerts(getCurrentUser());
    showToast(
      r.ok ? 'Order alerts are on 🔔'
        : r.reason === 'denied' ? 'Notifications are blocked in browser settings'
        : r.reason === 'unconfigured' ? 'Push is not configured for this app'
        : 'Could not enable alerts on this device',
      r.ok ? 'success' : 'error', 5000
    );
  };
}

function renderRiderDashboard(view, mine) {
  const completed = mine.filter(o => o.status === 'completed');
  const active = mine.filter(o => o.status === 'delivering');
  const earningsKnown = completed.every(o => Number.isFinite(Number(o.riderEarning)));
  const earnings = earningsKnown ? completed.reduce((s, o) => s + Number(o.riderEarning || 0), 0) : null;
  const online = profile?.riderOnline === true;
  view.innerHTML = `
    <div class="adm-box" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <strong>Status:</strong>
        <span class="adm-badge" style="${online ? 'background:#e8f5e9;color:#2e7d32' : ''}">${online ? '🟢 Online' : '⚪ Offline'}</span>
      </div>
      <button class="adm-btn ${online ? 'danger' : 'primary'}" id="rider-toggle">${online ? 'Go Offline' : 'Go Online'}</button>
    </div>
    <div class="dash-grid">
      <div class="dash-card"><div class="dash-val">${completed.length}</div><div class="dash-lbl">Deliveries done</div></div>
      <div class="dash-card"><div class="dash-val">${active.length}</div><div class="dash-lbl">Active now</div></div>
      <div class="dash-card"><div class="dash-val">${earnings === null ? '—' : formatCurrency(earnings)}</div><div class="dash-lbl">${earnings === null ? 'Earnings not configured' : 'Recorded earnings'}</div></div>
      <div class="dash-card"><div class="dash-val">${mine.length}</div><div class="dash-lbl">Total assigned</div></div>
    </div>
    <div class="adm-box">
      <h3>Recent deliveries</h3>
      ${mine.slice(0, 6).map(o => `
        <div class="adm-order">
          <strong>${esc(o.restaurantName || 'Order')}</strong> · ${formatCurrency(o.total || 0)}
          · <span class="adm-badge">${esc(o.status)}</span>
          <small style="display:block;color:var(--text-muted)">${formatDateTime(o.createdAt)}</small>
        </div>`).join('') || '<p class="adm-note">No deliveries yet. Check Available tab.</p>'}
    </div>`;
  document.getElementById('rider-toggle').onclick = async () => {
    const next = !online;
    try {
      await updateUserProfile(getCurrentUser().uid, { riderOnline: next });
      profile = { ...profile, riderOnline: next };
      showToast(next ? 'You are Online' : 'You are Offline', 'success');
      renderRiderDashboard(view, mine);
    } catch (e) {
      showToast('Failed: ' + e.message, 'error');
    }
  };
}

/* -------- Profile -------- */
function renderProfile(view) {
  const user = getCurrentUser();
  const online = profile?.riderOnline === true;
  view.innerHTML = `
    <div class="adm-box">
      <h3>Rider profile</h3>
      <div class="adm-form">
        <label class="full">Email<input value="${esc(user?.email || '')}" disabled></label>
        <label>Name<input id="rp-name" value="${esc(profile?.name || user?.displayName || '')}"></label>
        <label>Phone<input id="rp-phone" type="tel" placeholder="01XXXXXXXXX" value="${esc(profile?.phone || '')}"></label>
        <label class="full">Availability
          <select id="rp-online">
            <option value="yes" ${online ? 'selected' : ''}>🟢 Online — receive delivery alerts</option>
            <option value="no" ${!online ? 'selected' : ''}>⚪ Offline — pause alerts</option>
          </select>
        </label>
        <div class="full"><button class="adm-btn primary" id="rp-save">Save profile</button></div>
      </div>
      <p class="adm-note" style="text-align:left;margin-top:8px">Your name and phone are shown to the shop and customer when you accept a delivery.</p>
    </div>`;
  document.getElementById('rp-save').onclick = async () => {
    const name = document.getElementById('rp-name').value.trim();
    const phone = document.getElementById('rp-phone').value.trim();
    if (!name) return showToast('Name is required', 'error');
    if (phone && !/^(\+?88)?01[3-9]\d{8}$/.test(phone)) return showToast('Enter a valid BD mobile number', 'error');
    const nextOnline = document.getElementById('rp-online').value === 'yes';
    try {
      const patch = { name, phone };
      if (nextOnline !== online) patch.riderOnline = nextOnline;
      await updateUserProfile(user.uid, patch);
      profile = { ...profile, ...patch };
      showToast('Profile saved', 'success');
      await load();
    } catch (e) {
      showToast('Failed: ' + e.message, 'error');
    }
  };
}
