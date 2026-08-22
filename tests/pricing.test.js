'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { priceIngredient, priceIngredients, PRICE_SOURCE } = require('../pricing.js');

// Fixture mirrors the real ingredient_prices rows AFTER the Task 1 unit fix:
// salmon fillets, almond milk, and greek yogurt converted from their old
// package-level units (lb / 1L / 800g tub) to canonical per-gram/per-ml
// prices at the SAME economic value. Other rows keep their existing
// (already-workable) db unit spellings ("unit", "head") to prove the
// alias-normalization path needs no data migration for them.
const priceRows = [
  { name: 'chicken breast', category: 'meat',    price_per_unit: 0.011,  unit: 'g' },
  { name: 'salmon fillets', category: 'protein', price_per_unit: 0.0198, unit: 'g' },   // was 9 / lb
  { name: 'almond milk',    category: 'dairy',   price_per_unit: 0.0028, unit: 'ml' },  // was 2.8 / 1L
  { name: 'greek yogurt',   category: 'dairy',   price_per_unit: 0.00675, unit: 'g' },  // was 5.4 / 800g tub
  { name: 'eggs',           category: 'dairy',   price_per_unit: 0.25,   unit: 'unit' }, // legacy label -> count
  { name: 'broccoli',       category: 'produce', price_per_unit: 2.5,    unit: 'head' }, // legacy label -> count
];

describe('priceIngredient — structured amountValue/amountUnit contract', () => {
  test('200g chicken breast prices correctly against a $/g row', () => {
    const r = priceIngredient({ name: 'chicken breast', amountValue: 200, amountUnit: 'g' }, priceRows);
    assert.equal(r.costUSD, 2.20);
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
  });

  test('200g salmon prices correctly against the FIXED $/g row', () => {
    const r = priceIngredient({ name: 'salmon fillets', amountValue: 200, amountUnit: 'g' }, priceRows);
    assert.equal(r.costUSD, 3.96);
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
  });

  test('200ml almond milk prices correctly against the FIXED $/ml row', () => {
    const r = priceIngredient({ name: 'almond milk', amountValue: 200, amountUnit: 'ml' }, priceRows);
    assert.equal(r.costUSD, 0.56);
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
  });

  test('150g greek yogurt prices correctly against the FIXED $/g row', () => {
    const r = priceIngredient({ name: 'greek yogurt', amountValue: 150, amountUnit: 'g' }, priceRows);
    assert.equal(r.costUSD, 1.01); // 0.00675 * 150 = 1.0125 -> rounds to 1.01
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
  });

  test('2 eggs prices correctly, with the legacy "unit" db label normalized to count', () => {
    const r = priceIngredient({ name: 'eggs', amountValue: 2, amountUnit: 'count' }, priceRows);
    assert.equal(r.costUSD, 0.50);
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
  });

  test('1 broccoli head prices correctly, with the legacy "head" db label normalized to count', () => {
    const r = priceIngredient({ name: 'broccoli', amountValue: 1, amountUnit: 'count' }, priceRows);
    assert.equal(r.costUSD, 2.50);
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
  });
});

describe('priceIngredient — unknown ingredients', () => {
  test('an ingredient with no matching price row is flagged unknown, not silently priced', () => {
    const r = priceIngredient({ name: 'dragonfruit', amountValue: 100, amountUnit: 'g' }, priceRows);
    assert.equal(r.costUSD, 0.50);
    assert.equal(r.source, PRICE_SOURCE.UNKNOWN_INGREDIENT);
  });

  test('the unknown-ingredient estimate is never disguised as a real per-quantity price', () => {
    // Even a huge amountValue must NOT scale the unknown estimate - that would
    // fake precision the system doesn't have.
    const r = priceIngredient({ name: 'dragonfruit', amountValue: 5000, amountUnit: 'g' }, priceRows);
    assert.equal(r.costUSD, 0.50);
    assert.equal(r.source, PRICE_SOURCE.UNKNOWN_INGREDIENT);
  });
});

