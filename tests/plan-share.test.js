'use strict';

// Regression test for the shared-plan pricing bug: /api/plans/share
// previously whitelisted only the raw AI-guessed `estimatedCost` field
// when persisting a meal into a share link, dropping the authoritative
// pricing.js-computed `cost` field entirely — so the public plan.html
// page could only ever display the unverified AI guess. The route fix
// (server.js POST /api/plans/share) now also whitelists `cost`; this
// test proves the storage layer round-trips it correctly. Uses the REAL
// db.js functions against a local libSQL file, matching the pattern in
// tests/grocery-plan-association.test.js — no mocking, no network.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const TMP_DB = path.join(os.tmpdir(), `mealzy-test-plan-share-${randomUUID()}.db`);
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

describe('share links preserve the authoritative meal.cost field, not just estimatedCost', () => {
  test('a meal saved with both cost and estimatedCost round-trips both fields distinctly', async () => {
    const shareId = randomUUID().slice(0, 8);
    const planId = randomUUID();
    const userId = randomUUID();

    await db.saveShareLink(shareId, planId, userId, {
      plan: {
        meals: [
          { name: 'Grilled salmon', cost: 3.96, estimatedCost: 999.99 },
        ],
      },
      date: '2026-08-22',
      title: 'Test plan',
      sharedAt: new Date().toISOString(),
    });

    const link = await db.getShareLink(shareId);
    assert.ok(link);
    const meal = link.plan.plan.meals[0];
    assert.equal(meal.cost, 3.96, 'authoritative pricing.js cost must survive storage');
    assert.notEqual(meal.cost, meal.estimatedCost, 'cost and estimatedCost must remain distinct fields');
  });

  test('a legacy share link with only estimatedCost (no cost field) still resolves without error', async () => {
    const shareId = randomUUID().slice(0, 8);
    const planId = randomUUID();
    const userId = randomUUID();

    await db.saveShareLink(shareId, planId, userId, {
      plan: { meals: [{ name: 'Old shared meal', estimatedCost: 5.5 }] },
      date: '2026-01-01',
      title: 'Legacy plan',
      sharedAt: new Date().toISOString(),
    });

    const link = await db.getShareLink(shareId);
    const meal = link.plan.plan.meals[0];
    assert.equal(meal.cost, undefined);
    assert.equal(meal.estimatedCost, 5.5);
  });
});
