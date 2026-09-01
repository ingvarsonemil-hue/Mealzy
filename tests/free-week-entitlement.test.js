'use strict';

/**
 * Mealzy Mobile M4E-B — one-free-week backend entitlement.
 *
 * Adversarial coverage for:
 *   - db.js: reserve / promote / release / reclaim / atomic promote+persist,
 *     historical backfill classification + idempotency, account deletion
 *   - /api/generate-meal: the authenticated verified non-Pro WEEK path —
 *     first free week, same-week replay, different-week pro_required,
 *     competing/stale reservations, failure release, Pro bypass, strict auth
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

const TMP_DB = path.join(os.tmpdir(), `mealzy-test-m4e-${randomUUID()}.db`);
process.env.TURSO_DATABASE_URL = `file:${TMP_DB}`;
delete process.env.TURSO_AUTH_TOKEN;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-m4e';
process.env.CERTIFICATION_GATE = 'shadow';
delete process.env.UNSPLASH_ACCESS_KEY;
delete process.env.NODE_ENV;
const PRO_EMAIL = `m4e-pro-${randomUUID().slice(0, 8)}@example.test`;
process.env.DEV_PRO_EMAIL = PRO_EMAIL;

const db = require('../db.js');
const app = require('../server.js');

const SECRET = process.env.JWT_SECRET;

// ── Anthropic stub ──────────────────────────────────────────────────────────
const STUB_MEAL = (name) => ({
  name, description: `${name} test`, type: 'meal', calories: 452, protein: 38, carbs: 50, fat: 16,
  ingredients: [
    { name: 'rolled oats', amountValue: 60, amountUnit: 'g' },
    { name: 'white rice', amountValue: 80, amountUnit: 'g' },
    { name: 'olive oil', amountValue: 10, amountUnit: 'ml' },
  ],
});
const STUB_DAY = { meals: [STUB_MEAL('B'), STUB_MEAL('L'), STUB_MEAL('D'), STUB_MEAL('E')] };

let anthropicCalls = 0;
let anthropicMode = 'ok'; // 'ok' | 'throw'
const stubAnthropic = {
  messages: {
    create: async (params) => {
      anthropicCalls += 1;
      if (anthropicMode === 'throw') throw new Error('stub anthropic failure');
      return { content: [{ type: 'text', text: JSON.stringify(STUB_DAY) }], usage: { input_tokens: 10, output_tokens: 10 }, model: params.model };
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
function reqRoute(method, urlPath, { body, cookie, bearer } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': freshIp() };
    if (cookie) headers.Cookie = cookie;
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(`${baseUrl}${urlPath}`, { method, headers }, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(raw); } catch (e) { /* */ } resolve({ status: res.statusCode, body: j, raw }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

let ipSeq = 0;
const freshIp = () => `10.42.${Math.floor(ipSeq / 250) % 250}.${(ipSeq++ % 250) + 1}`;

let userSeq = 0;
async function makeUser({ verified = true, pro = false } = {}) {
  const id = randomUUID();
  const email = pro ? PRO_EMAIL : `m4e-${userSeq++}-${randomUUID().slice(0, 8)}@example.test`;
  await db.createUser({ id, name: 'M4E', email, hashedPassword: 'x' });
  if (verified) await db.markEmailVerified(id);
  return { id, email };
}
function cookieFor(user, { tv = 0 } = {}) {
  return `mealzy_session=${jwt.sign({ userId: user.id, email: user.email, pro: false, tv, loginAt: Date.now() }, SECRET, { expiresIn: '1h' })}`;
}
const PROFILE = { name: 'M4E', daily_calories: 1900, currency: 'USD', budget_weekly: 400, dietary_preferences: [], allergies: [] };
function genWeek(cookie, weekStart, extra = {}) {
  return reqRoute('POST', '/api/generate-meal', { cookie, body: { weekStart, profile: { ...PROFILE, ...extra } } });
}

// ═══════════════════════════════════════════════════════════════════════════
// DB-LEVEL: helpers, ownership, atomicity, reclaim
// ═══════════════════════════════════════════════════════════════════════════

test('DB: reserve is one-shot; a second reserve for the same user is a no-op', async () => {
  const u = await makeUser();
  assert.deepEqual(await db.reserveFreeWeek(u.id, 'r1', '2026-03-02'), { reserved: true });
  assert.deepEqual(await db.reserveFreeWeek(u.id, 'r2', '2026-03-09'), { reserved: false });
  const ent = await db.getFreeWeekEntitlement(u.id);
  assert.equal(ent.status, 'reserved');
  assert.equal(ent.request_id, 'r1');
});

test('AA: a wrong request_id cannot promote another request\'s reservation', async () => {
  const u = await makeUser();
  await db.reserveFreeWeek(u.id, 'owner', '2026-03-02');
  assert.deepEqual(await db.promoteFreeWeek(u.id, 'intruder', 'plan-x', '2026-03-02'), { promoted: false });
  assert.equal((await db.getFreeWeekEntitlement(u.id)).status, 'reserved');
  assert.deepEqual(await db.promoteFreeWeek(u.id, 'owner', 'plan-x', '2026-03-02'), { promoted: true });
  const ent = await db.getFreeWeekEntitlement(u.id);
  assert.equal(ent.status, 'consumed');
  assert.equal(ent.plan_id, 'plan-x');
  assert.ok(ent.consumed_at);
});

test('AB: a wrong request_id cannot release another request\'s reservation', async () => {
  const u = await makeUser();
  await db.reserveFreeWeek(u.id, 'owner', '2026-03-02');
  assert.deepEqual(await db.releaseFreeWeekReservation(u.id, 'intruder'), { released: false });
  assert.ok(await db.getFreeWeekEntitlement(u.id));
  assert.deepEqual(await db.releaseFreeWeekReservation(u.id, 'owner'), { released: true });
  assert.equal(await db.getFreeWeekEntitlement(u.id), null);
});

test('promote/release never touch a consumed row', async () => {
  const u = await makeUser();
  await db.reserveFreeWeek(u.id, 'r1', '2026-03-02');
  await db.promoteFreeWeek(u.id, 'r1', 'p1', '2026-03-02');
  assert.deepEqual(await db.releaseFreeWeekReservation(u.id, 'r1'), { released: false });
  assert.deepEqual(await db.promoteFreeWeek(u.id, 'r1', 'p2', '2026-03-09'), { promoted: false });
  const ent = await db.getFreeWeekEntitlement(u.id);
  assert.equal(ent.plan_id, 'p1');
  assert.equal(ent.week_start, '2026-03-02');
});

test('Y: a reservation older than the exact 15-minute cutoff is reclaimable; a fresh one is not', async () => {
  const stale = await makeUser();
  await db.run(
    `INSERT INTO free_week_entitlement (user_id, status, request_id, week_start, reserved_at)
     VALUES (?, 'reserved', 'old', ?, datetime('now', '-16 minutes'))`, [stale.id, '2026-03-02']);
  const cutoff = Date.now() - 15 * 60 * 1000;
  assert.deepEqual(await db.reclaimStaleFreeWeekReservation(stale.id, 'new', '2026-03-09', cutoff), { reclaimed: true });
  const ent = await db.getFreeWeekEntitlement(stale.id);
  assert.equal(ent.request_id, 'new');
  assert.equal(ent.week_start, '2026-03-09');

  const fresh = await makeUser();
  await db.run(
    `INSERT INTO free_week_entitlement (user_id, status, request_id, week_start, reserved_at)
     VALUES (?, 'reserved', 'cur', ?, datetime('now', '-2 minutes'))`, [fresh.id, '2026-03-02']);
  assert.deepEqual(await db.reclaimStaleFreeWeekReservation(fresh.id, 'x', '2026-03-09', cutoff), { reclaimed: false });
});

test('reclaim races: only the first caller wins', async () => {
  const u = await makeUser();
  await db.run(
    `INSERT INTO free_week_entitlement (user_id, status, request_id, week_start, reserved_at)
     VALUES (?, 'reserved', 'old', ?, datetime('now', '-20 minutes'))`, [u.id, '2026-03-02']);
  const cutoff = Date.now() - 15 * 60 * 1000;
  const results = await Promise.all([
    db.reclaimStaleFreeWeekReservation(u.id, 'a', '2026-03-09', cutoff),
    db.reclaimStaleFreeWeekReservation(u.id, 'b', '2026-03-09', cutoff),
    db.reclaimStaleFreeWeekReservation(u.id, 'c', '2026-03-09', cutoff),
  ]);
  assert.equal(results.filter((r) => r.reclaimed).length, 1, 'exactly one reclaim winner');
});

test('T1: promoteFreeWeekWithPlan -> outcome:committed when owned (insert 1 + update 1, one plan, consumed)', async () => {
  const u = await makeUser();
  await db.reserveFreeWeek(u.id, 'r1', '2026-04-06');
  const planId = randomUUID();
  const ok = await db.promoteFreeWeekWithPlan({
    userId: u.id, requestId: 'r1', planId, weekStart: '2026-04-06',
    planObj: { weekStart: '2026-04-06', days: [1, 2, 3], weeklyTotals: {} },
  });
  assert.deepEqual(ok, { outcome: 'committed' });
  const ent = await db.getFreeWeekEntitlement(u.id);
  assert.equal(ent.status, 'consumed');
  assert.equal(ent.plan_id, planId);
  const plans = await db.all(`SELECT id FROM plans WHERE user_id = ?`, [u.id]);
  assert.equal(plans.length, 1, 'exactly one persisted plan');
});

test('T2: promoteFreeWeekWithPlan -> outcome:ownership_lost when the guard matches zero rows (nothing persisted, nothing promoted)', async () => {
  const u2 = await makeUser();
  await db.reserveFreeWeek(u2.id, 'r1', '2026-04-06');
  const planId2 = randomUUID();
  const no = await db.promoteFreeWeekWithPlan({
    userId: u2.id, requestId: 'WRONG', planId: planId2, weekStart: '2026-04-06',
    planObj: { weekStart: '2026-04-06', days: [1], weeklyTotals: {} },
  });
  assert.deepEqual(no, { outcome: 'ownership_lost' });
  assert.equal((await db.getFreeWeekEntitlement(u2.id)).status, 'reserved', "winner's reservation untouched");
  assert.equal(await db.getPlanById(planId2, u2.id), null, 'losing request persisted no plan');
});

test('T1b: the batch itself throws + rolls back on a real DB failure (duplicate plan PK)', async () => {
  const u = await makeUser();
  await db.reserveFreeWeek(u.id, 'r1', '2026-04-13');
  const dup = randomUUID();
  await db.run(`INSERT INTO plans (id, user_id, data) VALUES (?, ?, '{}')`, [dup, u.id]); // pre-existing PK
  await assert.rejects(
    () => db.promoteFreeWeekWithPlan({
      userId: u.id, requestId: 'r1', planId: dup, weekStart: '2026-04-13',
      planObj: { weekStart: '2026-04-13', days: [1], weeklyTotals: {} },
    }),
  );
  assert.equal((await db.getFreeWeekEntitlement(u.id)).status, 'reserved', 'transaction rolled back — entitlement still reserved');
});

test('AC: account deletion removes the free_week_entitlement row', async () => {
  const u = await makeUser();
  await db.reserveFreeWeek(u.id, 'r1', '2026-04-06');
  await db.deleteUserAccount(u.id, u.email);
  assert.equal(await db.getFreeWeekEntitlement(u.id), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// DB-LEVEL: historical backfill (L1..L5)
// ═══════════════════════════════════════════════════════════════════════════

async function insertPlan(userId, dataStringOrObj) {
  const data = typeof dataStringOrObj === 'string' ? dataStringOrObj : JSON.stringify(dataStringOrObj);
  await db.run(`INSERT INTO plans (id, user_id, data) VALUES (?, ?, ?)`, [randomUUID(), userId, data]);
}

test('L1/L2/L3/L4: only genuine weekly-plan shapes backfill a consumed entitlement', async () => {
  const weekly = randomUUID();
  await db.run(`INSERT INTO users (id, name, email, hashed_password) VALUES (?, 'w', ?, 'x')`, [weekly, `bf-weekly-${weekly}@x.test`]);
  await insertPlan(weekly, { weekStart: '2026-01-05', days: [{ dayName: 'Mon' }], weeklyTotals: { totalCost: 1 }, savedAt: 'z' });

  const singleDay = randomUUID();
  await db.run(`INSERT INTO users (id, name, email, hashed_password) VALUES (?, 's', ?, 'x')`, [singleDay, `bf-day-${singleDay}@x.test`]);
  await insertPlan(singleDay, { date: '2026-01-05', plan: { meals: [] }, savedAt: 'z' });

  const badJson = randomUUID();
  await db.run(`INSERT INTO users (id, name, email, hashed_password) VALUES (?, 'b', ?, 'x')`, [badJson, `bf-bad-${badJson}@x.test`]);
  await insertPlan(badJson, '{ this is not valid json ');

  const misleading = randomUUID();
  await db.run(`INSERT INTO users (id, name, email, hashed_password) VALUES (?, 'm', ?, 'x')`, [misleading, `bf-mis-${misleading}@x.test`]);
  await insertPlan(misleading, { date: '2026-01-05', plan: { meals: [{ name: '"weekStart" and "days":[] inside a string', description: '{"weekStart":"2026-01-01","days":[]}' }] } });

  const jsonString = randomUUID();
  await db.run(`INSERT INTO users (id, name, email, hashed_password) VALUES (?, 'j', ?, 'x')`, [jsonString, `bf-jstr-${jsonString}@x.test`]);
  await insertPlan(jsonString, JSON.stringify('{"weekStart":"2026-01-01","days":[]}'));

  const daysNotArray = randomUUID();
  await db.run(`INSERT INTO users (id, name, email, hashed_password) VALUES (?, 'd', ?, 'x')`, [daysNotArray, `bf-dna-${daysNotArray}@x.test`]);
  await insertPlan(daysNotArray, { weekStart: '2026-01-05', days: { '0': 'x' } });

  const res = await db.backfillFreeWeekEntitlements();
  assert.ok(res.inserted >= 1);

  const wEnt = await db.getFreeWeekEntitlement(weekly);
  assert.equal(wEnt.status, 'consumed');
  assert.equal(wEnt.request_id, 'backfill');
  assert.equal(wEnt.week_start, '2026-01-05');
  assert.ok(wEnt.plan_id);

  for (const id of [singleDay, badJson, misleading, jsonString, daysNotArray]) {
    assert.equal(await db.getFreeWeekEntitlement(id), null, `user ${id} must not be backfilled`);
  }
});

test('L5: backfill is idempotent — a second run inserts nothing and mutates nothing', async () => {
  const u = randomUUID();
  await db.run(`INSERT INTO users (id, name, email, hashed_password) VALUES (?, 'i', ?, 'x')`, [u, `bf-idem-${u}@x.test`]);
  await insertPlan(u, { weekStart: '2026-02-02', days: [1], weeklyTotals: {} });

  await db.backfillFreeWeekEntitlements();
  const first = await db.getFreeWeekEntitlement(u);
  assert.equal(first.status, 'consumed');

  const second = await db.backfillFreeWeekEntitlements();
  // nothing new for this user
  const after = await db.getFreeWeekEntitlement(u);
  assert.deepEqual(after, first, 'row unchanged after a repeat backfill');

  // and a manual consumed row is never overwritten
  const manual = randomUUID();
  await db.run(`INSERT INTO users (id, name, email, hashed_password) VALUES (?, 'x', ?, 'x')`, [manual, `bf-man-${manual}@x.test`]);
  await db.run(`INSERT INTO free_week_entitlement (user_id, status, request_id, week_start, plan_id, reserved_at, consumed_at)
                VALUES (?, 'consumed', 'manual', '2020-01-01', 'manual-plan', datetime('now'), datetime('now'))`, [manual]);
  await insertPlan(manual, { weekStart: '2099-01-01', days: [1], weeklyTotals: {} });
  await db.backfillFreeWeekEntitlements();
  const m = await db.getFreeWeekEntitlement(manual);
  assert.equal(m.request_id, 'manual');
  assert.equal(m.week_start, '2020-01-01');
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE: the free-week lifecycle
// ═══════════════════════════════════════════════════════════════════════════

test('A/B: first verified non-Pro week -> 200 consumed; same week replays with ZERO Anthropic calls', async () => {
  const u = await makeUser();
  const c = cookieFor(u);
  anthropicMode = 'ok'; anthropicCalls = 0;

  const first = await genWeek(c, '2026-05-04');
  assert.equal(first.status, 200, first.raw);
  assert.equal(first.body.success, true);
  assert.equal(first.body.regenerated, false);
  assert.equal(first.body.entitlement, 'free_week_consumed');
  assert.equal(first.body.weekStart, '2026-05-04');
  assert.ok(Array.isArray(first.body.days) && first.body.days.length === 7);
  assert.ok(first.body.weeklyTotals);
  assert.ok(first.body.planId);
  const callsAfterFirst = anthropicCalls;
  assert.equal(callsAfterFirst, 7, 'one week generation = 7 day calls');

  // C: entitlement consumed and persisted
  const ent = await db.getFreeWeekEntitlement(u.id);
  assert.equal(ent.status, 'consumed');
  assert.equal(ent.week_start, '2026-05-04');
  assert.equal(ent.plan_id, first.body.planId);
  assert.ok(await db.getPlanById(first.body.planId, u.id));

  // same week -> replay, no new plan, no Anthropic
  const replay = await genWeek(c, '2026-05-04');
  assert.equal(replay.status, 200);
  assert.equal(replay.body.regenerated, false);
  assert.equal(replay.body.entitlement, 'free_week_consumed');
  assert.equal(replay.body.planId, first.body.planId);
  assert.equal(replay.body.days.length, 7);
  assert.equal(anthropicCalls, callsAfterFirst, 'replay made ZERO new Anthropic calls');
  const plans = await db.getRecentPlans(u.id, 50);
  assert.equal(plans.filter((p) => p.weekStart === '2026-05-04').length, 1, 'exactly one persisted week plan');
});

test('C: a different week after consumption -> 402 pro_required / free_week_consumed, ZERO Anthropic calls', async () => {
  const u = await makeUser();
  const c = cookieFor(u);
  await genWeek(c, '2026-05-04');
  anthropicCalls = 0;
  const other = await genWeek(c, '2026-05-11');
  assert.equal(other.status, 402);
  assert.equal(other.body.error, 'pro_required');
  assert.equal(other.body.reason, 'free_week_consumed');
  assert.equal(anthropicCalls, 0);
});

test('D / AE: an active fresh reservation -> 409 free_week_generation_in_progress retry:true, ZERO Anthropic calls', async () => {
  const u = await makeUser();
  await db.run(
    `INSERT INTO free_week_entitlement (user_id, status, request_id, week_start, reserved_at)
     VALUES (?, 'reserved', 'other-req', '2026-06-01', datetime('now', '-1 minutes'))`, [u.id]);
  anthropicCalls = 0;
  const res = await genWeek(cookieFor(u), '2026-06-01');
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'free_week_generation_in_progress');
  assert.equal(res.body.retry, true);
  assert.equal(anthropicCalls, 0);
});

test('E: a stale (>15 min) reservation is reclaimed and the week generates', async () => {
  const u = await makeUser();
  await db.run(
    `INSERT INTO free_week_entitlement (user_id, status, request_id, week_start, reserved_at)
     VALUES (?, 'reserved', 'abandoned', '2026-06-08', datetime('now', '-30 minutes'))`, [u.id]);
  anthropicMode = 'ok'; anthropicCalls = 0;
  const res = await genWeek(cookieFor(u), '2026-06-08');
  assert.equal(res.status, 200, res.raw);
  assert.equal(res.body.entitlement, 'free_week_consumed');
  const ent = await db.getFreeWeekEntitlement(u.id);
  assert.equal(ent.status, 'consumed');
  assert.notEqual(ent.request_id, 'abandoned');
});

test('J: two concurrent first-week requests -> exactly one free plan, one consumption', async () => {
  const u = await makeUser();
  const c = cookieFor(u);
  anthropicMode = 'ok'; anthropicCalls = 0;
  const [a, b] = await Promise.all([genWeek(c, '2026-07-06'), genWeek(c, '2026-07-06')]);

  // The invariant: never two free plans, never two consumptions. The loser is
  // either a 409 (reservation race) or a 200 replay of the winner's plan — but
  // only ONE weekly plan is ever persisted, and only ONE generation runs.
  assert.equal(anthropicCalls, 7, 'exactly one week generation across both requests');
  const plans = await db.getRecentPlans(u.id, 50);
  assert.equal(plans.filter((p) => p.weekStart === '2026-07-06').length, 1, 'exactly one persisted week plan');
  const ent = await db.getFreeWeekEntitlement(u.id);
  assert.equal(ent.status, 'consumed');
  const okBodies = [a, b].filter((r) => r.status === 200).map((r) => r.body);
  assert.ok(okBodies.length >= 1);
  for (const body of okBodies) {
    assert.equal(body.entitlement, 'free_week_consumed');
    assert.equal(body.planId, ent.plan_id, 'every 200 points at the single persisted plan');
  }
  for (const r of [a, b]) {
    if (r.status !== 200) {
      assert.equal(r.status, 409);
      assert.equal(r.body.error, 'free_week_generation_in_progress');
      assert.equal(r.body.retry, true);
    }
  }
});

test('D-anthropic: Anthropic failure -> entitlement released and available for retry', async () => {
  const u = await makeUser();
  const c = cookieFor(u);
  anthropicMode = 'throw'; anthropicCalls = 0;
  const fail = await genWeek(c, '2026-08-03');
  assert.equal(fail.status, 500);
  assert.equal(await db.getFreeWeekEntitlement(u.id), null, 'reservation released after failed generation');

  anthropicMode = 'ok';
  const retry = await genWeek(c, '2026-08-03');
  assert.equal(retry.status, 200, retry.raw);
  assert.equal(retry.body.entitlement, 'free_week_consumed');
});

test('E-allergy: an allergy violation leaves the entitlement available', async () => {
  const u = await makeUser();
  const c = cookieFor(u);
  anthropicMode = 'ok';
  const res = await genWeek(c, '2026-08-10', { allergies: ['rice'] }); // "rice" is in every stub meal
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'allergy_violation');
  assert.equal(await db.getFreeWeekEntitlement(u.id), null);
});

test('F-budget: budget_unreachable leaves the entitlement available', async () => {
  const u = await makeUser();
  const c = cookieFor(u);
  anthropicMode = 'ok';
  const res = await genWeek(c, '2026-08-17', { budget_weekly: 1, currency: 'USD' });
  assert.equal(res.status, 422);
  assert.equal(res.body.error, 'budget_unreachable');
  assert.equal(await db.getFreeWeekEntitlement(u.id), null);
});

test('G-spendcap: the daily spend cap leaves the entitlement available', async () => {
  const u = await makeUser();
  const c = cookieFor(u);
  anthropicMode = 'ok';
  db.getDailySpend = async () => 9999;
  try {
    const res = await genWeek(c, '2026-08-24');
    assert.equal(res.status, 503);
  } finally {
    db.getDailySpend = realGetDailySpend;
  }
  assert.equal(await db.getFreeWeekEntitlement(u.id), null);
});

const realPromoteWithPlan = db.promoteFreeWeekWithPlan;

test('T6/X: a DB/transaction failure in the atomic batch -> 500 save_failed, reservation released, entitlement available', async () => {
  const u = await makeUser();
  const c = cookieFor(u);
  anthropicMode = 'ok';
  db.promoteFreeWeekWithPlan = async () => { const e = new Error('boom'); throw e; };
  let res;
  try {
    res = await genWeek(c, '2026-09-07');
  } finally {
    db.promoteFreeWeekWithPlan = realPromoteWithPlan;
  }
  assert.equal(res.status, 500);
  assert.equal(res.body.error, 'save_failed');
  assert.equal(await db.getFreeWeekEntitlement(u.id), null, 'reservation released, entitlement available');
  assert.equal((await db.getRecentPlans(u.id, 50)).length, 0, 'this request persisted nothing');

  const retry = await genWeek(c, '2026-09-07');
  assert.equal(retry.status, 200, retry.raw);
  assert.equal(retry.body.entitlement, 'free_week_consumed');
});

test('T3: ownership_lost + winner still reserved -> 409 free_week_generation_in_progress retry:true, no promotion, no plan', async () => {
  const u = await makeUser();
  const c = cookieFor(u);
  anthropicMode = 'ok';
  // simulate: our reservation was reclaimed by another still-running request
  db.promoteFreeWeekWithPlan = async ({ userId }) => {
    await db.run(`UPDATE free_week_entitlement SET request_id = 'other', status = 'reserved', reserved_at = datetime('now') WHERE user_id = ?`, [userId]);
    return { outcome: 'ownership_lost' };
  };
  let res;
  try { res = await genWeek(c, '2026-09-14'); } finally { db.promoteFreeWeekWithPlan = realPromoteWithPlan; }
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'free_week_generation_in_progress');
  assert.equal(res.body.retry, true);
  const ent = await db.getFreeWeekEntitlement(u.id);
  assert.equal(ent.request_id, 'other', "winner's reservation untouched — losing request did not release it");
  assert.equal(ent.status, 'reserved');
  assert.equal((await db.getRecentPlans(u.id, 50)).length, 0, 'losing request persisted no plan');
});

test('T4: ownership_lost + winner already consumed the same week -> 200 idempotent replay of the winner plan', async () => {
  const u = await makeUser();
  const c = cookieFor(u);
  anthropicMode = 'ok';
  const winnerPlanId = randomUUID();
  db.promoteFreeWeekWithPlan = async ({ userId, weekStart }) => {
    await db.run(`INSERT INTO plans (id, user_id, data) VALUES (?, ?, ?)`,
      [winnerPlanId, userId, JSON.stringify({ weekStart, days: Array.from({ length: 7 }, () => ({ dayName: 'W' })), weeklyTotals: { totalCost: 42 }, savedAt: 'z' })]);
    await db.run(`UPDATE free_week_entitlement SET status='consumed', request_id='other', plan_id=?, week_start=?, consumed_at=datetime('now') WHERE user_id=?`,
      [winnerPlanId, weekStart, userId]);
    return { outcome: 'ownership_lost' };
  };
  const callsBefore = anthropicCalls;
  let res;
  try { res = await genWeek(c, '2026-09-21'); } finally { db.promoteFreeWeekWithPlan = realPromoteWithPlan; }
  assert.equal(res.status, 200, res.raw);
  assert.equal(res.body.regenerated, false);
  assert.equal(res.body.entitlement, 'free_week_consumed');
  assert.equal(res.body.planId, winnerPlanId, 'returns the winner plan, not a new one');
  assert.equal(res.body.weeklyTotals.totalCost, 42);
  assert.equal((await db.getRecentPlans(u.id, 50)).filter((p) => p.weekStart === '2026-09-21').length, 1, 'exactly one persisted week plan');
  // the ownership_lost resolution branch itself makes ZERO Anthropic calls
  // (the losing request's own generation before it is unavoidable / stubbed here)
  assert.equal(anthropicCalls, callsBefore + 7, 'only the losing request\'s own generation ran; the replay branch added none');
});

test('T5: ownership_lost + winner consumed a DIFFERENT week -> 402 pro_required / free_week_consumed', async () => {
  const u = await makeUser();
  const c = cookieFor(u);
  anthropicMode = 'ok';
  db.promoteFreeWeekWithPlan = async ({ userId }) => {
    await db.run(`UPDATE free_week_entitlement SET status='consumed', request_id='other', plan_id='winner-p', week_start='2020-01-06', consumed_at=datetime('now') WHERE user_id=?`, [userId]);
    return { outcome: 'ownership_lost' };
  };
  let res;
  try { res = await genWeek(c, '2026-09-28'); } finally { db.promoteFreeWeekWithPlan = realPromoteWithPlan; }
  assert.equal(res.status, 402);
  assert.equal(res.body.error, 'pro_required');
  assert.equal(res.body.reason, 'free_week_consumed');
});

test('T8: the route never calls a direct promoteFreeWeek fallback after the atomic helper', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const routeStart = src.indexOf("app.post('/api/generate-meal'");
  const routeEnd = src.indexOf('function parseJsonResponse');
  const routeSrc = src.slice(routeStart, routeEnd);
  assert.ok(routeStart !== -1 && routeEnd > routeStart);
  assert.equal(/\bdb\.promoteFreeWeek\b(?!WithPlan)/.test(routeSrc), false, 'no non-atomic db.promoteFreeWeek call in the generate-meal route');
  assert.equal(/promotion_divergence/.test(routeSrc), false, 'the old divergence-recovery branch is gone');
});

test('K: the single-day trial path never touches the free-week entitlement', async () => {
  const u = await makeUser();
  const c = cookieFor(u);
  anthropicMode = 'ok';
  const day = await reqRoute('POST', '/api/generate-meal', { cookie: c, body: { date: '2026-10-05', profile: PROFILE } });
  assert.equal(day.status, 200, day.raw);
  assert.equal(day.body.entitlement, undefined);
  assert.equal(await db.getFreeWeekEntitlement(u.id), null, 'no free-week row from a single-day generation');

  // and the free week is still available afterwards
  const week = await genWeek(c, '2026-10-05');
  assert.equal(week.status, 200);
  assert.equal(week.body.entitlement, 'free_week_consumed');
});

test('M: Pro users bypass the free-week entitlement entirely', async () => {
  const pro = await makeUser({ pro: true });
  const c = cookieFor(pro);
  anthropicMode = 'ok';
  const a = await genWeek(c, '2026-11-02');
  const b = await genWeek(c, '2026-11-09');
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(a.body.entitlement, undefined);
  assert.equal(a.body.success, true);
  assert.ok(a.body.planId);
  assert.equal(await db.getFreeWeekEntitlement(pro.id), null);
});

test('N: free -> Pro — a Pro upgrade grants a different week after the free week is consumed', async () => {
  const u = await makeUser();
  const c = cookieFor(u);
  anthropicMode = 'ok';
  await genWeek(c, '2026-12-07');
  assert.equal((await genWeek(c, '2026-12-14')).status, 402);

  await db.setUserPro(u.id);
  const afterPro = await genWeek(c, '2026-12-14');
  assert.equal(afterPro.status, 200, afterPro.raw);
  assert.equal(afterPro.body.success, true);
  assert.equal(afterPro.body.entitlement, undefined);
});

test('O: a historical (Pro) weekly plan backfills as consumed — a later non-Pro cannot gain a free week', async () => {
  const u = await makeUser();
  await insertPlan(u.id, { weekStart: '2025-06-02', days: Array.from({ length: 7 }, () => ({})), weeklyTotals: {}, savedAt: 'z' });
  await db.backfillFreeWeekEntitlements();
  anthropicCalls = 0;
  const res = await genWeek(cookieFor(u), '2026-06-02');
  assert.equal(res.status, 402);
  assert.equal(res.body.reason, 'free_week_consumed');
  assert.equal(anthropicCalls, 0);
});

test('P: an unverified user -> 403 and NO reservation is created', async () => {
  const u = await makeUser({ verified: false });
  anthropicCalls = 0;
  const res = await genWeek(cookieFor(u), '2026-06-02');
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'email_not_verified');
  assert.equal(await db.getFreeWeekEntitlement(u.id), null);
  assert.equal(anthropicCalls, 0);
});

test('AD: a missing profile -> 400 profile_required', async () => {
  const u = await makeUser();
  const res = await reqRoute('POST', '/api/generate-meal', { cookie: cookieFor(u), body: { weekStart: '2026-06-02' } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'profile_required');
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE: strict optional authentication (M4E task 5)
// ═══════════════════════════════════════════════════════════════════════════

test('Q/R: an invalid or revoked Bearer -> 401, never anonymous generation', async () => {
  anthropicCalls = 0;
  const garbage = await reqRoute('POST', '/api/generate-meal', { bearer: 'not.a.jwt', body: { date: '2026-01-01', profile: PROFILE } });
  assert.equal(garbage.status, 401);

  const u = await makeUser();
  const token = jwt.sign({ userId: u.id, email: u.email, pro: false, tv: 0, loginAt: Date.now() }, SECRET, { expiresIn: '1h' });
  await db.bumpTokenVersion(u.id); // revoke
  const revoked = await reqRoute('POST', '/api/generate-meal', { bearer: token, body: { date: '2026-01-01', profile: PROFILE } });
  assert.equal(revoked.status, 401);
  assert.equal(revoked.body.error, 'session_revoked');
  assert.equal(anthropicCalls, 0, 'no generation for a rejected credential');
});

test('S: a genuinely credential-less request still generates anonymously', async () => {
  anthropicMode = 'ok';
  const res = await reqRoute('POST', '/api/generate-meal', { body: { date: '2026-01-02', profile: PROFILE } });
  assert.equal(res.status, 200, res.raw);
  assert.equal(res.body.success, true);
  assert.equal(res.body.planId, undefined, 'anonymous generation persists nothing');
});

test('T/U: a valid cookie authenticates; a bad cookie 401s even with a valid Bearer alongside', async () => {
  const u = await makeUser();
  const good = jwt.sign({ userId: u.id, email: u.email, pro: false, tv: 0, loginAt: Date.now() }, SECRET, { expiresIn: '1h' });

  const okCookie = await reqRoute('POST', '/api/generate-meal', {
    cookie: `mealzy_session=${good}`, body: { date: '2026-01-03', profile: PROFILE },
  });
  assert.equal(okCookie.status, 200, okCookie.raw);

  const badCookieGoodBearer = await reqRoute('POST', '/api/generate-meal', {
    cookie: 'mealzy_session=not-a-jwt', bearer: good, body: { date: '2026-01-03', profile: PROFILE },
  });
  assert.equal(badCookieGoodBearer.status, 401, 'cookie precedence: a bad cookie is a 401, no Bearer fallthrough');
});

// ═══════════════════════════════════════════════════════════════════════════
// Certification invariants unchanged (task 15)
// ═══════════════════════════════════════════════════════════════════════════

test('V: certification constants and authorization are unchanged', () => {
  const cg = require('../certificationGate');
  assert.equal(cg.HARD_GATE_PRODUCTION_AUTHORIZED, false);
  assert.equal(cg.DIETARY_ALLERGEN_SUBSTRATE_PRESENT, false);
  assert.equal(cg.CERTIFICATION_VERSION, 1);
  assert.equal(require('../dietRestrictionContract').DIET_SUBSTRATE_VERSION, 1);
});
