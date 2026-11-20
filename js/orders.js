/**
 * Khabar Ghor - Orders History Page
 */

import { renderBottomNav, showToast, showModal, showConfirm } from './ui.js';
import { getUserOrders, addReview, getReviewByOrder, updateOrderStatus } from './firestore.js';
import { addToCart } from './cart.js';
import { showEmpty, formatDateTime, escapeHtml } from './utils.js';
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
    const status = statusMap[order.status] || { label: escapeHtml(order.status || ''), class: '' };
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
        </a>
        <div class="order-card-footer" style="display:flex;gap:8px;flex-wrap:wrap;padding-top:8px">
          <a href="order-tracking.html?id=${order.id}" class="btn btn-outline btn-sm">Track</a>
          ${order.status === 'pending' ? `<button type="button" class="btn btn-outline btn-sm btn-cancel" data-id="${order.id}" style="color:#c62828;border-color:#c62828">Cancel</button>` : ''}
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
      for (const item of order.items) {
        const added = addToCart({
          id: item.productId || item.id,
          name: item.name,
          price: item.price,
          image: item.image,
          restaurantId: order.restaurantId,
          restaurantName: order.restaurantName
        }, { id: order.restaurantId, name: order.restaurantName }, item.quantity || 1);
        if (!added) return; // cart has another restaurant's items – toast already shown
      }
      showToast('Items added to cart', 'success');
      setTimeout(() => { window.location.href = 'cart.html'; }, 600);
    };
  });

  container.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      showConfirm('Cancel this order?', async () => {
        try {
          await updateOrderStatus(btn.dataset.id, 'cancelled', { cancelReason: 'Cancelled by customer' });
          const o = allOrders.find(x => x.id === btn.dataset.id);
          if (o) o.status = 'cancelled';
          renderOrders();
          showToast('Order cancelled', 'info');
        } catch (err) {
          showToast('Could not cancel. The restaurant may have just accepted it.', 'error');
        }
      });
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
      let stars = 5;
      showModal({
        title: 'Rate your order',
        content: `
          <div id="star-row" style="display:flex;justify-content:center;gap:6px;font-size:2rem;margin:4px 0 12px;cursor:pointer;user-select:none">
            ${[1, 2, 3, 4, 5].map(n => `<span data-n="${n}" role="button" aria-label="${n} star">★</span>`).join('')}
          </div>
          <textarea id="review-text" rows="3" placeholder="Write a short review (optional)" style="width:100%;padding:10px;border:1px solid #eee;border-radius:12px"></textarea>`,
        confirmText: 'Submit',
        onConfirm: async () => {
          const text = document.getElementById('review-text')?.value.trim() || '';
          try {
            await addReview({
              orderId: order.id,
              userId: user.uid,
              restaurantId: order.restaurantId,
              restaurantName: order.restaurantName,
              rating: stars,
              text,
              userName: user.displayName || user.email?.split('@')[0] || 'Customer'
            });
            showToast('Thanks for your review!', 'success');
          } catch (err) {
            showToast('Could not save review. Try again.', 'error');
          }
        }
      });
      const row = document.getElementById('star-row');
      const paint = () => row.querySelectorAll('span').forEach(s => { s.style.color = Number(s.dataset.n) <= stars ? '#f5a623' : '#ccc'; });
      paint();
      row.addEventListener('click', (ev) => {
        const s = ev.target.closest('span[data-n]');
        if (!s) return;
        stars = Number(s.dataset.n);
        paint();
      });
    };
  });
}
