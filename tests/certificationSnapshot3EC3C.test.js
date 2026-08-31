'use strict';

/**
 * Phase 3E-C3C — the immutable / versioned historical certification snapshot.
 *
 * weeklyTotals.certification is a FROZEN 15-key schema. It is produced ONCE per
 * generated week, persisted with the plan, and returned unchanged on every
 * later read — no recertification, no fresh certifiedAt, no version drift.
 *
 * Executing /api/generate-meal + real (temp file) libSQL, Anthropic stubbed.
 * No network, no production Turso, no money.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');

const TMP_DB = path.join(os.tmpdir(), `mealzy-test-c3c-${randomUUID()}.db`);
process.env.TURSO_DATABASE_URL = `file:${TMP_DB}`;
delete process.env.TURSO_AUTH_TOKEN;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-3ec3c';
process.env.CERTIFICATION_GATE = 'shadow';
delete process.env.UNSPLASH_ACCESS_KEY;
delete process.env.NODE_ENV;
const PRO_EMAIL = `pro-${randomUUID().slice(0, 8)}@example.test`;
process.env.DEV_PRO_EMAIL = PRO_EMAIL;

const db = require('../db.js');
const certificationGate = require('../certificationGate');
const certificationAssessment = require('../certificationAssessment');
const app = require('../server.js');

const STUB_MEAL = (name) => ({
  name, description: `${name} test`, type: 'meal',
  calories: 452, protein: 38, carbs: 50, fat: 16,
  ingredients: [
    { name: 'rolled oats', amountValue: 60, amountUnit: 'g' },
    { name: 'white rice', amountValue: 80, amountUnit: 'g' },
    { name: 'olive oil', amountValue: 10, amountUnit: 'ml' },
  ],
});
const STUB_DAY = { meals: [STUB_MEAL('B'), STUB_MEAL('L'), STUB_MEAL('D'), STUB_MEAL('E')] };

const anthropicCalls = [];
const stubAnthropic = {
  messages: {
    create: async (params) => {
      anthropicCalls.push(params);
      return { content: [{ type: 'text', text: JSON.stringify(STUB_DAY) }], usage: { input_tokens: 10, output_tokens: 10 }, model: params.model };
    },
  },
};

const FROZEN_TOP_KEYS = [
  'acceptable', 'certificationVersion', 'certified', 'certifiedAt', 'deterministicStatus',
  'dietSafety', 'dietSubstrateVersion', 'downgraded', 'effectiveMode', 'enforced',
  'hardGateComplete', 'repairAttempts', 'repaired', 'requestedMode', 'status',
].sort();
const FROZEN_DIET_KEYS = [
  'allergenViolationCount', 'dietSafetyCertified', 'dietSafetyStatus', 'dietViolationCount',
  'failingCanonicalIngredientIds', 'observationalOnly', 'preferenceOnlyCount', 'supportedAllergenCount',
  'supportedDietCount', 'unresolvedSafetyCount', 'unsupportedReasons', 'unsupportedRestrictionCount',
].sort();

let server, baseUrl, proUserId;

test.before(async () => {
  await db.initDb();
  proUserId = randomUUID();
  await db.createUser({ id: proUserId, name: 'Pro', email: PRO_EMAIL, hashedPassword: 'x' });
  app.__setAnthropicClientForTests(stubAnthropic);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(TMP_DB + s); } catch (e) { /* gone */ } }
});

