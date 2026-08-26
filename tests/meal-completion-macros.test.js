'use strict';

// Regression tests for Issue A (meal-completion macros): checking a meal off
// on the Dashboard must update "consumed" macros live, uncheck must reverse
// it, state must persist across reload, and Meal Planner's separate "planned"
// totals bar (labeled against the day's budget/goal, not against completion)
// must stay untouched.
//
// Root cause found: dashboard-today.js already computed consumed-vs-planned
// macros correctly in updateStats() (summing only `m.completed` meals), but
// (1) renderMeals() never rendered a checkbox to call toggleMealDone(), so
// there was no way to check a meal off at all, and (2) loadTodayData() forced
// `completed: false` on every load, discarding whatever had been saved.
//
// No DOM test harness exists in this repo (see tests/dashboard-pro-status.test.js
// for precedent) — the real functions are extracted and run via Node's vm
// module against a minimal fake DOM.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TODAY_JS_PATH = path.join(__dirname, '..', 'public', 'js', 'dashboard-today.js');
const TODAY_SRC = fs.readFileSync(TODAY_JS_PATH, 'utf8');

const PLANNER_RENDER_PATH = path.join(__dirname, '..', 'public', 'js', 'planner', 'planner-render.js');
const PLANNER_RENDER_SRC = fs.readFileSync(PLANNER_RENDER_PATH, 'utf8');

const DASHBOARD_HTML_PATH = path.join(__dirname, '..', 'public', 'dashboard.html');
const DASHBOARD_HTML_SRC = fs.readFileSync(DASHBOARD_HTML_PATH, 'utf8');

function extractFn(src, name) {
  const startIdx = src.indexOf(`function ${name}(`);
  assert.notEqual(startIdx, -1, `expected to find function ${name} in source`);
  const endIdx = src.indexOf('\n}\n', startIdx);
  assert.notEqual(endIdx, -1, `expected to find the closing brace for ${name}`);
  return src.slice(startIdx, endIdx + 2);
}

const UPDATE_STATS_SRC = extractFn(TODAY_SRC, 'updateStats');
const UPDATE_RING_SRC = extractFn(TODAY_SRC, 'updateRing');
const TOGGLE_MEAL_DONE_SRC = extractFn(TODAY_SRC, 'toggleMealDone');

/** Minimal fake DOM: getElementById lazily creates a persistent element with
 * {style, textContent}; querySelector does the same keyed by selector. */
function makeFakeDocument() {
  const byId = new Map();
  const bySelector = new Map();
  const makeEl = () => ({ style: {}, textContent: '' });
  return {
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, makeEl());
      return byId.get(id);
    },
    querySelector(sel) {
      if (!bySelector.has(sel)) bySelector.set(sel, makeEl());
      return bySelector.get(sel);
    },
  };
}

function runScenario({ todayMeals, profile, priorRenders = 0 }) {
  const store = {};
  const toasts = [];
  const context = {
    todayMeals,
    profile,
    today: '2026-08-26',
    document: makeFakeDocument(),
    localStorage: {
      getItem(key) { return key in store ? store[key] : null; },
      setItem(key, val) { store[key] = val; },
    },
    JSON,
    Math,
    console,
    // Stubs — renderMeals()'s HTML output isn't under test here, and
    // showToast has no DOM to attach to in this harness.
    renderMeals() {},
    showToast(msg) { toasts.push(msg); },
  };
  vm.createContext(context);
  vm.runInContext(
    `${UPDATE_RING_SRC}\n${UPDATE_STATS_SRC}\n${TOGGLE_MEAL_DONE_SRC}`,
    context,
    { filename: 'dashboard-today.js-mealCompletion' }
  );
  // Run updateStats() `priorRenders` extra times first, to prove idempotency.
  for (let i = 0; i < priorRenders; i++) vm.runInContext('updateStats();', context);
  vm.runInContext('updateStats();', context);
  return { context, toasts, statText: () => context.document.getElementById('statCalories').textContent };
}

const PROFILE = { dailyCalories: 2000, macros: { protein: 150, carbs: 200, fat: 67 } };
const BREAKFAST = { name: 'Breakfast', calories: 500, protein: 30, carbs: 50, fat: 20, completed: false };
const LUNCH = { name: 'Lunch', calories: 700, protein: 40, carbs: 70, fat: 25, completed: false };

