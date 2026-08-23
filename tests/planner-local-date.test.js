'use strict';

// Regression tests for the planner UTC/local-date-key mismatch fix.
//
// Root cause: planner-controller.js, planner-page-init.js, and
// planner-week-view.js all derived "today"/day/weekStart strings with
// `.toISOString().split('T')[0]`, which is UTC — while dashboard-today.js
// and groceries-sync.js already used a local-calendar toLocalDateStr().
// For a positive-offset user (e.g. Sweden, UTC+2) shortly after local
// midnight, UTC is still "yesterday", so the planner would look up
// plans[yesterday] while the server/dashboard saved under plans[today] —
// a restored plan would render as if it didn't exist.
//
// The fix adds ONE toLocalDateStr() to planner-controller.js (the
// first-loaded planner script, so it's a global the other two reuse — see
// meal-planner.html's script order) and uses it at all 4 flagged call
// sites. The date ARITHMETIC (finding Monday, walking week days) already
// used local getDate()/getDay() — only the final string formatting was
// UTC — so this changes formatting only, never which calendar day is
// selected.
//
// These tests run the REAL source files (planner-controller.js,
// dashboard-today.js, groceries-sync.js) in sandboxed VM contexts — same
// pattern as tests/grocery-list-planid-flow.test.js — and manipulate
// process.env.TZ so Date's local getters (getFullYear/getMonth/getDate)
// reflect a real target timezone deterministically, without touching the
// host OS clock.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ORIGINAL_TZ = process.env.TZ;
after(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

function withTz(tz, fn) {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
  }
}

function makeLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

// Loads planner-controller.js in a VM sandbox and exposes toLocalDateStr
// (and PlannerState's setDateStr-equivalent behavior) for direct testing —
// the exact shipped source, not a reimplementation.
function loadPlannerController() {
  const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'planner', 'planner-controller.js'), 'utf8')
    + `\nglobalThis.__t = { toLocalDateStr, PlannerState: window.PlannerState };\n`;
  const sandbox = {
    localStorage: makeLocalStorage(),
    document: {
      getElementById: () => null,
      addEventListener: () => {},
    },
    console,
    getHouseholdSize: () => 1,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'planner-controller.js' });
  return sandbox.__t;
}

// Loads dashboard-today.js far enough to extract its toLocalDateStr — the
// file has DOM-heavy top-level code (icons, init hooks), so it's stubbed
// the same way tests/grocery-list-planid-flow.test.js stubs groceries-sync.js.
function loadDashboardTodayHelper() {
  const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard-today.js'), 'utf8')
    + `\nglobalThis.__t = { toLocalDateStr, getMondayStr };\n`;
  const sandbox = {
    localStorage: makeLocalStorage(),
    document: { getElementById: () => ({ textContent: '', style: {} }) },
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'dashboard-today.js' });
  return sandbox.__t;
}

function loadGroceriesSyncHelper() {
  const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'groceries-sync.js'), 'utf8')
    + `\nglobalThis.__t = { toLocalDateStr, getMondayOfWeek };\n`;
  const sandbox = {
    localStorage: makeLocalStorage(),
    document: { getElementById: () => null },
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'groceries-sync.js' });
  return sandbox.__t;
}

// Loads planner-page-init.js's getMondayStr, wired to the SAME
// toLocalDateStr planner-controller.js defines (as it is on the real page,
// via shared global scope across deferred scripts).
function loadPlannerGetMondayStr() {
  const controllerSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'planner', 'planner-controller.js'), 'utf8');
  const pageInitSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'planner', 'planner-page-init.js'), 'utf8');
  const SOURCE = controllerSource + '\n' + pageInitSource + `\nglobalThis.__t = { getMondayStr };\n`;
  const sandbox = {
    localStorage: makeLocalStorage(),
    document: { getElementById: () => null, addEventListener: () => {} },
    console,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'planner-page-init.js' });
  return sandbox.__t;
}

// Loads planner-week-view.js's todayStr/dateStr derivation indirectly by
// exposing toLocalDateStr from the shared controller source alongside it,
// proving the same helper (not a duplicate) drives week-view's day keys —
// the file itself has no independently testable pure function here (its
// date logic is inline inside renderWeekView, which needs a full DOM).
function loadWeekViewUsesSharedHelper() {
  const controllerSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'planner', 'planner-controller.js'), 'utf8');
  const weekViewSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'planner', 'planner-week-view.js'), 'utf8');
  assert.match(weekViewSource, /toLocalDateStr\(new Date\(\)\)/, 'week-view "today" must derive from the shared local helper');
  assert.match(weekViewSource, /toLocalDateStr\(d\)/, 'week-view per-day date keys must derive from the shared local helper');
  assert.doesNotMatch(weekViewSource, /toISOString\(\)\.split\('T'\)\[0\]/, 'no UTC date-string derivation must remain in planner-week-view.js');
  return controllerSource; // presence check only — sourced above
}

