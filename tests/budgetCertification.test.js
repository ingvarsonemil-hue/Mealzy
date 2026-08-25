'use strict';

/**
 * Unknown Price Safety Gate — regression coverage for budgetEngine's new
 * budget-certification classification. See budgetEngine.js
 * classifyBudgetStatus for the full rationale: certification is a hard
 * 0-unknown-ingredient threshold, never a dollar/percentage share of the
 * already-fabricated $0.50 fallback number.
 *
 * Frozen by design (explicitly out of scope for this PR): evaluateBudget,
 * runWithBudgetRepair, runWeeklyBudgetRepair, repair selection, budget
 * buckets, repair analytics. This suite only exercises the new, separate
 * classifyBudgetStatus function and buildGroceryList's use of it — it does
 * not touch or re-test the frozen repair loop's own behavior (already
 * covered by tests/budgetEngineObservability.test.js and friends).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const budgetEngine = require('../budgetEngine.js');
const { classifyBudgetStatus, BUDGET_STATUS } = budgetEngine;
const { buildGroceryList } = require('../groceryAggregation.js');
const { priceIngredients } = require('../pricing.js');

const priceRows = [
  { name: 'chicken breast', category: 'meat',    price_per_unit: 0.011, unit: 'g' },
  { name: 'garlic',         category: 'produce', price_per_unit: 0.011, unit: 'g' },
];

describe('classifyBudgetStatus — pure classification', () => {
  test('over budget always classifies as over_budget, regardless of unknown count', () => {
    assert.equal(classifyBudgetStatus({ withinBudget: false, unknownIngredientCount: 0 }), BUDGET_STATUS.OVER_BUDGET);
    assert.equal(classifyBudgetStatus({ withinBudget: false, unknownIngredientCount: 5 }), BUDGET_STATUS.OVER_BUDGET);
  });

  test('within budget + zero unknowns -> certified', () => {
    assert.equal(classifyBudgetStatus({ withinBudget: true, unknownIngredientCount: 0 }), BUDGET_STATUS.CERTIFIED);
  });

  test('within budget + any unknown count > 0 -> estimated_with_unknowns, never certified', () => {
    assert.equal(classifyBudgetStatus({ withinBudget: true, unknownIngredientCount: 1 }), BUDGET_STATUS.ESTIMATED_WITH_UNKNOWNS);
    assert.equal(classifyBudgetStatus({ withinBudget: true, unknownIngredientCount: 4 }), BUDGET_STATUS.ESTIMATED_WITH_UNKNOWNS);
  });
});

describe('A: venison-style unknown cannot be treated as fully budget-certified at $0.50', () => {
  test('a $0.50 venison fallback, well within a $60 budget in raw dollars, still fails certification', () => {
    const priced = priceIngredients(
      [{ name: 'venison steak', amountValue: 200, amountUnit: 'g' }],
      priceRows
    );
    // The $0.50 is tiny relative to $60 (under 1%) — proving a
    // dollar/percentage threshold would have missed this, which is exactly
    // why classifyBudgetStatus uses a count, not a share.
    const evaluation = budgetEngine.evaluateBudget(priced.totalUSD, 60);
    assert.equal(evaluation.withinBudget, true);
    const status = classifyBudgetStatus({ withinBudget: evaluation.withinBudget, unknownIngredientCount: priced.unknownIngredientCount });
    assert.equal(status, BUDGET_STATUS.ESTIMATED_WITH_UNKNOWNS);
    assert.notEqual(status, BUDGET_STATUS.CERTIFIED);
  });
});

describe('B: lean-chuck-style unknown cannot be treated as fully budget-certified at $0.50', () => {
  test('same mechanism as venison — any unmatched ingredient decertifies, not just meat-sounding ones', () => {
    const priced = priceIngredients(
      [{ name: 'lean chuck meat', amountValue: 250, amountUnit: 'g' }],
      priceRows
    );
    const status = classifyBudgetStatus({ withinBudget: true, unknownIngredientCount: priced.unknownIngredientCount });
    assert.equal(status, BUDGET_STATUS.ESTIMATED_WITH_UNKNOWNS);
  });
});

describe('C: a cheap unresolved herb does not cause a catastrophic failure', () => {
  test('decertification is a status change, not a rejection — the plan/list still returns normally', () => {
    const meals = [{ ingredients: [
      { name: 'chicken breast', amountValue: 200, amountUnit: 'g' },
      { name: 'rosemary sprig', amountValue: 2, amountUnit: 'g' }, // unmatched, cheap
    ] }];
    const list = buildGroceryList(meals, priceRows, { weekStart: '2026-08-24', budget: 60, currency: 'USD' });
    assert.equal(list.budgetStatus, BUDGET_STATUS.ESTIMATED_WITH_UNKNOWNS); // truthful, not certified...
    assert.equal(Object.values(list.categories).flat().length, 2); // ...but nothing was dropped or rejected
  });
});

describe('D: a plan with zero unknown pricing behaves exactly as before', () => {
  test('fully dataset-priced, under budget -> certified', () => {
    const meals = [{ ingredients: [
      { name: 'chicken breast', amountValue: 200, amountUnit: 'g' },
      { name: 'garlic', amountValue: 10, amountUnit: 'g' },
    ] }];
    const list = buildGroceryList(meals, priceRows, { weekStart: '2026-08-24', budget: 60, currency: 'USD' });
    assert.equal(list.budgetStatus, BUDGET_STATUS.CERTIFIED);
    assert.equal(list.unknownIngredientCount, 0);
  });
});

describe('E: a known ingredient that legitimately costs exactly $0.50 remains dataset-priced and certifiable', () => {
  test('50g garlic at $0.01/g = $0.50 -> VERIFIED, does not count toward unknownIngredientCount', () => {
    const rows = [{ name: 'garlic', category: 'produce', price_per_unit: 0.01, unit: 'g' }];
    const priced = priceIngredients([{ name: 'garlic', amountValue: 50, amountUnit: 'g' }], rows);
    assert.equal(priced.totalUSD, 0.50);
    assert.equal(priced.unknownIngredientCount, 0);
    assert.equal(classifyBudgetStatus({ withinBudget: true, unknownIngredientCount: priced.unknownIngredientCount }), BUDGET_STATUS.CERTIFIED);
  });
});

describe('F: multiple unknown occurrences preserve their full risk — one merged row still decertifies', () => {
  test('3 occurrences of the same unknown ingredient merge into 1 grocery row, unknownIngredientCount stays 1, still not certified', () => {
    const meals = [{ ingredients: [
      { name: 'venison steak', amountValue: 150, amountUnit: 'g' },
      { name: 'venison steak', amountValue: 150, amountUnit: 'g' },
      { name: 'venison steak', amountValue: 150, amountUnit: 'g' },
    ] }];
    const list = buildGroceryList(meals, priceRows, { weekStart: '2026-08-24', budget: 60, currency: 'USD' });
    assert.equal(list.unknownIngredientCount, 1); // one grocery ROW
    assert.equal(list.categories.other.find(i => i.name === 'venison steak').cost, 1.50); // 3x occurrence-safe, not collapsed
    assert.equal(list.budgetStatus, BUDGET_STATUS.ESTIMATED_WITH_UNKNOWNS);
  });
});

describe('Scenario D: over-budget, fully priced — existing Budget Engine behavior unchanged', () => {
  test('over budget classifies as over_budget even with zero unknowns; evaluateBudget itself is untouched', () => {
    const meals = [{ ingredients: [{ name: 'chicken breast', amountValue: 5545, amountUnit: 'g' }] }]; // $61.00
    const list = buildGroceryList(meals, priceRows, { weekStart: '2026-08-24', budget: 60, currency: 'USD' });
    assert.equal(list.totalCost, 61.00);
    assert.equal(list.budgetStatus, BUDGET_STATUS.OVER_BUDGET);
  });
});

describe('Scenario E: unknown + over-budget — neither gate silently overrides the other', () => {
  test('over budget wins the status even when unknowns are also present (over_budget, not estimated_with_unknowns)', () => {
    const meals = [{ ingredients: [
      { name: 'chicken breast', amountValue: 5545, amountUnit: 'g' }, // $61.00, over a $60 budget
      { name: 'venison steak', amountValue: 200, amountUnit: 'g' },   // also unknown
    ] }];
    const list = buildGroceryList(meals, priceRows, { weekStart: '2026-08-24', budget: 60, currency: 'USD' });
    assert.equal(list.budgetStatus, BUDGET_STATUS.OVER_BUDGET);
    assert.equal(list.unknownIngredientCount, 1); // the unknown-pricing fact is still recorded, just not the deciding status
  });
});

describe('Non-USD currency: not enforced, not falsely certified', () => {
  test('a non-USD grocery list is explicitly not_enforced, never certified or over_budget', () => {
    const meals = [{ ingredients: [{ name: 'chicken breast', amountValue: 200, amountUnit: 'g' }] }];
    const list = buildGroceryList(meals, priceRows, { weekStart: '2026-08-24', budget: 60, currency: 'EUR' });
    assert.equal(list.budgetStatus, BUDGET_STATUS.NOT_ENFORCED);
  });
});
