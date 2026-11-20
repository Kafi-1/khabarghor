# Khabar Ghor – Local Khabar, Apnar Kache

Bangladeshi food delivery web app (HTML, CSS, vanilla JS, Firebase Auth + Firestore).  
**Foodpanda-style flow:** Customer → Restaurant → Rider → Admin.

## Panels

| Panel | URL | Who |
|-------|-----|-----|
| Customer (User) | `index.html` | Anyone |
| Admin | `admin.html` | Emails in `ADMIN_EMAILS` |
| Shop / Restaurant | `shop.html` | Users with `role: restaurant` |
| Rider | `rider.html` | Users with `role: rider` |

## Order flow

```
Customer places order (status: pending)
    ↓
Shop accepts → preparing → ready
    ↓
Rider accepts (status: delivering)
    ↓
Rider marks delivered (status: completed)
```

Admin can override any status and assign rider name/phone.

## Setup

1. Firebase project → Auth (Email/Password) + Firestore.
2. Paste config into `js/firebase-config.js`.
3. Set `ADMIN_EMAILS = ['your@email.com']`.
4. Publish `firestore.rules` (replace `admin@example.com` with your email).
5. Register admin account first via `login.html`.
6. Local server: `python -m http.server 5500` → `http://localhost:5500`.

### Create a shop account
1. User registers on `login.html`.
2. Admin → **Roles** tab → paste UID, role = `restaurant`, pick restaurant.
3. (Or) Admin → Restaurants → Edit → set **Owner UID**.
4. Shop owner opens `/shop.html` and logs in.

### Create a rider account
1. User registers on `login.html`.
2. Admin → **Roles** → UID + role = `rider`.
3. Rider opens `/rider.html`.

## Pages

`index.html` · `search.html` · `product.html` · `restaurants.html` · `restaurant.html` · `cart.html` · `checkout.html` · `order-tracking.html` · `orders.html` · `favorites.html` · `promo.html` · `profile.html` · `login.html` · `admin.html` · `shop.html` · `rider.html`

### Performance
- Session cache (90s) for products / restaurants / categories → page changes load instantly from cache.
- Skeleton loaders on home; lazy images; product detail & search use the same cache.

## Firestore collections

`restaurants` (has `ownerId`), `products`, `categories`, `orders` (has `riderId`, `driverName`, `driverPhone`), `users` (has `role`, `restaurantId`), `favorites`.

## Deploy

GitHub Pages / Firebase Hosting / Vercel. Add domain to Firebase Auth → Authorized domains.

---

## Install as an app (PWA)

The site is installable: Android Chrome shows an **Install** banner (or ⋮ → *Install app*), iPhone: Share → *Add to Home Screen*.
It has an app icon, a loading animation on launch, an offline page and fast repeat loads (service worker `sw.js`).

To get a real **APK** for the Play Store / sharing, upload the live URL to <https://www.pwabuilder.com> → *Package for stores* → Android.

## Push notifications (FCM)

1. Firebase Console → Project settings → **Cloud Messaging** → *Web Push certificates* → **Generate key pair**. Paste the key into `VAPID_KEY` in `js/firebase-config.js`.
2. Publish `firestore.rules` again (adds the `fcm_tokens` collection).
3. Deploy the sender (needs the **Blaze** plan; free quota is plenty for a small shop):
   ```bash
   npm i -g firebase-tools && firebase login
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
4. Open the app, log in, accept *"Get instant order updates"* (or Profile → Order alerts).

Who gets alerts: shop owner + admin on a new order · customer on every status change · online riders when an order is *ready*.
`ADMIN_EMAILS` in `functions/index.js` must match `js/firebase-config.js`.
