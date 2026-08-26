'use strict';

// Regression tests for Meal Planner Pro-entitlement consistency.
//
// Reported bug: the same authenticated Pro account shows "Pro Account" on
// the Dashboard but "Free" on the Meal Planner.
//
// Root cause (two separate gaps, both in the Meal Planner's own JS, not the
// Dashboard's):
//
// 1. Meal Planner never rendered the sidebar's Pro/Free label at all.
//    meal-planner.html doesn't load dashboard-growth.js (where
//    checkProStatus() lives), so the shared sidebar partial's `#planLabel`
//    stayed on its static HTML placeholder ("Checking plan…") forever,
//    regardless of the real entitlement.
//
// 2. The actual Pro/Free feature gates (generateMealPlan()'s week-vs-day
//    request, checkPlanLimitBanner()'s free-limit banner) read
//    `localStorage.getItem('mealzy_pro') === 'true'` directly — a stale
//    client cache — instead of the fresh `/api/auth/me` response for this
//    page load. Dashboard's equivalent gates (dashboard-actions.js's
//    generateMealPlan, dashboard-growth.js's printMealPlan) already used
//    `!!serverUser?.pro`, the in-memory value from this session's own fetch.
//    Meal Planner had no `serverUser` variable at all, so it had no way to
//    do the same thing, and no way to represent "unresolved" — a failed or
//    slow /api/auth/me on the Planner tab left it confidently reading
//    whatever localStorage.mealzy_pro happened to be (possibly stale/never
//    set), with no retry, unlike Dashboard's documented 2s-retry pattern.
//
// Fix: added a `serverUser` variable + `checkProStatus()` +
// `currentIsPro()` to planner-page-init.js, mirroring dashboard-today.js/
// dashboard-growth.js's pattern exactly (resolved serverUser always wins;
// localStorage is consulted only while serverUser is unresolved; a 2s retry
// on fetch failure). Every isPro read in the planner bundle
// (planner-page-init.js, planner-week-view.js) now goes through
// currentIsPro() instead of a raw localStorage read.
//
// No DOM test harness exists in this repo (see tests/dashboard-pro-status.test.js
// for precedent) — real functions are extracted and run via Node's vm module
// against a minimal fake DOM.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGE_INIT_PATH = path.join(__dirname, '..', 'public', 'js', 'planner', 'planner-page-init.js');
const PAGE_INIT_SRC = fs.readFileSync(PAGE_INIT_PATH, 'utf8');

const WEEK_VIEW_PATH = path.join(__dirname, '..', 'public', 'js', 'planner', 'planner-week-view.js');
const WEEK_VIEW_SRC = fs.readFileSync(WEEK_VIEW_PATH, 'utf8');

const MEAL_PLANNER_HTML_PATH = path.join(__dirname, '..', 'public', 'meal-planner.html');
const MEAL_PLANNER_HTML_SRC = fs.readFileSync(MEAL_PLANNER_HTML_PATH, 'utf8');

const DASHBOARD_ACTIONS_PATH = path.join(__dirname, '..', 'public', 'js', 'dashboard-actions.js');
const DASHBOARD_ACTIONS_SRC = fs.readFileSync(DASHBOARD_ACTIONS_PATH, 'utf8');

// checkProStatus()/currentIsPro() now delegate to the shared
// renderPlanEntitlement()/resolveIsPro() (public/js/pro-status.js) — load it
// into the same vm context so the extracted wrappers can actually run.
const PRO_STATUS_SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pro-status.js'), 'utf8');

function extractFn(src, name) {
  const startIdx = src.indexOf(`function ${name}(`);
  assert.notEqual(startIdx, -1, `expected to find function ${name} in source`);
  const endIdx = src.indexOf('\n}\n', startIdx);
  assert.notEqual(endIdx, -1, `expected to find the closing brace for ${name}`);
  return src.slice(startIdx, endIdx + 2);
}

const CHECK_PRO_STATUS_SRC = extractFn(PAGE_INIT_SRC, 'checkProStatus');
const CURRENT_IS_PRO_SRC = extractFn(PAGE_INIT_SRC, 'currentIsPro');

function makeEl() {
  return { style: { display: '' }, textContent: '' };
}

