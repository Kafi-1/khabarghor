/**
 * Khabar Ghor - Admin Panel (admin.html)
 * Manage restaurants, products, categories and orders. Real data only.
 */
import { login, logout, onAuthReady } from './auth.js';
import { ADMIN_EMAILS, isFirebaseConfigured } from './firebase-config.js';
import {
  getRestaurants, saveRestaurant, deleteRestaurant,
  getProducts, saveProduct, deleteProduct,
  getCategories, saveCategory, deleteCategory,
  getAllOrders, updateOrderStatus, setUserRole, getUserProfile, getAllUsers,
  mapsLink, getCoupons, saveCoupon, deleteCoupon, getPromos, savePromo, deletePromo,
  getAllTickets, updateTicketStatus
} from './firestore.js';
import { escapeHtml as esc, formatCurrency, formatDateTime } from './utils.js';
import { showToast } from './ui.js';
import { bindImageUpload, getUploadedImageUrl } from './imgbb.js';

const root = document.getElementById('adm-root');
const THUMB = (src, emoji = '🍽️') => src ? `<img src="${esc(src)}" alt="">` : `<div class="adm-thumb">${emoji}</div>`;
let tab = 'dashboard';
let cache = { restaurants: [], products: [], categories: [], orders: [], users: [] };
let userFilter = { q: '', role: 'all' };

if (!isFirebaseConfigured) {
  root.innerHTML = '<div class="adm-box"><h2>Firebase not set up</h2><p>Paste your Firebase keys into <code>js/firebase-config.js</code>, then reload. See README.</p></div>';
} else {
  onAuthReady(user => {
    document.getElementById('adm-user').textContent = user?.email || '';
    document.getElementById('adm-logout').style.display = user ? '' : 'none';
    if (!user) return showLogin();
    if (!ADMIN_EMAILS.map(e => e.toLowerCase()).includes((user.email || '').toLowerCase())) {
      root.innerHTML = '<div class="adm-box"><h2>Not allowed</h2><p>This account is not an admin. Add your email to <code>ADMIN_EMAILS</code> in js/firebase-config.js and in firestore.rules.</p></div>';
      return;
    }
    showApp();
  });
  document.getElementById('adm-logout').addEventListener('click', () => logout());
}

function showLogin() {
  root.innerHTML = `<div class="adm-box" style="max-width:380px;margin:40px auto">
    <h2>Admin login</h2>
    <div class="adm-form"><label class="full">Email<input id="a-email" type="email"></label>
    <label class="full">Password<input id="a-pass" type="password"></label>
    <button class="adm-btn primary full" id="a-go">Login</button></div></div>`;
  const go = async () => {
    try { await login(document.getElementById('a-email').value.trim(), document.getElementById('a-pass').value); location.reload(); } catch (e) { /* toast shown */ }
  };
  document.getElementById('a-go').onclick = go;
  document.getElementById('a-pass').onkeydown = e => e.key === 'Enter' && go();
}

async function showApp() {
  const labels = { dashboard:'Dashboard', products:'Products', restaurants:'Restaurants', categories:'Categories', orders:'Orders', users:'Users & Roles', coupons:'Coupons', promos:'Promos', support:'Support' };
  root.innerHTML = `<div class="adm-tabs">${Object.keys(labels).map(t =>
    `<button class="adm-tab ${t === tab ? 'active' : ''}" data-t="${t}">${labels[t]}</button>`).join('')}</div><div id="adm-view"></div>`;
  root.querySelector('.adm-tabs').onclick = e => {
    const b = e.target.closest('.adm-tab'); if (!b) return;
    tab = b.dataset.t; showApp();
  };
  await load();
}

