'use strict';

/**
 * Phase 2 — Purchasable Grocery Economics.
 *
 * Recipe quantity != purchase quantity. Mealzy's authoritative weekly budget
 * number becomes the estimated PURCHASE cost: the week's ingredient
 * requirements aggregated by canonical identity, rounded UP to real package
 * sizes, priced in integer cents, and certified only when every ingredient
 * has certification-grade purchase pricing.
 *
 * Covers the 25 required Phase 2 scenarios plus the explicit regression that
 * two meals sharing an ingredient must buy ONE package, not one per meal.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const groceryAgg = require('../groceryAggregation.js');
const canonicalPurchaseData = require('../canonicalPurchaseData.js');
const budgetEngine = require('../budgetEngine.js');

const { buildWeeklyPurchasePlan, aggregateWeeklyRequirements, computeRowPurchase, PURCHASE_PRICING_STATUS } = groceryAgg;
const { PURCHASE_BUDGET_STATUS } = budgetEngine;
const { PURCHASE_PROFILES, getPurchaseProfile } = canonicalPurchaseData;

const RICE = PURCHASE_PROFILES.rice;               // weight_package, packageQuantity 907 g
const CHICKEN = PURCHASE_PROFILES.chicken_breast;  // weight_package, packageQuantity 907 g
const EGGS = PURCHASE_PROFILES.eggs;               // count_package, packageQuantity 12
const MILK = PURCHASE_PROFILES.milk;               // volume_package, packageQuantity 1893 ml

const meal = (...ingredients) => ({ ingredients });
const row = (plan, canonicalId) => plan.rows.find(r => r.canonicalIngredientId === canonicalId);

// helper: expected package rounding
function expectPackages(profile, required) {
  const count = Math.ceil(required / profile.packageQuantity);
  return { count, quantity: count * profile.packageQuantity, cents: count * profile.packagePriceCents };
}

describe('1-3: weight package rounding', () => {
  test('required just under one package rounds up to exactly one package', () => {
    const required = RICE.packageQuantity - 257; // e.g. 650 when packageQuantity is 907
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'rice', amountValue: 300, amountUnit: 'g' }), meal({ name: 'rice', amountValue: required - 300, amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = row(plan, 'rice');
    assert.equal(r.requiredQuantity, required);
    assert.equal(r.packageCount, 1);
    assert.equal(r.purchaseQuantity, RICE.packageQuantity);
    assert.equal(r.purchaseCostCents, RICE.packagePriceCents);
  });

  test('required above one package rounds up to multiple packages', () => {
    const required = CHICKEN.packageQuantity + 100;
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'chicken breast', amountValue: required, amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = row(plan, 'chicken_breast');
    const exp = expectPackages(CHICKEN, required);
    assert.equal(r.packageCount, 2);
    assert.equal(r.purchaseQuantity, exp.quantity);
    assert.equal(r.purchaseCostCents, exp.cents);
  });

  test('required exactly equal to one package stays one package (no spurious extra)', () => {
    const required = RICE.packageQuantity;
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'rice', amountValue: required, amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = row(plan, 'rice');
    assert.equal(r.packageCount, 1);
    assert.equal(r.purchaseQuantity, required);
  });
});

describe('4: volume package rounding', () => {
  test('ml requirement rounds up to whole volume packages', () => {
    const required = MILK.packageQuantity + 1;
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'milk', amountValue: required, amountUnit: 'ml' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = row(plan, 'milk');
    assert.equal(r.packageUnit, 'ml');
    assert.equal(r.packageCount, 2);
    assert.equal(r.purchaseQuantity, MILK.packageQuantity * 2);
  });
});

describe('5-6: count package rounding', () => {
  test('7 eggs required from a 12-count carton -> buy 12', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'eggs', amountValue: 3, amountUnit: 'count' }), meal({ name: 'egg', amountValue: 4, amountUnit: 'count' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = row(plan, 'eggs');
    assert.equal(r.requiredQuantity, 7);
    assert.equal(r.packageCount, 1);
    assert.equal(r.purchaseQuantity, 12);
    assert.equal(r.purchaseCostCents, EGGS.packagePriceCents);
  });

  test('13 eggs required from a 12-count carton -> buy 24', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'eggs', amountValue: 13, amountUnit: 'count' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = row(plan, 'eggs');
    assert.equal(r.packageCount, 2);
    assert.equal(r.purchaseQuantity, 24);
    assert.equal(r.purchaseCostCents, EGGS.packagePriceCents * 2);
  });
});

describe('7 + regression: week-level aggregation happens BEFORE package rounding', () => {
  test('300 g + 350 g rice = 650 g required -> ONE bag, never two', () => {
    const plan = buildWeeklyPurchasePlan(
      [
        meal({ name: 'rice', amountValue: 300, amountUnit: 'g' }),
        meal({ name: 'rice', amountValue: 350, amountUnit: 'g' }),
      ],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = row(plan, 'rice');
    assert.equal(r.requiredQuantity, 650);
    assert.equal(r.packageCount, 1);
    assert.equal(r.purchaseQuantity, RICE.packageQuantity);
    assert.equal(r.purchaseCostCents, RICE.packagePriceCents); // NOT 2x
  });

  test('per-meal rounding would have bought 2 bags — prove we do not', () => {
    const perMealBags = Math.ceil(300 / RICE.packageQuantity) + Math.ceil(350 / RICE.packageQuantity); // = 2
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'rice', amountValue: 300, amountUnit: 'g' }), meal({ name: 'rice', amountValue: 350, amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    assert.equal(perMealBags, 2);
    assert.equal(row(plan, 'rice').packageCount, 1);
  });
});

describe('8: canonical aliases aggregate together', () => {
  test('"chicken breast" and "chicken breasts" contribute to one weekly requirement', () => {
    const plan = buildWeeklyPurchasePlan(
      [
        meal({ name: 'chicken breast', amountValue: 200, amountUnit: 'g' }),
        meal({ name: 'chicken breasts', amountValue: 150, amountUnit: 'g' }),
        meal({ name: 'BONELESS SKINLESS CHICKEN BREAST', amountValue: 100, amountUnit: 'g' }),
      ],
      { budgetCents: 100000, currency: 'USD' }
    );
    const chickenRows = plan.rows.filter(r => r.canonicalIngredientId === 'chicken_breast');
    assert.equal(chickenRows.length, 1);
    assert.equal(chickenRows[0].requiredQuantity, 450);
    assert.equal(chickenRows[0].occurrenceCount, 3);
  });
});

describe('9: distinct canonical ingredients remain separate', () => {
  test('chicken breast and chicken thighs never merge', () => {
    const plan = buildWeeklyPurchasePlan(
      [
        meal({ name: 'chicken breast', amountValue: 200, amountUnit: 'g' }),
        meal({ name: 'chicken thighs', amountValue: 200, amountUnit: 'g' }),
      ],
      { budgetCents: 100000, currency: 'USD' }
    );
    assert.ok(row(plan, 'chicken_breast'));
    assert.ok(row(plan, 'chicken_thighs'));
    assert.equal(plan.rows.length, 2);
  });
});

describe('10: purchase cost is integer cents', () => {
  test('every row purchaseCostCents and the weekly totals are integers', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal(
        { name: 'rice', amountValue: 500, amountUnit: 'g' },
        { name: 'olive oil', amountValue: 40, amountUnit: 'ml' },
        { name: 'eggs', amountValue: 6, amountUnit: 'count' },
      )],
      { budgetCents: 100000, currency: 'USD' }
    );
    for (const r of plan.rows) {
      assert.ok(Number.isInteger(r.purchaseCostCents), `${r.name} cost not integer: ${r.purchaseCostCents}`);
    }
    assert.ok(Number.isInteger(plan.certifiedEstimatedPurchaseCostCents));
    assert.ok(Number.isInteger(plan.weeklyPurchaseCostCents));
  });
});

describe('11: weekly total equals the sum of purchase costs, not consumed-unit costs', () => {
  test('certifiedEstimatedPurchaseCostCents === sum of covered rows purchaseCostCents', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal(
        { name: 'rice', amountValue: 650, amountUnit: 'g' },
        { name: 'chicken breast', amountValue: 900, amountUnit: 'g' },
        { name: 'eggs', amountValue: 6, amountUnit: 'count' },
      )],
      { budgetCents: 100000, currency: 'USD' }
    );
    const summed = plan.rows
      .filter(r => r.pricingStatus === PURCHASE_PRICING_STATUS.COVERED)
      .reduce((s, r) => s + r.purchaseCostCents, 0);
    assert.equal(plan.coveredPurchaseCostCents, summed);
    assert.equal(plan.certifiedEstimatedPurchaseCostCents, summed); // fully covered here
    // and it is the package price, e.g. rice 650g -> one 907g bag price
    assert.equal(row(plan, 'rice').purchaseCostCents, RICE.packagePriceCents);
  });
});

describe('12: an unknown ingredient cannot be falsely certified', () => {
  test('an ingredient that does not resolve blocks certification even under budget', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal(
        { name: 'rice', amountValue: 500, amountUnit: 'g' },
        { name: 'dragonfruit reduction', amountValue: 50, amountUnit: 'g' },
      )],
      { budgetCents: 100000, currency: 'USD' }
    );
    const unknown = plan.rows.find(r => r.name === 'dragonfruit reduction');
    assert.equal(unknown.pricingStatus, PURCHASE_PRICING_STATUS.UNRESOLVED_INGREDIENT);
    assert.equal(unknown.purchaseCostCents, null);
    assert.equal(plan.allCovered, false);
    assert.equal(plan.certifiedEstimatedPurchaseCostCents, null); // never a partial subtotal
    assert.ok(plan.coveredPurchaseCostCents > 0); // covered subtotal still reported
    assert.equal(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.PRICING_INCOMPLETE);
    assert.notEqual(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.CERTIFIED);
  });
});

describe('13: a known ingredient with no purchase profile cannot be falsely certified', () => {
  test('missing profile -> missing_profile status, blocks certification', (t) => {
    const original = canonicalPurchaseData.getPurchaseProfile;
    t.after(() => { canonicalPurchaseData.getPurchaseProfile = original; });
    canonicalPurchaseData.getPurchaseProfile = (id) => (id === 'rice' ? null : original(id));

    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'rice', amountValue: 500, amountUnit: 'g' }, { name: 'eggs', amountValue: 6, amountUnit: 'count' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = row(plan, 'rice');
    assert.equal(r.pricingStatus, PURCHASE_PRICING_STATUS.MISSING_PROFILE);
    assert.equal(r.purchaseCostCents, null);
    assert.equal(plan.certifiedEstimatedPurchaseCostCents, null);
    assert.equal(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.PRICING_INCOMPLETE);
  });
});

describe('14: a missing / invalid package price cannot be falsely certified', () => {
  test('a profile with a non-positive packagePriceCents is not certification-grade', (t) => {
    const original = canonicalPurchaseData.getPurchaseProfile;
    const originalCertifiable = canonicalPurchaseData.isCertifiableProfile;
    t.after(() => {
      canonicalPurchaseData.getPurchaseProfile = original;
      canonicalPurchaseData.isCertifiableProfile = originalCertifiable;
    });
    canonicalPurchaseData.getPurchaseProfile = (id) =>
      id === 'rice' ? { ...original('rice'), packagePriceCents: 0, confidence: 'estimated' } : original(id);

    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'rice', amountValue: 500, amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    assert.equal(row(plan, 'rice').pricingStatus, PURCHASE_PRICING_STATUS.UNCERTIFIED_PRICING);
    assert.notEqual(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.CERTIFIED);
  });

  test('the amortized-rate spice rows ship as confidence "unknown" and never certify', () => {
    for (const id of ['cumin', 'paprika', 'cinnamon', 'rosemary']) { // Phase 3C: 'salt_and_pepper' removed (identity + profile gone)
      const p = getPurchaseProfile(id);
      assert.equal(p.confidence, 'unknown', id);
      assert.equal(canonicalPurchaseData.isCertifiableProfile(p), false, id);
    }
  });
});

describe('purchase cost field semantics (covered subtotal vs certified estimate)', () => {
  test('A: full coverage -> coveredPurchaseCostCents === certifiedEstimatedPurchaseCostCents === full total, may certify', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'rice', amountValue: 500, amountUnit: 'g' }, { name: 'eggs', amountValue: 6, amountUnit: 'count' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const full = RICE.packagePriceCents + EGGS.packagePriceCents;
    assert.equal(plan.allCovered, true);
    assert.equal(plan.coveredPurchaseCostCents, full);
    assert.equal(plan.certifiedEstimatedPurchaseCostCents, full);
    assert.equal(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.CERTIFIED);
  });

  test('B: incomplete coverage -> coveredPurchaseCostCents is the known subtotal, certifiedEstimatedPurchaseCostCents is null, status incomplete', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'rice', amountValue: 500, amountUnit: 'g' }, { name: 'cumin', amountValue: 5, amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    assert.equal(plan.allCovered, false);
    assert.equal(plan.coveredPurchaseCostCents, RICE.packagePriceCents); // rice only
    assert.equal(plan.certifiedEstimatedPurchaseCostCents, null);
    assert.equal(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.PRICING_INCOMPLETE);
  });

  test('C: incomplete coverage AND the covered subtotal alone already exceeds budget -> purchase_over_budget, never certified', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'rice', amountValue: 500, amountUnit: 'g' }, { name: 'cumin', amountValue: 5, amountUnit: 'g' })],
      { budgetCents: RICE.packagePriceCents - 1, currency: 'USD' }
    );
    assert.equal(plan.allCovered, false);
    assert.equal(plan.certifiedEstimatedPurchaseCostCents, null);
    assert.equal(plan.withinBudget, false);
    assert.equal(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.OVER_BUDGET);
    assert.notEqual(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.CERTIFIED);
  });
});

describe('15-17: budget certification boundary', () => {
  const oneBagPlan = () => [meal({ name: 'rice', amountValue: 500, amountUnit: 'g' })]; // exactly RICE.packagePriceCents

  test('15: over-budget purchase cost fails certification', () => {
    const plan = buildWeeklyPurchasePlan(oneBagPlan(), { budgetCents: RICE.packagePriceCents - 1, currency: 'USD' });
    assert.equal(plan.withinBudget, false);
    assert.equal(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.OVER_BUDGET);
  });

  test('16: under-budget fully covered purchase cost passes certification', () => {
    const plan = buildWeeklyPurchasePlan(oneBagPlan(), { budgetCents: RICE.packagePriceCents + 500, currency: 'USD' });
    assert.equal(plan.allCovered, true);
    assert.equal(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.CERTIFIED);
  });

  test('17: exact-budget purchase cost passes certification', () => {
    const plan = buildWeeklyPurchasePlan(oneBagPlan(), { budgetCents: RICE.packagePriceCents, currency: 'USD' });
    assert.equal(plan.withinBudget, true);
    assert.equal(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.CERTIFIED);
  });

  test('non-USD is not enforced and never certified', () => {
    const plan = buildWeeklyPurchasePlan(oneBagPlan(), { budgetCents: 100, currency: 'EUR' });
    assert.equal(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.NOT_ENFORCED);
  });
});

describe('18-19: existing behavior unaffected', () => {
  test('18: the legacy consumed-cost grocery list path still works exactly as before', () => {
    const priceRows = [{ name: 'chicken breast', category: 'meat', price_per_unit: 0.011, unit: 'g' }];
    const list = groceryAgg.buildGroceryList(
      [meal({ name: 'chicken breast', amountValue: 200, amountUnit: 'g' })],
      priceRows,
      { weekStart: '2026-08-24', budget: 60, currency: 'USD' }
    );
    assert.equal(list.totalCost, 2.2);
    assert.equal(list.budgetStatus, budgetEngine.BUDGET_STATUS.CERTIFIED);
  });

  test('19: grocery item check-state fields are untouched by the purchase layer', () => {
    const priceRows = [{ name: 'chicken breast', category: 'meat', price_per_unit: 0.011, unit: 'g' }];
    const list = groceryAgg.buildGroceryList(
      [meal({ name: 'chicken breast', amountValue: 200, amountUnit: 'g' })],
      priceRows, { weekStart: '2026-08-24', budget: 60, currency: 'USD' }
    );
    const item = Object.values(list.categories).flat()[0];
    assert.equal(item.checked, false);
    assert.equal(item.actualCost, null);
    assert.ok('estimatedCost' in item);
  });
});

describe('20: existing pricing resolver behavior preserved', () => {
  test('canonical resolution still refuses to merge related-but-distinct names', () => {
    const rows = aggregateWeeklyRequirements([meal(
      { name: 'chicken', amountValue: 100, amountUnit: 'g' },       // unresolved (no bare "chicken" canonical)
      { name: 'chicken breast', amountValue: 100, amountUnit: 'g' },
    )]);
    const breast = rows.find(r => r.canonicalIngredientId === 'chicken_breast');
    const bare = rows.find(r => r.canonicalIngredientId === null);
    assert.equal(breast.requiredQuantity, 100);
    assert.ok(bare, 'bare "chicken" stays its own unresolved row, never folded into chicken_breast');
  });
});

describe('21-22: no double rounding, no duplicate purchase from aliases', () => {
  test('21: three meals of the same ingredient still produce one package decision', () => {
    const plan = buildWeeklyPurchasePlan(
      [
        meal({ name: 'rice', amountValue: 300, amountUnit: 'g' }),
        meal({ name: 'rice', amountValue: 300, amountUnit: 'g' }),
        meal({ name: 'rice', amountValue: 300, amountUnit: 'g' }),
      ],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = row(plan, 'rice');
    assert.equal(r.requiredQuantity, 900);
    assert.equal(r.packageCount, 1); // 900 < 907
  });

  test('22: alias spellings do not create duplicate purchase rows', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal(
        { name: 'chick peas', amountValue: 200, amountUnit: 'g' },
        { name: 'chickpeas', amountValue: 200, amountUnit: 'g' },
        { name: 'garbanzo beans', amountValue: 100, amountUnit: 'g' },
      )],
      { budgetCents: 100000, currency: 'USD' }
    );
    assert.equal(plan.rows.length, 1);
    assert.equal(plan.rows[0].canonicalIngredientId, 'canned_chickpeas');
    assert.equal(plan.rows[0].requiredQuantity, 500);
  });
});

describe('23: deterministic results for the same input', () => {
  test('two runs produce byte-identical JSON', () => {
    const input = [meal(
      { name: 'rice', amountValue: 400, amountUnit: 'g' },
      { name: 'eggs', amountValue: 5, amountUnit: 'count' },
      { name: 'mystery sauce', amountValue: 20, amountUnit: 'ml' },
    )];
    const a = JSON.stringify(buildWeeklyPurchasePlan(input, { budgetCents: 8000, currency: 'USD' }));
    const b = JSON.stringify(buildWeeklyPurchasePlan(input, { budgetCents: 8000, currency: 'USD' }));
    assert.equal(a, b);
  });
});

describe('24-25: invalid and negative quantities fail safely', () => {
  test('24: a non-finite quantity yields invalid_quantity, never nonsense, never certified', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'rice', amountValue: 'lots', amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = row(plan, 'rice');
    assert.equal(r.pricingStatus, PURCHASE_PRICING_STATUS.INVALID_QUANTITY);
    assert.equal(r.purchaseCostCents, null);
    assert.notEqual(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.CERTIFIED);
  });

  test('25: a negative quantity cannot reduce purchase cost', () => {
    const positiveOnly = buildWeeklyPurchasePlan(
      [meal({ name: 'rice', amountValue: 500, amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const withNegative = buildWeeklyPurchasePlan(
      [meal({ name: 'rice', amountValue: 500, amountUnit: 'g' }, { name: 'rice', amountValue: -400, amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    // the negative occurrence is clamped to 0 contribution AND flags the row invalid
    assert.equal(withNegative.rows[0].requiredQuantity, 500);
    assert.equal(withNegative.rows[0].pricingStatus, PURCHASE_PRICING_STATUS.INVALID_QUANTITY);
    assert.ok(positiveOnly.rows[0].purchaseCostCents > 0);
  });
});

describe('regression: requiredQuantity != purchaseQuantity for an ordinary ingredient', () => {
  test('650 g rice required, 907 g purchased', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'rice', amountValue: 650, amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = row(plan, 'rice');
    assert.equal(r.requiredQuantity, 650);
    assert.equal(r.purchaseQuantity, 907);
    assert.notEqual(r.requiredQuantity, r.purchaseQuantity);
  });
});

describe('unit mismatch: recipe unit differs from canonical base unit', () => {
  test('honey given in ml (canonical base unit is g) -> unit_mismatch, not silently converted', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'honey', amountValue: 45, amountUnit: 'ml' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = plan.rows.find(x => x.canonicalIngredientId === 'honey');
    assert.equal(r.pricingStatus, PURCHASE_PRICING_STATUS.UNIT_MISMATCH);
    assert.notEqual(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.CERTIFIED);
  });
});

describe('computeRowPurchase is pure over an aggregated row', () => {
  test('same requirement row in -> same purchase row out', () => {
    const [reqRow] = aggregateWeeklyRequirements([meal({ name: 'rice', amountValue: 650, amountUnit: 'g' })]);
    assert.deepEqual(computeRowPurchase(reqRow), computeRowPurchase(reqRow));
  });
});

describe('classifyPurchaseBudgetStatus ordering', () => {
  test('provable over-budget beats an incompleteness note', () => {
    assert.equal(
      budgetEngine.classifyPurchaseBudgetStatus({ enforceable: true, allCovered: false, withinBudget: false }),
      PURCHASE_BUDGET_STATUS.OVER_BUDGET
    );
  });
  test('incomplete beats certified', () => {
    assert.equal(
      budgetEngine.classifyPurchaseBudgetStatus({ enforceable: true, allCovered: false, withinBudget: true }),
      PURCHASE_BUDGET_STATUS.PRICING_INCOMPLETE
    );
  });
  test('all covered + within budget + enforceable -> certified', () => {
    assert.equal(
      budgetEngine.classifyPurchaseBudgetStatus({ enforceable: true, allCovered: true, withinBudget: true }),
      PURCHASE_BUDGET_STATUS.CERTIFIED
    );
  });
});

describe('canonicalPurchaseData integrity', () => {
  test('every profile has integer-cent package price and a positive package quantity', () => {
    for (const [id, p] of Object.entries(PURCHASE_PROFILES)) {
      assert.ok(Number.isInteger(p.packagePriceCents) && p.packagePriceCents > 0, `${id} packagePriceCents`);
      assert.ok(Number.isFinite(p.packageQuantity) && p.packageQuantity > 0, `${id} packageQuantity`);
      assert.ok(['weight_package', 'volume_package', 'count_package', 'per_unit'].includes(p.packageType), `${id} packageType`);
    }
  });

  test('packageUnit always matches the canonical base unit', () => {
    const { getById } = require('../canonicalIngredients.js');
    for (const [id, p] of Object.entries(PURCHASE_PROFILES)) {
      assert.equal(p.packageUnit, getById(id).baseUnit, id);
    }
  });
});
