/* Mealzy cookie/analytics consent gate — must load before any GA4 tags. */
(function () {
  'use strict';

  var CONSENT_KEY = 'mealzy_consent';
  var GA4_ID = 'G-27FWEVV6VD';

  function loadGA4() {
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA4_ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(s);
  }

  function loadAnalytics() {
    loadGA4();
  }

  function hideBanner(banner) {
    banner.classList.remove('show');
    setTimeout(function () {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }, 400);
  }

  function showBanner() {
    if (document.getElementById('cookieConsentBanner')) return;

    var banner = document.createElement('div');
    banner.id = 'cookieConsentBanner';
    banner.className = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<div class="cookie-consent-inner">' +
        '<p class="cookie-consent-text">We use cookies and analytics to improve Mealzy. See our <a href="/privacy-policy.html">Privacy Policy</a>.</p>' +
        '<div class="cookie-consent-actions">' +
          '<button type="button" class="btn btn-outline btn-sm" id="cookieDeclineBtn">Necessary only</button>' +
          '<button type="button" class="btn btn-primary btn-sm" id="cookieAcceptBtn">Accept</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(banner);

    document.getElementById('cookieAcceptBtn').addEventListener('click', function () {
      localStorage.setItem(CONSENT_KEY, 'accepted');
      loadAnalytics();
      hideBanner(banner);
    });
    document.getElementById('cookieDeclineBtn').addEventListener('click', function () {
      localStorage.setItem(CONSENT_KEY, 'declined');
      hideBanner(banner);
    });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.classList.add('show'); });
    });
  }

  function mealzyTrack(event, data) {
    var consent;
    try {
      consent = localStorage.getItem(CONSENT_KEY);
    } catch (e) {
      return;
    }
    if (consent !== 'accepted') return;
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: event, data: data })
    }).catch(function () {});
  }
  window.mealzyTrack = mealzyTrack;

  // Reliable variant for events fired immediately before navigation (e.g.
  // checkout redirects) where a plain fetch could be aborted by the page
  // unloading. sendBeacon queues the request with the browser and survives
  // navigation; a Blob with an explicit application/json type is required
  // so the server's express.json() parser (which only reads that content
  // type) can read the body — sendBeacon defaults to text/plain otherwise.
  function mealzyTrackReliable(event, data) {
    var consent;
    try {
      consent = localStorage.getItem(CONSENT_KEY);
    } catch (e) {
      return;
    }
    if (consent !== 'accepted') return;
    var payload = JSON.stringify({ event: event, data: data });
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([payload], { type: 'application/json' });
        if (navigator.sendBeacon('/api/track', blob)) return;
      } catch (e) { /* fall through to fetch */ }
    }
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(function () {});
  }
  window.mealzyTrackReliable = mealzyTrackReliable;

  var consent = null;
  try {
    consent = localStorage.getItem(CONSENT_KEY);
  } catch (e) {
    /* localStorage unavailable (private mode / blocked) — treat as no decision, skip banner+analytics */
  }

  if (consent === 'accepted') {
    loadAnalytics();
  } else if (consent === null) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner);
    } else {
      showBanner();
    }
  }
})();
