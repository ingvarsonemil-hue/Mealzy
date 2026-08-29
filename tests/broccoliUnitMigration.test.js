'use strict';

// Phase 3A prerequisite — broccoli canonical unit migration: count -> g.
//
// "1 broccoli" is too ambiguous (a whole head vs a single floret) to carry
// deterministic nutrition or a stable purchase quantity, so canonical
// `broccoli` is now expressed by weight. This file covers the whole migration
// surface: canonical identity, purchase economics, aggregation, and the ONE
// narrowly-scoped legacy-compatibility helper for historical stored plans.
//
// Deliberately NOT here: any change to groceryAggregation's or pricing's
// generic unit-mismatch behavior. A current-domain broccoli/count is still an
// honest unit-contract violation — those assertions live below too.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const canonicalIngredients = require('../canonicalIngredients.js');
const canonicalPurchaseData = require('../canonicalPurchaseData.js');
const groceryAgg = require('../groceryAggregation.js');
const budgetEngine = require('../budgetEngine.js');
const { priceIngredient, PRICE_SOURCE } = require('../pricing.js');
const { PRICES } = require('../ingredientPriceData.js');

const { buildWeeklyPurchasePlan, aggregateWeeklyRequirements, PURCHASE_PRICING_STATUS } = groceryAgg;
const { PURCHASE_BUDGET_STATUS } = budgetEngine;

const meal = (...ingredients) => ({ ingredients });
const row = (plan, canonicalId) => plan.rows.find(r => r.canonicalIngredientId === canonicalId);

describe('canonical identity', () => {
  test('broccoli baseUnit is g, not count', () => {
    assert.equal(canonicalIngredients.getById('broccoli').baseUnit, 'g');
    assert.equal(canonicalIngredients.resolveIngredient('broccoli').ingredient.baseUnit, 'g');
  });

  test('the "broccoli florets" alias still resolves to broccoli', () => {
    const r = canonicalIngredients.resolveIngredient('broccoli florets');
    assert.equal(r.resolved, true);
    assert.equal(r.ingredient.id, 'broccoli');
    assert.equal(r.ingredient.baseUnit, 'g');
  });
});

describe('purchase economics — weight-based, $2.50/head value preserved', () => {
  const BROCCOLI = canonicalPurchaseData.PURCHASE_PROFILES.broccoli;

  test('purchase profile is a 340 g weight package', () => {
    assert.equal(BROCCOLI.packageType, 'weight_package');
    assert.equal(BROCCOLI.packageUnit, 'g');
    assert.equal(BROCCOLI.packageQuantity, 340);
  });

  test('derived package price is still 250 cents ($2.50/head assumption preserved)', () => {
    assert.equal(BROCCOLI.packagePriceCents, 250);
    // derivation: price_per_unit 0.00735 $/g * 340 g -> round(249.9) = 250
    const priceRow = PRICES.find(p => p.name === 'broccoli');
    assert.equal(priceRow.unit, 'g');
    assert.equal(Math.round(priceRow.price_per_unit * BROCCOLI.packageQuantity * 100), 250);
  });

  test('the profile is certification-grade', () => {
    assert.equal(canonicalPurchaseData.isCertifiableProfile(BROCCOLI), true);
  });

  test('broccoli requirements in grams aggregate as one covered row', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'broccoli', amountValue: 150, amountUnit: 'g' }),
       meal({ name: 'broccoli florets', amountValue: 100, amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = row(plan, 'broccoli');
    assert.equal(r.requiredQuantity, 250);
    assert.equal(r.pricingStatus, PURCHASE_PRICING_STATUS.COVERED);
  });

  test('purchase quantity rounds up to whole 340 g packages', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'broccoli', amountValue: 400, amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    const r = row(plan, 'broccoli');
    assert.equal(r.packageCount, 2);        // 400 g -> 2 x 340 g
    assert.equal(r.purchaseQuantity, 680);
    assert.equal(r.purchaseCostCents, 500); // 2 x 250
  });

  test('an otherwise-covered broccoli-only week purchase-certifies within budget', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'broccoli', amountValue: 300, amountUnit: 'g' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    assert.equal(plan.allCovered, true);
    assert.equal(plan.certifiedEstimatedPurchaseCostCents, 250);
    assert.equal(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.CERTIFIED);
  });
});

describe('broccoli in grams prices normally', () => {
  test('200 g broccoli prices VERIFIED against the real dataset', () => {
    const r = priceIngredient({ name: 'broccoli', amountValue: 200, amountUnit: 'g' }, PRICES);
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.costUSD, 1.47); // 0.00735 * 200
  });
});

