'use strict';

// Phase 3C — pre-nutrition canonical cleanup regression coverage.
//
// Changes under test:
//   - salt_and_pepper: canonical identity + purchase profile REMOVED.
//   - lean_chuck -> beef_chuck: id + canonicalName renamed; grocery economics
//     preserved; legacy strings still price via retained aliases.
//   - vegetable_oil: id kept; canonicalName narrowed to "canola oil";
//     "vegetable oil" / "canola" / "rapeseed oil" retained as aliases.
//   - rosemary: alias "fresh rosemary" removed (nutrition convention = dried).
//
// Intentional divergence: canonical NUTRITION resolution and legacy FREE-TEXT
// pricing are allowed to differ (e.g. "salt and pepper" is canonically
// unresolved but still priceable).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const canon = require('../canonicalIngredients.js');
const canonData = require('../canonicalIngredientData.js');
const cpd = require('../canonicalPurchaseData.js');
const { priceIngredient, PRICE_SOURCE } = require('../pricing.js');
const { PRICES } = require('../ingredientPriceData.js');
const groceryAgg = require('../groceryAggregation.js');
const budgetEngine = require('../budgetEngine.js');

const rid = (s) => { const r = canon.resolveIngredient(s); return r.resolved ? r.ingredient.id : null; };
const price = (name, v, u) => priceIngredient({ name, amountValue: v, amountUnit: u }, PRICES);

describe('Phase 3C: canonical count + integrity', () => {
  test('1. canonical count is 63', () => {
    assert.equal(canonData.CANONICAL_INGREDIENTS.length, 63);
    assert.equal(canon.allCanonicalIngredients().length, 63);
  });

  test('baseUnit distribution is 49 g / 10 ml / 4 count', () => {
    const by = {};
    for (const r of canonData.CANONICAL_INGREDIENTS) by[r.baseUnit] = (by[r.baseUnit] || 0) + 1;
    assert.deepEqual(by, { g: 49, ml: 10, count: 4 });
  });

  test('21. load-time collision/integrity checks pass (module required without throwing)', () => {
    // require() above already exercises the load-time validation in
    // canonicalIngredients.js and canonicalPurchaseData.js. Re-assert a couple
    // of invariants explicitly.
    const ids = canonData.CANONICAL_INGREDIENTS.map(r => r.id);
    assert.equal(new Set(ids).size, ids.length, 'ids unique');
    const names = canonData.CANONICAL_INGREDIENTS.map(r => r.canonicalName);
    assert.equal(new Set(names).size, names.length, 'canonicalNames unique');
  });
});

describe('Phase 3C: salt_and_pepper removed', () => {
  test('2. salt_and_pepper id no longer exists', () => {
    assert.equal(canon.getById('salt_and_pepper'), null);
    assert.ok(!canonData.CANONICAL_INGREDIENTS.some(r => r.id === 'salt_and_pepper'));
  });
  test('3. "salt and pepper" (and variants) are canonically UNRESOLVED', () => {
    assert.equal(canon.resolveIngredient('salt and pepper').resolved, false);
    assert.equal(canon.resolveIngredient('salt & pepper').resolved, false);
    assert.equal(canon.resolveIngredient('salt and black pepper').resolved, false);
  });
  test('4 + 5. salt resolves to salt, pepper resolves to pepper', () => {
    assert.equal(rid('salt'), 'salt');
    assert.equal(rid('pepper'), 'pepper');
  });
  test('6. black pepper / ground black pepper / cracked black pepper resolve to pepper', () => {
    assert.equal(rid('black pepper'), 'pepper');
    assert.equal(rid('ground black pepper'), 'pepper');
    assert.equal(rid('cracked black pepper'), 'pepper');
  });
  test('salt_and_pepper has no purchase profile (and lookup does not throw)', () => {
    assert.equal(cpd.getPurchaseProfile('salt_and_pepper'), null);
  });
  test('"salt and pepper" still prices via the retained legacy PRICES row', () => {
    const r = price('salt and pepper', 4, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.canonicalName, 'salt and pepper');
  });
});

describe('Phase 3C: lean_chuck -> beef_chuck', () => {
  test('7 + 8. beef_chuck exists, lean_chuck id does not', () => {
    assert.ok(canon.getById('beef_chuck'));
    assert.equal(canon.getById('lean_chuck'), null);
  });
  test('9 + 10. "beef chuck" and retained legacy aliases resolve to beef_chuck', () => {
    assert.equal(rid('beef chuck'), 'beef_chuck');
    assert.equal(rid('lean chuck'), 'beef_chuck');
    assert.equal(rid('chuck steak'), 'beef_chuck');
    assert.equal(rid('chuck roast'), 'beef_chuck');
    assert.equal(rid('lean beef chuck'), 'beef_chuck');
  });
  test('11. beef_chuck has a valid purchase profile with the existing grocery economics', () => {
    const p = cpd.getPurchaseProfile('beef_chuck');
    assert.ok(p);
    assert.equal(p.packageUnit, 'g');
    assert.equal(p.packageQuantity, 680); // unchanged from the old lean_chuck profile
    assert.ok(Number.isInteger(p.packagePriceCents) && p.packagePriceCents > 0);
    // derived from PRICES "beef chuck" (0.0121/g) * 680 g -> 823 cents
    assert.equal(p.packagePriceCents, Math.round(0.0121 * 680 * 100));
  });
  test('legacy free-text "lean chuck" / "lean chuck meat" still price VERIFIED', () => {
    const a = price('lean chuck', 250, 'g');
    assert.equal(a.source, PRICE_SOURCE.VERIFIED);
    assert.equal(a.costUSD, 3.03);
    const b = price('lean chuck meat', 250, 'g');
    assert.equal(b.source, PRICE_SOURCE.VERIFIED);
    assert.equal(b.canonicalName, 'beef chuck');
    assert.equal(b.costUSD, 3.03);
  });
});

