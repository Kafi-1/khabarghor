/**
 * Khabar Ghor - Cart Page
 */
import { renderCartItem, renderBottomNav, showConfirm, showToast } from './ui.js';
import {
  getCart, increaseQuantity, decreaseQuantity, removeFromCart,
  clearCart, calculateSubtotal, calculateTotal, getFees, getCartCount, updateCartBadge
} from './cart.js';
import { formatCurrency } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('bottom-nav');
  if (nav) nav.innerHTML = renderBottomNav('cart');
  updateCartBadge();
  renderCart();
  document.getElementById('clear-cart-btn')?.addEventListener('click', () => {
    if (getCartCount() === 0) return;
    showConfirm('Clear entire cart?', () => {
      clearCart();
      renderCart();
      showToast('Cart cleared', 'info');
    });
  });
});

function renderCart() {
  const container = document.getElementById('cart-content');
  const cart = getCart();

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="min-height:60vh;">
        <div class="empty-icon">🛒</div>
        <p>Your cart is empty</p>
        <a href="index.html" class="btn btn-primary" style="margin-top:16px;">Browse Menu</a>
      </div>`;
    return;
  }

  const fees = getFees();
  const subtotal = calculateSubtotal();
  const total = calculateTotal();
  const restName = cart[0]?.restaurantName || 'Restaurant';

  container.innerHTML = `
    <div style="padding:12px 16px 0;font-size:.85rem;color:var(--text-muted)">
      Ordering from <strong style="color:var(--text)">${restName}</strong>
    </div>
    <div class="cart-items" id="cart-items">
      ${cart.map(item => renderCartItem(item)).join('')}
    </div>

    <div class="cart-notes">
      <label for="order-notes">Note for restaurant</label>
      <textarea id="order-notes" placeholder="e.g. less spicy, no onion"></textarea>
    </div>

    <div class="cart-summary">
      <div class="summary-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
      <div class="summary-row"><span>Delivery</span><span>${formatCurrency(fees.deliveryFee)}</span></div>
      <div class="summary-row"><span>Service Fee</span><span>${formatCurrency(fees.serviceFee)}</span></div>
      <div class="summary-row total"><span>Total</span><span style="color:var(--primary)">${formatCurrency(total)}</span></div>
    </div>

    <div class="cart-footer">
      <a href="checkout.html" class="btn btn-primary btn-block">Checkout · ${formatCurrency(total)}</a>
    </div>`;

  container.querySelectorAll('.qty-plus').forEach(btn => {
    btn.addEventListener('click', () => { increaseQuantity(btn.dataset.id); renderCart(); });
  });
  container.querySelectorAll('.qty-minus').forEach(btn => {
    btn.addEventListener('click', () => { decreaseQuantity(btn.dataset.id); renderCart(); });
  });
  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => { removeFromCart(btn.dataset.id); renderCart(); });
  });

  const notesEl = document.getElementById('order-notes');
  if (notesEl) {
    notesEl.value = sessionStorage.getItem('order_notes') || '';
    notesEl.addEventListener('input', () => sessionStorage.setItem('order_notes', notesEl.value));
  }
}
