/**
 * Khabar Ghor - push notifications (Firebase Cloud Functions v2)
 *
 * Sends FCM messages when orders are created / change status:
 *   new order        -> restaurant owner + admins, and all online riders
 *   status change    -> the customer
 *   status "ready"   -> all online riders
 *   assigned rider   -> the rider who was assigned
 *   customer cancel  -> restaurant owner
 *   "Notify riders"  -> all online riders (shop bumps ridersPing on the order)
 *
 * Deploy:  firebase deploy --only functions      (needs the Blaze plan)
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');

initializeApp();
const db = getFirestore();

// Keep in sync with ADMIN_EMAILS in js/firebase-config.js and firestore.rules
const ADMIN_EMAILS = ['admin@gmail.com', 'info@khabarghor.agi.bd'];

const shortId = (id) => '#' + String(id).slice(-6).toUpperCase();
const money = (n) => '৳' + Math.round(Number(n) || 0);

/** Collect FCM tokens for the given user ids */
async function tokensFor(uids) {
  const ids = [...new Set(uids.filter(Boolean))];
  const tokens = [];
  for (let i = 0; i < ids.length; i += 10) {
    const snap = await db.collection('fcm_tokens').where('uid', 'in', ids.slice(i, i + 10)).get();
    snap.forEach((d) => tokens.push(d.id));
  }
  return tokens;
}

/** Send one message (with a notification payload Chrome can display on its own) and clean up dead tokens */
async function notify(uids, { title, body, url, tag, type }) {
  const tokens = await tokensFor(uids);
  if (!tokens.length) return;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data: { title, body, url: url || 'index.html', tag: tag || '', type: type || 'info' },
    webpush: {
      headers: { Urgency: 'high', TTL: '3600' },
      notification: {
        title,
        body,
        tag: tag || undefined,
        renotify: !!tag,
        data: { url: url || 'index.html' }
      }
    }
  });
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
      dead.push(tokens[i]);
    }
  });
  await Promise.all(dead.map((t) => db.collection('fcm_tokens').doc(t).delete().catch(() => {})));
}

async function ownerUidOf(restaurantId) {
  if (!restaurantId) return null;
  const r = await db.collection('restaurants').doc(restaurantId).get();
  if (r.exists && r.data().ownerId) return r.data().ownerId;
  // fallback: user whose profile points to this restaurant
  const u = await db.collection('users').where('restaurantId', '==', restaurantId).limit(1).get();
  return u.empty ? null : u.docs[0].id;
}

async function adminUids() {
  const out = [];
  for (const email of ADMIN_EMAILS) {
    try { out.push((await getAuth().getUserByEmail(email)).uid); } catch (e) { /* not registered */ }
  }
  return out;
}

async function onlineRiderUids() {
  const snap = await db.collection('users').where('role', '==', 'rider').where('riderOnline', '==', true).get();
  return snap.docs.filter((d) => d.data().disabled !== true).map((d) => d.id);
}

/* ---------------- New order ---------------- */
exports.onOrderCreated = onDocumentCreated('orders/{orderId}', async (event) => {
  const order = event.data && event.data.data();
  if (!order) return;
  const id = event.params.orderId;
  // 1) restaurant owner + admins
  const owner = await ownerUidOf(order.restaurantId);
  await notify([owner, ...(await adminUids())], {
    title: 'New order ' + shortId(id),
    body: `${(order.items || []).length} item(s) · ${money(order.total)} · Cash on delivery`,
    url: 'shop/',
    tag: 'order-' + id,
    type: 'order'
  });
  // 2) online riders learn about it the moment it lands at the shop
  await notify(await onlineRiderUids(), {
    title: 'New delivery available 🛵',
    body: `${shortId(id)} · ${order.restaurantName || 'Restaurant'} · ${money(order.total)} (COD)`,
    url: 'rider/',
    tag: 'ready-' + id,
    type: 'order'
  });
});

/* ---------------- Status changes ---------------- */
const CUSTOMER_TEXT = {
  accepted: ['Order accepted ✅', 'The restaurant accepted your order.'],
  preparing: ['Preparing your food 👨‍🍳', 'Your food is being cooked.'],
  ready: ['Food is ready 🍱', 'Waiting for a rider to pick it up.'],
  delivering: ['On the way 🛵', 'Your rider is bringing your order. Keep cash ready.'],
  completed: ['Delivered 🎉', 'Enjoy your meal! Tap to rate your order.'],
  cancelled: ['Order cancelled', 'Your order was cancelled.']
};

exports.onOrderUpdated = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!before || !after) return;
  const id = event.params.orderId;

  // Shop's "Notify riders" button (bumps ridersPing) -> re-alert online riders
  if (after.ridersPing && after.ridersPing !== before.ridersPing) {
    await notify(await onlineRiderUids(), {
      title: 'New delivery available 🛵',
      body: `${shortId(id)} · ${after.restaurantName || 'Restaurant'} · ${money(after.total)} (COD)`,
      url: 'rider/',
      tag: 'ready-' + id,
      type: 'order'
    });
  }

  if (before.status === after.status) return;
  const status = after.status;

  // 1) customer
  const text = CUSTOMER_TEXT[status];
  if (text && after.userId) {
    let body = text[1];
    if (status === 'cancelled' && after.cancelReason) body += ' Reason: ' + after.cancelReason;
    await notify([after.userId], {
      title: text[0],
      body: `${shortId(id)} · ${body}`,
      url: 'order-tracking.html?id=' + id,
      tag: 'order-' + id,
      type: 'order'
    });
  }

  // 2) riders when food is ready
  if (status === 'ready') {
    await notify(await onlineRiderUids(), {
      title: 'New delivery available 🛵',
      body: `${shortId(id)} · ${after.restaurantName || 'Restaurant'} · ${money(after.total)} (COD)`,
      url: 'rider/',
      tag: 'ready-' + id,
      type: 'order'
    });
  }

  // 3) shop owner when the customer cancels, or a rider takes the order
  if (status === 'cancelled' && before.status === 'pending' && after.cancelReason === 'Cancelled by customer') {
    await notify([await ownerUidOf(after.restaurantId)], {
      title: 'Order cancelled by customer',
      body: shortId(id),
      url: 'shop/',
      tag: 'order-' + id,
      type: 'order'
    });
  }
  if (status === 'delivering') {
    // tell the rider who was just assigned (covers the shop assigning directly)
    if (after.riderId && after.riderId !== before.riderId) {
      await notify([after.riderId], {
        title: 'Delivery assigned to you 🛵',
        body: `${shortId(id)} · ${after.restaurantName || 'Restaurant'} · ${money(after.total)} (COD)`,
        url: 'rider/',
        tag: 'assign-' + id,
        type: 'order'
      });
    }
    await notify([await ownerUidOf(after.restaurantId)], {
      title: 'Rider picked up the order 🛵',
      body: shortId(id),
      url: 'shop/',
      tag: 'order-' + id,
      type: 'order'
    });
  }
});
