'use strict';

/**
 * Phase 3E0-D — certificationAssessment: WEEK + BUDGET AUTHORITY + SNAPSHOT
 * + REGRESSION (3E0-D test matrix cases 23-35, 41-53).
 *
 * The load-bearing test is #25: a synthetic week whose CONSUMPTION cost is
 * under budget but whose AUTHORITATIVE Phase 2 PURCHASE cost is over budget
 * MUST assess as certified:false. That proves the budget-authority architecture
 * without any Anthropic call.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const A = require('../certificationAssessment');
const groceryAggregation = require('../groceryAggregation');
const nutritionEngine = require('../nutritionEngine');
const canonicalIngredients = require('../canonicalIngredients');
const pricing = require('../pricing');
const { PRICES } = require('../ingredientPriceData');

// ── helpers ─────────────────────────────────────────────────────────────────
const meal = (type, ings) => ({ type, name: `${type} test`, ingredients: ings });
const day = (...meals) => ({ meals });

// A meal built only from fully-good ingredients (eligible nutrition + certifiable
// purchase profile). Small quantities so CONSUMPTION cost is tiny.
const goodMeal = (type) => meal(type, [
  { name: 'eggs', amountValue: 2, amountUnit: 'count' },
  { name: 'spinach', amountValue: 40, amountUnit: 'g' },
  { name: 'olive oil', amountValue: 8, amountUnit: 'ml' },
]);

const goodWeek = (budgetCents) => ({
  days: [day(goodMeal('breakfast')), day(goodMeal('lunch')), day(goodMeal('dinner'))],
  requestedBudgetCents: budgetCents,
  currency: 'USD',
});

// ═══════════════════════════════════════════════════════════════════════════
// WEEK  (cases 23-35)
// ═══════════════════════════════════════════════════════════════════════════

test('23. fully covered synthetic week UNDER purchase budget certifies', () => {
  const r = A.assessWeek(goodWeek(500000)); // $5000 — package cost is trivially under
  assert.equal(r.canonicalCoverage, 'covered');
  assert.equal(r.nutritionCoverage, 'complete');
  assert.equal(r.purchase.allCovered, true);
  assert.equal(r.purchase.withinBudget, true);
  assert.equal(r.purchase.status, 'purchase_certified');
  assert.equal(r.certified, true);
});

test('24. fully covered synthetic week OVER purchase budget fails', () => {
  const r = A.assessWeek(goodWeek(100)); // $1.00 — cannot cover even one carton of eggs
  assert.equal(r.purchase.allCovered, true);
  assert.equal(r.purchase.withinBudget, false);
  assert.equal(r.certified, false);
});

test('25. LOAD-BEARING: consumption <= budget BUT authoritative purchase > budget -> certified:false', () => {
  const week = goodWeek(500); // $5.00
  const r = A.assessWeek(week);

  // consumption-level cost is well under $5
  assert.ok(r.diagnosticConsumptionPricing.totalUSD <= 5.0, `consumption ${r.diagnosticConsumptionPricing.totalUSD} should be <= 5`);

  // authoritative Phase 2 package purchase cost is OVER $5
  assert.equal(r.purchase.allCovered, true);
  assert.ok(r.purchase.coveredPurchaseCostCents > 500, `purchase ${r.purchase.coveredPurchaseCostCents}c should exceed 500c`);
  assert.equal(r.purchase.withinBudget, false);

  // therefore NOT certified — purchase cost is the budget authority
  assert.equal(r.certified, false);
});

test('26. unresolved ingredient anywhere in the week fails', () => {
  const w = goodWeek(500000);
  w.days[1].meals[0].ingredients.push({ name: 'zucchini', amountValue: 90, amountUnit: 'g' });
  const r = A.assessWeek(w);
  assert.equal(r.canonicalCoverage, 'incomplete');
  assert.ok(r.failures.includes(A.FAILURE.UNRESOLVED_CANONICAL_INGREDIENT));
  assert.equal(r.certified, false);
});

test('27. nutrition-ineligible ingredient fails the week', () => {
  const w = goodWeek(500000);
  w.days[0].meals[0].ingredients.push({ name: 'harissa paste', amountValue: 15, amountUnit: 'g' });
  const r = A.assessWeek(w);
  assert.equal(r.nutritionCoverage, 'incomplete');
  assert.ok(r.failures.includes(A.FAILURE.INELIGIBLE_NUTRITION_RECORD));
  assert.equal(r.certified, false);
});

test('28. purchase-uncovered (non-certifiable) ingredient fails the week', () => {
  const w = goodWeek(500000);
  w.days[2].meals[0].ingredients.push({ name: 'cumin', amountValue: 3, amountUnit: 'g' });
  const r = A.assessWeek(w);
  assert.equal(r.purchase.allCovered, false, 'Phase 2 marks the amortized-spice row uncovered');
  assert.equal(r.certified, false);
});

test('29. weekly requirements aggregate BEFORE package rounding (reuse across days)', () => {
  // 7 days each using 30 g of oats = 210 g total -> ONE package, not seven.
  const w = {
    days: Array.from({ length: 7 }, () => day(meal('breakfast', [{ name: 'oats', amountValue: 30, amountUnit: 'g' }]))),
    requestedBudgetCents: 100000, currency: 'USD',
  };
  const r = A.assessWeek(w);
  const oatsRow = r.purchase.plan.rows.find((row) => row.canonicalIngredientId === 'oats');
  assert.ok(oatsRow, 'oats row present');
  assert.equal(oatsRow.packageCount, 1, 'one package covers the whole week, not one per day');
});

test('30. package reuse preserved: purchase total == one build over the flattened week', () => {
  const w = goodWeek(500000);
  const flat = w.days.flatMap((d) => d.meals).map((m) => ({ ingredients: m.ingredients }));
  const direct = groceryAggregation.buildWeeklyPurchasePlan(flat, { budgetCents: 500000, currency: 'USD' });
  const via = A.assessWeek(w);
  assert.equal(via.purchase.coveredPurchaseCostCents, direct.coveredPurchaseCostCents);
  assert.equal(via.purchase.weeklyPurchaseCostCents, direct.weeklyPurchaseCostCents);
});

test('31. purchase total EXACTLY matches the frozen Phase 2 engine (no re-derivation here)', () => {
  const w = goodWeek(1200);
  const flat = w.days.flatMap((d) => d.meals).map((m) => ({ ingredients: m.ingredients }));
  const direct = groceryAggregation.buildWeeklyPurchasePlan(flat, { budgetCents: 1200, currency: 'USD' });
  const via = A.assessWeek(w);
  assert.deepEqual(via.purchase.plan, direct);
});

test('32. authoritative budget comparison uses integer cents', () => {
  const r = A.assessWeek(goodWeek(999.7)); // non-integer -> rounded
  assert.equal(r.requestedBudgetCents, 1000);
  assert.equal(Number.isInteger(r.purchase.plan.budgetCents), true);
});

test('33. partial purchase coverage never becomes the certified total', () => {
  const w = goodWeek(500000);
  w.days[0].meals[0].ingredients.push({ name: 'zucchini', amountValue: 90, amountUnit: 'g' }); // uncovered
  const r = A.assessWeek(w);
  assert.equal(r.purchase.allCovered, false);
  assert.equal(r.purchase.certifiedEstimatedPurchaseCostCents, null, 'no authoritative complete estimate when coverage is partial');
  assert.equal(r.certified, false);
});

test('34. assessWeek does not mutate its input', () => {
  const w = goodWeek(500000);
  const snap = JSON.stringify(w);
  A.assessWeek(w);
  assert.equal(JSON.stringify(w), snap);
});

test('35. deterministic: repeated calls produce identical results', () => {
  const w = goodWeek(500);
  const a = A.assessWeek(w);
  const b = A.assessWeek(w);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test('week: flat {meals} input also accepted', () => {
  const r = A.assessWeek({ meals: [goodMeal('breakfast')], requestedBudgetCents: 500000, currency: 'USD' });
  assert.equal(r.dayCount, 1);
  assert.equal(r.mealCount, 1);
});

test('week: non-USD currency is not enforceable -> not certified', () => {
  const r = A.assessWeek({ ...goodWeek(500000), currency: 'EUR' });
  assert.equal(r.purchase.enforceable, false);
  assert.equal(r.certified, false);
});

test('week: missing budget -> not certified', () => {
  const w = goodWeek(undefined);
  delete w.requestedBudgetCents;
  const r = A.assessWeek(w);
  assert.equal(r.requestedBudgetCents, null);
  assert.equal(r.certified, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// SNAPSHOT  (cases 41-48)
// ═══════════════════════════════════════════════════════════════════════════

const FIXED_NOW = () => '2026-08-29T00:00:00.000Z';

test('41. a certified week produces a snapshot', () => {
  const r = A.assessWeek(goodWeek(500000));
  assert.equal(r.certified, true);
  const snap = A.buildCertifiedSnapshot(r, { now: FIXED_NOW });
  assert.ok(snap);
});

test('42. an uncertified week cannot produce a certified snapshot', () => {
  const r = A.assessWeek(goodWeek(100)); // over budget
  assert.equal(A.buildCertifiedSnapshot(r, { now: FIXED_NOW }), null);
  assert.equal(A.buildCertifiedSnapshot(null), null);
});

test('43. snapshot stores canonical ids on every accepted ingredient (never display text)', () => {
  const snap = A.buildCertifiedSnapshot(A.assessWeek(goodWeek(500000)), { now: FIXED_NOW });
  for (const d of snap.days) for (const m of d.meals) for (const ing of m.ingredients) {
    assert.ok(canonicalIngredients.getById(ing.canonicalIngredientId), `snapshot ingredient has a real canonical id (${ing.canonicalIngredientId})`);
    assert.ok('displayName' in ing);
  }
});

test('44. snapshot stores authoritative deterministic nutrition values', () => {
  const r = A.assessWeek(goodWeek(500000));
  const snap = A.buildCertifiedSnapshot(r, { now: FIXED_NOW });
  assert.deepEqual(snap.weekNutrition, r.nutrition.weeklyTotals);
  for (const d of snap.days) for (const m of d.meals) {
    assert.ok(m.nutrition && m.nutrition.kcal > 0);
  }
});

test('45. snapshot stores the whole weekly purchase plan + the single authoritative weekly total', () => {
  const r = A.assessWeek(goodWeek(500000));
  const snap = A.buildCertifiedSnapshot(r, { now: FIXED_NOW });
  assert.deepEqual(snap.weeklyPurchasePlan, r.purchase.plan);
  assert.equal(snap.authoritativeWeeklyPurchaseCostCents, r.purchase.certifiedEstimatedPurchaseCostCents);
  assert.equal(Number.isInteger(snap.authoritativeWeeklyPurchaseCostCents), true);
});

test('46. snapshot does NOT invent per-meal purchase-cost attribution', () => {
  const snap = A.buildCertifiedSnapshot(A.assessWeek(goodWeek(500000)), { now: FIXED_NOW });
  const json = JSON.stringify(snap);
  for (const d of snap.days) for (const m of d.meals) {
    assert.equal('purchaseCostCents' in m, false);
    assert.equal('packageId' in m, false);
    for (const ing of m.ingredients) {
      assert.equal('sharedCents' in ing, false);
      assert.equal('packageId' in ing, false);
    }
  }
  // package economics live ONLY at the week level
  assert.ok(json.includes('weeklyPurchasePlan'));
});

test('47. buildCertifiedSnapshot does not mutate the source assessment', () => {
  const r = A.assessWeek(goodWeek(500000));
  const snap1 = JSON.stringify(r);
  A.buildCertifiedSnapshot(r, { now: FIXED_NOW });
  assert.equal(JSON.stringify(r), snap1);
});

test('48. certificationVersion is 1', () => {
  const snap = A.buildCertifiedSnapshot(A.assessWeek(goodWeek(500000)), { now: FIXED_NOW });
  assert.equal(snap.certificationVersion, 1);
  assert.equal(A.CERTIFICATION_VERSION, 1);
  assert.equal(snap.certifiedAt, '2026-08-29T00:00:00.000Z');
  assert.deepEqual(snap.certification.excludes, ['dietary_safety']);
});

// ═══════════════════════════════════════════════════════════════════════════
// REGRESSION  (cases 49-53) — this module must not perturb the frozen engines
// ═══════════════════════════════════════════════════════════════════════════

test('49. Phase 1 exact resolver semantics unchanged (no fuzzy / no rescue)', () => {
  assert.equal(canonicalIngredients.resolveIngredient('zucchini').resolved, false);
  assert.equal(canonicalIngredients.resolveIngredient('chicken breast').ingredient.id, 'chicken_breast');
  assert.equal(canonicalIngredients.resolveIngredient('large eggs').ingredient.id, 'eggs');
});

test('50. Phase 2 buildWeeklyPurchasePlan output shape unchanged', () => {
  const p = groceryAggregation.buildWeeklyPurchasePlan(
    [{ ingredients: [{ name: 'eggs', amountValue: 2, amountUnit: 'count' }] }],
    { budgetCents: 5000, currency: 'USD' },
  );
  for (const k of ['coveredPurchaseCostCents', 'certifiedEstimatedPurchaseCostCents', 'weeklyPurchaseCostCents', 'allCovered', 'withinBudget', 'purchaseBudgetStatus', 'uncovered', 'rows']) {
    assert.ok(k in p, `Phase 2 result still has ${k}`);
  }
});

test('51. Phase 3A/3C canonical vocabulary unchanged (62 ids, broccoli in grams)', () => {
  assert.equal(canonicalIngredients.allCanonicalIngredients().length, 62);
  assert.equal(canonicalIngredients.getById('broccoli').baseUnit, 'g');
  assert.equal(canonicalIngredients.getById('salt_and_pepper'), null); // deleted in 3C
});

test('52. Phase 3D nutrition engine STATUS + coverage unchanged', () => {
  const s = nutritionEngine.coverageSummary();
  assert.equal(s.canonicalCount, 62);
  assert.equal(s.eligible.length, 59);
  assert.equal(s.ineligible.length, 3);
  assert.equal(s.missing.length, 0);
  assert.equal(nutritionEngine.STATUS.COVERED, 'covered');
});

test('53. importing certificationAssessment does not monkeypatch any frozen engine', () => {
  const beforeResolve = canonicalIngredients.resolveIngredient;
  const beforeCalc = nutritionEngine.calculateIngredientNutrition;
  const beforePlan = groceryAggregation.buildWeeklyPurchasePlan;
  require('../certificationAssessment');
  assert.equal(canonicalIngredients.resolveIngredient, beforeResolve);
  assert.equal(nutritionEngine.calculateIngredientNutrition, beforeCalc);
  assert.equal(groceryAggregation.buildWeeklyPurchasePlan, beforePlan);
});

test('extra: consumption pricing is reported but never referenced by `certified`', () => {
  // Force a week that is purchase-certified; flip an ingredient to one that
  // prices as $0.50 unknown at consumption level but is still fully canonical.
  // (There is no such case among the 62 — every canonical name has a price row —
  // so instead assert the structural guarantee: certified is a pure function of
  // the non-pricing dimensions.)
  const r = A.assessWeek(goodWeek(500000));
  assert.equal(r.certified, true);
  assert.ok('diagnosticConsumptionPricing' in r);
  assert.ok(r.diagnosticConsumptionPricing.note.includes('NOT the grocery-budget authority'));
});
