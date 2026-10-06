/**
 * Khabar Ghor - Cart System
 * Uses localStorage for persistence. Optionally syncs to Firestore for logged-in users.
 */

import { showToast } from './ui.js';
import { formatCurrency } from './utils.js';

const CART_KEY = 'khabarghor_cart';
const DELIVERY_FEE = 40;
const SERVICE_FEE = 10;

export function getCart() {
  try {
    const data = localStorage.getItem(CART_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
  window.dispatchEvent(new CustomEvent('cartUpdated', { detail: cart }));
}

export function addToCart(product, restaurant = {}) {
  const cart = getCart();
  const restId = product.restaurantId || restaurant.id || '';
  const restName = restaurant.name || product.restaurantName || '';

  // Only allow items from one restaurant at a time (Foodpanda-style)
  if (cart.length > 0 && restId) {
    const existingRestId = cart[0].restaurantId;
    if (existingRestId && existingRestId !== restId) {
      showToast(`Cart has items from ${cart[0].restaurantName || 'another shop'}. Clear cart first or finish that order.`, 'error');
      return cart;
    }
  }

  const existing = cart.find(item => item.id === product.id);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image || '',
      quantity: 1,
      restaurantId: restId,
      restaurantName: restName
    });
  }

  saveCart(cart);
  showToast(`${product.name} added to cart`, 'success');
  return cart;
}

export function removeFromCart(productId) {
  let cart = getCart();
  cart = cart.filter(item => item.id !== productId);
  saveCart(cart);
  showToast('Item removed from cart', 'info');
  return cart;
}

export function increaseQuantity(productId) {
  const cart = getCart();
  const item = cart.find(i => i.id === productId);
  if (item) {
    item.quantity += 1;
    saveCart(cart);
  }
  return cart;
}

export function decreaseQuantity(productId) {
  const cart = getCart();
  const item = cart.find(i => i.id === productId);
  if (item) {
    if (item.quantity <= 1) {
      return removeFromCart(productId);
    }
    item.quantity -= 1;
    saveCart(cart);
  }
  return cart;
}

export function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartBadge();
  window.dispatchEvent(new CustomEvent('cartUpdated', { detail: [] }));
}

export function getCartCount() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

export function calculateSubtotal() {
  return getCart().reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

export function calculateTotal() {
  const subtotal = calculateSubtotal();
  if (subtotal === 0) return 0;
  return subtotal + DELIVERY_FEE + SERVICE_FEE;
}

export function getFees() {
  return {
    deliveryFee: DELIVERY_FEE,
    serviceFee: SERVICE_FEE
  };
}

export function updateCartBadge() {
  const count = getCartCount();
  document.querySelectorAll('.cart-badge').forEach(badge => {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  });
  document.querySelectorAll('[data-cart-count]').forEach(el => {
    el.textContent = count;
  });
}

// Initialize badge on load
document.addEventListener('DOMContentLoaded', updateCartBadge);
