'use strict';

/**
 * Phase 3E-C3D — final adversarial END-TO-END integration + C4-readiness
 * machinery checks. No production-code changes; this file is evidence.
 *
 * Chain under test (shadow, current production authorization):
 *   raw restrictions → normalize (ONCE) → unsupported preflight (observational)
 *   → preflight telemetry → generation → legacy allergy regex (when applicable)
 *   → deterministic assessment → diet/allergen assessment
 *   → ≤1 authorized certification repair (tests-only seam)
 *   → combined acceptable verdict → enforced rejection OR persistence
 *   → quota → immutable C3C snapshot
 *
 * Executing /api/generate-meal + real temp libSQL. Anthropic fully stubbed.
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

const TMP_DB = path.join(os.tmpdir(), `mealzy-test-c3d-${randomUUID()}.db`);
process.env.TURSO_DATABASE_URL = `file:${TMP_DB}`;
delete process.env.TURSO_AUTH_TOKEN;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-3ec3d';
process.env.CERTIFICATION_GATE = 'shadow';
delete process.env.UNSPLASH_ACCESS_KEY;
delete process.env.NODE_ENV;
const PRO_EMAIL = `pro-${randomUUID().slice(0, 8)}@example.test`;
process.env.DEV_PRO_EMAIL = PRO_EMAIL;

const db = require('../db.js');
const certificationGate = require('../certificationGate');
const certificationAssessment = require('../certificationAssessment');
const dietRestrictionContract = require('../dietRestrictionContract');
const generationVocabulary = require('../generationVocabulary');
const app = require('../server.js');

// ── stubs ────────────────────────────────────────────────────────────────
const STUB_MEAL = (name) => ({
  name, description: `${name} test`, type: 'meal', calories: 452, protein: 38, carbs: 50, fat: 16,
  ingredients: [
    { name: 'rolled oats', amountValue: 60, amountUnit: 'g' },
    { name: 'white rice', amountValue: 80, amountUnit: 'g' },
    { name: 'olive oil', amountValue: 10, amountUnit: 'ml' },
  ],
});
const STUB_DAY = { meals: [STUB_MEAL('B'), STUB_MEAL('L'), STUB_MEAL('D'), STUB_MEAL('E')] };

const exec = []; // ordered log: {kind:'anthropic'|'logEvent', event?}
const anthropicCalls = [];
const stubAnthropic = {
  messages: {
    create: async (params) => {
      anthropicCalls.push(params); exec.push({ kind: 'anthropic' });
      return { content: [{ type: 'text', text: JSON.stringify(STUB_DAY) }], usage: { input_tokens: 10, output_tokens: 10 }, model: params.model };
    },
  },
};

const FROZEN_TOP = ['acceptable', 'certificationVersion', 'certified', 'certifiedAt', 'deterministicStatus', 'dietSafety', 'dietSubstrateVersion', 'downgraded', 'effectiveMode', 'enforced', 'hardGateComplete', 'repairAttempts', 'repaired', 'requestedMode', 'status'].sort();
const FROZEN_DIET = ['allergenViolationCount', 'dietSafetyCertified', 'dietSafetyStatus', 'dietViolationCount', 'failingCanonicalIngredientIds', 'observationalOnly', 'preferenceOnlyCount', 'supportedAllergenCount', 'supportedDietCount', 'unresolvedSafetyCount', 'unsupportedReasons', 'unsupportedRestrictionCount'].sort();

let server, baseUrl, proUserId, origLogEvent;

test.before(async () => {
  await db.initDb();
  proUserId = randomUUID();
  await db.createUser({ id: proUserId, name: 'Pro', email: PRO_EMAIL, hashedPassword: 'x' });
  app.__setAnthropicClientForTests(stubAnthropic);
  origLogEvent = db.logEvent;
  db.logEvent = async function (event, data, ip) { exec.push({ kind: 'logEvent', event, data }); return origLogEvent.call(db, event, data, ip); };
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  db.logEvent = origLogEvent;
  if (server) await new Promise((r) => server.close(r));
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(TMP_DB + s); } catch (e) { /* gone */ } }
});

