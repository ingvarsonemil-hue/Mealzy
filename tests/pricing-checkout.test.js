'use strict';

// Regression tests for the pricing-page -> Stripe checkout wiring
// (client/src/pricing/PricingPage.jsx, PlanCta.jsx, usePricingCheckout.js).
//
// Same constraint as tests/upgrade-pro-guard.test.js: this repo has no
// JSX/React test harness (no jsdom, no supertest, no bundler in the test
// runner). getCheckoutInfo() and trackCheckoutClick() are plain functions
// with no JSX, so they're extracted from source and run for real against
// Node's vm module (proving actual behavior). The account-state guard and
// the toggle -> CTA wiring live inside JSX return statements that vm can't
// parse, so those are proven via literal-source assertions instead — same
// approach tests/upgrade-pro-guard.test.js and
// tests/authenticated-funnel-identity.test.js already use for this repo.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PRICING_DIR = path.join(__dirname, '..', 'client', 'src', 'pricing');
const HOOK_SRC = fs.readFileSync(path.join(PRICING_DIR, 'usePricingCheckout.js'), 'utf8');
const PLAN_CTA_SRC = fs.readFileSync(path.join(PRICING_DIR, 'PlanCta.jsx'), 'utf8');
const PRICING_PAGE_SRC = fs.readFileSync(path.join(PRICING_DIR, 'PricingPage.jsx'), 'utf8');

function extractFn(src, name) {
  const startIdx = src.indexOf(`function ${name}(`);
  assert.notEqual(startIdx, -1, `expected to find function ${name} in source`);
  const endIdx = src.indexOf('\n}\n', startIdx);
  assert.notEqual(endIdx, -1, `expected to find the closing brace for ${name}`);
  return src.slice(startIdx, endIdx + 2);
}

function runGetCheckoutInfo(stripeUrls) {
  const fnSrc = extractFn(HOOK_SRC, 'getCheckoutInfo');
  const context = { stripeUrls, result: undefined };
  vm.createContext(context);
  vm.runInContext(`${fnSrc}\nresult = getCheckoutInfo;`, context, { filename: 'usePricingCheckout.js-getCheckoutInfo' });
  return context.result;
}

function runTrackCheckoutClick() {
  const fnSrc = extractFn(HOOK_SRC, 'trackCheckoutClick');
  const calls = { track: [], trackReliable: [] };
  const context = {
    track: (...args) => calls.track.push(args),
    trackReliable: (...args) => calls.trackReliable.push(args),
    result: undefined
  };
  vm.createContext(context);
  vm.runInContext(`${fnSrc}\nresult = trackCheckoutClick;`, context, { filename: 'usePricingCheckout.js-trackCheckoutClick' });
  return { trackCheckoutClick: context.result, calls };
}

// A realistic stripeUrls fixture — same shape as client/src/lib/stripe.js's
// exported `stripeUrls` (all fields, ready flags included).
const READY_STRIPE_URLS = {
  monthly: 'https://buy.stripe.com/pro-monthly-test',
  annual: 'https://buy.stripe.com/pro-annual-test',
  familyMonthly: 'https://buy.stripe.com/family-monthly-test',
  familyAnnual: 'https://buy.stripe.com/family-annual-test'
};

describe('A/B/C/D: getCheckoutInfo maps plan+billing to the correct canonical Stripe link', () => {
  test('A: Pro monthly maps to stripeUrls.monthly', () => {
    const info = runGetCheckoutInfo(READY_STRIPE_URLS)('pro', 'monthly', { annualReady: true, familyMonthlyReady: true, familyAnnualReady: true });
    assert.equal(info.href, READY_STRIPE_URLS.monthly);
    assert.equal(info.ready, true);
  });

  test('B: Pro annual maps to stripeUrls.annual (never falls back to the monthly link)', () => {
    const info = runGetCheckoutInfo(READY_STRIPE_URLS)('pro', 'annual', { annualReady: true, familyMonthlyReady: true, familyAnnualReady: true });
    assert.equal(info.href, READY_STRIPE_URLS.annual);
    assert.notEqual(info.href, READY_STRIPE_URLS.monthly);
    assert.equal(info.ready, true);
  });

  test('C: Family monthly maps to stripeUrls.familyMonthly', () => {
    const info = runGetCheckoutInfo(READY_STRIPE_URLS)('family', 'monthly', { annualReady: true, familyMonthlyReady: true, familyAnnualReady: true });
    assert.equal(info.href, READY_STRIPE_URLS.familyMonthly);
    assert.equal(info.ready, true);
  });

  test('D: Family annual maps to stripeUrls.familyAnnual', () => {
    const info = runGetCheckoutInfo(READY_STRIPE_URLS)('family', 'annual', { annualReady: true, familyMonthlyReady: true, familyAnnualReady: true });
    assert.equal(info.href, READY_STRIPE_URLS.familyAnnual);
    assert.equal(info.ready, true);
  });

  test('Pro and Family links can never cross: all four combinations resolve to distinct URLs', () => {
    const getInfo = runGetCheckoutInfo(READY_STRIPE_URLS);
    const ready = { annualReady: true, familyMonthlyReady: true, familyAnnualReady: true };
    const hrefs = [
      getInfo('pro', 'monthly', ready).href,
      getInfo('pro', 'annual', ready).href,
      getInfo('family', 'monthly', ready).href,
      getInfo('family', 'annual', ready).href
    ];
    assert.equal(new Set(hrefs).size, 4, `expected 4 distinct URLs, got ${JSON.stringify(hrefs)}`);
  });
});

