'use strict';

// Regression tests for the dashboard/pricing/upgrade Pro-entitlement
// consistency chain.
//
// History (two fixes, same root cause area):
//
// 1. pricing.html (via usePricingCheckout.js) showed "Manage subscription"
//    (Pro) for the same authenticated user that
//    public/js/dashboard-growth.js's checkProStatus() labelled "Free Plan"
//    on the sidebar. Root cause: dashboard-today.js's init() catch branch
//    (the initial /api/auth/me call throwing — a transient network blip)
//    falls back to a cached profile and continues straight through to
//    checkProStatus() with `serverUser` still null, before the 2s retry can
//    resolve it. checkProStatus() used to read `!!serverUser?.pro`, which is
//    `false` when serverUser is null — so a real Pro user hitting a
//    transient fetch failure got a confidently-wrong "Free Plan" label.
//
// 2. First fix made the unresolved case fall back to a cached
//    localStorage.mealzy_pro value instead of hardcoding false. That closed
//    the contradiction but is still a guess for entitlement/payment UI: an
//    unresolved server state should never render as a confident Free *or*
//    Pro. Current fix: unresolved serverUser renders neutral "Checking
//    plan…" copy — never derived from localStorage — and is replaced with
//    the real tier the moment serverUser resolves (init()'s retry path
//    already re-invokes checkProStatus() once it succeeds).
//
// This repo has no DOM test harness (see tests/upgrade-pro-guard.test.js's
// header for why) — checkProStatus() is extracted and run for real against
// Node's vm module with a minimal fake DOM, proving actual behavior.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GROWTH_JS_PATH = path.join(__dirname, '..', 'public', 'js', 'dashboard-growth.js');
const GROWTH_SRC = fs.readFileSync(GROWTH_JS_PATH, 'utf8');

// checkProStatus() delegates to the shared renderPlanEntitlement() (public/js/pro-status.js) —
// load it into the same vm context so the extracted function can actually run.
const PRO_STATUS_SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pro-status.js'), 'utf8');

const TODAY_JS_PATH = path.join(__dirname, '..', 'public', 'js', 'dashboard-today.js');
const TODAY_SRC = fs.readFileSync(TODAY_JS_PATH, 'utf8');

const SIDEBAR_HTML_PATH = path.join(__dirname, '..', 'public', 'partials', 'layout', 'sidebar.html');
const SIDEBAR_SRC = fs.readFileSync(SIDEBAR_HTML_PATH, 'utf8');

function extractFn(src, name) {
  const startIdx = src.indexOf(`function ${name}(`);
  assert.notEqual(startIdx, -1, `expected to find function ${name} in source`);
  const endIdx = src.indexOf('\n}\n', startIdx);
  assert.notEqual(endIdx, -1, `expected to find the closing brace for ${name}`);
  return src.slice(startIdx, endIdx + 2);
}

const CHECK_PRO_STATUS_SRC = extractFn(GROWTH_SRC, 'checkProStatus');

function makeEl() {
  return { style: { display: '' }, textContent: '' };
}

function runCheckProStatus({ serverUser, localStorageProValue }) {
  const els = { proBadge: makeEl(), planLabel: makeEl(), mobilePlanLabel: makeEl() };
  const store = {};
  if (localStorageProValue !== undefined) store.mealzy_pro = localStorageProValue;
  let getItemCalledWith = null;

  const context = {
    serverUser,
    document: {
      getElementById(id) {
        if (!(id in els)) throw new Error(`unexpected getElementById('${id}')`);
        return els[id];
      },
    },
    localStorage: {
      getItem(key) { getItemCalledWith = key; return key in store ? store[key] : null; },
      setItem(key, val) { store[key] = val; },
    },
  };
  vm.createContext(context);
  vm.runInContext(`${PRO_STATUS_SRC}\n${CHECK_PRO_STATUS_SRC}\ncheckProStatus();`, context, { filename: 'dashboard-growth.js-checkProStatus' });
  return { els, localStorageWasRead: getItemCalledWith !== null };
}

