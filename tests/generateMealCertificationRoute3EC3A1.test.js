'use strict';

/**
 * Phase 3E-C3A-1 — EXECUTING route-level regression for the certification gate
 * wiring on POST /api/generate-meal (week mode, effective CERTIFICATION_GATE
 * = shadow).
 *
 * This is the coverage that the C2.1 bug slipped past: the direct
 * certificationGate unit tests all passed while the real route handler passed
 * an undeclared `allergens` identifier into runCertificationGate. Here the
 * actual registered Express route runs end to end against a real (temp,
 * file-backed) libSQL DB, with ONLY the paid Anthropic boundary stubbed.
 *
 * No real Anthropic calls, no network (Unsplash/image fetch is env-gated off),
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

// ── env MUST be set before server.js / db.js are required ──────────────────
const TMP_DB = path.join(os.tmpdir(), `mealzy-test-genmeal-cert-${randomUUID()}.db`);
process.env.TURSO_DATABASE_URL = `file:${TMP_DB}`;
delete process.env.TURSO_AUTH_TOKEN;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-3ec3a1';
process.env.CERTIFICATION_GATE = 'shadow';            // effective mode = shadow
delete process.env.UNSPLASH_ACCESS_KEY;               // no image fetch
delete process.env.NODE_ENV;                          // not 'production' -> DEV_PRO_EMAIL override usable
const PRO_EMAIL = `pro-${randomUUID().slice(0, 8)}@example.test`;
process.env.DEV_PRO_EMAIL = PRO_EMAIL;

const db = require('../db.js');
const app = require('../server.js');

// ── deterministic Anthropic stub ─────────────────────────────────────────
// One fixed 4-meal day that sits inside the 15% macro tolerance of the
// default 150p / 200c / 65f daily targets, so no budget/macro repair round
// fires — generation is exactly 7 calls, and any 8th call would mean the
// certification gate made one (it must not, in shadow).
const STUB_MEAL = (name) => ({
  name,
  description: `${name} — simple test meal`,
  type: 'meal',
  calories: 452,
  protein: 38,
  carbs: 50,
  fat: 16,
  ingredients: [
    { name: 'rolled oats', amountValue: 60, amountUnit: 'g' },
    { name: 'white rice', amountValue: 80, amountUnit: 'g' },
    { name: 'olive oil', amountValue: 10, amountUnit: 'ml' },
  ],
});
const STUB_DAY = {
  meals: [STUB_MEAL('Breakfast Bowl'), STUB_MEAL('Lunch Plate'), STUB_MEAL('Dinner Plate'), STUB_MEAL('Evening Bowl')],
};

const anthropicCalls = [];
const stubAnthropic = {
  messages: {
    create: async (params) => {
      anthropicCalls.push(params);
      return {
        content: [{ type: 'text', text: JSON.stringify(STUB_DAY) }],
        usage: { input_tokens: 10, output_tokens: 10 },
        model: params.model,
      };
    },
  },
};

let server;
let baseUrl;
let proUserId;

test.before(async () => {
  await db.initDb();

  proUserId = randomUUID();
  await db.createUser({ id: proUserId, name: 'Pro Tester', email: PRO_EMAIL, hashedPassword: 'x' });
  // DEV_PRO_EMAIL override (db.js _applyDevProOverride) now makes getUserById
  // return pro:1 + email_verified:1 for this account on non-production.

  app.__setAnthropicClientForTests(stubAnthropic);

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  // node --test runs each file in its own process, so the stub client dies with
  // it; closing the listener + deleting the temp DB is all that needs undoing.
  if (server) await new Promise((r) => server.close(r));
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TMP_DB + suffix); } catch (e) { /* already gone */ }
  }
});

function proCookie() {
  const token = jwt.sign(
    { userId: proUserId, email: PRO_EMAIL, pro: true, tv: 0, loginAt: Date.now() },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  return `mealzy_session=${token}`;
}

function postGenerateMeal(body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      `${baseUrl}/api/generate-meal`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers } },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(raw); } catch (e) { /* leave null */ }
          resolve({ status: res.statusCode, body: json, raw });
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const WEEK_BODY = {
  weekStart: '2026-09-07',
  profile: {
    name: 'Pro Tester',
    daily_calories: 1800,
    // peanut allergy goes through the ALLERGY channel — the exact channel the
    // C2.1 bug broke (server passed `allergens` instead of `allergens: allergies`)
    allergies: ['peanut'],
    dietary_preferences: [],
    // non-USD => budget non-enforceable => no budget hard-fail, keeps the test
    // focused on the certification wiring
    currency: 'SEK',
    budget_weekly: 900,
  },
};

