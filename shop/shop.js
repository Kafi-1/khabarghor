/**
 * Khabar Ghor - Restaurant / Shop Panel
 * Owner manages products + incoming orders for their restaurant.
 */
import { login, loginWithGoogle, logout, onAuthReady, getCurrentUser, flash, takeFlash } from '../js/auth.js';
import { isFirebaseConfigured } from '../js/firebase-config.js';
import {
  getUserProfile, getRestaurantByOwner,
  getProductsByRestaurant, saveProduct, deleteProduct, getProducts,
  getRestaurantOrders, updateOrderStatus, getCategories,
  getOnlineRiders, assignRider, pingRiders
} from '../js/firestore.js';
import { escapeHtml as esc, formatCurrency, formatDateTime } from '../js/utils.js';
import { showToast, setupPanelDrawer } from '../js/ui.js';
import { bindImageUpload, getUploadedImageUrl, bindImageGallery, getGalleryImages } from '../js/imgbb.js';
import { renderNotifList, enableOrderAlerts, clearNotifs, unreadCount, renderPushStatus } from '../js/notifications.js';

const root = document.getElementById('shop-root');
const LAZY = 'loading="lazy" decoding="async" data-lz onload="this.classList.add(\'img-loaded\')" onerror="this.classList.add(\'img-loaded\')"';
const THUMB = (src, emoji = '🍽️') => src
  ? `<img src="${esc(src)}" alt="" ${LAZY}>`
  : `<div class="adm-thumb">${emoji}</div>`;

const TABS = { dashboard: 'Dashboard', orders: 'Orders', history: 'History', products: 'Products', info: 'Shop profile', notifications: 'Notifications' };
const ICONS = { dashboard: '📊', orders: '🧾', history: '🕘', products: '🍽️', info: '🏪', notifications: '🔔' };

let tab = 'dashboard';
let myRestaurant = null;
let profile = null;
let currentUser = null;
let products = [];
let categories = [];

if (!isFirebaseConfigured) {
  root.innerHTML = '<div class="adm-box"><h2>Firebase not set up</h2><p>Paste keys in <code>js/firebase-config.js</code>.</p></div>';
} else {
  onAuthReady(async (user) => {
    const userEl = document.getElementById('shop-user');
    if (userEl) userEl.textContent = user?.email || '';
    if (!user) return showLogin();
    currentUser = user;
    profile = await getUserProfile(user.uid);
    if (!profile || profile.role !== 'restaurant') {
      // Wrong account for this app: sign out and show this app's own login.
      flash('This account is not a shop account. Please log in with a shop account.');
      return logout();
    }
    myRestaurant = await getRestaurantByOwner(user.uid);
    if (!myRestaurant && profile.restaurantId) {
      const { getRestaurant } = await import('../js/firestore.js');
      myRestaurant = await getRestaurant(profile.restaurantId);
    }
    if (!myRestaurant) {
      root.innerHTML = `<div class="adm-box"><h2>No restaurant linked</h2>
        <p>Admin must set <code>ownerId</code> on a restaurant to your user ID, or set <code>restaurantId</code> on your profile.</p></div>`;
      return;
    }
    showApp();
  });
}

