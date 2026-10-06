/**
 * Khabar Ghor - Product Detail Page
 * Shows image, name, price, description, delivery time, restaurant, category etc.
 */
import { getProduct, getRestaurant } from './firestore.js';
import { getQueryParam, formatCurrency, escapeHtml, showError } from './utils.js';
import { addToCart, updateCartBadge } from './cart.js';
import { showToast } from './ui.js';

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
  try {
    product = await getProduct(id);
    if (!product || product.available === false) {
      showError(container, 'Product not found or unavailable');
      return;
    }

    if (product.restaurantId) {
      restaurant = await getRestaurant(product.restaurantId);
    }

    document.title = `${product.name} - Khabar Ghor`;

    const img = product.image
      ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" class="pd-hero-img">`
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
    bindActions();
  } catch (err) {
    console.error(err);
    showError(container, 'Could not load product. Check internet / Firebase.');
  }
}

function bindActions() {
  const qtyEl = document.getElementById('pd-qty');
  document.getElementById('pd-minus').onclick = () => {
    if (qty > 1) { qty--; qtyEl.textContent = qty; }
  };
  document.getElementById('pd-plus').onclick = () => {
    qty++; qtyEl.textContent = qty;
  };

  document.getElementById('pd-add').onclick = () => {
    for (let i = 0; i < qty; i++) {
      addToCart(product, { id: product.restaurantId, name: product.restaurantName || restaurant?.name });
    }
    showToast(`Added ${qty} × ${product.name} to cart`, 'success');
  };

  document.getElementById('pd-buy').onclick = () => {
    for (let i = 0; i < qty; i++) {
      addToCart(product, { id: product.restaurantId, name: product.restaurantName || restaurant?.name });
    }
    window.location.href = 'cart.html';
  };
}
