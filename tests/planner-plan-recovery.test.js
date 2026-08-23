'use strict';

// Runs the REAL public/js/planner/planner-api.js source (not a reimplementation)
// in a sandboxed VM with a stub localStorage/fetch, exercising the new
// fetchServerPlanIfNeeded() fallback added to fix meal-planner.html having no
// restoration path at all when localStorage.mealzy_meal_plans is empty/stale
// but a plan already exists server-side (GET /api/plans). Same VM pattern as
// tests/grocery-list-planid-flow.test.js.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'planner', 'planner-api.js'), 'utf8');

function makeLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

function makeSandbox(fetchImpl, initialLocalStorage) {
  const calls = [];
  const sandbox = {
    localStorage: makeLocalStorage(initialLocalStorage),
    fetch: (...args) => { calls.push({ name: 'fetch', args }); return fetchImpl(...args); },
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'planner-api.js' });
  return { sandbox, calls };
}

describe('meal-planner day view can now recover a plan the server has but localStorage does not', () => {
  test('fetchServerPlanIfNeeded() hydrates mealzy_meal_plans from GET /api/plans (single-day shape) and returns today\'s meals', async () => {
    const { sandbox } = makeSandbox(async (url) => {
      assert.equal(url, '/api/plans');
      return {
        ok: true,
        json: async () => ({
          success: true,
          plans: [{ date: '2026-08-23', plan: { meals: [{ name: 'Salmon Bowl' }] }, savedAt: '2026-08-23T08:00:00.000Z' }],
        }),
      };
    });

    const meals = await sandbox.window.PlannerAPI.fetchServerPlanIfNeeded('2026-08-23');
    assert.deepEqual(meals, [{ name: 'Salmon Bowl' }]);

    const cached = JSON.parse(sandbox.localStorage.getItem('mealzy_meal_plans'));
    assert.deepEqual(cached['2026-08-23'].meals, [{ name: 'Salmon Bowl' }]);
  });

  test('fetchServerPlanIfNeeded() hydrates from a week-shaped plan (Pro) and returns the requested day only', async () => {
    const { sandbox } = makeSandbox(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        plans: [{
          weekStart: '2026-08-17',
          savedAt: '2026-08-17T08:00:00.000Z',
          days: [
            { date: '2026-08-17', meals: [{ name: 'Monday Meal' }] },
            { date: '2026-08-18', meals: [{ name: 'Tuesday Meal' }] },
          ],
        }],
      }),
    }));

    const meals = await sandbox.window.PlannerAPI.fetchServerPlanIfNeeded('2026-08-18');
    assert.deepEqual(meals, [{ name: 'Tuesday Meal' }]);
  });

  test('returns null (never throws) when the server has no saved plan — day view falls back to its normal empty state', async () => {
    const { sandbox } = makeSandbox(async () => ({ ok: true, json: async () => ({ success: true, plans: [] }) }));
    const meals = await sandbox.window.PlannerAPI.fetchServerPlanIfNeeded('2026-08-23');
    assert.equal(meals, null);
  });

  test('returns null when the request fails outright (offline) instead of throwing', async () => {
    const { sandbox } = makeSandbox(async () => { throw new Error('network down'); });
    const meals = await sandbox.window.PlannerAPI.fetchServerPlanIfNeeded('2026-08-23');
    assert.equal(meals, null);
  });

  test('getDayMeals() still reads the localStorage cache first — the server fallback never causes an extra fetch when the cache already has today\'s plan', () => {
    const initial = { mealzy_meal_plans: JSON.stringify({ '2026-08-23': { meals: [{ name: 'Cached Meal' }] } }) };
    const { sandbox, calls } = makeSandbox(async () => { throw new Error('must not be called'); }, initial);
    const meals = sandbox.window.PlannerAPI.getDayMeals('2026-08-23');
    // Cross-realm (vm context) objects fail node's deepStrictEqual identity
    // check even with identical shape — compare via JSON like the other
    // assertions above effectively do through structuredClone-free access.
    assert.equal(JSON.stringify(meals), JSON.stringify([{ name: 'Cached Meal' }]));
    assert.equal(calls.length, 0, 'no network call when the local cache already has the day');
  });
});