async function load() {
  const view = document.getElementById('adm-view');
  view.innerHTML = '<p class="adm-note">Loading…</p>';
  try {
    [cache.restaurants, cache.categories] = await Promise.all([getRestaurants({ includeInactive: true }), getCategories().catch(() => [])]);
    if (tab === 'dashboard') {
      cache.orders = await getAllOrders();
      cache.products = await getProducts({ includeUnavailable: true });
      renderDashboard(view);
    } else if (tab === 'products') { cache.products = await getProducts({ includeUnavailable: true }); renderProducts(view); }
    else if (tab === 'restaurants') renderRestaurants(view);
    else if (tab === 'categories') renderCategories(view);
    else if (tab === 'users') {
      cache.users = await getAllUsers();
      renderUsers(view);
    } else if (tab === 'coupons') {
      cache.coupons = await getCoupons({ includeInactive: true });
      renderCoupons(view);
    } else if (tab === 'promos') {
      cache.promos = await getPromos();
      // getPromos filters active; load all via include if needed
      try {
        const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js');
        const { db } = await import('./firebase-config.js');
        const snap = await getDocs(collection(db, 'promos'));
        cache.promos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch { cache.promos = await getPromos(); }
      renderPromos(view);
    } else if (tab === 'support') {
      cache.tickets = await getAllTickets();
      renderSupport(view);
    }
    else renderOrders(view, await getAllOrders());
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="adm-box">Could not load data: ${esc(err.message)}<br>Check that your Firestore rules from <code>firestore.rules</code> are published.</div>`;
  }
}

const val = (id) => document.getElementById(id).value.trim();
const num = (id) => { const n = parseFloat(val(id)); return Number.isFinite(n) ? n : 0; };
async function run(fn, okMsg) {
  try { await fn(); showToast(okMsg, 'success'); await load(); } catch (e) { console.error(e); showToast('Failed: ' + e.message, 'error'); }
}

/* ---------------- Products ---------------- */
function renderProducts(view, edit = null) {
  const p = edit || {};
  view.innerHTML = `<div class="adm-box"><h2>${edit ? 'Edit product' : 'Add product'}</h2>
    <div class="adm-form">
      <label>Name *<input id="p-name" value="${esc(p.name || '')}"></label>
      <label>Price (৳) *<input id="p-price" type="number" min="0" value="${p.price ?? ''}"></label>
      <label>Restaurant / Shop *<select id="p-rest"><option value="">— choose —</option>${cache.restaurants.map(r => `<option value="${r.id}" ${r.id === p.restaurantId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <label>Category<input id="p-cat" list="cat-list" value="${esc(p.category || '')}" placeholder="e.g. Biryani"><datalist id="cat-list">${cache.categories.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist></label>
      <label class="full">Image<div id="p-img-box"></div></label>
      <label class="full">Description<textarea id="p-desc" rows="2">${esc(p.description || '')}</textarea></label>
      <label class="adm-check"><input id="p-avail" type="checkbox" ${p.available !== false ? 'checked' : ''}> Available (shown on home page)</label>
      <div class="full"><button class="adm-btn primary" id="p-save">${edit ? 'Save changes' : 'Add product'}</button>
      ${edit ? '<button class="adm-btn" id="p-cancel">Cancel</button>' : ''}</div>
    </div></div>
    <div class="adm-box"><h3>All products (${cache.products.length})</h3>
    ${cache.products.map(x => `<div class="adm-row">${THUMB(x.image)}<div class="grow"><strong>${esc(x.name)}</strong> ${x.available === false ? '<span class="adm-badge off">hidden</span>' : ''}<small>${esc(x.restaurantName || '—')} · ${esc(x.category || 'no category')} · ${formatCurrency(x.price || 0)}</small></div>
      <button class="adm-btn" data-edit="${x.id}">Edit</button><button class="adm-btn danger" data-del="${x.id}">Delete</button></div>`).join('') || '<p class="adm-note">No products yet. Add your first one above.</p>'}</div>`;

  bindImageUpload(document.getElementById('p-img-box'), { currentUrl: p.image || '' });

  document.getElementById('p-save').onclick = () => {
    const rest = cache.restaurants.find(r => r.id === val('p-rest'));
    if (!val('p-name') || !rest || val('p-price') === '') return showToast('Name, price and restaurant are required', 'error');
    const data = { name: val('p-name'), price: num('p-price'), restaurantId: rest.id, restaurantName: rest.name, category: val('p-cat'),
      image: getUploadedImageUrl(document.getElementById('p-img-box')), description: val('p-desc'), available: document.getElementById('p-avail').checked };
    run(() => saveProduct(data, edit?.id), edit ? 'Product updated' : 'Product added');
  };
  document.getElementById('p-cancel')?.addEventListener('click', load);
  view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { renderProducts(view, cache.products.find(x => x.id === b.dataset.edit)); scrollTo(0, 0); });
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirm('Delete this product?') && run(() => deleteProduct(b.dataset.del), 'Product deleted'));
}

/* ---------------- Restaurants ---------------- */
function renderRestaurants(view, edit = null) {
  const r = edit || {};
  view.innerHTML = `<div class="adm-box"><h2>${edit ? 'Edit restaurant' : 'Add restaurant / shop'}</h2>
    <div class="adm-form">
      <label>Name *<input id="r-name" value="${esc(r.name || '')}"></label>
      <label>Short description<input id="r-desc" value="${esc(r.description || '')}" placeholder="e.g. Kacchi, tehari & polao"></label>
      <label class="full">Logo / card image<div id="r-img-box"></div></label>
      <label class="full">Cover image<div id="r-cover-box"></div></label>
      <label class="full">Address<input id="r-addr" value="${esc(r.address || '')}" placeholder="Area, upazila, district"></label>
      <label>Phone<input id="r-phone" value="${esc(r.phone || '')}" placeholder="01XXXXXXXXX"></label>
      <label>Delivery time<input id="r-time" value="${esc(r.deliveryTime || '')}" placeholder="e.g. 20-35 min"></label>
      <label>Distance (km)<input id="r-dist" type="number" step="0.1" min="0" value="${r.distance ?? ''}"></label>
      <label>Lat (optional)<input id="r-lat" type="number" step="any" value="${r.lat ?? ''}" placeholder="23.81"></label>
      <label>Lng (optional)<input id="r-lng" type="number" step="any" value="${r.lng ?? ''}" placeholder="90.41"></label>
      <label>Shop status
        <select id="r-status">
          <option value="open" ${(r.status || 'open') === 'open' ? 'selected' : ''}>Open</option>
          <option value="closed" ${r.status === 'closed' ? 'selected' : ''}>Closed</option>
          <option value="busy" ${r.status === 'busy' ? 'selected' : ''}>Busy</option>
        </select>
      </label>
      <label>Verification
        <select id="r-verify">
          <option value="approved" ${(r.verificationStatus || 'approved') === 'approved' ? 'selected' : ''}>Approved</option>
          <option value="pending" ${r.verificationStatus === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="rejected" ${r.verificationStatus === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </label>
      <label class="adm-check"><input id="r-active" type="checkbox" ${r.active !== false ? 'checked' : ''}> Active (listed when approved)</label>
      <p class="adm-note" style="text-align:left;grid-column:1/-1">Owner: assign from <strong>Users & Roles</strong> tab (no UID needed).</p>
      <div class="full"><button class="adm-btn primary" id="r-save">${edit ? 'Save changes' : 'Add restaurant'}</button>${edit ? '<button class="adm-btn" id="r-cancel">Cancel</button>' : ''}</div>
    </div></div>
    <div class="adm-box"><h3>All restaurants (${cache.restaurants.length})</h3>
    ${cache.restaurants.map(x => {
      const map = mapsLink(x.lat != null ? x.lat : x.address, x.lat != null ? x.lng : null);
      return `<div class="adm-row">${THUMB(x.image, '🏪')}<div class="grow"><strong>${esc(x.name)}</strong>
      ${x.active === false ? '<span class="adm-badge off">hidden</span>' : ''}
      <span class="adm-badge">${esc(x.status || 'open')}</span>
      <span class="adm-badge ${x.verificationStatus === 'pending' ? 'off' : ''}">${esc(x.verificationStatus || 'approved')}</span>
      <small>${esc(x.address || x.description || '')}${x.ownerId ? ' · has owner' : ' · no owner'}</small>
      ${map ? `<small style="display:block"><a href="${map}" target="_blank" rel="noopener">📍 Map</a></small>` : ''}
      </div>
      <button class="adm-btn" data-edit="${x.id}">Edit</button><button class="adm-btn danger" data-del="${x.id}">Delete</button></div>`;
    }).join('') || '<p class="adm-note">No restaurants yet.</p>'}</div>`;
  bindImageUpload(document.getElementById('r-img-box'), { currentUrl: r.image || '' });
  bindImageUpload(document.getElementById('r-cover-box'), { currentUrl: r.coverImage || '' });
  document.getElementById('r-save').onclick = () => {
    if (!val('r-name')) return showToast('Name is required', 'error');
    const data = {
      name: val('r-name'), description: val('r-desc'),
      image: getUploadedImageUrl(document.getElementById('r-img-box')),
      coverImage: getUploadedImageUrl(document.getElementById('r-cover-box')),
      address: val('r-addr'), phone: val('r-phone'),
      deliveryTime: val('r-time'), active: document.getElementById('r-active').checked,
      status: document.getElementById('r-status').value,
      verificationStatus: document.getElementById('r-verify').value,
      ownerId: r.ownerId || null
    };
    if (val('r-dist') !== '') data.distance = num('r-dist');
    if (val('r-lat') !== '') data.lat = num('r-lat');
    if (val('r-lng') !== '') data.lng = num('r-lng');
    run(() => saveRestaurant(data, edit?.id), edit ? 'Restaurant updated' : 'Restaurant added');
  };
  document.getElementById('r-cancel')?.addEventListener('click', load);
  view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { renderRestaurants(view, cache.restaurants.find(x => x.id === b.dataset.edit)); scrollTo(0, 0); });
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirm('Delete this restaurant? Its products stay but should be removed or moved.') && run(() => deleteRestaurant(b.dataset.del), 'Restaurant deleted'));
}

