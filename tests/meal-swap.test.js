'use strict';

/**
 * Mealzy Mobile — meal swap: alternatives endpoint + atomic swap-commit.
 *
 * Coverage:
 *   - Free-tier request to either endpoint is rejected (Pro-gate re-derived
 *     from DB, never trusting the client).
 *   - Pro-tier alternatives request succeeds, respects dietary/allergy
 *     constraints (asserted on the actual prompt sent to the stubbed
 *     Anthropic client), and forces each alternative's type to the
 *     requested slot regardless of what the model returns.
 *   - Pro-tier commit succeeds, updates both swappedSlots and the meal
 *     content atomically, and recomputes the day's totals.
 *   - A second commit attempt on an already-swapped slot is rejected (409),
 *     never silently overwriting.
 *   - Concurrency: two near-simultaneous commit attempts on the same slot —
 *     real HTTP requests against a real temp libSQL file, not simulated —
 *     confirm exactly one succeeds and the DB ends up consistent.
 *
 * Real Express app + real temp libSQL. Anthropic fully stubbed. No network,
 * no production Turso, no money.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');

const TMP_DB = path.join(os.tmpdir(), `mealzy-test-swap-${randomUUID()}.db`);
process.env.TURSO_DATABASE_URL = `file:${TMP_DB}`;
delete process.env.TURSO_AUTH_TOKEN;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-swap';
process.env.CERTIFICATION_GATE = 'shadow';
delete process.env.UNSPLASH_ACCESS_KEY;
delete process.env.NODE_ENV;
delete process.env.DEV_PRO_EMAIL;

const db = require('../db.js');
const app = require('../server.js');

const SECRET = process.env.JWT_SECRET;

// ── Anthropic stub ──────────────────────────────────────────────────────────
let lastPrompt = null;
let anthropicMode = 'ok'; // 'ok' | 'spendcap'
const ALT_MEAL = (n) => ({
  type: 'WRONG_TYPE_ON_PURPOSE', // the endpoint must force the correct slot, not trust this
  name: `Alt meal ${n}`,
  description: `Grilled alt meal ${n}`,
  calories: 500, protein: 30, carbs: 40, fat: 15, cookTime: 20, servings: 1,
  ingredients: [
    { name: 'chicken breast', amount: '150g', amountValue: 150, amountUnit: 'g', cost: 2 },
    { name: 'rice', amount: '100g', amountValue: 100, amountUnit: 'g', cost: 0.5 },
  ],
  instructions: ['Cook it.'],
  imageKeyword: 'grilled chicken',
});
const stubAnthropic = {
  messages: {
    create: async (params) => {
      lastPrompt = params.messages[0].content;
      if (anthropicMode === 'spendcap') {
        const err = new Error('cap');
        err.spendCapReached = true;
        throw err;
      }
      return {
        content: [{ type: 'text', text: JSON.stringify([ALT_MEAL(1), ALT_MEAL(2), ALT_MEAL(3)]) }],
        usage: { input_tokens: 10, output_tokens: 10 },
        model: params.model,
      };
    },
  },
};

let server, baseUrl;
const realGetDailySpend = db.getDailySpend;

test.before(async () => {
  await db.initDb();
  app.__setAnthropicClientForTests(stubAnthropic);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  db.getDailySpend = realGetDailySpend;
  if (server) await new Promise((r) => server.close(r));
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(TMP_DB + s); } catch (e) { /* gone */ } }
});

