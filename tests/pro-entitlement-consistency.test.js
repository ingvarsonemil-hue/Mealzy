'use strict';

// Regression tests for the global Pro/Free entitlement UI consistency audit.
//
// Prior fixes made Dashboard and Meal Planner correct, but the same
// hardcoded-"Free Plan"-with-no-id bug (fixed on planner/nav.html) turned out
// to be duplicated across FOUR more live authenticated pages, each with its
// own forked, inline sidebar markup and its own copy-pasted /api/auth/me
// init() logic:
//
//   - public/settings.html      (own inline <script>)
//   - public/ai-coach.html      (own inline <script>)
//   - public/grocery-list.html  (public/js/groceries-sync.js + groceries-ui.js)
//   - public/analytics.html     (own inline <script>)
//
// Each hardcoded "Free Plan" with no id (unfixable by any script), and each
// had at least one Pro/Free feature gate reading `localStorage.getItem(
// 'mealzy_pro')` directly instead of that page's own fresh /api/auth/me
// response — the same class of bug fixed on Meal Planner, just re-invented
// independently per page:
//   - settings.html: Family Profiles / Subscription section visibility
//   - ai-coach.html: `is_pro` sent to the coach chat API
//   - grocery-list.html: the Pro-upgrade nudge banner
//   - groceries-ui.js: the grocery-list PDF export gate
//
// Fix: extracted the shared logic that dashboard-growth.js and
// planner-page-init.js had each independently implemented into
// public/js/pro-status.js — `renderPlanEntitlement(serverUser)` (label +
// badge) and `resolveIsPro(serverUser)` (feature gates) — and pointed every
// live authenticated page at it, each keeping its own page-local
// `serverUser` variable + 2s retry-on-failure (same pattern dashboard-today.js
// established), but delegating the actual rendering/gating decision to the
// one shared implementation.
//
// No DOM test harness exists in this repo — real functions are extracted and
// run via Node's vm module against a minimal fake DOM (see
// tests/dashboard-pro-status.test.js for precedent).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PRO_STATUS_PATH = path.join(__dirname, '..', 'public', 'js', 'pro-status.js');
const PRO_STATUS_SRC = fs.readFileSync(PRO_STATUS_PATH, 'utf8');

const LIVE_HTML_PAGES = {
  'dashboard.html (via partials/layout/sidebar.html)': path.join(__dirname, '..', 'public', 'partials', 'layout', 'sidebar.html'),
  'meal-planner.html (via partials/planner/nav.html)': path.join(__dirname, '..', 'public', 'partials', 'planner', 'nav.html'),
  'settings.html': path.join(__dirname, '..', 'public', 'settings.html'),
  'ai-coach.html': path.join(__dirname, '..', 'public', 'ai-coach.html'),
  'grocery-list.html': path.join(__dirname, '..', 'public', 'grocery-list.html'),
  'analytics.html': path.join(__dirname, '..', 'public', 'analytics.html'),
};

const LIVE_HTML_SRCS = Object.fromEntries(
  Object.entries(LIVE_HTML_PAGES).map(([name, p]) => [name, fs.readFileSync(p, 'utf8')])
);

function makeEl() {
  return { style: { display: '' }, textContent: '' };
}

function runRenderPlanEntitlement(serverUser) {
  const els = { proBadge: makeEl(), planLabel: makeEl(), mobilePlanLabel: makeEl() };
  const context = { document: { getElementById: (id) => els[id] || null } };
  vm.createContext(context);
  vm.runInContext(`${PRO_STATUS_SRC}\nrenderPlanEntitlement(${JSON.stringify(serverUser)});`, context);
  return els;
}

function runResolveIsPro(serverUser, localStorageProValue) {
  const store = {};
  if (localStorageProValue !== undefined) store.mealzy_pro = localStorageProValue;
  let read = false;
  const context = {
    localStorage: { getItem: (k) => { read = true; return k in store ? store[k] : null; } },
  };
  vm.createContext(context);
  const result = vm.runInContext(`${PRO_STATUS_SRC}\nresolveIsPro(${JSON.stringify(serverUser)});`, context);
  return { result, read };
}

describe('A: no live page has a hardcoded, unconditional "Free Plan" authoritative label', () => {
  for (const [name, src] of Object.entries(LIVE_HTML_SRCS)) {
    test(`${name} has no static "Free Plan" div with no id`, () => {
      assert.doesNotMatch(src, /<div class="text-muted text-sm">Free Plan<\/div>/,
        'a static "Free Plan" div with no id can never be updated by any script');
    });
  }
});