describe('A/B/C — toLocalDateStr() reflects the LOCAL calendar date, not UTC, across offsets', () => {
  test('A: UTC+2 (Stockholm) shortly after local midnight — local date is the NEXT day vs. UTC', () => {
    const { toLocalDateStr } = loadPlannerController();
    // 2026-08-23 22:30 UTC == 2026-08-24 00:30 in Stockholm (UTC+2, DST)
    const instant = new Date(Date.UTC(2026, 7, 23, 22, 30, 0));
    const localStr = withTz('Europe/Stockholm', () => toLocalDateStr(instant));
    const utcStr = instant.toISOString().split('T')[0];
    assert.equal(localStr, '2026-08-24');
    assert.equal(utcStr, '2026-08-23');
    assert.notEqual(localStr, utcStr, 'this is exactly the mismatch the bug produced');
  });

  test('B: UTC-7 (Los Angeles) late evening — local date stays the SAME day, no accidental UTC rollover', () => {
    const { toLocalDateStr } = loadPlannerController();
    // 2026-08-24 06:29 UTC == 2026-08-23 23:29 in Los Angeles (UTC-7, PDT)
    const instant = new Date(Date.UTC(2026, 7, 24, 6, 29, 0));
    const localStr = withTz('America/Los_Angeles', () => toLocalDateStr(instant));
    assert.equal(localStr, '2026-08-23');
  });

  test('C: UTC+0 midday — local and UTC agree (sanity baseline)', () => {
    const { toLocalDateStr } = loadPlannerController();
    const instant = new Date(Date.UTC(2026, 7, 23, 12, 0, 0));
    const localStr = withTz('UTC', () => toLocalDateStr(instant));
    assert.equal(localStr, '2026-08-23');
    assert.equal(localStr, instant.toISOString().split('T')[0]);
  });
});

describe('F — dashboard and planner derive the identical "today" key in every offset', () => {
  for (const [label, tz, utcHour] of [
    ['Stockholm just after midnight', 'Europe/Stockholm', 22],
    ['Los Angeles late evening', 'America/Los_Angeles', 6],
    ['UTC baseline', 'UTC', 12],
  ]) {
    test(label, () => {
      const planner = loadPlannerController();
      const dashboard = loadDashboardTodayHelper();
      const instant = new Date(Date.UTC(2026, 7, 23, utcHour, 30, 0));
      const plannerStr = withTz(tz, () => planner.toLocalDateStr(instant));
      const dashboardStr = withTz(tz, () => dashboard.toLocalDateStr(instant));
      assert.equal(plannerStr, dashboardStr);
    });
  }
});

describe('G — groceries and planner derive the identical "today"/day key in every offset', () => {
  for (const [label, tz, utcHour] of [
    ['Stockholm just after midnight', 'Europe/Stockholm', 22],
    ['Los Angeles late evening', 'America/Los_Angeles', 6],
  ]) {
    test(label, () => {
      const planner = loadPlannerController();
      const groceries = loadGroceriesSyncHelper();
      const instant = new Date(Date.UTC(2026, 7, 23, utcHour, 30, 0));
      const plannerStr = withTz(tz, () => planner.toLocalDateStr(instant));
      const groceriesStr = withTz(tz, () => groceries.toLocalDateStr(instant));
      assert.equal(plannerStr, groceriesStr);
    });
  }

  test('week-view sources the shared local helper, not a duplicate UTC formula', () => {
    loadWeekViewUsesSharedHelper();
  });
});