describe('A: no checked meals -> zero consumed macros', () => {
  test('all unchecked renders 0 across the board', () => {
    const meals = [ { ...BREAKFAST }, { ...LUNCH } ];
    const { context } = runScenario({ todayMeals: meals, profile: PROFILE });
    const d = context.document;
    assert.equal(d.getElementById('statCalories').textContent, 0);
    assert.equal(d.getElementById('statProtein').textContent, '0g');
    assert.equal(d.getElementById('statMealsDone').textContent, '0/2');
  });
});

describe('B: one checked meal -> only that meal contributes', () => {
  test('checking breakfast only counts breakfast', () => {
    const meals = [ { ...BREAKFAST, completed: true }, { ...LUNCH } ];
    const { context } = runScenario({ todayMeals: meals, profile: PROFILE });
    const d = context.document;
    assert.equal(d.getElementById('statCalories').textContent, 500);
    assert.equal(d.getElementById('statProtein').textContent, '30g');
    assert.equal(d.getElementById('statMealsDone').textContent, '1/2');
  });
});

describe('C: multiple checked meals sum correctly', () => {
  test('breakfast + lunch checked sums to the example in the spec', () => {
    const meals = [ { ...BREAKFAST, completed: true }, { ...LUNCH, completed: true } ];
    const { context } = runScenario({ todayMeals: meals, profile: PROFILE });
    const d = context.document;
    assert.equal(d.getElementById('statCalories').textContent, 1200);
    assert.equal(d.getElementById('statProtein').textContent, '70g');
    assert.equal(d.getElementById('statMealsDone').textContent, '2/2');
  });
});

describe('D: toggleMealDone — check/uncheck updates and reverses macros live, no double counting', () => {
  test('checking then unchecking breakfast returns totals to lunch-only', () => {
    const meals = [ { ...BREAKFAST }, { ...LUNCH, completed: true } ];
    const store = {};
    const context = {
      todayMeals: meals,
      profile: PROFILE,
      today: '2026-08-26',
      document: makeFakeDocument(),
      localStorage: {
        getItem(key) { return key in store ? store[key] : null; },
        setItem(key, val) { store[key] = val; },
      },
      JSON, Math, console,
      renderMeals() {},
      showToast() {},
    };
    store.mealzy_meal_plans = JSON.stringify({ '2026-08-26': { meals } });
    vm.createContext(context);
    vm.runInContext(`${UPDATE_RING_SRC}\n${UPDATE_STATS_SRC}\n${TOGGLE_MEAL_DONE_SRC}`, context);

    // Check breakfast (index 0) — totals should add to both meals.
    vm.runInContext('toggleMealDone(0, true);', context);
    assert.equal(context.document.getElementById('statCalories').textContent, 1200);
    assert.equal(context.todayMeals[0].completed, true);

    // Uncheck breakfast — totals must fall back to lunch-only (700), not stay at 1200.
    vm.runInContext('toggleMealDone(0, false);', context);
    assert.equal(context.document.getElementById('statCalories').textContent, 700);
    assert.equal(context.todayMeals[0].completed, false);
  });

  test('checked is a boolean flag, not an incrementing counter — toggling the same meal true twice does not double its contribution', () => {
    const meals = [ { ...BREAKFAST } ];
    const store = { mealzy_meal_plans: JSON.stringify({ '2026-08-26': { meals: [{ ...BREAKFAST }] } }) };
    const context = {
      todayMeals: meals, profile: PROFILE, today: '2026-08-26',
      document: makeFakeDocument(),
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
      JSON, Math, console, renderMeals() {}, showToast() {},
    };
    vm.createContext(context);
    vm.runInContext(`${UPDATE_RING_SRC}\n${UPDATE_STATS_SRC}\n${TOGGLE_MEAL_DONE_SRC}`, context);
    vm.runInContext('toggleMealDone(0, true);', context);
    vm.runInContext('toggleMealDone(0, true);', context);
    assert.equal(context.document.getElementById('statCalories').textContent, 500, 'still just the one meal\'s 500 kcal, not 1000');
  });
});

