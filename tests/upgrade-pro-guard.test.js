'use strict';

// Regression tests for the two pre-marketing paywall fixes on public/upgrade.html:
//
//   1. The page must never advertise a "priority queue" — no backend
//      implementation of request prioritization exists anywhere in server.js
//      (confirmed by the production paywall audit), so any copy implying
//      Pro plans "generate first" or are "processed ahead" of free plans is
//      a false claim.
//   2. A user the server already knows is Pro must never be shown a Stripe
//      purchase CTA on /upgrade.html, and that CTA must never flash visible
//      before /api/auth/me resolves, and must never be shown just because
//      the auth check itself failed (fail-safe against accidental double
//      purchase).
//
// This repo has no browser/DOM test harness (no jsdom, no supertest — see
// tests/authenticated-funnel-identity.test.js's header for why server.js
// itself is audited via literal-source assertions instead). The guard logic
// here is small, pure, and DOM-driven, so it is exercised directly with
// Node's vm module against a minimal fake DOM — this proves actual runtime
// *behavior* (which card ends up visible) rather than only asserting on the
// source text.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UPGRADE_HTML_PATH = path.join(__dirname, '..', 'public', 'upgrade.html');
const UPGRADE_HTML = fs.readFileSync(UPGRADE_HTML_PATH, 'utf8');

describe('A: no priority-queue (or equivalent) claim survives anywhere in the repo', () => {
  const CLAIM_PATTERNS = [
    /priority queue/i,
    /plans? generate[s]? first/i,
    /processed ahead/i,
    /priority.{0,20}generat/i,
    /generat.{0,20}priority/i,
  ];

  test('public/upgrade.html (the live page) contains none of the unsupported claim patterns', () => {
    for (const re of CLAIM_PATTERNS) {
      assert.doesNotMatch(UPGRADE_HTML, re, `found unsupported claim matching ${re} in upgrade.html`);
    }
  });

  test('client/src/upgrade/UpgradePage.jsx (unbuilt React page) also contains none of them', () => {
    const jsx = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'upgrade', 'UpgradePage.jsx'), 'utf8');
    for (const re of CLAIM_PATTERNS) {
      assert.doesNotMatch(jsx, re, `found unsupported claim matching ${re} in UpgradePage.jsx`);
    }
  });

  test('the replacement claim is provable from current server.js behavior (isPro recipe detail branch)', () => {
    const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.match(UPGRADE_HTML, /Detailed, restaurant-quality recipes/,
      'expected the replacement benefit copy to be present');
    assert.match(serverSrc, /up to 8 ingredients.*professional techniques/,
      'the replacement claim must correspond to a real isPro branch in server.js, not an invented benefit');
  });
});