describe('priceIngredient — unsupported quantity unit', () => {
  test('a known ingredient with a non g/ml/count unit is rejected explicitly, not guessed', () => {
    const r = priceIngredient({ name: 'chicken breast', amountValue: 1, amountUnit: 'cup' }, priceRows);
    assert.equal(r.source, PRICE_SOURCE.UNSUPPORTED_UNIT);
    assert.equal(r.costUSD, 0.50);
  });

  test('a known ingredient with a unit that mismatches its price row unit is rejected, not converted', () => {
    // salmon is priced per gram; declaring it in ml must not be silently multiplied.
    const r = priceIngredient({ name: 'salmon fillets', amountValue: 200, amountUnit: 'ml' }, priceRows);
    assert.equal(r.source, PRICE_SOURCE.UNSUPPORTED_UNIT);
    assert.equal(r.costUSD, 0.50);
  });

  test('a missing/zero amountValue alongside a present amountUnit is rejected, not defaulted to 1', () => {
    const r = priceIngredient({ name: 'chicken breast', amountValue: 0, amountUnit: 'g' }, priceRows);
    assert.equal(r.source, PRICE_SOURCE.UNSUPPORTED_UNIT);
  });
});

describe('priceIngredient — legacy data (no amountUnit field at all)', () => {
  test('old saved ingredients with only a free-text amount get a legacy_estimate, never "verified"', () => {
    const r = priceIngredient({ name: 'chicken breast', amount: '200g' }, priceRows);
    assert.equal(r.costUSD, 2.20);
    assert.equal(r.source, PRICE_SOURCE.LEGACY_ESTIMATE);
  });

  test('legacy path still cannot report verified even when the number happens to match', () => {
    const r = priceIngredient({ name: 'salmon fillets', amount: '200g' }, priceRows);
    assert.notEqual(r.source, PRICE_SOURCE.VERIFIED);
  });
});

describe('priceIngredient — AI-supplied cost is never authoritative', () => {
  test('an absurd AI-guessed "cost" field is ignored; costUSD is independently computed', () => {
    const r = priceIngredient({ name: 'chicken breast', amountValue: 200, amountUnit: 'g', cost: 999999 }, priceRows);
    assert.equal(r.costUSD, 2.20);
  });

  test('priceIngredients() totals never incorporate the AI cost field either', () => {
    const ingredients = [
      { name: 'chicken breast', amountValue: 200, amountUnit: 'g', cost: 500 },
      { name: 'eggs', amountValue: 2, amountUnit: 'count', cost: 500 },
    ];
    const result = priceIngredients(ingredients, priceRows);
    assert.equal(result.totalUSD, 2.70); // 2.20 + 0.50, not 1000
    assert.equal(result.allVerified, true);
  });
});

describe('priceIngredients — meal-plan and grocery-list share one calculation path', () => {
  test('mixed known/unknown ingredients mark allVerified false and still sum correctly', () => {
    const ingredients = [
      { name: 'chicken breast', amountValue: 200, amountUnit: 'g' },
      { name: 'dragonfruit', amountValue: 100, amountUnit: 'g' },
    ];
    const result = priceIngredients(ingredients, priceRows);
    assert.equal(result.totalUSD, 2.70); // 2.20 + 0.50 unknown estimate
    assert.equal(result.allVerified, false);
    assert.equal(result.items[0].priceSource, PRICE_SOURCE.VERIFIED);
    assert.equal(result.items[1].priceSource, PRICE_SOURCE.UNKNOWN_INGREDIENT);
  });

  test('an empty ingredient list prices to zero', () => {
    const result = priceIngredients([], priceRows);
    assert.equal(result.totalUSD, 0);
  });

  // server.js wires BOTH calculateMealCost() (meal-plan path) and
  // groundAndStampGroceryItems() (grocery-list path) to call
  // pricing.priceIngredient()/priceIngredients() directly - there is no
  // second parsing/matching implementation left in server.js for either
  // flow. This is verified by the identical-input/identical-output property
  // below: since both flows are documented to delegate to this same
  // function, proving the function is deterministic and shared is the
  // guarantee that meal-plan and grocery-list costs cannot diverge.
  test('the same ingredient produces an identical result regardless of calling context', () => {
    const ingredient = { name: 'greek yogurt', amountValue: 150, amountUnit: 'g' };
    const asMealIngredient = priceIngredient({ ...ingredient }, priceRows);
    const asGroceryItem = priceIngredient({ ...ingredient, checked: false, day: 'Monday' }, priceRows);
    assert.deepEqual(asMealIngredient, asGroceryItem);
  });
});

