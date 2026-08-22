'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeIngredientName, isStructuredIngredient, mealsAreFullyStructured,
  aggregateIngredientOccurrences, aggregateMealIngredients, priceAggregatedRow,
  buildGroceryList, groceryBucketFor, GROCERY_CATEGORY_KEYS,
} = require('../groceryAggregation.js');
const pricing = require('../pricing.js');
const { PRICE_SOURCE } = pricing;

const priceRows = [
  { name: 'chicken breast', category: 'meat',    price_per_unit: 0.011, unit: 'g' },
  { name: 'eggs',           category: 'dairy',   price_per_unit: 0.25,  unit: 'unit' },
];

describe('normalizeIngredientName', () => {
  test('lowercases, trims, and collapses whitespace', () => {
    assert.equal(normalizeIngredientName('  Chicken   Breast '), 'chicken breast');
  });
});

describe('A: same normalized ingredient + same unit aggregates', () => {
  test('two occurrences of the same ingredient/unit combine into one row', () => {
    const rows = aggregateIngredientOccurrences([
      { name: 'chicken breast', amountValue: 100, amountUnit: 'g' },
      { name: 'chicken breast', amountValue: 150, amountUnit: 'g' },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amountValue, 250);
    assert.equal(rows[0].occurrenceCount, 2);
  });
});

describe('B: whitespace/case normalization', () => {
  test('"Chicken Breast" and " chicken   breast " safely merge (Q)', () => {
    const rows = aggregateIngredientOccurrences([
      { name: 'Chicken Breast', amountValue: 100, amountUnit: 'g' },
      { name: ' chicken   breast ', amountValue: 50, amountUnit: 'g' },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amountValue, 150);
  });
});

describe('C/P: different ingredient names do not fuzzy merge', () => {
  test('"chicken" and "chicken breast" remain separate', () => {
    const rows = aggregateIngredientOccurrences([
      { name: 'chicken', amountValue: 100, amountUnit: 'g' },
      { name: 'chicken breast', amountValue: 100, amountUnit: 'g' },
    ]);
    assert.equal(rows.length, 2);
  });

  test('"chicken breast" and "chicken thighs" remain separate', () => {
    const rows = aggregateIngredientOccurrences([
      { name: 'chicken breast', amountValue: 100, amountUnit: 'g' },
      { name: 'chicken thighs', amountValue: 100, amountUnit: 'g' },
    ]);
    assert.equal(rows.length, 2);
  });

  test('unrelated ingredients remain separate rows', () => {
    const rows = aggregateIngredientOccurrences([
      { name: 'chicken breast', amountValue: 100, amountUnit: 'g' },
      { name: 'broccoli', amountValue: 100, amountUnit: 'g' },
      { name: 'eggs', amountValue: 2, amountUnit: 'count' },
    ]);
    assert.equal(rows.length, 3);
  });
});

describe('D: same name + different/incompatible unit does not merge', () => {
  test('grams vs count of the same ingredient stay separate', () => {
    const rows = aggregateIngredientOccurrences([
      { name: 'chicken breast', amountValue: 200, amountUnit: 'g' },
      { name: 'chicken breast', amountValue: 1, amountUnit: 'count' },
    ]);
    assert.equal(rows.length, 2);
  });

  test('no unit-conversion engine exists — g and an unsupported unit like "kg" never merge', () => {
    const rows = aggregateIngredientOccurrences([
      { name: 'chicken breast', amountValue: 200, amountUnit: 'g' },
      { name: 'chicken breast', amountValue: 0.3, amountUnit: 'kg' },
    ]);
    assert.equal(rows.length, 2); // kept separate, not silently converted
  });
});

describe('E/R: unknown ingredient occurrences preserve their full authoritative cost', () => {
  test('R: unknown ingredient repeated twice cannot collapse from $1.00 to $0.50', () => {
    const rows = aggregateIngredientOccurrences([
      { name: 'dragonfruit', amountValue: 100, amountUnit: 'g' },
      { name: 'dragonfruit', amountValue: 100, amountUnit: 'g' },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].occurrenceCount, 2);

    const priced = priceAggregatedRow(rows[0], priceRows);
    assert.equal(priced.source, PRICE_SOURCE.UNKNOWN_INGREDIENT);
    assert.equal(priced.costUSD, 1.00); // 2 x $0.50, NOT a flat $0.50
  });

  test('three unknown occurrences price at 3x the flat estimate, not once', () => {
    const rows = aggregateIngredientOccurrences([
      { name: 'dragonfruit', amountValue: 100, amountUnit: 'g' },
      { name: 'dragonfruit', amountValue: 100, amountUnit: 'g' },
      { name: 'dragonfruit', amountValue: 100, amountUnit: 'g' },
    ]);
    const priced = priceAggregatedRow(rows[0], priceRows);
    assert.equal(priced.costUSD, 1.50);
  });

  test('VERIFIED ingredients price linearly — merging vs summing per-occurrence gives an identical total', () => {
    const occurrences = [
      { name: 'chicken breast', amountValue: 200, amountUnit: 'g' },
      { name: 'chicken breast', amountValue: 300, amountUnit: 'g' },
    ];
    const [row] = aggregateIngredientOccurrences(occurrences);
    const priced = priceAggregatedRow(row, priceRows);
    assert.equal(priced.source, PRICE_SOURCE.VERIFIED);
    assert.equal(priced.costUSD, (200 + 300) * 0.011);
  });

  test('unsupported-unit occurrences (matched ingredient, bad unit) also preserve full cost across occurrences', () => {
    const rows = aggregateIngredientOccurrences([
      { name: 'chicken breast', amountValue: 1, amountUnit: 'cup' },
      { name: 'chicken breast', amountValue: 1, amountUnit: 'cup' },
    ]);
    const priced = priceAggregatedRow(rows[0], priceRows);
    assert.equal(priced.source, PRICE_SOURCE.UNSUPPORTED_UNIT);
    assert.equal(priced.costUSD, 1.00); // 2 x $0.50
    assert.equal(priced.category, 'meat'); // matched a price row, just not this unit — category still known
  });
});

describe('F: missing/invalid quantity does not crash or silently become quantity 1', () => {
  test('a missing amountValue aggregates to 0, never defaulted to 1', () => {
    const rows = aggregateIngredientOccurrences([{ name: 'salt', amountUnit: 'g' }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amountValue, 0);
  });

  test('a zero or negative amountValue is ignored rather than corrupting the sum', () => {
    const rows = aggregateIngredientOccurrences([
      { name: 'salt', amountValue: 0, amountUnit: 'g' },
      { name: 'salt', amountValue: -5, amountUnit: 'g' },
      { name: 'salt', amountValue: 10, amountUnit: 'g' },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amountValue, 10);
    assert.equal(rows[0].occurrenceCount, 3);
  });

  test('an ingredient with no name is skipped entirely, not crashing', () => {
    const rows = aggregateIngredientOccurrences([{ amountValue: 100, amountUnit: 'g' }, { name: '', amountValue: 5, amountUnit: 'g' }]);
    assert.equal(rows.length, 0);
  });

  test('empty/undefined input aggregates to an empty array', () => {
    assert.deepEqual(aggregateIngredientOccurrences([]), []);
    assert.deepEqual(aggregateIngredientOccurrences(undefined), []);
  });
});

describe('G: repeated ingredient across multiple "days" (meals array) aggregates deterministically', () => {
  test('200g Monday + 300g Wednesday-style occurrences combine to 500g via aggregateMealIngredients', () => {
    const meals = [
      { ingredients: [{ name: 'chicken breast', amountValue: 200, amountUnit: 'g' }] },
      { ingredients: [{ name: 'broccoli', amountValue: 150, amountUnit: 'g' }] },
      { ingredients: [{ name: 'chicken breast', amountValue: 300, amountUnit: 'g' }] },
    ];
    const rows = aggregateMealIngredients(meals);
    const chicken = rows.find(r => r.name === 'chicken breast');
    assert.equal(chicken.amountValue, 500);
    assert.equal(chicken.occurrenceCount, 2);
  });

  test('is deterministic — same input always produces the same output', () => {
    const meals = [{ ingredients: [
      { name: 'eggs', amountValue: 2, amountUnit: 'count' },
      { name: 'eggs', amountValue: 3, amountUnit: 'count' },
    ] }];
    const a = aggregateMealIngredients(meals);
    const b = aggregateMealIngredients(meals);
    assert.deepEqual(a, b);
  });
});

describe('isStructuredIngredient / mealsAreFullyStructured — the deterministic-vs-legacy gate', () => {
  test('an ingredient with amountUnit present is structured', () => {
    assert.equal(isStructuredIngredient({ name: 'x', amountValue: 1, amountUnit: 'g' }), true);
  });
  test('an ingredient with no amountUnit field at all is not structured (legacy shape)', () => {
    assert.equal(isStructuredIngredient({ name: 'x', amount: '200g' }), false);
  });
  test('an ingredient with an unsupported unit is still "structured" (pricing.js prices it conservatively, not the aggregation gate\'s job)', () => {
    assert.equal(isStructuredIngredient({ name: 'x', amountValue: 1, amountUnit: 'cup' }), true);
  });

  test('a meal plan where every ingredient is structured passes the gate', () => {
    const meals = [{ ingredients: [{ name: 'a', amountValue: 1, amountUnit: 'g' }] }, { ingredients: [{ name: 'b', amountValue: 2, amountUnit: 'ml' }] }];
    assert.equal(mealsAreFullyStructured(meals), true);
  });
  test('a single legacy-format ingredient anywhere sends the WHOLE request to the fallback', () => {
    const meals = [
      { ingredients: [{ name: 'a', amountValue: 1, amountUnit: 'g' }] },
      { ingredients: [{ name: 'b', amount: '1 cup' }] }, // no amountUnit
    ];
    assert.equal(mealsAreFullyStructured(meals), false);
  });
  test('meals with no ingredients at all fail the gate (nothing to aggregate)', () => {
    assert.equal(mealsAreFullyStructured([{ name: 'Toast', type: 'breakfast' }]), false);
    assert.equal(mealsAreFullyStructured([]), false);
  });
});

describe('buildGroceryList — full deterministic pipeline (H/I/J/M/N/O)', () => {
  // A realistic day: 4 meals, some shared ingredients, one unpriceable one.
  const dayMeals = [
    { name: 'Chicken Bowl', type: 'lunch', ingredients: [
      { name: 'chicken breast', amountValue: 200, amountUnit: 'g' },
      { name: 'dragonfruit garnish', amountValue: 50, amountUnit: 'g' },
    ] },
    { name: 'Chicken Stir Fry', type: 'dinner', ingredients: [
      { name: 'chicken breast', amountValue: 300, amountUnit: 'g' },
      { name: 'eggs', amountValue: 2, amountUnit: 'count' },
    ] },
  ];

  test('H: no deterministic grocery item exists unless it came from meal.ingredients', () => {
    const list = buildGroceryList(dayMeals, priceRows, { weekStart: '2026-08-24', budget: 50, currency: 'USD', day: 'Monday' });
    const allItemNames = Object.values(list.categories).flat().map(i => i.name);
    const sourceNames = new Set(dayMeals.flatMap(m => m.ingredients.map(i => normalizeIngredientName(i.name))));
    for (const name of allItemNames) assert.ok(sourceNames.has(name), `unexpected invented item: ${name}`);
  });

  test('I: no valid supported meal ingredient disappears from the grocery list', () => {
    const list = buildGroceryList(dayMeals, priceRows, { weekStart: '2026-08-24', budget: 50, currency: 'USD', day: 'Monday' });
    const allItemNames = Object.values(list.categories).flat().map(i => i.name);
    const sourceNames = new Set(dayMeals.flatMap(m => m.ingredients.map(i => normalizeIngredientName(i.name))));
    for (const name of sourceNames) assert.ok(allItemNames.includes(name), `missing expected item: ${name}`);
  });

  test('J: grocery authoritative total equals the meal-ingredient authoritative total within cents (no aggregation-across-occurrences in this fixture, so exact)', () => {
    // Independently sum every meal-ingredient occurrence's own priced cost
    // (the "authoritative meal cost" side of the invariant) without going
    // through aggregation at all.
    let itemizedTotal = 0;
    for (const meal of dayMeals) {
      for (const ing of meal.ingredients) {
        itemizedTotal += pricing.priceIngredient(ing, priceRows).costUSD;
      }
    }
    const list = buildGroceryList(dayMeals, priceRows, { weekStart: '2026-08-24', budget: 50, currency: 'USD', day: 'Monday' });
    assert.equal(Math.round(itemizedTotal * 100), Math.round(list.totalCost * 100));
  });

  test('J (bounded case): merging 3 occurrences that individually round differently than their sum stays within 1 cent', () => {
    // 33g occurrences at $0.011/g each round to $0.36 (0.363 -> 0.36) x 3 =
    // $1.08 itemized, but 99g merged rounds to $1.09 - a real, expected,
    // ~1-cent drift from rounding at two different aggregation points (see
    // priceAggregatedRow's doc comment). The invariant is "within cents",
    // not bit-exact, and this proves the drift is small and one-directional
    // (never makes the grocery list look cheaper than the real meal cost).
    const meals = [{ ingredients: [
      { name: 'chicken breast', amountValue: 33, amountUnit: 'g' },
      { name: 'chicken breast', amountValue: 33, amountUnit: 'g' },
      { name: 'chicken breast', amountValue: 33, amountUnit: 'g' },
    ] }];
    let itemizedCents = 0;
    for (const ing of meals[0].ingredients) itemizedCents += Math.round(pricing.priceIngredient(ing, priceRows).costUSD * 100);
    const list = buildGroceryList(meals, priceRows, { day: 'Monday' });
    const groceryCents = Math.round(list.totalCost * 100);
    assert.equal(itemizedCents, 108);
    assert.equal(groceryCents, 109);
    assert.ok(Math.abs(groceryCents - itemizedCents) <= 1, 'drift must stay within ~1 cent for this fixture');
    // Not a proven universal law (rounding-of-a-sum vs sum-of-roundings can
    // drift either direction for pathological inputs) - just documenting
    // that for this realistic case, and in the real-model smoke test this
    // was derived from, the drift observed never understated the grocery
    // total relative to the authoritative meal cost.
  });

  test('categorizes a matched ingredient via its DB category, and an unknown ingredient into "other"', () => {
    const list = buildGroceryList(dayMeals, priceRows, { day: 'Monday' });
    assert.ok(list.categories.protein.some(i => i.name === 'chicken breast')); // meat -> protein
    assert.ok(list.categories.dairy.some(i => i.name === 'eggs'));
    assert.ok(list.categories.other.some(i => i.name === 'dragonfruit garnish'));
  });

  test('every grocery-category key from the existing schema is present, even when empty', () => {
    const list = buildGroceryList(dayMeals, priceRows, { day: 'Monday' });
    for (const key of GROCERY_CATEGORY_KEYS) assert.ok(Array.isArray(list.categories[key]));
  });

  test('preserves the existing output shape and per-item fields the frontend depends on', () => {
    const list = buildGroceryList(dayMeals, priceRows, { weekStart: '2026-08-24', budget: 50, currency: 'USD', day: 'Monday' });
    assert.ok('totalCost' in list && 'budgetAmount' in list && 'currency' in list && 'categories' in list);
    const anyItem = Object.values(list.categories).flat()[0];
    for (const field of ['id', 'name', 'amount', 'amountValue', 'amountUnit', 'cost', 'estimatedCost', 'actualCost', 'priceSource', 'checked', 'day']) {
      assert.ok(field in anyItem, `missing expected item field: ${field}`);
    }
    assert.equal(anyItem.checked, false);
    assert.equal(anyItem.actualCost, null);
  });

  test('M: single-day generation works (a lone meal with ingredients)', () => {
    const list = buildGroceryList([dayMeals[0]], priceRows, { day: 'Monday' });
    assert.ok(Object.values(list.categories).flat().length > 0);
  });

  test('N: weekly generation works (aggregating across several days\' meals in one call)', () => {
    const weekMeals = [
      { ingredients: [{ name: 'chicken breast', amountValue: 200, amountUnit: 'g' }] }, // "Monday"
      { ingredients: [{ name: 'chicken breast', amountValue: 300, amountUnit: 'g' }] }, // "Wednesday"
    ];
    const list = buildGroceryList(weekMeals, priceRows);
    const chicken = list.categories.protein.find(i => i.name === 'chicken breast');
    assert.equal(chicken.amountValue, 500);
    assert.equal(chicken.cost, 500 * 0.011);
  });

  test('day tag defaults to "Unspecified" when no day is supplied, matching existing splitGroceryListByDay fallback semantics', () => {
    const list = buildGroceryList(dayMeals, priceRows, {});
    const anyItem = Object.values(list.categories).flat()[0];
    assert.equal(anyItem.day, 'Unspecified');
  });

  test('an empty meals array produces a valid, empty grocery list rather than crashing', () => {
    const list = buildGroceryList([], priceRows, { day: 'Monday' });
    assert.equal(Object.values(list.categories).flat().length, 0);
    assert.equal(list.totalCost, 0);
  });
});

describe('O: the deterministic path requires zero Anthropic calls', () => {
  test('buildGroceryList never references an AI client — verified by construction: it takes only (meals, priceRows, options) and is synchronous/pure aside from array iteration', () => {
    // groceryAggregation.js requires only pricing.js (its comments mention
    // "Anthropic" by name to explain WHY it exists, which is fine) - what
    // actually matters is that it never requires the SDK or calls the API.
    const path = require('path');
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'groceryAggregation.js'), 'utf8');
    assert.doesNotMatch(src, /require\(['"]@anthropic-ai\/sdk['"]\)|messages\.create\(|callAnthropicWithSpendCap/);
  });
});
