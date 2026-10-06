/**
 * Khabar Ghor - Restaurant / Shop Panel
 * Owner manages products + incoming orders for their restaurant.
 */
import { login, logout, onAuthReady, getCurrentUser } from './auth.js';
import { isFirebaseConfigured } from './firebase-config.js';
import {
  getUserProfile, getRestaurantByOwner,
  getProductsByRestaurant, saveProduct, deleteProduct, getProducts,
  getRestaurantOrders, updateOrderStatus, getCategories
} from './firestore.js';
import { escapeHtml as esc, formatCurrency, formatDateTime } from './utils.js';
import { showToast } from './ui.js';
import { bindImageUpload, getUploadedImageUrl } from './imgbb.js';

const root = document.getElementById('shop-root');
const THUMB = (src, emoji = '🍽️') => src
  ? `<img src="${esc(src)}" alt="">`
  : `<div class="adm-thumb">${emoji}</div>`;

let tab = 'dashboard';
let myRestaurant = null;
let profile = null;
let products = [];
let categories = [];

if (!isFirebaseConfigured) {
  root.innerHTML = '<div class="adm-box"><h2>Firebase not set up</h2><p>Paste keys in <code>js/firebase-config.js</code>.</p></div>';
} else {
  onAuthReady(async (user) => {
    document.getElementById('shop-user').textContent = user?.email || '';
    document.getElementById('shop-logout').style.display = user ? '' : 'none';
    if (!user) return showLogin();
    profile = await getUserProfile(user.uid);
    if (!profile || profile.role !== 'restaurant') {
      root.innerHTML = `<div class="adm-box"><h2>Not a shop account</h2>
        <p>This login is not linked to a restaurant. Ask admin to set your role to <strong>restaurant</strong> and link a shop.</p>
        <p style="margin-top:12px"><a href="login.html">Login page</a> · <a href="index.html">Home</a></p></div>`;
      return;
    }
    myRestaurant = await getRestaurantByOwner(user.uid);
    if (!myRestaurant && profile.restaurantId) {
      const { getRestaurant } = await import('./firestore.js');
      myRestaurant = await getRestaurant(profile.restaurantId);
    }
    if (!myRestaurant) {
      root.innerHTML = `<div class="adm-box"><h2>No restaurant linked</h2>
        <p>Admin must set <code>ownerId</code> on a restaurant to your user ID, or set <code>restaurantId</code> on your profile.</p></div>`;
      return;
    }
    showApp();
  });
  document.getElementById('shop-logout').addEventListener('click', () => logout());
}

function showLogin() {
  root.innerHTML = `<div class="adm-box" style="max-width:380px;margin:40px auto">
    <h2>Shop login</h2>
    <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:12px">Use the account admin linked to your restaurant.</p>
    <div class="adm-form">
      <label class="full">Email<input id="s-email" type="email"></label>
      <label class="full">Password<input id="s-pass" type="password"></label>
      <button class="adm-btn primary full" id="s-go">Login</button>
    </div></div>`;
  const go = async () => {
    try {
      await login(document.getElementById('s-email').value.trim(), document.getElementById('s-pass').value);
      location.reload();
    } catch (e) { /* toast */ }
  };
  document.getElementById('s-go').onclick = go;
  document.getElementById('s-pass').onkeydown = e => e.key === 'Enter' && go();
}

