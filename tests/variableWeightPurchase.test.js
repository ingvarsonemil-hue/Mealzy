'use strict';

/**
 * Phase 3E0-F2C-impl — variable_weight purchase capability.
 *
 * A `variable_weight` profile models a good dispensed continuously by weight:
 * NO minimum package, NO ceil-to-package. Purchase quantity = the normalized
 * required quantity; cost is proportional to a quoted rate, in integer cents.
 *
 * CAPABILITY-ONLY: no real canonical ingredient is migrated. Tests build
 * synthetic profiles via `canonicalPurchaseData.deriveProfile` (a pure fn) and
 * inject them through `buildWeeklyPurchasePlan({ getProfile })` — a test seam
 * that does not touch RAW_PACKAGE_ASSUMPTIONS or PURCHASE_PROFILES.
 *
 * Illustrative rate used throughout the arithmetic table: 137 ¢ / 454 g.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const cp = require('../canonicalPurchaseData.js');
const ga = require('../groceryAggregation.js');
const A = require('../certificationAssessment.js');

const { deriveProfile, isCertifiableProfile, getPurchaseProfile, PACKAGE_TYPES } = cp;
const { buildWeeklyPurchasePlan, computeRowPurchase, PURCHASE_PRICING_STATUS } = ga;

// Illustrative variable-weight profile (rate 137¢ / 454 g) for the real
// canonical `tomato`. Shape matches what deriveProfile emits.
const VW = Object.freeze({
  canonicalIngredientId: 'tomato',
  packageType: 'variable_weight',
  rateQuantity: 454,
  ratePriceCents: 137,
  packageUnit: 'g',
  provenance: 'test illustrative 137¢/454g',
  confidence: 'estimated',
});
const inject = (profile) => (id) => (id === 'tomato' ? profile : getPurchaseProfile(id));
const planFor = (qtyG, profile = VW, budgetCents = 100000) =>
  buildWeeklyPurchasePlan(
    [{ ingredients: [{ name: 'tomato', amountValue: qtyG, amountUnit: 'g' }] }],
    { budgetCents, currency: 'USD', getProfile: inject(profile) },
  );
const rowFor = (qtyG, profile = VW) => planFor(qtyG, profile).rows[0];

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE CONTRACT  (1-7)
// ═══════════════════════════════════════════════════════════════════════════

test('1. variable_weight is an accepted packageType', () => {
  assert.ok(PACKAGE_TYPES.includes('variable_weight'));
  const p = deriveProfile('tomato', { packageType: 'variable_weight', rateQuantity: 454, packageUnit: 'g', confidence: 'estimated', notes: 'x' });
  assert.equal(p.packageType, 'variable_weight');
});

test('2. variable profile derives ratePriceCents via the existing price mechanism', () => {
  // ingredientPriceData tomato = $0.005/g -> round(0.005 * 454 * 100) = 227
  const p = deriveProfile('tomato', { packageType: 'variable_weight', rateQuantity: 454, packageUnit: 'g', confidence: 'estimated', notes: 'x' });
  assert.equal(p.ratePriceCents, 227);
  assert.equal(p.rateQuantity, 454);
  assert.ok(Number.isInteger(p.ratePriceCents) && p.ratePriceCents > 0);
  assert.ok(p.provenance.includes('rate:'));
});

test('3. variable profile requires rateQuantity > 0', () => {
  for (const bad of [0, -5, NaN, undefined, '454']) {
    assert.throws(
      () => deriveProfile('tomato', { packageType: 'variable_weight', rateQuantity: bad, packageUnit: 'g', confidence: 'estimated', notes: 'x' }),
      /rateQuantity must be a positive number/,
    );
  }
});

test('4. variable profile rejects packageQuantity', () => {
  assert.throws(
    () => deriveProfile('tomato', { packageType: 'variable_weight', rateQuantity: 454, packageQuantity: 500, packageUnit: 'g', confidence: 'estimated', notes: 'x' }),
    /must not carry packageQuantity\/packagePriceCents/,
  );
});

test('5. variable profile rejects packagePriceCents', () => {
  assert.throws(
    () => deriveProfile('tomato', { packageType: 'variable_weight', rateQuantity: 454, packagePriceCents: 250, packageUnit: 'g', confidence: 'estimated', notes: 'x' }),
    /must not carry packageQuantity\/packagePriceCents/,
  );
});

test('6. variable profile rejects a count canonical baseUnit', () => {
  assert.throws(
    () => deriveProfile('eggs', { packageType: 'variable_weight', rateQuantity: 1, packageUnit: 'count', confidence: 'estimated', notes: 'x' }),
    /not valid for a 'count' baseUnit/,
  );
});

test('7. fixed profile validation is unchanged (and rejects rate fields)', () => {
  // real fixed profiles still build; count = 62 with price rows
  assert.equal(Object.keys(cp.PURCHASE_PROFILES).length, 62);
  assert.equal(cp.PURCHASE_PROFILES.tomato.packageType, 'weight_package');
  assert.equal(cp.PURCHASE_PROFILES.tomato.packageQuantity, 500);
  assert.throws(
    () => deriveProfile('tomato', { packageType: 'weight_package', packageQuantity: 500, rateQuantity: 1, packageUnit: 'g', confidence: 'estimated', notes: 'x' }),
    /fixed profile must not carry rateQuantity\/ratePriceCents/,
  );
  assert.throws(
    () => deriveProfile('tomato', { packageType: 'weight_package', packageUnit: 'g', confidence: 'estimated', notes: 'x' }),
    /packageQuantity must be a positive number/,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// PROPORTIONAL INTEGER-CENT COST  (8-11)
// ═══════════════════════════════════════════════════════════════════════════

describe('8/9/10. proportional cost table @ 137¢ / 454 g', () => {
  const EXPECT = [
    [1, 0], [1.5, 0], [10, 3], [50, 15], [100, 30],
    [227, 69], [454, 137], [455, 137], [800, 241], [908, 274],
  ];
  for (const [g, cents] of EXPECT) {
    test(`${g} g -> ${cents} ¢, covered`, () => {
      const r = rowFor(g);
      assert.equal(r.purchaseCostCents, cents);
      assert.equal(r.pricingStatus, PURCHASE_PRICING_STATUS.COVERED);
      assert.ok(Number.isInteger(r.purchaseCostCents));
    });
  }
  test('1 g and 1.5 g are intentionally 0 ¢ while covered (NOT floored to 1)', () => {
    assert.equal(rowFor(1).purchaseCostCents, 0);
    assert.equal(rowFor(1.5).purchaseCostCents, 0);
    assert.equal(rowFor(1).pricingStatus, PURCHASE_PRICING_STATUS.COVERED);
    assert.equal(rowFor(1.5).pricingStatus, PURCHASE_PRICING_STATUS.COVERED);
  });
});

test('10. no package cliff at rateQuantity + epsilon', () => {
  const at = rowFor(454).purchaseCostCents;
  const over = rowFor(455).purchaseCostCents;
  assert.equal(over, at, 'a 1 g overage must NOT double the cost');
  // monotonic non-decreasing across the table
  const qs = [1, 10, 100, 227, 454, 455, 800, 908];
  let prev = -1;
  for (const q of qs) {
    const c = rowFor(q).purchaseCostCents;
    assert.ok(c >= prev, `cost must be monotonic (${q} g -> ${c} ¢ < ${prev})`);
    prev = c;
  }
});

test('11. purchaseQuantity is the normalized milli quantity (not the raw float sum)', () => {
  assert.equal(rowFor(1.5).purchaseQuantity, 1.5);
  assert.equal(rowFor(227).purchaseQuantity, 227);
  // fractional occurrences summed -> normalized to 0.001
  const r = ga.buildWeeklyPurchasePlan(
    [{ ingredients: [1.5, 0.5, 0.8, 0.3, 0.5, 10].map((v) => ({ name: 'tomato', amountValue: v, amountUnit: 'g' })) }],
    { budgetCents: 100000, currency: 'USD', getProfile: inject(VW) },
  ).rows[0];
  assert.equal(r.purchaseQuantity, 13.6);
  assert.equal(r.requiredQuantity, 13.6, 'reported and purchased quantities are the same normalized value');
});

// ═══════════════════════════════════════════════════════════════════════════
// RESULT ROW SHAPE  (12-14)
// ═══════════════════════════════════════════════════════════════════════════

test('12. variable row: packageCount / packageQuantity / packagePriceCents are null', () => {
  const r = rowFor(100);
  assert.equal(r.packageCount, null);
  assert.equal(r.packageQuantity, null);
  assert.equal(r.packagePriceCents, null);
});

test('13. variable row: rateQuantity / ratePriceCents / packageType populated', () => {
  const r = rowFor(100);
  assert.equal(r.rateQuantity, 454);
  assert.equal(r.ratePriceCents, 137);
  assert.equal(r.packageType, 'variable_weight');
  assert.equal(r.purchaseUnit, 'g');
  assert.equal(r.confidence, 'estimated');
});

test('14. fixed rows do NOT gain rate fields', () => {
  const plan = ga.buildWeeklyPurchasePlan(
    [{ ingredients: [{ name: 'rice', amountValue: 100, amountUnit: 'g' }] }],
    { budgetCents: 100000, currency: 'USD' },
  );
  const r = plan.rows[0];
  assert.equal('rateQuantity' in r, false);
  assert.equal('ratePriceCents' in r, false);
  assert.equal(r.packageType, 'weight_package');
  assert.equal(r.packageCount, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE / CERTIFICATION / BUDGET  (15-20)
// ═══════════════════════════════════════════════════════════════════════════

test('15. confidence unknown -> uncertified_pricing (still yields a quantity)', () => {
  const r = rowFor(100, { ...VW, confidence: 'unknown' });
  assert.equal(r.pricingStatus, PURCHASE_PRICING_STATUS.UNCERTIFIED_PRICING);
  assert.equal(r.purchaseQuantity, 100);
  assert.ok(Number.isInteger(r.purchaseCostCents));
  assert.equal(isCertifiableProfile({ ...VW, confidence: 'unknown' }), false);
  assert.equal(isCertifiableProfile(VW), true);
});

test('16. uncertified variable pricing cannot certify the week', () => {
  const plan = planFor(100, { ...VW, confidence: 'unknown' });
  assert.equal(plan.allCovered, false);
  assert.equal(plan.certifiedEstimatedPurchaseCostCents, null);
  assert.equal(plan.purchaseBudgetStatus, 'purchase_pricing_incomplete');
});

test('17. estimated variable pricing participates in allCovered', () => {
  const plan = planFor(100);
  assert.equal(plan.allCovered, true);
  assert.equal(plan.uncoveredIngredientCount, 0);
});

test('18. variable cost contributes to coveredPurchaseCostCents', () => {
  const plan = planFor(227); // 69 ¢
  assert.equal(plan.coveredPurchaseCostCents, 69);
  assert.equal(plan.certifiedEstimatedPurchaseCostCents, 69);
});

test('19. withinBudget uses the proportional cost', () => {
  assert.equal(planFor(800, VW, 250).withinBudget, true);  // 241 ¢ <= 250
  assert.equal(planFor(800, VW, 240).withinBudget, false); // 241 ¢ >  240
  assert.equal(planFor(800, VW, 240).purchaseBudgetStatus, 'purchase_over_budget');
});

test('20. authoritative weekly totals stay integer cents with a variable row', () => {
  const plan = buildWeeklyPurchasePlan(
    [{ ingredients: [
      { name: 'tomato', amountValue: 250.5, amountUnit: 'g' },
      { name: 'rice', amountValue: 100, amountUnit: 'g' },
    ] }],
    { budgetCents: 100000, currency: 'USD', getProfile: inject(VW) },
  );
  assert.ok(Number.isInteger(plan.coveredPurchaseCostCents));
  assert.ok(Number.isInteger(plan.weeklyPurchaseCostCents));
  assert.ok(Number.isInteger(plan.certifiedEstimatedPurchaseCostCents));
});

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISM  (21-22)
// ═══════════════════════════════════════════════════════════════════════════

test('21. repeated calculation is byte-identical', () => {
  const a = JSON.stringify(rowFor(227.333));
  const b = JSON.stringify(rowFor(227.333));
  assert.equal(a, b);
});

test('22. reordered fractional occurrences produce an identical certified purchase row', () => {
  const mk = (occs) => JSON.stringify(buildWeeklyPurchasePlan(
    [{ ingredients: occs.map((v) => ({ name: 'tomato', amountValue: v, amountUnit: 'g' })) }],
    { budgetCents: 100000, currency: 'USD', getProfile: inject(VW) },
  ).rows[0]);
  const forward = mk([1.5, 0.5, 0.8, 0.3, 0.5, 10, 0.1, 0.2]);
  const shuffled = mk([0.2, 10, 0.5, 0.1, 1.5, 0.8, 0.3, 0.5]);
  assert.equal(forward, shuffled);
});

// ═══════════════════════════════════════════════════════════════════════════
// REGRESSION / INTEGRATION  (23-26)
// ═══════════════════════════════════════════════════════════════════════════

test('23. existing fixed ceil behaviour is unchanged', () => {
  // rice: 907 g bag @ 200 ¢
  const one = ga.buildWeeklyPurchasePlan([{ ingredients: [{ name: 'rice', amountValue: 100, amountUnit: 'g' }] }], { budgetCents: 100000, currency: 'USD' }).rows[0];
  assert.equal(one.packageCount, 1);
  assert.equal(one.purchaseQuantity, 907);
  assert.equal(one.purchaseCostCents, 200);
  const two = ga.buildWeeklyPurchasePlan([{ ingredients: [{ name: 'rice', amountValue: 908, amountUnit: 'g' }] }], { budgetCents: 100000, currency: 'USD' }).rows[0];
  assert.equal(two.packageCount, 2);
  assert.equal(two.purchaseCostCents, 400);
});

test('24. a variable-weight plan carries every field certificationAssessment consumes', () => {
  // certificationAssessment.assessWeek reads ONLY these plan fields; verify the
  // Phase 2 engine populates them correctly for a plan containing a variable row.
  const plan = planFor(100);
  for (const k of ['allCovered', 'withinBudget', 'enforceable', 'weeklyPurchaseCostCents',
    'coveredPurchaseCostCents', 'certifiedEstimatedPurchaseCostCents', 'uncovered', 'purchaseBudgetStatus']) {
    assert.ok(k in plan, `plan missing ${k}`);
  }
  assert.equal(plan.allCovered, true);
  assert.equal(plan.withinBudget, true);
  assert.equal(plan.certifiedEstimatedPurchaseCostCents, 30);
  assert.equal(plan.purchaseBudgetStatus, 'purchase_certified');
});

test('25. buildCertifiedSnapshot preserves a real variable-weight purchase plan verbatim', () => {
  // A real Phase 2 plan carrying a variable-weight row (built via the getProfile
  // seam) fed through the ACTUAL certificationAssessment.buildCertifiedSnapshot
  // (unmodified). It stores weekAssessment.purchase.plan verbatim.
  const realPlan = planFor(227); // variable-weight tomato row, 69 ¢
  const vwRow = realPlan.rows.find((r) => r.packageType === 'variable_weight');
  assert.ok(vwRow);

  const weekAssessment = Object.freeze({
    certified: true,
    requestedBudgetCents: 100000,
    currency: 'USD',
    nutrition: { weeklyTotals: { kcal: 100, proteinG: 5, carbsG: 10, fatG: 1 } },
    days: [{
      nutritionTotals: { kcal: 100, proteinG: 5, carbsG: 10, fatG: 1 },
      meals: [{
        type: 'lunch', name: 'x',
        nutrition: { totals: { kcal: 100, proteinG: 5, carbsG: 10, fatG: 1 } },
        ingredients: [{ canonicalIngredientId: 'tomato', input: { name: 'tomato', amountValue: 227, amountUnit: 'g', preparation: null } }],
      }],
    }],
    purchase: { plan: realPlan, certifiedEstimatedPurchaseCostCents: realPlan.certifiedEstimatedPurchaseCostCents },
  });

  const snap = A.buildCertifiedSnapshot(weekAssessment, { now: () => '2026-08-29T00:00:00.000Z' });
  assert.ok(snap);
  const snapRow = snap.weeklyPurchasePlan.rows.find((r) => r.packageType === 'variable_weight');
  assert.equal(snapRow.packageType, 'variable_weight');
  assert.equal(snapRow.rateQuantity, 454);
  assert.equal(snapRow.ratePriceCents, 137);
  assert.equal(snapRow.purchaseQuantity, 227);
  assert.equal(snapRow.purchaseCostCents, 69);
  assert.equal(snapRow.packageCount, null);
  assert.equal(snapRow.packageQuantity, null);
  assert.equal(snapRow.packagePriceCents, null);
  assert.equal(snap.authoritativeWeeklyPurchaseCostCents, 69);

  // and it JSON-round-trips losslessly (plan blobs persist as JSON)
  assert.deepEqual(JSON.parse(JSON.stringify(snap.weeklyPurchasePlan)), snap.weeklyPurchasePlan);
});

test('26. certificationVersion remains exactly 1', () => {
  assert.equal(A.CERTIFICATION_VERSION, 1);
  const snap = A.buildCertifiedSnapshot(
    A.assessWeek({
      days: [{ meals: [{ type: 'b', name: 'x', ingredients: [
        { name: 'eggs', amountValue: 2, amountUnit: 'count' },
        { name: 'spinach', amountValue: 40, amountUnit: 'g' },
        { name: 'olive oil', amountValue: 8, amountUnit: 'ml' },
      ] }] }],
      requestedBudgetCents: 500000, currency: 'USD',
    }),
    { now: () => '2026-08-29T00:00:00.000Z' },
  );
  assert.equal(snap.certificationVersion, 1);
});