describe('E/F: resolved server state renders the correct tier', () => {
  test('E: serverUser.pro === true -> "Pro Plan" + badge visible', () => {
    const { els } = runCheckProStatus({ serverUser: { pro: true } });
    assert.equal(els.planLabel.textContent, 'Pro Plan');
    assert.equal(els.mobilePlanLabel.textContent, 'Pro Plan');
    assert.equal(els.proBadge.style.display, 'inline-block');
  });

  test('F: serverUser.pro === false -> "Free Plan" + badge hidden', () => {
    const { els } = runCheckProStatus({ serverUser: { pro: false } });
    assert.equal(els.planLabel.textContent, 'Free Plan');
    assert.equal(els.proBadge.style.display, 'none');
  });
});

describe('A/B: unresolved server state renders neutral, never Free or Pro', () => {
  test('A: serverUser === null (unresolved / not-yet-fetched) -> neutral "Checking plan…", not Free or Pro', () => {
    const { els } = runCheckProStatus({ serverUser: null });
    assert.equal(els.planLabel.textContent, 'Checking plan…');
    assert.equal(els.mobilePlanLabel.textContent, 'Checking plan…');
    assert.notEqual(els.planLabel.textContent, 'Free Plan');
    assert.notEqual(els.planLabel.textContent, 'Pro Plan');
    assert.equal(els.proBadge.style.display, 'none', 'no PRO badge while unresolved');
  });

  test('B: a failed /api/auth/me (dashboard-today.js init() catch branch) leaves serverUser null before the retry — same neutral state applies', () => {
    // Structural proof that the catch branch never assigns serverUser to
    // anything but its initial `null` before calling checkProStatus():
    // dashboard-today.js declares `let serverUser = null;` and only ever
    // reassigns it inside the try block (success path) or the setTimeout
    // retry callback — never synchronously inside the catch itself.
    const catchBlock = TODAY_SRC.slice(TODAY_SRC.indexOf('} catch(e) {\n    // Server unreachable'), TODAY_SRC.indexOf('  }\n\n  const profileData'));
    assert.doesNotMatch(catchBlock.split('setTimeout')[0], /serverUser\s*=/,
      'the catch branch must not assign serverUser before checkProStatus() runs synchronously afterward');
    const { els } = runCheckProStatus({ serverUser: null });
    assert.equal(els.planLabel.textContent, 'Checking plan…');
  });
});

describe('C/D: localStorage cannot decide the plan label while server state is unresolved', () => {
  test('C: server unresolved + localStorage.mealzy_pro="true" -> must NOT show Pro', () => {
    const { els, localStorageWasRead } = runCheckProStatus({ serverUser: null, localStorageProValue: 'true' });
    assert.notEqual(els.planLabel.textContent, 'Pro Plan');
    assert.equal(els.planLabel.textContent, 'Checking plan…');
    assert.equal(localStorageWasRead, false, 'checkProStatus must not even consult localStorage for the plan label anymore');
  });

  test('D: server unresolved + localStorage.mealzy_pro="false" -> must NOT show Free', () => {
    const { els } = runCheckProStatus({ serverUser: null, localStorageProValue: 'false' });
    assert.notEqual(els.planLabel.textContent, 'Free Plan');
    assert.equal(els.planLabel.textContent, 'Checking plan…');
  });

  test('resolved server state still wins over any localStorage value (unchanged from prior fix)', () => {
    assert.equal(runCheckProStatus({ serverUser: { pro: false }, localStorageProValue: 'true' }).els.planLabel.textContent, 'Free Plan');
    assert.equal(runCheckProStatus({ serverUser: { pro: true }, localStorageProValue: 'false' }).els.planLabel.textContent, 'Pro Plan');
  });
});

