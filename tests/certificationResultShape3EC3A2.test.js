'use strict';

/**
 * Phase 3E-C3A-2 — the frozen combined certification result shape.
 *
 * runCertificationGate now composes, on EVERY return:
 *   certified            deterministic-only verdict (UNCHANGED meaning)
 *   deterministicStatus  the deterministic assessment's own sub-statuses
 *   dietSafetyCertified  dietary/allergen SUB-verdict (never folded into certified)
 *   acceptable           certified && (!authorizedHardDiet || dietSafetyCertified)
 *   hardGateComplete     authorizedHardDiet && acceptable
 *
 * authorizedHardDiet is structurally unreachable in production
 * (HARD_GATE_PRODUCTION_AUTHORIZED === false), so in every reachable mode
 * acceptable === certified and hardGateComplete === false. These tests prove
 * that, prove the equation is not a no-op (via the tests-only hardGateAuthorized
 * seam), and prove nothing about enforcement/repair/version changed.
 *
 * No Anthropic calls, no network — synthetic structured weeks, effective shadow.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const gate = require('../certificationGate');
const generationVocabulary = require('../generationVocabulary');

// A deterministically CERTIFIABLE week (identity + nutrition + purchase +
// budget), 7 days × 1 meal — same fixture shape as dietSafetyShadowGate3EC1.
function certifiableDays() {
  const rice = generationVocabulary.getGenerationEligibleIngredients().find((i) => i.canonicalName.includes('rice'));
  const veg = generationVocabulary.getGenerationEligibleIngredients().find((i) => i.category === 'produce');
  const oil = generationVocabulary.getGenerationEligibleIngredients().find((i) => i.category === 'pantry');
  const meal = {
    type: 'dinner', name: 'Test bowl',
    ingredients: [
      { name: rice.canonicalName, amountValue: 100, amountUnit: rice.baseUnit },
      { name: veg.canonicalName, amountValue: 150, amountUnit: veg.baseUnit },
      { name: oil.canonicalName, amountValue: 10, amountUnit: oil.baseUnit },
    ],
  };
  return Array.from({ length: 7 }, () => ({ meals: [meal] }));
}

const run = (days, opts) => gate.runCertificationGate({
  days,
  requestedBudgetCents: 100000,
  currency: 'USD',
  mode: gate.GATE_MODE.SHADOW,
  ...opts,
});

// Deterministically UNCERTIFIED without touching diet safety: the same
// generation-eligible, diet-resolvable week, but with an impossibly low
// requested budget so the purchase dimension fails while every ingredient
// still resolves and every safety property is known.
const overBudget = (opts) => gate.runCertificationGate({
  days: certifiableDays(),
  requestedBudgetCents: 1,
  currency: 'USD',
  mode: gate.GATE_MODE.SHADOW,
  ...opts,
});

// ── CASE 1 — deterministic certified, diet certified, shadow ──────────────
test('CASE 1: det certified + diet certified (shadow) → certified/acceptable true, hardGateComplete false', async () => {
  const r = await run(certifiableDays(), { diets: ['vegetarian'], allergens: [] });
  assert.equal(r.status, gate.GATE_STATUS.CERTIFIED);
  assert.equal(r.certified, true);
  assert.equal(r.dietSafetyCertified, true);
  assert.equal(r.acceptable, true);
  assert.equal(r.hardGateComplete, false);
});

// ── CASE 2 — deterministic certified, diet NOT certified, shadow (MANDATORY)
test('CASE 2: det certified + diet NOT certified (shadow) → certified true, acceptable true, hardGateComplete false', async () => {
  // keto is a recognised-but-unsupported hard rule → diet can never certify,
  // while every deterministic dimension still passes.
  const r = await run(certifiableDays(), { diets: ['keto'], allergens: [] });
  assert.equal(r.status, gate.GATE_STATUS.CERTIFIED);
  assert.equal(r.certified, true, 'deterministic verdict unchanged — still certified');
  assert.equal(r.dietSafetyCertified, false, 'diet sub-verdict is false');
  assert.equal(r.acceptable, true, 'shadow: diet failure does NOT block a deterministic-certified week');
  assert.equal(r.hardGateComplete, false, 'hard gate never complete while authorization is unavailable');
});

// ── CASE 3 — deterministic NOT certified, diet certified, shadow ──────────
test('CASE 3: det NOT certified + diet certified (shadow) → certified false, acceptable false', async () => {
  const r = await overBudget({ diets: ['vegetarian'], allergens: [] });
  assert.equal(r.status, gate.GATE_STATUS.SHADOW_UNCERTIFIED);
  assert.equal(r.certified, false, 'over-budget → deterministic fails');
  assert.equal(r.dietSafetyCertified, true, 'week is vegetarian-safe and fully resolved');
  assert.equal(r.acceptable, false, 'a deterministic failure always makes acceptable false');
  assert.equal(r.hardGateComplete, false);
});

// ── CASE 4 — deterministic NOT certified, diet NOT certified, shadow ─────
test('CASE 4: det NOT certified + diet NOT certified (shadow) → certified false, acceptable false', async () => {
  const r = await overBudget({ diets: ['keto'], allergens: [] });
  assert.equal(r.status, gate.GATE_STATUS.SHADOW_UNCERTIFIED);
  assert.equal(r.certified, false);
  assert.equal(r.dietSafetyCertified, false, 'keto is an unsupported hard rule');
  assert.equal(r.acceptable, false);
  assert.equal(r.hardGateComplete, false);
});

// ── the equation is live, not a no-op — via the tests-only injection seam ─
test('equation composes: under hardGateAuthorized, det-certified + diet-uncertified ⇒ acceptable false', async () => {
  // hardGateAuthorized is the documented tests-only seam. The production
  // constant HARD_GATE_PRODUCTION_AUTHORIZED is untouched and still false.
  const r = await gate.runCertificationGate({
    days: certifiableDays(),
    requestedBudgetCents: 100000,
    currency: 'USD',
    mode: gate.GATE_MODE.ON,
    hardGateAuthorized: true,
    diets: ['keto'],
    allergens: [],
  });
  assert.equal(r.certified, true, 'deterministic still certified');
  assert.equal(r.dietSafetyCertified, false);
  assert.equal(r.acceptable, false, 'authorizedHardDiet ⇒ diet failure blocks acceptance');
  assert.equal(r.hardGateComplete, false, 'hardGateComplete = authorizedHardDiet && acceptable = true && false');
});

test('and under hardGateAuthorized with both certified ⇒ acceptable true, hardGateComplete true', async () => {
  const r = await gate.runCertificationGate({
    days: certifiableDays(),
    requestedBudgetCents: 100000,
    currency: 'USD',
    mode: gate.GATE_MODE.ON,
    hardGateAuthorized: true,
    diets: ['vegetarian'],
    allergens: [],
  });
  assert.equal(r.certified, true);
  assert.equal(r.dietSafetyCertified, true);
  assert.equal(r.acceptable, true);
  assert.equal(r.hardGateComplete, true, 'the ONLY path to hardGateComplete=true is the tests-only seam');
});

// ── deterministicStatus is surfaced, and separate from the gate status ───
test('deterministicStatus surfaces the assessment sub-statuses, distinct from gate status', async () => {
  const ok = await run(certifiableDays(), { diets: [], allergens: [] });
  assert.deepEqual(Object.keys(ok.deterministicStatus).sort(),
    ['canonicalCoverage', 'nutritionCoverage', 'purchase', 'structure']);
  assert.equal(ok.deterministicStatus.structure, 'ok');
  assert.equal(ok.deterministicStatus.canonicalCoverage, 'covered');
  assert.equal(ok.deterministicStatus.nutritionCoverage, 'complete');
  assert.equal(typeof ok.deterministicStatus.purchase, 'string');

  const bad = await overBudget({ diets: [], allergens: [] });
  assert.equal(bad.certified, false);
  // gate status vs deterministic sub-status are independent handles
  assert.equal(bad.status, gate.GATE_STATUS.SHADOW_UNCERTIFIED);
  // resolution + nutrition still fine; the purchase dimension is what fails
  assert.equal(bad.deterministicStatus.canonicalCoverage, 'covered');
  assert.equal(bad.deterministicStatus.nutritionCoverage, 'complete');
  assert.equal(typeof bad.deterministicStatus.purchase, 'string');
});

// ── certified was NOT redefined ─────────────────────────────────────────
test('certified still means the deterministic-only verdict (equals gateResult.certified)', async () => {
  const a = await run(certifiableDays(), { diets: ['vegan', 'keto'], allergens: ['peanut', 'weird'] });
  assert.equal(a.certified, a.gateResult.certified,
    'top-level certified mirrors the deterministic assessment, not the combined verdict');
  assert.equal(a.certified, true);
  assert.equal(a.acceptable, true); // shadow
});

// ── status vocabulary unchanged ────────────────────────────────────────
test('GATE_STATUS vocabulary unchanged — no new members', () => {
  assert.deepEqual(Object.keys(gate.GATE_STATUS).sort(), ['CERTIFIED', 'FAILED', 'SHADOW_UNCERTIFIED']);
});

// ── authorization / version constants unchanged ────────────────────────
test('frozen constants unchanged by C3A-2', () => {
  assert.equal(gate.HARD_GATE_PRODUCTION_AUTHORIZED, false);
  assert.equal(gate.DIETARY_ALLERGEN_SUBSTRATE_PRESENT, false);
  assert.equal(gate.CERTIFICATION_VERSION, 1);
  assert.equal(require('../dietRestrictionContract').DIET_SUBSTRATE_VERSION, 1);
});

// ── privacy: the combined fields leak no restriction selections ─────────
test('combined result fields carry no diet/allergen selections (raw or normalised)', async () => {
  const r = await run(certifiableDays(), {
    diets: ['keto', 'my private diet'],
    allergens: ['peanut', 'strange private allergen'],
  });
  const scannable = {
    certified: r.certified,
    acceptable: r.acceptable,
    hardGateComplete: r.hardGateComplete,
    dietSafetyCertified: r.dietSafetyCertified,
    deterministicStatus: r.deterministicStatus,
  };
  const blob = JSON.stringify(scannable).toLowerCase();
  for (const bad of ['my private diet', 'strange private allergen', 'keto', 'peanut']) {
    assert.equal(blob.includes(bad), false, `"${bad}" must not appear in the combined result fields`);
  }
  assert.equal('activeDietIds' in scannable, false);
  assert.equal('activeAllergenIds' in scannable, false);
});

// ── normalization still runs exactly once (C3A-1 invariant holds) ───────
test('normalizeRestrictions still runs exactly once per gate execution', async () => {
  const drc = require('../dietRestrictionContract');
  const original = drc.normalizeRestrictions;
  let calls = 0;
  drc.normalizeRestrictions = function (...a) { calls += 1; return original.apply(this, a); };
  try {
    await run(certifiableDays(), { diets: ['vegan'], allergens: ['milk'] });
    assert.equal(calls, 1);
  } finally {
    drc.normalizeRestrictions = original;
  }
});
