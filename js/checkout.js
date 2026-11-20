/**
 * Khabar Ghor - Checkout / Payment Page
 */

import { showToast, showModal } from './ui.js';
import {
  getCart, calculateSubtotal, calculateTotal, getFees, clearCart, getCartCount
} from './cart.js';
import { formatCurrency, showEmpty } from './utils.js';
import { createOrder, getCouponByCode, calcCouponDiscount, incrementCouponUse, getRestaurant, getUserProfile, loadAppConfig } from './firestore.js';
import { getCurrentUser, onAuthReady } from './auth.js';
import { pushNotif } from './notifications.js';

const selectedPayment = 'cod'; // Cash on Delivery only

let appliedCoupon = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await new Promise(r => onAuthReady(r));
  if (getCartCount() === 0) {
    window.location.href = 'cart.html';
    return;
  }
  // Ask guests to log in now, not after they filled the whole form
  if (!user) {
    showToast('Please login to place your order', 'info');
    sessionStorage.setItem('auth_redirect', window.location.href);
    setTimeout(() => { window.location.href = 'login.html'; }, 700);
    return;
  }
  let profile = {};
  try { profile = (await getUserProfile(user.uid)) || {}; } catch (e) { /* ignore */ }
  await loadAppConfig();
  renderCheckout(profile);
});

function renderCheckout(profile = {}) {
  const container = document.getElementById('checkout-content');
  const saved = JSON.parse(localStorage.getItem('khabarghor_customer') || '{}');
  // Saved checkout details first, then the account profile
  const cust = {
    name: saved.name || profile.name || '',
    phone: saved.phone || profile.phone || '',
    address: saved.address || profile.address || ''
  };
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
      <h2>Payment</h2>
      <div class="payment-option selected" data-method="cod">
        <div class="payment-icon">💵</div>
        <div class="payment-info">
          <h4>Cash on Delivery</h4>
          <p>Pay <strong id="cod-amount">${formatCurrency(total)}</strong> in cash when your food arrives</p>
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
        <span id="summary-total" style="color:var(--primary);">${formatCurrency(total)}</span>
      </div>
    </div>

    <div class="cart-footer">
      <button class="btn btn-primary btn-block" id="pay-btn">
        Place Order · ${formatCurrency(total)}
      </button>
      <p style="text-align:center;font-size:.75rem;color:var(--text-muted);margin-top:8px">
        No advance payment. Pay cash to the rider when your order arrives.
      </p>
    </div>
  `;

  document.getElementById('pay-btn').addEventListener('click', handlePayment);

  appliedCoupon = null;
  document.getElementById('apply-coupon')?.addEventListener('click', async () => {
    const code = document.getElementById('coupon-code').value.trim();
    const msg = document.getElementById('coupon-msg');
    if (!code) { msg.textContent = 'Enter a code'; return; }
    msg.textContent = 'Checking…';
    try {
      const c = await getCouponByCode(code);
      if (!c) { msg.textContent = 'Invalid or expired coupon'; msg.style.color = '#c62828'; appliedCoupon = null; return; }
      const disc = calcCouponDiscount(c, subtotal);
      if (disc <= 0) { msg.textContent = c.minOrder ? `Min order ৳${c.minOrder}` : 'Cannot apply'; msg.style.color = '#c62828'; appliedCoupon = null; return; }
      appliedCoupon = c;
      msg.textContent = `Applied: −৳${disc} off`;
      msg.style.color = '#2e7d32';
      // keep every visible total in sync with the discount
      const payable = Math.max(0, total - disc);
      const payBtn = document.getElementById('pay-btn');
      if (payBtn) payBtn.textContent = `Place Order · ${formatCurrency(payable)}`;
      const cod = document.getElementById('cod-amount');
      if (cod) cod.textContent = formatCurrency(payable);
      const summaryTotal = document.getElementById('summary-total');
      if (summaryTotal) summaryTotal.textContent = formatCurrency(payable);
    } catch (e) {
      msg.textContent = 'Could not verify coupon';
      msg.style.color = '#c62828';
    }
  });
}

async function handlePayment() {
  const btn = document.getElementById('pay-btn');
  const originalLabel = btn.textContent.trim();
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
    btn.textContent = originalLabel;
    return;
  }

  // Don't let customers order from a shop that is closed / hidden
  let rest = null;
  try {
    rest = cart[0]?.restaurantId ? await getRestaurant(cart[0].restaurantId) : null;
    if (rest && (rest.active === false || rest.status === 'closed')) {
      showToast(`${rest.name || 'This restaurant'} is closed right now. Please try later.`, 'error');
      btn.disabled = false;
      btn.textContent = originalLabel;
      return;
    }
    const minOrder = Number(rest?.minOrder) || 0;
    if (minOrder > 0 && calculateSubtotal() < minOrder) {
      showToast(`Minimum order for ${rest.name || 'this shop'} is ${formatCurrency(minOrder)}`, 'error');
      btn.disabled = false;
      btn.textContent = originalLabel;
      return;
    }
  } catch (e) { /* if the check fails, let the order go through */ }
  localStorage.setItem('khabarghor_customer', JSON.stringify({ name: custName, phone: custPhone, address: custAddress }));
  const notes = sessionStorage.getItem('order_notes') || '';

  const sub = calculateSubtotal();
  const coupon = appliedCoupon || null;
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
    restaurantImage: rest?.coverImage || rest?.image || '',
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
    btn.textContent = originalLabel;
  }
}

