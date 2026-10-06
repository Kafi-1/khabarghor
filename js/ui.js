/**
 * Khabar Ghor - UI Components & Helpers
 */

import { formatCurrency, formatNumber, escapeHtml } from './utils.js';

// ==================== TOAST ====================
export function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Close">&times;</button>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  const close = () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('.toast-close').addEventListener('click', close);
  setTimeout(close, duration);
}

// ==================== MODAL ====================
export function showModal({ title, content, confirmText = 'OK', cancelText = 'Cancel', onConfirm, onCancel, showCancel = true }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="modal-close" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">${content}</div>
      <div class="modal-footer">
        ${showCancel ? `<button class="btn btn-outline modal-cancel">${escapeHtml(cancelText)}</button>` : ''}
        <button class="btn btn-primary modal-confirm">${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => overlay.classList.add('show'));

  const close = () => {
    overlay.classList.remove('show');
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = '';
    }, 250);
  };

  overlay.querySelector('.modal-close').addEventListener('click', () => {
    if (onCancel) onCancel();
    close();
  });

  if (showCancel) {
    overlay.querySelector('.modal-cancel').addEventListener('click', () => {
      if (onCancel) onCancel();
      close();
    });
  }

  overlay.querySelector('.modal-confirm').addEventListener('click', () => {
    if (onConfirm) onConfirm();
    close();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      if (onCancel) onCancel();
      close();
    }
  });

  return { close };
}

export function showConfirm(message, onConfirm) {
  return showModal({
    title: 'Confirm',
    content: `<p>${escapeHtml(message)}</p>`,
    confirmText: 'Yes',
    cancelText: 'No',
    onConfirm
  });
}

// ==================== BOTTOM NAVIGATION ====================
export function renderBottomNav(activePage = 'home') {
  // Promo removed from bottom nav — Cart is in its place (user request)
  const pages = [
    { id: 'home', href: 'index.html', icon: 'home', label: 'Home' },
    { id: 'orders', href: 'orders.html', icon: 'orders', label: 'Orders' },
    { id: 'favorites', href: 'favorites.html', icon: 'heart', label: 'Favourites' },
    { id: 'cart', href: 'cart.html', icon: 'cart', label: 'Cart' },
    { id: 'profile', href: 'profile.html', icon: 'user', label: 'Account' }
  ];

  const icons = {
    home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    orders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
  };

  return `
    <nav class="bottom-nav" role="navigation" aria-label="Main navigation">
      ${pages.map(p => `
        <a href="${p.href}" class="bottom-nav-item ${activePage === p.id ? 'active' : ''}" aria-label="${p.label}">
          <span class="nav-icon">${icons[p.icon]}${p.id === 'cart' ? '<span class="cart-badge nav-cart-badge" style="display:none;">0</span>' : ''}</span>
          <span class="nav-label">${p.label}</span>
        </a>
      `).join('')}
    </nav>
  `;
}

