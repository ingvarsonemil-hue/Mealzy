'use strict';

/**
 * Phase 3E — the generation prompt contract.
 *
 * Asserts the generation-contract block that gets appended to week-mode
 * prompts actually carries every constraint 3E requires, and that the
 * ingredient vocabulary is exactly the deterministically-covered set.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const vocab = require('../generationVocabulary');
const canonicalIngredients = require('../canonicalIngredients');
const nutritionEngine = require('../nutritionEngine');
const canonicalPurchaseData = require('../canonicalPurchaseData');

const BLOCK = vocab.buildGenerationContractBlock();

test('1. the contract block constrains ingredient names to the listed canonical names, verbatim', () => {
  assert.match(BLOCK, /COVERED VOCABULARY/);
  assert.match(BLOCK, /MUST be exactly one of the names listed below, copied verbatim/i);
  // canonical names only — no wording that permits spelling variants or aliases
  assert.doesNotMatch(BLOCK, /spelling variant/i);
  assert.doesNotMatch(BLOCK, /identity-safe/i);
  assert.doesNotMatch(BLOCK, /\balias(es)?\b/i);
  assert.match(BLOCK, /no plural, no synonym, no substitution/i);
});

test('1b. the block advertises canonical names only — no curated alias appears in it', () => {
  // e.g. quinoa keeps '(uncooked)'/'(dry)' aliases in canonical data, but the
  // model is only ever shown the bare canonicalName.
  assert.ok(BLOCK.includes('quinoa [g]'));
  assert.doesNotMatch(BLOCK, /quinoa \((uncooked|dry)\)/i);
  assert.doesNotMatch(BLOCK, /chicken breasts|garbanzo|chick peas/i);
});

test('2. the contract block requires canonical base-unit quantities', () => {
  assert.match(BLOCK, /CANONICAL BASE-UNIT QUANTITIES/);
  assert.match(BLOCK, /amountUnit/);
  assert.match(BLOCK, /\bg, ml, or count\b/);
  assert.match(BLOCK, /never use cups, tablespoons, ounces/i);
});

test('3. the contract block requires dry / uncooked conventions', () => {
  assert.match(BLOCK, /DRY \/ UNCOOKED CONVENTIONS/);
  assert.match(BLOCK, /DRY \/ UNCOOKED weight in grams/);
  for (const name of ['rice', 'quinoa', 'oats']) {
    assert.ok(BLOCK.includes(name), `dry list names ${name}`);
  }
});

test('4. the contract block bans cooked rice', () => {
  assert.match(BLOCK, /NO COOKED RICE/);
  assert.match(BLOCK, /cooked rice/i);
  assert.match(BLOCK, /jasmine rice \(cooked\)/i);
});

test('5. the contract block bans narration / preparation text in names', () => {
  assert.match(BLOCK, /NO NARRATION IN NAMES/);
  assert.match(BLOCK, /no preparation words/i);
  assert.match(BLOCK, /"preparation" field/);
});

test('6. the contract block bans alternative ingredient fields', () => {
  assert.match(BLOCK, /NO ALTERNATIVE INGREDIENT FIELDS/);
  assert.match(BLOCK, /one ingredient per entry/i);
  assert.match(BLOCK, /rice or quinoa/i);
});

test('7. the vocabulary is exactly the deterministically full-stack-covered canonical set', () => {
  const expected = canonicalIngredients.allCanonicalIngredients()
    .filter((c) => {
      const rec = nutritionEngine.getNutritionRecord(c.id);
      if (!rec || rec.certification.status !== 'eligible') return false;
      return canonicalPurchaseData.isCertifiableProfile(canonicalPurchaseData.getPurchaseProfile(c.id));
    })
    .map((c) => c.id)
    .sort();
  const got = vocab.GENERATION_ELIGIBLE_INGREDIENTS.map((i) => i.canonicalIngredientId).sort();
  assert.deepEqual(got, expected);
});

test('8. nutrition-ineligible and purchase-uncertifiable canonicals are excluded from the vocabulary', () => {
  const names = vocab.GENERATION_ELIGIBLE_INGREDIENTS.map((i) => i.canonicalName);
  // nutrition-ineligible record -> never offered
  for (const n of ['beef chuck', 'halloumi cheese', 'harissa paste']) {
    assert.ok(!names.includes(n), `${n} must not be in the generation vocabulary`);
  }
  // amortized-rate spice profiles are confidence 'unknown' -> not certifiable -> never offered
  for (const n of ['cumin', 'paprika', 'cinnamon', 'rosemary']) {
    assert.ok(!names.includes(n), `${n} must not be in the generation vocabulary (purchase not certifiable)`);
  }
});

test('9. every eligible ingredient resolves to itself and has a g/ml/count base unit', () => {
  for (const ing of vocab.GENERATION_ELIGIBLE_INGREDIENTS) {
    const r = canonicalIngredients.resolveIngredient(ing.canonicalName);
    assert.equal(r.resolved, true, ing.canonicalName);
    assert.equal(r.ingredient.id, ing.canonicalIngredientId);
    assert.ok(['g', 'ml', 'count'].includes(ing.baseUnit), ing.canonicalName);
  }
});

test('10. the block prints each ingredient with its required unit in brackets', () => {
  assert.match(BLOCK, /chicken breast \[g\]/);
  assert.match(BLOCK, /eggs \[count\]/);
  assert.match(BLOCK, /olive oil \[ml\]/);
});