function showLogin() {
  root.innerHTML = `<div class="adm-box" style="max-width:380px;margin:40px auto">
    <h2>Shop login</h2>
    <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:12px">Use the account admin linked to your restaurant.</p>
    <div class="adm-form">
      <label class="full">Email<input id="s-email" type="email"></label>
      <label class="full">Password<input id="s-pass" type="password"></label>
      <button class="adm-btn primary full" id="s-go">Login</button>
      <button class="adm-btn full" id="s-google" type="button">Continue with Google</button>
    </div></div>`;
  const go = async () => {
    try {
      await login(document.getElementById('s-email').value.trim(), document.getElementById('s-pass').value);
      location.reload();
    } catch (e) { /* toast */ }
  };
  document.getElementById('s-go').onclick = go;
  document.getElementById('s-pass').onkeydown = e => e.key === 'Enter' && go();
  document.getElementById('s-google').onclick = async () => {
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
  const brand = document.querySelector('.adm-top-left strong');
  if (brand) brand.textContent = '🏪 ' + myRestaurant.name;

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

  root.innerHTML = '<div id="shop-view"></div>';
  await load();
}

async function load() {
  const view = document.getElementById('shop-view');
  view.innerHTML = '<p class="adm-note">Loading...</p>';
  try {
    if (tab === 'dashboard') {
      const orders = await getRestaurantOrders(myRestaurant.id);
      products = (await getProducts({ includeUnavailable: true }))
        .filter(p => p.restaurantId === myRestaurant.id);
      renderShopDashboard(view, orders);
    } else if (tab === 'orders') {
      const orders = await getRestaurantOrders(myRestaurant.id);
      renderOrders(view, orders);
    } else if (tab === 'history') {
      const orders = await getRestaurantOrders(myRestaurant.id);
      renderHistory(view, orders);
    } else if (tab === 'products') {
      products = (await getProducts({ includeUnavailable: true }))
        .filter(p => p.restaurantId === myRestaurant.id);
      try { categories = await getCategories(); } catch { categories = []; }
      renderProducts(view);
    } else if (tab === 'notifications') {
      renderNotifications(view);
    } else {
      renderInfo(view);
    }
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="adm-box">Error: ${esc(err.message)}<br>Check Firestore rules are published.</div>`;
  }
}

const val = (id) => document.getElementById(id)?.value.trim() || '';
const num = (id) => { const n = parseFloat(val(id)); return Number.isFinite(n) ? n : 0; };

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

/* -------- Orders -------- */
// Must match the transitions allowed in firestore.rules (shopMayUpdateOrder)
const SHOP_NEXT = {
  pending: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled']
};

function renderOrders(view, orders) {
  const active = orders.filter(o => !['completed', 'cancelled'].includes(o.status));
  view.innerHTML = `
    <div class="adm-box">
      <h3>Active orders (${active.length})</h3>
      ${active.map(orderCard).join('') || '<p class="adm-note">No active orders right now.</p>'}
    </div>`;
  wireOrderForms(view);
}

function renderHistory(view, orders) {
  const past = orders.filter(o => ['completed', 'cancelled'].includes(o.status));
  const sales = past.filter(o => o.status === 'completed').reduce((s, o) => s + (Number(o.total) || 0), 0);
  view.innerHTML = `
    <div class="adm-box">
      <div class="ord-head" style="margin-bottom:8px">
        <h3 style="margin:0">Order history (${past.length})</h3>
        <span class="ord-meta">Completed sales: <strong>${formatCurrency(sales)}</strong></span>
      </div>
      ${past.slice(0, 100).map(orderCard).join('') || '<p class="adm-note">No past orders yet.</p>'}
    </div>`;
}

function wireOrderForms(view) {
  view.querySelectorAll('.o-save').forEach(b => {
    b.onclick = () => {
      const f = b.closest('[data-o]');
      const status = f.querySelector('.o-status').value;
      if (status === f.dataset.cur) {
        showToast('Choose a new status first', 'info');
        return;
      }
      const reason = f.querySelector('.o-reason')?.value?.trim() || '';
      if (status === 'cancelled' && !reason) {
        showToast('Cancel reason required', 'error');
        return;
      }
      const extra = status === 'cancelled' ? { cancelReason: reason } : {};
      run(() => updateOrderStatus(f.dataset.o, status, extra), 'Order updated');
    };
  });

  view.querySelectorAll('[data-notify]').forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        await pingRiders(b.dataset.notify);
        showToast('Riders notified 🔔', 'success');
      } catch (e) {
        showToast('Could not notify riders: ' + e.message, 'error');
      } finally { b.disabled = false; }
    };
  });

  view.querySelectorAll('[data-assign]').forEach(b => {
    b.onclick = async () => {
      const orderId = b.dataset.assign;
      const wrap = view.querySelector(`[data-assign-wrap="${orderId}"]`);
      wrap.innerHTML = '<small class="ord-meta">Loading online riders…</small>';
      let riders = [];
      try { riders = await getOnlineRiders(); }
      catch (e) { wrap.innerHTML = `<small class="ord-meta">Error: ${esc(e.message)}</small>`; return; }
      if (!riders.length) {
        wrap.innerHTML = '<small class="ord-meta">No riders are online right now. They appear here once a rider goes online.</small>';
        return;
      }
      wrap.innerHTML = riders.map(r =>
        `<button class="adm-btn" data-pick="${r.id}">${esc(r.name)}${r.phone ? ' · ' + esc(r.phone) : ''}</button>`
      ).join('') + '<button class="adm-btn danger" data-cancel>Cancel</button>';
      wrap.querySelectorAll('[data-pick]').forEach(pb => {
        pb.onclick = () => {
          const rider = riders.find(x => x.id === pb.dataset.pick);
          run(() => assignRider(orderId, rider), 'Rider assigned');
        };
      });
      wrap.querySelector('[data-cancel]').onclick = () => load();
    };
  });
}

function orderCard(o) {
  const addrText = [o.address?.detail, o.address?.name].filter(Boolean).join(', ');
  const mapUrl = addrText ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrText)}` : null;

  const itemsHtml = (o.items || []).map(i => {
    const line = (Number(i.price) || 0) * (Number(i.quantity) || 0);
    return `
      <div class="ord-item">
        ${THUMB(i.image)}
        <div class="ord-item-lb">
          <strong>${esc(i.name)}</strong>
          <div class="ord-item-price">${formatCurrency(i.price || 0)} each</div>
        </div>
        <div class="ord-item-price">${esc(String(i.quantity))} ×</div>
        <div style="min-width:64px;text-align:right"><strong>${formatCurrency(line)}</strong></div>
      </div>`;
  }).join('') || '<small class="ord-meta">No items listed</small>';

  return `
    <div class="adm-order">
      <div class="ord-head">
        <strong style="font-size:1.05rem">${formatCurrency(o.total || 0)}</strong>
        <span class="adm-badge">${esc(o.status)}</span>
      </div>
      <div class="ord-meta" style="margin-top:4px">
        🕒 ${formatDateTime(o.createdAt)}
        ${o.address?.name ? ` · 👤 <a href="tel:${esc(o.address?.phone || '')}">${esc(o.address.name)}</a>${o.address?.phone ? ` (${esc(o.address.phone)})` : ''}` : ''}
        ${o.paymentMethod ? ` · 💵 ${esc(o.paymentMethod)}` : ''}
      </div>
      ${o.address?.detail ? `<div class="ord-meta">📍 ${esc(o.address.detail)}${mapUrl ? ` · <a href="${mapUrl}" target="_blank" rel="noopener">Map</a>` : ''}</div>` : ''}
      <div class="ord-items">${itemsHtml}</div>
      ${o.notes ? `<div class="ord-meta">📝 ${esc(o.notes)}</div>` : ''}
      ${o.cancelReason ? `<div class="ord-meta" style="color:#c62828">Cancel: ${esc(o.cancelReason)}</div>` : ''}
      ${SHOP_NEXT[o.status] ? `
        <div class="adm-form" data-o="${o.id}" data-cur="${esc(o.status)}" style="margin-top:8px">
          <label>Status
            <select class="o-status">
              ${[o.status, ...SHOP_NEXT[o.status]].map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </label>
          <label class="full">Cancel reason (if cancelled)<input class="o-reason" placeholder="Out of stock / closed..." value="${esc(o.cancelReason || '')}"></label>
          <div class="full"><button class="adm-btn primary o-save">Update</button></div>
        </div>` : o.status === 'ready' ? `
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap" data-assign-wrap="${o.id}">
          <button class="adm-btn" data-notify="${o.id}">🔔 Notify riders</button>
          <button class="adm-btn primary" data-assign="${o.id}">🛵 Assign rider</button>
        </div>
        <small style="display:block;margin-top:6px;color:var(--text-muted)">Waiting for a rider, or assign one directly.</small>` : ''}
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

/* -------- Products -------- */
function renderProducts(view, edit = null) {
  const p = edit || {};
  view.innerHTML = `
    <div class="adm-box">
      <h2>${edit ? 'Edit product' : 'Add product'}</h2>
      <div class="adm-form">
        <label>Name *<input id="p-name" value="${esc(p.name || '')}"></label>
        <label>Price (৳) *<input id="p-price" type="number" min="0" value="${p.price ?? ''}"></label>
        <label>Category<input id="p-cat" list="cat-list" value="${esc(p.category || '')}" placeholder="e.g. Biryani">
          <datalist id="cat-list">${categories.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
        </label>
        <label class="full">Photos (max 5 — first is the cover)<div id="p-img-box"></div></label>
        <label class="full">Description<textarea id="p-desc" rows="2">${esc(p.description || '')}</textarea></label>
        <label class="adm-check"><input id="p-avail" type="checkbox" ${p.available !== false ? 'checked' : ''}> Available</label>
        <div class="full">
          <button class="adm-btn primary" id="p-save">${edit ? 'Save' : 'Add product'}</button>
          ${edit ? '<button class="adm-btn" id="p-cancel">Cancel</button>' : ''}
        </div>
      </div>
    </div>
    <div class="adm-box">
      <h3>Your products (${products.length})</h3>
      ${products.map(x => `
        <div class="adm-row">
          ${THUMB(x.image)}
          <div class="grow">
            <strong>${esc(x.name)}</strong>
            ${x.available === false ? '<span class="adm-badge off">hidden</span>' : ''}
            <small>${esc(x.category || '—')} · ${formatCurrency(x.price || 0)}</small>
          </div>
          <button class="adm-btn" data-edit="${x.id}">Edit</button>
          <button class="adm-btn danger" data-del="${x.id}">Delete</button>
        </div>`).join('') || '<p class="adm-note">No products yet.</p>'}
    </div>`;

  bindImageGallery(document.getElementById('p-img-box'), {
    currentImages: p.images?.length ? p.images : (p.image ? [p.image] : []),
    max: 5
  });

  document.getElementById('p-save').onclick = () => {
    if (!val('p-name') || val('p-price') === '') return showToast('Name and price required', 'error');
    const images = getGalleryImages(document.getElementById('p-img-box'));
    const data = {
      name: val('p-name'),
      price: num('p-price'),
      restaurantId: myRestaurant.id,
      restaurantName: myRestaurant.name,
      category: val('p-cat'),
      image: images[0] || '',
      images,
      description: val('p-desc'),
      available: document.getElementById('p-avail').checked
    };
    run(() => saveProduct(data, edit?.id), edit ? 'Product updated' : 'Product added');
  };
  document.getElementById('p-cancel')?.addEventListener('click', () => load());
  view.querySelectorAll('[data-edit]').forEach(b => {
    b.onclick = () => {
      renderProducts(view, products.find(x => x.id === b.dataset.edit));
      scrollTo(0, 0);
    };
  });
  view.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => confirm('Delete this product?') && run(() => deleteProduct(b.dataset.del), 'Deleted');
  });
}

/* -------- Info / Open-Close -------- */
function renderInfo(view) {
  const st = myRestaurant.status || 'open';
  const map = myRestaurant.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(myRestaurant.address)}`
    : (myRestaurant.lat != null ? `https://www.google.com/maps?q=${myRestaurant.lat},${myRestaurant.lng}` : null);
  view.innerHTML = `
    <div class="adm-box">
      <h2>${esc(myRestaurant.name)}</h2>
      <p style="color:var(--text-muted);margin:8px 0">${esc(myRestaurant.description || '')}</p>
      <p><strong>Address:</strong> ${esc(myRestaurant.address || '—')}
        ${map ? ` <a href="${map}" target="_blank" rel="noopener">📍 Map</a>` : ''}</p>
      <p><strong>Phone:</strong> ${myRestaurant.phone ? `<a href="tel:${esc(myRestaurant.phone)}">${esc(myRestaurant.phone)}</a>` : '—'}</p>
      <p><strong>Catalogue:</strong> ${myRestaurant.active !== false ? 'Visible' : 'Hidden (admin)'}</p>
      <hr style="margin:16px 0;border:0;border-top:1px solid var(--border-light)">
      <h3 style="margin-bottom:8px">Shop information</h3>
      <div class="adm-form">
        <label>Shop name<input id="shop-name" value="${esc(myRestaurant.name || '')}"></label>
        <label>Phone<input id="shop-phone" value="${esc(myRestaurant.phone || '')}"></label>
        <label class="full">Description<input id="shop-description" value="${esc(myRestaurant.description || '')}"></label>
        <label class="full">Address<input id="shop-address" value="${esc(myRestaurant.address || '')}"></label>
        <label>Delivery time<input id="shop-delivery" value="${esc(myRestaurant.deliveryTime || '')}" placeholder="20–35 min"></label>
        <label>Min order ৳<input id="shop-minorder" type="number" min="0" value="${myRestaurant.minOrder || 0}"></label>
        <label>Status
          <select id="shop-status">
            <option value="open" ${st === 'open' ? 'selected' : ''}>🟢 Open — accept orders</option>
            <option value="busy" ${st === 'busy' ? 'selected' : ''}>🟡 Busy — slow / limited</option>
            <option value="closed" ${st === 'closed' ? 'selected' : ''}>🔴 Closed — pause orders</option>
          </select>
        </label>
        <div class="full"><button class="adm-btn primary" id="shop-status-save">Save shop information</button></div>
      </div>
    </div>`;
  document.getElementById('shop-status-save').onclick = async () => {
    const status = document.getElementById('shop-status').value;
    const name = val('shop-name');
    if (!name) return showToast('Shop name is required', 'error');
    try {
      const { saveRestaurant } = await import('../js/firestore.js');
      const minOrder = parseFloat(val('shop-minorder')) || 0;
      await saveRestaurant({
        name,
        description: val('shop-description'),
        address: val('shop-address'),
        phone: val('shop-phone'),
        deliveryTime: val('shop-delivery'),
        minOrder,
        status
      }, myRestaurant.id);
      myRestaurant = { ...myRestaurant, name, description: val('shop-description'), address: val('shop-address'), phone: val('shop-phone'), deliveryTime: val('shop-delivery'), minOrder, status };
      showToast('Shop information updated', 'success');
      const brand = document.querySelector('.adm-top-left strong');
      if (brand) brand.textContent = '🏪 ' + myRestaurant.name;
      renderInfo(view);
    } catch (e) {
      showToast('Failed: ' + e.message, 'error');
    }
  };
}


function renderShopDashboard(view, orders) {
  const completed = orders.filter(o => o.status === 'completed');
  const active = orders.filter(o => !['completed', 'cancelled'].includes(o.status));
  const revenue = completed.reduce((s, o) => s + (Number(o.total) || 0), 0);
  view.innerHTML = `
    <div class="dash-grid">
      <div class="dash-card"><div class="dash-val">${formatCurrency(revenue)}</div><div class="dash-lbl">Total sales</div></div>
      <div class="dash-card"><div class="dash-val">${orders.length}</div><div class="dash-lbl">All orders</div></div>
      <div class="dash-card"><div class="dash-val">${active.length}</div><div class="dash-lbl">Active</div></div>
      <div class="dash-card"><div class="dash-val">${completed.length}</div><div class="dash-lbl">Completed</div></div>
      <div class="dash-card"><div class="dash-val">${products.length}</div><div class="dash-lbl">Products</div></div>
    </div>
    <div class="adm-box">
      <h3>Recent orders</h3>
      ${orders.slice(0, 6).map(o => `
        <div class="adm-order">
          <strong>${formatCurrency(o.total || 0)}</strong> · <span class="adm-badge">${esc(o.status)}</span>
          <small style="display:block;color:var(--text-muted)">${formatDateTime(o.createdAt)} · ${esc(o.address?.name || '')}</small>
        </div>`).join('') || '<p class="adm-note">No orders yet.</p>'}
    </div>`;
}
