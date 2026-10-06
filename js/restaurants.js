/**
 * Khabar Ghor - Restaurants List Page
 */

import { renderBottomNav, renderRestaurantCard, renderSkeletonCards, showToast } from './ui.js';
import { getRestaurants, searchRestaurants, toggleFavourite, getUserFavourites } from './firestore.js';
import { getQueryParam, debounce, showEmpty } from './utils.js';
import { updateCartBadge } from './cart.js';
import { isFirebaseConfigured } from './firebase-config.js';
import { onAuthReady, getCurrentUser } from './auth.js';

let allRestaurants = [];
let currentFilter = 'nearby';

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('bottom-nav').innerHTML = renderBottomNav('home');
  updateCartBadge();

  // Wait for auth so favourites hearts show correctly
  await new Promise(r => onAuthReady(r));

  // Pre-fill search from query
  const q = getQueryParam('q');
  if (q) {
    document.getElementById('search-input').value = q;
  }

  await loadRestaurants();
  if (q) await searchAndRender(q);

  // Filters
  document.getElementById('filter-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    applyFilterAndRender();
  });

  // Search (from 1 character)
  document.getElementById('search-input').addEventListener('input', debounce(async (e) => {
    const term = e.target.value.trim();
    if (term.length >= 1) {
      await searchAndRender(term);
    } else {
      await loadRestaurants();
    }
  }, 200));
});

async function loadRestaurants() {
  const container = document.getElementById('restaurant-list');
  if (!isFirebaseConfigured) {
    showEmpty(container, 'Firebase is not set up yet (see README).', '⚙️');
    return;
  }
  container.innerHTML = renderSkeletonCards(4);
  try {
    allRestaurants = await getRestaurants();
    applyFilterAndRender();
  } catch (err) {
    console.error(err);
    showEmpty(container, 'Could not load restaurants', '⚠️');
  }
}

function applyFilterAndRender() {
  let list = [...allRestaurants];

  switch (currentFilter) {
    case 'nearby':
      list.sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99));
      break;
    case 'rating':
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case 'popular':
      list.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
      break;
    case 'promo':
      // Keep original or filter promo restaurants if field exists
      break;
  }

  renderList(list);
}

async function searchAndRender(term) {
  try {
    allRestaurants = await searchRestaurants(term);
    applyFilterAndRender();
  } catch (err) {
    console.warn(err);
  }
}

async function renderList(list) {
  const container = document.getElementById('restaurant-list');
  if (!list.length) {
    showEmpty(container, 'No restaurants found', '🔍');
    return;
  }

  // Load user's favourites so hearts show correctly
  let favIds = new Set();
  const user = getCurrentUser();
  if (user) {
    try {
      const favs = await getUserFavourites(user.uid);
      favIds = new Set(favs.map(f => f.restaurantId));
    } catch (e) { /* ignore */ }
  }

  container.innerHTML = list.map(r =>
    renderRestaurantCard(r, { isFavourite: favIds.has(r.id) })
  ).join('');

  container.querySelectorAll('.favorite-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const user = getCurrentUser();
      if (!user) {
        showToast('Login to save favourites', 'info');
        return;
      }
      const restId = btn.dataset.id;
      const rest = allRestaurants.find(r => r.id === restId) || {};
      try {
        const added = await toggleFavourite(user.uid, restId, rest);
        btn.classList.toggle('active', added);
        const svg = btn.querySelector('svg');
        if (svg) svg.setAttribute('fill', added ? 'currentColor' : 'none');
        showToast(added ? 'Added to favourites' : 'Removed from favourites', added ? 'success' : 'info');
      } catch (err) {
        showToast('Could not update favourite', 'error');
      }
    });
  });
}
