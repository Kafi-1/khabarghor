/**
 * Khabar Ghor - Firestore Helper Functions
 * Includes sessionStorage cache for fast page loads & navigation.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import { db } from './firebase-config.js';

// ==================== FAST CACHE (sessionStorage) ====================
const CACHE_TTL = 90_000; // 90 seconds – keeps data fresh but navigations feel instant
const mem = new Map();

function cacheGet(key) {
  if (mem.has(key)) {
    const e = mem.get(key);
    if (Date.now() - e.t < CACHE_TTL) return e.v;
    mem.delete(key);
  }
  try {
    const raw = sessionStorage.getItem('kg_' + key);
    if (!raw) return null;
    const e = JSON.parse(raw);
    if (Date.now() - e.t < CACHE_TTL) {
      mem.set(key, e);
      return e.v;
    }
    sessionStorage.removeItem('kg_' + key);
  } catch { /* ignore */ }
  return null;
}

function cacheSet(key, value) {
  const e = { t: Date.now(), v: value };
  mem.set(key, e);
  try { sessionStorage.setItem('kg_' + key, JSON.stringify(e)); } catch { /* quota */ }
}

/** Call after admin/shop saves so next load is fresh */
export function clearDataCache() {
  mem.clear();
  try {
    Object.keys(sessionStorage).filter(k => k.startsWith('kg_')).forEach(k => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}

// ==================== USERS ====================
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createUserProfile(uid, data) {
  await setDoc(doc(db, 'users', uid), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, 'users', uid), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

/** role: 'customer' | 'restaurant' | 'rider' | 'admin' */
export async function setUserRole(uid, role, extra = {}) {
  await updateDoc(doc(db, 'users', uid), {
    role,
    ...extra,
    updatedAt: serverTimestamp()
  });
}

/** All user profiles (admin). Sorted newest first. */
export async function getAllUsers() {
  const list = mapDocs(await getDocs(collection(db, 'users')));
  return list.sort(byNewest);
}

/** Google Maps search/nav link from address text or lat,lng */
export function mapsLink(addressOrLat, lng = null) {
  if (lng != null && addressOrLat != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${addressOrLat},${lng}`;
  }
  const q = encodeURIComponent(String(addressOrLat || '').trim());
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

// ==================== CATEGORIES ====================
// Filtering/sorting is done in the browser so no Firestore composite indexes are needed.
const byOrder = (a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
const byNewest = (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
const mapDocs = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));

export async function getCategories() {
  const cached = cacheGet('categories');
  if (cached) return cached;
  const list = mapDocs(await getDocs(collection(db, 'categories'))).filter(c => c.active !== false).sort(byOrder);
  cacheSet('categories', list);
  return list;
}

export async function saveCategory(data, id = null) {
  clearDataCache();
  if (id) { await updateDoc(doc(db, 'categories', id), data); return id; }
  const ref = await addDoc(collection(db, 'categories'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteCategory(id) { clearDataCache(); await deleteDoc(doc(db, 'categories', id)); }

// ==================== RESTAURANTS ====================
// includeInactive=true is used by the admin panel.
export async function getRestaurants({ includeInactive = false } = {}) {
  const key = includeInactive ? 'restaurants_all' : 'restaurants';
  const cached = cacheGet(key);
  if (cached) return cached;
  const list = mapDocs(await getDocs(collection(db, 'restaurants')));
  // Public: active + approved (missing verificationStatus = legacy approved)
  const result = (includeInactive
    ? list
    : list.filter(r =>
        r.active !== false &&
        (r.verificationStatus == null || r.verificationStatus === 'approved')
      )
  ).sort(byNewest);
  cacheSet(key, result);
  return result;
}

export async function getRestaurant(id) {
  const key = 'restaurant_' + id;
  const cached = cacheGet(key);
  if (cached) return cached;
  const snap = await getDoc(doc(db, 'restaurants', id));
  const result = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  if (result) cacheSet(key, result);
  return result;
}

export async function saveRestaurant(data, id = null) {
  clearDataCache();
  if (id) {
    await updateDoc(doc(db, 'restaurants', id), data);
    // keep the restaurant name on its products in sync
    const prods = await getDocs(query(collection(db, 'products'), where('restaurantId', '==', id)));
    await Promise.all(prods.docs.map(d => updateDoc(d.ref, { restaurantName: data.name })));
    return id;
  }
  const ref = await addDoc(collection(db, 'restaurants'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteRestaurant(id) { clearDataCache(); await deleteDoc(doc(db, 'restaurants', id)); }

export async function searchRestaurants(term) {
  const lower = term.toLowerCase();
  return (await getRestaurants()).filter(r =>
    (r.name || '').toLowerCase().includes(lower) || (r.description || '').toLowerCase().includes(lower));
}

// ==================== PRODUCTS ====================
// All products shown on the home page. Hidden if unavailable.
export async function getProducts({ includeUnavailable = false } = {}) {
  const key = includeUnavailable ? 'products_all' : 'products';
  const cached = cacheGet(key);
  if (cached) return cached;
  const list = mapDocs(await getDocs(collection(db, 'products')));
  const result = (includeUnavailable ? list : list.filter(p => p.available !== false)).sort(byNewest);
  cacheSet(key, result);
  return result;
}

export async function saveProduct(data, id = null) {
  clearDataCache();
  if (id) { await updateDoc(doc(db, 'products', id), data); return id; }
  const ref = await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteProduct(id) {
  clearDataCache();
  await deleteDoc(doc(db, 'products', id));
}

export async function getProductsByRestaurant(restaurantId) {
  const key = 'products_rest_' + restaurantId;
  const cached = cacheGet(key);
  if (cached) return cached;
  const q = query(collection(db, 'products'), where('restaurantId', '==', restaurantId));
  const result = mapDocs(await getDocs(q)).filter(p => p.available !== false);
  cacheSet(key, result);
  return result;
}

export async function getPopularProducts(limitCount = 10) {
  const q = query(
    collection(db, 'products'),
    where('popular', '==', true),
    where('available', '==', true),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getProduct(id) {
  const key = 'product_' + id;
  const cached = cacheGet(key);
  if (cached) return cached;
  const snap = await getDoc(doc(db, 'products', id));
  const result = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  if (result) cacheSet(key, result);
  return result;
}

export async function searchProducts(term) {
  const lower = (term || '').toLowerCase().trim();
  if (!lower) return [];
  // Use cached products list when possible for instant search
  let list = cacheGet('products');
  if (!list) {
    const snap = await getDocs(query(collection(db, 'products'), where('available', '==', true), limit(100)));
    list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cacheSet('products', list.filter(p => p.available !== false).sort(byNewest));
  }
  return list.filter(p =>
    (p.name || '').toLowerCase().includes(lower) ||
    (p.description || '').toLowerCase().includes(lower) ||
    (p.restaurantName || '').toLowerCase().includes(lower) ||
    (p.category || '').toLowerCase().includes(lower)
  );
}

// ==================== ORDERS ====================
export async function createOrder(orderData) {
  const ref = await addDoc(collection(db, 'orders'), {
    ...orderData,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function getOrder(orderId) {
  const snap = await getDoc(doc(db, 'orders', orderId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getUserOrders(userId) {
  const q = query(collection(db, 'orders'), where('userId', '==', userId));
  return mapDocs(await getDocs(q)).sort(byNewest);
}

export function listenToOrder(orderId, callback, onError) {
  return onSnapshot(doc(db, 'orders', orderId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, onError);
}

export async function updateOrderStatus(orderId, status, extra = {}) {
  await updateDoc(doc(db, 'orders', orderId), {
    status,
    ...extra,
    updatedAt: serverTimestamp()
  });
}

// Admin: all orders, newest first
export async function getAllOrders() {
  return mapDocs(await getDocs(collection(db, 'orders'))).sort(byNewest);
}

/** Orders for a restaurant (shop panel) */
export async function getRestaurantOrders(restaurantId) {
  const q = query(collection(db, 'orders'), where('restaurantId', '==', restaurantId));
  return mapDocs(await getDocs(q)).sort(byNewest);
}

/** Ready orders available for any rider to pick up */
export async function getReadyOrders() {
  const q = query(collection(db, 'orders'), where('status', '==', 'ready'));
  return mapDocs(await getDocs(q)).filter(o => !o.riderId).sort(byNewest);
}

/** Orders assigned to this rider */
export async function getOrdersByRider(riderId) {
  const q = query(collection(db, 'orders'), where('riderId', '==', riderId));
  return mapDocs(await getDocs(q)).sort(byNewest);
}

/** Restaurant owned by this user */
export async function getRestaurantByOwner(ownerId) {
  const q = query(collection(db, 'restaurants'), where('ownerId', '==', ownerId));
  const list = mapDocs(await getDocs(q));
  return list[0] || null;
}

export function listenToRestaurantOrders(restaurantId, callback, onError) {
  const q = query(collection(db, 'orders'), where('restaurantId', '==', restaurantId));
  return onSnapshot(q, (snap) => {
    callback(mapDocs(snap).sort(byNewest));
  }, onError);
}

// ==================== FAVORITES ====================
export async function getUserFavourites(userId) {
  const q = query(collection(db, 'favorites'), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function toggleFavourite(userId, restaurantId, restaurantData = {}) {
  const q = query(
    collection(db, 'favorites'),
    where('userId', '==', userId),
    where('restaurantId', '==', restaurantId)
  );
  const snap = await getDocs(q);

  if (!snap.empty) {
    await deleteDoc(snap.docs[0].ref);
    return false;
  } else {
    await addDoc(collection(db, 'favorites'), {
      userId,
      restaurantId,
      restaurantName: restaurantData.name || '',
      restaurantImage: restaurantData.image || '',
      createdAt: serverTimestamp()
    });
    return true;
  }
}

export async function isFavourite(userId, restaurantId) {
  const q = query(
    collection(db, 'favorites'),
    where('userId', '==', userId),
    where('restaurantId', '==', restaurantId)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}


// ==================== PROMOS (Firebase only, no demo) ====================
export async function getPromos() {
  const key = 'promos';
  const cached = cacheGet(key);
  if (cached) return cached;
  try {
    const list = mapDocs(await getDocs(collection(db, 'promos')))
      .filter(p => p.active !== false)
      .sort(byOrder);
    cacheSet(key, list);
    return list;
  } catch {
    return [];
  }
}

export async function savePromo(data, id = null) {
  clearDataCache();
  if (id) { await updateDoc(doc(db, 'promos', id), data); return id; }
  const ref = await addDoc(collection(db, 'promos'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deletePromo(id) {
  clearDataCache();
  await deleteDoc(doc(db, 'promos', id));
}

// ==================== COUPONS ====================
export async function getCoupons({ includeInactive = false } = {}) {
  try {
    const list = mapDocs(await getDocs(collection(db, 'coupons')));
    return (includeInactive ? list : list.filter(c => c.active !== false)).sort(byNewest);
  } catch { return []; }
}

export async function getCouponByCode(code) {
  const lower = (code || '').trim().toUpperCase();
  if (!lower) return null;
  const list = await getCoupons({ includeInactive: false });
  const c = list.find(x => (x.code || '').toUpperCase() === lower);
  if (!c) return null;
  const now = Date.now();
  if (c.startAt && new Date(c.startAt).getTime() > now) return null;
  if (c.endAt && new Date(c.endAt).getTime() < now) return null;
  if (c.usageLimit != null && (c.usedCount || 0) >= c.usageLimit) return null;
  return c;
}

export async function saveCoupon(data, id = null) {
  clearDataCache();
  if (id) { await updateDoc(doc(db, 'coupons', id), data); return id; }
  const ref = await addDoc(collection(db, 'coupons'), {
    ...data,
    usedCount: 0,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function deleteCoupon(id) {
  clearDataCache();
  await deleteDoc(doc(db, 'coupons', id));
}

export async function incrementCouponUse(id) {
  const c = await getDoc(doc(db, 'coupons', id));
  if (!c.exists()) return;
  await updateDoc(c.ref, { usedCount: (c.data().usedCount || 0) + 1 });
}

/** Apply coupon to subtotal → discount amount (৳) */
export function calcCouponDiscount(coupon, subtotal) {
  if (!coupon || !subtotal) return 0;
  if (coupon.minOrder && subtotal < coupon.minOrder) return 0;
  let d = 0;
  if (coupon.type === 'percent') {
    d = Math.round(subtotal * (Number(coupon.value) || 0) / 100);
  } else {
    d = Number(coupon.value) || 0;
  }
  if (coupon.maxDiscount != null && coupon.maxDiscount > 0) {
    d = Math.min(d, coupon.maxDiscount);
  }
  return Math.min(d, subtotal);
}

// ==================== REVIEWS ====================
export async function getReviewsByRestaurant(restaurantId) {
  const q = query(collection(db, 'reviews'), where('restaurantId', '==', restaurantId));
  return mapDocs(await getDocs(q)).sort(byNewest);
}

export async function getReviewByOrder(orderId, userId) {
  const q = query(
    collection(db, 'reviews'),
    where('orderId', '==', orderId),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function addReview(data) {
  const ref = await addDoc(collection(db, 'reviews'), {
    ...data,
    createdAt: serverTimestamp()
  });
  // Update restaurant average rating (best-effort)
  try {
    const reviews = await getReviewsByRestaurant(data.restaurantId);
    const avg = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / (reviews.length || 1);
    await updateDoc(doc(db, 'restaurants', data.restaurantId), {
      rating: Math.round(avg * 10) / 10,
      reviewCount: reviews.length
    });
    clearDataCache();
  } catch { /* ignore */ }
  return ref.id;
}

// ==================== SUPPORT TICKETS ====================
export async function createSupportTicket(data) {
  const ref = await addDoc(collection(db, 'support_tickets'), {
    ...data,
    status: 'open',
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function getUserTickets(userId) {
  const q = query(collection(db, 'support_tickets'), where('userId', '==', userId));
  return mapDocs(await getDocs(q)).sort(byNewest);
}

export async function getAllTickets() {
  return mapDocs(await getDocs(collection(db, 'support_tickets'))).sort(byNewest);
}

export async function updateTicketStatus(id, status) {
  await updateDoc(doc(db, 'support_tickets', id), { status, updatedAt: serverTimestamp() });
}
