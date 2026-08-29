'use strict';

/**
 * Price Coverage v2 — high-impact unknowns + salt investigation.
 *
 * Regression coverage for the batch added to ingredientPriceData.js: new
 * canonical rows for the highest financial-risk unmatched ingredients found
 * in the manual 5-list / 107-observation audit (see tests/fixtures/
 * manualSupermarketObservations.js — evidence for prioritization only, never
 * a source of truth), plus the proven, additive fix for the "salt" ->
 * "salt and pepper" substring-match anomaly. Uses the REAL ingredientPriceData.js
 * PRICES/ALIASES throughout (not a hand-rolled fixture), because the claims
 * under test are about the shipped production dataset.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { priceIngredient, PRICE_SOURCE } = require('../pricing.js');
const { PRICES } = require('../ingredientPriceData.js');

function price(name, amountValue, amountUnit) {
  return priceIngredient({ name, amountValue, amountUnit }, PRICES);
}

describe('A/D/E/F: new canonical high-impact ingredients resolve VERIFIED, not unknown', () => {
  test('venison steak is no longer an unknown protein', () => {
    const r = price('venison steak', 200, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.canonicalName, 'venison');
    // 200g * 0.0397 = 7.94 — in the same order of magnitude as the observed
    // real ~$9.59, a world away from the old $0.50 fallback.
    assert.equal(r.costUSD, 7.94);
  });

  test('lean chuck meat is no longer an unknown protein', () => {
    const r = price('lean chuck meat', 250, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.canonicalName, 'beef chuck'); // Phase 3C: row renamed lean chuck -> beef chuck
    assert.equal(r.costUSD, 3.03); // 250 * 0.0121 — price unchanged
  });

  test('shrimp is no longer an unknown protein', () => {
    const r = price('shrimp', 150, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.costUSD, 2.97); // 150 * 0.0198
  });

  test('hummus, eggplant, feta, cucumber all resolve VERIFIED', () => {
    for (const name of ['hummus', 'eggplant', 'feta', 'cucumber']) {
      const r = price(name, 100, 'g');
      assert.equal(r.source, PRICE_SOURCE.VERIFIED, `${name} should be VERIFIED`);
    }
  });

  test('chicken broth and beef broth resolve VERIFIED as their own rows, not aliased to vegetable broth', () => {
    const chicken = price('chicken broth', 250, 'ml');
    const beef = price('beef broth', 250, 'ml');
    assert.equal(chicken.source, PRICE_SOURCE.VERIFIED);
    assert.equal(chicken.canonicalName, 'chicken broth');
    assert.equal(beef.source, PRICE_SOURCE.VERIFIED);
    assert.equal(beef.canonicalName, 'beef broth');
  });

  test('a bare, generic "broth" mention (no type specified) is STILL ambiguous and stays unresolved — never guessed', () => {
    // Three candidate rows (vegetable/chicken/beef broth) all substring-match
    // "broth" and none subsumes the others — the forbidden "generic broth ->
    // one specific broth without evidence" behavior must not happen.
    const r = price('broth', 250, 'ml');
    assert.equal(r.source, PRICE_SOURCE.UNKNOWN_INGREDIENT);
  });
});

describe('rice: bare "rice" now resolves via its own exact-match row instead of falling to unknown', () => {
  test('bare "rice" is VERIFIED against the new generic rice row', () => {
    const r = price('rice', 200, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.canonicalName, 'rice');
  });

  test('a variety-specific name is unaffected — "white rice" still resolves to its own row, not the generic one', () => {
    const r = price('white rice', 200, 'g');
    assert.equal(r.canonicalName, 'white rice');
  });

  test('a variety-specific name is unaffected — "brown rice" still resolves to its own row, not the generic one', () => {
    const r = price('brown rice', 200, 'g');
    assert.equal(r.canonicalName, 'brown rice');
  });
});

describe('G: known cheap pantry unknowns NOT in this batch remain honestly unresolved', () => {
  test('rosemary sprig / dried rosemary now VERIFIED (added — low priority but cheap to add), unrelated cheap unknowns stay unknown', () => {
    const rosemary = price('rosemary', 3, 'g');
    assert.equal(rosemary.source, PRICE_SOURCE.VERIFIED);
    // A genuinely unadded ingredient must still be honest, never silently upgraded.
    const notAdded = price('saffron threads', 1, 'g');
    assert.equal(notAdded.source, PRICE_SOURCE.UNKNOWN_INGREDIENT);
  });
});

describe('H: a known ingredient that costs around $0.50 is still dataset-priced, not mistaken for the fallback', () => {
  test('50g of the new eggplant row happens to land near $0.50 but is VERIFIED, not UNKNOWN', () => {
    const r = price('eggplant', 100, 'g'); // 100 * 0.0033 = 0.33, distinct from 0.50
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    // Explicit $0.50-coincidence case, same style as the existing v1 regression test.
    const coincidence = priceIngredient({ name: 'garlic', amountValue: 50, amountUnit: 'g' }, [{ name: 'garlic', category: 'produce', price_per_unit: 0.01, unit: 'g' }]);
    assert.equal(coincidence.costUSD, 0.50);
    assert.equal(coincidence.source, PRICE_SOURCE.VERIFIED);
  });
});

describe('I: unknown fallback still produces an explicit, non-VERIFIED estimate for ingredients not in this batch', () => {
  test('an unrelated unmatched ingredient (truffle oil) is still UNKNOWN_INGREDIENT at the flat $0.50 estimate', () => {
    const r = price('truffle oil', 10, 'ml');
    assert.equal(r.source, PRICE_SOURCE.UNKNOWN_INGREDIENT);
    assert.equal(r.costUSD, 0.50);
  });
});

describe('N: chicken breast regression — untouched by this batch', () => {
  test('chicken breast still prices exactly as before', () => {
    const r = price('chicken breast', 200, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.costUSD, 2.20);
  });
});

describe('O: eggs regression — untouched by this batch', () => {
  test('eggs still price exactly as before', () => {
    const r = price('eggs', 3, 'count');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.costUSD, 0.75);
  });
});

describe('B/C: safe aliases resolve correctly', () => {
  test('aubergine resolves to eggplant', () => {
    const r = price('aubergine', 100, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.canonicalName, 'eggplant');
  });

  test('sea salt resolves to salt', () => {
    const r = price('sea salt', 5, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.canonicalName, 'salt');
  });

  test('black pepper resolves to pepper', () => {
    const r = price('black pepper', 5, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.canonicalName, 'pepper');
  });
});

describe('M/L: salt and pepper structural + matching fix, proven against the real production dataset', () => {
  test('bare "salt" now resolves VERIFIED via its OWN dedicated row, not the blended "salt and pepper" row', () => {
    const r = price('salt', 4, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.canonicalName, 'salt'); // NOT "salt and pepper"
    assert.equal(r.costUSD, 0.01); // 4 * 0.0015 = 0.006 -> rounds to 0.01
  });

  test('bare "pepper" now resolves VERIFIED via its OWN dedicated row, not ambiguous between "salt and pepper"/"bell peppers"', () => {
    const r = price('pepper', 4, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.canonicalName, 'pepper');
  });

  test('"salt and pepper" (the combo dish label) still resolves to its own unchanged row, unaffected by the new rows', () => {
    const r = price('salt and pepper', 4, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.canonicalName, 'salt and pepper');
    assert.equal(r.costUSD, 0.04); // 4 * 0.01, the original blended row, untouched
  });

  test('SALT ROOT-CAUSE REGRESSION: the observed ~$1.50 magnitude does NOT reproduce anymore against the real dataset', () => {
    // Same 150g aggregated-salt scenario that produced the ~$1.50 anomaly
    // pre-fix (see tests/groceryPricingV2.test.js isolated fallback pin) —
    // against the REAL production dataset it now resolves via the dedicated
    // salt row at a realistic magnitude instead.
    const r = price('salt', 150, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.canonicalName, 'salt');
    assert.equal(r.costUSD, 0.23); // 150 * 0.0015 = 0.225 -> rounds to 0.23, NOT 1.50
    assert.notEqual(r.costUSD, 1.50);
  });

  test('grocery-list aggregation of a week of salt occurrences no longer produces the ~$1.50 anomaly', () => {
    const { buildGroceryList } = require('../groceryAggregation.js');
    const meals = [];
    for (let d = 0; d < 7; d++) {
      for (let m = 0; m < 3; m++) {
        meals.push({ ingredients: [{ name: 'salt', amountValue: 7, amountUnit: 'g' }] });
      }
    }
    const list = buildGroceryList(meals, PRICES, { weekStart: '2026-08-24', budget: 50, currency: 'USD', day: 'Week' });
    const item = list.categories.pantry.find(i => i.name === 'salt');
    assert.equal(item.priceSource, PRICE_SOURCE.VERIFIED);
    assert.equal(item.amountValue, 147);
    assert.equal(item.cost, 0.22); // 147 * 0.0015 = 0.2205 -> rounds to 0.22
    assert.ok(item.cost < 0.30, 'aggregated weekly salt cost must stay in a realistic magnitude, not ~$1.50');
  });
});

describe('P: honey unit-conversion regression — untouched by this batch', () => {
  test('honey still converts ml->g via the documented density and prices VERIFIED', () => {
    const r = price('honey', 15, 'ml');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.costUSD, 0.23);
  });
});

describe('Q: shopper-display unit tests remain green (see tests/shoppingDisplayUnits.test.js) — this batch adds only g/ml pantry/produce/protein rows, none in the produce-display registry', () => {
  test('new rows do not accidentally collide with the produce shopping-display registry (garlic/onion/lemon/lime)', () => {
    const { getProduceShoppingDisplay } = require('../shoppingDisplayUnits.js');
    for (const name of ['venison', 'lean chuck', 'shrimp', 'hummus', 'eggplant', 'feta', 'cucumber', 'chicken broth', 'beef broth', 'rice', 'rosemary', 'salt', 'pepper']) {
      assert.equal(getProduceShoppingDisplay(name, 100, 'g'), null, `${name} should not be in the produce display registry`);
    }
  });
});
