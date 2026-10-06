/**
 * Khabar Ghor - Home Page
 * Shows the PRODUCTS added from the admin panel (admin.html). No demo data.
 */
import { renderBottomNav, renderProductTile, renderCategoryItem, renderSkeletonCards, showToast } from './ui.js';
import { getCategories, getProducts, getPromos } from './firestore.js';
import { isFirebaseConfigured } from './firebase-config.js';
import { debounce, showEmpty, showError, escapeHtml } from './utils.js';
import { addToCart, updateCartBadge } from './cart.js';

let allProducts = [];
let activeCategory = 'All';
let searchTerm = '';

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

  // WhatsApp number from config
  import('./firebase-config.js').then(({ SUPPORT_WHATSAPP }) => {
    const wa = document.getElementById('wa-support');
    if (wa && SUPPORT_WHATSAPP) {
      wa.href = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('Assalamualaikum, Khabar Ghor support lagbe.')}`;
    }
  }).catch(() => {});

  // Notification bell only (not the cart icon)
  document.querySelector('.header-actions .notif-btn:not(.cart-header-btn)')?.addEventListener('click', () => {
    window.location.href = 'notifications.html';
  });
  import('./notifications.js').then(m => m.updateNotifDot()).catch(() => {});

  const grid = document.getElementById('products-grid');
  if (!isFirebaseConfigured) {
    showEmpty(grid, 'Firebase is not set up yet. Open js/firebase-config.js and paste your keys (see README).', '⚙️');
    return;
  }

  grid.innerHTML = renderSkeletonCards(4);
  try {
    const [products] = await Promise.all([
      getProducts(),
      loadHomeBanner()
    ]);
    allProducts = products;
    await loadCategories();
    render();
  } catch (err) {
    console.error(err);
    showError(grid, 'Could not load menu. Check your internet / Firebase rules.');
  }

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
});

async function loadHomeBanner() {
  const el = document.getElementById('home-banner');
  if (!el) return;
  try {
    const promos = await getPromos();
    const banner = promos.find(p => p.showOnHome) || promos[0];
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
  } catch {
    el.style.display = 'none';
  }
}

async function loadCategories() {
  const container = document.getElementById('categories-list');
  // Admin-defined categories + any category used by a product
  let cats = [];
  try { cats = (await getCategories()).map(c => c.name); } catch (e) { /* optional */ }
  const used = allProducts.map(p => p.category).filter(Boolean);
  const names = [...new Set([...cats, ...used])].filter(n => used.includes(n));
  if (!names.length) { container.parentElement.style.display = 'none'; return; }

  container.innerHTML = ['All', ...names].map((n, i) => renderCategoryItem({ id: n, name: n }, i === 0)).join('');
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-item');
    if (!btn) return;
    container.querySelectorAll('.category-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.name;
    render();
  });
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
