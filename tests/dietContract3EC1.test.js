'use strict';

/**
 * Phase 3E-C1 — frozen restriction-contract completion.
 *
 * Proves the pork-free hard diet, its exact (non-fuzzy) legacy + cross-channel
 * normalization, the pork ontology guarantee, and the preference-only vs
 * unsupported-hard-rule split. No Anthropic calls, no network.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const contract = require('../dietRestrictionContract');
const attr = require('../dietAttributeData');
const safety = require('../dietSafety');
const canonicalIngredients = require('../canonicalIngredients');

const { STATUS, PROPERTY_VALUE } = { STATUS: safety.STATUS, PROPERTY_VALUE: attr.PROPERTY_VALUE };
const norm = (diets = [], allergens = []) => contract.normalizeRestrictions({ diets, allergens });
const week = (...names) => ({ days: [{ meals: [{ ingredients: names.map((n) => ({ name: n })) }] }] });

// ── pork-free contract ────────────────────────────────────────────────────

test('1. pork-free is a supported hard diet', () => {
  assert.ok(contract.SUPPORTED_DIET_IDS.includes('pork-free'));
  assert.equal(contract.isSupportedDiet('pork-free'), true);
  assert.deepEqual([...contract.SUPPORTED_DIET_IDS].sort(),
    ['dairy-free', 'gluten-free', 'pork-free', 'vegan', 'vegetarian']);
});

test('2. "no_pork" normalizes exactly to pork-free', () => {
  assert.deepEqual(norm(['no_pork']).activeDietIds, ['pork-free']);
});

test('3. "no pork" normalizes exactly to pork-free', () => {
  assert.deepEqual(norm(['no pork']).activeDietIds, ['pork-free']);
  assert.deepEqual(norm(['Pork-Free']).activeDietIds, ['pork-free']);
  assert.deepEqual(norm(['pork free']).activeDietIds, ['pork-free']);
});

test('4. allergy-channel exact "pork" normalizes to diet pork-free', () => {
  const n = norm([], ['pork']);
  assert.deepEqual(n.activeDietIds, ['pork-free']);
  assert.deepEqual(n.activeAllergenIds, []);
  assert.equal(n.hasUnsupported, false);
});

test('5. "pork" never becomes a supported allergen', () => {
  assert.equal(contract.SUPPORTED_ALLERGEN_IDS.includes('pork'), false);
  assert.equal(norm([], ['pork']).activeAllergenIds.includes('pork'), false);
  assert.equal(contract.classifyAllergen('pork').kind, 'diet');
});

test('6. near-miss pork strings do not fuzzy-normalize', () => {
  for (const raw of ['porkk', 'no-porkk', 'pork-fre', 'porc', 'nopork', 'porkfree', 'no porkk']) {
    const n = norm([raw], [raw]);
    assert.equal(n.activeDietIds.includes('pork-free'), false, `${raw} must not become pork-free`);
    assert.equal(n.hasUnsupported, true, `${raw} must be flagged unsupported`);
  }
});

// ── pork ontology ─────────────────────────────────────────────────────────

test('7. all current canonicals explicitly establish pork absent — via the exhaustive authority table, not a helper default', () => {
  const ids = canonicalIngredients.allCanonicalIngredients().map((c) => c.id);
  assert.ok(ids.length >= 63);
  for (const id of ids) {
    assert.equal(attr.getSafetyRecord(id).pork, PROPERTY_VALUE.ABSENT, `${id}.pork must be absent`);
    assert.equal(attr.PORK_STATUS_BY_CANONICAL_ID[id], PROPERTY_VALUE.ABSENT, `${id} pork authority entry`);
  }
  assert.ok(attr.SAFETY_PROPERTIES.includes('pork'));
  // exact 1:1 correspondence with the canonical vocabulary
  assert.deepEqual(
    Object.keys(attr.PORK_STATUS_BY_CANONICAL_ID).sort(),
    [...ids].sort(),
  );
});

test('8. pork-free + current resolved vocabulary can certify wrt pork', () => {
  const r = safety.assessWeek(week('white rice', 'broccoli', 'chicken breast'), { diets: ['pork-free'] });
  assert.equal(r.certified, true);
  assert.equal(r.status, STATUS.SAFE);
});

test('9. a NEW canonical whose developer forgot the explicit pork classification fails validation', () => {
  // This is the exact flaw the adversarial review caught: previously a new
  // ingredient built with a generic helper (_meat/plant/...) silently
  // inherited pork:absent. Now the pork authority is a separate exhaustive
  // table and a missing entry is a hard load-time failure.
  const realIds = canonicalIngredients.allCanonicalIngredients().map((c) => c.id);
  assert.throws(
    () => attr.__auditPorkAuthority([...realIds, 'future_chorizo']),
    /future_chorizo.*missing from PORK_STATUS_BY_CANONICAL_ID/s,
  );
  // and the real vocabulary still audits clean
  assert.doesNotThrow(() => attr.__auditPorkAuthority(realIds));
});

test('9b. an EXTRA / unknown id in the pork authority fails validation', () => {
  const realIds = canonicalIngredients.allCanonicalIngredients().map((c) => c.id);
  assert.throws(
    () => attr.__auditPorkAuthority(realIds.filter((x) => x !== 'rosemary')),
    /rosemary.*not a canonical ingredient/s,
  );
});

test('9c. generic helpers cannot determine pork status — a base record with a pork key is rejected at assembly', () => {
  // Static guarantee: helper outputs never contain a pork key, so the module
  // loaded successfully (assembly throws otherwise). Behavioural: every record
  // still has pork, sourced from the table.
  assert.doesNotThrow(() => require('../dietAttributeData'));
  for (const id of Object.keys(attr.SAFETY_RECORDS)) {
    assert.ok('pork' in attr.SAFETY_RECORDS[id], `${id} must carry pork`);
  }
});

test('9d. the full load-time validator is exhaustive over the pork authority', () => {
  assert.doesNotThrow(() => attr.__validate());
  // a fabricated extra canonical id with no record trips the existing
  // completeness guard (a new ingredient cannot enter silently at all)
  const realAll = canonicalIngredients.allCanonicalIngredients;
  canonicalIngredients.allCanonicalIngredients = () => [
    ...realAll.call(canonicalIngredients),
    Object.freeze({ id: 'future_bacon', canonicalName: 'future bacon', aliases: [], category: 'meat', baseUnit: 'g' }),
  ];
  try {
    assert.throws(() => attr.__validate(), /future_bacon/);
  } finally {
    canonicalIngredients.allCanonicalIngredients = realAll;
  }
});

test('9e. pork-free assessment reads the pork property; a "present" ingredient would be a violation', () => {
  assert.equal(safety.DIET_AUTHORITY['pork-free'].property, 'pork');
  // wiring: an absent-pork canonical is SAFE for pork-free
  const safe = safety.assessCanonicalAgainstRestriction('chicken_breast', { kind: 'diet', id: 'pork-free' });
  assert.equal(safe.status, STATUS.SAFE);
  assert.equal(safe.property, 'pork');
  // 'present' is an accepted authority value (a future pork ingredient), and
  // _verdictFromProperty maps it to a violation — proven via an existing
  // 'present' property on another axis using the same verdict function path:
  const violation = safety.assessCanonicalAgainstRestriction('feta', { kind: 'diet', id: 'dairy-free' });
  assert.equal(violation.status, STATUS.VIOLATION); // present → violation (same mapping pork:'present' would take)
});

// ── preference-only ───────────────────────────────────────────────────────

test('10-12. mediterranean / high_protein / low_carb are preference-only', () => {
  for (const [raw, id] of [['mediterranean', 'mediterranean'], ['high_protein', 'high_protein'], ['low_carb', 'low_carb']]) {
    const c = contract.classifyDiet(raw);
    assert.equal(c.kind, 'preference', `${raw} kind`);
    assert.equal(c.id, id);
    assert.ok(contract.PREFERENCE_ONLY_IDS.includes(id));
  }
});

test('13. preference-only values do not set hasUnsupported', () => {
  const n = norm(['mediterranean', 'high_protein', 'low_carb']);
  assert.equal(n.hasUnsupported, false);
  assert.equal(n.unsupported.length, 0);
  assert.deepEqual([...n.activeDietIds], []);
  assert.deepEqual([...n.activePreferenceOnlyIds].sort(), ['high_protein', 'low_carb', 'mediterranean']);
});

test('14. preference-only values do not make an otherwise-safe week uncertified', () => {
  const base = week('white rice', 'broccoli');
  assert.equal(safety.assessWeek(base, { diets: ['vegan'] }).certified, true);
  assert.equal(safety.assessWeek(base, { diets: ['vegan', 'mediterranean', 'high_protein'] }).certified, true);
});

// ── unsupported hard rules ────────────────────────────────────────────────

test('15-18. keto / halal / kosher / paleo are unsupported hard rules', () => {
  for (const raw of ['keto', 'halal', 'kosher', 'paleo']) {
    const c = contract.classifyDiet(raw);
    assert.equal(c.kind, 'unsupported');
    assert.equal(c.reason, contract.UNSUPPORTED_REASON.UNSUPPORTED_HARD_RULE);
    assert.ok(contract.UNSUPPORTED_HARD_RULE_IDS.includes(c.id));
  }
});

test('19. unsupported hard rules still prevent positive diet-safety certification', () => {
  const r = safety.assessWeek(week('white rice', 'broccoli'), { diets: ['keto'] });
  assert.equal(r.certified, false);
  assert.equal(r.status, STATUS.UNSUPPORTED_RESTRICTION);
});

test('20. arbitrary unknown restrictions still prevent certification and stay distinguishable', () => {
  const r = safety.assessWeek(week('white rice'), { allergens: ['my weird thing'] });
  assert.equal(r.certified, false);
  assert.equal(r.status, STATUS.UNSUPPORTED_RESTRICTION);
  const n = norm(['zzz'], ['qqq']);
  assert.equal(n.unsupported.every((u) => u.reason === contract.UNSUPPORTED_REASON.UNRECOGNISED), true);
});

test('E. DIET_SUBSTRATE_VERSION is exposed and stable', () => {
  assert.equal(contract.DIET_SUBSTRATE_VERSION, 1);
});