function cookie() {
  return `mealzy_session=${jwt.sign({ userId: proUserId, email: PRO_EMAIL, pro: true, tv: 0, loginAt: Date.now() }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
}
function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(`${baseUrl}${urlPath}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie(), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(raw); } catch (e) { /* */ } resolve({ status: res.statusCode, body: j, raw }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const genWeek = (profile) => req('POST', '/api/generate-meal', {
  weekStart: '2026-10-05',
  profile: { name: 'Pro', daily_calories: 1800, dietary_preferences: [], allergies: [], currency: 'SEK', budget_weekly: 900, ...profile },
});

// ── CASE 1 — successful shadow generation, frozen schema, response == persisted
test('CASE 1: frozen schema, versions, valid certifiedAt, response deep-equals persisted', async () => {
  anthropicCalls.length = 0;
  const res = await genWeek();
  assert.equal(res.status, 200);
  const cert = res.body.weeklyTotals.certification;

  assert.deepEqual(Object.keys(cert).sort(), FROZEN_TOP_KEYS, 'exact 15-key top-level schema');
  assert.deepEqual(Object.keys(cert.dietSafety).sort(), FROZEN_DIET_KEYS, 'exact 12-key dietSafety schema');
  assert.equal(cert.certificationVersion, 1);
  assert.equal(cert.dietSubstrateVersion, 1);
  assert.equal(cert.effectiveMode, 'shadow');
  assert.equal(cert.requestedMode, 'shadow');
  assert.equal(cert.enforced, false);
  assert.equal(cert.hardGateComplete, false);
  assert.equal(cert.repaired, false);
  assert.equal(cert.repairAttempts, 0);
  assert.deepEqual(Object.keys(cert.deterministicStatus).sort(), ['canonicalCoverage', 'nutritionCoverage', 'purchase', 'structure']);

  // certifiedAt is a valid ISO timestamp
  assert.equal(typeof cert.certifiedAt, 'string');
  assert.equal(new Date(cert.certifiedAt).toISOString(), cert.certifiedAt, 'round-trips as a valid ISO-8601 instant');

  // response snapshot == persisted snapshot
  const plans = (await req('GET', '/api/plans')).body.plans;
  const persisted = plans.find((p) => p.weekStart === '2026-10-05');
  assert.ok(persisted, 'plan persisted and read back through /api/plans');
  assert.deepEqual(persisted.weeklyTotals.certification, cert, 'persisted snapshot deep-equals the response snapshot');
  assert.equal(persisted.weeklyTotals.certification.certifiedAt, cert.certifiedAt, 'certifiedAt byte-identical');
});

// ── CASE 2 — unsupported restriction in shadow: still persists, privacy-safe
test('CASE 2: unsupported restriction (keto) — persisted, counts/reasons only, no top-level preflight, no raw text', async () => {
  const res = await genWeek({ dietary_preferences: ['keto'] });
  assert.equal(res.status, 200, 'shadow: enforcement off → still a successful plan');
  const cert = res.body.weeklyTotals.certification;

  assert.equal(cert.preflight, undefined, 'no redundant top-level preflight in the frozen snapshot');
  assert.equal(cert.dietSafety.unsupportedRestrictionCount, 1);
  assert.equal(cert.dietSafety.unsupportedReasons[0].reason, 'unsupported_hard_rule');
  assert.equal(cert.dietSafety.unsupportedReasons[0].channel, 'diets');
  assert.deepEqual(Object.keys(cert.dietSafety.unsupportedReasons[0]).sort(), ['channel', 'reason']);
  assert.equal(JSON.stringify(cert).toLowerCase().includes('keto'), false, 'no raw restriction text');

  const plans = (await req('GET', '/api/plans')).body.plans;
  const persisted = plans.find((p) => p.days && JSON.stringify(p.weeklyTotals.certification.dietSafety).includes('unsupported_hard_rule'));
  assert.ok(persisted);
  assert.deepEqual(persisted.weeklyTotals.certification, cert);
});

// ── CASE 3 — server copies distinctive gate values, does not recompute
test('CASE 3: server records distinctive authoritative gate values verbatim', async () => {
  const realRun = certificationGate.runCertificationGate;
  const distinctive = {
    status: certificationGate.GATE_STATUS.SHADOW_UNCERTIFIED,
    certified: false, acceptable: false, enforced: false, hardGateComplete: false,
    dietSafetyCertified: false, repaired: false, repairAttempts: 0,
    certificationVersion: 1, dietSubstrateVersion: 1,
    certifiedAt: '2020-01-02T03:04:05.678Z',   // deliberately old + fixed
    deterministicStatus: { structure: 'ok', canonicalCoverage: 'incomplete', nutritionCoverage: 'incomplete', purchase: 'not_enforced' },
    preflight: { observationalOnly: true, hasUnsupported: false, unsupportedRestrictionCount: 0, unsupportedReasons: [] },
    dietSafety: {
      observationalOnly: true, dietSubstrateVersion: 1, dietSafetyCertified: false, dietSafetyStatus: 'violation',
      supportedDietCount: 2, supportedAllergenCount: 3, preferenceOnlyCount: 1, unsupportedRestrictionCount: 0,
      dietViolationCount: 9, allergenViolationCount: 7, unresolvedSafetyCount: 5,
      failingCanonicalIngredientIds: ['feta', 'shrimp'], unsupportedReasons: [],
    },
    excludes: ['dietary_safety', 'allergen_safety'], days: [], assessment: {},
    gateResult: { weekFailures: [], failingIngredients: [] },
  };
  certificationGate.runCertificationGate = async () => distinctive;
  let cert;
  try {
    cert = (await genWeek()).body.weeklyTotals.certification;
  } finally {
    certificationGate.runCertificationGate = realRun;
  }
  assert.equal(cert.status, 'shadow_uncertified');
  assert.equal(cert.certified, false);
  assert.equal(cert.acceptable, false);
  assert.equal(cert.hardGateComplete, false);
  assert.equal(cert.certifiedAt, '2020-01-02T03:04:05.678Z', 'certifiedAt copied verbatim from the gate, not regenerated');
  assert.deepEqual(cert.deterministicStatus, distinctive.deterministicStatus, 'copied, not recomputed from the plan');
  assert.equal(cert.dietSafety.dietSafetyCertified, false);
  assert.equal(cert.dietSafety.dietSafetyStatus, 'violation');
  assert.equal(cert.dietSafety.dietViolationCount, 9);
  assert.equal(cert.dietSafety.allergenViolationCount, 7);
  assert.equal(cert.dietSafety.unresolvedSafetyCount, 5);
  assert.deepEqual(cert.dietSafety.failingCanonicalIngredientIds, ['feta', 'shrimp']);
  assert.deepEqual(Object.keys(cert).sort(), FROZEN_TOP_KEYS, 'still exactly the frozen schema (excludes/preflight/dietSubstrateVersion-nested dropped)');
  assert.deepEqual(Object.keys(cert.dietSafety).sort(), FROZEN_DIET_KEYS);
});

// ── CASE 4 — read persisted plan twice: identical, no recertification
test('CASE 4: two reads return the identical snapshot; no gate/assessment call on read', async () => {
  const spies = { gate: 0, det: 0, diet: 0 };
  const rg = certificationGate.runCertificationGate;
  const aw = certificationAssessment.assessWeek;
  const ds = certificationGate.assessGeneratedWeekDietSafetyShadow;
  certificationGate.runCertificationGate = async (...a) => { spies.gate += 1; return rg(...a); };
  certificationAssessment.assessWeek = (...a) => { spies.det += 1; return aw(...a); };
  certificationGate.assessGeneratedWeekDietSafetyShadow = (...a) => { spies.diet += 1; return ds(...a); };
  try {
    await genWeek();                         // generation → gate runs
    const afterGen = { ...spies };
    assert.ok(afterGen.gate >= 1, 'gate ran during generation');

    const r1 = (await req('GET', '/api/plans')).body.plans.find((p) => p.weekStart === '2026-10-05');
    const r2 = (await req('GET', '/api/plans')).body.plans.find((p) => p.weekStart === '2026-10-05');
    const r3 = (await req('GET', '/api/v1/meals/week')).body;

    assert.deepEqual(r1.weeklyTotals.certification, r2.weeklyTotals.certification, 'two reads identical');
    assert.equal(r1.weeklyTotals.certification.certifiedAt, r2.weeklyTotals.certification.certifiedAt);
    if (r3 && r3.weeklyTotals && r3.weeklyTotals.certification) {
      assert.equal(r3.weeklyTotals.certification.certifiedAt, r1.weeklyTotals.certification.certifiedAt);
    }
    assert.equal(spies.gate, afterGen.gate, 'reads did NOT call runCertificationGate');
    assert.equal(spies.det, afterGen.det, 'reads did NOT call the deterministic assessment');
    assert.equal(spies.diet, afterGen.diet, 'reads did NOT call the diet-safety assessment');
  } finally {
    certificationGate.runCertificationGate = rg;
    certificationAssessment.assessWeek = aw;
    certificationGate.assessGeneratedWeekDietSafetyShadow = ds;
  }
});

// ── CASE 5 — privacy: no active ids / raw strings; telemetry not broadened
test('CASE 5: snapshot has no active ids or raw restrictions; telemetry stays privacy-minimal', async () => {
  const events = [];
  const origLog = db.logEvent;
  db.logEvent = async (ev, data, ip) => { events.push({ ev, data }); return origLog.call(db, ev, data, ip); };
  let cert;
  try {
    cert = (await genWeek({ dietary_preferences: ['keto', 'my private thing'], allergies: ['peanut', 'weird allergen'] })).body.weeklyTotals.certification;
  } finally {
    db.logEvent = origLog;
  }
  const blob = JSON.stringify(cert).toLowerCase();
  for (const bad of ['my private thing', 'weird allergen', 'keto', 'peanut', 'activedietids', 'activeallergenids', 'activepreferenceonlyids']) {
    assert.equal(blob.includes(bad.toLowerCase()), false, `"${bad}" absent from the snapshot`);
  }
  assert.equal('preflight' in cert, false);
  assert.equal('failureReason' in cert, false);
  assert.equal('retry' in cert, false);
  assert.equal('excludes' in cert, false);

  // telemetry: certification_gate_result must NOT have grown to carry the
  // C3C-new historical-envelope fields. (It already carried its own privacy-safe
  // diagnostic subset — requestedMode/mode/status/counts/deterministicStatus —
  // before C3C; those are unchanged.)
  const gateResultEvt = events.find((e) => e.ev === 'certification_gate_result');
  assert.ok(gateResultEvt, 'certification_gate_result still emitted');
  const tkeys = Object.keys(gateResultEvt.data);
  for (const k of ['certifiedAt', 'dietSubstrateVersion']) {
    assert.equal(tkeys.includes(k), false, `telemetry not broadened with C3C snapshot key "${k}"`);
  }
  // and the telemetry dietSafety subset must not have gained raw restriction text
  assert.equal(JSON.stringify(gateResultEvt.data).toLowerCase().includes('my private thing'), false);
});