describe('E: repeated re-renders (updateStats called multiple times) do not double-count', () => {
  test('calling updateStats() 5 extra times before asserting yields the same totals as calling it once', () => {
    const meals = [ { ...BREAKFAST, completed: true }, { ...LUNCH, completed: true } ];
    const { context } = runScenario({ todayMeals: meals, profile: PROFILE, priorRenders: 5 });
    assert.equal(context.document.getElementById('statCalories').textContent, 1200);
    assert.equal(context.document.getElementById('statProtein').textContent, '70g');
  });
});

describe('F: persistence — reload must not silently reset completed state', () => {
  test('loadTodayData() preserves each meal\'s saved `completed` flag instead of forcing false', () => {
    assert.match(
      TODAY_SRC,
      /todayMeals = plans\[today\]\.meals\.map\(m => \(\{ \.\.\.m, completed: !!m\.completed \}\)\);/,
      'loadTodayData must map completed to !!m.completed (preserve), not hardcode false'
    );
    assert.doesNotMatch(
      TODAY_SRC.split('async function loadTodayData')[1].split('async function fetchActivePlanIfNeeded')[0],
      /completed:\s*false/,
      'loadTodayData\'s meal-restore path must not force completed:false — that discards saved state on every reload'
    );
  });

  test('toggleMealDone persists the completed flag into localStorage.mealzy_meal_plans so it survives navigation/reload', () => {
    assert.match(TOGGLE_MEAL_DONE_SRC, /localStorage\.setItem\('mealzy_meal_plans'/);
  });
});

describe('G: a meal with missing optional macro fields fails safely (no NaN, no crash)', () => {
  test('undefined protein/carbs/fat are treated as 0, not NaN', () => {
    const meals = [ { name: 'Mystery meal', calories: 300, completed: true } ]; // no protein/carbs/fat
    const { context } = runScenario({ todayMeals: meals, profile: PROFILE });
    const d = context.document;
    assert.equal(d.getElementById('statCalories').textContent, 300);
    assert.equal(d.getElementById('statProtein').textContent, '0g');
    assert.notEqual(d.getElementById('statProtein').textContent, 'NaNg');
  });
});

describe('H: Meal Planner\'s planned-totals bar is untouched by completion state', () => {
  test('renderStats() sums ALL meals regardless of `completed` — it is a planned-vs-goal widget, not a consumption tracker', () => {
    const renderStatsSrc = PLANNER_RENDER_SRC.slice(
      PLANNER_RENDER_SRC.indexOf('function renderStats'),
      PLANNER_RENDER_SRC.indexOf('return { renderDay, renderStats };')
    );
    assert.doesNotMatch(renderStatsSrc, /\.completed/, 'the planner stats bar must keep summing every planned meal, not filter by completed');
    assert.match(renderStatsSrc, /meals\.reduce\(\(s, m\) => s \+ \(m\.calories \|\| 0\), 0\)/);
  });
});

describe('I: grocery totals are unaffected by meal completion', () => {
  test('toggleMealDone/updateStats never touch grocery-related storage keys or endpoints', () => {
    const combined = `${TOGGLE_MEAL_DONE_SRC}\n${UPDATE_STATS_SRC}`;
    assert.doesNotMatch(combined, /grocery/i);
  });
});

describe('J: Budget Engine is unaffected by meal completion', () => {
  test('toggleMealDone/updateStats never reference budget engine state or endpoints', () => {
    const combined = `${TOGGLE_MEAL_DONE_SRC}\n${UPDATE_STATS_SRC}`;
    assert.doesNotMatch(combined, /budget/i);
  });
});

describe('UI: the Dashboard actually renders a control that calls toggleMealDone', () => {
  test('renderMeals() emits a checkbox wired to toggleMealDone (previously missing entirely)', () => {
    assert.match(TODAY_SRC, /onchange="toggleMealDone\(\$\{i\}, this\.checked\)"/);
  });

  test('dashboard.html loads the file that defines getSampleMeals before dashboard-actions.js needs it', () => {
    const sampleIdx = DASHBOARD_HTML_SRC.indexOf('dashboard-sample-meals.js');
    const actionsIdx = DASHBOARD_HTML_SRC.indexOf('dashboard-actions.js');
    assert.notEqual(sampleIdx, -1);
    assert.ok(sampleIdx < actionsIdx);
  });
});