describe('current-domain broccoli/count is NOT silently accepted', () => {
  test('aggregateWeeklyRequirements flags a broccoli/count occurrence as a unit mismatch', () => {
    const rows = aggregateWeeklyRequirements([meal({ name: 'broccoli', amountValue: 1, amountUnit: 'count' })]);
    const r = rows.find(x => x.canonicalIngredientId === 'broccoli');
    assert.equal(r.flags.unitMismatch, true);
    assert.equal(r.requiredQuantity, 0); // excluded from the sum, never converted
  });

  test('buildWeeklyPurchasePlan never certifies a week containing broccoli/count', () => {
    const plan = buildWeeklyPurchasePlan(
      [meal({ name: 'broccoli', amountValue: 1, amountUnit: 'count' })],
      { budgetCents: 100000, currency: 'USD' }
    );
    assert.equal(row(plan, 'broccoli').pricingStatus, PURCHASE_PRICING_STATUS.UNIT_MISMATCH);
    assert.notEqual(plan.purchaseBudgetStatus, PURCHASE_BUDGET_STATUS.CERTIFIED);
  });

  test('pricing.priceIngredient refuses broccoli/count (no generic count->g conversion)', () => {
    const r = priceIngredient({ name: 'broccoli', amountValue: 1, amountUnit: 'count' }, PRICES);
    assert.equal(r.source, PRICE_SOURCE.UNSUPPORTED_UNIT);
  });

  test('an unrelated count vs $/g mismatch stays unsupported', () => {
    const r = priceIngredient({ name: 'spinach', amountValue: 1, amountUnit: 'count' }, PRICES);
    assert.equal(r.source, PRICE_SOURCE.UNSUPPORTED_UNIT);
  });
});

describe('legacy compatibility is confined to the grocery-list route helper', () => {
  // The ONLY place a legacy broccoli/count is normalized to grams:
  // server.js normalizeLegacyBroccoliCount, applied to client-supplied meals
  // in POST /api/generate-grocery-list. Extracted and run in isolation here
  // (same approach as tests/meal-completion-macros.test.js).
  const SERVER_SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  function extractFn(src, name) {
    const sigIdx = src.indexOf(`function ${name}(`);
    assert.notEqual(sigIdx, -1, `expected function ${name} in server.js`);
    const openIdx = src.indexOf('{', sigIdx);
    let depth = 0;
    for (let i = openIdx; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) return src.slice(sigIdx, i + 1);
      }
    }
    throw new Error(`could not find end of ${name}`);
  }

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    'const LEGACY_BROCCOLI_HEAD_GRAMS = 340;\n' +
    extractFn(SERVER_SRC, 'normalizeLegacyBroccoliCount') +
    '\nthis.normalizeLegacyBroccoliCount = normalizeLegacyBroccoliCount;',
    sandbox
  );
  const { normalizeLegacyBroccoliCount } = sandbox;

  test('server.js still defines the frozen 340 g/head assumption', () => {
    assert.match(SERVER_SRC, /const LEGACY_BROCCOLI_HEAD_GRAMS = 340;/);
  });

  test('a legacy broccoli/count occurrence becomes grams via the 340 g/head assumption', () => {
    // (field-wise, not deepStrictEqual — the object is built in the vm realm)
    const a = normalizeLegacyBroccoliCount({ name: 'broccoli', amountValue: 1, amountUnit: 'count' });
    assert.equal(a.name, 'broccoli');
    assert.equal(a.amountValue, 340);
    assert.equal(a.amountUnit, 'g');
    const b = normalizeLegacyBroccoliCount({ name: 'Broccoli Florets', amountValue: 2, amountUnit: 'count' });
    assert.equal(b.amountValue, 680);
    assert.equal(b.amountUnit, 'g');
  });

  test('the normalized grams then price VERIFIED at the preserved ~$2.50/head value', () => {
    const normalized = normalizeLegacyBroccoliCount({ name: 'broccoli', amountValue: 1, amountUnit: 'count' });
    const r = priceIngredient(normalized, PRICES);
    assert.equal(r.source, PRICE_SOURCE.VERIFIED);
    assert.equal(r.costUSD, 2.50); // 340 * 0.00735 = 2.499 -> 2.50
  });

  test('the helper touches nothing else — broccoli/g, other counts, and non-broccoli pass straight through', () => {
    const brocGrams = { name: 'broccoli', amountValue: 200, amountUnit: 'g' };
    assert.equal(normalizeLegacyBroccoliCount(brocGrams), brocGrams);
    const eggs = { name: 'eggs', amountValue: 2, amountUnit: 'count' };
    assert.equal(normalizeLegacyBroccoliCount(eggs), eggs);
    const cauliflower = { name: 'cauliflower', amountValue: 1, amountUnit: 'count' };
    assert.equal(normalizeLegacyBroccoliCount(cauliflower), cauliflower);
    assert.equal(normalizeLegacyBroccoliCount(null), null);
  });

  test('a malformed broccoli/count (non-positive / non-finite) is left untouched, not converted', () => {
    const bad = { name: 'broccoli', amountValue: 0, amountUnit: 'count' };
    assert.equal(normalizeLegacyBroccoliCount(bad), bad);
    const worse = { name: 'broccoli', amountValue: undefined, amountUnit: 'count' };
    assert.equal(normalizeLegacyBroccoliCount(worse), worse);
  });
});
