/* landing.js — index.html page logic (demo, nav, popup, FAQ, reveals) */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add(reduced ? 'no-motion' : 'js-motion');

  /* ---- Theme toggle ---- */
  function toggleTheme() {
    var next = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('mealzy_theme', next); } catch (e) {}
    var btn = document.getElementById('themeToggle');
    if (btn) btn.setAttribute('aria-label', next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }

  /* ---- Email popup ---- */
  function openEmailPopup() {
    var o = document.getElementById('emailPopupOverlay');
    if (o) { o.classList.add('open'); o.removeAttribute('inert'); }
  }
  function closeEmailPopup() {
    var o = document.getElementById('emailPopupOverlay');
    if (o) { o.classList.remove('open'); o.setAttribute('inert', ''); }
  }
  function submitEmailPopup() {
    var input = document.getElementById('popupEmailInput');
    var err = document.getElementById('emailPopupError');
    var email = input.value.trim();
    if (!email || email.indexOf('@') === -1) { err.style.display = 'block'; input.focus(); return; }
    err.style.display = 'none';
    fetch('/api/email-leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, source: 'popup' }) }).catch(function () {});
    localStorage.setItem('mealzy_email_submitted', '1');
    window.location.href = 'login.html?signup=1&email=' + encodeURIComponent(email);
  }

  /* ---- Mobile nav ---- */
  function openMobileNav() {
    var h = document.getElementById('hamburger'), o = document.getElementById('mobileNavOverlay'), p = document.getElementById('mobileNavPanel');
    if (!o || !p) return;
    o.classList.add('open'); p.classList.add('open'); o.setAttribute('aria-hidden', 'false');
    if (h) h.setAttribute('aria-expanded', 'true');
    var first = o.querySelector('a,button'); if (first) first.focus();
  }
  function closeMobileNav() {
    var h = document.getElementById('hamburger'), o = document.getElementById('mobileNavOverlay'), p = document.getElementById('mobileNavPanel');
    if (!o || !p) return;
    o.classList.remove('open'); p.classList.remove('open'); o.setAttribute('aria-hidden', 'true');
    if (h) { h.setAttribute('aria-expanded', 'false'); h.focus(); }
  }

  /* ---- Demo plan ---- */
  async function runDemo() {
    var btn = document.getElementById('demoBtn');
    var spinner = document.getElementById('demoSpinner');
    var errorEl = document.getElementById('demoError');
    var result = document.getElementById('demoResult');
    var teaser = document.getElementById('demoTeaser');
    var cals = parseInt(document.getElementById('demoCals').value, 10) || 2000;
    var budget = parseFloat(document.getElementById('demoBudget').value) || 60;
    var diet = document.getElementById('demoDiet').value;
    btn.disabled = true;
    document.getElementById('demoBtnText').textContent = 'Generating...';
    spinner.style.display = 'inline-block';
    errorEl.style.display = 'none';
    result.style.display = 'none';
    if (teaser) teaser.style.display = 'none';
    try {
      var res = await fetch('/api/demo-meal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calorieGoal: cals, budget: budget, dietary: diet }) });
      if (res.status === 429) {
        errorEl.textContent = "You've used today's 3 free demos. Create a free account for unlimited access — it's free.";
        errorEl.style.display = 'block';
        return;
      }
      var data = await res.json();
      if (!data.success || !data.plan || !data.plan.meals) throw new Error(data.error || 'Generation failed');
      renderDemoPlan(data.plan, cals, budget);
      result.style.display = 'block';
      mealzyTrack('demo_generated', { cals: cals, budget: budget, diet: diet });
      requestAnimationFrame(function () { document.getElementById('demo').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    } catch (err) {
      errorEl.textContent = err.message || 'Something went wrong. Please try again.';
      errorEl.style.display = 'block';
      if (teaser) teaser.style.display = 'block';
    } finally {
      btn.disabled = false;
      document.getElementById('demoBtnText').textContent = 'Generate Sample Plan';
      spinner.style.display = 'none';
    }
  }

  function renderDemoPlan(plan, cals, budget) {
    var esc = typeof escHtml === 'function' ? escHtml : function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var byDay = {};
    var dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    plan.meals.forEach(function (m) { (byDay[m.day] = byDay[m.day] || []).push(m); });
    document.getElementById('demoPlanSub').textContent = cals + ' kcal/day · $' + budget + '/week budget';
    document.getElementById('demoPlanBody').innerHTML = dayOrder.map(function (day) {
      var meals = byDay[day] || [];
      if (!meals.length) return '';
      return '<div class="demo-day-group"><div class="demo-day-label">' + day + '</div>' + meals.map(function (m) {
        return '<div class="demo-meal-row"><div><div class="demo-meal-name">' + esc(m.name) + '</div><div class="demo-meal-type">' + esc(m.type) + '</div></div>' +
          '<div class="demo-meal-meta">' + esc(m.calories) + ' kcal &middot; ' + esc(m.protein) + 'g protein<br><span class="demo-meal-cost">~$' + (m.estimatedCost || 0).toFixed(2) + '</span></div></div>';
      }).join('') + '</div>';
    }).join('');
  }

  function trackDemoToSignup() {
    mealzyTrack('demo_to_signup_click', {});
  }

  /* ---- Init ---- */
  function init() {
    document.getElementById('demoBtn').addEventListener('click', runDemo);
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('demoSignupBtn').addEventListener('click', trackDemoToSignup);
    document.getElementById('emailPopupSubmit').addEventListener('click', submitEmailPopup);
    document.getElementById('emailPopupDismiss').addEventListener('click', closeEmailPopup);

    /* Email popup — one per session: 45 s timer, or exit intent (30 s on touch) */
    function triggerPopup(exit) {
      if (sessionStorage.getItem('mealzy_popup_shown') || localStorage.getItem('mealzy_email_submitted')) return;
      sessionStorage.setItem('mealzy_popup_shown', '1');
      if (exit) {
        var h = document.querySelector('.email-popup-card h2');
        var p = document.querySelector('.email-popup-card > p');
        if (h) h.textContent = 'Wait — save your free plan';
        if (p) p.textContent = 'Create a free account and your meal plan is always saved — access it any time, on any device.';
      }
      openEmailPopup();
    }
    setTimeout(function () { triggerPopup(false); }, 45000);
    if ('ontouchstart' in window) {
      setTimeout(function () { triggerPopup(true); }, 30000);
    } else {
      document.addEventListener('mouseleave', function (e) { if (e.clientY <= 0) triggerPopup(true); });
    }
    document.getElementById('emailPopupOverlay').addEventListener('click', function (e) { if (e.target === this) closeEmailPopup(); });

    /* Mobile nav */
    document.getElementById('hamburger').addEventListener('click', openMobileNav);
    document.getElementById('mobileNavClose').addEventListener('click', closeMobileNav);
    document.getElementById('mobileNavOverlay').addEventListener('click', function (e) { if (e.target === this) closeMobileNav(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (document.getElementById('mobileNavOverlay').classList.contains('open')) closeMobileNav();
      if (document.getElementById('emailPopupOverlay').classList.contains('open')) closeEmailPopup();
    });

    /* Smooth anchor scroll */
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var t = document.querySelector(link.getAttribute('href'));
        if (t) { e.preventDefault(); t.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); closeMobileNav(); }
      });
    });

    /* Nav scroll state */
    var navbar = document.getElementById('navbar');
    var upd = function () { navbar.classList.toggle('scrolled', window.scrollY > 24); };
    window.addEventListener('scroll', upd, { passive: true });
    upd();

    /* Scroll reveals — enhance-only; .reveal is visible without JS */
    if ('IntersectionObserver' in window && !reduced) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in-view'); io.unobserve(en.target); }
        });
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

    /* Service worker */
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {});

    /* Referral capture */
    var ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) {
      if (ref.indexOf('@') !== -1) {
        localStorage.setItem('mealzy_pending_ref', ref);
        fetch('/api/referral-capture?ref=' + encodeURIComponent(ref)).catch(function () {});
      } else if (ref.indexOf('ref_') === 0) {
        fetch('/api/ref-lookup?code=' + encodeURIComponent(ref)).then(function (r) { return r.json(); }).then(function (d) {
          if (d.found && d.email) {
            localStorage.setItem('mealzy_pending_ref', d.email);
            fetch('/api/referral-capture?ref=' + encodeURIComponent(d.email)).catch(function () {});
          }
        }).catch(function () {});
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
