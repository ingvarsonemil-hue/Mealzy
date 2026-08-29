'use strict';

/**
 * Phase 3E0-F3A — quinoa atomic full-stack addition.
 *
 * Proves the single new canonical `quinoa` (dry/uncooked) passes every layer:
 * exact resolution -> quantity compatibility (g) -> deterministic nutrition
 * (USDA FDC 168874, DIRECT) -> deterministic purchase (real 30 oz / ~850 g
 * sealed package, $6.19 -> 619 cents) -> full-stack certification.
 *
 * No engine changes were made; this is a data-only addition.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const ci = require('../canonicalIngredients');
const nutritionEngine = require('../nutritionEngine');
const cp = require('../canonicalPurchaseData');
const wpp = require('../weeklyPurchasePlan');
const A = require('../certificationAssessment');
const { NUTRITION_RECORDS } = require('../canonicalNutritionData');

// ── 1. exact resolution ─────────────────────────────────────────────────────
test('1. exact "quinoa" resolves to canonical id "quinoa" (exact, not fuzzy)', () => {
  const r = ci.resolveIngredient('quinoa');
  assert.equal(r.resolved, true);
  assert.equal(r.ingredient.id, 'quinoa');
});

// ── 2. cooked-quinoa wording stays unresolved ───────────────────────────────
test('2. cooked / prepared quinoa wording remains unresolved', () => {
  for (const raw of ['cooked quinoa', 'quinoa, cooked', 'cooked tri-color quinoa', 'quinoa bowl', 'quinoa salad', 'quinoa (cooked)']) {
    assert.equal(ci.resolveIngredient(raw).resolved, false, `${raw} must NOT resolve`);
  }
});

// ── 2b. Phase 3E: dry/uncooked wording IS identity-safe and aliased ─────────
test('2b. "quinoa (uncooked)" and "quinoa (dry)" resolve to canonical quinoa (Phase 3E)', () => {
  for (const raw of ['quinoa (uncooked)', 'quinoa (dry)', 'Quinoa (Uncooked)', '  quinoa (dry) ']) {
    const r = ci.resolveIngredient(raw);
    assert.equal(r.resolved, true, `${raw} must resolve`);
    assert.equal(r.ingredient.id, 'quinoa');
    assert.equal(r.matchedVia, ci.MATCH.ALIAS);
  }
});

// ── 3. canonical base unit ──────────────────────────────────────────────────
test('3. canonical base unit is g', () => {
  assert.equal(ci.getById('quinoa').baseUnit, 'g');
  assert.equal(ci.getById('quinoa').canonicalName, 'quinoa');
  // Phase 3E: dry/uncooked wording aliased; no cooked forms.
  assert.deepEqual(ci.getById('quinoa').aliases, ['quinoa (uncooked)', 'quinoa (dry)']);
});

// ── 4-7. nutrition record ───────────────────────────────────────────────────
test('4. a nutrition record exists for quinoa', () => {
  const rec = NUTRITION_RECORDS.find((r) => r.canonicalIngredientId === 'quinoa');
  assert.ok(rec, 'quinoa nutrition record present');
});

test('5. nutrition basis is 100 g', () => {
  const rec = NUTRITION_RECORDS.find((r) => r.canonicalIngredientId === 'quinoa');
  assert.equal(rec.basisUnit, 'g');
  assert.equal(rec.basisQuantity, 100);
  assert.equal(rec.transformation, null); // DIRECT — no transform
  assert.equal(rec.convention, 'dry');
});

test('6. nutrient values exactly match the frozen USDA FDC 168874 record', () => {
  const rec = NUTRITION_RECORDS.find((r) => r.canonicalIngredientId === 'quinoa');
  assert.equal(rec.kcal, 368);
  assert.equal(rec.proteinG, 14.12);
  assert.equal(rec.carbsG, 64.16);
  assert.equal(rec.fatG, 6.07);
  assert.equal(rec.source.identifier, '168874');
  assert.equal(rec.source.dataType, 'SR Legacy');
});

test('7. nutrition record is eligible and computes deterministically', () => {
  const rec = NUTRITION_RECORDS.find((r) => r.canonicalIngredientId === 'quinoa');
  assert.equal(rec.certification.status, 'eligible');

  const n = nutritionEngine.calculateIngredientNutrition({ canonicalIngredientId: 'quinoa', amountValue: 100, amountUnit: 'g' });
  assert.equal(n.status, nutritionEngine.STATUS.COVERED);
  assert.equal(n.authoritative, true);
  assert.equal(n.kcal, 368);
  assert.equal(n.proteinG, 14.12);
  assert.equal(n.carbsG, 64.16);
  assert.equal(n.fatG, 6.07);
  // 250 g scales linearly
  const n250 = nutritionEngine.calculateIngredientNutrition({ canonicalIngredientId: 'quinoa', amountValue: 250, amountUnit: 'g' });
  assert.equal(n250.kcal, 920);
});

// ── 8-10. purchase profile ──────────────────────────────────────────────────
test('8. purchase profile exists', () => {
  const p = cp.getPurchaseProfile('quinoa');
  assert.ok(p);
  assert.equal(p.canonicalIngredientId, 'quinoa');
  assert.equal(p.packageUnit, 'g');
});

test('9. purchase profile is certifiable', () => {
  const p = cp.getPurchaseProfile('quinoa');
  assert.equal(cp.isCertifiableProfile(p), true);
  assert.equal(p.confidence, 'estimated');
  assert.equal(p.packageQuantity, 850);
  assert.equal(p.packagePriceCents, 619); // $6.19 / ~850 g sealed box
  assert.ok(/prior F2/i.test(p.provenance) || /Target/i.test(p.provenance));
});

test('10. package type is the existing fixed weight-package type (no new type)', () => {
  const p = cp.getPurchaseProfile('quinoa');
  assert.equal(p.packageType, 'weight_package');
  assert.ok(cp.PACKAGE_TYPES.includes('weight_package'));
  // discriminated fixed profile — must NOT carry variable_weight fields
  assert.equal('rateQuantity' in p, false);
  assert.equal('ratePriceCents' in p, false);
});

// ── 11. fixed package arithmetic ceils the requirement ───────────────────────
test('11. fixed-package arithmetic ceils the weekly requirement to whole boxes', () => {
  const rows = (grams) => wpp.computeRowPurchase({
    canonicalIngredientId: 'quinoa',
    displayName: 'quinoa',
    requiredQuantity: grams,
    requiredUnit: 'g',
    occurrenceCount: 1,
    flags: { unresolved: false, unitMismatch: false, invalidQuantity: false, negativeQuantity: false },
  });

  const r1 = rows(100); // < 1 box
  assert.equal(r1.packageCount, 1);
  assert.equal(r1.purchaseQuantity, 850);
  assert.equal(r1.purchaseCostCents, 619);
  assert.equal(r1.pricingStatus, wpp.PURCHASE_PRICING_STATUS.COVERED);

  const r2 = rows(850); // exactly 1 box
  assert.equal(r2.packageCount, 1);
  assert.equal(r2.purchaseCostCents, 619);

  const r3 = rows(851); // just over -> 2 boxes
  assert.equal(r3.packageCount, 2);
  assert.equal(r3.purchaseQuantity, 1700);
  assert.equal(r3.purchaseCostCents, 1238);
});

// ── 12. full-stack certification ────────────────────────────────────────────
test('12. a valid quinoa occurrence reaches full-stack certification coverage', () => {
  const r = A.assessIngredient({ name: 'quinoa', amountValue: 80, amountUnit: 'g' });
  assert.equal(r.canonicalIngredientId, 'quinoa');
  assert.equal(r.canonicalStatus, A.CANONICAL_STATUS.RESOLVED);
  assert.equal(r.quantityStatus, A.QUANTITY_STATUS.OK);
  assert.equal(r.nutritionStatus, A.NUTRITION_STATUS.COVERED);
  assert.equal(r.purchaseStatus, A.PURCHASE_STATUS.COVERED);
  assert.equal(r.certified, true);

  // wrong unit still fails (identity established, quantity incompatible)
  const bad = A.assessIngredient({ name: 'quinoa', amountValue: 1, amountUnit: 'count' });
  assert.equal(bad.canonicalIngredientId, 'quinoa');
  assert.equal(bad.certified, false);
});

test('12b. a synthetic week containing quinoa certifies under an ample budget', () => {
  const meal = (type) => ({
    type,
    name: `${type} test`,
    ingredients: [
      { name: 'quinoa', amountValue: 90, amountUnit: 'g' },
      { name: 'eggs', amountValue: 2, amountUnit: 'count' },
      { name: 'spinach', amountValue: 40, amountUnit: 'g' },
    ],
  });
  const week = {
    days: [{ meals: [meal('breakfast')] }, { meals: [meal('lunch')] }, { meals: [meal('dinner')] }],
    requestedBudgetCents: 500000,
    currency: 'USD',
  };
  const r = A.assessWeek(week);
  assert.equal(r.canonicalCoverage, 'covered');
  assert.equal(r.nutritionCoverage, 'complete');
  assert.equal(r.purchase.allCovered, true);
  assert.equal(r.certified, true);

  // quinoa row: 3 x 90 g = 270 g -> ceil(270/850) = 1 box -> 619 cents
  const q = r.purchase.plan.rows.find((row) => row.canonicalIngredientId === 'quinoa');
  assert.equal(q.packageCount, 1);
  assert.equal(q.purchaseCostCents, 619);
});
