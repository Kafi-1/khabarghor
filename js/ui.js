/**
 * Khabar Ghor - UI Components & Helpers
 */

import { formatDelivery, formatCurrency, formatNumber, escapeHtml } from './utils.js';

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
    { id: 'restaurants', href: 'restaurants.html', icon: 'store', label: 'Restaurants' },
    { id: 'orders', href: 'orders.html', icon: 'orders', label: 'Orders' },
    { id: 'favorites', href: 'favorites.html', icon: 'heart', label: 'Favourites' },
    { id: 'profile', href: 'profile.html', icon: 'user', label: 'Account' }
  ];

  const icons = {
    home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    store: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l1.5-5h15L21 9"/><path d="M4.5 9v11h15V9"/><path d="M3 9h18"/><path d="M9 20v-5h6v5"/></svg>`,
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
  const deliveryTime = formatDelivery(restaurant.deliveryTime);
  const distance = restaurant.distance ? `${restaurant.distance} km` : '';

  return `
    <a href="restaurant.html?id=${restaurant.id}" class="restaurant-card" data-id="${restaurant.id}">
      <div class="restaurant-card-image">
        ${restaurant.image ? `<img src="${escapeHtml(restaurant.image)}" alt="${escapeHtml(restaurant.name)}" loading="lazy" decoding="async" data-lz onload="this.classList.add('img-loaded')" onerror="this.classList.add('img-loaded')">` : '<div class="pt-noimg">🍽️</div>'}
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
      <a href="product.html?id=${encodeURIComponent(product.id)}" class="food-card-link">
        <div class="food-card-image">
          ${product.image ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async" data-lz onload="this.classList.add('img-loaded')" onerror="this.classList.add('img-loaded')">` : '<div class="pt-noimg">🍽️</div>'}
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
        <div class="pt-actions">
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
    ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async" data-lz onload="this.classList.add('img-loaded')" onerror="this.classList.add('img-loaded')">`
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
    <button class="category-item ${isActive ? 'active' : ''}" data-id="${escapeHtml(String(category.id))}" data-name="${escapeHtml(category.name)}">
      <span class="category-icon">
        ${category.icon ? `<img src="${escapeHtml(category.icon)}" alt="">` : getCategoryEmoji(category.name)}
      </span>
      <span class="category-name">${escapeHtml(category.name)}</span>
    </button>
  `;
}

function getCategoryEmoji(name) {
  const map = {
    'All': '🍽️',
    'Biryani': '🍛',
    'Bhat': '🍚',
    'Khichuri': '🍲',
    'Nasta': '🥟',
    'Mishti': '🍮',
    'Curry': '🍛',
    'Fish': '🐟',
    'Chicken': '🍗',
    'Beef': '🥩',
    'Kebab': '🍢',
    'Seafood': '🦐',
    'Sop': '🍲',
    'Salad': '🥗',
    'Drinks': '🥤',
    'Tea': '🍵',
    'Juice': '🧃',
    'Fast Food': '🍔'
  };
  return map[name] || '🍴';
}

// ==================== CART ITEM ====================
export function renderCartItem(item) {
  return `
    <div class="cart-item" data-id="${item.id}">
      <div class="cart-item-image">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async" data-lz onload="this.classList.add('img-loaded')" onerror="this.classList.add('img-loaded')">` : '<div class="pt-noimg">🍽️</div>'}
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

// ==================== PANEL DRAWER (admin / shop / rider) ====================
/**
 * Hamburger + slide-in drawer shared by the three panels.
 * items: [{ id, label, icon, action?, badge?, danger? }] or { divider: true }.
 * Rebuilt on every call, so the caller can pass fresh `activeId`/`badge` state.
 */
export function setupPanelDrawer({ burgerId = 'panel-burger', items = [], activeId = '', onSelect } = {}) {
  document.getElementById('panel-drawer')?.remove();
  document.getElementById('panel-drawer-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'panel-drawer-overlay';
  overlay.className = 'drawer-overlay';

  const drawer = document.createElement('aside');
  drawer.id = 'panel-drawer';
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'navigation');
  drawer.innerHTML = items.map(it => {
    if (it.divider) return '<div class="drawer-divider"></div>';
    const cls = `drawer-item${activeId === it.id ? ' active' : ''}${it.danger ? ' danger' : ''}`;
    return `<button type="button" class="${cls}" data-id="${escapeHtml(it.id)}">
      <span class="drawer-ic">${it.icon || ''}</span>
      <span class="drawer-lb">${escapeHtml(it.label)}</span>
      ${it.badge ? '<span class="drawer-dot"></span>' : ''}
    </button>`;
  }).join('');

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const open = () => {
    overlay.classList.add('show');
    drawer.classList.add('show');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
  };
  const close = () => {
    overlay.classList.remove('show');
    drawer.classList.remove('show');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  };

  const burger = document.getElementById(burgerId);
  if (burger) burger.onclick = open;
  overlay.onclick = close;
  drawer.querySelectorAll('.drawer-item').forEach(b => {
    b.onclick = () => {
      const it = items.find(x => x.id === b.dataset.id);
      close();
      if (it?.action) it.action();
      else if (onSelect) onSelect(it?.id, it);
    };
  });

  return { open, close };
}