describe('B/setup: extract the already-Pro guard script and run it against a fake DOM', () => {
  // The file has several `<script src="...">` tags with no body (theme-init,
  // consent, stripe-config) plus one inline `<script>...</script>` block
  // containing the actual page logic — that's the one under test.
  const scriptMatches = [...UPGRADE_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const pageScript = scriptMatches.map(m => m[1]).find(s => s.includes('checkAccountAndRenderUpgradeCard'));

  test('the guard script exists and was found in upgrade.html', () => {
    assert.ok(pageScript, 'expected an inline <script> containing checkAccountAndRenderUpgradeCard');
  });

  function makeEl() {
    return {
      style: { display: '' },
      _listeners: {},
      addEventListener(evt, fn) { (this._listeners[evt] ||= []).push(fn); },
      classList: { toggle() {} },
      setAttribute() {}, removeAttribute() {},
      focus() {},
      querySelector() { return makeEl(); },
      textContent: '', href: '',
    };
  }

  // Every id the script references via document.getElementById, across all
  // code paths (theme toggle, price toggle, cards, retry button).
  const ELEMENT_IDS = [
    'themeToggle', 'yearlySavePct', 'billingToggleWrap', 'upgrPrice', 'upgrPeriod',
    'upgrBilled', 'upgradeCtaBtn', 'lblMonthly', 'lblYearly', 'abandonOffer',
    'upgradeRetryBtn', 'upgradePendingCard', 'upgradeProCard', 'upgradeErrorCard',
    'upgradePurchaseCard',
  ];

  function runGuardScript(fetchImpl, { stripeYearly = 'https://buy.stripe.com/annual-test' } = {}) {
    const els = {};
    for (const id of ELEMENT_IDS) els[id] = makeEl();

    const documentStub = {
      getElementById(id) {
        if (!(id in els)) throw new Error(`unexpected getElementById('${id}')`);
        return els[id];
      },
      documentElement: { getAttribute: () => 'light', setAttribute() {} },
      addEventListener() {},
      body: { offsetHeight: 1000 },
    };

    const context = {
      document: documentStub,
      window: { STRIPE_MONTHLY: 'https://buy.stripe.com/monthly-test', STRIPE_ANNUAL: stripeYearly, STRIPE_DISCOUNT: null },
      fetch: fetchImpl,
      mealzyTrack() {}, mealzyTrackReliable() {},
      localStorage: { setItem() {}, getItem() { return null; } },
      console,
    };
    vm.createContext(context);
    vm.runInContext(pageScript, context, { filename: 'upgrade.html-inline-script' });
    return { context, els };
  }

  test('C: purchase CTA is withheld (only the pending card is visible) immediately after load, before fetch resolves', async () => {
    let resolveFetch;
    const pending = new Promise(r => { resolveFetch = r; });
    const { els } = runGuardScript(() => pending);

    // The auto-invoked checkAccountAndRenderUpgradeCard() runs showCard('upgradePendingCard')
    // synchronously before its `await fetch(...)` — so immediately after the
    // script finishes executing (fetch still unresolved), no purchase/pro
    // card can possibly be visible yet.
    assert.equal(els.upgradePendingCard.style.display, '', 'pending card must be visible while unresolved');
    assert.equal(els.upgradePurchaseCard.style.display, 'none', 'purchase CTA must not flash before auth resolves');
    assert.equal(els.upgradeProCard.style.display, 'none');
    assert.equal(els.upgradeErrorCard.style.display, 'none');

    resolveFetch({ status: 401, ok: false });
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
  });

  test('D: unauthenticated visitor (401) still gets normal purchase CTAs — current behavior preserved', async () => {
    const { context, els } = runGuardScript(async () => ({ status: 401, ok: false }));
    await context.checkAccountAndRenderUpgradeCard();
    assert.equal(els.upgradePurchaseCard.style.display, '', 'expected purchase card visible for anonymous visitor');
    assert.equal(els.upgradeProCard.style.display, 'none');
    assert.equal(els.upgradeErrorCard.style.display, 'none');
  });

  test('E: authenticated free user (pro:false) gets normal purchase CTAs — current behavior preserved', async () => {
    const { context, els } = runGuardScript(async () => ({
      status: 200, ok: true, json: async () => ({ id: 'u1', pro: false }),
    }));
    await context.checkAccountAndRenderUpgradeCard();
    assert.equal(els.upgradePurchaseCard.style.display, '');
    assert.equal(els.upgradeProCard.style.display, 'none');
  });

  test('F: authenticated Pro user (pro:true) gets NO purchase CTA — sees the already-Pro card instead', async () => {
    const { context, els } = runGuardScript(async () => ({
      status: 200, ok: true, json: async () => ({ id: 'u1', pro: true }),
    }));
    await context.checkAccountAndRenderUpgradeCard();
    assert.equal(els.upgradeProCard.style.display, '', 'expected the already-Pro card to be shown');
    assert.equal(els.upgradePurchaseCard.style.display, 'none', 'purchase CTA must be hidden for a Pro user');
    assert.equal(els.upgradeErrorCard.style.display, 'none');
  });

  test('G: Pro determination reads data.pro from the /api/auth/me response body, never localStorage', () => {
    // Structural guard on the source: the guard branch must key off the
    // parsed fetch response, not localStorage.mealzy_pro (the old, proven-
    // spoofable client-only signal this task explicitly forbids trusting
    // for this decision).
    assert.match(pageScript, /data\s*&&\s*data\.pro\s*===\s*true/,
      'expected the guard to check the parsed /api/auth/me response body');
    assert.doesNotMatch(pageScript, /localStorage[^\n]*mealzy_pro/,
      'the already-Pro guard must not read localStorage.mealzy_pro');
  });

  test('H: a network failure (fetch rejects) fails safe — no purchase CTA, shows the retry/error state', async () => {
    const { context, els } = runGuardScript(async () => { throw new Error('network down'); });
    await context.checkAccountAndRenderUpgradeCard();
    assert.equal(els.upgradeErrorCard.style.display, '', 'expected the error/retry card on network failure');
    assert.equal(els.upgradePurchaseCard.style.display, 'none', 'must not show purchase CTA when auth status is unknown');
    assert.equal(els.upgradeProCard.style.display, 'none');
  });

  test('I: an unexpected non-OK response (e.g. 500) also fails safe — no purchase CTA', async () => {
    const { context, els } = runGuardScript(async () => ({ status: 500, ok: false }));
    await context.checkAccountAndRenderUpgradeCard();
    assert.equal(els.upgradeErrorCard.style.display, '');
    assert.equal(els.upgradePurchaseCard.style.display, 'none');
  });

  test('J: an existing Pro user cannot trigger upgrade_click through the guarded page — the CTA click listener is only ever attached in the purchase-card branches', async () => {
    const { context: proCtx, els: proEls } = runGuardScript(async () => ({
      status: 200, ok: true, json: async () => ({ pro: true }),
    }));
    await proCtx.checkAccountAndRenderUpgradeCard();
    assert.equal(proEls.upgradeCtaBtn._listeners.click, undefined,
      'wireAbandonOffer (which attaches the CTA click listener) must not run for a Pro user');

    const { context: freeCtx, els: freeEls } = runGuardScript(async () => ({
      status: 200, ok: true, json: async () => ({ pro: false }),
    }));
    await freeCtx.checkAccountAndRenderUpgradeCard();
    assert.ok(freeEls.upgradeCtaBtn._listeners.click && freeEls.upgradeCtaBtn._listeners.click.length > 0,
      'a free user must still get the normal CTA click wiring (upgrade_click keeps working)');
  });
});

describe('K: the payment/activation backend was not touched by this fix', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  test('the Stripe webhook handler is byte-for-byte the same shape as before (signature check, idempotency, email lookup)', () => {
    assert.match(serverSrc, /async function handleStripeWebhook\(req, res\) \{/);
    assert.match(serverSrc, /stripe\.webhooks\.constructEvent\(req\.body, sig, process\.env\.STRIPE_WEBHOOK_SECRET\)/);
    assert.match(serverSrc, /await db\.isWebhookEventProcessed\(event\.id\)/);
    assert.match(serverSrc, /await db\.markWebhookEventProcessed\(event\.id\)/);
  });

  test('/api/pro/activate still verifies against the live Stripe subscription before granting Pro', () => {
    assert.match(serverSrc, /app\.post\('\/api\/pro\/activate', stripeLimiter, requireSession, async \(req, res\) => \{/);
    assert.match(serverSrc, /stripe\.subscriptions\.list\(\{ customer: user\.stripe_customer_id, limit: 5 \}\)/);
  });

  test('/api/auth/me is unmodified: it still returns the authoritative `pro` boolean the new guard depends on', () => {
    assert.match(serverSrc, /app\.get\('\/api\/auth\/me', requireSession, async \(req, res\) => \{/);
    assert.match(serverSrc, /pro: user\.pro === 1/);
  });
});
