/**
 * Khabar Ghor - Restaurant Detail Page
 */

import { renderFoodCard, showToast } from './ui.js';
import { getRestaurant, getProductsByRestaurant, isFavourite, toggleFavourite, getReviewsByRestaurant } from './firestore.js';
import { getQueryParam, formatNumber, escapeHtml, showError } from './utils.js';
import { addToCart, getCartCount, calculateTotal, updateCartBadge } from './cart.js';
import { formatCurrency } from './utils.js';
import { onAuthReady, getCurrentUser } from './auth.js';

let currentRestaurant = null;
let allProducts = [];

document.addEventListener('DOMContentLoaded', async () => {
  const id = getQueryParam('id');
  if (!id) { window.location.href = 'restaurants.html'; return; }
  await loadRestaurant(id);
  updateFloatingCart();
  window.addEventListener('cartUpdated', updateFloatingCart);
});

async function loadRestaurant(id) {
  const container = document.getElementById('restaurant-content');
  try {
    const restaurant = await getRestaurant(id);
    if (!restaurant || restaurant.active === false) {
      showError(container, 'Restaurant not found');
      return;
    }
    const products = await getProductsByRestaurant(id);

    currentRestaurant = restaurant;
    allProducts = products;
    document.title = `${restaurant.name} - Khabar Ghor`;

    // Group by category
    const categories = [...new Set(products.map(p => p.category || 'Other'))];
    const categoryMap = {};
    products.forEach(p => {
      const cat = p.category || 'Other';
      if (!categoryMap[cat]) categoryMap[cat] = [];
      categoryMap[cat].push(p);
    });

    container.innerHTML = `
      <div class="restaurant-hero">
        ${(restaurant.coverImage || restaurant.image) ? `<img src="${escapeHtml(restaurant.coverImage || restaurant.image)}" alt="${escapeHtml(restaurant.name)}" loading="lazy">` : '<div class="pt-noimg" style="height:200px">🍽️</div>'}
        <div class="restaurant-hero-actions">
          <button class="hero-btn" onclick="history.back()" aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button class="hero-btn favorite" id="fav-btn" aria-label="Favourites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="restaurant-info">
        <h1>${escapeHtml(restaurant.name)}</h1>
        <div class="restaurant-info-meta">
          ${restaurant.rating ? `<span class="rating">⭐ ${restaurant.rating} (${formatNumber(restaurant.reviewCount || 0)})</span>` : ''}
          ${restaurant.deliveryTime ? `<span>⏱ ${escapeHtml(restaurant.deliveryTime)}</span>` : ''}
          ${restaurant.distance ? `<span>📍 ${restaurant.distance} km</span>` : ''}
          ${restaurant.status === 'closed' ? '<span style="color:#c62828;font-weight:600">Closed</span>' : restaurant.status === 'busy' ? '<span style="color:#ef6c00;font-weight:600">Busy</span>' : ''}
        </div>
      </div>

      <div class="menu-tabs" id="menu-tabs">
        <button class="menu-tab active" data-tab="menu">Menu</button>
        <button class="menu-tab" data-tab="reviews">Reviews</button>
        <button class="menu-tab" data-tab="about">About</button>
      </div>

      <div class="menu-content" id="menu-panel">
        <div class="menu-categories-sidebar" id="cat-sidebar">
          ${categories.map((c, i) => `
            <button class="menu-cat-btn ${i === 0 ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>
          `).join('')}
        </div>
        <div class="menu-items" id="menu-items">
          ${categories.map(cat => `
            <div class="menu-category-section" id="cat-${escapeHtml(cat)}" data-cat="${escapeHtml(cat)}">
              <h3 style="font-size:1rem;margin-bottom:12px;padding:0 4px;">${escapeHtml(cat)}</h3>
              <div class="food-list">
                ${categoryMap[cat].map(p => renderFoodCard(p)).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;


    // Menu / Reviews / About tabs
    document.getElementById('menu-tabs')?.addEventListener('click', async (e) => {
      const tab = e.target.closest('.menu-tab');
      if (!tab) return;
      document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById('menu-panel');
      if (tab.dataset.tab === 'menu') {
        panel.innerHTML = panel.dataset.menuHtml || panel.innerHTML;
        return;
      }
      if (tab.dataset.tab === 'about') {
        panel.innerHTML = `<div style="padding:16px">
          <p>${escapeHtml(restaurant.description || 'No description.')}</p>
          ${restaurant.address ? `<p style="margin-top:12px"><strong>Address:</strong> ${escapeHtml(restaurant.address)}</p>` : ''}
          ${restaurant.phone ? `<p><strong>Phone:</strong> <a href="tel:${escapeHtml(restaurant.phone)}">${escapeHtml(restaurant.phone)}</a></p>` : ''}
          ${restaurant.deliveryTime ? `<p><strong>Delivery:</strong> ${escapeHtml(restaurant.deliveryTime)}</p>` : ''}
        </div>`;
        return;
      }
      if (tab.dataset.tab === 'reviews') {
        panel.innerHTML = '<div class="loading-container"><div class="spinner"></div></div>';
        try {
          const reviews = await getReviewsByRestaurant(id);
          panel.innerHTML = reviews.length ? reviews.map(rv => `
            <div style="padding:12px 16px;border-bottom:1px solid var(--border-light)">
              <strong>${escapeHtml(rv.userName || 'Customer')}</strong>
              <span>⭐ ${rv.rating || 0}</span>
              <p style="margin-top:6px;color:var(--text-muted);font-size:.9rem">${escapeHtml(rv.text || '')}</p>
            </div>`).join('') : '<div class="empty-state"><p>No reviews yet</p></div>';
        } catch {
          panel.innerHTML = '<div class="empty-state"><p>Could not load reviews</p></div>';
        }
      }
    });
    const mp = document.getElementById('menu-panel');
    if (mp) mp.dataset.menuHtml = mp.innerHTML;

    // Category sidebar click
    document.getElementById('cat-sidebar')?.addEventListener('click, (e) => {
      const btn = e.target.closest('.menu-cat-btn');
      if (!btn) return;
      document.querySelectorAll('.menu-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const section = document.getElementById(`cat-${btn.dataset.cat}`);
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Add to cart + Buy Now (stop propagation so card link doesn't fire)
    container.querySelectorAll('.btn-add, .btn-buy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const product = allProducts.find(p => p.id === btn.dataset.id);
        if (!product) return;
        const result = addToCart(product, currentRestaurant);
        updateFloatingCart();
        if (btn.classList.contains('btn-buy') && Array.isArray(result) && result.length) {
          window.location.href = 'cart.html';
        }
      });
    });

    // Favourite button – real Firestore toggle
    const favBtn = document.getElementById('fav-btn');
    if (favBtn) {
      onAuthReady(async (user) => {
        if (user) {
          try {
            const fav = await isFavourite(user.uid, id);
            if (fav) {
              favBtn.classList.add('active');
              favBtn.querySelector('svg')?.setAttribute('fill', 'currentColor');
            }
          } catch (e) { /* ignore */ }
        }
      });

      favBtn.addEventListener('click', async () => {
        const user = getCurrentUser();
        if (!user) {
          showToast('Please login to save favourites', 'info');
          return;
        }
        try {
          const added = await toggleFavourite(user.uid, id, currentRestaurant);
          const svg = favBtn.querySelector('svg');
          if (added) {
            favBtn.classList.add('active');
            svg?.setAttribute('fill', 'currentColor');
            showToast('Added to favourites', 'success');
          } else {
            favBtn.classList.remove('active');
            svg?.setAttribute('fill', 'none');
            showToast('Removed from favourites', 'info');
          }
        } catch (e) {
          showToast('Could not update favourite', 'error');
        }
      });
    }

  } catch (err) {
    console.error(err);
    showError(container, 'Could not load restaurant');
  }
}

function updateFloatingCart() {
  const count = getCartCount();
  const total = calculateTotal();
  const bar = document.getElementById('floating-cart');
  if (count > 0) {
    bar.classList.remove('hidden');
    document.getElementById('float-count').textContent = count;
    document.getElementById('float-total').textContent = formatCurrency(total);
  } else {
    bar.classList.add('hidden');
  }
  updateCartBadge();
}