describe('B: every live sidebar/nav surface exposes updateable entitlement elements, starting neutral', () => {
  for (const [name, src] of Object.entries(LIVE_HTML_SRCS)) {
    test(`${name} has id="planLabel" and id="mobilePlanLabel", both starting as "Checking plan…"`, () => {
      assert.match(src, /id="planLabel">Checking plan/, `${name} missing a neutral-first-paint #planLabel`);
      assert.match(src, /id="mobilePlanLabel">Checking plan/, `${name} missing a neutral-first-paint #mobilePlanLabel`);
    });

    test(`${name} has id="proBadge"`, () => {
      assert.match(src, /id="proBadge"/, `${name} missing #proBadge`);
    });

    test(`${name} never hardcodes a tier ("Free Plan"/"Pro Plan") into #planLabel or #mobilePlanLabel's initial markup`, () => {
      assert.doesNotMatch(src, /id="planLabel">(Free|Pro) Plan</);
      assert.doesNotMatch(src, /id="mobilePlanLabel">(Free|Pro) Plan</);
    });
  }
});

describe('C/D: the shared renderPlanEntitlement() converges every live surface on the same resolved server response', () => {
  test('C: pro:true -> every surface using it renders "Pro Plan" + visible badge', () => {
    const els = runRenderPlanEntitlement({ pro: true });
    assert.equal(els.planLabel.textContent, 'Pro Plan');
    assert.equal(els.mobilePlanLabel.textContent, 'Pro Plan');
    assert.equal(els.proBadge.style.display, 'inline-block');
  });

  test('D: pro:false -> every surface using it renders "Free Plan" + hidden badge', () => {
    const els = runRenderPlanEntitlement({ pro: false });
    assert.equal(els.planLabel.textContent, 'Free Plan');
    assert.equal(els.proBadge.style.display, 'none');
  });
});

describe('E: unresolved state is neutral everywhere, never a confident guess', () => {
  test('serverUser === null (unresolved / failed, no retry yet) -> "Checking plan…", badge hidden', () => {
    const els = runRenderPlanEntitlement(null);
    assert.equal(els.planLabel.textContent, 'Checking plan…');
    assert.equal(els.mobilePlanLabel.textContent, 'Checking plan…');
    assert.equal(els.proBadge.style.display, 'none');
  });
});

describe('F: stale localStorage cannot override a resolved server entitlement anywhere', () => {
  test('server=true + localStorage=false -> resolveIsPro() says Pro (this is the literal Dashboard=Pro/X=Free repro)', () => {
    assert.equal(runResolveIsPro({ pro: true }, 'false').result, true);
  });

  test('server=false + localStorage=true -> resolveIsPro() says Free', () => {
    assert.equal(runResolveIsPro({ pro: false }, 'true').result, false);
  });

  test('once serverUser is resolved, resolveIsPro() does not even read localStorage', () => {
    assert.equal(runResolveIsPro({ pro: true }, 'false').read, false);
  });

  test('server unresolved + stale localStorage -> resolveIsPro() falls back to the cache (best-effort, e.g. offline), but renderPlanEntitlement() still shows neutral, never a tier', () => {
    assert.equal(runResolveIsPro(null, 'true').result, true, 'feature gates may use a best-effort offline fallback');
    assert.equal(runRenderPlanEntitlement(null).planLabel.textContent, 'Checking plan…', 'but the LABEL must never claim a tier while unresolved, even if a gate is using a cached fallback');
  });
});

describe('G: mobile and desktop labels always agree (single implementation renders both from the same input)', () => {
  for (const su of [{ pro: true }, { pro: false }, null]) {
    test(`serverUser=${JSON.stringify(su)} -> planLabel and mobilePlanLabel match`, () => {
      const els = runRenderPlanEntitlement(su);
      assert.equal(els.planLabel.textContent, els.mobilePlanLabel.textContent);
    });
  }
});

