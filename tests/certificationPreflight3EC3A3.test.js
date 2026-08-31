'use strict';

/**
 * Phase 3E-C3A-3 — unsupported-hard-restriction PREFLIGHT machinery.
 *
 * certificationGate.preflightRestrictions({ diets, allergens }) is the
 * gate-owned pre-generation entry point: it runs the SINGLE normalization
 * boundary and returns { normalized, preflight }. `preflight` is a privacy-safe
 * diagnostic:
 *   { observationalOnly, hasUnsupported, unsupportedRestrictionCount, unsupportedReasons }
 *
 * It is OBSERVATIONAL / INERT while HARD_GATE_PRODUCTION_AUTHORIZED is false:
 * it never rejects, never 422s, never skips generation, never changes
 * acceptable / certified / hardGateComplete, never triggers repair.
 *
 * No Anthropic calls, no network.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const gate = require('../certificationGate');
const dietRestrictionContract = require('../dietRestrictionContract');
const generationVocabulary = require('../generationVocabulary');

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

const pf = (diets = [], allergens = []) => gate.preflightRestrictions({ diets, allergens }).preflight;

const runShadow = (opts) => gate.runCertificationGate({
  days: certifiableDays(),
  requestedBudgetCents: 100000,
  currency: 'USD',
  mode: gate.GATE_MODE.SHADOW,
  ...opts,
});

// ── CASE 1 — supported hard restriction only ─────────────────────────────
test('CASE 1: supported hard diet only → no unsupported, empty reasons', () => {
  const p = pf(['vegan'], []);
  assert.equal(p.hasUnsupported, false);
  assert.equal(p.unsupportedRestrictionCount, 0);
  assert.deepEqual(p.unsupportedReasons, []);
  assert.equal(p.observationalOnly, true);
});

// ── CASE 2 — preference-only restriction ────────────────────────────────
test('CASE 2: preference-only restriction → non-blocking, not counted unsupported', () => {
  const p = pf(['mediterranean', 'high_protein'], []);
  assert.equal(p.hasUnsupported, false);
  assert.equal(p.unsupportedRestrictionCount, 0);
  assert.deepEqual(p.unsupportedReasons, []);
});

// ── CASE 3 — one unsupported hard restriction (keto) ────────────────────
test('CASE 3: keto → hasUnsupported, count 1, privacy-safe reason/channel, NO rejection in shadow', async () => {
  const p = pf(['keto'], []);
  assert.equal(p.hasUnsupported, true);
  assert.equal(p.unsupportedRestrictionCount, 1);
  assert.equal(p.unsupportedReasons.length, 1);
  assert.deepEqual(Object.keys(p.unsupportedReasons[0]).sort(), ['channel', 'reason']);
  assert.equal(p.unsupportedReasons[0].reason, 'unsupported_hard_rule');
  assert.equal(p.unsupportedReasons[0].channel, 'diets');

  // through the gate in shadow: generation/assessment continue, nothing blocks
  const r = await runShadow({ diets: ['keto'], allergens: [] });
  assert.notEqual(r.status, gate.GATE_STATUS.FAILED);
  assert.equal(r.repaired, false);
  assert.equal(r.repairAttempts, 0);
  assert.equal(r.preflight.hasUnsupported, true);
  assert.equal(r.preflight.observationalOnly, true);
  // acceptable is still exactly the deterministic verdict; hard gate not complete
  assert.equal(r.acceptable, r.certified);
  assert.equal(r.hardGateComplete, false);
});

// ── CASE 4 — multiple unsupported hard restrictions ─────────────────────
test('CASE 4: multiple unsupported → deterministic count, enum-only entries, no raw leakage', () => {
  const p = pf(['keto', 'halal', 'my private diet'], ['totally invented allergen']);
  assert.equal(p.hasUnsupported, true);
  assert.equal(p.unsupportedRestrictionCount, 4);
  const blob = JSON.stringify(p).toLowerCase();
  for (const raw of ['my private diet', 'totally invented allergen', 'keto', 'halal']) {
    assert.equal(blob.includes(raw), false, `"${raw}" must not appear in the preflight`);
  }
  for (const u of p.unsupportedReasons) {
    assert.deepEqual(Object.keys(u).sort(), ['channel', 'reason']);
    assert.ok(['unsupported_hard_rule', 'unrecognised', 'not_a_string', 'empty'].includes(u.reason));
    assert.ok(['diets', 'allergens'].includes(u.channel));
  }
  // deterministic: identical input → identical output
  assert.deepEqual(pf(['keto', 'halal', 'my private diet'], ['totally invented allergen']), p);
});

// ── CASE 5 — supported allergen + unsupported hard diet ─────────────────
test('CASE 5: supported allergen + unsupported diet → allergen stays supported, diet detected independently', async () => {
  const p = pf(['keto'], ['peanut']);
  assert.equal(p.unsupportedRestrictionCount, 1);
  assert.equal(p.unsupportedReasons[0].channel, 'diets');

  const r = await runShadow({ diets: ['keto'], allergens: ['peanut'] });
  assert.equal(r.dietSafety.supportedAllergenCount, 1, 'peanut still a supported allergen');
  assert.equal(r.preflight.unsupportedRestrictionCount, 1, 'only keto is unsupported');
});

// ── CASE 6 — pork through the allergy channel ──────────────────────────
test('CASE 6: pork in allergy channel → cross-normalizes to supported pork-free diet, NOT unsupported', async () => {
  const p = pf([], ['pork']);
  assert.equal(p.hasUnsupported, false);
  assert.equal(p.unsupportedRestrictionCount, 0);

  const r = await runShadow({ diets: [], allergens: ['pork'] });
  assert.equal(r.dietSafety.supportedDietCount, 1);
  assert.equal(r.dietSafety.supportedAllergenCount, 0);
});

// ── CASE 7 — generic "nut" expansion unchanged ─────────────────────────
test('CASE 7: generic nut input → not unsupported; frozen peanut+tree_nut expansion intact', async () => {
  const p = pf([], ['nut']);
  assert.equal(p.hasUnsupported, false);
  assert.equal(p.unsupportedRestrictionCount, 0);

  const r = await runShadow({ diets: [], allergens: ['nut'] });
  assert.equal(r.dietSafety.supportedAllergenCount, 2);
});

// ── invariants ────────────────────────────────────────────────────────
test('normalizeRestrictions runs exactly once for a full request (preflight + gate reuse)', async () => {
  const original = dietRestrictionContract.normalizeRestrictions;
  let calls = 0;
  dietRestrictionContract.normalizeRestrictions = function (...a) { calls += 1; return original.apply(this, a); };
  try {
    // server.js flow: preflight builds the context, gate reuses it
    const ctx = gate.preflightRestrictions({ diets: ['keto'], allergens: ['milk'] });
    await gate.runCertificationGate({
      days: certifiableDays(), requestedBudgetCents: 100000, currency: 'USD',
      mode: gate.GATE_MODE.SHADOW, restrictionContext: ctx,
      diets: ['keto'], allergens: ['milk'],
    });
    assert.equal(calls, 1, 'exactly one normalization for the whole request');
  } finally {
    dietRestrictionContract.normalizeRestrictions = original;
  }
});

test('gate still normalizes once for direct callers that pass no context', async () => {
  const original = dietRestrictionContract.normalizeRestrictions;
  let calls = 0;
  dietRestrictionContract.normalizeRestrictions = function (...a) { calls += 1; return original.apply(this, a); };
  try {
    await runShadow({ diets: ['keto'], allergens: [] });
    assert.equal(calls, 1);
  } finally {
    dietRestrictionContract.normalizeRestrictions = original;
  }
});

test('preflight cannot change acceptable / hardGateComplete / repair in shadow', async () => {
  const withUnsupported = await runShadow({ diets: ['keto'], allergens: ['invented'] });
  const withNone = await runShadow({ diets: [], allergens: [] });
  assert.equal(withUnsupported.acceptable, withUnsupported.certified);
  assert.equal(withUnsupported.hardGateComplete, false);
  assert.equal(withNone.hardGateComplete, false);
  assert.equal(withUnsupported.status, withNone.status, 'unsupported restrictions never move the gate status in shadow');
  assert.equal(withUnsupported.repaired, false);
});

test('preflight emits before the deterministic assessment (execution order)', async () => {
  const seen = [];
  await gate.runCertificationGate({
    days: certifiableDays(), requestedBudgetCents: 100000, currency: 'USD',
    mode: gate.GATE_MODE.SHADOW, diets: ['keto'], allergens: [],
    onEvent: (name) => seen.push(name),
  });
  const iPre = seen.indexOf('preflight_assessed');
  const iAssessed = seen.indexOf('assessed');
  assert.ok(iPre >= 0, 'preflight_assessed emitted');
  assert.ok(iAssessed >= 0, 'assessed emitted');
  assert.ok(iPre < iAssessed, 'preflight runs before the deterministic assessment');
});

test('FAILURE_REASON.UNSUPPORTED_HARD_RESTRICTION is defined but never emitted while unauthorized', async () => {
  assert.equal(gate.FAILURE_REASON.UNSUPPORTED_HARD_RESTRICTION, 'unsupported_hard_restriction');
  const seen = [];
  const r = await gate.runCertificationGate({
    days: certifiableDays(), requestedBudgetCents: 100000, currency: 'USD',
    mode: gate.GATE_MODE.ON, diets: ['keto'], allergens: ['invented'], // requested ON, downgraded to shadow
    onEvent: (name, payload) => seen.push([name, payload]),
  });
  assert.notEqual(r.status, gate.GATE_STATUS.FAILED);
  const anyEmitted = seen.some(([, p]) => p && p.reason === 'unsupported_hard_restriction')
    || (r.failureReason === 'unsupported_hard_restriction');
  assert.equal(anyEmitted, false, 'the reserved reason is never produced while HARD_GATE_PRODUCTION_AUTHORIZED is false');
});

test('frozen constants / versions unchanged by C3A-3', () => {
  assert.equal(gate.HARD_GATE_PRODUCTION_AUTHORIZED, false);
  assert.equal(gate.DIETARY_ALLERGEN_SUBSTRATE_PRESENT, false);
  assert.equal(gate.CERTIFICATION_VERSION, 1);
  assert.equal(dietRestrictionContract.DIET_SUBSTRATE_VERSION, 1);
  assert.deepEqual(Object.keys(gate.GATE_STATUS).sort(), ['CERTIFIED', 'FAILED', 'SHADOW_UNCERTIFIED']);
});
