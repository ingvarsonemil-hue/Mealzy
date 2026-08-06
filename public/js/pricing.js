/* pricing.js — pricing.html page logic (billing toggle, popup, nav, FAQ) */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add(reduced ? 'no-motion' : 'js-motion');

  var billingMode = 'monthly';
  var STRIPE_MONTHLY = window.STRIPE_MONTHLY || 'https://buy.stripe.com/28E28r1Q73q0e6neQRffy00';
  var STRIPE_YEARLY = window.STRIPE_ANNUAL || STRIPE_MONTHLY;
  /* Family must never silently fall back to Pro's checkout link — that would
   * charge the Pro price for a plan marketed at a different price. If the
   * dedicated Family link isn't configured, route to support instead. */
  var FAMILY_FALLBACK = 'mailto:support@mealzy.org?subject=Family%20Plan';
  var STRIPE_FAMILY_MONTHLY = window.STRIPE_FAMILY_MONTHLY_READY ? window.STRIPE_FAMILY_MONTHLY : FAMILY_FALLBACK;
  var STRIPE_FAMILY_YEARLY = window.STRIPE_FAMILY_ANNUAL_READY ? window.STRIPE_FAMILY_ANNUAL : FAMILY_FALLBACK;

  /* Source of truth: monthly price and total annual price, in dollars.
   * Everything else (yearly/month figure, savings text, "Save X%" badge)
   * is derived from these two numbers so a price change can't leave a
   * stale percentage behind. */
  var MONTHLY_PRICE = { premium: 8, family: 16 };
  var ANNUAL_TOTAL = { premium: 62, family: 128 };

  function money(n) { return '$' + (Number.isInteger(n) ? n : n.toFixed(2)); }
  function savePct(monthly, annualTotal) { return Math.round((1 - annualTotal / (monthly * 12)) * 100); }
  function saveAmount(monthly, annualTotal) { return monthly * 12 - annualTotal; }

  var premiumSavePct = savePct(MONTHLY_PRICE.premium, ANNUAL_TOTAL.premium);
  var familySavePct = savePct(MONTHLY_PRICE.family, ANNUAL_TOTAL.family);

  /* Annual mode shows the yearly total, not a per-month equivalent, so the
   * number on the card is the number Stripe charges. */
  var prices = {
    monthly: { free: '$0', premium: money(MONTHLY_PRICE.premium), family: money(MONTHLY_PRICE.family) },
    yearly: { free: '$0', premium: money(ANNUAL_TOTAL.premium), family: money(ANNUAL_TOTAL.family) }
  };
  var periods = {
    monthly: { free: '/month', premium: '/month', family: '/month' },
    yearly: { free: '/month', premium: '/year', family: '/year' }
  };
  var billedTxt = {
    monthly: { free: '', premium: '', family: '' },
    yearly: {
      free: '',
      premium: 'Save ' + premiumSavePct + '% — ' + money(saveAmount(MONTHLY_PRICE.premium, ANNUAL_TOTAL.premium)) + ' less than monthly',
      family: 'Save ' + familySavePct + '% — ' + money(saveAmount(MONTHLY_PRICE.family, ANNUAL_TOTAL.family)) + ' less than monthly'
    }
  };

  function trackUpgradeClick(plan) {
    mealzyTrack('upgrade_click', { source: 'pricing_page', plan: plan || 'pro' });
  }

  function setBilling(mode) {
    billingMode = mode;
    ['btnMonthly', 'btnYearly'].forEach(function (id) {
      var active = (id === 'btnMonthly') === (mode === 'monthly');
      var el = document.getElementById(id);
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    });
    var p = prices[mode], b = billedTxt[mode], per = periods[mode];
    [
      ['priceFreeMo', 'billedFree', 'periodFree', p.free, b.free, per.free],
      ['pricePremiumMo', 'billedPremium', 'periodPremium', p.premium, b.premium, per.premium],
      ['priceFamilyMo', 'billedFamily', 'periodFamily', p.family, b.family, per.family]
    ].forEach(function (row) {
      document.getElementById(row[0]).textContent = row[3];
      document.getElementById(row[1]).textContent = row[4];
      document.getElementById(row[2]).textContent = row[5];
    });
    var cta = document.getElementById('proCta');
    var ctaNote = document.getElementById('proCtaNote');
    /* The button carries "$0 due today", so the note states only what happens
     * after the trial ends — no duplicated "$0 due today" on the same card. */
    cta.textContent = 'Start 7-day free trial — $0 due today';
    if (mode === 'yearly') {
      cta.href = STRIPE_YEARLY;
      ctaNote.textContent = 'Then ' + money(ANNUAL_TOTAL.premium) + '/year — cancel anytime.';
    } else {
      cta.href = STRIPE_MONTHLY;
      ctaNote.textContent = 'Then ' + money(MONTHLY_PRICE.premium) + '/mo — cancel anytime.';
    }
    var familyCta = document.getElementById('familyCta');
    familyCta.href = mode === 'yearly' ? STRIPE_FAMILY_YEARLY : STRIPE_FAMILY_MONTHLY;
    familyCta.textContent = mode === 'yearly' ? 'Start Family Annual' : 'Start Family';
  }

  function init() {
    document.getElementById('themeToggle').addEventListener('click', function () {
      var next = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('mealzy_theme', next); } catch (e) {}
    });

    document.getElementById('proCta').href = STRIPE_MONTHLY;
    document.getElementById('familyCta').href = STRIPE_FAMILY_MONTHLY;
    document.getElementById('yearlySavePct').textContent = String(premiumSavePct);

    document.getElementById('btnMonthly').addEventListener('click', function () { setBilling('monthly'); });
    document.getElementById('btnYearly').addEventListener('click', function () { setBilling('yearly'); });
    document.getElementById('proCta').addEventListener('click', function () { trackUpgradeClick('pro'); });
    document.getElementById('familyCta').addEventListener('click', function () { trackUpgradeClick('family'); });

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