describe('D/E — a plan keyed to the LOCAL date (server-restored or cached) is found under the key the fixed planner now looks up', () => {
  test('D: a server-restored plan saved under the Stockholm-local date is retrieved via the local date key, not the UTC one', async () => {
    const { toLocalDateStr } = loadPlannerController();
    // Same instant as test A: UTC date is 2026-08-23, Stockholm-local is 2026-08-24.
    const instant = new Date(Date.UTC(2026, 7, 23, 22, 30, 0));
    const localDateKey = withTz('Europe/Stockholm', () => toLocalDateStr(instant));
    assert.equal(localDateKey, '2026-08-24');

    // Simulates GET /api/plans returning the plan the server saved under the
    // server's own local-date computation (server.js's getLocalDateString) —
    // which for this same instant/timezone also lands on 2026-08-24.
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ success: true, plans: [{ date: '2026-08-24', plan: { meals: [{ name: 'Late Salmon Bowl' }] }, savedAt: instant.toISOString() }] }),
    });
    const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'planner', 'planner-api.js'), 'utf8');
    const sandbox = { localStorage: makeLocalStorage(), console, fetch: fetchImpl };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(SOURCE, sandbox, { filename: 'planner-api.js' });

    const meals = await withTz('Europe/Stockholm', () => sandbox.window.PlannerAPI.fetchServerPlanIfNeeded(localDateKey));

    assert.equal(JSON.stringify(meals), JSON.stringify([{ name: 'Late Salmon Bowl' }]));
  });

  test('E: a plan cached in localStorage under the LOCAL date key renders for that key (no network call)', () => {
    const { toLocalDateStr } = loadPlannerController();
    const instant = new Date(Date.UTC(2026, 7, 23, 22, 30, 0));
    const localDateKey = withTz('Europe/Stockholm', () => toLocalDateStr(instant));

    const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'planner', 'planner-api.js'), 'utf8');
    const sandbox = {
      localStorage: makeLocalStorage({
        mealzy_meal_plans: JSON.stringify({ [localDateKey]: { meals: [{ name: 'Cached Local Meal' }] } }),
      }),
      console,
      fetch: async () => { throw new Error('must not be called — cache already has this local date key'); },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(SOURCE, sandbox, { filename: 'planner-api.js' });

    const meals = sandbox.window.PlannerAPI.getDayMeals(localDateKey);
    assert.equal(JSON.stringify(meals), JSON.stringify([{ name: 'Cached Local Meal' }]));
  });
});

describe('H/I — weekStart (getMondayStr) stays correct after the local-date fix', () => {
  test('H: Sunday -> Monday boundary — a Sunday still resolves to the Monday that STARTS that week, not the next one', () => {
    const { getMondayStr } = loadPlannerGetMondayStr();
    // Sunday 2026-08-23 local noon (T12:00:00 avoids any UTC-midnight parse pitfall)
    const sunday = new Date('2026-08-23T12:00:00');
    assert.equal(getMondayStr(sunday), '2026-08-17');
  });

  test('H: Monday itself resolves to itself', () => {
    const { getMondayStr } = loadPlannerGetMondayStr();
    const monday = new Date('2026-08-17T12:00:00');
    assert.equal(getMondayStr(monday), '2026-08-17');
  });

  test('I: year boundary — Jan 1 2026 (Thursday) still resolves to the Monday of ISO week 1, in the correct year', () => {
    const { getMondayStr } = loadPlannerGetMondayStr();
    const newYearsDay = new Date('2026-01-01T12:00:00');
    assert.equal(getMondayStr(newYearsDay), '2025-12-29');
  });

  test('I: a date on Dec 31 that belongs to a week starting in the prior year resolves correctly', () => {
    const { getMondayStr } = loadPlannerGetMondayStr();
    const dec31 = new Date('2025-12-31T12:00:00'); // Wednesday, week of 2025-12-29
    assert.equal(getMondayStr(dec31), '2025-12-29');
  });

  test('getMondayStr(currentDate) matches dashboard-today.js\'s getMondayStr for the same instant/offset (weekStart parity, Pro generation)', () => {
    const planner = loadPlannerGetMondayStr();
    const dashboard = loadDashboardTodayHelper();
    // 2026-08-23 22:30 UTC == 2026-08-24 00:30 Stockholm (a Monday, local) — the exact
    // scenario where the old UTC-based getMondayStr would have disagreed with dashboard's.
    const instant = new Date(Date.UTC(2026, 7, 23, 22, 30, 0));
    const plannerWeekStart = withTz('Europe/Stockholm', () => planner.getMondayStr(instant));
    const dashboardWeekStart = withTz('Europe/Stockholm', () => dashboard.getMondayStr(instant));
    assert.equal(plannerWeekStart, dashboardWeekStart);
    assert.equal(plannerWeekStart, '2026-08-24', 'must be the Stockholm-local Monday, not the UTC-Sunday');
  });
});