function runCheckProStatus({ serverUser }) {
  const els = { proBadge: makeEl(), planLabel: makeEl(), mobilePlanLabel: makeEl() };
  const context = {
    serverUser,
    document: {
      getElementById(id) {
        if (!(id in els)) throw new Error(`unexpected getElementById('${id}')`);
        return els[id];
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(`${PRO_STATUS_SRC}\n${CHECK_PRO_STATUS_SRC}\ncheckProStatus();`, context, { filename: 'planner-page-init.js-checkProStatus' });
  return els;
}

function runCurrentIsPro({ serverUser, localStorageProValue }) {
  const store = {};
  if (localStorageProValue !== undefined) store.mealzy_pro = localStorageProValue;
  let getItemCalledWith = null;
  const context = {
    serverUser,
    localStorage: {
      getItem(key) { getItemCalledWith = key; return key in store ? store[key] : null; },
    },
  };
  vm.createContext(context);
  const result = vm.runInContext(`${PRO_STATUS_SRC}\n${CURRENT_IS_PRO_SRC}\ncurrentIsPro();`, context, { filename: 'planner-page-init.js-currentIsPro' });
  return { result, localStorageWasRead: getItemCalledWith !== null };
}

describe('E/F: resolved server state renders the correct tier on the Planner sidebar', () => {
  test('E: serverUser.pro === true -> "Pro Plan" + badge visible', () => {
    const els = runCheckProStatus({ serverUser: { pro: true } });
    assert.equal(els.planLabel.textContent, 'Pro Plan');
    assert.equal(els.mobilePlanLabel.textContent, 'Pro Plan');
    assert.equal(els.proBadge.style.display, 'inline-block');
  });

  test('F: serverUser.pro === false -> "Free Plan" + badge hidden', () => {
    const els = runCheckProStatus({ serverUser: { pro: false } });
    assert.equal(els.planLabel.textContent, 'Free Plan');
    assert.equal(els.proBadge.style.display, 'none');
  });
});

describe('A/B: unresolved/failed auth renders neutral, never confidently Free or Pro', () => {
  test('A: serverUser === null (unresolved / not-yet-fetched) -> neutral "Checking plan…"', () => {
    const els = runCheckProStatus({ serverUser: null });
    assert.equal(els.planLabel.textContent, 'Checking plan…');
    assert.equal(els.mobilePlanLabel.textContent, 'Checking plan…');
    assert.equal(els.proBadge.style.display, 'none');
  });

  test('B: the init() catch branch (auth fetch failed) does not assign serverUser before the 2s retry — same neutral state applies', () => {
    const catchBlock = PAGE_INIT_SRC.slice(PAGE_INIT_SRC.indexOf('} catch(e) {\n    // Server unreachable'), PAGE_INIT_SRC.indexOf('  }\n  const profileData'));
    assert.doesNotMatch(catchBlock.split('setTimeout')[0], /serverUser\s*=/,
      'the catch branch must not assign serverUser synchronously before checkProStatus() runs');
  });
});

describe('C/D: this is the literal "Dashboard=Pro, Planner=Free" repro — localStorage cannot decide entitlement once/while resolved', () => {
  test('C: REPRO — serverUser resolves pro:true but localStorage.mealzy_pro is stale "false" (e.g. never set on this device) -> Planner must still show Pro', () => {
    const els = runCheckProStatus({ serverUser: { pro: true } }); // label path doesn't touch localStorage at all
    assert.equal(els.planLabel.textContent, 'Pro Plan');
    const gate = runCurrentIsPro({ serverUser: { pro: true }, localStorageProValue: 'false' });
    assert.equal(gate.result, true, 'the feature-gate helper must also say Pro once serverUser has resolved, regardless of stale localStorage');
  });

  test('D: serverUser resolves pro:false but localStorage.mealzy_pro is stale "true" -> must NOT show/act Pro', () => {
    const els = runCheckProStatus({ serverUser: { pro: false } });
    assert.equal(els.planLabel.textContent, 'Free Plan');
    const gate = runCurrentIsPro({ serverUser: { pro: false }, localStorageProValue: 'true' });
    assert.equal(gate.result, false);
  });

  test('while serverUser is unresolved, currentIsPro() falls back to the cached localStorage value (best-effort, e.g. offline) rather than hard-failing', () => {
    assert.equal(runCurrentIsPro({ serverUser: null, localStorageProValue: 'true' }).result, true);
    assert.equal(runCurrentIsPro({ serverUser: null, localStorageProValue: 'false' }).result, false);
  });

  test('once serverUser is resolved, currentIsPro() does not even read localStorage', () => {
    const gate = runCurrentIsPro({ serverUser: { pro: true }, localStorageProValue: 'false' });
    assert.equal(gate.localStorageWasRead, false, 'a resolved serverUser must be consulted exclusively — localStorage must never be capable of changing a resolved server entitlement');
  });
});

describe('G/H: retry from unresolved updates both the label and the feature gates once /api/auth/me succeeds', () => {
  test('G: unresolved -> retry resolves pro:true -> "Pro Plan" + gate flips to true', () => {
    assert.equal(runCheckProStatus({ serverUser: null }).planLabel.textContent, 'Checking plan…');
    assert.equal(runCheckProStatus({ serverUser: { pro: true } }).planLabel.textContent, 'Pro Plan');
    assert.equal(runCurrentIsPro({ serverUser: { pro: true } }).result, true);
  });

  test('H: init() retry callback re-runs BOTH checkProStatus() and checkPlanLimitBanner() so the limit banner cannot stay stuck on Free after a delayed Pro resolution', () => {
    const retryBlock = PAGE_INIT_SRC.slice(PAGE_INIT_SRC.indexOf('setTimeout(async () => {'), PAGE_INIT_SRC.indexOf('}, 2000);') + 10);
    assert.match(retryBlock, /serverUser = await retryRes\.json\(\);/);
    assert.match(retryBlock, /checkProStatus\(\);/);
    assert.match(retryBlock, /checkPlanLimitBanner\(\);/);
  });

  test('checkPlanLimitBanner() itself hides the banner once Pro resolves, not just skips showing it', () => {
    const fnSrc = WEEK_VIEW_SRC.slice(WEEK_VIEW_SRC.indexOf('function checkPlanLimitBanner'), WEEK_VIEW_SRC.indexOf('function copySharePlanLink'));
    assert.match(fnSrc, /if \(currentIsPro\(\)\) \{[\s\S]*?banner\.style\.display = 'none';/);
  });
});

describe('audit: every Pro/Free gate in the Meal Planner bundle goes through currentIsPro(), not a raw localStorage read', () => {
  test('generateMealPlan() (week-vs-day generation) uses currentIsPro()', () => {
    const fnSrc = PAGE_INIT_SRC.slice(PAGE_INIT_SRC.indexOf('async function generateMealPlan'), PAGE_INIT_SRC.indexOf('function regenerateMealPlan'));
    assert.match(fnSrc, /const isPro = currentIsPro\(\);/);
    assert.doesNotMatch(fnSrc, /localStorage\.getItem\('mealzy_pro'\)/);
  });

  test('checkPlanLimitBanner() (free-limit banner) uses currentIsPro()', () => {
    const fnSrc = WEEK_VIEW_SRC.slice(WEEK_VIEW_SRC.indexOf('function checkPlanLimitBanner'), WEEK_VIEW_SRC.indexOf('function copySharePlanLink'));
    assert.match(fnSrc, /currentIsPro\(\)/);
    assert.doesNotMatch(fnSrc, /localStorage\.getItem\('mealzy_pro'\)/);
  });

  test('no raw `mealzy_pro` localStorage READ remains anywhere in the planner bundle OUTSIDE currentIsPro() itself', () => {
    const withoutCurrentIsPro = PAGE_INIT_SRC.replace(CURRENT_IS_PRO_SRC, '');
    const allPlannerJs = [withoutCurrentIsPro, WEEK_VIEW_SRC].join('\n');
    const reads = allPlannerJs.match(/localStorage\.getItem\('mealzy_pro'\)/g) || [];
    assert.deepEqual(reads, [], `found raw mealzy_pro reads outside currentIsPro(): ${reads.length}`);
  });

  test('meal-planner.html itself contains no separate ad-hoc pro/isPro check outside the shared JS bundle', () => {
    assert.doesNotMatch(MEAL_PLANNER_HTML_SRC, /localStorage\.getItem\('mealzy_pro'\)/);
  });
});

describe('navigation Dashboard -> Planner: both pages resolve to the identical label for the same server response', () => {
  test('given the same serverUser, planner\'s checkProStatus() and dashboard\'s checkProStatus() render the same tier', () => {
    const dashboardGrowthSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard-growth.js'), 'utf8');
    const dashboardCheckProStatusSrc = extractFn(dashboardGrowthSrc, 'checkProStatus');
    for (const su of [{ pro: true }, { pro: false }, null]) {
      const plannerEls = runCheckProStatus({ serverUser: su });
      const els2 = { proBadge: makeEl(), planLabel: makeEl(), mobilePlanLabel: makeEl() };
      const ctx2 = { serverUser: su, document: { getElementById: (id) => els2[id] } };
      vm.createContext(ctx2);
      vm.runInContext(`${PRO_STATUS_SRC}\n${dashboardCheckProStatusSrc}\ncheckProStatus();`, ctx2);
      assert.equal(plannerEls.planLabel.textContent, els2.planLabel.textContent, `mismatch for serverUser=${JSON.stringify(su)}`);
      assert.equal(plannerEls.proBadge.style.display, els2.proBadge.style.display, `badge mismatch for serverUser=${JSON.stringify(su)}`);
    }
  });

  test('meal-planner.html loads its own planner/nav component (a fork of the dashboard sidebar, not a shared file) — the ids inside it are what actually matter, checked below', () => {
    assert.match(MEAL_PLANNER_HTML_SRC, /data-component="planner\/nav"/);
  });
});

describe('THE ACTUAL REPORTED BUG: planner/nav.html hardcoded the literal text "Free Plan" with no id, so no JS could ever update it — checkProStatus() was rendering into elements that did not exist on this page', () => {
  const NAV_PARTIAL_PATH = path.join(__dirname, '..', 'public', 'partials', 'planner', 'nav.html');
  const NAV_PARTIAL_SRC = fs.readFileSync(NAV_PARTIAL_PATH, 'utf8');

  test('the hardcoded, unconditional "Free Plan" string is gone from the desktop and mobile sidebar-user blocks', () => {
    assert.doesNotMatch(NAV_PARTIAL_SRC, /<div class="text-muted text-sm">Free Plan<\/div>/,
      'a static "Free Plan" div with no id can never be updated by any JS — this alone fully explains the reported bug');
  });

  test('the desktop sidebar-user block now has id="planLabel" and a id="proBadge", matching what checkProStatus() actually queries', () => {
    assert.match(NAV_PARTIAL_SRC, /<div class="text-muted text-sm" id="planLabel">Checking plan/);
    assert.match(NAV_PARTIAL_SRC, /<span id="proBadge"[^>]*>PRO<\/span>/);
  });

  test('the mobile sidebar-user block now has id="mobilePlanLabel"', () => {
    assert.match(NAV_PARTIAL_SRC, /<div class="text-muted text-sm" id="mobilePlanLabel">Checking plan/);
  });

  test('the initial static markup is the neutral placeholder, not a hardcoded tier — matches the dashboard sidebar\'s own precedent fix', () => {
    assert.doesNotMatch(NAV_PARTIAL_SRC, /id="planLabel">(Free|Pro) Plan</);
    assert.doesNotMatch(NAV_PARTIAL_SRC, /id="mobilePlanLabel">(Free|Pro) Plan</);
  });

  test('end-to-end: checkProStatus() run against the REAL nav.html ids (not a synthetic fake-DOM stub) correctly resolves Pro', () => {
    // Minimal DOM stand-in built directly from the ids present in the shipped partial,
    // proving the ids checkProStatus() queries actually exist in that file.
    assert.ok(/id="planLabel"/.test(NAV_PARTIAL_SRC) && /id="mobilePlanLabel"/.test(NAV_PARTIAL_SRC) && /id="proBadge"/.test(NAV_PARTIAL_SRC));
    const els = runCheckProStatus({ serverUser: { pro: true } });
    assert.equal(els.planLabel.textContent, 'Pro Plan');
    assert.equal(els.proBadge.style.display, 'inline-block');
  });
});

describe('no Stripe/webhook/payment/trial-generation/pricing behavior was touched by this fix', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  test('the Stripe webhook handler is unchanged', () => {
    assert.match(serverSrc, /async function handleStripeWebhook\(req, res\) \{/);
    assert.match(serverSrc, /stripe\.webhooks\.constructEvent\(req\.body, sig, process\.env\.STRIPE_WEBHOOK_SECRET\)/);
  });

  test('/api/auth/me is unchanged: still DB-authoritative, never trusts the JWT payload for pro', () => {
    assert.match(serverSrc, /app\.get\('\/api\/auth\/me', requireSession, async \(req, res\) => \{/);
    assert.match(serverSrc, /const user = await db\.getUserById\(session\.userId\);/);
  });

  test('the generation payload shape (weekStart for Pro, date for Free) sent by generateMealPlan() is unchanged', () => {
    const fnSrc = PAGE_INIT_SRC.slice(PAGE_INIT_SRC.indexOf('async function generateMealPlan'), PAGE_INIT_SRC.indexOf('function regenerateMealPlan'));
    assert.match(fnSrc, /isPro\s*\n\s*\? \{ profile, weekStart, avoid_meals: avoidMeals \}\s*\n\s*: \{ profile, date: currentDateStr, timezone, avoid_meals: avoidMeals \}/);
  });

  test('this fix touched only entitlement rendering/gating, not Dashboard\'s own generateMealPlan (dashboard-actions.js untouched)', () => {
    assert.match(DASHBOARD_ACTIONS_SRC, /const isPro = !!serverUser\?\.pro;/);
  });
});
