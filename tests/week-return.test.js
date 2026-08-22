'use strict';

// Regression tests for the data layer underneath week_return retention
// tracking (server.js getPreviousPlanWeekKey / maybeLogWeekReturn): proves
// db.getLastPlanCreatedAt behaves correctly for a user with no plans yet
// (must return null -> no week_return on someone's first-ever plan) and
// for a user with multiple saved plans (must return the MOST RECENT one).
// Real db.js against a local libSQL file, same pattern as
// tests/grocery-plan-association.test.js — no mocking, no network.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const TMP_DB = path.join(os.tmpdir(), `mealzy-test-week-return-${randomUUID()}.db`);
process.env.TURSO_DATABASE_URL = `file:${TMP_DB}`;
delete process.env.TURSO_AUTH_TOKEN;

const db = require('../db.js');
const { getISOWeekKey } = require('../weekKey.js');

before(async () => {
  await db.initDb();
});

after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TMP_DB + suffix); } catch (e) { /* already gone */ }
  }
});

describe('getLastPlanCreatedAt underpins week_return\'s "first-ever plan" and "most recent" checks', () => {
  test('a user with no saved plans yet gets no row — this is what keeps week_return silent on a first plan', async () => {
    const userId = randomUUID();
    const row = await db.getLastPlanCreatedAt(userId);
    assert.ok(!row, 'no plans saved yet -> no row -> not a "return"');
  });

  test('a user with one saved plan gets that plan\'s created_at', async () => {
    const userId = randomUUID();
    await db.savePlan(randomUUID(), userId, { date: '2026-08-17' });
    const row = await db.getLastPlanCreatedAt(userId);
    assert.ok(row?.created_at);
  });

  test('a user with several saved plans gets the MOST RECENT one, not the first', async () => {
    const userId = randomUUID();
    await db.savePlan(randomUUID(), userId, { date: '2026-08-01' });
    // created_at is a DB-assigned timestamp column (CURRENT_TIMESTAMP), so
    // insertion order determines recency here — this mirrors how
    // getPreviousPlanWeekKey is always called before the new plan's insert.
    await new Promise((resolve) => setTimeout(resolve, 1100)); // ensure a distinct second-resolution timestamp
    const secondPlanId = randomUUID();
    await db.savePlan(secondPlanId, userId, { date: '2026-08-08' });

    const lastRow = await db.getLastPlanCreatedAt(userId);
    const allPlans = await db.all('SELECT id, created_at FROM plans WHERE user_id = ? ORDER BY created_at ASC', [userId]);
    assert.equal(allPlans.length, 2);
    assert.equal(lastRow.created_at, allPlans[1].created_at, 'must reflect the later of the two inserts');
  });

  test('two plans saved in the same ISO week produce the same week key (no duplicate week_return)', () => {
    const monday = getISOWeekKey(new Date('2026-08-17T00:00:00'));
    const friday = getISOWeekKey(new Date('2026-08-21T00:00:00'));
    assert.equal(monday, friday);
  });

  test('plans a week apart produce different week keys (a real week_return)', () => {
    const week1 = getISOWeekKey(new Date('2026-08-17T00:00:00'));
    const week2 = getISOWeekKey(new Date('2026-08-24T00:00:00'));
    assert.notEqual(week1, week2);
  });
});
