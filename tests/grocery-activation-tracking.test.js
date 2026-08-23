'use strict';

// Regression tests for grocery activation instrumentation (grocery_list_viewed,
// grocery_item_checked) added to public/js/groceries-sync.js and
// public/js/groceries-ui.js. Runs the REAL source files (not reimplementations)
// inside a sandboxed VM context, same seam as tests/grocery-list-planid-flow.test.js,
// so the dedup/persistence-gating logic is exercised as actual shipped code.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const SYNC_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'groceries-sync.js'), 'utf8');
const UI_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'groceries-ui.js'), 'utf8');

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

// Permissive stand-in for any DOM element groceries-sync.js/groceries-ui.js
// touch (style/classList writes, addEventListener registration, etc.) — the
// tests under audit don't assert on rendered DOM, only on tracked events and
// network calls, so a real DOM isn't needed.
function makeEl() {
  return {
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {},
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() {},
    focus() {},
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
  };
}

/** Sandbox A: groceries-sync.js in isolation — same pattern as the existing
 * planid-flow test — with render/update functions stubbed so selectDay()'s
 * tracking call can be observed independent of rendering. */
function makeSyncOnlySandbox(fetchImpl) {
  const calls = [];
  const stubFn = (name) => (...args) => { calls.push({ name, args }); };
  const trackCalls = [];
  const sandbox = {
    localStorage: makeLocalStorage(),
    fetch: (...args) => { calls.push({ name: 'fetch', args }); return fetchImpl(...args); },
    document: { getElementById: () => makeEl() },
    console,
    setTimeout: (fn) => { fn(); },
    renderGroceryList: stubFn('renderGroceryList'),
    renderEmpty: stubFn('renderEmpty'),
    renderDaySwitcher: stubFn('renderDaySwitcher'),
    updateProgress: stubFn('updateProgress'),
    showToast: stubFn('showToast'),
    mealzyTrack: (event, data) => trackCalls.push({ event, data }),
    location: { href: '' }, // init() runs unawaited at module load; keeps its redirect no-ops from throwing
  };
  sandbox.window = sandbox;
  const source = SYNC_SOURCE + `
globalThis.__t = {
  get planId() { return planId; }, set planId(v) { planId = v; },
  get weekStart() { return weekStart; }, set weekStart(v) { weekStart = v; },
  get selectedDay() { return selectedDay; }, set selectedDay(v) { selectedDay = v; },
  get availableDays() { return availableDays; },
  get groceryListViewedFired() { return groceryListViewedFired; },
  selectDay, syncItemToServer, refreshAvailableDays,
};
`;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'groceries-sync.js' });
  return { sandbox, calls, trackCalls };
}

/** Sandbox B: groceries-sync.js + groceries-ui.js loaded together, in the same
 * order the real page loads them, with utils.js helpers (normally a separate
 * <script> on the real page) stubbed out — the subject under test is
 * toggleItem()'s unchecked->checked gating and payload shape, not rendering. */
function makeFullPageSandbox(fetchImpl) {
  const calls = [];
  const trackCalls = [];
  const sandbox = {
    localStorage: makeLocalStorage(),
    fetch: (...args) => { calls.push({ name: 'fetch', args }); return fetchImpl(...args); },
    document: {
      getElementById: () => makeEl(),
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    console,
    setTimeout: (fn) => { fn(); },
    mealzyTrack: (event, data) => trackCalls.push({ event, data }),
    // Stand-ins for public/js/utils.js, loaded separately on the real page.
    getHouseholdSize: () => 1,
    getCurrencySymbol: () => '$',
    scaleAmount: (a) => a,
    scaleCost: (c) => (typeof c === 'number' ? c : 0),
    escHtml: (s) => s,
    applyNavTranslations: () => {},
    location: { href: '' }, // init() runs unawaited at module load; keeps its redirect no-ops from throwing
  };
  sandbox.window = sandbox;
  const source = SYNC_SOURCE + '\n' + UI_SOURCE + `
globalThis.__t = {
  get planId() { return planId; }, set planId(v) { planId = v; },
  get selectedDay() { return selectedDay; }, set selectedDay(v) { selectedDay = v; },
  get groceryList() { return groceryList; }, set groceryList(v) { groceryList = v; },
  toggleItem,
};
`;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'groceries-page.js' });
  return { sandbox, calls, trackCalls };
}

