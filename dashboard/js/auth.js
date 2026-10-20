/**
 * Porchlight — auth helper (mock session).
 * Demo account only — validation is local. PLACEHOLDER comments mark where a
 * real backend would plug in.
 *
 * REST endpoints this replaces when live:
 *   POST /auth/login    { email, password } → { user: { id, name, email }, token }
 *   POST /auth/logout   → { ok: true }
 *   GET  /auth/me       → { user: { id, name, email } }  (session restore)
 */
(function () {
  'use strict';

  var SESSION_KEY = 'porchlight-session';

  /* Demo account shown on the login page. */
  var DEMO = {
    email: 'demo@porchlight.app',
    password: 'doorbell123',
    user: { id: 'u-demo', name: 'Alex Morgan', email: 'demo@porchlight.app' }
  };

  function session() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function login(email, password) {
    return new Promise(function (resolve, reject) {
      /* PLACEHOLDER: replace with
         fetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }) */
      setTimeout(function () {
        var mail = String(email || '').trim().toLowerCase();
        if (!mail || !password) {
          reject(new Error('Enter your email and password.'));
          return;
        }
        if (mail !== DEMO.email || password !== DEMO.password) {
          reject(new Error('Email or password is incorrect. Try the demo account below.'));
          return;
        }
        var payload = { user: DEMO.user, token: 'mock-token', ts: Date.now() };
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(payload)); } catch (e) { /* private mode */ }
        resolve(payload.user);
      }, 550);
    });
  }

  function logout() {
    /* PLACEHOLDER: fetch('/auth/logout', { method: 'POST' }) */
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  /* Redirect to login when signed out. Returns true when a session exists. */
  function requireAuth() {
    if (session()) return true;
    try { location.replace('login.html'); } catch (e) { location.href = 'login.html'; }
    return false;
  }

  window.PorchlightAuth = {
    DEMO: DEMO,
    session: session,
    login: login,
    logout: logout,
    requireAuth: requireAuth
  };
})();
