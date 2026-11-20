/**
 * Notifications – order updates + promo tips (localStorage + live orders)
 */
import { renderBottomNav, showToast } from './ui.js';
import { onAuthReady } from './auth.js';
import { getUserOrders } from './firestore.js';

const KEY = 'khabarghor_notifs';

export function getNotifs() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function pushNotif(title, body, type = 'info') {
  const list = getNotifs();
  list.unshift({ id: Date.now().toString(36), title, body, type, at: Date.now(), read: false });
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  updateNotifDot();
}

export function markAllRead() {
  const list = getNotifs().map(n => ({ ...n, read: true }));
  localStorage.setItem(KEY, JSON.stringify(list));
  updateNotifDot();
}

export function clearNotifs() {
  localStorage.removeItem(KEY);
  updateNotifDot();
}

export function unreadCount() {
  return getNotifs().filter(n => !n.read).length;
}

export function updateNotifDot() {
  const n = unreadCount();
  document.querySelectorAll('.notif-dot').forEach(el => {
    el.style.display = n > 0 ? 'block' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // This module is also imported by other pages (checkout, home) – only run the page logic on notifications.html
  if (!document.getElementById('notif-list')) return;
  const nav = document.getElementById('bottom-nav');
  if (nav) nav.innerHTML = renderBottomNav('');

  const listEl = document.getElementById('notif-list');
  document.getElementById('clear-notifs')?.addEventListener('click', () => {
    clearNotifs();
    render();
    showToast('Notifications cleared', 'info');
  });

  // Seed from recent orders
  try {
    const user = await new Promise(r => onAuthReady(r));
    if (user) {
      const orders = await getUserOrders(user.uid);
      const existing = getNotifs();
      const existingIds = new Set(existing.map(n => n.orderId).filter(Boolean));
      orders.slice(0, 10).forEach(o => {
        if (existingIds.has(o.id)) return;
        const msgs = {
          pending: 'Order placed — waiting for restaurant',
          accepted: 'Restaurant accepted your order',
          preparing: 'Your food is being prepared',
          ready: 'Order ready — rider will pick up soon',
          delivering: 'Rider is on the way!',
          completed: 'Order delivered. Enjoy!',
          cancelled: 'Order was cancelled'
        };
        const title = msgs[o.status] || `Order ${o.status}`;
        const list = getNotifs();
        list.push({
          id: 'ord-' + o.id,
          orderId: o.id,
          title,
          body: `${o.restaurantName || 'Order'} · ৳${Math.round(o.total || 0)}`,
          type: o.status === 'completed' ? 'success' : o.status === 'cancelled' ? 'error' : 'info',
          at: o.createdAt?.toMillis?.() || Date.now(),
          read: true,
          href: `order-tracking.html?id=${o.id}`
        });
        localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
      });
    }
  } catch (e) { /* ignore */ }

  markAllRead();
  render();
});

function render() {
  renderNotifList(document.getElementById('notif-list'));
}

/** Render the stored alert list into any container (used by panels too). */
export function renderNotifList(containerEl) {
  if (!containerEl) return;
  const list = getNotifs().sort((a, b) => (b.at || 0) - (a.at || 0));
  if (!list.length) {
    containerEl.innerHTML = '<p class="adm-note" style="text-align:center;padding:24px">No notifications yet 🔔</p>';
    return;
  }
  containerEl.innerHTML = list.map(n => `
    <a href="${escape(n.href || '#')}" class="notif-item" style="display:block;padding:14px 4px;border-bottom:1px solid var(--border-light);text-decoration:none;color:inherit">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <strong style="font-size:.9rem">${escape(n.title)}</strong>
        <span style="font-size:.7rem;color:var(--text-muted);white-space:nowrap">${timeLabel(n.at)}</span>
      </div>
      <p style="font-size:.82rem;color:var(--text-muted);margin-top:4px">${escape(n.body || '')}</p>
    </a>`).join('');
}

/** Compact push-notification status block (for the panels' Notifications screen). */
export async function renderPushStatus(containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = '<small style="color:var(--text-muted)">Checking push…</small>';
  try {
    const msg = await import('./messaging.js');
    const info = await msg.pushDiagnostics();
    const ok = (b) => (b ? '✅' : '❌');
    containerEl.innerHTML = [
      `${ok(info.configured)} App configured`,
      `${ok(info.supported)} Browser supports push`,
      `🔔 Permission: <strong>${info.permission}</strong>`,
      `${ok(info.token)} Device token created`,
      `${ok(info.tokenSaved)} Token saved on server`
    ].join('<br>');
  } catch {
    containerEl.innerHTML = '<small style="color:#c62828">Could not read push status</small>';
  }
}

/** Turn browser push (order alerts) on/off for a signed-in user. */
export async function enableOrderAlerts(user) {
  try {
    const msg = await import('./messaging.js');
    if (!msg.pushConfigured()) return { ok: false, reason: 'unconfigured' };
    if (!(await msg.pushSupported())) return { ok: false, reason: 'unsupported' };
    return await msg.enablePush(user);
  } catch {
    return { ok: false, reason: 'error' };
  }
}

function escape(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function timeLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Export for other pages
if (typeof window !== 'undefined') {
  window.KGNotif = { pushNotif, updateNotifDot, unreadCount };
}
