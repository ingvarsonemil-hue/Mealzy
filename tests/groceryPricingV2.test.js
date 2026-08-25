'use strict';

/**
 * Grocery Units + Unknown Pricing v2 — regression coverage for the
 * root-cause findings in the manual 5-list / 107-observation supermarket
 * audit. See tests/fixtures/manualSupermarketObservations.js for the raw
 * evidence this suite defends against regressing on (explicitly NOT
 * universal market-price truth — see that file's header).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { priceIngredient, priceIngredients, PRICE_SOURCE, UNKNOWN_INGREDIENT_ESTIMATE_USD } = require('../pricing.js');
const { buildGroceryList } = require('../groceryAggregation.js');
const budgetEngine = require('../budgetEngine.js');
const { MANUAL_OBSERVATIONS } = require('./fixtures/manualSupermarketObservations.js');

const priceRows = [
  { name: 'chicken breast',   category: 'meat',    price_per_unit: 0.011,   unit: 'g' },
  { name: 'salt and pepper',  category: 'pantry',  price_per_unit: 0.01,    unit: 'g' },
  { name: 'honey',            category: 'pantry',  price_per_unit: 0.011,   unit: 'g' },
  { name: 'garlic',           category: 'produce', price_per_unit: 0.011,   unit: 'g' },
];

describe('M/P: a dataset-priced item carries explicit dataset status, never inferred from its dollar value', () => {
  test('a known ingredient that legitimately costs exactly $0.50 is still VERIFIED, not treated as unknown', () => {
    // 50g garlic * 0.011/g = 0.55 -> not exactly 0.50; use a row/qty that
    // lands exactly on 0.50 to prove the coincidence case specifically.
    const rows = [{ name: 'garlic', category: 'produce', price_per_unit: 0.01, unit: 'g' }]; // 50g * 0.01 = 0.50
    const result = priceIngredient({ name: 'garlic', amountValue: 50, amountUnit: 'g' }, rows);
    assert.equal(result.costUSD, 0.50);
    assert.equal(result.source, PRICE_SOURCE.VERIFIED); // NOT UNKNOWN_INGREDIENT, despite cost === 0.50
  });
});

describe('N/Q: an unknown expensive protein (venison) is explicitly flagged, never a confident $0.50', () => {
  test('venison has no price row -> UNKNOWN_INGREDIENT, flat $0.50, never VERIFIED', () => {
    const result = priceIngredient({ name: 'venison steak', amountValue: 200, amountUnit: 'g' }, priceRows);
    assert.equal(result.costUSD, UNKNOWN_INGREDIENT_ESTIMATE_USD);
    assert.equal(result.source, PRICE_SOURCE.UNKNOWN_INGREDIENT);
    assert.notEqual(result.source, PRICE_SOURCE.VERIFIED);
  });

  test('priceIngredients() aggregate puts the venison cost in unknownEstimatedCostUSD, not datasetPricedCostUSD', () => {
    const result = priceIngredients(
      [
        { name: 'chicken breast', amountValue: 200, amountUnit: 'g' }, // real, dataset-priced
        { name: 'venison steak',  amountValue: 200, amountUnit: 'g' }, // unknown, silently $0.50 today
      ],
      priceRows
    );
    assert.equal(result.datasetPricedCostUSD, 2.2); // 200 * 0.011
    assert.equal(result.unknownEstimatedCostUSD, 0.50);
    assert.equal(result.unknownIngredientCount, 1);
    assert.equal(result.allVerified, false);
    // The total still includes the $0.50 guess (Budget Engine v1 behavior is
    // unchanged, per Phase A decision — see item W below) — but the split is
    // now available so a caller CAN tell the two apart, unlike before.
    assert.equal(result.totalUSD, 2.70);
  });
});

describe('R: a cheap unknown pantry item is still marked unknown, not silently accepted as truthful', () => {
  test('an unmatched cheap ingredient (rosemary sprig) still gets UNKNOWN_INGREDIENT status, even though $0.50 happens to overstate it', () => {
    const result = priceIngredient({ name: 'rosemary sprig', amountValue: 3, amountUnit: 'g' }, priceRows);
    assert.equal(result.source, PRICE_SOURCE.UNKNOWN_INGREDIENT);
    assert.equal(result.costUSD, 0.50); // acknowledged-inflated flat estimate, but explicitly labeled as such
  });
});

describe('S/T: grocery aggregation preserves pricing status and occurrence-safe unknown risk', () => {
  test('three separate unknown "venison" occurrences merge into one row costing 3x the flat estimate, not 1x', () => {
    const meals = [{
      ingredients: [
        { name: 'venison steak', amountValue: 150, amountUnit: 'g' },
        { name: 'venison steak', amountValue: 150, amountUnit: 'g' },
        { name: 'venison steak', amountValue: 150, amountUnit: 'g' },
      ],
    }];
    const list = buildGroceryList(meals, priceRows, { weekStart: '2026-08-24', budget: 50, currency: 'USD' });
    const item = list.categories.other.find(i => i.name === 'venison steak');
    assert.equal(item.priceSource, PRICE_SOURCE.UNKNOWN_INGREDIENT);
    assert.equal(item.cost, 1.50); // 3 occurrences * $0.50 — never collapses to a single $0.50
    assert.equal(list.unknownEstimatedCostUSD, 1.50);
    assert.equal(list.unknownIngredientCount, 1); // one grocery ROW, not one per occurrence
  });

  test('a verified ingredient carries priceSource VERIFIED through to the grocery row', () => {
    const meals = [{ ingredients: [{ name: 'chicken breast', amountValue: 200, amountUnit: 'g' }] }];
    const list = buildGroceryList(meals, priceRows, { weekStart: '2026-08-24', budget: 50, currency: 'USD' });
    const item = list.categories.protein.find(i => i.name === 'chicken breast');
    assert.equal(item.priceSource, PRICE_SOURCE.VERIFIED);
  });
});

describe('U/V: no invented or missing grocery ingredients', () => {
  test('grocery rows are exactly the distinct (name, unit) pairs from the input, no more, no fewer', () => {
    const meals = [{
      ingredients: [
        { name: 'chicken breast', amountValue: 100, amountUnit: 'g' },
        { name: 'garlic', amountValue: 10, amountUnit: 'g' },
      ],
    }];
    const list = buildGroceryList(meals, priceRows, { weekStart: '2026-08-24', budget: 50, currency: 'USD' });
    const allNames = Object.values(list.categories).flat().map(i => i.name).sort();
    assert.deepEqual(allNames, ['chicken breast', 'garlic']);
  });
});

describe('W: Budget Engine invariant is unchanged by the new pricing-confidence fields (transparency, not enforcement — see Phase A decision)', () => {
  test('evaluateBudget still compares only the scalar total; unknownEstimatedCostUSD does not affect the pass/fail decision', () => {
    const priced = priceIngredients(
      [{ name: 'venison steak', amountValue: 200, amountUnit: 'g' }], // $0.50, unknown
      priceRows
    );
    const evaluation = budgetEngine.evaluateBudget(priced.totalUSD, 5);
    assert.equal(evaluation.withinBudget, true); // a real venison steak (~$9.59) would blow this budget; the $0.50 fallback does not
    assert.equal(priced.unknownEstimatedCostUSD, 0.50); // but the risk is now visible on the priced result, for a caller to act on
  });
});

describe('Honey ml/g density fix (Major Finding #2)', () => {
  test('honey given in ml prices as VERIFIED via the documented density conversion, not a silent $0.50', () => {
    // 15ml honey (~1 tbsp) * 1.42 g/ml density = 21.3g * 0.011/g ~= 0.23
    const result = priceIngredient({ name: 'honey', amountValue: 15, amountUnit: 'ml' }, priceRows);
    assert.equal(result.source, PRICE_SOURCE.VERIFIED);
    assert.equal(result.costUSD, 0.23);
  });
  test('honey given in g (matches the row unit directly) still prices normally, unaffected by the density path', () => {
    const result = priceIngredient({ name: 'honey', amountValue: 21, amountUnit: 'g' }, priceRows);
    assert.equal(result.source, PRICE_SOURCE.VERIFIED);
    assert.equal(result.costUSD, 0.23);
  });
});

describe('Salt regression (structural, per Grocery Units v2 audit — root cause NOT changed, only pinned)', () => {
  // Phase A finding: "salt" resolves via the existing conservative substring
  // fallback to the real "salt and pepper" row (p.name.includes(norm)) —
  // this is a correct, intentional match, not the bug. The arithmetic is
  // linear and deterministic: cost = price_per_unit * amountValue. A single
  // realistic per-meal seasoning quantity (2-5g) stays trivially cheap; the
  // ~$1.50 manual observation requires amountValue ~150g, which is only
  // reachable by aggregating many occurrences across a whole week's meals
  // (see server.js generateGroceryListForMeals — grocery lists are built
  // per-day normally, but /api/generate-grocery-list can aggregate a whole
  // week's meals in one call). This test pins that arithmetic so a future
  // change to the "salt and pepper" row's matching or price silently
  // reintroducing the wrong ORDER OF MAGNITUDE would fail loudly. The price
  // row itself is NOT changed here — Phase A could not confirm from static
  // code alone whether the row's value or the aggregation quantity is the
  // deeper problem without a live generation sample (see Phase A report).
  test('a single realistic per-meal salt quantity (4g) stays cheap, matching real-world magnitude', () => {
    const result = priceIngredient({ name: 'salt', amountValue: 4, amountUnit: 'g' }, priceRows);
    assert.equal(result.source, PRICE_SOURCE.VERIFIED); // resolves via substring match to "salt and pepper" — correct, not a matching bug
    assert.equal(result.costUSD, 0.04);
  });

  test('"salt" resolves to the real "salt and pepper" row, not an unrelated/unmatched row', () => {
    const result = priceIngredient({ name: 'salt', amountValue: 1, amountUnit: 'g' }, priceRows);
    assert.equal(result.category, 'pantry');
  });

  test('the observed ~$1.50 magnitude requires ~150g aggregated salt — reproduced explicitly so a future silent price-row change is caught', () => {
    const result = priceIngredient({ name: 'salt', amountValue: 150, amountUnit: 'g' }, priceRows);
    assert.equal(result.costUSD, 1.50);
  });
});

describe('Manual supermarket evidence fixture is loaded and shaped as documented', () => {
  test('fixture has at least the required venison/honey/salt-adjacent entries', () => {
    assert.ok(MANUAL_OBSERVATIONS.length >= 10);
    const names = MANUAL_OBSERVATIONS.map(o => o.ingredient);
    assert.ok(names.includes('venison steak'));
    assert.ok(names.includes('honey'));
  });
});