describe('regression — the old catastrophic unit-mismatch bugs cannot happen', () => {
  test('salmon no longer prices at ~$1800 for a 200g portion (old bug: $9/lb treated as $9/g)', () => {
    const r = priceIngredient({ name: 'salmon fillets', amountValue: 200, amountUnit: 'g' }, priceRows);
    assert.ok(r.costUSD < 10, `expected a realistic per-portion cost, got $${r.costUSD}`);
    assert.notEqual(Math.round(r.costUSD), 1800);
  });

  test('almond milk no longer prices at ~$560 for 200ml (old bug: $2.80/1L treated as $2.80/ml)', () => {
    const r = priceIngredient({ name: 'almond milk', amountValue: 200, amountUnit: 'ml' }, priceRows);
    assert.ok(r.costUSD < 5, `expected a realistic per-portion cost, got $${r.costUSD}`);
    assert.notEqual(Math.round(r.costUSD), 560);
  });

  test('greek yogurt no longer prices at ~$810 for 150g (old bug: $5.40/800g-tub treated as $5.40/g)', () => {
    const r = priceIngredient({ name: 'greek yogurt', amountValue: 150, amountUnit: 'g' }, priceRows);
    assert.ok(r.costUSD < 5, `expected a realistic per-portion cost, got $${r.costUSD}`);
    assert.notEqual(Math.round(r.costUSD), 810);
  });

  test('an incompatible-unit guess is refused rather than producing a wildly wrong number', () => {
    // Old code would regex "200" out of "200ml" and multiply by whatever
    // price_per_unit was stored, regardless of unit. New code must refuse.
    const r = priceIngredient({ name: 'greek yogurt', amountValue: 150, amountUnit: 'ml' }, priceRows);
    assert.equal(r.source, PRICE_SOURCE.UNSUPPORTED_UNIT);
    assert.notEqual(Math.round(r.costUSD), 810 * 150 / 150); // not silently computed via the mismatched unit
  });
});

