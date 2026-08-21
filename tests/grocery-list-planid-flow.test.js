'use strict';

// Runs the REAL public/js/groceries-sync.js source (not a reimplementation)
// inside a sandboxed VM context with a minimal localStorage/fetch/document
// stub, so the planId caching + retry-on-empty logic added by this fix is
// exercised as actual code, not just read by inspection.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const RAW_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'groceries-sync.js'), 'utf8');

// groceries-sync.js declares its state (planId, weekStart, availableDays,
// groceryList, selectedDay) as top-level `let` bindings, which — unlike
// `var` — do NOT become properties of the vm context's global object. This
// bridge is appended in the SAME script/scope so it can close over those
// exact bindings directly and expose them for the tests to drive, without
// modifying a single line of the real, shipped source.
const SOURCE = RAW_SOURCE + `
globalThis.__t = {
  get planId() { return planId; }, set planId(v) { planId = v; },
  get weekStart() { return weekStart; }, set weekStart(v) { weekStart = v; },
  get availableDays() { return availableDays; },
  get groceryList() { return groceryList; },
  get selectedDay() { return selectedDay; },
  refreshAvailableDays, selectDay, loadPlanId, savePlanId, generateGroceryList,
};
`;

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

/** Builds a fresh sandbox with the real groceries-sync.js loaded into it.
 * `fetchImpl` lets each test control what the mocked network returns. */
function makeSandbox(fetchImpl) {
  const calls = [];
  const stubFn = (name) => (...args) => { calls.push({ name, args }); };
  const sandbox = {
    localStorage: makeLocalStorage(),
    fetch: (...args) => { calls.push({ name: 'fetch', args }); return fetchImpl(...args); },
    document: { getElementById: () => ({ textContent: '', style: {}, classList: { add() {}, remove() {} } }) },
    console,
    setTimeout: (fn) => { fn(); }, // collapse retry backoff so tests run instantly
    // Rendering + UI helpers live in groceries-ui.js on the real page — stub
    // them so groceries-sync.js's own logic can run in isolation.
    renderGroceryList: stubFn('renderGroceryList'),
    renderEmpty: stubFn('renderEmpty'),
    renderDaySwitcher: stubFn('renderDaySwitcher'),
    updateProgress: stubFn('updateProgress'),
    showToast: stubFn('showToast'),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'groceries-sync.js' });
  return { sandbox, calls };
}

describe('C — the plan id learned from generate-meal is what grocery-list.html reads back', () => {
  test('savePlanId()/loadPlanId() round-trip through the exact localStorage key dashboard/planner code writes to', () => {
    const { sandbox } = makeSandbox(async () => ({ ok: true, json: async () => ({ success: true, days: [] }) }));
    sandbox.__t.weekStart = '2026-08-17';
    sandbox.__t.savePlanId('plan-abc-123');

    const raw = JSON.parse(sandbox.localStorage.getItem('mealzy_grocery_plan_ids'));
    assert.equal(raw['2026-08-17'], 'plan-abc-123');

    sandbox.__t.planId = null; // simulate a fresh page load
    const loaded = sandbox.__t.loadPlanId();
    assert.equal(loaded, 'plan-abc-123');
  });

  test('a planId written by the generate-meal response handler (same storage shape) is picked up by loadPlanId()', () => {
    const { sandbox } = makeSandbox(async () => ({ ok: true, json: async () => ({ success: true, days: [] }) }));
    // Mirrors exactly what dashboard-actions.js / planner-page-init.js now do
    // after a successful /api/generate-meal response.
    const groceryPlanIds = { '2026-08-17': 'server-issued-plan-id' };
    sandbox.localStorage.setItem('mealzy_grocery_plan_ids', JSON.stringify(groceryPlanIds));

    sandbox.__t.weekStart = '2026-08-17';
    assert.equal(sandbox.__t.loadPlanId(), 'server-issued-plan-id');
  });
});