describe('H/I: config-not-ready and config-failure never produce an actionable-but-wrong link', () => {
  test('H: Pro annual not ready (STRIPE_ANNUAL_URL unset) -> no href, not the monthly link', () => {
    const info = runGetCheckoutInfo(READY_STRIPE_URLS)('pro', 'annual', { annualReady: false, familyMonthlyReady: true, familyAnnualReady: true });
    assert.equal(info.ready, false);
    assert.equal(info.href, null);
  });

  test('I: Family monthly not configured -> no href (never silently falls back to Pro monthly)', () => {
    const info = runGetCheckoutInfo(READY_STRIPE_URLS)('family', 'monthly', { annualReady: true, familyMonthlyReady: false, familyAnnualReady: true });
    assert.equal(info.ready, false);
    assert.equal(info.href, null);
  });

  test('I (also): Family annual not configured -> no href', () => {
    const info = runGetCheckoutInfo(READY_STRIPE_URLS)('family', 'annual', { annualReady: true, familyMonthlyReady: true, familyAnnualReady: false });
    assert.equal(info.ready, false);
    assert.equal(info.href, null);
  });

  test('Pro monthly always has a real, valid fallback (matches stripeUrls.monthly), so it is always ready', () => {
    const info = runGetCheckoutInfo(READY_STRIPE_URLS)('pro', 'monthly', { annualReady: false, familyMonthlyReady: false, familyAnnualReady: false });
    assert.equal(info.ready, true);
    assert.equal(info.href, READY_STRIPE_URLS.monthly);
  });
});

describe('M/N: trackCheckoutClick fires the right events with a non-sensitive payload', () => {
  test('M: exactly one upgrade_click and one checkout_started call per invocation', () => {
    const { trackCheckoutClick, calls } = runTrackCheckoutClick();
    trackCheckoutClick('pro', 'annual');
    assert.equal(calls.track.length, 1);
    assert.equal(calls.trackReliable.length, 1);
  });

  test('N: checkout_started payload contains only tier/billing — no Stripe URL, email, or payment identifiers', () => {
    const { trackCheckoutClick, calls } = runTrackCheckoutClick();
    trackCheckoutClick('family', 'monthly');
    const [event, payload] = calls.trackReliable[0];
    assert.equal(event, 'checkout_started');
    assert.deepEqual(Object.keys(payload).sort(), ['billing', 'tier']);
    assert.equal(payload.tier, 'family');
    assert.equal(payload.billing, 'monthly');
  });

  test('N (also): upgrade_click reuses the existing {source, billing} shape — no invented duplicate event', () => {
    const { trackCheckoutClick, calls } = runTrackCheckoutClick();
    trackCheckoutClick('pro', 'monthly');
    const [event, payload] = calls.track[0];
    assert.equal(event, 'upgrade_click');
    assert.deepEqual(Object.keys(payload).sort(), ['billing', 'source']);
    assert.equal(payload.source, 'pricing_page');
  });
});

