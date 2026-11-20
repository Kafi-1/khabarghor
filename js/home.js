/**
 * Khabar Ghor - Home Page
 * Shows the PRODUCTS added from the admin panel (admin.html). No demo data.
 */
import { renderBottomNav, renderProductTile, renderCategoryItem, renderSkeletonCards } from './ui.js';
import { getCategories, getProducts, getBanners } from './firestore.js';
import { isFirebaseConfigured, SUPPORT_WHATSAPP, WHATSAPP_READY } from './firebase-config.js';
import { debounce, showEmpty, showError, escapeHtml } from './utils.js';
import { addToCart, updateCartBadge } from './cart.js';

let allProducts = [];
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
      products: d.products.slice(0, 60),
      banners: (d.banners || []).slice(0, 6), cats: d.cats
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

  // ---- endless scroll: keep loading more food as you swipe down ----
  window.addEventListener('scroll', maybeExtendFeed, { passive: true });

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
  const [products, banners, cats] = await Promise.all([
    getProducts(),
    getBanners().catch(() => []),
    getCategories().catch(() => [])
  ]);
  return { products, banners, cats: cats.map(c => c.name) };
}

function applyHome(d) {
  allProducts = d.products || [];
  renderSlider(d.banners || []);
  renderCategories(d.cats || []);
  render();
}

/* -------- Hero slider (banners managed from the admin panel) -------- */
let sliderTimer = null;

function renderSlider(banners) {
  const el = document.getElementById('home-slider');
  if (!el) return;
  if (sliderTimer) { clearInterval(sliderTimer); sliderTimer = null; }
  if (!banners.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML = `
    <div class="kg-slider-track" id="slider-track">
      ${banners.map(b => `
        <a class="kg-slide" href="${escapeHtml(b.link || 'restaurants.html')}">
          ${b.image
            ? `<img src="${escapeHtml(b.image)}" alt="${escapeHtml(b.title || '')}" decoding="async">`
            : '<div class="kg-slide-fallback">🍽️</div>'}
          <div class="kg-slide-cap">
            ${b.title ? `<strong>${escapeHtml(b.title)}</strong>` : ''}
            ${b.subtitle ? `<span>${escapeHtml(b.subtitle)}</span>` : ''}
          </div>
        </a>`).join('')}
    </div>
    <div class="kg-slider-dots" aria-hidden="true">
      ${banners.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}
    </div>`;

  const track = el.querySelector('#slider-track');
  const dots = [...el.querySelectorAll('.kg-slider-dots i')];
  let idx = 0;
  const paint = (i) => dots.forEach((d, j) => d.classList.toggle('on', j === i));
  const go = (i) => {
    idx = i;
    track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' });
    paint(i);
  };
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (i !== idx) { idx = i; paint(i); }
  }, { passive: true });
  if (banners.length > 1) {
    sliderTimer = setInterval(() => go((idx + 1) % banners.length), 4500);
  }
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

/* -------- Endless product feed -------- */
const FEED_BATCH = 8;
let feed = { list: [], idx: 0 };
let lastAppend = 0;

function render() {
  const grid = document.getElementById('products-grid');
  const list = allProducts.filter(p =>
    (activeCategory === 'All' || p.category === activeCategory) &&
    (!searchTerm || (p.name || '').toLowerCase().includes(searchTerm) ||
      (p.restaurantName || '').toLowerCase().includes(searchTerm) ||
      (p.description || '').toLowerCase().includes(searchTerm)));

  document.getElementById('menu-title').textContent = activeCategory === 'All' ? 'Our Menu' : activeCategory;

  feed = { list, idx: 0 };
  grid.innerHTML = '';

  if (!allProducts.length) {
    showEmpty(grid, 'No food items yet. Add products from the admin panel.', '🍽️');
    return;
  }
  if (!list.length) { showEmpty(grid, 'Nothing found', '🔍'); return; }
  appendFeed();
}

/** Append the next batch; when the list runs out it starts over, so the feed never ends. */
function appendFeed() {
  const grid = document.getElementById('products-grid');
  if (!feed.list.length) return;
  const html = [];
  for (let i = 0; i < FEED_BATCH; i++) {
    html.push(renderProductTile(feed.list[feed.idx % feed.list.length]));
    feed.idx++;
  }
  grid.insertAdjacentHTML('beforeend', html.join(''));
  if (grid.children.length > 600) {
    for (let i = 0; i < 200; i++) grid.firstElementChild?.remove();
  }
}

function maybeExtendFeed() {
  if (!feed.list.length) return;
  const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 900;
  if (!nearBottom) return;
  const now = Date.now();
  if (now - lastAppend < 250) return;
  lastAppend = now;
  appendFeed();
}
