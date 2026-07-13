/* Mealzy cookie/analytics consent gate — must load before any GA4 tags. */
(function () {
  'use strict';

  var CONSENT_KEY = 'mealzy_consent';
  var AMPLITUDE_KEY = '7d13e8b48558147de585423d7956f05d';
  var GA4_ID = 'G-27FWEVV6VD';

  function loadAmplitude() {
    var s = document.createElement('script');
    s.src = 'https://cdn.amplitude.com/script/' + AMPLITUDE_KEY + '.js';
    s.onload = function () {
      window.amplitude.init(AMPLITUDE_KEY, { fetchRemoteConfig: true, autocapture: true, sessionReplay: { sampleRate: 1 } });
    };
    document.head.appendChild(s);
  }

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
    loadAmplitude();
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
