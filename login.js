/**
 * Khabar Ghor - Login / Register Page
 */

import { login, register, loginWithGoogle, onAuthReady } from './auth.js';
import { showToast } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  // Redirect if already logged in
  onAuthReady(user => {
    if (user) {
      const redirect = sessionStorage.getItem('auth_redirect') || 'index.html';
      sessionStorage.removeItem('auth_redirect');
      window.location.href = redirect;
    }
  });

  let isRegister = false;

  document.getElementById('switch-link').addEventListener('click', (e) => {
    e.preventDefault();
    isRegister = !isRegister;
    document.getElementById('login-form').style.display = isRegister ? 'none' : 'block';
    document.getElementById('register-form').style.display = isRegister ? 'block' : 'none';
    document.getElementById('switch-text').textContent = isRegister ? 'Already have an account?' : "Don't have an account?";
    document.getElementById('switch-link').textContent = isRegister ? 'Login' : 'Sign Up';
  });

  document.getElementById('login-submit').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      showToast('Enter email and password', 'error');
      return;
    }

    try {
      await login(email, password);
      const redirect = sessionStorage.getItem('auth_redirect') || 'index.html';
      sessionStorage.removeItem('auth_redirect');
      window.location.href = redirect;
    } catch (e) { /* handled in auth.js */ }
  });

  document.getElementById('register-submit').addEventListener('click', async () => {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    if (!name || !email || !password) {
      showToast('Fill in all fields', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    try {
      await register(email, password, name);
      window.location.href = 'index.html';
    } catch (e) { /* handled */ }
  });

  document.getElementById('google-login').addEventListener('click', async () => {
    try {
      await loginWithGoogle();
      window.location.href = 'index.html';
    } catch (e) { /* handled */ }
  });
});