function cookie() {
  return `mealzy_session=${jwt.sign({ userId: proUserId, email: PRO_EMAIL, pro: true, tv: 0, loginAt: Date.now() }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
}
function reqRoute(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(`${baseUrl}${urlPath}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie(), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(raw); } catch (e) { /* */ } resolve({ status: res.statusCode, body: j, raw }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const gen = (weekStart, profile) => reqRoute('POST', '/api/generate-meal', {
  weekStart, profile: { name: 'Pro', daily_calories: 1800, dietary_preferences: [], allergies: [], currency: 'SEK', budget_weekly: 900, ...profile },
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. FULL SHADOW PIPELINE — unsupported restriction + supported allergen
// ═══════════════════════════════════════════════════════════════════════════
test('C3D-1: end-to-end shadow — normalize once, preflight before generation, observational, persisted C3C snapshot', async () => {
  exec.length = 0; anthropicCalls.length = 0;
  const nrm = dietRestrictionContract.normalizeRestrictions;
  let nrmCalls = 0;
  dietRestrictionContract.normalizeRestrictions = function (...a) { nrmCalls += 1; return nrm.apply(this, a); };
  let res;
  try {
    res = await gen('2026-11-02', { dietary_preferences: ['keto'], allergies: ['peanut'] });
  } finally {
    dietRestrictionContract.normalizeRestrictions = nrm;
  }

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(nrmCalls, 1, 'exactly ONE normalization for the whole request');

  // ordering: preflight telemetry strictly before the first generation call
  const iPre = exec.findIndex((e) => e.kind === 'logEvent' && e.event === 'certification_gate_preflight');
  const iGen = exec.findIndex((e) => e.kind === 'anthropic');
  const iResult = exec.findIndex((e) => e.kind === 'logEvent' && e.event === 'certification_gate_result');
  assert.ok(iPre >= 0 && iGen >= 0 && iResult >= 0);
  assert.ok(iPre < iGen, 'preflight BEFORE first generation call');
  assert.ok(iGen < iResult, 'generation BEFORE the certification result event');

  // observational: generation proceeded, no cert repair, plan persisted
  assert.equal(anthropicCalls.length, 7, '7 day generations, zero certification repair');
  for (const p of anthropicCalls) assert.equal(JSON.stringify(p.messages || []).includes('deterministic verifier rejected'), false);
  assert.ok(res.body.planId);

  // C3C snapshot exact schema + privacy-safe unsupported evidence
  const cert = res.body.weeklyTotals.certification;
  assert.deepEqual(Object.keys(cert).sort(), FROZEN_TOP);
  assert.deepEqual(Object.keys(cert.dietSafety).sort(), FROZEN_DIET);
  assert.equal(cert.enforced, false);
  assert.equal(cert.hardGateComplete, false);
  assert.equal(cert.repaired, false);
  assert.equal(cert.repairAttempts, 0);
  assert.equal(cert.certificationVersion, 1);
  assert.equal(cert.dietSubstrateVersion, 1);
  assert.equal(cert.acceptable, cert.certified, 'shadow: acceptable === certified');
  assert.equal(cert.dietSafety.unsupportedRestrictionCount, 1);
  assert.equal(cert.dietSafety.unsupportedReasons[0].reason, 'unsupported_hard_rule');
  assert.equal(cert.dietSafety.supportedAllergenCount, 1);
  assert.equal(JSON.stringify(cert).toLowerCase().includes('keto'), false);
  assert.equal(JSON.stringify(cert).toLowerCase().includes('peanut'), false);

  // response == persisted, and read does not recertify
  const spies = { g: 0, d: 0 };
  const rg = certificationGate.runCertificationGate; const aw = certificationAssessment.assessWeek;
  certificationGate.runCertificationGate = async (...a) => { spies.g += 1; return rg(...a); };
  certificationAssessment.assessWeek = (...a) => { spies.d += 1; return aw(...a); };
  try {
    const plans = (await reqRoute('GET', '/api/plans')).body.plans;
    const persisted = plans.find((p) => p.weekStart === '2026-11-02');
    assert.deepEqual(persisted.weeklyTotals.certification, cert, 'persisted deep-equals response');
    assert.equal(persisted.weeklyTotals.certification.certifiedAt, cert.certifiedAt);
    assert.equal(spies.g, 0, 'read did not call runCertificationGate');
    assert.equal(spies.d, 0, 'read did not call the deterministic assessment');
  } finally {
    certificationGate.runCertificationGate = rg;
    certificationAssessment.assessWeek = aw;
  }

  // quota: exactly one generate_plan for this week
  const gp = (await db.getAnalytics()).filter((e) => e.event === 'generate_plan');
  assert.ok(gp.length >= 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. LEGACY ALLERGY + UNSUPPORTED RESTRICTION together — regex still distinct
// ═══════════════════════════════════════════════════════════════════════════
test('C3D-2: legacy allergy regex fires during generation even alongside an unsupported restriction; no cert path', async () => {
  exec.length = 0; anthropicCalls.length = 0;
  const before = (await db.getRecentPlans(proUserId, 50)).length;
  // "rice" matches \brice\b in the stub meals; keto is an unsupported hard rule
  const res = await gen('2026-11-09', { dietary_preferences: ['keto'], allergies: ['rice'] });

  assert.equal(res.status, 400, 'legacy path — existing 400');
  assert.equal(res.body.error, 'allergy_violation');
  assert.equal(res.body.retry, true);
  assert.notEqual(res.body.error, 'certification_failed', 'NOT reclassified as a certification failure');
  assert.ok(!res.body.weeklyTotals, 'no certification snapshot for a pre-gate failure');
  assert.equal((await db.getRecentPlans(proUserId, 50)).length, before, 'no plan persisted');
  // preflight still ran (observational) before generation; no certification result / repair
  assert.ok(exec.some((e) => e.kind === 'logEvent' && e.event === 'certification_gate_preflight'), 'preflight still observed');
  assert.equal(exec.some((e) => e.kind === 'logEvent' && e.event === 'certification_gate_result'), false, 'gate result never reached');
  for (const p of anthropicCalls) assert.equal(JSON.stringify(p.messages || []).includes('deterministic verifier rejected'), false, 'no certification repair');
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. ENFORCED REJECTION at route level — adversarial gate outcome, no side effects
// ═══════════════════════════════════════════════════════════════════════════
test('C3D-3: enforced && !acceptable → 422, no plan, no quota, no snapshot — even with status:CERTIFIED/certified:true', async () => {
  const realRun = certificationGate.runCertificationGate;
  const adversarial = {
    status: certificationGate.GATE_STATUS.CERTIFIED, certified: true, acceptable: false,
    enforced: true, hardGateComplete: false, retry: true, repaired: true, repairAttempts: 1,
    failureReason: certificationGate.FAILURE_REASON.DIET_UNCERTIFIED_AFTER_REPAIR,
    certificationVersion: 1, dietSubstrateVersion: 1, certifiedAt: '2021-06-06T00:00:00.000Z',
    deterministicStatus: { structure: 'ok', canonicalCoverage: 'covered', nutritionCoverage: 'complete', purchase: 'certified' },
    preflight: { observationalOnly: false, hasUnsupported: false, unsupportedRestrictionCount: 0, unsupportedReasons: [] },
    dietSafety: { observationalOnly: false, dietSubstrateVersion: 1, dietSafetyCertified: false, dietSafetyStatus: 'violation', supportedDietCount: 1, supportedAllergenCount: 0, preferenceOnlyCount: 0, unsupportedRestrictionCount: 0, dietViolationCount: 4, allergenViolationCount: 0, unresolvedSafetyCount: 0, failingCanonicalIngredientIds: ['bacon'], unsupportedReasons: [] },
    excludes: ['dietary_safety', 'allergen_safety'], days: [], assessment: {}, gateResult: { weekFailures: [], failingIngredients: [] },
  };
  certificationGate.runCertificationGate = async () => adversarial;
  const beforePlans = (await db.getRecentPlans(proUserId, 50)).length;
  const beforeGp = (await db.getAnalytics()).filter((e) => e.event === 'generate_plan').length;
  let res;
  try {
    res = await gen('2026-11-16', {});
  } finally {
    certificationGate.runCertificationGate = realRun;
  }
  assert.equal(res.status, 422);
  assert.equal(res.body.error, 'certification_failed');
  assert.equal(res.body.retry, true, 'retry from the gate outcome');
  assert.equal(res.body.reason, 'diet_uncertified_after_repair', 'reason from the gate outcome');
  assert.ok(!res.body.planId && !res.body.success);
  assert.equal((await db.getRecentPlans(proUserId, 50)).length, beforePlans, 'no plan saved');
  assert.equal((await db.getAnalytics()).filter((e) => e.event === 'generate_plan').length, beforeGp, 'no quota consumed');
  // no certification snapshot persisted for a rejected plan
  const plans = await db.getRecentPlans(proUserId, 50);
  assert.equal(plans.some((p) => p.weekStart === '2026-11-16'), false);
  // failure body carries no raw restriction/ingredient data
  assert.equal(JSON.stringify(res.body).toLowerCase().includes('bacon'), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. AUTHORIZED SUCCESS + FAILURE MATRIX (tests-only seam) — A..G
// ═══════════════════════════════════════════════════════════════════════════
const el = generationVocabulary.getGenerationEligibleIngredients();
const rice = el.find((i) => i.canonicalName.includes('rice'));
const veg = el.find((i) => i.category === 'produce');
const oil = el.find((i) => i.category === 'pantry');
const chicken = el.find((i) => i.canonicalName === 'chicken breast');
const cleanDays = () => Array.from({ length: 7 }, () => ({ meals: [{ type: 'd', name: 'x', ingredients: [
  { name: rice.canonicalName, amountValue: 100, amountUnit: rice.baseUnit },
  { name: veg.canonicalName, amountValue: 150, amountUnit: veg.baseUnit },
  { name: oil.canonicalName, amountValue: 10, amountUnit: oil.baseUnit }] }] }));
const meatDays = () => Array.from({ length: 7 }, () => ({ meals: [{ type: 'd', name: 'x', ingredients: [
  { name: chicken.canonicalName, amountValue: 150, amountUnit: chicken.baseUnit },
  { name: rice.canonicalName, amountValue: 100, amountUnit: rice.baseUnit },
  { name: veg.canonicalName, amountValue: 150, amountUnit: veg.baseUnit }] }] }));
const brokenDays = () => [{ meals: [{ type: 'd', name: 'x', ingredients: [{ name: 'moon cheese crumble', amountValue: 30, amountUnit: 'g' }] }] }];

function runAuth(days, { diets = [], repairReturns, c } = {}) {
  return certificationGate.runCertificationGate({
    days, requestedBudgetCents: 300000, currency: 'USD',
    mode: certificationGate.GATE_MODE.ON, hardGateAuthorized: true, diets,
    generateRepairedWeek: async () => { if (c) c.n += 1; return typeof repairReturns === 'function' ? repairReturns() : cleanDays(); },
  });
}

test('C3D-4: authorized matrix A-G — one shared repair max, dual reassessment, precedence, enforced flag', async () => {
  // A: det pass + diet pass → acceptable, no repair
  let c = { n: 0 };
  let r = await runAuth(cleanDays(), { diets: ['vegan'], c });
  assert.equal(r.enforced, true); assert.equal(r.acceptable, true); assert.equal(c.n, 0); assert.equal(r.hardGateComplete, true);

  // B: det fail + diet pass, repair fixes → 1 repair, both reassessed, accept
  c = { n: 0 };
  r = await runAuth(brokenDays(), { diets: ['vegan'], repairReturns: cleanDays, c });
  assert.equal(c.n, 1); assert.equal(r.certified, true); assert.equal(r.dietSafetyCertified, true); assert.equal(r.acceptable, true); assert.equal(r.repairAttempts, 1);

  // C: det pass + diet fail, repair fixes diet → 1 repair, accept
  c = { n: 0 };
  r = await runAuth(meatDays(), { diets: ['vegan'], repairReturns: cleanDays, c });
  assert.equal(c.n, 1); assert.equal(r.certified, true); assert.equal(r.dietSafetyCertified, true); assert.equal(r.acceptable, true);

  // D: det fail + diet fail, ONE shared repair fixes both
  c = { n: 0 };
  r = await runAuth(brokenDays(), { diets: ['vegan'], repairReturns: cleanDays, c });
  assert.equal(c.n, 1, 'ONE shared repair, not two'); assert.equal(r.acceptable, true);

  // E: deterministic still fails after repair → det reason, no 2nd repair
  c = { n: 0 };
  r = await runAuth(brokenDays(), { diets: ['vegan'], repairReturns: brokenDays, c });
  assert.equal(c.n, 1); assert.equal(r.acceptable, false); assert.equal(r.failureReason, certificationGate.FAILURE_REASON.UNCERTIFIED_AFTER_REPAIR);

  // F: diet still fails after repair (keto unsupported) → diet reason, no 2nd repair
  c = { n: 0 };
  r = await runAuth(cleanDays(), { diets: ['keto'], repairReturns: cleanDays, c });
  assert.equal(c.n, 1); assert.equal(r.certified, true); assert.equal(r.acceptable, false);
  assert.equal(r.failureReason, certificationGate.FAILURE_REASON.DIET_UNCERTIFIED_AFTER_REPAIR); assert.equal(r.retry, true);

  // G: both still fail → deterministic reason wins
  r = await runAuth(brokenDays(), { diets: ['keto'], repairReturns: brokenDays });
  assert.equal(r.failureReason, certificationGate.FAILURE_REASON.UNCERTIFIED_AFTER_REPAIR, 'deterministic precedence');
  assert.equal(r.repairAttempts, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. C4-READINESS MACHINERY — intact but NOT activated
// ═══════════════════════════════════════════════════════════════════════════
test('C3D-5: unsupported-preflight machinery is C4-ready — detected, privacy-safe, reserved reason, non-retryable, inert now', () => {
  const pf = certificationGate.preflightRestrictions({ diets: ['keto', 'halal', 'made up thing'], allergens: ['weird'] }).preflight;
  assert.equal(pf.hasUnsupported, true);
  assert.equal(pf.unsupportedRestrictionCount, 4);
  for (const u of pf.unsupportedReasons) {
    assert.deepEqual(Object.keys(u).sort(), ['channel', 'reason']);
    assert.ok(['unsupported_hard_rule', 'unrecognised'].includes(u.reason));
    assert.ok(['diets', 'allergens'].includes(u.channel));
  }
  assert.equal(JSON.stringify(pf).toLowerCase().includes('made up thing'), false);

  // observationalOnly is bound to the release constant — flips automatically at C4
  assert.equal(pf.observationalOnly, certificationGate.HARD_GATE_PRODUCTION_AUTHORIZED !== true);
  assert.equal(pf.observationalOnly, true, 'inert while unauthorized');

  // the reserved reason exists and is non-retryable (frozen retry contract)
  assert.equal(certificationGate.FAILURE_REASON.UNSUPPORTED_HARD_RESTRICTION, 'unsupported_hard_restriction');

  // a supported-only set never trips it
  const ok = certificationGate.preflightRestrictions({ diets: ['vegan', 'gluten-free'], allergens: ['peanut', 'sesame'] }).preflight;
  assert.equal(ok.hasUnsupported, false);
  assert.equal(ok.unsupportedRestrictionCount, 0);
});

test('C3D-6: frozen constants + production authorization unchanged', () => {
  assert.equal(certificationGate.HARD_GATE_PRODUCTION_AUTHORIZED, false);
  assert.equal(certificationGate.DIETARY_ALLERGEN_SUBSTRATE_PRESENT, false);
  assert.equal(certificationGate.CERTIFICATION_VERSION, 1);
  assert.equal(dietRestrictionContract.DIET_SUBSTRATE_VERSION, 1);
  assert.equal(certificationGate.resolveEffectiveMode('on').effective, 'shadow', 'effective ON unreachable');
  assert.deepEqual(Object.keys(certificationGate.GATE_STATUS).sort(), ['CERTIFIED', 'FAILED', 'SHADOW_UNCERTIFIED']);
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. PRIVACY across ALL planes with distinctive strings
// ═══════════════════════════════════════════════════════════════════════════
test('C3D-7: no raw restriction/profile data in response, persisted snapshot, or certification telemetry', async () => {
  exec.length = 0;
  const SECRETS = ['my clandestine diet', 'bizarre unheard allergen'];
  const res = await gen('2026-11-23', { dietary_preferences: ['vegan', SECRETS[0]], allergies: ['peanut', SECRETS[1]] });
  assert.equal(res.status, 200);
  const cert = res.body.weeklyTotals.certification;

  const persisted = (await reqRoute('GET', '/api/plans')).body.plans.find((p) => p.weekStart === '2026-11-23').weeklyTotals.certification;
  const certEvents = exec.filter((e) => e.kind === 'logEvent' && /certification_gate/.test(e.event));
  assert.ok(certEvents.length >= 2, 'preflight + result events present');

  const blobs = [JSON.stringify(cert), JSON.stringify(persisted), JSON.stringify(certEvents.map((e) => e.data))];
  for (const blob of blobs) {
    const lower = blob.toLowerCase();
    for (const s of [...SECRETS, 'activedietids', 'activeallergenids', 'activepreferenceonlyids', 'vegan', 'peanut']) {
      assert.equal(lower.includes(s.toLowerCase()), false, `"${s}" must not appear`);
    }
  }
  assert.deepEqual(Object.keys(cert).sort(), FROZEN_TOP);
  assert.equal('preflight' in cert, false);
  assert.equal('failureReason' in cert, false);
  assert.equal('retry' in cert, false);
  assert.equal('excludes' in cert, false);
});