describe('D — grocery-list.html loads the list belonging to the exact planId', () => {
  test('refreshAvailableDays() populates availableDays from /api/grocery-list/:planId/days for the cached planId', async () => {
    const { sandbox, calls } = makeSandbox(async (url) => {
      assert.equal(url, '/api/grocery-list/plan-xyz/days');
      return { ok: true, json: async () => ({ success: true, days: ['Monday', 'Tuesday'] }) };
    });
    sandbox.__t.planId = 'plan-xyz';
    await sandbox.__t.refreshAvailableDays();

    assert.deepEqual([...sandbox.__t.availableDays].sort(), ['Monday', 'Tuesday']);
    assert.equal(calls.filter(c => c.name === 'fetch').length, 1);
  });

  test('selectDay() fetches the specific day for the cached planId and renders it, without touching sample data', async () => {
    const { sandbox, calls } = makeSandbox(async (url) => {
      if (url.endsWith('/days')) return { ok: true, json: async () => ({ success: true, days: ['Monday'] }) };
      return { ok: true, json: async () => ({ success: true, groceryList: { categories: { produce: [{ name: 'real kale' }] } } }) };
    });
    sandbox.__t.planId = 'plan-xyz';
    await sandbox.__t.refreshAvailableDays();
    await sandbox.__t.selectDay('Monday');

    assert.equal(sandbox.__t.groceryList.categories.produce[0].name, 'real kale');
    const renderCalls = calls.filter(c => c.name === 'renderGroceryList');
    assert.equal(renderCalls.length, 1);
    const emptyCalls = calls.filter(c => c.name === 'renderEmpty');
    assert.equal(emptyCalls.length, 0);
  });
});

describe('E — no second grocery generation happens when a valid list already exists', () => {
  test('loading a day that is already available never calls /api/generate-grocery-list', async () => {
    const { sandbox, calls } = makeSandbox(async (url) => {
      if (url.endsWith('/days')) return { ok: true, json: async () => ({ success: true, days: ['Monday'] }) };
      return { ok: true, json: async () => ({ success: true, groceryList: { categories: {} } }) };
    });
    sandbox.__t.planId = 'plan-xyz';
    await sandbox.__t.refreshAvailableDays();
    await sandbox.__t.selectDay('Monday');

    const generateCalls = calls.filter(c => c.name === 'fetch' && String(c.args[0]).includes('/api/generate-grocery-list'));
    assert.equal(generateCalls.length, 0);
  });
});

describe('F (frontend) — a stale/invalid planId never renders as if it had real data', () => {
  test('refreshAvailableDays() against a planId with zero saved days leaves availableDays empty after retries — never fabricated', async () => {
    const { sandbox } = makeSandbox(async () => ({ ok: true, json: async () => ({ success: true, days: [] }) }));
    sandbox.__t.planId = 'ghost-plan-id';
    await sandbox.__t.refreshAvailableDays();
    assert.equal(sandbox.__t.availableDays.size, 0);
  });

  test('selectDay() for a day with no available list renders the empty state, not the hardcoded sample list', async () => {
    const { sandbox, calls } = makeSandbox(async () => ({ ok: true, json: async () => ({ success: true, days: [] }) }));
    sandbox.__t.planId = 'ghost-plan-id';
    await sandbox.__t.refreshAvailableDays();
    await sandbox.__t.selectDay('Monday');

    assert.equal(sandbox.__t.groceryList, null);
    assert.equal(calls.filter(c => c.name === 'renderEmpty').length, 1);
    assert.equal(calls.filter(c => c.name === 'renderGroceryList').length, 0);
  });
});

describe('H (frontend) — background grocery generation still in flight is retried, not treated as empty', () => {
  test('refreshAvailableDays() retries when the first response has zero days, and succeeds once the background job finishes', async () => {
    let callCount = 0;
    const { sandbox } = makeSandbox(async () => {
      callCount++;
      // First two calls land before the fire-and-forget grocery generation
      // in /api/generate-meal has finished writing rows; the third lands after.
      if (callCount < 3) return { ok: true, json: async () => ({ success: true, days: [] }) };
      return { ok: true, json: async () => ({ success: true, days: ['Monday'] }) };
    });
    sandbox.__t.planId = 'plan-being-generated';
    await sandbox.__t.refreshAvailableDays();

    assert.equal(callCount, 3);
    assert.deepEqual([...sandbox.__t.availableDays], ['Monday']);
  });
});