describe('grocery_list_viewed — fires once per real list view, never on empty/failed loads', () => {
  test('A: successful render from the server fires exactly one grocery_list_viewed', async () => {
    const { sandbox, trackCalls } = makeSyncOnlySandbox(async (url) => {
      if (url.endsWith('/days')) return { ok: true, json: async () => ({ success: true, days: ['Monday'] }) };
      return { ok: true, json: async () => ({ success: true, groceryList: { categories: { produce: [{ name: 'kale' }] } } }) };
    });
    sandbox.__t.planId = 'plan-1';
    sandbox.__t.weekStart = '2026-08-17';
    await sandbox.__t.refreshAvailableDays();
    await sandbox.__t.selectDay('Monday');

    assert.equal(trackCalls.length, 1);
    assert.equal(trackCalls[0].event, 'grocery_list_viewed');
  });

  test('B: switching days repeatedly during the same visit does not re-fire the view event', async () => {
    const { sandbox, trackCalls } = makeSyncOnlySandbox(async (url) => {
      if (url.endsWith('/days')) return { ok: true, json: async () => ({ success: true, days: ['Monday', 'Tuesday'] }) };
      return { ok: true, json: async () => ({ success: true, groceryList: { categories: { produce: [{ name: 'kale' }] } } }) };
    });
    sandbox.__t.planId = 'plan-1';
    sandbox.__t.weekStart = '2026-08-17';
    await sandbox.__t.refreshAvailableDays();
    await sandbox.__t.selectDay('Monday');
    await sandbox.__t.selectDay('Tuesday');
    await sandbox.__t.selectDay('Monday');

    assert.equal(trackCalls.filter(c => c.event === 'grocery_list_viewed').length, 1);
  });

  test('C: a failed/empty load (no list for the day) fires zero view events', async () => {
    const { sandbox, trackCalls } = makeSyncOnlySandbox(async () => ({ ok: true, json: async () => ({ success: true, days: [] }) }));
    sandbox.__t.planId = 'ghost-plan';
    sandbox.__t.weekStart = '2026-08-17';
    await sandbox.__t.refreshAvailableDays();
    await sandbox.__t.selectDay('Monday');

    assert.equal(trackCalls.filter(c => c.event === 'grocery_list_viewed').length, 0);
    assert.equal(sandbox.__t.groceryListViewedFired, false);
  });

  test('D: a network error on the day fetch fires zero view events', async () => {
    const { sandbox, trackCalls } = makeSyncOnlySandbox(async (url) => {
      if (url.endsWith('/days')) return { ok: true, json: async () => ({ success: true, days: ['Monday'] }) };
      throw new Error('offline');
    });
    sandbox.__t.planId = 'plan-1';
    sandbox.__t.weekStart = '2026-08-17';
    await sandbox.__t.refreshAvailableDays();
    await sandbox.__t.selectDay('Monday');

    assert.equal(trackCalls.filter(c => c.event === 'grocery_list_viewed').length, 0);
  });

  test('E: view payload carries no identifiers or grocery content', async () => {
    const { sandbox, trackCalls } = makeSyncOnlySandbox(async (url) => {
      if (url.endsWith('/days')) return { ok: true, json: async () => ({ success: true, days: ['Monday'] }) };
      return { ok: true, json: async () => ({ success: true, groceryList: { categories: { produce: [{ name: 'kale', cost: 3.5 }] } } }) };
    });
    sandbox.__t.planId = 'plan-1';
    sandbox.__t.weekStart = '2026-08-17';
    await sandbox.__t.refreshAvailableDays();
    await sandbox.__t.selectDay('Monday');

    // deepStrictEqual would fail here on prototype identity alone (the VM
    // sandbox is a separate realm from this test file) — compare by shape.
    assert.deepEqual(Object.keys(trackCalls[0].data), []);
  });
});

