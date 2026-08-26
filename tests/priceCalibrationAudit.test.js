'use strict';

/**
 * Price Calibration Audit (spinach / greek yogurt / olive oil) — 2026-08-26.
 *
 * Regression coverage for the audit that traced these three EXISTING
 * dataset-priced rows end to end (see ingredientPriceData.js's
 * PRICE_CALIBRATION_AUDIT_METHOD comment for the full evidence trail) and
 * recalibrated ONLY the row supported by both a proven price-row cause AND
 * a multi-observation external retail evidence set (greek yogurt). A first
 * pass proposed 0.0045/g off a single external anchor; a follow-up gate
 * required 3 more named-retailer observations before approval, which pulled
 * the final rate back up to 0.0065/g (much closer to the original than the
 * first pass suggested — see PRICE_CALIBRATION_AUDIT_METHOD). Spinach and
 * olive oil were audited and deliberately left unchanged — mixed/
 * contradicting external evidence, not proof the row is fine, but not proof
 * it's wrong either. Uses the REAL ingredientPriceData.js PRICES throughout,
 * not a hand-rolled fixture, because the claims under test are about the
 * shipped production dataset.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { priceIngredient, PRICE_SOURCE } = require('../pricing.js');
const { buildGroceryList } = require('../groceryAggregation.js');
const { BUDGET_STATUS } = require('../budgetEngine.js');
const { PRICES } = require('../ingredientPriceData.js');

function price(name, amountValue, amountUnit) {
  return priceIngredient({ name, amountValue, amountUnit }, PRICES);
}

describe('A/B/C: the controlled-sample quantities reproduce exactly from the canonical rows', () => {
  test('150g spinach reproduces the observed $1.80 Mealzy cost, row unchanged by this audit', () => {
    const r = price('spinach', 150, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.costUSD, 1.80); // 150 * 0.012, unchanged
  });

  test('200g greek yogurt reproduces the RECALIBRATED $1.30 cost (was $1.35 before this audit)', () => {
    const r = price('greek yogurt', 200, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.costUSD, 1.30); // 200 * 0.0065 (recalibrated from 0.00675 - final gate pass, 4-observation evidence set)
    assert.notEqual(r.costUSD, 1.35, 'must no longer reproduce the pre-audit figure exactly');
  });

  test('45ml olive oil reproduces the observed $0.68 Mealzy cost, row unchanged by this audit', () => {
    const r = price('olive oil', 45, 'ml');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.costUSD, 0.68); // 45 * 0.015 = 0.675 -> rounds to 0.68, unchanged
  });
});

describe('D/E/F: the matcher selects the correct canonical row for all three, no ambiguity', () => {
  test('spinach exact-matches its own row', () => {
    const r = price('spinach', 100, 'g');
    assert.equal(r.canonicalName, 'spinach');
  });

  test('greek yogurt exact-matches its own row, not the unrelated "plain yogurt" row', () => {
    const r = price('greek yogurt', 100, 'g');
    assert.equal(r.canonicalName, 'greek yogurt');
  });

  test('olive oil exact-matches its own row', () => {
    const r = price('olive oil', 100, 'ml');
    assert.equal(r.canonicalName, 'olive oil');
  });
});

describe('G/H: no unsupported-unit fallback and no unknown fallback occurs for any of the three', () => {
  test('all three price VERIFIED at their real generation units (g/g/ml), never fall to the $0.50 estimate', () => {
    for (const [name, unit] of [['spinach', 'g'], ['greek yogurt', 'g'], ['olive oil', 'ml']]) {
      const r = price(name, 50, unit);
      assert.equal(r.source, PRICE_SOURCE.VERIFIED, `${name} should be VERIFIED`);
      assert.notEqual(r.costUSD, 0.50);
    }
  });
});

describe('I: grocery aggregation sums quantity correctly and does not multiply VERIFIED rows incorrectly', () => {
  test('three greek-yogurt occurrences across meals merge into one row with summed quantity, priced once (not 3x)', () => {
    const meals = [
      { ingredients: [{ name: 'greek yogurt', amountValue: 100, amountUnit: 'g' }] },
      { ingredients: [{ name: 'greek yogurt', amountValue: 50, amountUnit: 'g' }] },
      { ingredients: [{ name: 'greek yogurt', amountValue: 50, amountUnit: 'g' }] },
    ];
    const list = buildGroceryList(meals, PRICES, { weekStart: '2026-08-24', budget: 50, currency: 'USD', day: 'Week' });
    const item = list.categories.dairy.find(i => i.name === 'greek yogurt');
    assert.equal(item.amountValue, 200); // 100+50+50, summed once
    assert.equal(item.priceSource, PRICE_SOURCE.VERIFIED);
    assert.equal(item.cost, 1.30); // 200 * 0.0065, priced once on the merged total, NOT 3x a per-occurrence price
  });
});

describe('J: the final calibrated greek-yogurt rate produces cents-safe results', () => {
  test('a range of realistic quantities all round cleanly to the cent', () => {
    const cases = [[50, 0.33], [100, 0.65], [150, 0.98], [200, 1.30], [300, 1.95]];
    for (const [g, expected] of cases) {
      const r = price('greek yogurt', g, 'g');
      assert.equal(r.costUSD, expected, `${g}g should cost $${expected}`);
      assert.equal(Number.isInteger(Math.round(r.costUSD * 100)), true, `${g}g cost must be cent-safe`);
    }
  });
});

describe('K/L: certification semantics are unaffected by this audit', () => {
  test('a fully-VERIFIED list (including the recalibrated greek yogurt) still certifies', () => {
    const meals = [{ ingredients: [
      { name: 'spinach', amountValue: 150, amountUnit: 'g' },
      { name: 'greek yogurt', amountValue: 200, amountUnit: 'g' },
      { name: 'olive oil', amountValue: 45, amountUnit: 'ml' },
    ] }];
    const list = buildGroceryList(meals, PRICES, { weekStart: '2026-08-24', budget: 50, currency: 'USD', day: 'Week' });
    assert.equal(list.budgetStatus, BUDGET_STATUS.CERTIFIED);
    assert.equal(list.unknownIngredientCount, 0);
  });

  test('a single unknown ingredient still blocks certification, unaffected by this audit', () => {
    const meals = [{ ingredients: [
      { name: 'spinach', amountValue: 150, amountUnit: 'g' },
      { name: 'truly unmatched ingredient xyz', amountValue: 100, amountUnit: 'g' },
    ] }];
    const list = buildGroceryList(meals, PRICES, { weekStart: '2026-08-24', budget: 50, currency: 'USD', day: 'Week' });
    assert.notEqual(list.budgetStatus, BUDGET_STATUS.CERTIFIED);
    assert.equal(list.unknownIngredientCount, 1);
  });
});

describe('M/N: unrelated rows this audit must not touch stay exactly as they were', () => {
  test('honey density conversion unchanged', () => {
    const r = price('honey', 15, 'ml');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.costUSD, 0.23);
  });

  test('salt regression unchanged', () => {
    const r = price('salt', 150, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.canonicalName, 'salt');
    assert.equal(r.costUSD, 0.23);
  });

  test('chicken breast, eggs, canned tomatoes untouched by this audit', () => {
    assert.equal(price('chicken breast', 200, 'g').costUSD, 2.20);
    assert.equal(price('eggs', 3, 'count').costUSD, 0.75);
    assert.equal(price('canned tomatoes', 400, 'g').costUSD, 1.16);
  });
});
