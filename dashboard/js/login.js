/**
 * Porchlight — login page controller.
 * Demo auth via PorchlightAuth (js/auth.js). Swap in real POST /auth/login there.
 */
(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }

  var Auth = window.PorchlightAuth;
  var form = $('#login-form');
  var email = $('#login-email');
  var password = $('#login-password');
  var errorBox = $('#login-error');
  var submitBtn = $('#login-submit');
  var submitLabel = $('#login-submit-label');

  /* already signed in → straight to the dashboard */
  if (Auth && Auth.session()) {
    location.replace('index.html');
    return;
  }

  /* theme toggle (mirrors the dashboard behaviour) */
  var themeBtn = $('#login-theme');
  themeBtn.addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', cur);
    try { localStorage.setItem('porchlight-theme', cur); } catch (e) { /* private mode */ }
    themeBtn.setAttribute('aria-label', cur === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  });

  /* password visibility */
  var pwToggle = $('#login-pw-toggle');
  pwToggle.addEventListener('click', function () {
    var show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    pwToggle.setAttribute('aria-pressed', show ? 'true' : 'false');
    pwToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = !msg;
    if (msg) {
      errorBox.classList.remove('is-shake');
      void errorBox.offsetWidth; /* restart shake animation */
      errorBox.classList.add('is-shake');
    }
    email.setAttribute('aria-invalid', msg ? 'true' : 'false');
    password.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function setBusy(busy) {
    submitBtn.disabled = busy;
    submitLabel.textContent = busy ? 'Signing in…' : 'Sign in';
  }

  function doLogin(mail, pass) {
    showError('');
    setBusy(true);
    Auth.login(mail, pass).then(function () {
      location.href = 'index.html';
    }).catch(function (err) {
      setBusy(false);
      showError(err.message || 'Sign-in failed.');
      password.focus();
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!email.value.trim() || !password.value) {
      showError('Enter your email and password.');
      (!email.value.trim() ? email : password).focus();
      return;
    }
    doLogin(email.value, password.value);
  });

  $('#login-demo-fill').addEventListener('click', function () {
    email.value = Auth.DEMO.email;
    password.value = Auth.DEMO.password;
    doLogin(email.value, password.value);
  });
})();
