/**
 * Khabar Ghor - Home Page
 * Shows the PRODUCTS added from the admin panel (admin.html). No demo data.
 */
import { renderBottomNav, renderProductTile, renderCategoryItem, renderSkeletonCards, renderRestaurantCard } from './ui.js';
import { getCategories, getProducts, getPromos, getRestaurants } from './firestore.js';
import { isFirebaseConfigured, SUPPORT_WHATSAPP, WHATSAPP_READY } from './firebase-config.js';
import { debounce, showEmpty, showError, escapeHtml } from './utils.js';
import { addToCart, updateCartBadge } from './cart.js';

let allProducts = [];
let allRestaurants = [];
let activeCategory = 'All';
let searchTerm = '';

const SNAP_KEY = 'kg_home_v1';
const hideSplash = () => { try { window.kgHideSplash && window.kgHideSplash(); } catch { /* ignore */ } };

/** Last successful home data – lets the page paint instantly on the next visit */
function readSnapshot() {
  try { return JSON.parse(localStorage.getItem(SNAP_KEY) || 'null'); } catch { return null; }
}
function saveSnapshot(d) {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify({
      products: d.products.slice(0, 60), restaurants: d.restaurants.slice(0, 12), banner: d.banner, cats: d.cats
    }));
  } catch { /* storage full – ignore */ }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('bottom-nav').innerHTML = renderBottomNav('home');

  if (!localStorage.getItem('khabarghor_visited')) {
    document.getElementById('splash-view').style.display = 'flex';
    document.getElementById('home-view').style.display = 'none';
    document.getElementById('start-btn').addEventListener('click', () => {
      localStorage.setItem('khabarghor_visited', '1');
      document.getElementById('splash-view').style.display = 'none';
      document.getElementById('home-view').style.display = 'block';
    });
  }

  updateCartBadge();

  // WhatsApp button only when a real number is configured
  const wa = document.getElementById('wa-support');
  if (wa && WHATSAPP_READY) {
    wa.href = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('Assalamualaikum, Khabar Ghor support lagbe.')}`;
    wa.style.display = '';
  }

  // Notification bell only (not the cart icon)
  document.querySelector('.header-actions .notif-btn:not(.cart-header-btn)')?.addEventListener('click', () => {
    window.location.href = 'notifications.html';
  });
  import('./notifications.js').then(m => m.updateNotifDot()).catch(() => {});

  const grid = document.getElementById('products-grid');
  if (!isFirebaseConfigured) {
    showEmpty(grid, 'Firebase is not set up yet. Open js/firebase-config.js and paste your keys (see README).', '⚙️');
    hideSplash();
    return;
  }

  // ---- event listeners first, so the page is usable while data loads ----
  const searchInput = document.getElementById('home-search');
  searchInput.addEventListener('input', debounce((e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  }, 250));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = searchInput.value.trim();
      if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
      else window.location.href = 'search.html';
    }
  });
  // Clicking the search bar area can also open full search
  searchInput.closest('.search-bar')?.addEventListener('click', (e) => {
    if (e.target === searchInput) return;
    window.location.href = 'search.html' + (searchInput.value.trim() ? `?q=${encodeURIComponent(searchInput.value.trim())}` : '');
  });

  const catList = document.getElementById('categories-list');
  catList.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-item');
    if (!btn) return;
    catList.querySelectorAll('.category-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.name;
    render();
  });

  grid.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.btn-add');
    const buyBtn = e.target.closest('.btn-buy');
    if (!addBtn && !buyBtn) return;
    e.preventDefault();
    e.stopPropagation();
    const id = (addBtn || buyBtn).dataset.id;
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    const result = addToCart(p, { id: p.restaurantId, name: p.restaurantName });
    if (buyBtn && Array.isArray(result) && result.length) {
      window.location.href = 'cart.html';
    }
  });

  // ---- 1) instant paint from the last visit ----
  const snap = readSnapshot();
  if (snap?.products?.length) {
    applyHome(snap);
    hideSplash();
  } else {
    grid.innerHTML = renderSkeletonCards(4);
  }

  // ---- 2) fresh data from Firebase ----
  try {
    const fresh = await fetchHome();
    applyHome(fresh);
    saveSnapshot(fresh);
  } catch (err) {
    console.error(err);
    if (!snap?.products?.length) showError(grid, 'Could not load menu. Check your internet / Firebase rules.');
  }
  hideSplash();
});

async function fetchHome() {
  const [products, restaurants, promos, cats] = await Promise.all([
    getProducts(),
    getRestaurants(),
    getPromos().catch(() => []),
    getCategories().catch(() => [])
  ]);
  const banner = promos.find(p => p.showOnHome) || promos[0] || null;
  return { products, restaurants, banner, cats: cats.map(c => c.name) };
}

function applyHome(d) {
  allProducts = d.products || [];
  allRestaurants = d.restaurants || [];
  renderBanner(d.banner);
  renderRestaurants();
  renderCategories(d.cats || []);
  renderHeroPhoto();
  render();
}

/** Hero picture = a real photo from your own menu / restaurants (no stock image) */
function renderHeroPhoto() {
  const art = document.getElementById('hero-art');
  if (!art) return;
  const src = allProducts.find(p => p.image)?.image
    || allRestaurants.find(r => r.coverImage || r.image)?.coverImage
    || allRestaurants.find(r => r.image)?.image;
  if (!src || art.dataset.src === src) return;
  art.dataset.src = src;
  art.innerHTML = `<img src="${escapeHtml(src)}" alt="" decoding="async" fetchpriority="high">`;
}

function renderRestaurants() {
  const section = document.getElementById('restaurants-section');
  const list = document.getElementById('home-restaurants');
  if (!section || !list) return;
  if (!allRestaurants.length) {
    section.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  section.style.display = '';
  list.innerHTML = allRestaurants.slice(0, 4)
    .map(restaurant => renderRestaurantCard(restaurant, { showFavourite: false }))
    .join('');
}

function renderBanner(banner) {
  const el = document.getElementById('home-banner');
  if (!el) return;
  if (!banner) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = `
    <div class="promo-banner promo-plain">
      <div class="promo-banner-content">
        <h3>${escapeHtml(banner.title || '')}</h3>
        <p>${escapeHtml(banner.description || '')}</p>
        ${banner.link ? `<a href="${escapeHtml(banner.link)}" class="btn btn-white btn-sm">View</a>` : '<a href="#menu" class="btn btn-white btn-sm">Order Now</a>'}
      </div>
    </div>`;
}

function renderCategories(catNames) {
  const container = document.getElementById('categories-list');
  // Admin-defined categories that are used by at least one product
  const used = allProducts.map(p => p.category).filter(Boolean);
  const names = [...new Set([...catNames, ...used])].filter(n => used.includes(n));
  if (!names.length) { container.parentElement.style.display = 'none'; return; }
  container.parentElement.style.display = '';
  if (activeCategory !== 'All' && !names.includes(activeCategory)) activeCategory = 'All';
  container.innerHTML = ['All', ...names].map(n => renderCategoryItem({ id: n, name: n }, n === activeCategory)).join('');
}

function render() {
  const grid = document.getElementById('products-grid');
  const list = allProducts.filter(p =>
    (activeCategory === 'All' || p.category === activeCategory) &&
    (!searchTerm || (p.name || '').toLowerCase().includes(searchTerm) ||
      (p.restaurantName || '').toLowerCase().includes(searchTerm) ||
      (p.description || '').toLowerCase().includes(searchTerm)));

  document.getElementById('menu-title').textContent = activeCategory === 'All' ? 'Our Menu' : activeCategory;

  if (!allProducts.length) {
    showEmpty(grid, 'No food items yet. Add products from the admin panel.', '🍽️');
    return;
  }
  if (!list.length) { showEmpty(grid, 'Nothing found', '🔍'); return; }
  grid.innerHTML = list.map(p => renderProductTile(p)).join('');
}