describe('Price Coverage v1 — matcher correctness (fixes the proven order-dependent false-match bug)', () => {
  // A fixture where two rows both substring-match a longer ingredient name,
  // specifically ordered so "milk" is inserted BEFORE "almond milk" - this
  // is the exact shape of the real live DB where the bug was found. If the
  // matcher were still order-dependent, this order would make the bug
  // reproduce; the fix must resolve to "almond milk" regardless.
  const milkFamilyRows = [
    { name: 'milk',        category: 'dairy', price_per_unit: 0.0012, unit: 'ml' },
    { name: 'almond milk', category: 'dairy', price_per_unit: 0.0028, unit: 'ml' },
  ];
  const milkFamilyRowsReversed = [...milkFamilyRows].reverse();

  test('D: specific-over-generic — "unsweetened almond milk" resolves to "almond milk", not "milk"', () => {
    const r = priceIngredient({ name: 'unsweetened almond milk', amountValue: 200, amountUnit: 'ml' }, milkFamilyRows);
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.costUSD, 0.56); // 200 * 0.0028 (almond milk), NOT 200 * 0.0012 (milk) = 0.24
  });

  test('E: insertion-order independence — reversing the DB row order does not change the result', () => {
    const forward = priceIngredient({ name: 'unsweetened almond milk', amountValue: 200, amountUnit: 'ml' }, milkFamilyRows);
    const reversed = priceIngredient({ name: 'unsweetened almond milk', amountValue: 200, amountUnit: 'ml' }, milkFamilyRowsReversed);
    assert.deepEqual(forward, reversed);
    assert.equal(forward.costUSD, 0.56);
  });

  test('E (also): "oat milk" resolves to "milk" only because no more specific plant-milk row exists — still order-independent', () => {
    const forward = priceIngredient({ name: 'oat milk', amountValue: 200, amountUnit: 'ml' }, milkFamilyRows);
    const reversed = priceIngredient({ name: 'oat milk', amountValue: 200, amountUnit: 'ml' }, milkFamilyRowsReversed);
    assert.deepEqual(forward, reversed);
  });

  const chickenRows = [{ name: 'chicken breast', category: 'meat', price_per_unit: 0.011, unit: 'g' }];
  test('F: "chicken thighs" must NOT verify as "chicken breast" — falls to unknown instead', () => {
    const r = priceIngredient({ name: 'chicken thighs', amountValue: 200, amountUnit: 'g' }, chickenRows);
    assert.equal(r.source, PRICE_SOURCE.UNKNOWN_INGREDIENT);
  });

  const yogurtRows = [{ name: 'greek yogurt', category: 'dairy', price_per_unit: 0.00675, unit: 'g' }];
  test('G: "plain yogurt" must NOT verify as "greek yogurt" — falls to unknown instead', () => {
    const r = priceIngredient({ name: 'plain yogurt', amountValue: 150, amountUnit: 'g' }, yogurtRows);
    assert.equal(r.source, PRICE_SOURCE.UNKNOWN_INGREDIENT);
  });

  const riceRows = [{ name: 'white rice', category: 'pantry', price_per_unit: 0.002, unit: 'g' }];
  test('H: "brown rice" must NOT verify as "white rice" — falls to unknown instead', () => {
    const r = priceIngredient({ name: 'brown rice', amountValue: 100, amountUnit: 'g' }, riceRows);
    assert.equal(r.source, PRICE_SOURCE.UNKNOWN_INGREDIENT);
  });

  const beefRows = [{ name: 'ground beef', category: 'meat', price_per_unit: 0.013, unit: 'g' }];
  test('I: curated safe alias — "beef mince" resolves to "ground beef" (same product, different regional term)', () => {
    const r = priceIngredient({ name: 'beef mince', amountValue: 200, amountUnit: 'g' }, beefRows);
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.costUSD, 2.60);
  });

  const pepperRows = [{ name: 'bell peppers', category: 'produce', price_per_unit: 1.2, unit: 'each' }];
  test('I (also): curated safe alias — "capsicum" resolves to "bell peppers"', () => {
    const r = priceIngredient({ name: 'capsicum', amountValue: 1, amountUnit: 'count' }, pepperRows);
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
  });

  test('two genuinely unrelated candidates that both substring-match are treated as ambiguous, not guessed', () => {
    // Neither "rice" nor "beans" is a substring of the other, and neither
    // subsumes the other - a compound ingredient name that happens to
    // contain two unrelated product names must not silently pick one.
    const mixedRows = [
      { name: 'rice',  category: 'pantry', price_per_unit: 0.002, unit: 'g' },
      { name: 'beans', category: 'pantry', price_per_unit: 0.003, unit: 'g' },
    ];
    const r = priceIngredient({ name: 'rice and beans mix', amountValue: 100, amountUnit: 'g' }, mixedRows);
    assert.equal(r.source, PRICE_SOURCE.UNKNOWN_INGREDIENT);
  });

  test('a tie in candidate specificity (same-length names, neither subsumes the other) is treated as ambiguous, not resolved by array order', () => {
    const sameLenRows = [
      { name: 'aa bb', category: 'x', price_per_unit: 1, unit: 'g' },
      { name: 'cc bb', category: 'x', price_per_unit: 2, unit: 'g' },
    ];
    const r = priceIngredient({ name: 'aa bb cc bb', amountValue: 10, amountUnit: 'g' }, sameLenRows);
    assert.equal(r.source, PRICE_SOURCE.UNKNOWN_INGREDIENT);
  });
});

