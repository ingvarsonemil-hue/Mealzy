'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { getProduceShoppingDisplay, formatCountDisplay, SHOPPING_UNIT_REGISTRY } = require('../shoppingDisplayUnits.js');
const { buildGroceryList, formatShoppingAmount } = require('../groceryAggregation.js');

// Price rows mirror ingredientPriceData.js's real canonical names for the
// ingredients this PR targets (garlic, onion, lemon, lemon juice, lime,
// eggs) plus one control ingredient (chicken breast) to prove unrelated
// rows are untouched by the shopping-display layer.
const priceRows = [
  { name: 'chicken breast', category: 'meat',    price_per_unit: 0.011,  unit: 'g' },
  { name: 'garlic',         category: 'produce', price_per_unit: 0.011,  unit: 'g' },
  { name: 'onion',          category: 'produce', price_per_unit: 0.0025, unit: 'g' },
  { name: 'lemon',          category: 'produce', price_per_unit: 0.006,  unit: 'g' },
  { name: 'lemon juice',    category: 'pantry',  price_per_unit: 0.0068, unit: 'ml' },
  { name: 'lime',           category: 'produce', price_per_unit: 0.006,  unit: 'g' },
  { name: 'eggs',           category: 'dairy',   price_per_unit: 0.25,   unit: 'unit' },
];

describe('C: garlic displays cloves', () => {
  test('20g garlic (~4 cloves) displays as whole cloves, not grams', () => {
    const display = getProduceShoppingDisplay('garlic', 20, 'g');
    assert.equal(display, '4 cloves garlic');
  });
  test('a single clove-equivalent uses singular label', () => {
    assert.equal(getProduceShoppingDisplay('garlic', 5, 'g'), '1 clove garlic');
  });
});

describe('D: onion displays sensible fraction/count, never raw decimals', () => {
  test('30g rounds to a clean quarter, never "0.27 onions"', () => {
    const display = getProduceShoppingDisplay('onion', 30, 'g');
    assert.match(display, /^1\/4 onion$/);
  });
  test('110g (one average onion) displays as a whole onion', () => {
    assert.equal(getProduceShoppingDisplay('onion', 110, 'g'), '1 onion');
  });
  test('250g displays as a plural whole+fraction, not a decimal', () => {
    const display = getProduceShoppingDisplay('onion', 250, 'g');
    assert.doesNotMatch(display, /\d+\.\d+/);
  });
});

describe('E/G: whole lemon/lime -> count display', () => {
  test('whole lemon in grams converts to a fruit count', () => {
    assert.equal(getProduceShoppingDisplay('lemon', 58, 'g'), '1 lemon');
  });
  test('whole lime in grams converts to a fruit count', () => {
    assert.equal(getProduceShoppingDisplay('lime', 67, 'g'), '1 lime');
  });
});

describe('F: lemon juice / lime juice are NEVER canonicalized to whole-fruit count', () => {
  test('"lemon juice" canonical name is not in the produce registry', () => {
    assert.equal(SHOPPING_UNIT_REGISTRY['lemon juice'], undefined);
  });
  test('lemon juice (ml) never gets a whole-fruit display, even at a value matching a whole lemon', () => {
    assert.equal(getProduceShoppingDisplay('lemon juice', 58, 'ml'), null);
  });
  test('a whole "lemon" row given in ml (unit mismatch) is never silently treated as a fruit count', () => {
    // amountUnit 'ml' is explicitly excluded — g is the only accepted input
    // unit for the whole-fruit conversion (see shoppingDisplayUnits.js).
    assert.equal(getProduceShoppingDisplay('lemon', 58, 'ml'), null);
  });
});

describe('A/B: eggs display as a named count, not a bare number', () => {
  test('single egg (generated name is plural "eggs", singularized for count===1)', () => {
    assert.equal(formatCountDisplay('eggs', 1), '1 egg');
  });
  test('3 eggs displays "3 eggs"', () => {
    assert.equal(formatCountDisplay('eggs', 3), '3 eggs');
  });
});

describe('J/K: shopping display never mutates pricing quantity or cost', () => {
  test('buildGroceryList prices onion by grams while displaying it as a fraction of a whole onion', () => {
    const meals = [{ ingredients: [{ name: 'onion', amountValue: 55, amountUnit: 'g' }] }];
    const list = buildGroceryList(meals, priceRows, { weekStart: '2026-08-24', budget: 50, currency: 'USD' });
    const item = list.categories.produce.find(i => i.name === 'onion');
    assert.equal(item.amountValue, 55); // original recipe/pricing quantity preserved
    assert.equal(item.amountUnit, 'g');
    assert.equal(item.cost, 0.14); // 55 * 0.0025, rounded — unaffected by display conversion
    assert.equal(item.amount, '1/2 onion'); // shopper-facing display only
  });

  test('unregistered ingredient (chicken breast) keeps the raw g display untouched', () => {
    const meals = [{ ingredients: [{ name: 'chicken breast', amountValue: 200, amountUnit: 'g' }] }];
    const list = buildGroceryList(meals, priceRows, { weekStart: '2026-08-24', budget: 50, currency: 'USD' });
    const item = list.categories.protein.find(i => i.name === 'chicken breast');
    assert.equal(item.amount, '200g');
  });
});

describe('formatShoppingAmount fallback', () => {
  test('falls back to raw ml display when no produce/count conversion applies', () => {
    assert.equal(
      formatShoppingAmount({ name: 'olive oil', amountValue: 30, amountUnit: 'ml', canonicalName: 'olive oil' }),
      '30ml'
    );
  });
});
