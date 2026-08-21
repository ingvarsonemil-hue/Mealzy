'use strict';

// Regression tests for the grocery-list planId flow fix (see server.js
// /api/generate-meal and public/js/groceries-sync.js). These exercise the
// REAL db.js persistence functions against a local libSQL file — no mocking,
// no network, no Turso credentials, no paid Anthropic calls — proving the
// plan_id <-> grocery_lists relationship actually works end-to-end at the
// storage layer that both the fixed /api/generate-meal background job and
// grocery-list.html's fetches rely on.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

// Lives in the OS temp dir, not the repo, so a locked file that survives the
// cleanup below (libsql keeps no exposed close() to force it) never lingers
// as an untracked file in the working tree.
const TMP_DB = path.join(os.tmpdir(), `mealzy-test-grocery-plan-${randomUUID()}.db`);
process.env.TURSO_DATABASE_URL = `file:${TMP_DB}`;
delete process.env.TURSO_AUTH_TOKEN;

const db = require('../db.js');

before(async () => {
  await db.initDb();
});

after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TMP_DB + suffix); } catch (e) { /* already gone */ }
  }
});

describe('B — grocery list generated for a plan is associated with that exact plan', () => {
  test('getGroceryListsForPlan(planId) returns only rows saved under that planId', async () => {
    const userId = randomUUID();
    const planA = randomUUID();
    const planB = randomUUID();

    await db.savePlan(planA, userId, { weekStart: '2026-08-17', savedAt: new Date().toISOString() });
    await db.savePlan(planB, userId, { weekStart: '2026-08-17', savedAt: new Date().toISOString() });

    await db.saveGroceryList(randomUUID(), userId, planA, 'Monday', { categories: { produce: [{ name: 'kale' }] } });
    await db.saveGroceryList(randomUUID(), userId, planA, 'Tuesday', { categories: { produce: [{ name: 'spinach' }] } });
    await db.saveGroceryList(randomUUID(), userId, planB, 'Monday', { categories: { produce: [{ name: 'unrelated-plan-produce' }] } });

    const rowsForA = await db.getGroceryListsForPlan(planA);
    assert.equal(rowsForA.length, 2);
    assert.deepEqual(rowsForA.map(r => r.day).sort(), ['Monday', 'Tuesday']);
    assert.ok(rowsForA.every(r => r.userId === userId));
    // Plan B's grocery data must never leak into plan A's result — this is the
    // "unrelated grocery data" failure mode the bug report described.
    assert.ok(!JSON.stringify(rowsForA).includes('unrelated-plan-produce'));
  });

  test('getGroceryListByDay(planId, day) fetches the exact day saved under that plan', async () => {
    const userId = randomUUID();
    const planId = randomUUID();
    await db.savePlan(planId, userId, { date: '2026-08-21' });
    await db.saveGroceryList(randomUUID(), userId, planId, 'Friday', { categories: { protein: [{ name: 'chicken breast' }] } });

    const result = await db.getGroceryListByDay(planId, 'Friday');
    assert.ok(result);
    assert.equal(result.userId, userId);
    assert.equal(result.day, 'Friday');
    assert.equal(result.categories.protein[0].name, 'chicken breast');
  });
});

describe('F — an invalid/nonexistent planId never resolves to real or fake data', () => {
  test('getGroceryListsForPlan on a planId that was never saved returns an empty array, not an error or stray rows', async () => {
    const rows = await db.getGroceryListsForPlan(randomUUID());
    assert.deepEqual(rows, []);
  });

  test('getGroceryListByDay on a planId that was never saved returns null', async () => {
    const result = await db.getGroceryListByDay(randomUUID(), 'Monday');
    assert.equal(result, null);
  });

  test('getGroceryListByDay for a real plan but wrong day returns null, not another day\'s list', async () => {
    const userId = randomUUID();
    const planId = randomUUID();
    await db.savePlan(planId, userId, { date: '2026-08-21' });
    await db.saveGroceryList(randomUUID(), userId, planId, 'Monday', { categories: {} });

    const result = await db.getGroceryListByDay(planId, 'Sunday');
    assert.equal(result, null);
  });
});

describe('G — existing saved plans/grocery lists (pre-fix) remain readable', () => {
  test('a plan saved before this fix (no accompanying grocery rows yet) is still returned by getRecentPlans', async () => {
    const userId = randomUUID();
    const legacyPlanId = randomUUID();
    // Simulates a plan generated under the OLD code path where the frontend
    // never learned the planId, so grocery_lists rows exist server-side but
    // nothing ties them to the user's browser state — the plan row itself
    // must remain intact and readable regardless.
    await db.savePlan(legacyPlanId, userId, { date: '2026-07-01', plan: { meals: [{ name: 'Old plan meal' }] } });

    const recent = await db.getRecentPlans(userId, 10);
    assert.ok(recent.some(p => p.date === '2026-07-01'));
  });
});

describe('H — grocery-list generation failure never removes or corrupts the meal plan', () => {
  test('a plan persists via savePlan even when no grocery list is ever saved for it (simulates a failed background job)', async () => {
    const userId = randomUUID();
    const planId = randomUUID();
    await db.savePlan(planId, userId, { date: '2026-08-21', plan: { meals: [{ name: 'Grilled salmon' }] } });
    // Deliberately never call saveGroceryList — mirrors the fire-and-forget
    // grocery generation throwing/failing after the plan response already sent.

    const recent = await db.getRecentPlans(userId, 10);
    assert.ok(recent.some(p => p.date === '2026-08-21'));

    const groceryRows = await db.getGroceryListsForPlan(planId);
    assert.deepEqual(groceryRows, [], 'no grocery rows yet — this is the pending/failed state the frontend retry logic must tolerate without showing fake data');
  });
});
