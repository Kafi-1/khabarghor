/**
 * Khabar Ghor - Promo page (Firebase real data only, no demo)
 */
import { renderBottomNav } from './ui.js';
import { getPromos } from './firestore.js';
import { isFirebaseConfigured } from './firebase-config.js';
import { escapeHtml, showEmpty, showError } from './utils.js';
import { updateCartBadge } from './cart.js';

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('bottom-nav').innerHTML = renderBottomNav('home');
  updateCartBadge();

  const list = document.getElementById('promo-list');
  if (!isFirebaseConfigured) {
    showEmpty(list, 'Firebase is not set up yet.', '⚙️');
    return;
  }

  try {
    const promos = await getPromos();
    if (!promos.length) {
      showEmpty(list, 'No promos available right now.', '🏷️');
      return;
    }
    list.innerHTML = promos.map(p => `
      <div class="promo-card">
        ${p.image ? `<img src="${escapeHtml(p.image)}" alt="" style="width:100%;border-radius:12px;margin-bottom:10px;max-height:140px;object-fit:cover;">` : ''}
        <h4>${escapeHtml(p.title || 'Promo')}</h4>
        <p>${escapeHtml(p.description || '')}</p>
        ${p.code ? `<p style="margin-top:8px;">Code: <strong>${escapeHtml(p.code)}</strong></p>` : ''}
        ${p.link ? `<a href="${escapeHtml(p.link)}" class="btn btn-primary btn-sm" style="margin-top:10px;">View</a>` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
    showError(list, 'Could not load promos.');
  }
});