/* ---------------- Categories ---------------- */
function renderCategories(view) {
  view.innerHTML = `<div class="adm-box"><h2>Add category</h2>
    <div class="adm-form"><label>Name *<input id="c-name" placeholder="e.g. Biryani"></label><label>Sort order<input id="c-sort" type="number" value="${cache.categories.length + 1}"></label>
    <div class="full"><button class="adm-btn primary" id="c-save">Add category</button></div></div>
    <p class="adm-note" style="text-align:left;padding:8px 0 0">Optional: categories used by products also appear on the home page automatically.</p></div>
    <div class="adm-box"><h3>Categories (${cache.categories.length})</h3>${cache.categories.map(c => `<div class="adm-row"><div class="grow"><strong>${esc(c.name)}</strong></div><button class="adm-btn danger" data-del="${c.id}">Delete</button></div>`).join('') || '<p class="adm-note">None yet.</p>'}</div>`;
  document.getElementById('c-save').onclick = () => val('c-name') ? run(() => saveCategory({ name: val('c-name'), sortOrder: num('c-sort'), active: true }), 'Category added') : showToast('Name is required', 'error');
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => run(() => deleteCategory(b.dataset.del), 'Category deleted'));
}

/* ---------------- Orders ---------------- */
const STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'delivering', 'completed', 'cancelled'];
function renderOrders(view, orders) {
  view.innerHTML = `<div class="adm-box"><h3>Orders (${orders.length})</h3>${orders.map(o => `
    <div class="adm-order"><strong>${esc(o.restaurantName || 'Order')}</strong> · ${formatCurrency(o.total || 0)} · <span class="adm-badge">${esc(o.status)}</span>
      <small style="display:block;color:var(--text-muted)">${formatDateTime(o.createdAt)} · ${esc(o.address?.name || '')} · <a href="tel:${esc(o.address?.phone || '')}">${esc(o.address?.phone || '')}</a> · ${esc(o.paymentMethod || '')}</small>
      <small style="display:block">${esc(o.address?.detail || '')}</small>
      <small style="display:block">${(o.items || []).map(i => `${i.quantity}× ${esc(i.name)}`).join(', ')}${o.notes ? ' — Note: ' + esc(o.notes) : ''}</small>
      <div class="adm-form" data-o="${o.id}">
        <label>Status<select class="o-status">${STATUSES.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Rider name<input class="o-dname" value="${esc(o.driverName || '')}"></label>
        <label>Rider phone<input class="o-dphone" value="${esc(o.driverPhone || '')}"></label>
        <div class="full"><button class="adm-btn primary o-save">Update order</button></div></div></div>`).join('') || '<p class="adm-note">No orders yet.</p>'}</div>`;
  view.querySelectorAll('.o-save').forEach(b => b.onclick = () => {
    const f = b.closest('[data-o]');
    run(() => updateOrderStatus(f.dataset.o, f.querySelector('.o-status').value,
      { driverName: f.querySelector('.o-dname').value.trim(), driverPhone: f.querySelector('.o-dphone').value.trim() }), 'Order updated');
  });
}


/* ---------------- Dashboard / Sales ---------------- */
function renderDashboard(view) {
  const orders = cache.orders || [];
  const completed = orders.filter(o => o.status === 'completed');
  const active = orders.filter(o => !['completed', 'cancelled'].includes(o.status));
  const revenue = completed.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const today = new Date(); today.setHours(0,0,0,0);
  const todayOrders = orders.filter(o => {
    try {
      const d = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      return d >= today;
    } catch { return false; }
  });
  const todayRev = todayOrders.filter(o => o.status === 'completed').reduce((s, o) => s + (Number(o.total) || 0), 0);

  view.innerHTML = `
    <div class="dash-grid">
      <div class="dash-card"><div class="dash-val">${formatCurrency(revenue)}</div><div class="dash-lbl">Total sales</div></div>
      <div class="dash-card"><div class="dash-val">${formatCurrency(todayRev)}</div><div class="dash-lbl">Today sales</div></div>
      <div class="dash-card"><div class="dash-val">${orders.length}</div><div class="dash-lbl">All orders</div></div>
      <div class="dash-card"><div class="dash-val">${active.length}</div><div class="dash-lbl">Active orders</div></div>
      <div class="dash-card"><div class="dash-val">${completed.length}</div><div class="dash-lbl">Completed</div></div>
      <div class="dash-card"><div class="dash-val">${cache.restaurants.length}</div><div class="dash-lbl">Restaurants</div></div>
      <div class="dash-card"><div class="dash-val">${cache.products.length}</div><div class="dash-lbl">Products</div></div>
      <div class="dash-card"><div class="dash-val">${todayOrders.length}</div><div class="dash-lbl">Orders today</div></div>
    </div>
    <div class="adm-box">
      <h3>Recent orders</h3>
      ${orders.slice(0, 8).map(o => `
        <div class="adm-order">
          <strong>${esc(o.restaurantName || 'Order')}</strong> · ${formatCurrency(o.total || 0)}
          · <span class="adm-badge">${esc(o.status)}</span>
          <small style="display:block;color:var(--text-muted)">${formatDateTime(o.createdAt)} · ${esc(o.address?.name || '')}</small>
        </div>`).join('') || '<p class="adm-note">No orders yet.</p>'}
    </div>`;
}

/* ---------------- Users & Roles (no UID paste needed) ---------------- */
function renderUsers(view) {
  const q = (userFilter.q || '').toLowerCase();
  const roleF = userFilter.role || 'all';
  let list = cache.users || [];
  if (roleF !== 'all') list = list.filter(u => (u.role || 'customer') === roleF);
  if (q) {
    list = list.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q)
    );
  }

  const restOpts = cache.restaurants.map(r =>
    `<option value="${r.id}">${esc(r.name)}${r.ownerId ? ' (has owner)' : ''}</option>`
  ).join('');

  view.innerHTML = `
    <div class="adm-box">
      <h2>Users & Roles</h2>
      <p class="adm-note" style="text-align:left;padding:0 0 12px">
        Users register on <code>login.html</code>. Filter below, then set role to <strong>restaurant</strong> or <strong>rider</strong>.
        For shop: pick which restaurant they own — Owner UID is set automatically.
      </p>
      <div class="adm-form" style="margin-bottom:12px">
        <label class="full">Search<input id="u-search" value="${esc(userFilter.q)}" placeholder="Name, email, phone…"></label>
        <label>Role filter
          <select id="u-role-filter">
            <option value="all" ${roleF === 'all' ? 'selected' : ''}>All</option>
            <option value="customer" ${roleF === 'customer' ? 'selected' : ''}>Customer</option>
            <option value="restaurant" ${roleF === 'restaurant' ? 'selected' : ''}>Restaurant</option>
            <option value="rider" ${roleF === 'rider' ? 'selected' : ''}>Rider</option>
          </select>
        </label>
      </div>
      <p class="adm-note" style="text-align:left">${list.length} user(s)</p>
      ${list.map(u => {
        const role = u.role || 'customer';
        return `
        <div class="adm-row" style="flex-wrap:wrap;align-items:flex-start;gap:8px" data-uid="${u.id}">
          <div class="grow" style="min-width:160px">
            <strong>${esc(u.name || u.email || 'User')}</strong>
            <span class="adm-badge ${role === 'restaurant' ? '' : role === 'rider' ? '' : 'off'}">${esc(role)}</span>
            <small style="display:block">${esc(u.email || '')}${u.phone ? ' · ' + esc(u.phone) : ''}</small>
            ${u.restaurantId ? `<small style="display:block;color:var(--text-muted)">Shop: ${esc((cache.restaurants.find(r => r.id === u.restaurantId) || {}).name || u.restaurantId)}</small>` : ''}
          </div>
          <div class="adm-form" style="flex:1;min-width:220px;margin:0;padding:0;border:0;box-shadow:none">
            <label style="margin:0">Role
              <select class="u-role">
                <option value="customer" ${role === 'customer' ? 'selected' : ''}>customer</option>
                <option value="restaurant" ${role === 'restaurant' ? 'selected' : ''}>restaurant (shop)</option>
                <option value="rider" ${role === 'rider' ? 'selected' : ''}>rider</option>
              </select>
            </label>
            <label style="margin:0">Restaurant (if shop)
              <select class="u-rest">
                <option value="">— none —</option>
                ${cache.restaurants.map(r =>
                  `<option value="${r.id}" ${u.restaurantId === r.id || u.id === r.ownerId ? 'selected' : ''}>${esc(r.name)}</option>`
                ).join('')}
              </select>
            </label>
            <div class="full"><button class="adm-btn primary u-save" type="button">Save role</button></div>
          </div>
        </div>`;
      }).join('') || '<p class="adm-note">No users yet. Ask them to Sign Up on login.html.</p>'}
    </div>
    <div class="adm-box">
      <h3>Quick guide</h3>
      <ul style="font-size:.9rem;line-height:1.6;padding-left:18px;color:var(--text-secondary)">
        <li><strong>Restaurant:</strong> set role + pick restaurant → they open <code>/shop.html</code></li>
        <li><strong>Rider:</strong> set role = rider → they open <code>/rider.html</code></li>
        <li>No need to copy Firebase UID anymore</li>
      </ul>
    </div>`;

  const applyFilter = () => {
    userFilter.q = document.getElementById('u-search')?.value || '';
    userFilter.role = document.getElementById('u-role-filter')?.value || 'all';
    renderUsers(view);
  };
  document.getElementById('u-search')?.addEventListener('input', () => {
    clearTimeout(window._uf);
    window._uf = setTimeout(applyFilter, 250);
  });
  document.getElementById('u-role-filter')?.addEventListener('change', applyFilter);

  view.querySelectorAll('.u-save').forEach(btn => {
    btn.onclick = async () => {
      const row = btn.closest('[data-uid]');
      const uid = row.dataset.uid;
      const role = row.querySelector('.u-role').value;
      const restId = row.querySelector('.u-rest').value;
      try {
        const extra = {};
        if (role === 'restaurant' && restId) {
          extra.restaurantId = restId;
          const rest = cache.restaurants.find(r => r.id === restId);
          if (rest) {
            await saveRestaurant({
              name: rest.name,
              description: rest.description || '',
              image: rest.image || '',
              coverImage: rest.coverImage || '',
              deliveryTime: rest.deliveryTime || '',
              active: rest.active !== false,
              ownerId: uid,
              status: rest.status || 'open',
              address: rest.address || '',
              phone: rest.phone || '',
              ...(rest.distance != null ? { distance: rest.distance } : {}),
              ...(rest.lat != null ? { lat: rest.lat, lng: rest.lng } : {})
            }, restId);
          }
        }
        if (role === 'customer' || role === 'rider') {
          extra.restaurantId = null;
        }
        if (role === 'rider') {
          extra.riderOnline = false;
        }
        await setUserRole(uid, role, extra);
        showToast(`Saved: ${role}`, 'success');
        cache.users = await getAllUsers();
        cache.restaurants = await getRestaurants({ includeInactive: true });
        renderUsers(view);
      } catch (e) {
        console.error(e);
        showToast('Failed: ' + e.message, 'error');
      }
    };
  });
}