describe('G/H: retry from unresolved updates correctly once serverUser resolves', () => {
  test('G: unresolved -> retry resolves pro:true -> "Pro Plan"', () => {
    const unresolved = runCheckProStatus({ serverUser: null });
    assert.equal(unresolved.els.planLabel.textContent, 'Checking plan…');
    const resolved = runCheckProStatus({ serverUser: { pro: true } });
    assert.equal(resolved.els.planLabel.textContent, 'Pro Plan');
  });

  test('H: unresolved -> retry resolves pro:false -> "Free Plan"', () => {
    const unresolved = runCheckProStatus({ serverUser: null });
    assert.equal(unresolved.els.planLabel.textContent, 'Checking plan…');
    const resolved = runCheckProStatus({ serverUser: { pro: false } });
    assert.equal(resolved.els.planLabel.textContent, 'Free Plan');
  });

  test('init() actually re-invokes checkProStatus() after a successful retry — this is what makes G/H true at runtime, not just in isolated calls', () => {
    assert.match(TODAY_SRC, /serverUser = await retryRes\.json\(\);\s*\n\s*updateUserUI\(\);\s*\n\s*checkProStatus\(\);/,
      'dashboard-today.js init() must re-run checkProStatus() after a successful retry so the neutral state resolves to the real tier');
  });
});

describe('First-load markup is neutral, not a hardcoded tier', () => {
  test('sidebar.html no longer hardcodes "Free Plan" before JS runs', () => {
    assert.doesNotMatch(SIDEBAR_SRC, /id="planLabel">Free Plan</);
    assert.doesNotMatch(SIDEBAR_SRC, /id="mobilePlanLabel">Free Plan</);
  });

  test('sidebar.html hardcodes neutral "Checking plan…" copy instead', () => {
    assert.match(SIDEBAR_SRC, /id="planLabel">Checking plan/);
    assert.match(SIDEBAR_SRC, /id="mobilePlanLabel">Checking plan/);
  });
});

describe('I: pricing/upgrade behavior unchanged by this fix', () => {
  test('the upgrade-page guard still keys off data.pro from /api/auth/me, untouched', () => {
    const upgradeHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'upgrade.html'), 'utf8');
    assert.match(upgradeHtml, /data\s*&&\s*data\.pro\s*===\s*true/);
    assert.doesNotMatch(upgradeHtml, /localStorage[^\n]*mealzy_pro/);
  });

  test('the pricing-page checkout hook still keys off data.pro from /api/auth/me, untouched', () => {
    const hookSrc = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'pricing', 'usePricingCheckout.js'), 'utf8');
    assert.match(hookSrc, /data && data\.pro === true/);
  });
});

describe('J: no Stripe/payment backend behavior changed by this fix', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  test('the Stripe webhook handler is unchanged (signature check, idempotency, email lookup)', () => {
    assert.match(serverSrc, /async function handleStripeWebhook\(req, res\) \{/);
    assert.match(serverSrc, /stripe\.webhooks\.constructEvent\(req\.body, sig, process\.env\.STRIPE_WEBHOOK_SECRET\)/);
    assert.match(serverSrc, /await db\.isWebhookEventProcessed\(event\.id\)/);
    assert.match(serverSrc, /await db\.markWebhookEventProcessed\(event\.id\)/);
  });

  test('/api/auth/me is unchanged: still DB-authoritative, never trusts the JWT payload for pro', () => {
    assert.match(serverSrc, /app\.get\('\/api\/auth\/me', requireSession, async \(req, res\) => \{/);
    assert.match(serverSrc, /const user = await db\.getUserById\(session\.userId\);/);
  });

  test('this fix touched only dashboard plan-label rendering, not entitlement logic — checkProStatus makes no network calls', () => {
    assert.doesNotMatch(CHECK_PRO_STATUS_SRC, /fetch\(/, 'checkProStatus must remain a pure DOM-render function, no network calls');
  });
});
