/**
 * Khabar Ghor - Order Tracking Page
 */

import { getQueryParam, formatCurrency, escapeHtml } from './utils.js';
import { listenToOrder } from './firestore.js';

const STATUS_STEPS = [
  { key: 'pending', label: 'Placed' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'delivering', label: 'On the way' },
  { key: 'completed', label: 'Delivered' }
];

const STATUS_MESSAGES = {
  pending: 'Order placed. Waiting for restaurant confirmation.',
  accepted: 'Restaurant accepted your order.',
  preparing: 'Your food is being prepared.',
  ready: 'Order is ready. Rider will pick up soon.',
  processing: 'Your order is being prepared.',
  delivering: 'Rider is on the way to you.',
  completed: 'Order delivered. Enjoy your meal!',
  cancelled: 'This order was cancelled.'
};

document.addEventListener('DOMContentLoaded', () => {
  const orderId = getQueryParam('id');
  if (!orderId) {
    document.getElementById('tracking-content').innerHTML = `
      <div class="empty-state"><p>Order not found</p>
      <a href="orders.html" class="btn btn-primary" style="margin-top:16px;">View My Orders</a></div>`;
    return;
  }
  loadOrder(orderId);
});

function loadOrder(orderId) {
  listenToOrder(orderId, (order) => {
    if (!order) {
      document.getElementById('tracking-content').innerHTML = '<div class="empty-state"><p>Order not found</p></div>';
      return;
    }
    renderTracking(order);
  }, () => {
    document.getElementById('tracking-content').innerHTML = '<div class="empty-state"><p>Could not load order. Please login again.</p></div>';
  });
}

function renderTracking(order) {
  // Rider details are filled in by the admin on the order
  const driver = order.driverName ? { name: order.driverName, phone: order.driverPhone || '' } : null;
  const container = document.getElementById('tracking-content');
  const status = order.status || 'pending';
  const statusIndex = STATUS_STEPS.findIndex(s => s.key === status);
  const progressPercent = statusIndex <= 0 ? 0 : (statusIndex / (STATUS_STEPS.length - 1)) * 100;

  const fmt = (t) => { try { const d = t.toDate ? t.toDate() : new Date(t); return d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}); } catch { return ''; } };
  const times = { pending: order.createdAt ? fmt(order.createdAt) : '' };

    container.innerHTML = `
    <div class="tracking-status">
      <div class="tracking-illustration">
        <svg viewBox="0 0 200 160" fill="none">
          <circle cx="100" cy="70" r="50" fill="#FFF5F0"/>
          <path d="M70 80 L90 100 L130 50" stroke="#E85D04" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <rect x="40" y="110" width="120" height="30" rx="8" fill="#E85D04" opacity="0.2"/>
          <text x="100" y="130" text-anchor="middle" fill="#E85D04" font-size="12" font-weight="600">🛵 Delivery</text>
        </svg>
      </div>
      <h2>${status === 'delivering' ? 'Order On The Way' : STATUS_MESSAGES[status] ? STATUS_MESSAGES[status].split('.')[0] : 'Processing'}</h2>
      <p>${STATUS_MESSAGES[status] || ''}</p>
    </div>

    <div class="progress-timeline">
      <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
      ${STATUS_STEPS.map((step, i) => {
        const isCompleted = i < statusIndex || (status === 'completed' && i <= statusIndex);
        const isActive = i === statusIndex;
        return `
          <div class="progress-step ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">
            <div class="progress-dot">
              ${isCompleted || isActive ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : (i + 1)}
            </div>
            <span class="progress-label">${step.label}</span>
            ${times[step.key] ? `<span class="progress-time">${times[step.key]}</span>` : ''}
          </div>
        `;
      }).join('')}
    </div>

    ${driver && (status === 'delivering') ? `
      <div class="driver-card">
        <div class="driver-avatar"><div class="profile-avatar-placeholder">🛵</div></div>
        <div class="driver-info">
          <h4>${escapeHtml(driver.name)}</h4>
          <p>Your rider</p>
        </div>
        <div class="driver-actions">
          <a href="tel:${driver.phone || ''}" class="driver-action-btn" aria-label="Call">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
          </a>
        </div>
      </div>
    ` : ''}

    <div style="padding:16px;">
      <div class="cart-summary" style="border:1px solid var(--border-light);border-radius:var(--radius);">
        <h3 style="font-size:0.95rem;margin-bottom:8px;">${escapeHtml(order.restaurantName || 'Restaurant')}</h3>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">
          ${(order.items || []).map(i => `${i.quantity}x ${escapeHtml(i.name || '')}`).join(', ') || 'Items'}
        </p>
        ${order.address?.detail ? `
        <p style="font-size:0.85rem;margin-bottom:6px;">
          📍 ${escapeHtml(order.address.detail)}
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([order.address.detail, order.address.name].filter(Boolean).join(', '))}"
             target="_blank" rel="noopener" style="margin-left:6px;">Open map</a>
        </p>` : ''}
        <div class="summary-row total" style="border-top:1px dashed var(--border);padding-top:8px;margin-top:8px;">
          <span>Total</span>
          <span style="color:var(--primary);">${formatCurrency(order.total || 0)}</span>
        </div>
      </div>
    </div>
  `;
}