/* ---------------- Coupons ---------------- */
function renderCoupons(view, edit = null) {
  const c = edit || {};
  view.innerHTML = `
    <div class="adm-box">
      <h2>${edit ? 'Edit coupon' : 'Add coupon'}</h2>
      <div class="adm-form">
        <label>Code *<input id="cp-code" value="${esc(c.code || '')}" placeholder="SAVE50" style="text-transform:uppercase"></label>
        <label>Type
          <select id="cp-type">
            <option value="fixed" ${(c.type || 'fixed') === 'fixed' ? 'selected' : ''}>Fixed ৳</option>
            <option value="percent" ${c.type === 'percent' ? 'selected' : ''}>Percent %</option>
          </select>
        </label>
        <label>Value *<input id="cp-val" type="number" min="0" value="${c.value ?? ''}"></label>
        <label>Min order ৳<input id="cp-min" type="number" min="0" value="${c.minOrder ?? 0}"></label>
        <label>Max discount ৳<input id="cp-max" type="number" min="0" value="${c.maxDiscount ?? ''}" placeholder="optional"></label>
        <label>Usage limit<input id="cp-limit" type="number" min="0" value="${c.usageLimit ?? ''}" placeholder="unlimited"></label>
        <label>End date<input id="cp-end" type="date" value="${c.endAt ? String(c.endAt).slice(0,10) : ''}"></label>
        <label class="adm-check"><input id="cp-active" type="checkbox" ${c.active !== false ? 'checked' : ''}> Active</label>
        <div class="full">
          <button class="adm-btn primary" id="cp-save">${edit ? 'Save' : 'Add coupon'}</button>
          ${edit ? '<button class="adm-btn" id="cp-cancel">Cancel</button>' : ''}
        </div>
      </div>
    </div>
    <div class="adm-box">
      <h3>Coupons (${(cache.coupons || []).length})</h3>
      ${(cache.coupons || []).map(x => `
        <div class="adm-row">
          <div class="grow">
            <strong>${esc(x.code)}</strong>
            ${x.active === false ? '<span class="adm-badge off">off</span>' : ''}
            <small>${x.type === 'percent' ? x.value + '%' : '৳' + x.value}
              ${x.minOrder ? ' · min ৳' + x.minOrder : ''}
              · used ${x.usedCount || 0}${x.usageLimit != null ? '/' + x.usageLimit : ''}
            </small>
          </div>
          <button class="adm-btn" data-edit="${x.id}">Edit</button>
          <button class="adm-btn danger" data-del="${x.id}">Delete</button>
        </div>`).join('') || '<p class="adm-note">No coupons yet.</p>'}
    </div>`;
  document.getElementById('cp-save').onclick = () => {
    if (!val('cp-code') || val('cp-val') === '') return showToast('Code and value required', 'error');
    const data = {
      code: val('cp-code').toUpperCase(),
      type: document.getElementById('cp-type').value,
      value: num('cp-val'),
      minOrder: num('cp-min') || 0,
      active: document.getElementById('cp-active').checked,
      usedCount: c.usedCount || 0
    };
    if (val('cp-max') !== '') data.maxDiscount = num('cp-max');
    if (val('cp-limit') !== '') data.usageLimit = num('cp-limit');
    if (val('cp-end')) data.endAt = val('cp-end');
    run(() => saveCoupon(data, edit?.id), edit ? 'Coupon updated' : 'Coupon added');
  };
  document.getElementById('cp-cancel')?.addEventListener('click', load);
  view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    renderCoupons(view, (cache.coupons || []).find(x => x.id === b.dataset.edit));
    scrollTo(0, 0);
  });
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirm('Delete coupon?') && run(() => deleteCoupon(b.dataset.del), 'Deleted'));
}

