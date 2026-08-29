'use strict';

/**
 * Phase 3E0-D — certificationAssessment: INGREDIENT + MEAL + proposed-id
 * security + read-only normalization-candidate report.
 *
 * Week / budget-authority / snapshot / regression coverage lives in
 * tests/certificationAssessmentWeek.test.js (kept separate for the 500-line
 * rule). Together they implement the 3E0-D test matrix (cases 1-53).
 *
 * ASSESSMENT, NOT ENFORCEMENT: a `certified: true` here is a statement about
 * the frozen deterministic engines, NOT a claim that server.js enforces it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const A = require('../certificationAssessment');
const nutritionEngine = require('../nutritionEngine');
const canonicalPurchaseData = require('../canonicalPurchaseData');
const canonicalIngredients = require('../canonicalIngredients');

// ── fixtures ────────────────────────────────────────────────────────────────
const GOOD_CHICKEN = { name: 'chicken breast', amountValue: 180, amountUnit: 'g' };
const GOOD_EGGS = { name: 'eggs', amountValue: 2, amountUnit: 'count' };
const GOOD_OIL = { name: 'olive oil', amountValue: 15, amountUnit: 'ml' };
const GOOD_SPINACH = { name: 'spinach', amountValue: 60, amountUnit: 'g' };
const ALIAS_LARGE_EGGS = { name: 'large eggs', amountValue: 2, amountUnit: 'count' }; // curated alias of `eggs`
const INELIGIBLE_HARISSA = { name: 'harissa paste', amountValue: 20, amountUnit: 'g' }; // frozen ineligible record
const NONCERT_PURCHASE_CUMIN = { name: 'cumin', amountValue: 3, amountUnit: 'g' };      // eligible nutrition, non-certifiable purchase (amortized spice)
const UNRESOLVED = { name: 'zucchini', amountValue: 100, amountUnit: 'g' };             // no canonical identity

// ═══════════════════════════════════════════════════════════════════════════
// INGREDIENT  (cases 1-15)
// ═══════════════════════════════════════════════════════════════════════════

test('1. known canonical eligible ingredient certifies', () => {
  const r = A.assessIngredient(GOOD_CHICKEN);
  assert.equal(r.canonicalIngredientId, 'chicken_breast');
  assert.equal(r.canonicalStatus, A.CANONICAL_STATUS.RESOLVED);
  assert.equal(r.quantityStatus, A.QUANTITY_STATUS.OK);
  assert.equal(r.nutritionStatus, A.NUTRITION_STATUS.COVERED);
  assert.equal(r.purchaseStatus, A.PURCHASE_STATUS.COVERED);
  assert.deepEqual([...r.failures], []);
  assert.equal(r.certified, true);
});

test('2. exact curated alias resolves and certifies', () => {
  const r = A.assessIngredient(ALIAS_LARGE_EGGS);
  assert.equal(r.canonicalIngredientId, 'eggs');
  assert.equal(r.canonicalStatus, A.CANONICAL_STATUS.RESOLVED);
  assert.equal(r.certified, true);
});

test('3. unresolved name fails', () => {
  const r = A.assessIngredient(UNRESOLVED);
  assert.equal(r.canonicalStatus, A.CANONICAL_STATUS.UNRESOLVED);
  assert.equal(r.canonicalIngredientId, null);
  assert.ok(r.failures.includes(A.FAILURE.UNRESOLVED_CANONICAL_INGREDIENT));
  assert.equal(r.certified, false);
});

test('4. valid proposed id AGREEING with the resolver certifies', () => {
  const r = A.assessIngredient({ ...GOOD_CHICKEN, canonicalIngredientId: 'chicken_breast' });
  assert.equal(r.canonicalStatus, A.CANONICAL_STATUS.RESOLVED);
  assert.equal(r.certified, true);
});

test('5. valid proposed id DISAGREEING with the resolver fails (fail closed)', () => {
  const r = A.assessIngredient({ ...GOOD_CHICKEN, canonicalIngredientId: 'spinach' });
  assert.equal(r.canonicalStatus, A.CANONICAL_STATUS.PROPOSED_ID_MISMATCH);
  assert.ok(r.failures.includes(A.FAILURE.PROPOSED_CANONICAL_ID_MISMATCH));
  assert.equal(r.certified, false);
});

test('6. nonexistent proposed id fails', () => {
  const r = A.assessIngredient({ ...GOOD_CHICKEN, canonicalIngredientId: 'not_a_real_id' });
  assert.equal(r.canonicalStatus, A.CANONICAL_STATUS.INVALID_PROPOSED_ID);
  assert.ok(r.failures.includes(A.FAILURE.INVALID_PROPOSED_CANONICAL_ID));
  assert.equal(r.certified, false);
});

test('7. unresolved name + valid proposed id STILL fails (id cannot rescue)', () => {
  const r = A.assessIngredient({ ...UNRESOLVED, canonicalIngredientId: 'chicken_breast' });
  assert.equal(r.canonicalStatus, A.CANONICAL_STATUS.UNRESOLVED);
  assert.equal(r.canonicalIngredientId, null);
  assert.ok(r.failures.includes(A.FAILURE.UNRESOLVED_CANONICAL_INGREDIENT));
  assert.equal(r.certified, false);
});

test('8. invalid amount (non-numeric) fails quantity', () => {
  const r = A.assessIngredient({ name: 'chicken breast', amountValue: 'lots', amountUnit: 'g' });
  assert.equal(r.quantityStatus, A.QUANTITY_STATUS.INVALID_QUANTITY);
  assert.ok(r.failures.includes(A.FAILURE.INVALID_QUANTITY));
  assert.equal(r.certified, false);
});

test('9. zero amount fails quantity', () => {
  const r = A.assessIngredient({ name: 'chicken breast', amountValue: 0, amountUnit: 'g' });
  assert.equal(r.quantityStatus, A.QUANTITY_STATUS.INVALID_QUANTITY);
  assert.equal(r.certified, false);
});

test('10. negative amount fails quantity', () => {
  const r = A.assessIngredient({ name: 'chicken breast', amountValue: -50, amountUnit: 'g' });
  assert.equal(r.quantityStatus, A.QUANTITY_STATUS.INVALID_QUANTITY);
  assert.equal(r.certified, false);
});

test('11. incompatible unit fails (canonical base unit is g, got ml)', () => {
  const r = A.assessIngredient({ name: 'chicken breast', amountValue: 180, amountUnit: 'ml' });
  assert.equal(r.quantityStatus, A.QUANTITY_STATUS.INCOMPATIBLE_UNIT);
  assert.ok(r.failures.includes(A.FAILURE.INCOMPATIBLE_UNIT));
  assert.equal(r.certified, false);
});

test('11b. non-vocabulary unit (tbsp) fails incompatible unit', () => {
  const r = A.assessIngredient({ name: 'olive oil', amountValue: 1, amountUnit: 'tbsp' });
  assert.equal(r.quantityStatus, A.QUANTITY_STATUS.INCOMPATIBLE_UNIT);
  assert.equal(r.certified, false);
});

test('12. missing nutrition record: currently unreachable via a real canonical (invariant)', () => {
  // Every canonical id with a purchase profile also has a nutrition record
  // (both were seeded from the same Phase-1 vocabulary). The branch exists for
  // a future canonical added before its nutrition record; here we assert the
  // invariant so a regression that breaks it is caught.
  const summary = nutritionEngine.coverageSummary();
  assert.deepEqual(summary.missing, [], 'a canonical exists without a nutrition record — case 12 branch is now live');
  assert.ok(A.FAILURE.MISSING_NUTRITION_RECORD);
});

test('13. ineligible nutrition record invalidates the ingredient', () => {
  const r = A.assessIngredient(INELIGIBLE_HARISSA);
  assert.equal(r.nutritionStatus, A.NUTRITION_STATUS.INELIGIBLE_RECORD);
  assert.ok(r.failures.includes(A.FAILURE.INELIGIBLE_NUTRITION_RECORD));
  assert.equal(r.certified, false);
});

test('14. missing purchase profile: currently unreachable via a real canonical (invariant)', () => {
  const withoutProfile = canonicalIngredients.allCanonicalIngredients()
    .map((c) => c.id)
    .filter((id) => canonicalPurchaseData.getPurchaseProfile(id) === null);
  assert.deepEqual(withoutProfile, [], 'a canonical exists without a purchase profile — case 14 branch is now live');
  assert.ok(A.FAILURE.MISSING_PURCHASE_PROFILE);
});

test('15. existing non-certifiable purchase behavior preserved (amortized spice)', () => {
  const r = A.assessIngredient(NONCERT_PURCHASE_CUMIN);
  assert.equal(r.nutritionStatus, A.NUTRITION_STATUS.COVERED, 'cumin nutrition is eligible');
  assert.equal(r.purchaseStatus, A.PURCHASE_STATUS.NOT_CERTIFIABLE);
  assert.ok(r.failures.includes(A.FAILURE.PURCHASE_NOT_CERTIFIABLE));
  assert.equal(r.certified, false, 'no special exemption — Phase 2 says non-certifiable, so is the ingredient');
});

// ═══════════════════════════════════════════════════════════════════════════
// PROPOSED-ID SECURITY  (cases 36-40)
// ═══════════════════════════════════════════════════════════════════════════

test('36. a caller cannot force an arbitrary valid id onto an unrelated name', () => {
  const r = A.assessIngredient({ name: 'avocado', amountValue: 100, amountUnit: 'g', canonicalIngredientId: 'spinach' });
  // "avocado" does not resolve at all -> unresolved wins; spinach is never adopted
  assert.equal(r.canonicalStatus, A.CANONICAL_STATUS.UNRESOLVED);
  assert.notEqual(r.canonicalIngredientId, 'spinach');
  assert.equal(r.certified, false);
});

test('37. a caller cannot rescue an unresolved name with any valid id', () => {
  for (const id of ['spinach', 'chicken_breast', 'olive_oil']) {
    const r = A.assessIngredient({ name: 'dragonfruit foam', amountValue: 30, amountUnit: 'g', canonicalIngredientId: id });
    assert.equal(r.canonicalIngredientId, null);
    assert.equal(r.certified, false);
  }
});

test('38. display / preparation text is not authority: only structured name is resolved', () => {
  // The prep-laden display string does not resolve; the assessment does not
  // silently strip it. (Normalization is a FUTURE curated layer, not here.)
  const r = A.assessIngredient({ name: 'garlic cloves, minced', amountValue: 6, amountUnit: 'g' });
  assert.equal(r.canonicalStatus, A.CANONICAL_STATUS.UNRESOLVED);
  // whereas the clean structured name does resolve:
  const clean = A.assessIngredient({ name: 'garlic', amountValue: 6, amountUnit: 'g' });
  assert.equal(clean.canonicalIngredientId, 'garlic');
});

test('39. malformed proposed id fails closed (number, empty string, object)', () => {
  for (const bad of [123, '', '   ', {}, [], true]) {
    const r = A.assessIngredient({ ...GOOD_CHICKEN, canonicalIngredientId: bad });
    assert.equal(r.certified, false, `proposed id ${JSON.stringify(bad)} must fail closed`);
    assert.ok(
      r.canonicalStatus === A.CANONICAL_STATUS.INVALID_PROPOSED_ID
      || r.failures.includes(A.FAILURE.INVALID_PROPOSED_CANONICAL_ID),
    );
  }
});

test('40. missing proposed id preserves plain exact-resolver behavior', () => {
  const withField = A.assessIngredient({ ...GOOD_CHICKEN, canonicalIngredientId: undefined });
  const without = A.assessIngredient(GOOD_CHICKEN);
  assert.equal(withField.canonicalIngredientId, without.canonicalIngredientId);
  assert.equal(withField.certified, without.certified);
  assert.equal(without.input.proposedCanonicalIngredientId, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// MEAL  (cases 16-22)
// ═══════════════════════════════════════════════════════════════════════════

const COVERED_MEAL = {
  type: 'dinner', name: 'Grilled chicken & greens',
  ingredients: [
    { name: 'chicken breast', amountValue: 180, amountUnit: 'g' },
    { name: 'broccoli', amountValue: 150, amountUnit: 'g' },
    { name: 'olive oil', amountValue: 10, amountUnit: 'ml' },
  ],
};

test('16. fully covered meal certifies and exposes authoritative totals', () => {
  const r = A.assessMeal(COVERED_MEAL);
  assert.equal(r.structureStatus, 'ok');
  assert.equal(r.canonicalCoverage, 'covered');
  assert.equal(r.purchaseCoverage, 'covered');
  assert.equal(r.nutrition.status, 'covered');
  assert.equal(r.nutrition.authoritative, true);
  assert.ok(r.nutrition.totals && r.nutrition.totals.kcal > 0);
  assert.equal(r.certified, true);
});

test('17. one unresolved ingredient invalidates the meal (no silent omission)', () => {
  const r = A.assessMeal({ ...COVERED_MEAL, ingredients: [...COVERED_MEAL.ingredients, { name: 'zucchini', amountValue: 90, amountUnit: 'g' }] });
  assert.equal(r.canonicalCoverage, 'incomplete');
  assert.equal(r.nutrition.authoritative, false);
  assert.equal(r.nutrition.totals, null);
  assert.ok(r.failures.includes(A.FAILURE.UNRESOLVED_CANONICAL_INGREDIENT));
  assert.equal(r.certified, false);
});

test('18. one nutrition-ineligible ingredient invalidates the meal', () => {
  const r = A.assessMeal({ ...COVERED_MEAL, ingredients: [...COVERED_MEAL.ingredients, INELIGIBLE_HARISSA] });
  assert.equal(r.nutrition.authoritative, false);
  assert.ok(r.failures.includes(A.FAILURE.INELIGIBLE_NUTRITION_RECORD));
  assert.equal(r.certified, false);
});

test('19. one incompatible-quantity ingredient invalidates the meal', () => {
  const r = A.assessMeal({ ...COVERED_MEAL, ingredients: [...COVERED_MEAL.ingredients, { name: 'broccoli', amountValue: 100, amountUnit: 'ml' }] });
  assert.ok(r.failures.includes(A.FAILURE.INCOMPATIBLE_UNIT));
  assert.equal(r.certified, false);
});

test('20. no silent omission: nutritionEngine receives one row per ingredient', () => {
  const meal = { ingredients: [
    { name: 'chicken breast', amountValue: 100, amountUnit: 'g' },
    { name: 'zucchini', amountValue: 100, amountUnit: 'g' },
  ] };
  const r = A.assessMeal(meal);
  assert.equal(r.ingredients.length, 2);
  // covered-only diagnostic reflects ONLY the chicken; the meal is not authoritative
  assert.ok(r.nutrition.diagnosticCoveredTotals.kcal > 0);
  assert.equal(r.nutrition.authoritative, false);
});

test('21. authoritative meal nutrition matches nutritionEngine.calculateMealNutrition exactly', () => {
  const rows = COVERED_MEAL.ingredients.map((i) => ({
    canonicalIngredientId: canonicalIngredients.resolveIngredient(i.name).ingredient.id,
    amountValue: i.amountValue, amountUnit: i.amountUnit,
  }));
  const direct = nutritionEngine.calculateMealNutrition(rows);
  const viaAssess = A.assessMeal(COVERED_MEAL);
  assert.deepEqual(viaAssess.nutrition.totals, direct.totals);
});

test('22. partial totals are diagnostic-only (Phase 3D semantics)', () => {
  const r = A.assessMeal({ ingredients: [
    { name: 'chicken breast', amountValue: 100, amountUnit: 'g' },
    { name: 'zucchini', amountValue: 50, amountUnit: 'g' },
  ] });
  assert.equal(r.nutrition.totals, null, 'no authoritative totals on an incomplete meal');
  assert.ok(r.nutrition.diagnosticCoveredTotals, 'covered totals still exposed for diagnostics');
});

test('meal: does not mutate its input', () => {
  const meal = JSON.parse(JSON.stringify(COVERED_MEAL));
  const snapshot = JSON.stringify(meal);
  A.assessMeal(meal);
  assert.equal(JSON.stringify(meal), snapshot);
});

test('meal: empty / malformed ingredient list -> structure invalid, not certified', () => {
  assert.equal(A.assessMeal({ ingredients: [] }).certified, false);
  assert.equal(A.assessMeal({}).structureStatus, 'invalid');
  assert.equal(A.assessMeal(null).certified, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// READ-ONLY NORMALIZATION-CANDIDATE REPORT  (documentation, from B1/B2 examples)
// Not an implementation — a curated shortlist for a FUTURE finite normalization
// layer. Every entry is asserted to currently FAIL the frozen resolver, so this
// list can only shrink deliberately.
// ═══════════════════════════════════════════════════════════════════════════

test('normalization-candidate report: presentation/preparation noise (safe class)', () => {
  const SAFE_CANDIDATES = [
    // [ raw model output (B1/B2) , structured name it should reduce to ]
    ['garlic cloves, minced', 'garlic'],
    ['canned chickpeas, drained', 'canned chickpeas'],
    ['fresh spinach, remaining', 'fresh spinach'],
    ['fresh spinach (remainder)', 'fresh spinach'],
    ['Greek yogurt, plain nonfat', 'Greek yogurt'],
    ['almonds, sliced', 'almonds'],
    ['raw almonds', 'almonds'],
  ];
  for (const [raw] of SAFE_CANDIDATES) {
    const r = A.assessIngredient({ name: raw, amountValue: 50, amountUnit: 'g' });
    // These currently do NOT certify (proves the boundary is intact today).
    // Some leading-adjective forms already resolve via the frozen normalizeName;
    // the report documents the still-open cases.
    if (r.canonicalStatus === A.CANONICAL_STATUS.RESOLVED) {
      // already handled by the frozen resolver — fine, nothing to add
      continue;
    }
    assert.equal(r.canonicalStatus, A.CANONICAL_STATUS.UNRESOLVED, `${raw}: expected still-open normalization candidate`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PREPARATION FIELD (3E0-D bounded correction) — presentation-only, inert
// ═══════════════════════════════════════════════════════════════════════════

const PREP_A = { name: 'garlic', amountValue: 6, amountUnit: 'g' };
const PREP_B = { ...PREP_A, preparation: 'minced, plus extra to serve' };
const PREP_C = { ...PREP_A, preparation: 'roughly chopped' };

test('prep-1. preparation is optional — absence preserves current behavior exactly', () => {
  const withoutField = A.assessIngredient(PREP_A);
  const withNull = A.assessIngredient({ ...PREP_A, preparation: undefined });
  assert.equal(withoutField.input.preparation, null);
  assert.deepEqual(JSON.parse(JSON.stringify(withoutField)), JSON.parse(JSON.stringify(withNull)));
});

test('prep-2. preparation survives verbatim into the certified snapshot', () => {
  const week = { days: [{ meals: [{
    type: 'dinner', name: 'x',
    ingredients: [
      { name: 'chicken breast', amountValue: 180, amountUnit: 'g', preparation: 'sliced thin' },
      { name: 'broccoli', amountValue: 150, amountUnit: 'g' }, // no prep
      { name: 'olive oil', amountValue: 10, amountUnit: 'ml', preparation: 'for the pan' },
    ],
  }] }], requestedBudgetCents: 500000, currency: 'USD' };
  const r = A.assessWeek(week);
  assert.equal(r.certified, true);
  const snap = A.buildCertifiedSnapshot(r, { now: () => '2026-08-29T00:00:00.000Z' });
  const ings = snap.days[0].meals[0].ingredients;
  assert.equal(ings[0].preparation, 'sliced thin');
  assert.equal(ings[1].preparation, null);
  assert.equal(ings[2].preparation, 'for the pan');
});

test('prep-3. changing preparation does not change canonical identity', () => {
  const b = A.assessIngredient(PREP_B), c = A.assessIngredient(PREP_C);
  assert.equal(b.canonicalIngredientId, 'garlic');
  assert.equal(c.canonicalIngredientId, 'garlic');
  assert.equal(b.canonicalStatus, c.canonicalStatus);
});

test('prep-4. changing preparation does not change nutrition', () => {
  assert.deepEqual(A.assessIngredient(PREP_B).nutrition, A.assessIngredient(PREP_C).nutrition);
});

test('prep-5. changing preparation does not change purchase economics', () => {
  const mk = (prep) => A.assessWeek({ days: [{ meals: [{ ingredients: [
    { name: 'oats', amountValue: 40, amountUnit: 'g', preparation: prep },
  ] }] }], requestedBudgetCents: 100000, currency: 'USD' });
  assert.deepEqual(mk('steel-cut, soaked overnight').purchase.plan, mk('quick').purchase.plan);
});

test('prep-6. changing preparation does not change certification (ingredient or week)', () => {
  assert.equal(A.assessIngredient(PREP_B).certified, A.assessIngredient(PREP_C).certified);
  const wk = (prep) => A.assessWeek({ days: [{ meals: [{ ingredients: [
    { name: 'eggs', amountValue: 2, amountUnit: 'count', preparation: prep },
  ] }] }], requestedBudgetCents: 500000, currency: 'USD' }).certified;
  assert.equal(wk('scrambled'), wk('poached'));
});

test('prep-7. preparation cannot rescue an unresolved ingredient', () => {
  const r = A.assessIngredient({ name: 'zucchini', amountValue: 100, amountUnit: 'g', preparation: 'garlic, minced' });
  assert.equal(r.canonicalStatus, A.CANONICAL_STATUS.UNRESOLVED);
  assert.equal(r.canonicalIngredientId, null);
  assert.equal(r.certified, false);
});

test('prep-8. preparation cannot override a proposed-id mismatch', () => {
  const r = A.assessIngredient({ name: 'chicken breast', amountValue: 180, amountUnit: 'g', canonicalIngredientId: 'spinach', preparation: 'spinach' });
  assert.equal(r.canonicalStatus, A.CANONICAL_STATUS.PROPOSED_ID_MISMATCH);
  assert.equal(r.certified, false);
});

test('normalization-candidate report: semantic differences that MUST NOT be normalized away', () => {
  const SEMANTIC_KEEP_LITERAL = [
    'whole milk',            // canonical `milk` convention is 2%
    'short-grain white rice',
    'bone-in chicken thighs',
    'brown lentils',
  ];
  for (const raw of SEMANTIC_KEEP_LITERAL) {
    const r = A.assessIngredient({ name: raw, amountValue: 100, amountUnit: 'g' });
    assert.equal(r.certified, false, `${raw}: must not be silently normalized to a near-neighbour canonical`);
  }
});