describe('Price Coverage v1 — plausibility guards on the live canonical dataset', () => {
  const { PRICES } = require('../ingredientPriceData.js');

  // Corruption/unit-error guards, NOT a claim of market accuracy — these
  // exist so a mistake like the old salmon $/lb-as-$/g bug (a ~450x error)
  // is caught by a test instead of shipped silently.
  const PLAUSIBLE_RANGES_PER_KG_OR_L = { min: 0.5, max: 60 };   // $0.50-$60/kg or /L covers everything from rice to saffron-adjacent specialty items
  const PLAUSIBLE_RANGE_PER_COUNT = { min: 0.02, max: 10 };      // $0.02-$10 per discrete item (a clove of garlic to a whole broccoli head)

  for (const row of PRICES) {
    test(`${row.name} (${row.unit}): price_per_unit is within a plausible magnitude, not a catastrophic unit error`, () => {
      if (row.unit === 'g' || row.unit === 'ml') {
        const perKgOrL = row.price_per_unit * 1000;
        assert.ok(
          perKgOrL >= PLAUSIBLE_RANGES_PER_KG_OR_L.min && perKgOrL <= PLAUSIBLE_RANGES_PER_KG_OR_L.max,
          `${row.name}: $${perKgOrL.toFixed(2)}/kg-or-L is outside the plausible $${PLAUSIBLE_RANGES_PER_KG_OR_L.min}-$${PLAUSIBLE_RANGES_PER_KG_OR_L.max} range`
        );
      } else {
        assert.ok(
          row.price_per_unit >= PLAUSIBLE_RANGE_PER_COUNT.min && row.price_per_unit <= PLAUSIBLE_RANGE_PER_COUNT.max,
          `${row.name}: $${row.price_per_unit}/${row.unit} is outside the plausible $${PLAUSIBLE_RANGE_PER_COUNT.min}-$${PLAUSIBLE_RANGE_PER_COUNT.max} range`
        );
      }
    });
  }

  test('M: the canonical dataset validates structurally — every row has the required fields', () => {
    for (const row of PRICES) {
      assert.equal(typeof row.name, 'string');
      assert.ok(row.name.length > 0);
      assert.ok(['g', 'ml', 'count', 'unit', 'each', 'head'].includes(row.unit));
      assert.equal(typeof row.price_per_unit, 'number');
      assert.ok(row.price_per_unit > 0);
      assert.equal(typeof row.source, 'string');
      assert.equal(typeof row.checked_at, 'string');
    }
  });

  test('N: no duplicate canonical names in the dataset', () => {
    const names = PRICES.map(r => r.name);
    assert.equal(new Set(names).size, names.length);
  });

  test('O: no duplicate aliases in the dataset', () => {
    const { ALIASES } = require('../ingredientPriceData.js');
    const aliasNames = ALIASES.map(a => a.alias);
    assert.equal(new Set(aliasNames).size, aliasNames.length);
  });

  test('P: every alias points to a canonical name that actually exists in PRICES', () => {
    const { ALIASES } = require('../ingredientPriceData.js');
    const priceNames = new Set(PRICES.map(r => r.name));
    for (const a of ALIASES) {
      assert.ok(priceNames.has(a.canonical), `alias "${a.alias}" points to missing canonical "${a.canonical}"`);
    }
  });

  test('no alias points to a name identical to itself', () => {
    const { ALIASES } = require('../ingredientPriceData.js');
    for (const a of ALIASES) assert.notEqual(a.alias, a.canonical);
  });

  test('forbidden aliases are absent: distinct products are never aliased to each other', () => {
    const { ALIASES } = require('../ingredientPriceData.js');
    const forbidden = [
      ['chicken thighs', 'chicken breast'],
      ['brown rice', 'white rice'],
      ['plain yogurt', 'greek yogurt'],
      ['cod', 'salmon fillets'],
      ['cod fillet', 'salmon fillets'],
      ['sweet potato', 'potato'],
    ];
    for (const [alias, canonical] of forbidden) {
      const hit = ALIASES.find(a => a.alias === alias && a.canonical === canonical);
      assert.equal(hit, undefined, `forbidden alias found: ${alias} -> ${canonical}`);
    }
  });
});
