/**
 * Khabar Ghor - Search Page + Results
 * Uses cached product/restaurant lists for fast results.
 */
import { searchProducts, getRestaurants } from './firestore.js';
import { renderProductTile, showToast } from './ui.js';
import { debounce, escapeHtml, showEmpty, getQueryParam } from './utils.js';
import { addToCart, updateCartBadge } from './cart.js';
import { isFirebaseConfigured } from './firebase-config.js';

let allRestaurants = [];

document.addEventListener('DOMContentLoaded', async () => {
  updateCartBadge();
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  if (!isFirebaseConfigured) {
    showEmpty(results, 'Firebase is not set up yet.', '⚙️');
    return;
  }

  // Prefetch restaurants for instant restaurant matches
  try {
    allRestaurants = await getRestaurants();
  } catch { allRestaurants = []; }

  // Pre-fill from URL ?q=
  const initial = getQueryParam('q') || '';
  if (initial) {
    input.value = initial;
    await doSearch(initial);
  }

  input.addEventListener('input', debounce((e) => {
    doSearch(e.target.value.trim());
  }, 200));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch(input.value.trim());
    }
  });

  // Add / Buy buttons + product tile click → product page
  results.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.btn-add');
    const buyBtn = e.target.closest('.btn-buy');
    if (addBtn || buyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = (addBtn || buyBtn).dataset.id;
      import('./firestore.js').then(async ({ getProduct }) => {
        const p = await getProduct(id);
        if (!p) return;
        const result = addToCart(p, { id: p.restaurantId, name: p.restaurantName });
        if (buyBtn && Array.isArray(result) && result.length) {
          window.location.href = 'cart.html';
        }
      });
      return;
    }
    const tile = e.target.closest('.product-tile');
    if (tile && !e.target.closest('a, button')) {
      window.location.href = `product.html?id=${tile.dataset.id}`;
    }
  });
});

async function doSearch(term) {
  const results = document.getElementById('search-results');
  if (!term) {
    results.innerHTML = `
      <div class="empty-state" style="padding-top:48px;">
        <div class="empty-icon">🔍</div>
        <p>Type to search food or restaurants</p>
      </div>`;
    return;
  }

  results.innerHTML = '<div class="loading-container" style="min-height:30vh;"><div class="spinner"></div><p>Searching...</p></div>';

  try {
    const [products, restos] = await Promise.all([
      searchProducts(term),
      Promise.resolve(
        allRestaurants.filter(r =>
          (r.name || '').toLowerCase().includes(term.toLowerCase()) ||
          (r.description || '').toLowerCase().includes(term.toLowerCase())
        )
      )
    ]);

    if (!products.length && !restos.length) {
      showEmpty(results, `Nothing found for "${term}"`, '🔍');
      return;
    }

    let html = '';

    if (restos.length) {
      html += `<div class="search-section"><h3 class="search-section-title">Restaurants (${restos.length})</h3>
        <div class="search-resto-list">
          ${restos.slice(0, 8).map(r => `
            <a href="restaurant.html?id=${r.id}" class="search-resto-item">
              <div class="search-resto-img">
                ${r.image ? `<img src="${escapeHtml(r.image)}" alt="" loading="lazy">` : '<span>🍽️</span>'}
              </div>
              <div>
                <strong>${escapeHtml(r.name)}</strong>
                ${r.deliveryTime ? `<div class="search-resto-meta">⏱ ${escapeHtml(r.deliveryTime)}</div>` : ''}
              </div>
            </a>
          `).join('')}
        </div></div>`;
    }

    if (products.length) {
      html += `<div class="search-section"><h3 class="search-section-title">Food (${products.length})</h3>
        <div class="product-grid">${products.map(p => renderProductTile(p)).join('')}</div></div>`;
    }

    results.innerHTML = html;
  } catch (err) {
    console.error(err);
    showEmpty(results, 'Search failed. Check internet.', '⚠️');
  }
}
