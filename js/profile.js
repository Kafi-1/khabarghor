/**
 * Khabar Ghor - Profile Page
 */

import { renderBottomNav, showToast, showModal } from './ui.js';
import { onAuthReady, logout, getCurrentUser } from './auth.js';
import { getUserProfile } from './firestore.js';

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('bottom-nav').innerHTML = renderBottomNav('profile');

  onAuthReady(async (user) => {
    if (user) {
      document.getElementById('login-btn').style.display = 'none';
      document.getElementById('logout-btn').style.display = 'block';

      let name = user.displayName || user.email?.split('@')[0] || 'User';
      let phone = user.phoneNumber || user.email || '';
      let photo = user.photoURL;

      {
        try {
          const profile = await getUserProfile(user.uid);
          if (profile) {
            name = profile.name || name;
            phone = profile.phone || phone;
            photo = profile.photoURL || photo;
          }
        } catch (e) { /* ignore */ }
      }

      document.getElementById('profile-name').textContent = name;
      document.getElementById('profile-phone').textContent = phone;

      if (photo) {
        document.querySelector('.profile-avatar').innerHTML = `<img src="${photo}" alt="${name}">`;
      }
    } else {
      document.getElementById('profile-name').textContent = 'Guest';
      document.getElementById('profile-phone').textContent = 'Login to see your profile';
      document.getElementById('login-btn').style.display = 'block';
      document.getElementById('logout-btn').style.display = 'none';
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await logout();
  });

  // Menu actions
  document.querySelectorAll('[data-action]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const action = item.dataset.action;
      if (action === 'help') { window.location.href = 'help.html'; return; }
      const titles = {
        address: 'My Address',
        payment: 'Payment Method',
        voucher: 'My Vouchers',
        about: 'About Khabar Ghor'
      };
      const contents = {
        address: '<p>' + (JSON.parse(localStorage.getItem('khabarghor_customer')||'{}').address || 'No saved address yet.') + '</p><p style="color:var(--text-muted);font-size:0.85rem;margin-top:8px;">You can edit your address at checkout.</p>',
        payment: '<p>Cash on Delivery, bKash, Nagad, Rocket (pay as instructed after order).</p>',
        voucher: '<p>Enter coupon codes at checkout. Ask admin for promo codes.</p>',
        about: '<p><strong>Khabar Ghor</strong></p><p style="margin-top:8px;">Local Khabar, Apnar Kache, Ghorer Moto Shad.</p><p style="color:var(--text-muted);font-size:0.85rem;margin-top:8px;">Version 1.2.0</p>'
      };
      showModal({
        title: titles[action] || 'Info',
        content: contents[action] || '',
        showCancel: false,
        confirmText: 'Close'
      });
    });
  });
});