// ==================== RESTAURANT CARD ====================
export function renderRestaurantCard(restaurant, options = {}) {
  const {
    showFavourite = true,
    isFavourite = false
  } = options;

  const rating = restaurant.rating || 0;
  const reviewCount = formatNumber(restaurant.reviewCount || 0);
  const deliveryTime = restaurant.deliveryTime || '';
  const distance = restaurant.distance ? `${restaurant.distance} km` : '';

  return `
    <a href="restaurant.html?id=${restaurant.id}" class="restaurant-card" data-id="${restaurant.id}">
      <div class="restaurant-card-image">
        ${restaurant.image ? `<img src="${escapeHtml(restaurant.image)}" alt="${escapeHtml(restaurant.name)}" loading="lazy">` : '<div class="pt-noimg">🍽️</div>'}
        ${showFavourite ? `
          <button class="favorite-btn ${isFavourite ? 'active' : ''}" 
                  data-id="${restaurant.id}" 
                  aria-label="Favourite"
                  onclick="event.preventDefault(); event.stopPropagation();">
            <svg viewBox="0 0 24 24" fill="${isFavourite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        ` : ''}
      </div>
      <div class="restaurant-card-body">
        <h3 class="restaurant-name">${escapeHtml(restaurant.name)}
          ${restaurant.status === 'closed' ? ' <span style="font-size:.7rem;color:#c62828">Closed</span>' : restaurant.status === 'busy' ? ' <span style="font-size:.7rem;color:#ef6c00">Busy</span>' : ''}
        </h3>
        <p class="restaurant-desc">${escapeHtml(restaurant.description || '')}</p>
        <div class="restaurant-meta">
          ${rating ? `<span class="rating">
            <svg class="star-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            ${rating} (${reviewCount})
          </span>` : ''}
          ${deliveryTime ? `<span class="delivery-time">⏱ ${escapeHtml(deliveryTime)}</span>` : ''}
          ${distance ? `<span class="distance">📍 ${distance}</span>` : ''}
        </div>
      </div>
    </a>
  `;
}

// ==================== FOOD / PRODUCT CARD ====================
export function renderFoodCard(product, options = {}) {
  const { showAdd = true, restaurantName = '' } = options;

  return `
    <div class="food-card" data-id="${product.id}">
      <a href="product.html?id=${encodeURIComponent(product.id)}" class="food-card-link" style="text-decoration:none;color:inherit;display:block;">
        <div class="food-card-image">
          ${product.image ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">` : '<div class="pt-noimg">🍽️</div>'}
        </div>
        <div class="food-card-body">
          <h4 class="food-name">${escapeHtml(product.name)}</h4>
          ${restaurantName ? `<p class="food-restaurant">${escapeHtml(restaurantName)}</p>` : ''}
          <p class="food-desc">${escapeHtml(product.description || '')}</p>
          <div class="food-footer">
            <span class="food-price">${formatCurrency(product.price)}</span>
          </div>
        </div>
      </a>
      ${showAdd ? `
        <div class="pt-actions" style="margin:0 12px 12px;width:auto">
          <button class="btn-add" data-id="${product.id}" aria-label="Add to cart">+ Cart</button>
          <button class="btn-buy" data-id="${product.id}" aria-label="Buy now">Buy Now</button>
        </div>
      ` : ''}
    </div>
  `;
}

// ==================== PRODUCT TILE (home grid) ====================
export function renderProductTile(p) {
  const img = p.image
    ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">`
    : '<div class="pt-noimg">🍽️</div>';
  return `
    <div class="product-tile" data-id="${p.id}" role="link" tabindex="0">
      <a href="product.html?id=${encodeURIComponent(p.id)}" class="pt-link">
        <div class="pt-image">${img}</div>
        <div class="pt-body">
          <h4 class="pt-name">${escapeHtml(p.name)}</h4>
          ${p.restaurantName ? `<span class="pt-resto">${escapeHtml(p.restaurantName)}</span>` : ''}
          <div class="pt-footer">
            <span class="food-price">${formatCurrency(p.price || 0)}</span>
          </div>
        </div>
      </a>
      <div class="pt-actions">
        <button class="btn-add" data-id="${p.id}" aria-label="Add to cart">+ Cart</button>
        <button class="btn-buy" data-id="${p.id}" aria-label="Buy now">Buy Now</button>
      </div>
    </div>`;
}

// ==================== CATEGORY ITEM ====================
export function renderCategoryItem(category, isActive = false) {
  return `
    <button class="category-item ${isActive ? 'active' : ''}" data-id="${category.id}" data-name="${escapeHtml(category.name)}">
      <span class="category-icon">
        ${category.icon ? `<img src="${category.icon}" alt="">` : getCategoryEmoji(category.name)}
      </span>
      <span class="category-name">${escapeHtml(category.name)}</span>
    </button>
  `;
}

function getCategoryEmoji(name) {
  const map = {
    'All': '🍽️',
    'Nasi': '🍚',
    'Mie': '🍜',
    'Ayam': '🍗',
    'Jajanan': '🍢',
    'Minuman': '🥤',
    'Sop': '🍲',
    'Sayur': '🥗',
    'Seafood': '🦐',
    'Bakso': '🥣',
    'Biryani': '🍛',
    'Bhat': '🍚',
    'Nasta': '🥟',
    'Mishti': '🍮',
    'Drinks': '🍵',
    'Fast Food': '🍔'
  };
  return map[name] || '🍴';
}

// ==================== CART ITEM ====================
export function renderCartItem(item) {
  return `
    <div class="cart-item" data-id="${item.id}">
      <div class="cart-item-image">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">` : '<div class="pt-noimg">🍽️</div>'}
      </div>
      <div class="cart-item-details">
        <h4 class="cart-item-name">${escapeHtml(item.name)}</h4>
        <p class="cart-item-restaurant">${escapeHtml(item.restaurantName || '')}</p>
        <div class="cart-item-price">${formatCurrency(item.price)}</div>
      </div>
      <div class="cart-item-actions">
        <div class="quantity-control">
          <button class="qty-btn qty-minus" data-id="${item.id}" aria-label="Decrease">−</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn qty-plus" data-id="${item.id}" aria-label="Add">+</button>
        </div>
        <button class="remove-btn" data-id="${item.id}" aria-label="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

// ==================== ORDER CARD ====================
export function renderOrderCard(order) {
  const statusMap = {
    pending: { label: 'Pending', class: 'status-pending' },
    accepted: { label: 'Accepted', class: 'status-accepted' },
    processing: { label: 'Processing', class: 'status-processing' },
    delivering: { label: 'On the way', class: 'status-delivering' },
    completed: { label: 'Completed', class: 'status-completed' },
    cancelled: { label: 'Cancelled', class: 'status-cancelled' }
  };

  const status = statusMap[order.status] || { label: order.status, class: '' };
  const itemCount = order.items ? order.items.reduce((s, i) => s + i.quantity, 0) : 0;
  const dateStr = order.createdAt ? formatDateTimeHelper(order.createdAt) : '';

  return `
    <a href="order-tracking.html?id=${order.id}" class="order-card">
      <div class="order-card-header">
        <div class="order-restaurant">
          ${order.restaurantImage ? `<img src="${escapeHtml(order.restaurantImage)}" alt="" class="order-resto-img" loading="lazy">` : '<div class="order-resto-img pt-noimg">🍽️</div>'}
          <div>
            <h4>${escapeHtml(order.restaurantName || 'Restaurant')}</h4>
            <p class="order-date">${dateStr}</p>
          </div>
        </div>
        <span class="order-status ${status.class}">${status.label}</span>
      </div>
      <div class="order-card-body">
        <p class="order-items">${itemCount} Menu • ${formatCurrency(order.total || 0)}</p>
      </div>
      <div class="order-card-footer">
        <span class="order-arrow">View Details →</span>
      </div>
    </a>
  `;
}

function formatDateTimeHelper(timestamp) {
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ==================== SKELETON ====================
export function renderSkeletonCards(count = 4, type = 'restaurant') {
  const items = Array(count).fill(0).map(() => {
    if (type === 'restaurant') {
      return `
        <div class="skeleton-card">
          <div class="skeleton skeleton-img"></div>
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-text"></div>
          <div class="skeleton skeleton-meta"></div>
        </div>
      `;
    }
    return `
      <div class="skeleton-card food-skeleton">
        <div class="skeleton skeleton-img-sm"></div>
        <div class="skeleton-content">
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-text"></div>
          <div class="skeleton skeleton-price"></div>
        </div>
      </div>
    `;
  }).join('');
  return `<div class="skeleton-grid">${items}</div>`;
}

// ==================== HEADER ====================
export function renderHeader({ title, showBack = false, showCart = false, cartCount = 0, rightAction = '' }) {
  return `
    <header class="app-header">
      <div class="header-left">
        ${showBack ? `
          <button class="header-btn back-btn" onclick="history.back()" aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        ` : ''}
        <h1 class="header-title">${escapeHtml(title)}</h1>
      </div>
      <div class="header-right">
        ${showCart ? `
          <a href="cart.html" class="header-btn cart-btn" aria-label="Cart">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            ${cartCount > 0 ? `<span class="cart-badge">${cartCount}</span>` : ''}
          </a>
        ` : ''}
        ${rightAction}
      </div>
    </header>
  `;
}
