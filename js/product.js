/**
 * Khabar Ghor - Product Detail Page
 * Shows image, name, price, description, delivery time, restaurant, category etc.
 */
import { getProduct, getRestaurant, getCachedProduct } from './firestore.js';
import { getQueryParam, formatCurrency, escapeHtml, showError } from './utils.js';
import { addToCart, updateCartBadge } from './cart.js';

let product = null;
let restaurant = null;
let qty = 1;

document.addEventListener('DOMContentLoaded', async () => {
  const id = getQueryParam('id');
  if (!id) {
    window.location.href = 'index.html';
    return;
  }
  await loadProduct(id);
  updateCartBadge();
});

async function loadProduct(id) {
  const container = document.getElementById('product-content');

  // 1) Paint instantly from what the previous page already loaded
  const cachedProduct = getCachedProduct(id);
  if (cachedProduct && cachedProduct.available !== false) {
    product = cachedProduct;
    paint(container);
  }

  try {
    // 2) Fresh data (fast – cached for 90s after the first visit)
    product = await getProduct(id);
    if (!product || product.available === false) {
      showError(container, 'Product not found or unavailable');
      return;
    }
    document.title = `${product.name} - Khabar Ghor`;
    paint(container);

    // 3) Restaurant details fill in afterwards, without blocking the first paint
    if (product.restaurantId) {
      const r = await getRestaurant(product.restaurantId).catch(() => null);
      if (r) { restaurant = r; paint(container); }
    }
  } catch (err) {
    console.error(err);
    if (!product) showError(container, 'Could not load product. Check internet / Firebase.');
  }
}

function paint(container) {

    const photos = (product.images?.length ? product.images : (product.image ? [product.image] : [])).slice(0, 5);
    const img = photos.length > 1
      ? `<div class="pd-gallery">
           <div class="pd-gallery-track" id="pd-track">
             ${photos.map(u => `<img src="${escapeHtml(u)}" alt="${escapeHtml(product.name)}" loading="lazy">`).join('')}
           </div>
           <div class="pd-gallery-dots" aria-hidden="true">
             ${photos.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}
           </div>
         </div>`
      : photos.length
        ? `<img src="${escapeHtml(photos[0])}" alt="${escapeHtml(product.name)}" class="pd-hero-img">`
        : '<div class="pd-hero-placeholder">🍽️</div>';

    const restName = product.restaurantName || restaurant?.name || '';
    const restId = product.restaurantId || restaurant?.id || '';
    const deliveryTime = restaurant?.deliveryTime || product.deliveryTime || '';
    const rating = restaurant?.rating;
    const distance = restaurant?.distance;

    container.innerHTML = `
      <div class="pd-hero">
        ${img}
        <button class="hero-btn pd-back" onclick="history.back()" aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </div>

      <div class="pd-body">
        <div class="pd-header">
          <h1 class="pd-name">${escapeHtml(product.name)}</h1>
          <div class="pd-price">${formatCurrency(product.price || 0)}</div>
        </div>

        ${restName ? `
        <a href="restaurant.html?id=${encodeURIComponent(restId)}" class="pd-restaurant">
          <span class="pd-rest-icon">🏪</span>
          <span>${escapeHtml(restName)}</span>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </a>` : ''}

        <div class="pd-meta">
          ${product.category ? `<span class="pd-chip">📂 ${escapeHtml(product.category)}</span>` : ''}
          ${deliveryTime ? `<span class="pd-chip">⏱ ${escapeHtml(deliveryTime)}</span>` : ''}
          ${rating ? `<span class="pd-chip">⭐ ${rating}</span>` : ''}
          ${distance ? `<span class="pd-chip">📍 ${distance} km</span>` : ''}
          ${product.popular ? `<span class="pd-chip pd-chip-hot">🔥 Popular</span>` : ''}
        </div>

        ${product.description ? `
        <div class="pd-section">
          <h3>Description</h3>
          <p class="pd-desc">${escapeHtml(product.description)}</p>
        </div>` : ''}

        ${restaurant?.description ? `
        <div class="pd-section">
          <h3>About Restaurant</h3>
          <p class="pd-desc">${escapeHtml(restaurant.description)}</p>
        </div>` : ''}
      </div>
    `;

  document.getElementById('product-action-bar').classList.remove('hidden');
  bindGallery();
  bindActions();
}

function bindGallery() {
  const track = document.getElementById('pd-track');
  if (!track) return;
  const dots = [...document.querySelectorAll('.pd-gallery-dots i')];
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    dots.forEach((d, j) => d.classList.toggle('on', j === i));
  }, { passive: true });
}

function bindActions() {
  const qtyEl = document.getElementById('pd-qty');
  qtyEl.textContent = qty;
  document.getElementById('pd-minus').onclick = () => {
    if (qty > 1) { qty--; qtyEl.textContent = qty; }
  };
  document.getElementById('pd-plus').onclick = () => {
    qty++; qtyEl.textContent = qty;
  };

  const restInfo = () => ({ id: product.restaurantId, name: product.restaurantName || restaurant?.name });

  document.getElementById('pd-add').onclick = () => {
    addToCart(product, restInfo(), qty);
  };

  document.getElementById('pd-buy').onclick = () => {
    if (addToCart(product, restInfo(), qty)) window.location.href = 'cart.html';
  };
}
