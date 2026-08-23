'use strict';

// Regression tests for the "restore today's plan when generation is blocked"
// fix. Root cause: /api/generate-meal's 409 already_generated_today response
// only carried a human-readable message — never the plan trial_generations
// already points at (alreadyToday.plan_id) — so a blocked user with a real
// saved plan had no way back to it. The fix adds db.getPlanById() and wires
// it into that 409 response (see server.js's alreadyToday branch).
//
// Real db.js against a local libSQL file, same pattern as
// tests/week-return.test.js — no mocking, no network.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const TMP_DB = path.join(os.tmpdir(), `mealzy-test-plan-recovery-${randomUUID()}.db`);
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

describe('getPlanById — the lookup the 409 recovery response depends on', () => {
  test('A: a plan saved earlier today can be fetched back by its id', async () => {
    const userId = randomUUID();
    const planId = randomUUID();
    await db.savePlan(planId, userId, { date: '2026-08-23', plan: { meals: [{ name: 'Oatmeal' }] }, savedAt: '2026-08-23T08:00:00.000Z' });

    const found = await db.getPlanById(planId, userId);
    assert.ok(found, 'plan must be found by id');
    assert.equal(found.date, '2026-08-23');
    assert.deepEqual(found.plan.meals, [{ name: 'Oatmeal' }]);
  });

  test('a plan id that was never saved returns null, not a throw', async () => {
    const userId = randomUUID();
    const found = await db.getPlanById(randomUUID(), userId);
    assert.equal(found, null);
  });

  test('is scoped to userId — cannot read another user\'s plan by guessing its id', async () => {
    const ownerId = randomUUID();
    const attackerId = randomUUID();
    const planId = randomUUID();
    await db.savePlan(planId, ownerId, { date: '2026-08-23', plan: { meals: [] } });

    const asOwner = await db.getPlanById(planId, ownerId);
    const asAttacker = await db.getPlanById(planId, attackerId);
    assert.ok(asOwner);
    assert.equal(asAttacker, null);
  });
});

describe('B/C: the full blocked-generation recovery chain the server route relies on', () => {
  test('recordTrialGeneration -> getTrialGenerationByDate -> getPlanById recovers the exact plan that generation produced', async () => {
    const userId = randomUUID();
    const localDate = '2026-08-23';
    const planId = randomUUID();

    // Mirrors server.js's real order after this fix: save the plan, THEN
    // record the trial generation that blocks a second one today.
    await db.savePlan(planId, userId, { date: localDate, plan: { meals: [{ name: 'Grilled Chicken Bowl' }] }, savedAt: '2026-08-23T08:00:00.000Z' });
    await db.recordTrialGeneration(userId, localDate, planId);

    // Simulates the second generate-meal call the same day, blocked at 409.
    const alreadyToday = await db.getTrialGenerationByDate(userId, localDate);
    assert.ok(alreadyToday, 'quota record must exist — this is what triggers the 409');
    assert.equal(alreadyToday.plan_id, planId);

    const recovered = await db.getPlanById(alreadyToday.plan_id, userId);
    assert.ok(recovered, 'the blocked user must be able to recover the plan behind the quota record');
    assert.deepEqual(recovered.plan.meals, [{ name: 'Grilled Chicken Bowl' }]);
  });
});

describe('F/H: quota can no longer outlive a failed plan save', () => {
  test('a quota record with no matching plan (simulating the pre-fix ordering, or any future save failure) recovers null, not a crash — server must fall back to the honest limit message', async () => {
    const userId = randomUUID();
    const localDate = '2026-08-23';
    const ghostPlanId = randomUUID(); // recorded, but savePlan() never actually ran for it

    await db.recordTrialGeneration(userId, localDate, ghostPlanId);

    const alreadyToday = await db.getTrialGenerationByDate(userId, localDate);
    const recovered = await db.getPlanById(alreadyToday.plan_id, userId);
    assert.equal(recovered, null, 'no plan exists — recovery must report that truthfully, never fabricate one');
  });

  test('G: a second recordTrialGeneration for the same user/day is rejected (PRIMARY KEY), so recovery can never grant a second generation by re-recording', async () => {
    const userId = randomUUID();
    const localDate = '2026-08-23';
    await db.recordTrialGeneration(userId, localDate, randomUUID());
    await assert.rejects(
      () => db.recordTrialGeneration(userId, localDate, randomUUID()),
      /UNIQUE|PRIMARY KEY|constraint/i
    );
  });
});
