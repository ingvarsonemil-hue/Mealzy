'use strict';

// Plan-Level Budget Status Truthfulness — proves budgetStatus survives the
// real save/restore round-trip at the storage layer, rather than assuming
// it does merely because it's present in the initial generation response.
// Same real-local-libSQL-file pattern as
// tests/grocery-plan-association.test.js — no mocking, no network.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const TMP_DB = path.join(os.tmpdir(), `mealzy-test-budget-status-${randomUUID()}.db`);
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

describe('H: a plan\'s budgetStatus survives save -> restore', () => {
  test('weeklyTotals.budgetStatus round-trips through savePlan/getPlanById unchanged', async () => {
    const userId = randomUUID();
    const planId = randomUUID();
    const planObj = {
      weekStart: '2026-08-24',
      days: [{ dayName: 'Monday', totalCost: 8, totalUnknownIngredientCount: 1 }],
      weeklyTotals: { totalCost: 56, unknownIngredientCount: 1, budgetStatus: 'estimated_with_unknowns' },
      savedAt: new Date().toISOString(),
    };
    await db.savePlan(planId, userId, planObj);

    const restored = await db.getPlanById(planId, userId);
    assert.equal(restored.weeklyTotals.budgetStatus, 'estimated_with_unknowns');
  });

  test('getRecentPlans also preserves budgetStatus (dashboard/today-plan restoration path)', async () => {
    const userId = randomUUID();
    const planId = randomUUID();
    await db.savePlan(planId, userId, {
      date: '2026-08-24',
      mealPlan: { budgetStatus: 'certified', totalUnknownIngredientCount: 0 },
      savedAt: new Date().toISOString(),
    });

    const recent = await db.getRecentPlans(userId, 10);
    const restored = recent.find(p => p.date === '2026-08-24');
    assert.ok(restored);
    assert.equal(restored.mealPlan.budgetStatus, 'certified');
  });
});

describe('H (also): a grocery list\'s budgetStatus survives save -> restore', () => {
  test('getGroceryListByDay preserves budgetStatus exactly as saved', async () => {
    const userId = randomUUID();
    const planId = randomUUID();
    await db.saveGroceryList(randomUUID(), userId, planId, 'Monday', {
      weekStart: '2026-08-24',
      totalCost: 61,
      unknownIngredientCount: 1,
      budgetStatus: 'over_budget',
      categories: { produce: [], protein: [], dairy: [], grains: [], pantry: [], frozen: [], beverages: [], other: [] },
    });

    const restored = await db.getGroceryListByDay(planId, 'Monday');
    assert.equal(restored.userId, userId);
    assert.equal(restored.budgetStatus, 'over_budget');
  });

  test('a not_enforced (non-USD) grocery list also survives the round-trip', async () => {
    const userId = randomUUID();
    const planId = randomUUID();
    await db.saveGroceryList(randomUUID(), userId, planId, 'Tuesday', {
      budgetStatus: 'not_enforced',
      currency: 'EUR',
      categories: {},
    });

    const restored = await db.getGroceryListByDay(planId, 'Tuesday');
    assert.equal(restored.budgetStatus, 'not_enforced');
  });
});