/* ---------------- Promos ---------------- */
function renderPromos(view, edit = null) {
  const p = edit || {};
  view.innerHTML = `
    <div class="adm-box">
      <h2>${edit ? 'Edit promo' : 'Add promo / banner'}</h2>
      <div class="adm-form">
        <label class="full">Title *<input id="pr-title" value="${esc(p.title || '')}"></label>
        <label class="full">Description<textarea id="pr-desc" rows="2">${esc(p.description || '')}</textarea></label>
        <label>Code (optional)<input id="pr-code" value="${esc(p.code || '')}"></label>
        <label>Link<input id="pr-link" value="${esc(p.link || '')}" placeholder="index.html#menu"></label>
        <label>Sort order<input id="pr-sort" type="number" value="${p.sortOrder ?? 0}"></label>
        <label class="adm-check"><input id="pr-home" type="checkbox" ${p.showOnHome ? 'checked' : ''}> Show on home banner</label>
        <label class="adm-check"><input id="pr-active" type="checkbox" ${p.active !== false ? 'checked' : ''}> Active</label>
        <div class="full">
          <button class="adm-btn primary" id="pr-save">${edit ? 'Save' : 'Add promo'}</button>
          ${edit ? '<button class="adm-btn" id="pr-cancel">Cancel</button>' : ''}
        </div>
      </div>
    </div>
    <div class="adm-box">
      <h3>Promos (${(cache.promos || []).length})</h3>
      ${(cache.promos || []).map(x => `
        <div class="adm-row">
          <div class="grow">
            <strong>${esc(x.title || 'Promo')}</strong>
            ${x.active === false ? '<span class="adm-badge off">off</span>' : ''}
            ${x.showOnHome ? '<span class="adm-badge">home</span>' : ''}
            <small>${esc(x.description || '')}</small>
          </div>
          <button class="adm-btn" data-edit="${x.id}">Edit</button>
          <button class="adm-btn danger" data-del="${x.id}">Delete</button>
        </div>`).join('') || '<p class="adm-note">No promos. Add one for home banner.</p>'}
    </div>`;
  document.getElementById('pr-save').onclick = () => {
    if (!val('pr-title')) return showToast('Title required', 'error');
    const data = {
      title: val('pr-title'),
      description: val('pr-desc'),
      code: val('pr-code'),
      link: val('pr-link') || 'index.html',
      sortOrder: num('pr-sort'),
      showOnHome: document.getElementById('pr-home').checked,
      active: document.getElementById('pr-active').checked
    };
    run(() => savePromo(data, edit?.id), edit ? 'Promo updated' : 'Promo added');
  };
  document.getElementById('pr-cancel')?.addEventListener('click', load);
  view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    renderPromos(view, (cache.promos || []).find(x => x.id === b.dataset.edit));
    scrollTo(0, 0);
  });
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirm('Delete promo?') && run(() => deletePromo(b.dataset.del), 'Deleted'));
}

/* ---------------- Support tickets ---------------- */
function renderSupport(view) {
  const list = cache.tickets || [];
  view.innerHTML = `
    <div class="adm-box">
      <h2>Support tickets (${list.length})</h2>
      ${list.map(t => `
        <div class="adm-order">
          <strong>${esc(t.subject || 'Ticket')}</strong>
          · <span class="adm-badge">${esc(t.status || 'open')}</span>
          <small style="display:block;color:var(--text-muted)">${formatDateTime(t.createdAt)} · ${esc(t.userEmail || t.userId || '')}</small>
          <small style="display:block">${esc(t.message || '')}</small>
          ${t.orderId ? `<small style="display:block">Order: ${esc(t.orderId)}</small>` : ''}
          ${t.status !== 'resolved' ? `
            <div style="margin-top:8px">
              <button class="adm-btn primary" data-resolve="${t.id}">Mark resolved</button>
            </div>` : ''}
        </div>`).join('') || '<p class="adm-note">No tickets yet.</p>'}
    </div>`;
  view.querySelectorAll('[data-resolve]').forEach(b => {
    b.onclick = () => run(() => updateTicketStatus(b.dataset.resolve, 'resolved'), 'Ticket resolved');
  });
}