describe('Phase 3C: vegetable_oil canonicalName -> "canola oil" (id unchanged)', () => {
  test('12 + 13. vegetable_oil id still exists; canola_oil id does not', () => {
    assert.ok(canon.getById('vegetable_oil'));
    assert.equal(canon.getById('canola_oil'), null);
  });
  test('vegetable_oil canonicalName is now "canola oil"', () => {
    assert.equal(canon.getById('vegetable_oil').canonicalName, 'canola oil');
  });
  test('14-17. canola oil / vegetable oil / canola / rapeseed oil all resolve to vegetable_oil', () => {
    assert.equal(rid('canola oil'), 'vegetable_oil');
    assert.equal(rid('vegetable oil'), 'vegetable_oil');
    assert.equal(rid('canola'), 'vegetable_oil');
    assert.equal(rid('rapeseed oil'), 'vegetable_oil');
  });
  test('olive_oil identity untouched', () => {
    assert.equal(rid('olive oil'), 'olive_oil');
    assert.equal(rid('extra virgin olive oil'), 'olive_oil');
  });
  test('18. vegetable_oil retains a valid purchase profile + grocery economics', () => {
    const p = cpd.getPurchaseProfile('vegetable_oil');
    assert.ok(p);
    assert.equal(p.packageUnit, 'ml');
    assert.equal(p.packageQuantity, 1420); // unchanged
    assert.equal(p.packagePriceCents, Math.round(0.0035 * 1420 * 100));
  });
  test('legacy free-text "vegetable oil" still prices VERIFIED', () => {
    const r = price('vegetable oil', 100, 'ml');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.canonicalName, 'canola oil');
  });
});

describe('Phase 3C: rosemary alias cleanup', () => {
  test('19. "fresh rosemary" is canonically UNRESOLVED', () => {
    assert.equal(canon.resolveIngredient('fresh rosemary').resolved, false);
  });
  test('20. dried rosemary aliases still resolve', () => {
    assert.equal(rid('rosemary'), 'rosemary');
    assert.equal(rid('dried rosemary'), 'rosemary');
    assert.equal(rid('rosemary leaves'), 'rosemary');
  });
  test('"fresh rosemary" still PRICES (substring), diverging from canonical resolution by design', () => {
    const r = price('fresh rosemary', 3, 'g');
    assert.equal(r.source, PRICE_SOURCE.VERIFIED); // pricing != canonical nutrition resolution
  });
});

describe('Phase 3C: no regressions in Phase 2 / Phase 3A behavior', () => {
  const meal = (...ingredients) => ({ ingredients });

  test('23. weekly purchase economics does not throw on the post-cleanup vocabulary', () => {
    const plan = groceryAgg.buildWeeklyPurchasePlan(
      [meal(
        { name: 'beef chuck', amountValue: 500, amountUnit: 'g' },
        { name: 'canola oil', amountValue: 30, amountUnit: 'ml' },
        { name: 'salt', amountValue: 5, amountUnit: 'g' },
        { name: 'pepper', amountValue: 3, amountUnit: 'g' },
        { name: 'broccoli', amountValue: 300, amountUnit: 'g' },
      )],
      { budgetCents: 100000, currency: 'USD' }
    );
    assert.ok(Array.isArray(plan.rows));
    assert.equal(groceryAgg.aggregateWeeklyRequirements.length >= 0, true);
  });

  test('24. broccoli Phase 3A behavior unchanged (g unit, weight package, 250 cents)', () => {
    assert.equal(canon.getById('broccoli').baseUnit, 'g');
    const p = cpd.getPurchaseProfile('broccoli');
    assert.equal(p.packageUnit, 'g');
    assert.equal(p.packageQuantity, 340);
    assert.equal(p.packagePriceCents, 250);
  });

  test('25. a fully-covered week (post-cleanup names) can still purchase-certify', () => {
    const plan = groceryAgg.buildWeeklyPurchasePlan(
      [meal({ name: 'broccoli', amountValue: 300, amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    assert.equal(plan.allCovered, true);
    assert.equal(plan.purchaseBudgetStatus, budgetEngine.PURCHASE_BUDGET_STATUS.CERTIFIED);
  });
});