describe('syncItemToServer — the persistence gate a success callback runs behind', () => {
  test('F: onSuccess runs only after a 2xx PATCH response', async () => {
    const { sandbox } = makeSyncOnlySandbox(async () => ({ ok: true, json: async () => ({ success: true }) }));
    sandbox.__t.planId = 'plan-1';
    sandbox.__t.selectedDay = 'Monday';
    let fired = 0;
    await new Promise((resolve) => {
      sandbox.__t.syncItemToServer('produce', 'item-1', { checked: true }, () => { fired++; resolve(); });
    });
    assert.equal(fired, 1);
  });

  test('G: onSuccess never runs when the server rejects the PATCH', async () => {
    const { sandbox } = makeSyncOnlySandbox(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    sandbox.__t.planId = 'plan-1';
    sandbox.__t.selectedDay = 'Monday';
    let fired = 0;
    await new Promise((resolve) => {
      sandbox.__t.syncItemToServer('produce', 'item-1', { checked: true }, () => { fired++; });
      setTimeout(resolve, 0);
    });
    assert.equal(fired, 0);
  });

  test('H: onSuccess never runs when the PATCH throws (offline)', async () => {
    const { sandbox } = makeSyncOnlySandbox(async () => { throw new Error('offline'); });
    sandbox.__t.planId = 'plan-1';
    sandbox.__t.selectedDay = 'Monday';
    let fired = 0;
    await new Promise((resolve) => {
      sandbox.__t.syncItemToServer('produce', 'item-1', { checked: true }, () => { fired++; });
      setTimeout(resolve, 0);
    });
    assert.equal(fired, 0);
  });
});

describe('grocery_item_checked — only the unchecked -> checked transition, only on confirmed persistence', () => {
  function fixtureList() {
    return {
      weekStart: '2026-08-17',
      categories: {
        produce: [{ id: 'item-1', name: 'Apples', amount: '2', cost: 3, checked: false }],
        protein: [], dairy: [], grains: [], pantry: [], frozen: [], beverages: [], other: [],
      },
    };
  }

  test('I: unchecked -> checked with a successful PATCH fires exactly one grocery_item_checked', async () => {
    const { sandbox, trackCalls } = makeFullPageSandbox(async () => ({ ok: true, json: async () => ({ success: true }) }));
    sandbox.__t.planId = 'plan-1';
    sandbox.__t.selectedDay = 'Monday';
    sandbox.__t.groceryList = fixtureList();

    sandbox.__t.toggleItem('produce', 'item-1', true);
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(trackCalls.filter(c => c.event === 'grocery_item_checked').length, 1);
  });

  test('J: checked -> unchecked fires zero grocery_item_checked', async () => {
    const { sandbox, trackCalls } = makeFullPageSandbox(async () => ({ ok: true, json: async () => ({ success: true }) }));
    sandbox.__t.planId = 'plan-1';
    sandbox.__t.selectedDay = 'Monday';
    const list = fixtureList();
    list.categories.produce[0].checked = true;
    sandbox.__t.groceryList = list;

    sandbox.__t.toggleItem('produce', 'item-1', false);
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(trackCalls.filter(c => c.event === 'grocery_item_checked').length, 0);
  });

  test('K: unchecked -> checked but the PATCH fails fires zero grocery_item_checked', async () => {
    const { sandbox, trackCalls } = makeFullPageSandbox(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    sandbox.__t.planId = 'plan-1';
    sandbox.__t.selectedDay = 'Monday';
    sandbox.__t.groceryList = fixtureList();

    sandbox.__t.toggleItem('produce', 'item-1', true);
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(trackCalls.filter(c => c.event === 'grocery_item_checked').length, 0);
  });

  test('L: checked payload carries no ingredient identity, cost, or budget data', async () => {
    const { sandbox, trackCalls } = makeFullPageSandbox(async () => ({ ok: true, json: async () => ({ success: true }) }));
    sandbox.__t.planId = 'plan-1';
    sandbox.__t.selectedDay = 'Monday';
    sandbox.__t.groceryList = fixtureList();

    sandbox.__t.toggleItem('produce', 'item-1', true);
    await new Promise((r) => setTimeout(r, 0));

    const evt = trackCalls.find(c => c.event === 'grocery_item_checked');
    assert.ok(evt, 'event should have fired');
    assert.deepEqual(Object.keys(evt.data), []);
    const serialized = JSON.stringify(evt.data);
    assert.ok(!serialized.includes('Apples'));
    assert.ok(!serialized.includes('item-1'));
  });
});
