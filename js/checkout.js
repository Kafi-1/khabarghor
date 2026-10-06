/**
 * Khabar Ghor - Checkout / Payment Page
 */

import { showToast, showModal } from './ui.js';
import {
  getCart, calculateSubtotal, calculateTotal, getFees, clearCart, getCartCount
} from './cart.js';
import { formatCurrency, showEmpty } from './utils.js';
import { createOrder, getCouponByCode, calcCouponDiscount, incrementCouponUse } from './firestore.js';
import { getCurrentUser, onAuthReady, requireAuth } from './auth.js';
import { pushNotif } from './notifications.js';

let selectedPayment = 'nagad';

document.addEventListener('DOMContentLoaded', async () => {
  await new Promise(r => onAuthReady(r));
  if (getCartCount() === 0) {
    window.location.href = 'cart.html';
    return;
  }
  renderCheckout();
});

function renderCheckout() {
  const container = document.getElementById('checkout-content');
  const cust = JSON.parse(localStorage.getItem('khabarghor_customer') || '{}');
  const esc = (v) => String(v || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fees = getFees();
  const subtotal = calculateSubtotal();
  const total = calculateTotal();

  const cart = getCart();
  const restName = cart[0]?.restaurantName || 'Restaurant';

  container.innerHTML = `
    <div class="payment-methods" style="margin-bottom:12px;">
      <h2 style="font-size:1rem;margin-bottom:8px">Order from ${esc(restName)}</h2>
      <div style="font-size:.85rem;color:var(--text-muted);margin-bottom:8px">
        ${cart.map(i => `${i.quantity}× ${esc(i.name)}`).join(' · ')}
      </div>
    </div>
    <div class="payment-methods" style="margin-bottom:16px;">
      <h2>Delivery Details</h2>
      <input id="cust-name" class="form-input" placeholder="Your name *" value="${esc(cust.name)}" style="width:100%;padding:12px;margin:6px 0;border:1px solid #eee;border-radius:12px;">
      <input id="cust-phone" type="tel" class="form-input" placeholder="Mobile 01XXXXXXXXX *" value="${esc(cust.phone)}" style="width:100%;padding:12px;margin:6px 0;border:1px solid #eee;border-radius:12px;">
      <textarea id="cust-address" class="form-input" rows="2" placeholder="Full address (area, upazila, district) *" style="width:100%;padding:12px;margin:6px 0;border:1px solid #eee;border-radius:12px;">${esc(cust.address)}</textarea>
    </div>
    <div class="payment-methods" style="margin-bottom:16px;">
      <h2>Coupon</h2>
      <div style="display:flex;gap:8px;">
        <input id="coupon-code" class="form-input" placeholder="Coupon code" style="flex:1;padding:12px;border:1px solid #eee;border-radius:12px;text-transform:uppercase">
        <button type="button" class="btn btn-outline" id="apply-coupon" style="white-space:nowrap">Apply</button>
      </div>
      <p id="coupon-msg" style="font-size:.85rem;margin-top:8px;color:var(--text-muted)"></p>
    </div>
    <div class="payment-methods">
      <h2>Payment Method</h2>

      <div class="payment-option ${selectedPayment === 'bkash' ? 'selected' : ''}" data-method="bkash">
        <div class="payment-icon">💗</div>
        <div class="payment-info">
          <h4>bKash</h4>
          <p>Pay with bKash Personal / Payment</p>
        </div>
        <div class="payment-radio"></div>
      </div>

      <div class="payment-option ${selectedPayment === 'nagad' ? 'selected' : ''}" data-method="nagad">
        <div class="payment-icon">📱</div>
        <div class="payment-info">
          <h4>Nagad</h4>
          <p>Pay with Nagad</p>
        </div>
        <div class="payment-radio"></div>
      </div>

      <div class="payment-option ${selectedPayment === 'rocket' ? 'selected' : ''}" data-method="rocket">
        <div class="payment-icon">💳</div>
        <div class="payment-info">
          <h4>Rocket</h4>
          <p>Dutch-Bangla Rocket</p>
        </div>
        <div class="payment-radio"></div>
      </div>

      <div class="payment-option ${selectedPayment === 'card' ? 'selected' : ''}" data-method="card">
        <div class="payment-icon">🏦</div>
        <div class="payment-info">
          <h4>Card / Bank</h4>
          <p>Visa, Mastercard, bank transfer</p>
        </div>
        <div class="payment-radio"></div>
      </div>

      <div class="payment-option ${selectedPayment === 'cod' ? 'selected' : ''}" data-method="cod">
        <div class="payment-icon">💵</div>
        <div class="payment-info">
          <h4>Cash on Delivery</h4>
          <p>Pay when your order arrives</p>
        </div>
        <div class="payment-radio"></div>
      </div>
    </div>

    <div class="cart-summary" style="margin:0 16px;border-radius:var(--radius);border:1px solid var(--border-light);">
      <h3 style="font-size:0.95rem;margin-bottom:12px;">Payment Summary</h3>
      <div class="summary-row">
        <span>Subtotal</span>
        <span>${formatCurrency(subtotal)}</span>
      </div>
      <div class="summary-row">
        <span>Delivery</span>
        <span>${formatCurrency(fees.deliveryFee)}</span>
      </div>
      <div class="summary-row">
        <span>Service Fee</span>
        <span>${formatCurrency(fees.serviceFee)}</span>
      </div>
      <div class="summary-row total">
        <span>Total</span>
        <span style="color:var(--primary);">${formatCurrency(total)}</span>
      </div>
    </div>

    <div class="cart-footer">
      <button class="btn btn-primary btn-block" id="pay-btn">
        Place Order · ${formatCurrency(total)}
      </button>
      <p style="text-align:center;font-size:.75rem;color:var(--text-muted);margin-top:8px">
        Payment is confirmed after restaurant accepts (COD / mobile banking)
      </p>
    </div>
  `;

  // Payment selection
  container.querySelectorAll('.payment-option').forEach(opt => {
    opt.addEventListener('click', () => {
      container.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedPayment = opt.dataset.method;
    });
  });

  document.getElementById('pay-btn').addEventListener('click', handlePayment);

  let appliedCoupon = null;
  window.__appliedCoupon = null;
  document.getElementById('apply-coupon')?.addEventListener('click', async () => {
    const code = document.getElementById('coupon-code').value.trim();
    const msg = document.getElementById('coupon-msg');
    if (!code) { msg.textContent = 'Enter a code'; return; }
    msg.textContent = 'Checking…';
    try {
      const c = await getCouponByCode(code);
      if (!c) { msg.textContent = 'Invalid or expired coupon'; msg.style.color = '#c62828'; window.__appliedCoupon = null; return; }
      const disc = calcCouponDiscount(c, subtotal);
      if (disc <= 0) { msg.textContent = c.minOrder ? `Min order ৳${c.minOrder}` : 'Cannot apply'; msg.style.color = '#c62828'; window.__appliedCoupon = null; return; }
      window.__appliedCoupon = c;
      msg.textContent = `Applied: −৳${disc} off`;
      msg.style.color = '#2e7d32';
      // update total display if present
      const totalEl = document.querySelector('#pay-btn');
      if (totalEl) totalEl.textContent = `Place Order · ${formatCurrency(Math.max(0, total - disc))}`;
    } catch (e) {
      msg.textContent = 'Could not verify coupon';
      msg.style.color = '#c62828';
    }
  });
}

async function handlePayment() {
  const btn = document.getElementById('pay-btn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  const cart = getCart();
  const fees = getFees();
  const custName = document.getElementById('cust-name')?.value.trim();
  const custPhone = document.getElementById('cust-phone')?.value.trim();
  const custAddress = document.getElementById('cust-address')?.value.trim();
  if (!custName || !/^(\+?88)?01[3-9]\d{8}$/.test(custPhone || '') || (custAddress || '').length < 8) {
    showToast('Please enter name, a valid BD mobile number and full address', 'error');
    btn.disabled = false;
    btn.textContent = 'Pay Now';
    return;
  }
  localStorage.setItem('khabarghor_customer', JSON.stringify({ name: custName, phone: custPhone, address: custAddress }));
  const notes = sessionStorage.getItem('order_notes') || '';

  const sub = calculateSubtotal();
  const coupon = window.__appliedCoupon || null;
  const discount = coupon ? calcCouponDiscount(coupon, sub) : 0;
  const grand = Math.max(0, calculateTotal() - discount);

  const orderData = {
    items: cart.map(item => ({
      productId: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      image: item.image
    })),
    restaurantId: cart[0]?.restaurantId || '',
    restaurantName: cart[0]?.restaurantName || 'Restaurant',
    restaurantImage: cart[0]?.image || '',
    subtotal: sub,
    deliveryFee: fees.deliveryFee,
    serviceFee: fees.serviceFee,
    discount,
    couponCode: coupon?.code || null,
    couponId: coupon?.id || null,
    total: grand,
    paymentMethod: selectedPayment,
    notes,
    address: {
      label: 'Home',
      detail: custAddress,
      name: custName,
      phone: custPhone
    },
    status: 'pending'
  };

  try {
    let orderId;

    const user = getCurrentUser();
    if (!user) {
      showToast('Please login first', 'info');
      sessionStorage.setItem('auth_redirect', window.location.href);
      window.location.href = 'login.html';
      return;
    }
    orderData.userId = user.uid;
    orderId = await createOrder(orderData);
    if (coupon?.id) {
      try { await incrementCouponUse(coupon.id); } catch (e) { /* ignore */ }
    }

    clearCart();
    sessionStorage.removeItem('order_notes');
    try { pushNotif('Order placed!', 'Restaurant will confirm soon', 'success'); } catch(e) {}
    window.location.href = `order-success.html?id=${orderId}`;
  } catch (err) {
    console.error(err);
    showToast('Could not place order. Try again.', 'error');
    btn.disabled = false;
    btn.textContent = 'Pay Now';
  }
}

