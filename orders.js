/**
 * Khabar Ghor - Orders History Page
 */

import { renderBottomNav, renderOrderCard, showToast } from './ui.js';
import { getUserOrders, addReview, getReviewByOrder } from './firestore.js';
import { addToCart } from './cart.js';
import { showEmpty, formatDateTime } from './utils.js';
import { onAuthReady, getCurrentUser } from './auth.js';
import { formatCurrency } from './utils.js';

let allOrders = [];
let currentTab = 'all';

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('bottom-nav').innerHTML = renderBottomNav('orders');

  document.getElementById('orders-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.orders-tab');
    if (!tab) return;
    document.querySelectorAll('.orders-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.tab;
    renderOrders();
  });

  loadOrders();
});

async function loadOrders() {
  const container = document.getElementById('orders-list');
  container.innerHTML = '<div class="loading-container"><div class="spinner"></div><p>Loading orders...</p></div>';

  try {
    const user = await new Promise(r => onAuthReady(r));
    if (!user) {
      showEmpty(container, 'Login to see your orders', '📦');
      return;
    }
    allOrders = await getUserOrders(user.uid);
    renderOrders();
  } catch (err) {
    console.warn(err);
    allOrders = [];
    renderOrders();
  }
}

function renderOrders() {
  const container = document.getElementById('orders-list');
  let filtered = allOrders;

  if (currentTab === 'processing') {
    filtered = allOrders.filter(o => ['pending', 'accepted', 'preparing', 'ready', 'processing', 'delivering'].includes(o.status));
  } else if (currentTab === 'completed') {
    filtered = allOrders.filter(o => o.status === 'completed');
  } else if (currentTab === 'cancelled') {
    filtered = allOrders.filter(o => o.status === 'cancelled');
  }

  if (filtered.length === 0) {
    showEmpty(container, 'No orders yet', '📦');
    return;
  }

  container.innerHTML = filtered.map(order => {
    const statusMap = {
      pending: { label: 'Pending', class: 'status-pending' },
      accepted: { label: 'Accepted', class: 'status-accepted' },
      preparing: { label: 'Preparing', class: 'status-processing' },
      ready: { label: 'Ready', class: 'status-processing' },
      processing: { label: 'Processing', class: 'status-processing' },
      delivering: { label: 'On the way', class: 'status-delivering' },
      completed: { label: 'Completed', class: 'status-completed' },
      cancelled: { label: 'Cancelled', class: 'status-cancelled' }
    };
    const status = statusMap[order.status] || { label: order.status, class: '' };
    const itemCount = order.items ? order.items.reduce((s, i) => s + (i.quantity || 1), 0) : 0;
    let dateStr = '';
    try {
      const d = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { dateStr = ''; }

    return `
      <div class="order-card" style="display:block;text-decoration:none;color:inherit">
        <a href="order-tracking.html?id=${order.id}" style="text-decoration:none;color:inherit;display:block">
          <div class="order-card-header">
            <div class="order-restaurant">
              ${order.restaurantImage ? `<img src="${order.restaurantImage}" alt="" class="order-resto-img" loading="lazy">` : '<div class="order-resto-img pt-noimg">🍽️</div>'}
              <div>
                <h4>${order.restaurantName || 'Restaurant'}</h4>
                <p class="order-date">${dateStr}</p>
              </div>
            </div>
            <span class="order-status ${status.class}">${status.label}</span>
          </div>
          <div class="order-card-body">
            <p class="order-items">${itemCount} Menu • ${formatCurrency(order.total || 0)}</p>
          </div>
        </a>
        <div class="order-card-footer" style="display:flex;gap:8px;flex-wrap:wrap;padding-top:8px">
          <a href="order-tracking.html?id=${order.id}" class="btn btn-outline btn-sm">Track</a>
          ${order.status === 'completed' || order.status === 'cancelled' || order.items?.length ? `
            <button type="button" class="btn btn-outline btn-sm btn-reorder" data-id="${order.id}">Reorder</button>` : ''}
          ${order.status === 'completed' ? `
            <button type="button" class="btn btn-primary btn-sm btn-review" data-id="${order.id}">Rate</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-reorder').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const order = allOrders.find(o => o.id === btn.dataset.id);
      if (!order?.items?.length) return showToast('No items to reorder', 'error');
      order.items.forEach(item => {
        addToCart({
          id: item.productId || item.id,
          name: item.name,
          price: item.price,
          image: item.image,
          restaurantId: order.restaurantId,
          restaurantName: order.restaurantName
        }, { id: order.restaurantId, name: order.restaurantName });
      });
      showToast('Items added to cart', 'success');
      setTimeout(() => { window.location.href = 'cart.html'; }, 600);
    };
  });

  container.querySelectorAll('.btn-review').forEach(btn => {
    btn.onclick = async (e) => {
      e.preventDefault();
      const order = allOrders.find(o => o.id === btn.dataset.id);
      if (!order) return;
      const user = getCurrentUser();
      if (!user) { window.location.href = 'login.html'; return; }
      try {
        const existing = await getReviewByOrder(order.id, user.uid);
        if (existing) { showToast('You already rated this order', 'info'); return; }
      } catch { /* continue */ }
      const rating = prompt('Rate 1–5 stars:', '5');
      if (!rating) return;
      const r = Math.min(5, Math.max(1, parseInt(rating, 10) || 5));
      const text = prompt('Review (optional):', '') || '';
      try {
        await addReview({
          orderId: order.id,
          userId: user.uid,
          restaurantId: order.restaurantId,
          restaurantName: order.restaurantName,
          rating: r,
          text,
          userName: user.displayName || user.email?.split('@')[0] || 'Customer'
        });
        showToast('Thanks for your review!', 'success');
      } catch (err) {
        showToast('Could not save review: ' + err.message, 'error');
      }
    };
  });
}
