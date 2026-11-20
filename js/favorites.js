/**
 * Khabar Ghor - Favourites Page
 */
import { renderBottomNav, renderRestaurantCard, showToast } from './ui.js';
import { getUserFavourites, toggleFavourite } from './firestore.js';
import { showEmpty } from './utils.js';
import { onAuthReady, getCurrentUser } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('bottom-nav').innerHTML = renderBottomNav('favorites');
  loadFavourites();
});

async function loadFavourites() {
  const container = document.getElementById('fav-list');

  const user = await new Promise(r => onAuthReady(r));
  if (!user) {
    showEmpty(container, 'Login to see your favourites', '❤️');
    container.innerHTML += `<div style="text-align:center;margin-top:12px;"><a href="login.html" class="btn btn-primary">Login</a></div>`;
    return;
  }

  try {
    const favs = await getUserFavourites(user.uid);
    if (!favs.length) {
      showEmpty(container, 'No favourites yet', '❤️');
      container.innerHTML += `
        <p style="text-align:center;font-size:0.85rem;color:var(--text-muted);margin-top:4px;">
          Add restaurants from the restaurant page
        </p>
        <div style="text-align:center;margin-top:16px;">
          <a href="restaurants.html" class="btn btn-primary">Browse Restaurants</a>
        </div>`;
      return;
    }

    // Map favourites to restaurant-card shape
    const list = favs.map(f => ({
      id: f.restaurantId,
      name: f.restaurantName || 'Restaurant',
      image: f.restaurantImage || '',
      description: ''
    }));

    container.innerHTML = `<div class="restaurant-list">${list.map(r =>
      renderRestaurantCard(r, { isFavourite: true })
    ).join('')}</div>`;

    // Remove from favourites
    container.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const restId = btn.dataset.id;
        try {
          await toggleFavourite(user.uid, restId);
          showToast('Removed from favourites', 'info');
          loadFavourites(); // refresh
        } catch (err) {
          showToast('Could not update', 'error');
        }
      });
    });
  } catch (err) {
    console.error(err);
    showEmpty(container, 'Could not load favourites', '⚠️');
  }
}
