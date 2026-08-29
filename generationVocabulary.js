'use strict';

/**
 * Generation Vocabulary — Phase 3E.
 *
 * The single deterministic answer to "which ingredients may the meal
 * generator use". An ingredient is generation-eligible ONLY when the
 * existing frozen authorities all cover it:
 *   - it is a canonical ingredient (canonicalIngredients.js), and
 *   - it has a certification-ELIGIBLE deterministic nutrition record
 *     (nutritionEngine / canonicalNutritionData.js), and
 *   - it has a certification-grade purchase profile
 *     (canonicalPurchaseData.isCertifiableProfile).
 *
 * This module COMPOSES those authorities. It never re-implements identity,
 * nutrition, or purchase logic, and it never widens any of them. The list is
 * derived once at load and frozen; if a data change ever empties it, that is
 * a load-time error rather than a silently contract-less prompt.
 *
 * The prompt block built here DESCRIBES the contract to the model. It is not
 * enforcement — certificationAssessment.assessWeek remains the sole authority
 * on whether a generated week is acceptable (see certificationGate.js).
 */

const canonicalIngredients = require('./canonicalIngredients');
const nutritionEngine = require('./nutritionEngine');
const canonicalPurchaseData = require('./canonicalPurchaseData');

// Nutrition conventions that mean "the recipe amount must be the dry /
// uncooked weight" — surfaced to the model so it never emits a cooked weight
// (or a cooked-form name) for these ingredients.
const DRY_CONVENTIONS = Object.freeze(new Set(['dry']));

function deriveEligible() {
  const out = [];
  for (const c of canonicalIngredients.allCanonicalIngredients()) {
    const rec = nutritionEngine.getNutritionRecord(c.id);
    if (!rec || rec.certification.status !== 'eligible') continue;
    const profile = canonicalPurchaseData.getPurchaseProfile(c.id);
    if (!canonicalPurchaseData.isCertifiableProfile(profile)) continue;
    out.push(Object.freeze({
      canonicalIngredientId: c.id,
      canonicalName: c.canonicalName,
      baseUnit: c.baseUnit,
      category: c.category,
      convention: rec.convention,
      isDry: DRY_CONVENTIONS.has(rec.convention),
    }));
  }
  return Object.freeze(out);
}

const GENERATION_ELIGIBLE_INGREDIENTS = deriveEligible();

if (GENERATION_ELIGIBLE_INGREDIENTS.length === 0) {
  throw new Error('generationVocabulary: derived an empty generation-eligible set — a canonical/nutrition/purchase data change broke the contract');
}

/** Frozen list of { canonicalIngredientId, canonicalName, baseUnit, category, convention, isDry }. */
function getGenerationEligibleIngredients() {
  return GENERATION_ELIGIBLE_INGREDIENTS;
}

/** Canonical names of every dry/uncooked-convention eligible ingredient. */
function getDryIngredientNames() {
  return GENERATION_ELIGIBLE_INGREDIENTS.filter((i) => i.isDry).map((i) => i.canonicalName);
}

// ── Prompt contract block ──────────────────────────────────────────────────

// Stable identifiers for each contract clause, so the prompt builder and the
// contract tests reference the SAME source of truth.
const CONTRACT_CLAUSE = Object.freeze({
  COVERED_VOCABULARY: 'covered_vocabulary',
  BASE_UNIT_QUANTITIES: 'base_unit_quantities',
  DRY_CONVENTIONS: 'dry_conventions',
  NO_COOKED_RICE: 'no_cooked_rice',
  NO_NARRATION: 'no_narration',
  NO_ALTERNATIVES: 'no_alternatives',
});

function _groupLabel(category) {
  return ({ meat: 'Meat', protein: 'Fish & protein', dairy: 'Dairy & eggs', produce: 'Produce', pantry: 'Pantry, oils & seasoning' })[category] || 'Other';
}

/**
 * Builds the ingredient-contract block appended to a meal-generation prompt.
 * Every clause required by Phase 3E is present and individually greppable
 * (see tests/generationContract.test.js). Describes the contract only — the
 * deterministic engine stays authoritative.
 */
function buildGenerationContractBlock() {
  const byGroup = new Map();
  for (const ing of GENERATION_ELIGIBLE_INGREDIENTS) {
    const key = _groupLabel(ing.category);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(`${ing.canonicalName} [${ing.baseUnit}]`);
  }
  const vocabLines = [...byGroup.entries()].map(([label, items]) => `  ${label}: ${items.join(', ')}.`);
  const dryNames = getDryIngredientNames();

  return [
    'INGREDIENT CONTRACT — the server deterministically verifies every ingredient after generation. Any ingredient that fails verification fails the whole plan, so follow this exactly:',
    '',
    `1. COVERED VOCABULARY: every ingredient "name" MUST be exactly one of the names listed below, copied verbatim — same spelling, same words, no plural, no synonym, no substitution. Do not introduce any ingredient that is not on this list.`,
    ...vocabLines,
    '',
    `2. CANONICAL BASE-UNIT QUANTITIES: each ingredient above shows its required unit in [brackets]. "amountUnit" MUST be that unit (g, ml, or count) and "amountValue" a positive number expressed in it. Never use cups, tablespoons, ounces, "cloves", "cans", "slices", or "head".`,
    '',
    `3. DRY / UNCOOKED CONVENTIONS: for ${dryNames.join(', ')}, "amountValue" MUST be the DRY / UNCOOKED weight in grams. Never give a cooked weight for these.`,
    '',
    `4. NO COOKED RICE: never emit "cooked rice", "jasmine rice (cooked)", "cooked quinoa", or any cooked-form grain name. Use the plain dry ingredient name from the list.`,
    '',
    `5. NO NARRATION IN NAMES: "name" is the ingredient alone — no preparation words, no parenthetical notes, no quantities, no narration tails (not "onion, finely diced", not "chicken breast (cooked and shredded)"). Put any preparation in a separate "preparation" field.`,
    '',
    `6. NO ALTERNATIVE INGREDIENT FIELDS: exactly one ingredient per entry. Never "rice or quinoa", "chicken or tofu", "bag or loose", or any "X or Y" in a single "name".`,
  ].join('\n');
}

module.exports = {
  GENERATION_ELIGIBLE_INGREDIENTS,
  DRY_CONVENTIONS,
  CONTRACT_CLAUSE,
  getGenerationEligibleIngredients,
  getDryIngredientNames,
  buildGenerationContractBlock,
};
