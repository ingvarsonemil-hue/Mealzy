/* login.js — login.html auth logic (tabs, sign in/up, reset, password checklist) */
(function () {
  'use strict';

  var SVG_UNMET = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/></svg>';
  var SVG_MET = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="var(--color-green)"/><polyline points="4.5,8 7,10.5 11.5,5.5" stroke="var(--clr-on-primary)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var EYE_ON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  var PW_RULES = {
    len: function (pw) { return pw.length >= 12; },
    upper: function (pw) { return /[A-Z]/.test(pw); },
    lower: function (pw) { return /[a-z]/.test(pw); },
    num: function (pw) { return /\d/.test(pw); },
    special: function (pw) { return /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw); }
  };

  function updatePwChecklist(inputId, listId) {
    var pw = document.getElementById(inputId).value;
    var list = document.getElementById(listId);
    if (!list) return;
    list.querySelectorAll('li[data-rule]').forEach(function (li) {
      var met = PW_RULES[li.dataset.rule](pw);
      li.classList.toggle('met', met);
      li.innerHTML = (met ? SVG_MET : SVG_UNMET) + li.dataset.label;
    });
  }

  function showError(msg) {
    var el = document.getElementById('authError');
    el.textContent = msg;
    el.classList.remove('success');
    el.classList.add('show');
  }
  function showSuccess(msg) {
    var el = document.getElementById('authError');
    el.textContent = msg;
    el.classList.add('success', 'show');
  }
  function hideError() { document.getElementById('authError').classList.remove('show', 'success'); }

  function setLoading(btnId, loading) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? 'Please wait...' : (btnId === 'btnSignIn' ? 'Sign in' : 'Create account');
  }

  function switchTab(tab) {
    var isSignIn = tab === 'signin';
    var isReset = tab === 'reset';
    document.getElementById('tabSignin').classList.toggle('active', isSignIn);
    document.getElementById('tabSignin').setAttribute('aria-selected', String(isSignIn));
    document.getElementById('tabRegister').classList.toggle('active', !isSignIn && !isReset);
    document.getElementById('tabRegister').setAttribute('aria-selected', String(!isSignIn && !isReset));
    document.getElementById('signinPanel').style.display = isSignIn ? '' : 'none';
    document.getElementById('registerPanel').style.display = (!isSignIn && !isReset) ? '' : 'none';
    document.getElementById('formReset').style.display = isReset ? '' : 'none';
    document.getElementById('authTabs').style.display = isReset ? 'none' : '';
    document.getElementById('authNote').style.display = isReset ? 'none' : '';
    document.getElementById('btnGoogle').style.display = isReset ? 'none' : '';
    document.querySelector('.divider').style.display = isReset ? 'none' : '';
    if (!isReset) {
      document.querySelector('.login-heading').textContent = isSignIn ? 'Welcome back' : 'Create your account';
      document.querySelector('.login-subheading').textContent = isSignIn ? 'Your plans are waiting.' : 'A full week of meals, 30 seconds from now.';
    }
    hideError();
  }

  function togglePw(id, btn) {
    var input = document.getElementById(id);
    var isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    btn.innerHTML = isText ? EYE_ON : EYE_OFF;
    btn.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
  }

  async function handleSignUp(e) {
    e.preventDefault(); hideError(); setLoading('btnSignUp', true);
    var name = document.getElementById('suName').value.trim();
    var email = document.getElementById('suEmail').value.trim().toLowerCase();
    var password = document.getElementById('suPassword').value;
    if (!name || !email || !password) { showError('Please fill in all fields.'); setLoading('btnSignUp', false); return; }
    try {
      var res = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, email: email, password: password }) });
      var data = await res.json();
      if (!res.ok) { showError(data.message || 'Sign up failed. Please try again.'); setLoading('btnSignUp', false); return; }
      if (data.user) {
        localStorage.setItem('mealzy_user', JSON.stringify({ name: data.user.name, email: data.user.email }));
        if (data.user.ref_code) localStorage.setItem('mealzy_ref_code', data.user.ref_code);
        if (data.user.pro) localStorage.setItem('mealzy_pro', 'true');
        try { fetch('/api/email-leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, name: name, source: 'signup' }) }); } catch (err) {}
        var pendingRef = localStorage.getItem('mealzy_pending_ref');
        if (pendingRef && pendingRef !== email) {
          try { fetch('/api/referral', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referrer_email: pendingRef, new_user_email: email }) }); } catch (err) {}
          localStorage.removeItem('mealzy_pending_ref');
        }
        localStorage.setItem('mealzy_is_new_user', '1');
        window.location.href = onboardingUrl();
      } else {
        showSuccess(data.message || 'Check your email to continue.');
        setLoading('btnSignUp', false);
      }
    } catch (err) { showError('Could not connect. Please check your connection and try again.'); setLoading('btnSignUp', false); }
  }

  async function handleSignIn(e) {
    e.preventDefault(); hideError(); setLoading('btnSignIn', true);
    var email = document.getElementById('siEmail').value.trim().toLowerCase();
    var password = document.getElementById('siPassword').value;
    try {
      var res = await fetch('/api/auth/signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: password }) });
      var data = await res.json();
      if (!res.ok) { showError(data.message || 'Sign in failed. Please try again.'); setLoading('btnSignIn', false); return; }
      localStorage.setItem('mealzy_user', JSON.stringify({ name: data.user.name, email: data.user.email }));
      if (data.user.pro) localStorage.setItem('mealzy_pro', 'true'); else localStorage.removeItem('mealzy_pro');
      try {
        var profileRes = await fetch('/api/profile');
        if (profileRes.ok) { var pd = await profileRes.json(); localStorage.setItem('mealzy_profile', JSON.stringify(pd.profile)); window.location.href = 'dashboard.html'; }
        else window.location.href = onboardingUrl();
      } catch (err) { window.location.href = localStorage.getItem('mealzy_profile') ? 'dashboard.html' : onboardingUrl(); }
    } catch (err) { showError('Could not connect. Please check your connection and try again.'); setLoading('btnSignIn', false); }
  }

  /* Forwards the homepage demo's targets (?budget=&diet=/&dietary=&household=)
   * on to onboarding.html so the wizard can pre-fill them — otherwise they're
   * dropped the moment login.html finishes and the user starts over. */
  function onboardingUrl() {
    var qs = new URLSearchParams(window.location.search);
    var keep = new URLSearchParams();
    ['budget', 'diet', 'dietary', 'household'].forEach(function (k) {
      var v = qs.get(k);
      if (v) keep.set(k, v);
    });
    var s = keep.toString();
    return 'onboarding.html' + (s ? '?' + s : '');
  }

  function handleReset() {
    hideError();
    var emailVal = document.getElementById('siEmail').value.trim();
    if (emailVal) document.getElementById('resetEmail').value = emailVal;
    switchTab('reset');
  }

  async function requestReset() {
    hideError();
    var email = document.getElementById('resetEmail').value.trim().toLowerCase();
    if (!email) { showError('Enter your email address.'); return; }
    var btn = document.getElementById('btnGetReset');
    btn.disabled = true; btn.textContent = 'Please wait...';
    try {
      await fetch('/api/auth/reset-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) });
      btn.disabled = false; btn.textContent = 'Send Reset Link';
      document.getElementById('resetStep2').style.display = '';
      showSuccess('If that email has an account, a reset link is on its way. Check your inbox.');
    } catch (err) { btn.disabled = false; btn.textContent = 'Send Reset Link'; showError('Could not connect. Email support@mealzy.org if this persists.'); }
  }

  function init() {
    /* Google OAuth errors from redirect */
    var oauthError = new URLSearchParams(window.location.search).get('error');
    if (oauthError === 'google_failed') showError('Google sign-in failed. Please try again or use email.');
    else if (oauthError === 'google_cancelled') showError('Google sign-in was cancelled.');
    else if (oauthError === 'google_not_configured') showError('Google sign-in is not yet available.');

    /* Already signed in? */
    (async function checkExistingSession() {
      try {
        var res = await fetch('/api/auth/me');
        if (res.ok) {
          var data = await res.json();
          localStorage.setItem('mealzy_user', JSON.stringify({ name: data.name, email: data.email }));
          if (data.pro) localStorage.setItem('mealzy_pro', 'true');
          if (data.profile) localStorage.setItem('mealzy_profile', JSON.stringify(data.profile));
          window.location.href = data.profile ? 'dashboard.html' : onboardingUrl();
        }
      } catch (e) {
        if (localStorage.getItem('mealzy_user')) {
          window.location.href = localStorage.getItem('mealzy_profile') ? 'dashboard.html' : onboardingUrl();
        }
      }
    })();

    /* Referral capture */
    var refParam = new URLSearchParams(window.location.search).get('ref') || '';
    if (refParam) localStorage.setItem('mealzy_pending_ref', refParam);

    /* Bindings */
    document.getElementById('tabSignin').addEventListener('click', function () { switchTab('signin'); });
    document.getElementById('tabRegister').addEventListener('click', function () { switchTab('signup'); });
    document.getElementById('btnGoogle').addEventListener('click', function () { window.location.href = '/auth/google'; });
    document.getElementById('signinPanel').addEventListener('submit', handleSignIn);
    document.getElementById('registerPanel').addEventListener('submit', handleSignUp);
    document.getElementById('resetLink').addEventListener('click', handleReset);
    document.getElementById('btnGetReset').addEventListener('click', requestReset);
    document.getElementById('btnBackToSignin').addEventListener('click', function () { switchTab('signin'); });
    document.querySelectorAll('.pw-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () { togglePw(btn.dataset.for, btn); });
    });
    var suPw = document.getElementById('suPassword');
    suPw.addEventListener('input', function () { updatePwChecklist('suPassword', 'suPwChecklist'); });
    suPw.addEventListener('focus', function () { document.getElementById('suPwChecklist').classList.add('visible'); });

    /* Auto-switch to signup and pre-fill email */
    var qs = new URLSearchParams(window.location.search);
    if (qs.get('signup') === '1') {
      switchTab('signup');
      var emailPrefill = qs.get('email');
      if (emailPrefill) { var ef = document.getElementById('suEmail'); if (ef) ef.value = decodeURIComponent(emailPrefill); }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
