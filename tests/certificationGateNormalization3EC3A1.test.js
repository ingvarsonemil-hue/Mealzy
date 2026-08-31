'use strict';

/**
 * Phase 3E-C3A-1 — gate-owned single normalization boundary.
 *
 * runCertificationGate owns the interpretation of the raw diet/allergen
 * channels: it calls dietRestrictionContract.normalizeRestrictions EXACTLY
 * ONCE per gate execution and reuses that frozen object for the dietary/
 * allergen shadow assessment. dietSafety receives the already-normalised
 * object and does not normalise a second time.
 *
 * No Anthropic calls, no network — every "week" is synthetic structured data
 * and effective mode is 'shadow' (never repairs, never blocks).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const gate = require('../certificationGate');
const dietRestrictionContract = require('../dietRestrictionContract');
const dietSafety = require('../dietSafety');

const meal = (ings) => ({ type: 'breakfast', name: 'test meal', ingredients: ings });
const day = (...meals) => ({ meals });

const week = () => ({
  days: [day(meal([
    { name: 'white rice', amountValue: 60, amountUnit: 'g' },
    { name: 'broccoli', amountValue: 80, amountUnit: 'g' },
  ]))],
  requestedBudgetCents: 500000,
  currency: 'USD',
});

/** Wrap a module export with a call counter, restore via the returned fn. */
function spy(obj, name) {
  const original = obj[name];
  const calls = [];
  obj[name] = function (...args) {
    calls.push(args);
    return original.apply(this, args);
  };
  return { calls, restore: () => { obj[name] = original; } };
}

async function runShadow(opts) {
  return gate.runCertificationGate({
    days: week().days,
    requestedBudgetCents: 500000,
    currency: 'USD',
    mode: gate.GATE_MODE.SHADOW,
    ...opts,
  });
}

test('A1. one gate execution → exactly one normalizeRestrictions call', async () => {
  const nrm = spy(dietRestrictionContract, 'normalizeRestrictions');
  try {
    await runShadow({ diets: ['vegan'], allergens: ['peanut'] });
    assert.equal(nrm.calls.length, 1, 'normalizeRestrictions called exactly once per gate run');
    assert.deepEqual(nrm.calls[0][0], { diets: ['vegan'], allergens: ['peanut'] });
  } finally {
    nrm.restore();
  }
});

test('A2. the already-normalised object reaches dietSafety.assessWeek — no second normalization', async () => {
  const nrm = spy(dietRestrictionContract, 'normalizeRestrictions');
  const asw = spy(dietSafety, 'assessWeek');
  try {
    await runShadow({ diets: ['vegetarian'], allergens: ['milk'] });
    assert.equal(nrm.calls.length, 1);
    assert.equal(asw.calls.length, 1, 'dietSafety.assessWeek called once');
    const passedRestrictions = asw.calls[0][1];
    assert.ok(Array.isArray(passedRestrictions.activeDietIds),
      'assessWeek received a pre-normalised object (has activeDietIds)');
    assert.deepEqual([...passedRestrictions.activeDietIds], ['vegetarian']);
    assert.deepEqual([...passedRestrictions.activeAllergenIds], ['milk']);
  } finally {
    asw.restore();
    nrm.restore();
  }
});

test('A3. supported diets + allergens normalize correctly through the gate', async () => {
  const out = await runShadow({
    diets: ['vegan', 'Gluten Free'],
    allergens: ['peanuts', 'shellfish'],
  });
  assert.equal(out.dietSafety.supportedDietCount, 2);      // vegan + gluten-free
  assert.equal(out.dietSafety.supportedAllergenCount, 2);  // peanut + crustacean_shellfish
  assert.equal(out.dietSafety.unsupportedRestrictionCount, 0);
});

test('A4. preference-only selections are represented, never counted as unsupported', async () => {
  const out = await runShadow({ diets: ['mediterranean', 'high_protein'], allergens: [] });
  assert.equal(out.dietSafety.preferenceOnlyCount, 2);
  assert.equal(out.dietSafety.unsupportedRestrictionCount, 0);
  assert.equal(out.dietSafety.supportedDietCount, 0);
});

test('A5. unsupported selections stay explicit', async () => {
  const out = await runShadow({ diets: ['keto', 'totally made up'], allergens: [] });
  assert.equal(out.dietSafety.unsupportedRestrictionCount, 2);
  const reasons = out.dietSafety.unsupportedReasons.map((u) => u.reason).sort();
  assert.deepEqual(reasons, ['unrecognised', 'unsupported_hard_rule']);
});

test('A6. pork in the allergy channel still cross-normalizes to the pork-free diet', async () => {
  const out = await runShadow({ diets: [], allergens: ['pork'] });
  // pork is not an allergen — it becomes a supported hard diet, not an allergen tag
  assert.equal(out.dietSafety.supportedDietCount, 1);
  assert.equal(out.dietSafety.supportedAllergenCount, 0);
  assert.equal(out.dietSafety.unsupportedRestrictionCount, 0);
});

test('A7. generic "nut" input still expands per the frozen contract (peanut + tree_nut)', async () => {
  const out = await runShadow({ diets: [], allergens: ['nut'] });
  assert.equal(out.dietSafety.supportedAllergenCount, 2);
});

test('A8. shadow stays observational — no block, no repair, no 422', async () => {
  let repairCalls = 0;
  const out = await runShadow({
    diets: ['vegan'],
    allergens: [],
    generateRepairedWeek: async () => { repairCalls += 1; return week().days; },
  });
  assert.equal(repairCalls, 0);
  assert.equal(out.repaired, false);
  assert.equal(out.dietSafety.observationalOnly, true);
  assert.equal(out.hardGateComplete, false);
  assert.ok(out.status === gate.GATE_STATUS.CERTIFIED || out.status === gate.GATE_STATUS.SHADOW_UNCERTIFIED);
});

test('A9. frozen constants unchanged by C3A-1', () => {
  assert.equal(gate.CERTIFICATION_VERSION, 1);
  assert.equal(gate.HARD_GATE_PRODUCTION_AUTHORIZED, false);
  assert.equal(gate.DIETARY_ALLERGEN_SUBSTRATE_PRESENT, false);
  assert.equal(dietRestrictionContract.DIET_SUBSTRATE_VERSION, 1);
});

test('A10. standalone assessGeneratedWeekDietSafetyShadow still accepts raw channels', () => {
  const out = gate.assessGeneratedWeekDietSafetyShadow(
    { days: week().days },
    { diets: ['vegan'], allergens: [] },
  );
  assert.equal(out.observationalOnly, true);
  assert.equal(out.dietSubstrateVersion, 1);
});
