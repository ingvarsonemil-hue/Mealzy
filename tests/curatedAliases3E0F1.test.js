'use strict';

/**
 * Phase 3E0-F1 — curated alias tranche (canonicalIngredientData.js).
 *
 * 21 explicit static aliases across 13 existing canonicals, verified in the
 * 3E0-E full-stack inventory as presentation/preparation/variety-preserving
 * synonyms of the SAME real-world ingredient. NO generic normalizer, NO fuzzy
 * matching, NO singularization, NO qualifier-stripping engine — every entry is
 * a literal string in the existing curated `aliases` array.
 *
 * Load-bearing guarantees:
 *   - identity only: an alias never changes a canonical base unit, and never
 *     makes an incompatible generated unit valid (incompatible_unit still fails)
 *   - cooked-grain / semantic-variant forms deliberately stay unresolved
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const ci = require('../canonicalIngredients');
const cert = require('../certificationAssessment');

// exact raw form -> intended canonical id
const ALIASES = [
  ['garlic (minced)', 'garlic'],
  ['garlic cloves (minced)', 'garlic'],
  ['garlic cloves, minced', 'garlic'],
  ['chicken thigh (boneless, skinless)', 'chicken_thighs'],
  ['chicken thigh, boneless skinless', 'chicken_thighs'],
  ['chicken breast (skinless)', 'chicken_breast'],
  ['canned chickpeas, drained', 'canned_chickpeas'],
  ['canned chickpeas (drained)', 'canned_chickpeas'],
  ['fresh broccoli florets', 'broccoli'],
  ['greek yogurt, plain nonfat', 'greek_yogurt'],
  ['greek yogurt (plain, 0% fat)', 'greek_yogurt'],
  ['plain greek yogurt (0% fat)', 'greek_yogurt'],
  ['fresh spinach (baby)', 'spinach'],
  ['sliced almonds (raw)', 'almonds'],
  ['almonds, sliced', 'almonds'],
  ['carrots (raw)', 'carrots'],
  ['carrots, raw', 'carrots'],
  ['canned tomatoes, crushed', 'canned_tomatoes'],
  ['feta cheese, crumbled', 'feta'],
  ['uncooked white rice', 'white_rice'],
  ['brown rice (uncooked)', 'brown_rice'],
];

// forms that MUST stay unresolved — cooked grains, leftover narration,
// contradictory noise, and unapproved semantic variants
const MUST_STAY_UNRESOLVED = [
  'brown rice (cooked)',
  'cooked rice',
  'jasmine rice (cooked)',
  'white rice (cooked)',
  'cooked quinoa',
  'fresh spinach, remaining',
  'fresh spinach (remainder)',
  'canned chickpeas (drained, dried)',
  'whole milk',
  'short-grain white rice',
  'basmati rice',
  'wild-caught salmon fillet',
  'low-fat milk',
];

test('1. each exact alias resolves to the intended canonical id (via alias, not fuzzy)', () => {
  for (const [raw, id] of ALIASES) {
    const r = ci.resolveIngredient(raw);
    assert.equal(r.resolved, true, `${raw} should resolve`);
    assert.equal(r.ingredient.id, id, `${raw} -> ${id}`);
    assert.equal(r.matchedVia, ci.MATCH.ALIAS, `${raw} matched via alias`);
  }
});

test('2. no alias changes the canonical base unit', () => {
  const expected = {
    garlic: 'g', chicken_thighs: 'g', chicken_breast: 'g', canned_chickpeas: 'g',
    broccoli: 'g', greek_yogurt: 'g', spinach: 'g', almonds: 'g', carrots: 'g',
    canned_tomatoes: 'g', feta: 'g', white_rice: 'g', brown_rice: 'g',
  };
  for (const [id, unit] of Object.entries(expected)) {
    assert.equal(ci.getById(id).baseUnit, unit, `${id} baseUnit unchanged`);
  }
  assert.equal(ci.allCanonicalIngredients().length, 62, 'no new canonical records');
});

test('3. an alias establishes identity only — a wrong generated unit still fails certification', () => {
  // greek_yogurt base unit is g; a resolving variant supplied in ml must still fail
  const ml = cert.assessIngredient({ name: 'greek yogurt (plain, 0% fat)', amountValue: 150, amountUnit: 'ml' });
  assert.equal(ml.canonicalIngredientId, 'greek_yogurt', 'identity is established');
  assert.equal(ml.canonicalStatus, cert.CANONICAL_STATUS.RESOLVED);
  assert.equal(ml.quantityStatus, cert.QUANTITY_STATUS.INCOMPATIBLE_UNIT);
  assert.ok(ml.failures.includes(cert.FAILURE.INCOMPATIBLE_UNIT));
  assert.equal(ml.certified, false);

  // the same variant in the correct unit certifies
  const g = cert.assessIngredient({ name: 'greek yogurt (plain, 0% fat)', amountValue: 150, amountUnit: 'g' });
  assert.equal(g.certified, true);

  // a count canonical (chicken is g) reached via a new alias, supplied in count -> still fails
  const badCount = cert.assessIngredient({ name: 'chicken breast (skinless)', amountValue: 2, amountUnit: 'count' });
  assert.equal(badCount.canonicalIngredientId, 'chicken_breast');
  assert.equal(badCount.certified, false);
  assert.ok(badCount.failures.includes(cert.FAILURE.INCOMPATIBLE_UNIT));
});

test('4. cooked-grain and cooked-state variants remain unresolved (dry/uncooked conventions intact)', () => {
  for (const raw of ['brown rice (cooked)', 'cooked rice', 'jasmine rice (cooked)', 'white rice (cooked)', 'cooked quinoa']) {
    assert.equal(ci.resolveIngredient(raw).resolved, false, `${raw} must NOT resolve`);
    assert.equal(cert.assessIngredient({ name: raw, amountValue: 150, amountUnit: 'g' }).certified, false);
  }
  // the approved dry forms DO resolve
  assert.equal(ci.resolveIngredient('uncooked white rice').ingredient.id, 'white_rice');
  assert.equal(ci.resolveIngredient('brown rice (uncooked)').ingredient.id, 'brown_rice');
});

test('5. unapproved semantic / narration variants remain unresolved', () => {
  for (const raw of MUST_STAY_UNRESOLVED) {
    assert.equal(ci.resolveIngredient(raw).resolved, false, `${raw} must stay unresolved`);
  }
});

test('6. no fuzzy / substring behavior appears', () => {
  // near-misses of the new aliases must NOT resolve
  const nearMisses = [
    'garlic minced fresh chopped',   // extra words
    'chicken thigh (bone-in)',        // different variety
    'canned chickpeas, rinsed',       // not an added form
    'greek yogurt (full fat)',        // different fat convention
    'crushed canned tomatoes with basil',
    'almonds, toasted',
    'carrots (roasted)',
    'broccoli florets, blanched',
  ];
  for (const raw of nearMisses) {
    assert.equal(ci.resolveIngredient(raw).resolved, false, `${raw} must NOT resolve (no fuzzy)`);
  }
  // substring guard: a shorter/longer string around an alias does not match
  assert.equal(ci.resolveIngredient('minced').resolved, false);
  assert.equal(ci.resolveIngredient('feta cheese, crumbled and drained').resolved, false);
});

test('7. certificationAssessment consumes the newly-resolved aliases end to end', () => {
  const meal = { type: 'lunch', name: 'x', ingredients: [
    { name: 'chicken breast (skinless)', amountValue: 150, amountUnit: 'g' },
    { name: 'carrots, raw', amountValue: 80, amountUnit: 'g' },
    { name: 'garlic (minced)', amountValue: 6, amountUnit: 'g' },
    { name: 'canned chickpeas, drained', amountValue: 120, amountUnit: 'g' },
    { name: 'brown rice (uncooked)', amountValue: 70, amountUnit: 'g' },
  ] };
  const r = cert.assessMeal(meal);
  assert.equal(r.canonicalCoverage, 'covered');
  assert.equal(r.nutrition.authoritative, true);
  assert.equal(r.purchaseCoverage, 'covered');
  assert.equal(r.certified, true, 'a meal built entirely from newly-aliased forms now fully certifies');
});

test('8. Phase 1 resolver behavior stays deterministic and exact-after-normalization', () => {
  // repeated calls identical
  const a = ci.resolveIngredient('feta cheese, crumbled');
  const b = ci.resolveIngredient('  Feta   Cheese,   Crumbled  '); // casing + whitespace only
  assert.equal(a.ingredient.id, 'feta');
  assert.equal(b.ingredient.id, 'feta', 'normalization is still just lowercase + whitespace collapse');
  assert.equal(ci.resolveIngredient('zucchini').resolved, false, 'still no zucchini canonical');
  assert.equal(ci.allCanonicalIngredients().length, 62);
});

test('regression: no alias collides with a canonical name or another ingredient\'s alias', () => {
  // module load already throws on collision; assert every new alias points at exactly one id
  const seen = new Map();
  for (const [raw, id] of ALIASES) {
    const r = ci.resolveIngredient(raw);
    if (seen.has(raw)) assert.equal(seen.get(raw), id);
    seen.set(raw, id);
    assert.equal(r.ingredient.id, id);
  }
});