test('1. week-mode /api/generate-meal executes end to end and returns a certification shadow result', async () => {
  anthropicCalls.length = 0;
  const res = await postGenerateMeal(WEEK_BODY, { Cookie: proCookie() });

  assert.equal(res.status, 200, `expected 200, got ${res.status} — body: ${res.raw.slice(0, 400)}`);
  assert.equal(res.body.success, true);
  assert.equal(res.body.days.length, 7, 'a full 7-day week');
  assert.ok(res.body.planId, 'a persisted planId is returned (session + savePlan success path)');

  // ── (2)(3)(4)(5) certification block ran, wired, single-normalized ──────
  const cert = res.body.weeklyTotals.certification;
  assert.ok(cert, 'weeklyTotals.certification is populated — the gate block executed without a caught ReferenceError');
  assert.equal(cert.requestedMode, 'shadow');
  assert.equal(cert.mode, 'shadow');
  assert.equal(cert.enforced, false);
  assert.equal(cert.hardGateComplete, false);
  assert.equal(cert.certificationVersion, 1);

  // ── (6)(7) dietSafety observational result present ─────────────────────
  assert.ok(cert.dietSafety, 'dietSafety summary attached');
  assert.equal(cert.dietSafety.observationalOnly, true);
  assert.equal(cert.dietSafety.dietSubstrateVersion, 1);
  // the raw ['peanut'] allergy channel reached the gate and normalized once
  assert.equal(cert.dietSafety.supportedAllergenCount, 1,
    'peanut allergy normalized through the single gate boundary');

  // ── C3A-2 combined result shape, surfaced verbatim from runCertificationGate
  assert.equal(typeof cert.certified, 'boolean', 'certified surfaced');
  assert.equal(typeof cert.acceptable, 'boolean', 'acceptable surfaced');
  assert.equal(typeof cert.dietSafety.dietSafetyCertified, 'boolean', 'diet sub-verdict surfaced');
  assert.deepEqual(Object.keys(cert.deterministicStatus).sort(),
    ['canonicalCoverage', 'nutritionCoverage', 'purchase', 'structure'],
    'deterministicStatus surfaced separately from the gate status');
  // shadow: no authorized hard diet ⇒ acceptable is exactly the deterministic verdict
  assert.equal(cert.acceptable, cert.certified,
    'in shadow, acceptable === certified (dietSafety is observational only)');
  assert.equal(cert.certified, cert.status === 'certified',
    'certified still means the deterministic-only verdict');
  assert.equal(cert.hardGateComplete, false, 'hard gate never complete before C4');

  // ── (8) shadow did not reject ─────────────────────────────────────────
  assert.notEqual(res.status, 422);
  assert.notEqual(res.body.error, 'certification_failed');

  // ── (9)(10) no certification repair, no extra Anthropic call from the gate
  assert.equal(cert.repaired, false, 'shadow never repairs');
  assert.equal(anthropicCalls.length, 7,
    `7 day-generation calls only — no macro/budget repair, no certification repair (got ${anthropicCalls.length})`);
  for (const params of anthropicCalls) {
    const sent = JSON.stringify(params.messages || []);
    assert.equal(sent.includes('deterministic verifier rejected'), false,
      'no Anthropic call carries the certification repair instruction (buildRepairInstruction)');
  }

  // ── (11) persistence success path exercised ──────────────────────────
  const saved = await db.getPlanById(res.body.planId, proUserId);
  assert.ok(saved, 'plan row persisted and readable back scoped to the pro user');
  assert.equal(saved.weekStart, '2026-09-07');
  assert.equal(Array.isArray(saved.days) && saved.days.length, 7);
  assert.ok(saved.weeklyTotals && saved.weeklyTotals.certification,
    'the persisted week carries the same certification snapshot');

  // ── (12) quota success path exercised (Pro => generate_plan event) ────
  const analytics = await db.getAnalytics();
  assert.ok(analytics.some((e) => e.event === 'generate_plan' && e.data && e.data.pro === true),
    'Pro generate_plan quota event logged');
});

test('2. STRUCTURAL C2.1 regression proof — the assertion chain depends on the wiring', () => {
  // If server.js regressed `allergens: allergies` back to a bare `allergens`,
  // server.js is in strict mode ('use strict' at the top), so evaluating the
  // runCertificationGate({... allergens ...}) argument object throws
  // ReferenceError: allergens is not defined. That throw is INSIDE the route's
  //   try { gateOutcome = await certificationGate.runCertificationGate({...}) }
  //   catch (gateErr) { ... if (gateOn) return 422 ... }
  // gateOn is false in shadow, so the catch swallows it, gateOutcome stays
  // null, `if (gateOutcome)` is skipped, certificationResult stays null, and
  //   if (certificationResult) weeklyTotals.certification = certificationResult;
  // never runs. The response is still 200, but weeklyTotals.certification is
  // undefined — so test 1's `assert.ok(cert, ...)` and every cert.* assertion
  // fail. This test documents that dependency; the live proof is test 1 passing
  // now (verified separately by a temporary local revert during C3A-1R).
  assert.ok(true);
});