// ── helpers ─────────────────────────────────────────────────────────────────
function reqRoute(method, urlPath, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': freshIp() };
    if (cookie) headers.Cookie = cookie;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(`${baseUrl}${urlPath}`, { method, headers }, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(raw); } catch (e) { /* */ } resolve({ status: res.statusCode, body: j, raw }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

let ipSeq = 0;
const freshIp = () => `10.43.${Math.floor(ipSeq / 250) % 250}.${(ipSeq++ % 250) + 1}`;

let userSeq = 0;
async function makeUser({ pro = false } = {}) {
  const id = randomUUID();
  const email = `swap-${userSeq++}-${randomUUID().slice(0, 8)}@example.test`;
  await db.createUser({ id, name: 'Swap Test', email, hashedPassword: 'x' });
  await db.markEmailVerified(id);
  if (pro) await db.setUserPro(id);
  return { id, email };
}
function cookieFor(user) {
  return `mealzy_session=${jwt.sign({ userId: user.id, email: user.email, pro: false, tv: 0, loginAt: Date.now() }, SECRET, { expiresIn: '1h' })}`;
}

const PROFILE = {
  name: 'Swap Test',
  daily_calories: 2000,
  currency: 'USD',
  budget_weekly: 140,
  dietary_preferences: ['vegan'],
  allergies: ['peanuts'],
};

const DATE = '2026-09-14';
const SLOT = 'dinner';

function makeMeal(type, name) {
  return {
    type, name, description: `Original ${name}`,
    calories: 600, protein: 35, carbs: 50, fat: 20, cookTime: 25, servings: 1,
    ingredients: [{ name: 'tofu', amount: '150g', amountValue: 150, amountUnit: 'g', cost: 1.5 }],
    instructions: ['Cook.'],
    cost: 1.5,
  };
}
function makeWeekPlan() {
  return {
    weekStart: DATE,
    days: [
      {
        date: DATE, dayName: 'Monday',
        meals: [
          makeMeal('breakfast', 'Original Breakfast'),
          makeMeal('lunch', 'Original Lunch'),
          makeMeal('dinner', 'Original Dinner'),
          makeMeal('snack', 'Original Snack'),
        ],
        totalCalories: 2000, totalProtein: 120, totalCarbs: 200, totalFat: 70, totalCost: 6,
      },
    ],
    weeklyTotals: { totalCost: 6, avgCalories: 2000, avgProtein: 120, avgCarbs: 200, avgFat: 70 },
  };
}
async function seedPlan(userId) {
  const planId = randomUUID();
  await db.savePlan(planId, userId, makeWeekPlan());
  return planId;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRO-GATING
// ═══════════════════════════════════════════════════════════════════════════

test('swap-alternatives: free-tier user is rejected with pro_required, no Anthropic call', async () => {
  const u = await makeUser({ pro: false });
  const planId = await seedPlan(u.id);
  lastPrompt = null;
  const res = await reqRoute('POST', `/api/plans/${planId}/swap-alternatives`, {
    cookie: cookieFor(u),
    body: { date: DATE, slot: SLOT, profile: PROFILE },
  });
  assert.equal(res.status, 402);
  assert.equal(res.body.error, 'pro_required');
  assert.equal(lastPrompt, null, 'no Anthropic call should have been made for a rejected free-tier request');
});

test('swap-commit: free-tier user is rejected with pro_required', async () => {
  const u = await makeUser({ pro: false });
  const planId = await seedPlan(u.id);
  const res = await reqRoute('POST', `/api/plans/${planId}/swap-commit`, {
    cookie: cookieFor(u),
    body: { date: DATE, slot: SLOT, meal: ALT_MEAL(1) },
  });
  assert.equal(res.status, 402);
  assert.equal(res.body.error, 'pro_required');
  const plan = await db.getPlanById(planId, u.id);
  assert.ok(!Array.isArray(plan.swappedSlots) || plan.swappedSlots.length === 0, 'nothing committed');
});

test('swap-alternatives: an unauthenticated request is rejected', async () => {
  const u = await makeUser({ pro: true });
  const planId = await seedPlan(u.id);
  const res = await reqRoute('POST', `/api/plans/${planId}/swap-alternatives`, {
    body: { date: DATE, slot: SLOT, profile: PROFILE },
  });
  assert.equal(res.status, 401);
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 1 — ALTERNATIVES
// ═══════════════════════════════════════════════════════════════════════════

test('swap-alternatives: Pro user gets 2-3 alternatives, each forced to the requested slot type, nothing persisted', async () => {
  const u = await makeUser({ pro: true });
  const planId = await seedPlan(u.id);
  const res = await reqRoute('POST', `/api/plans/${planId}/swap-alternatives`, {
    cookie: cookieFor(u),
    body: { date: DATE, slot: SLOT, profile: PROFILE },
  });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.alternatives));
  assert.ok(res.body.alternatives.length >= 2 && res.body.alternatives.length <= 3);
  for (const meal of res.body.alternatives) {
    assert.equal(meal.type, SLOT, 'server must force the requested slot type, never trust the model');
    assert.ok(typeof meal.cost === 'number', 'server must price the meal itself');
  }
  // Nothing persisted by this read-only endpoint.
  const plan = await db.getPlanById(planId, u.id);
  assert.ok(!Array.isArray(plan.swappedSlots) || plan.swappedSlots.length === 0);
  assert.equal(plan.days[0].meals[2].name, 'Original Dinner', 'original plan untouched');
});

test('swap-alternatives: the prompt sent to Anthropic carries the dietary/allergy constraints and avoids the current meal', async () => {
  const u = await makeUser({ pro: true });
  const planId = await seedPlan(u.id);
  lastPrompt = null;
  const res = await reqRoute('POST', `/api/plans/${planId}/swap-alternatives`, {
    cookie: cookieFor(u),
    body: { date: DATE, slot: SLOT, profile: PROFILE },
  });
  assert.equal(res.status, 200);
  assert.ok(lastPrompt, 'Anthropic should have been called');
  assert.match(lastPrompt, /VEGAN/, 'vegan dietary rule must be in the prompt');
  assert.match(lastPrompt, /peanuts/i, 'allergy must be in the prompt');
  assert.match(lastPrompt, /Original Dinner/, 'the meal being replaced must be in the avoid list');
});

test('swap-alternatives: already-swapped slot is rejected before any Anthropic call', async () => {
  const u = await makeUser({ pro: true });
  const planId = await seedPlan(u.id);
  await db.run(
    `UPDATE plans SET data = json_set(data, '$.swappedSlots', json(?)) WHERE id = ?`,
    [JSON.stringify([`${DATE}:${SLOT}`]), planId]
  );
  lastPrompt = null;
  const res = await reqRoute('POST', `/api/plans/${planId}/swap-alternatives`, {
    cookie: cookieFor(u),
    body: { date: DATE, slot: SLOT, profile: PROFILE },
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'slot_already_swapped');
  assert.equal(lastPrompt, null, 'must reject before spending on generation');
});

test('swap-alternatives: spend cap reached surfaces as 503, not a 500', async () => {
  const u = await makeUser({ pro: true });
  const planId = await seedPlan(u.id);
  anthropicMode = 'spendcap';
  try {
    const res = await reqRoute('POST', `/api/plans/${planId}/swap-alternatives`, {
      cookie: cookieFor(u),
      body: { date: DATE, slot: SLOT, profile: PROFILE },
    });
    assert.equal(res.status, 503);
  } finally {
    anthropicMode = 'ok';
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 2 — COMMIT (atomicity)
// ═══════════════════════════════════════════════════════════════════════════

test('swap-commit: Pro user commits successfully; swappedSlots and meal content update together, day totals recomputed', async () => {
  const u = await makeUser({ pro: true });
  const planId = await seedPlan(u.id);
  const chosen = ALT_MEAL('CHOSEN');
  const res = await reqRoute('POST', `/api/plans/${planId}/swap-commit`, {
    cookie: cookieFor(u),
    body: { date: DATE, slot: SLOT, meal: chosen },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.day.meals.find(m => m.type === SLOT).name, chosen.name);

  const plan = await db.getPlanById(planId, u.id);
  assert.deepEqual(plan.swappedSlots, [`${DATE}:${SLOT}`]);
  const dinner = plan.days[0].meals.find(m => m.type === SLOT);
  assert.equal(dinner.name, chosen.name);
  assert.equal(dinner.type, SLOT, 'committed meal type must be the slot, not whatever the client sent');
  // day totals recomputed from the other 3 original meals + the new one
  const expectedCalories = 600 /*breakfast*/ + 600 /*lunch*/ + chosen.calories + 600 /*snack*/;
  assert.equal(plan.days[0].totalCalories, expectedCalories);
});

test('swap-commit: a second commit on the same slot is rejected (409), original commit unchanged', async () => {
  const u = await makeUser({ pro: true });
  const planId = await seedPlan(u.id);
  const first = ALT_MEAL('FIRST');
  const r1 = await reqRoute('POST', `/api/plans/${planId}/swap-commit`, {
    cookie: cookieFor(u), body: { date: DATE, slot: SLOT, meal: first },
  });
  assert.equal(r1.status, 200);

  const second = ALT_MEAL('SECOND');
  const r2 = await reqRoute('POST', `/api/plans/${planId}/swap-commit`, {
    cookie: cookieFor(u), body: { date: DATE, slot: SLOT, meal: second },
  });
  assert.equal(r2.status, 409);
  assert.equal(r2.body.error, 'slot_already_swapped');

  const plan = await db.getPlanById(planId, u.id);
  assert.deepEqual(plan.swappedSlots, [`${DATE}:${SLOT}`], 'no duplicate/second entry');
  assert.equal(plan.days[0].meals.find(m => m.type === SLOT).name, first.name, 'second attempt never overwrote the first');
});

test('swap-commit: invalid meal payload (no ingredients) is rejected with 400, nothing persisted', async () => {
  const u = await makeUser({ pro: true });
  const planId = await seedPlan(u.id);
  const res = await reqRoute('POST', `/api/plans/${planId}/swap-commit`, {
    cookie: cookieFor(u), body: { date: DATE, slot: SLOT, meal: { name: 'bad' } },
  });
  assert.equal(res.status, 400);
  const plan = await db.getPlanById(planId, u.id);
  assert.ok(!Array.isArray(plan.swappedSlots) || plan.swappedSlots.length === 0);
});

test('swap-commit: unknown date/slot for the plan is rejected with 400', async () => {
  const u = await makeUser({ pro: true });
  const planId = await seedPlan(u.id);
  const res = await reqRoute('POST', `/api/plans/${planId}/swap-commit`, {
    cookie: cookieFor(u), body: { date: '2099-01-01', slot: SLOT, meal: ALT_MEAL(1) },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'day_not_found');
});

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENCY — the core requirement: two near-simultaneous commits on the
// SAME slot, fired as real HTTP requests against the real temp libSQL file.
// Exactly one must win; the DB must end up consistent, never both/mixed.
// ═══════════════════════════════════════════════════════════════════════════

test('CONCURRENCY: two simultaneous swap-commit requests for the same slot — exactly one succeeds', async () => {
  const u = await makeUser({ pro: true });
  const planId = await seedPlan(u.id);
  const mealA = ALT_MEAL('RACE_A');
  const mealB = ALT_MEAL('RACE_B');

  const [resA, resB] = await Promise.all([
    reqRoute('POST', `/api/plans/${planId}/swap-commit`, { cookie: cookieFor(u), body: { date: DATE, slot: SLOT, meal: mealA } }),
    reqRoute('POST', `/api/plans/${planId}/swap-commit`, { cookie: cookieFor(u), body: { date: DATE, slot: SLOT, meal: mealB } }),
  ]);

  const statuses = [resA.status, resB.status].sort();
  assert.deepEqual(statuses, [200, 409], 'exactly one request must succeed and the other must be rejected');

  const plan = await db.getPlanById(planId, u.id);
  assert.deepEqual(plan.swappedSlots, [`${DATE}:${SLOT}`], 'exactly one slot-key recorded, no duplicate');
  const winnerName = resA.status === 200 ? mealA.name : mealB.name;
  assert.equal(plan.days[0].meals.find(m => m.type === SLOT).name, winnerName, 'persisted content matches the actual winner, not a mix of both');
});

test('CONCURRENCY: five simultaneous swap-commit requests for the same slot — exactly one succeeds', async () => {
  const u = await makeUser({ pro: true });
  const planId = await seedPlan(u.id);
  const meals = [1, 2, 3, 4, 5].map((n) => ALT_MEAL(`RACE5_${n}`));

  const results = await Promise.all(
    meals.map((m) => reqRoute('POST', `/api/plans/${planId}/swap-commit`, { cookie: cookieFor(u), body: { date: DATE, slot: SLOT, meal: m } }))
  );
  const successCount = results.filter((r) => r.status === 200).length;
  const conflictCount = results.filter((r) => r.status === 409).length;
  assert.equal(successCount, 1, 'exactly one winner among 5 concurrent commits');
  assert.equal(conflictCount, 4);

  const plan = await db.getPlanById(planId, u.id);
  assert.equal(plan.swappedSlots.length, 1);
  assert.equal(plan.swappedSlots.filter(s => s === `${DATE}:${SLOT}`).length, 1);
});

test('db.commitMealSwap: direct DB-level race — 10 concurrent calls, exactly one commits', async () => {
  const u = await makeUser({ pro: true });
  const planId = randomUUID();
  await db.savePlan(planId, u.id, makeWeekPlan());
  const day = makeWeekPlan().days[0];
  const slotKey = `${DATE}:${SLOT}`;

  const attempts = Array.from({ length: 10 }, (_, i) => db.commitMealSwap({
    planId, userId: u.id, dayIndex: 0,
    newDay: { ...day, meals: day.meals.map(m => m.type === SLOT ? { ...m, name: `direct-${i}` } : m) },
    slotKey,
  }));
  const results = await Promise.all(attempts);
  assert.equal(results.filter(r => r.outcome === 'committed').length, 1, 'exactly one direct DB call commits');
  assert.equal(results.filter(r => r.outcome === 'already_swapped').length, 9);
});
