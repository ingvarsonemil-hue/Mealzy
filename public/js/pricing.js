/* pricing.js — pricing.html page logic (billing toggle, popup, nav, FAQ) */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add(reduced ? 'no-motion' : 'js-motion');

  var billingMode = 'monthly';
  var STRIPE_MONTHLY = window.STRIPE_MONTHLY || 'https://buy.stripe.com/28E28r1Q73q0e6neQRffy00';
  var STRIPE_YEARLY = window.STRIPE_ANNUAL || STRIPE_MONTHLY;
  var STRIPE_FAMILY_MONTHLY = window.STRIPE_FAMILY_MONTHLY || STRIPE_MONTHLY;
  var STRIPE_FAMILY_YEARLY = window.STRIPE_FAMILY_ANNUAL || STRIPE_MONTHLY;

  var prices = { monthly: { free: '$0', premium: '$12', family: '$16' }, yearly: { free: '$0', premium: '$8', family: '$11' } };
  var billedTxt = {
    monthly: { free: '', premium: 'or $8/month billed yearly — save $48', family: 'or $11/month billed yearly — save $62' },
    yearly: { free: '', premium: 'Billed $96/year — save $48 vs monthly', family: 'Billed $130/year — save $62 vs monthly' }
  };

  function trackUpgradeClick(plan) {
    fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'upgrade_click', data: { source: 'pricing_page', plan: plan || 'pro' } }) }).catch(function () {});
    if (window.amplitude) window.amplitude.track('Checkout Started', { plan: plan || 'pro', billing: billingMode, source: 'pricing_page' });
  }

  function setBilling(mode) {
    billingMode = mode;
    ['btnMonthly', 'btnYearly'].forEach(function (id) {
      var active = (id === 'btnMonthly') === (mode === 'monthly');
      var el = document.getElementById(id);
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    });
    var p = prices[mode], b = billedTxt[mode];
    [['priceFreeMo', 'billedFree', p.free, b.free], ['pricePremiumMo', 'billedPremium', p.premium, b.premium], ['priceFamilyMo', 'billedFamily', p.family, b.family]].forEach(function (row) {
      document.getElementById(row[0]).textContent = row[2];
      document.getElementById(row[1]).textContent = row[3];
    });
    var cta = document.getElementById('proCta');
    var ctaNote = document.getElementById('proCtaNote');
    if (mode === 'yearly') {
      cta.href = STRIPE_YEARLY; cta.textContent = 'Start Pro Annual — 7 Days Free';
      ctaNote.textContent = 'Best value — $96/year saves you $48 vs monthly.';
    } else {
      cta.href = STRIPE_MONTHLY; cta.textContent = 'Start Pro — 7 Days Free';
      ctaNote.textContent = '$12/mo — cancel any time.';
    }
    var familyCta = document.getElementById('familyCta');
    familyCta.href = mode === 'yearly' ? STRIPE_FAMILY_YEARLY : STRIPE_FAMILY_MONTHLY;
    familyCta.textContent = mode === 'yearly' ? 'Start Family Annual' : 'Start Family';
  }

  /* Deciding popup */
  var popupTrigger = null;
  function closeDecidingPopup() {
    document.getElementById('decidingPopup').classList.remove('show');
    sessionStorage.setItem('pricing_popup_seen', '1');
    if (popupTrigger) { popupTrigger.focus(); popupTrigger = null; }
  }
  function showDecidingPopup() {
    popupTrigger = document.activeElement;
    var popup = document.getElementById('decidingPopup');
    popup.classList.add('show');
    var first = popup.querySelector('a[href],button:not([disabled])');
    if (first) first.focus();
  }

  function init() {
    document.getElementById('themeToggle').addEventListener('click', function () {
      var next = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('mealzy_theme', next); } catch (e) {}
    });

    if (window.amplitude && localStorage.getItem('mealzy_user') && localStorage.getItem('mealzy_pro') !== 'true') {
      window.amplitude.track('Upgrade Page Viewed', { page: 'pricing' });
    }

    document.getElementById('popupCta').href = STRIPE_MONTHLY;
    setBilling('monthly'); /* render prices, CTAs, and the annual-savings line on load */

    document.getElementById('btnMonthly').addEventListener('click', function () { setBilling('monthly'); });
    document.getElementById('btnYearly').addEventListener('click', function () { setBilling('yearly'); });
    document.getElementById('proCta').addEventListener('click', function () { trackUpgradeClick('pro'); });
    document.getElementById('familyCta').addEventListener('click', function () { trackUpgradeClick('family'); });
    document.getElementById('popupCta').addEventListener('click', function () { trackUpgradeClick('pro'); closeDecidingPopup(); });
    document.getElementById('popupClose').addEventListener('click', closeDecidingPopup);

    if (!sessionStorage.getItem('pricing_popup_seen')) setTimeout(showDecidingPopup, 30000);

    /* Focus trap + Escape for deciding popup */
    document.addEventListener('keydown', function (e) {
      var popup = document.getElementById('decidingPopup');
      if (!popup.classList.contains('show')) return;
      if (e.key === 'Escape') { closeDecidingPopup(); return; }
      if (e.key !== 'Tab') return;
      var focusable = popup.querySelectorAll('a[href], button:not([disabled])');
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    /* Mobile nav */
    var hamburger = document.getElementById('hamburger');
    var overlay = document.getElementById('mobileNavOverlay');
    var panel = document.getElementById('mobileNavPanel');
    function closeNav() { overlay.classList.remove('open'); panel.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); hamburger.setAttribute('aria-expanded', 'false'); }
    hamburger.addEventListener('click', function () { overlay.classList.add('open'); panel.classList.add('open'); overlay.setAttribute('aria-hidden', 'false'); hamburger.setAttribute('aria-expanded', 'true'); });
    document.getElementById('mobileNavClose').addEventListener('click', closeNav);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeNav(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('open')) closeNav(); });

    /* Nav scroll state */
    var nav = document.getElementById('navbar');
    var upd = function () { nav.classList.toggle('scrolled', window.scrollY > 24); };
    window.addEventListener('scroll', upd, { passive: true });
    upd();

    /* Scroll reveals */
    if ('IntersectionObserver' in window && !reduced) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in-view'); io.unobserve(en.target); } });
      }, { threshold: 0, rootMargin: '0px 0px 100px 0px' });
      document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
    }

    /* FAQ accordion */
    document.querySelector('.faq-wrap').addEventListener('click', function (e) {
      var btn = e.target.closest('.faq-question');
      if (!btn) return;
      var item = btn.closest('.faq-item');
      var answer = item.querySelector('.faq-answer');
      var isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (el) {
        el.classList.remove('open');
        el.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
        var a = el.querySelector('.faq-answer');
        a.setAttribute('aria-hidden', 'true');
        a.style.maxHeight = null;
      });
      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        answer.setAttribute('aria-hidden', 'false');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