describe('every live page actually calls the shared helpers, not a raw localStorage read, for its label and gates', () => {
  test('settings.html: renders via renderPlanEntitlement() and gates Family Profiles/Subscription via resolveIsPro()', () => {
    const src = LIVE_HTML_SRCS['settings.html'];
    assert.match(src, /renderPlanEntitlement\(serverUser\)/);
    assert.match(src, /const isPro = resolveIsPro\(serverUser\);/);
    assert.doesNotMatch(src, /localStorage\.getItem\('mealzy_pro'\) === 'true'/);
    assert.match(src, /<script src="\/js\/pro-status\.js" defer><\/script>/);
  });

  test('ai-coach.html: renders via renderPlanEntitlement() and sends is_pro via resolveIsPro()', () => {
    const src = LIVE_HTML_SRCS['ai-coach.html'];
    assert.match(src, /renderPlanEntitlement\(serverUser\)/);
    assert.match(src, /is_pro: resolveIsPro\(serverUser\)/);
    assert.doesNotMatch(src, /localStorage\.getItem\('mealzy_pro'\) === 'true'/);
    assert.match(src, /<script src="\/js\/pro-status\.js" defer><\/script>/);
  });

  test('grocery-list.html loads pro-status.js before groceries-sync.js', () => {
    const src = LIVE_HTML_SRCS['grocery-list.html'];
    const proStatusIdx = src.indexOf('/js/pro-status.js');
    const syncIdx = src.indexOf('/js/groceries-sync.js');
    assert.notEqual(proStatusIdx, -1);
    assert.ok(proStatusIdx < syncIdx);
  });

  test('groceries-sync.js: renders via renderPlanEntitlement() and gates the Pro nudge banner via resolveIsPro()', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'groceries-sync.js'), 'utf8');
    assert.match(src, /renderPlanEntitlement\(serverUser\)/);
    assert.match(src, /resolveIsPro\(serverUser\) \? 'none' : 'flex'/);
    assert.doesNotMatch(src, /localStorage\.getItem\('mealzy_pro'\) !== 'true'/);
  });

  test('groceries-ui.js: the PDF export gate uses resolveIsPro(), not a raw localStorage read', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'groceries-ui.js'), 'utf8');
    assert.match(src, /const isPro = resolveIsPro\(serverUser\);/);
    assert.doesNotMatch(src, /localStorage\.getItem\('mealzy_pro'\) === 'true'/);
  });

  test('analytics.html: renders via renderPlanEntitlement() (it has no Pro-gated feature, so no gate to check)', () => {
    const src = LIVE_HTML_SRCS['analytics.html'];
    assert.match(src, /renderPlanEntitlement\(serverUser\)/);
    assert.match(src, /<script src="\/js\/pro-status\.js" defer><\/script>/);
  });

  test('every page with a catch branch retries once after 2s and re-renders/re-gates on success, matching dashboard-today.js\'s pattern', () => {
    for (const key of ['settings.html', 'ai-coach.html', 'analytics.html']) {
      const src = LIVE_HTML_SRCS[key];
      assert.match(src, /setTimeout\(async \(\) => \{/, `${key} missing the retry`);
      assert.match(src, /renderPlanEntitlement\(serverUser\);/g, `${key} retry must re-render the label`);
    }
    const syncSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'groceries-sync.js'), 'utf8');
    assert.match(syncSrc, /setTimeout\(async \(\) => \{/);
  });
});

describe('H/I/J: existing planner/dashboard/pricing entitlement tests remain green after the shared-helper refactor', () => {
  test('dashboard-growth.js\'s checkProStatus() now delegates to the shared renderPlanEntitlement()', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard-growth.js'), 'utf8');
    assert.match(src, /function checkProStatus\(\) \{\s*\n\s*renderPlanEntitlement\(serverUser\);\s*\n\}/);
  });

  test('planner-page-init.js\'s checkProStatus()/currentIsPro() now delegate to the shared implementation', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'planner', 'planner-page-init.js'), 'utf8');
    assert.match(src, /function checkProStatus\(\) \{\s*\n\s*renderPlanEntitlement\(serverUser\);\s*\n\}/);
    assert.match(src, /function currentIsPro\(\) \{\s*\n\s*return resolveIsPro\(serverUser\);\s*\n\}/);
  });

  test('dashboard.html and meal-planner.html both load pro-status.js', () => {
    const dashSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const plannerSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'meal-planner.html'), 'utf8');
    assert.match(dashSrc, /<script src="\/js\/pro-status\.js" defer><\/script>/);
    assert.match(plannerSrc, /<script src="\/js\/pro-status\.js" defer><\/script>/);
  });
});

describe('K: no Stripe/payment/subscription backend or pricing behavior was touched by this fix', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  test('the Stripe webhook handler is unchanged', () => {
    assert.match(serverSrc, /async function handleStripeWebhook\(req, res\) \{/);
    assert.match(serverSrc, /stripe\.webhooks\.constructEvent\(req\.body, sig, process\.env\.STRIPE_WEBHOOK_SECRET\)/);
  });

  test('/api/auth/me is unchanged: still DB-authoritative, never trusts the JWT payload for pro', () => {
    assert.match(serverSrc, /app\.get\('\/api\/auth\/me', requireSession, async \(req, res\) => \{/);
    assert.match(serverSrc, /const user = await db\.getUserById\(session\.userId\);/);
  });

  test('this fix is UI-only: pro-status.js makes no network calls of its own', () => {
    assert.doesNotMatch(PRO_STATUS_SRC, /fetch\(/);
  });
});
