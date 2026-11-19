/**
 * Khabar Ghor - Profile Page
 */

import { renderBottomNav, showToast, showModal } from './ui.js';
import { onAuthReady, logout, getCurrentUser } from './auth.js';
import { getUserProfile, updateUserProfile } from './firestore.js';
import { ADMIN_EMAILS } from './firebase-config.js';
import { escapeHtml } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('bottom-nav').innerHTML = renderBottomNav('profile');

  onAuthReady(async (user) => {
    if (user) {
      document.getElementById('login-btn').style.display = 'none';
      document.getElementById('logout-btn').style.display = 'block';

      let name = user.displayName || user.email?.split('@')[0] || 'User';
      let phone = user.phoneNumber || user.email || '';
      let photo = user.photoURL;
      let profileData = null;

      {
        try {
          const profile = await getUserProfile(user.uid);
          profileData = profile;
          if (profile) {
            name = profile.name || name;
            phone = profile.phone || phone;
            photo = profile.photoURL || photo;
          }
        } catch (e) { /* ignore */ }
      }

      document.getElementById('profile-name').textContent = name;
      document.getElementById('profile-phone').textContent = phone;
      const isAdmin = ADMIN_EMAILS.map(e => e.toLowerCase()).includes((user.email || '').toLowerCase());
      const role = isAdmin ? 'admin' : (profileData?.role || 'customer');
      const panel = document.getElementById('role-panel-link');
      if (panel && role !== 'customer') {
        panel.hidden = false;
        panel.href = role === 'rider' ? 'rider.html' : role === 'restaurant' ? 'shop.html' : 'admin.html';
        panel.textContent = role === 'rider' ? 'Open Rider Panel' : role === 'restaurant' ? 'Open Shop Panel' : 'Open Admin Panel';
      }

      if (photo) {
        const avatar = document.querySelector('.profile-avatar');
        const image = document.createElement('img');
        image.src = photo;
        image.alt = name;
        image.referrerPolicy = 'no-referrer';
        avatar.replaceChildren(image);
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
      if (action === 'address') {
        const user = getCurrentUser();
        if (!user) { window.location.href = 'login.html'; return; }
        (async () => {
          const saved = JSON.parse(localStorage.getItem('khabarghor_customer') || '{}');
          const current = await getUserProfile(user.uid).catch(() => null);
          showModal({
            title: 'Delivery address',
            content: `<textarea id="m-address" rows="3" placeholder="House, road, area, upazila, district" style="width:100%;padding:10px;border:1px solid #eee;border-radius:12px">${escapeHtml(current?.address || saved.address || '')}</textarea>`,
            confirmText: 'Save',
            onConfirm: async () => {
              const address = document.getElementById('m-address').value.trim();
              try {
                await updateUserProfile(user.uid, { address });
                localStorage.setItem('khabarghor_customer', JSON.stringify({ ...saved, name: current?.name || user.displayName || '', phone: current?.phone || '', address }));
                showToast('Delivery address saved', 'success');
              } catch (err) { showToast('Could not save address. Try again.', 'error'); }
            }
          });
        })();
        return;
      }
      if (action === 'edit-profile') {
        const user = getCurrentUser();
        if (!user) { window.location.href = 'login.html'; return; }
        (async () => {
          const old = await getUserProfile(user.uid) || {};
          const inputStyle = 'width:100%;padding:10px;margin:4px 0 10px;border:1px solid #eee;border-radius:12px';
          showModal({
            title: 'Edit profile',
            content: `
              <label style="font-size:.85rem">Name</label>
              <input id="m-name" value="${escapeHtml(old.name || user.displayName || '')}" style="${inputStyle}">
              <label style="font-size:.85rem">Mobile number</label>
              <input id="m-phone" type="tel" placeholder="01XXXXXXXXX" value="${escapeHtml(old.phone || '')}" style="${inputStyle}">`,
            confirmText: 'Save',
            onConfirm: async () => {
              const name = document.getElementById('m-name').value.trim();
              const phone = document.getElementById('m-phone').value.trim();
              if (!name) { showToast('Name cannot be empty', 'error'); return; }
              if (phone && !/^(\+?88)?01[3-9]\d{8}$/.test(phone)) { showToast('Enter a valid BD mobile number', 'error'); return; }
              try {
                await updateUserProfile(user.uid, { name, phone });
                document.getElementById('profile-name').textContent = name;
                document.getElementById('profile-phone').textContent = phone || user.email || '';
                showToast('Profile updated', 'success');
              } catch (err) { showToast('Could not update profile. Try again.', 'error'); }
            }
          });
        })();
        return;
      }
      const titles = {
        address: 'My Address',
        payment: 'Payment Method',
        voucher: 'My Vouchers',
        about: 'About Khabar Ghor'
      };
      const contents = {
        address: '<p>' + escapeHtml(JSON.parse(localStorage.getItem('khabarghor_customer')||'{}').address || 'No saved address yet.') + '</p><p style="color:var(--text-muted);font-size:0.85rem;margin-top:8px;">You can edit your address at checkout.</p>',
        payment: '<p>Cash on Delivery (COD) only. Pay the rider in cash when your order arrives.</p>',
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