async function showApp() {
  root.innerHTML = `
    <div class="adm-box" style="padding:12px 16px;margin-bottom:12px">
      <strong>${esc(myRestaurant.name)}</strong>
      <span style="color:var(--text-muted);font-size:.85rem"> · Shop Panel</span>
    </div>
    <div class="adm-tabs">
      ${['dashboard', 'orders', 'products', 'info'].map(t =>
        `<button class="adm-tab ${t === tab ? 'active' : ''}" data-t="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`
      ).join('')}
    </div>
    <div id="shop-view"></div>`;
  root.querySelector('.adm-tabs').onclick = e => {
    const b = e.target.closest('.adm-tab');
    if (!b) return;
    tab = b.dataset.t;
    showApp();
  };
  await load();
}

async function load() {
  const view = document.getElementById('shop-view');
  view.innerHTML = '<p class="adm-note">Loading…</p>';
  try {
    if (tab === 'dashboard') {
      const orders = await getRestaurantOrders(myRestaurant.id);
      products = (await getProducts({ includeUnavailable: true }))
        .filter(p => p.restaurantId === myRestaurant.id);
      renderShopDashboard(view, orders);
    } else if (tab === 'orders') {
      const orders = await getRestaurantOrders(myRestaurant.id);
      renderOrders(view, orders);
    } else if (tab === 'products') {
      products = (await getProducts({ includeUnavailable: true }))
        .filter(p => p.restaurantId === myRestaurant.id);
      try { categories = await getCategories(); } catch { categories = []; }
      renderProducts(view);
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
const SHOP_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'cancelled'];

function renderOrders(view, orders) {
  const active = orders.filter(o => !['completed', 'cancelled'].includes(o.status));
  const past = orders.filter(o => ['completed', 'cancelled'].includes(o.status));

  view.innerHTML = `
    <div class="adm-box">
      <h3>Active orders (${active.length})</h3>
      ${active.map(orderCard).join('') || '<p class="adm-note">No active orders.</p>'}
    </div>
    <div class="adm-box">
      <h3>Past orders (${past.length})</h3>
      ${past.slice(0, 20).map(orderCard).join('') || '<p class="adm-note">None yet.</p>'}
    </div>`;

  view.querySelectorAll('.o-save').forEach(b => {
    b.onclick = () => {
      const f = b.closest('[data-o]');
      const status = f.querySelector('.o-status').value;
      const reason = f.querySelector('.o-reason')?.value?.trim() || '';
      if (status === 'cancelled' && !reason) {
        showToast('Cancel reason required', 'error');
        return;
      }
      const extra = status === 'cancelled' ? { cancelReason: reason } : {};
      run(() => updateOrderStatus(f.dataset.o, status, extra), 'Order updated');
    };
  });
}

function orderCard(o) {
  const addrText = [o.address?.detail, o.address?.name].filter(Boolean).join(', ');
  const mapUrl = addrText ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrText)}` : null;
  return `
    <div class="adm-order">
      <strong>${formatCurrency(o.total || 0)}</strong>
      · <span class="adm-badge">${esc(o.status)}</span>
      <small style="display:block;color:var(--text-muted)">
        ${formatDateTime(o.createdAt)} · ${esc(o.address?.name || '')} ·
        <a href="tel:${esc(o.address?.phone || '')}">${esc(o.address?.phone || '')}</a>
        · ${esc(o.paymentMethod || '')}
      </small>
      <small style="display:block">${esc(o.address?.detail || '')}
        ${mapUrl ? ` · <a href="${mapUrl}" target="_blank" rel="noopener">📍 Map</a>` : ''}
      </small>
      <small style="display:block">${(o.items || []).map(i => `${i.quantity}× ${esc(i.name)}`).join(', ')}
        ${o.notes ? ' — Note: ' + esc(o.notes) : ''}</small>
      ${o.cancelReason ? `<small style="display:block;color:#c62828">Cancel: ${esc(o.cancelReason)}</small>` : ''}
      ${!['completed', 'cancelled'].includes(o.status) ? `
        <div class="adm-form" data-o="${o.id}" style="margin-top:8px">
          <label>Status
            <select class="o-status">
              ${SHOP_STATUSES.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </label>
          <label class="full">Cancel reason (if cancelled)<input class="o-reason" placeholder="Out of stock / closed…" value="${esc(o.cancelReason || '')}"></label>
          <div class="full"><button class="adm-btn primary o-save">Update</button></div>
        </div>` : ''}
    </div>`;
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
        <label class="full">Image<div id="p-img-box"></div></label>
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

  bindImageUpload(document.getElementById('p-img-box'), { currentUrl: p.image || '' });

  document.getElementById('p-save').onclick = () => {
    if (!val('p-name') || val('p-price') === '') return showToast('Name and price required', 'error');
    const data = {
      name: val('p-name'),
      price: num('p-price'),
      restaurantId: myRestaurant.id,
      restaurantName: myRestaurant.name,
      category: val('p-cat'),
      image: getUploadedImageUrl(document.getElementById('p-img-box')),
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
      <p><strong>Delivery time:</strong> ${esc(myRestaurant.deliveryTime || '—')}</p>
      <p><strong>Catalogue:</strong> ${myRestaurant.active !== false ? 'Visible' : 'Hidden (admin)'}</p>
      <hr style="margin:16px 0;border:0;border-top:1px solid var(--border-light)">
      <h3 style="margin-bottom:8px">Shop status (orders)</h3>
      <div class="adm-form">
        <label>Status
          <select id="shop-status">
            <option value="open" ${st === 'open' ? 'selected' : ''}>🟢 Open — accept orders</option>
            <option value="busy" ${st === 'busy' ? 'selected' : ''}>🟡 Busy — slow / limited</option>
            <option value="closed" ${st === 'closed' ? 'selected' : ''}>🔴 Closed — pause orders</option>
          </select>
        </label>
        <div class="full"><button class="adm-btn primary" id="shop-status-save">Save status</button></div>
      </div>
    </div>`;
  document.getElementById('shop-status-save').onclick = async () => {
    const status = document.getElementById('shop-status').value;
    try {
      const { saveRestaurant } = await import('./firestore.js');
      await saveRestaurant({
        name: myRestaurant.name,
        description: myRestaurant.description || '',
        image: myRestaurant.image || '',
        coverImage: myRestaurant.coverImage || '',
        deliveryTime: myRestaurant.deliveryTime || '',
        active: myRestaurant.active !== false,
        ownerId: myRestaurant.ownerId || null,
        address: myRestaurant.address || '',
        phone: myRestaurant.phone || '',
        status,
        ...(myRestaurant.distance != null ? { distance: myRestaurant.distance } : {}),
        ...(myRestaurant.lat != null ? { lat: myRestaurant.lat, lng: myRestaurant.lng } : {})
      }, myRestaurant.id);
      myRestaurant.status = status;
      showToast('Status saved: ' + status, 'success');
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