describe('J/K/L: PlanCta.jsx — account-state guard (structural, JSX can\'t run under vm)', () => {
  test('J: an accountState of "pro" returns before any Stripe checkout link is computed — no purchase CTA', () => {
    const proIdx = PLAN_CTA_SRC.indexOf("accountState === 'pro'");
    const checkoutIdx = PLAN_CTA_SRC.indexOf('getCheckoutInfo(');
    assert.notEqual(proIdx, -1, 'expected an accountState === \'pro\' branch');
    assert.notEqual(checkoutIdx, -1, 'expected a getCheckoutInfo call');
    assert.ok(proIdx < checkoutIdx, 'the pro branch must return before getCheckoutInfo is ever reached');
    // And that branch's only link must not be a Stripe checkout link.
    const proBranch = PLAN_CTA_SRC.slice(proIdx, checkoutIdx);
    assert.doesNotMatch(proBranch, /buy\.stripe\.com/, 'the already-Pro branch must not render a Stripe purchase link');
  });

  test('K: "purchasable" (anonymous or authenticated-free) is the only path that reaches getCheckoutInfo — the real Stripe link', () => {
    assert.match(PLAN_CTA_SRC, /const \{ href, ready \} = getCheckoutInfo\(plan\.id, billing, stripeReady\)/);
  });

  test('L: entitlement is never read from localStorage — accountState comes only from the server', () => {
    assert.doesNotMatch(PLAN_CTA_SRC, /localStorage/);
    assert.doesNotMatch(HOOK_SRC, /localStorage/i);
    assert.match(HOOK_SRC, /fetch\('\/api\/auth\/me'/, 'expected the guard to read the authoritative server endpoint');
    assert.match(HOOK_SRC, /data\.pro === true/, 'expected the guard to key off the parsed response body');
  });

  test('accountState defaults to "pending" — no purchase CTA can flash before the account check resolves', () => {
    assert.match(HOOK_SRC, /useState\('pending'\)/);
  });
});

describe('E/F/G: the billing toggle drives both the displayed price and the checkout link', () => {
  test('E/F: the pricing-card grid passes the live `billing` state (not a literal) into both PriceDisplay and PlanCta', () => {
    assert.match(PRICING_PAGE_SRC, /<PriceDisplay plan=\{plan\} billing=\{billing\} \/>/);
    assert.match(PRICING_PAGE_SRC, /<PricingCard key=\{plan\.id\} plan=\{plan\} billing=\{billing\}/);
  });

  test('G: PricingCard forwards that same `billing` prop straight into PlanCta — no second, independently-hardcoded value', () => {
    assert.match(PRICING_PAGE_SRC, /function PricingCard\(\{ plan, billing, accountState, stripeReady \}\)/);
    assert.match(PRICING_PAGE_SRC, /<PlanCta plan=\{plan\} billing=\{billing\} accountState=\{accountState\} stripeReady=\{stripeReady\} \/>/);
  });

  test('the module-level plan data no longer carries a hardcoded ctaHref (the historical stale-annual-href bug)', () => {
    assert.doesNotMatch(PRICING_PAGE_SRC, /ctaHref:/);
  });
});

describe('O: no pricing CTA depends on the unfinished /login scaffold anymore', () => {
  const FILES = { 'PricingPage.jsx': PRICING_PAGE_SRC, 'PlanCta.jsx': PLAN_CTA_SRC, 'usePricingCheckout.js': HOOK_SRC };
  for (const [name, src] of Object.entries(FILES)) {
    test(`${name} contains no /login?plan= routing and no getLoginUrl helper`, () => {
      assert.doesNotMatch(src, /\/login\?plan=/);
      assert.doesNotMatch(src, /getLoginUrl/);
    });
  }

  test('PricingPage.jsx does not hardcode a buy.stripe.com URL — everything routes through stripeUrls', () => {
    assert.doesNotMatch(PRICING_PAGE_SRC, /buy\.stripe\.com/);
    assert.match(HOOK_SRC, /from '@\/lib\/stripe'/, 'expected the canonical stripeUrls import');
  });
});

describe('Config source: usePricingCheckout.js reads the same canonical stripeUrls shape as the rest of the app', () => {
  test('imports stripeUrls from the existing client/src/lib/stripe.js (not a new/parallel source)', () => {
    assert.match(HOOK_SRC, /import \{ stripeUrls \} from '@\/lib\/stripe'/);
  });

  test('never invents a family/annual fallback URL — readiness flags gate every non-Pro-monthly link', () => {
    const fn = extractFn(HOOK_SRC, 'getCheckoutInfo');
    assert.match(fn, /stripeReady\.annualReady/);
    assert.match(fn, /stripeReady\.familyMonthlyReady/);
    assert.match(fn, /stripeReady\.familyAnnualReady/);
  });
});
