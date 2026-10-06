/**
 * Khabar Ghor - Rider Panel
 * Riders pick up ready orders and deliver to customers.
 */
import { login, logout, onAuthReady, getCurrentUser } from './auth.js';
import { isFirebaseConfigured } from './firebase-config.js';
import { getUserProfile, getReadyOrders, getOrdersByRider, updateOrderStatus, updateUserProfile, mapsLink } from './firestore.js';
import { escapeHtml as esc, formatCurrency, formatDateTime } from './utils.js';
import { showToast } from './ui.js';

const root = document.getElementById('rider-root');
let tab = 'dashboard';
let profile = null;

if (!isFirebaseConfigured) {
  root.innerHTML = '<div class="adm-box"><h2>Firebase not set up</h2><p>Paste keys in <code>js/firebase-config.js</code>.</p></div>';
} else {
  onAuthReady(async (user) => {
    document.getElementById('rider-user').textContent = user?.email || '';
    document.getElementById('rider-logout').style.display = user ? '' : 'none';
    if (!user) return showLogin();
    profile = await getUserProfile(user.uid);
    if (!profile || profile.role !== 'rider') {
      root.innerHTML = `<div class="adm-box"><h2>Not a rider account</h2>
        <p>Ask admin to set your role to <strong>rider</strong>.</p>
        <p style="margin-top:12px"><a href="login.html">Login</a> · <a href="index.html">Home</a></p></div>`;
      return;
    }
    showApp();
  });
  document.getElementById('rider-logout').addEventListener('click', () => logout());
}

function showLogin() {
  root.innerHTML = `<div class="adm-box" style="max-width:380px;margin:40px auto">
    <h2>Rider login</h2>
    <div class="adm-form">
      <label class="full">Email<input id="r-email" type="email"></label>
      <label class="full">Password<input id="r-pass" type="password"></label>
      <button class="adm-btn primary full" id="r-go">Login</button>
    </div></div>`;
  const go = async () => {
    try {
      await login(document.getElementById('r-email').value.trim(), document.getElementById('r-pass').value);
      location.reload();
    } catch (e) { /* toast */ }
  };
  document.getElementById('r-go').onclick = go;
  document.getElementById('r-pass').onkeydown = e => e.key === 'Enter' && go();
}

async function showApp() {
  root.innerHTML = `
    <div class="adm-tabs">
      ${['dashboard', 'available', 'my', 'history'].map(t =>
        `<button class="adm-tab ${t === tab ? 'active' : ''}" data-t="${t}">${
          t === 'dashboard' ? 'Dashboard' : t === 'available' ? 'Available' : t === 'my' ? 'My deliveries' : 'History'
        }</button>`
      ).join('')}
    </div>
    <div id="rider-view"></div>`;
  root.querySelector('.adm-tabs').onclick = e => {
    const b = e.target.closest('.adm-tab');
    if (!b) return;
    tab = b.dataset.t;
    showApp();
  };
  await load();
}

async function load() {
  const view = document.getElementById('rider-view');
  view.innerHTML = '<p class="adm-note">Loading…</p>';
  try {
    const uid = getCurrentUser().uid;

    if (tab === 'dashboard') {
      const mine = await getOrdersByRider(uid);
      renderRiderDashboard(view, mine);
    } else if (tab === 'available') {
      const list = await getReadyOrders();
      renderAvailable(view, list);
    } else if (tab === 'my') {
      const mine = await getOrdersByRider(uid);
      const list = mine.filter(o => ['delivering', 'ready'].includes(o.status));
      renderMy(view, list);
    } else {
      const mine = await getOrdersByRider(uid);
      const list = mine.filter(o => ['completed', 'cancelled'].includes(o.status));
      renderHistory(view, list);
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
  return `
    <div class="adm-order">
      <strong>${esc(o.restaurantName || 'Order')}</strong>
      · ${formatCurrency(o.total || 0)}
      · <span class="adm-badge">${esc(o.status)}</span>
      <small style="display:block;color:var(--text-muted)">
        ${formatDateTime(o.createdAt)}
      </small>
      <small style="display:block"><strong>Customer:</strong> ${esc(o.address?.name || '—')} ·
        <a href="tel:${esc(o.address?.phone || '')}">${esc(o.address?.phone || '')}</a>
        ${custMap ? ` · <a href="${custMap}" target="_blank" rel="noopener">📍 Navigate</a>` : ''}
      </small>
      <small style="display:block"><strong>Address:</strong> ${esc(o.address?.detail || '—')}</small>
      ${restMap ? `<small style="display:block"><a href="${restMap}" target="_blank" rel="noopener">🏪 Restaurant map</a></small>` : ''}
      <small style="display:block">${(o.items || []).map(i => `${i.quantity}× ${esc(i.name)}`).join(', ')}</small>
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
      run(() => updateOrderStatus(b.dataset.accept, 'delivering', {
        riderId: user.uid,
        driverName: profile?.name || user.displayName || user.email?.split('@')[0] || 'Rider',
        driverPhone: profile?.phone || ''
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
  view.innerHTML = `
    <div class="adm-box">
      <h3>History (${list.length})</h3>
      ${list.slice(0, 30).map(o => orderBlock(o)).join('') || '<p class="adm-note">No completed deliveries yet.</p>'}
    </div>`;
}


function renderRiderDashboard(view, mine) {
  const completed = mine.filter(o => o.status === 'completed');
  const active = mine.filter(o => o.status === 'delivering');
  const earnings = completed.reduce((s, o) => s + 40, 0); // flat delivery fee as rough earning
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
      <div class="dash-card"><div class="dash-val">${formatCurrency(earnings)}</div><div class="dash-lbl">Est. earnings</div></div>
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
