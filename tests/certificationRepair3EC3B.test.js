'use strict';

/**
 * Phase 3E-C3B — the ONE combined deterministic + dietary certification repair.
 *
 * Frozen rules exercised here:
 *   - shadow performs ZERO certification repair calls (CASE 7-9)
 *   - authorized hard mode performs AT MOST ONE repair, shared by deterministic
 *     AND dietary failures (CASE 2-6)
 *   - after the one repair BOTH dimensions are reassessed against the SAME
 *     normalized restriction context, and `acceptable` is recomposed
 *   - no second repair; failure-reason precedence: deterministic first, then
 *     diet_uncertified_after_repair
 *   - normalizeRestrictions still runs exactly ONCE across preflight + round 0 +
 *     repair + round 1
 *
 * Authorized hard mode is reached ONLY through the documented tests-only
 * `hardGateAuthorized` seam. HARD_GATE_PRODUCTION_AUTHORIZED stays false.
 *
 * No real Anthropic calls — `generateRepairedWeek` is always a local stub.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const gate = require('../certificationGate');
const dietRestrictionContract = require('../dietRestrictionContract');
const generationVocabulary = require('../generationVocabulary');

const el = generationVocabulary.getGenerationEligibleIngredients();
const rice = el.find((i) => i.canonicalName.includes('rice'));
const veg = el.find((i) => i.category === 'produce');
const oil = el.find((i) => i.category === 'pantry');
const chicken = el.find((i) => i.canonicalName === 'chicken breast');

// Deterministically certifiable AND vegan-safe.
const cleanMeal = {
  type: 'dinner', name: 'Clean bowl',
  ingredients: [
    { name: rice.canonicalName, amountValue: 100, amountUnit: rice.baseUnit },
    { name: veg.canonicalName, amountValue: 150, amountUnit: veg.baseUnit },
    { name: oil.canonicalName, amountValue: 10, amountUnit: oil.baseUnit },
  ],
};
const cleanDays = () => Array.from({ length: 7 }, () => ({ meals: [{ ...cleanMeal }] }));

// Deterministically certifiable BUT vegan-violating (chicken).
const meatMeal = {
  type: 'dinner', name: 'Meat bowl',
  ingredients: [
    { name: chicken.canonicalName, amountValue: 150, amountUnit: chicken.baseUnit },
    { name: rice.canonicalName, amountValue: 100, amountUnit: rice.baseUnit },
    { name: veg.canonicalName, amountValue: 150, amountUnit: veg.baseUnit },
  ],
};
const meatDays = () => Array.from({ length: 7 }, () => ({ meals: [{ ...meatMeal }] }));

// Deterministically UNCERTIFIED (unresolved ingredient) — also diet-unresolved.
const brokenDays = () => [{ meals: [{ type: 'dinner', name: 'x', ingredients: [{ name: 'moon cheese crumble', amountValue: 30, amountUnit: 'g' }] }] }];

function runAuthorized(days, { diets = [], allergens = [], repairReturns, countRepairs } = {}) {
  return gate.runCertificationGate({
    days,
    requestedBudgetCents: 300000,
    currency: 'USD',
    mode: gate.GATE_MODE.ON,
    hardGateAuthorized: true,       // documented tests-only seam
    diets,
    allergens,
    generateRepairedWeek: async () => {
      if (countRepairs) countRepairs.n += 1;
      return typeof repairReturns === 'function' ? repairReturns() : cleanDays();
    },
  });
}

function runShadow(days, { diets = [], allergens = [], countRepairs } = {}) {
  return gate.runCertificationGate({
    days,
    requestedBudgetCents: 300000,
    currency: 'USD',
    mode: gate.GATE_MODE.SHADOW,
    diets,
    allergens,
    generateRepairedWeek: async () => { if (countRepairs) countRepairs.n += 1; return cleanDays(); },
  });
}

// ── CASE 1 — authorized, deterministic pass, diet pass ────────────────────
test('CASE 1: authorized, det pass + diet pass → acceptable, no repair', async () => {
  const c = { n: 0 };
  const r = await runAuthorized(cleanDays(), { diets: ['vegan'], countRepairs: c });
  assert.equal(r.enforced, true);
  assert.equal(r.acceptable, true);
  assert.equal(r.repaired, false);
  assert.equal(r.repairAttempts, 0);
  assert.equal(c.n, 0);
  assert.equal(r.hardGateComplete, true);
});

// ── CASE 2 — authorized, deterministic fail, diet pass, repair succeeds ───
test('CASE 2: authorized, det fail + diet pass, repair fixes → 1 repair, both reassessed, acceptable', async () => {
  const c = { n: 0 };
  const r = await runAuthorized(brokenDays(), { diets: ['vegan'], repairReturns: cleanDays, countRepairs: c });
  assert.equal(c.n, 1, 'exactly one repair');
  assert.equal(r.repaired, true);
  assert.equal(r.repairAttempts, 1);
  assert.equal(r.certified, true, 'deterministic reassessed and now passes');
  assert.equal(r.dietSafetyCertified, true, 'diet reassessed on the repaired week');
  assert.equal(r.acceptable, true);
  assert.equal(r.status, gate.GATE_STATUS.CERTIFIED);
});

// ── CASE 3 — authorized, deterministic pass, diet fail, repair succeeds ──
test('CASE 3: authorized, det pass + diet fail, repair fixes diet → 1 repair, acceptable', async () => {
  const c = { n: 0 };
  const r = await runAuthorized(meatDays(), { diets: ['vegan'], repairReturns: cleanDays, countRepairs: c });
  assert.equal(c.n, 1, 'exactly one repair');
  assert.equal(r.certified, true);
  assert.equal(r.dietSafetyCertified, true, 'diet fixed and reassessed');
  assert.equal(r.acceptable, true);
  assert.equal(r.repairAttempts, 1);
});

// ── CASE 4 — authorized, both fail, ONE repair fixes both ───────────────
test('CASE 4: authorized, det fail + diet fail, one repair fixes both → exactly 1 repair', async () => {
  const c = { n: 0 };
  const r = await runAuthorized(brokenDays(), { diets: ['vegan'], repairReturns: cleanDays, countRepairs: c });
  assert.equal(c.n, 1, 'ONE combined repair, not two');
  assert.equal(r.certified, true);
  assert.equal(r.dietSafetyCertified, true);
  assert.equal(r.acceptable, true);
  assert.equal(r.repairAttempts, 1);
});

// ── CASE 5 — authorized, diet remains failed after repair ──────────────
test('CASE 5: authorized, diet still fails after the one repair → diet_uncertified_after_repair, no 2nd repair', async () => {
  const c = { n: 0 };
  // keto is unsupported → diet can never certify; deterministic passes throughout
  const r = await runAuthorized(cleanDays(), { diets: ['keto'], repairReturns: cleanDays, countRepairs: c });
  assert.equal(c.n, 1, 'exactly one repair, no second');
  assert.equal(r.certified, true, 'deterministic passes');
  assert.equal(r.dietSafetyCertified, false);
  assert.equal(r.acceptable, false);
  assert.equal(r.status, gate.GATE_STATUS.FAILED);
  assert.equal(r.failureReason, gate.FAILURE_REASON.DIET_UNCERTIFIED_AFTER_REPAIR);
  assert.equal(r.repaired, true);
  assert.equal(r.repairAttempts, 1);
  assert.equal(r.retry, true);
});

// ── CASE 6 — authorized, deterministic remains failed after repair ─────
test('CASE 6: authorized, deterministic still fails after the one repair → uncertified_after_repair, no 2nd repair', async () => {
  const c = { n: 0 };
  const r = await runAuthorized(brokenDays(), { diets: ['vegan'], repairReturns: brokenDays, countRepairs: c });
  assert.equal(c.n, 1, 'exactly one repair, no second');
  assert.equal(r.certified, false);
  assert.equal(r.acceptable, false);
  assert.equal(r.status, gate.GATE_STATUS.FAILED);
  assert.equal(r.failureReason, gate.FAILURE_REASON.UNCERTIFIED_AFTER_REPAIR);
  assert.ok(r.deterministicStatus.canonicalCoverage === 'incomplete');
  assert.equal(r.repairAttempts, 1);
});

// ── CASE 6b — both remain failed → deterministic reason wins ───────────
test('CASE 6b: authorized, both still fail after repair → deterministic reason takes precedence', async () => {
  const r = await runAuthorized(brokenDays(), { diets: ['keto'], repairReturns: brokenDays });
  assert.equal(r.certified, false);
  assert.equal(r.dietSafetyCertified, false);
  assert.equal(r.failureReason, gate.FAILURE_REASON.UNCERTIFIED_AFTER_REPAIR, 'deterministic precedence');
  assert.equal(r.repairAttempts, 1);
});

// ── CASE 7-9 — shadow performs ZERO certification repairs ──────────────
test('CASE 7: shadow deterministic failure → 0 certification repair calls', async () => {
  const c = { n: 0 };
  const r = await runShadow(brokenDays(), { diets: ['vegan'], countRepairs: c });
  assert.equal(c.n, 0);
  assert.equal(r.repaired, false);
  assert.equal(r.repairAttempts, 0);
  assert.equal(r.enforced, false);
  assert.notEqual(r.status, gate.GATE_STATUS.FAILED);
});

test('CASE 8: shadow diet failure → 0 certification repair calls', async () => {
  const c = { n: 0 };
  const r = await runShadow(meatDays(), { diets: ['vegan'], countRepairs: c });
  assert.equal(c.n, 0);
  assert.equal(r.dietSafetyCertified, false);
  assert.equal(r.acceptable, r.certified, 'shadow: acceptable === certified');
  assert.equal(r.repairAttempts, 0);
});

test('CASE 9: shadow deterministic + diet failure → 0 certification repair calls', async () => {
  const c = { n: 0 };
  const r = await runShadow(brokenDays(), { diets: ['keto'], countRepairs: c });
  assert.equal(c.n, 0);
  assert.equal(r.repaired, false);
  assert.equal(r.repairAttempts, 0);
  assert.equal(r.hardGateComplete, false);
});

// ── normalization reuse across the WHOLE request incl. repair ──────────
test('normalizeRestrictions runs exactly ONCE across preflight + round 0 + repair + round 1', async () => {
  const original = dietRestrictionContract.normalizeRestrictions;
  let calls = 0;
  dietRestrictionContract.normalizeRestrictions = function (...a) { calls += 1; return original.apply(this, a); };
  try {
    const ctx = gate.preflightRestrictions({ diets: ['vegan'], allergens: ['milk'] });
    const r = await gate.runCertificationGate({
      days: brokenDays(), requestedBudgetCents: 300000, currency: 'USD',
      mode: gate.GATE_MODE.ON, hardGateAuthorized: true,
      restrictionContext: ctx,
      generateRepairedWeek: async () => cleanDays(),
    });
    assert.equal(r.repairAttempts, 1, 'a repair actually happened');
    assert.equal(calls, 1, 'exactly one normalization for the whole request, repair included');
  } finally {
    dietRestrictionContract.normalizeRestrictions = original;
  }
});

// ── repair instruction carries BOTH dimensions, no raw restriction text ─
test('the ONE repair instruction combines deterministic + dietary failures, privacy-safe', async () => {
  let seenInstruction = null;
  await gate.runCertificationGate({
    days: brokenDays(), requestedBudgetCents: 300000, currency: 'USD',
    mode: gate.GATE_MODE.ON, hardGateAuthorized: true,
    diets: ['vegan', 'my secret regimen'], allergens: ['peanut'],
    generateRepairedWeek: async (gr, instruction) => { seenInstruction = instruction; return cleanDays(); },
  });
  assert.ok(seenInstruction, 'repair instruction was built');
  assert.ok(/deterministic verifier rejected/i.test(seenInstruction), 'has the deterministic section');
  assert.ok(/dietary\/allergen safety/i.test(seenInstruction), 'has the dietary section');
  assert.equal(seenInstruction.toLowerCase().includes('my secret regimen'), false, 'no raw restriction text');
});

// ── frozen constants ──────────────────────────────────────────────────
test('frozen constants / versions unchanged by C3B', () => {
  assert.equal(gate.HARD_GATE_PRODUCTION_AUTHORIZED, false);
  assert.equal(gate.DIETARY_ALLERGEN_SUBSTRATE_PRESENT, false);
  assert.equal(gate.CERTIFICATION_VERSION, 1);
  assert.equal(dietRestrictionContract.DIET_SUBSTRATE_VERSION, 1);
  assert.deepEqual(Object.keys(gate.GATE_STATUS).sort(), ['CERTIFIED', 'FAILED', 'SHADOW_UNCERTIFIED']);
  assert.equal(gate.FAILURE_REASON.DIET_UNCERTIFIED_AFTER_REPAIR, 'diet_uncertified_after_repair');
});
