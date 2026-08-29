'use strict';

/**
 * Canonical Nutrition Data v1 — the single curated, auditable source of truth
 * for deterministic calories / protein / carbohydrate / fat, keyed by
 * canonical ingredient identity (canonicalIngredientData.js).
 *
 * PURPOSE: Mealzy's meal generation produces model-ESTIMATED macros. Those are
 * not authoritative. This file lets the nutrition engine (nutritionEngine.js)
 * take {canonicalIngredientId, amountValue, amountUnit} and deterministically
 * compute the four v1 macros from curated structured data + explicit
 * transformation provenance. No runtime external API. No LLM. No runtime
 * density/portion lookup table — every transformation constant is IN the
 * record.
 *
 * SOURCE SELECTION (frozen): semantic fit to the Mealzy convention FIRST; then,
 * when semantic fit is equivalent, USDA Foundation > SR Legacy > FNDDS.
 * Branded records are never used as an authoritative generic. FNDDS is used
 * only for almond_milk (the sole coherent single-source nutrient+portion
 * record). CoFID is an approved-in-principle second source for halloumi but is
 * NOT yet verified from primary material — halloumi stays ineligible.
 *
 * ENERGY (frozen): each record carries the selected source food's own energy
 * value and its nutrient id (1008 = "Energy" / SR Legacy & FNDDS #208;
 * 2047 = "Energy, Atwater General Factors" / FDC #957; 2048 = specific
 * factors). Energy is never spliced from a different food than the macros.
 *
 * TRANSFORMED RECORDS (ml + count): the stored kcal/proteinG/carbsG/fatG are
 * the FINAL per-basis values, computed ONCE here during curation
 *   - ml: per-100 g source value * density(g/mL)  -> per-100 mL
 *   - count: per-100 g source value * portionGrams / 100  -> per-1-unit
 * The `transformation` block documents exactly how, with the constant and its
 * provenance, so the numbers are reproducible and auditable. A transformed
 * record is still certification-eligible when the transform has defensible
 * provenance.
 *
 * INELIGIBLE vs MISSING: a canonical ingredient with a deliberately
 * `certification.status: 'ineligible'` record (beef_chuck, harissa_paste,
 * halloumi_cheese) is DIFFERENT from an ingredient with no record at all.
 * Both are "not nutrition-covered" for certification, but the ineligible
 * record carries an explicit machine-readable reason.
 *
 * VALIDATION: enforced at load by nutritionEngine.js (canonical id exists,
 * basisUnit === canonical baseUnit, no dup ids, finite non-negative macros,
 * complete transformation provenance for non-direct records, etc). This file
 * is data only.
 *
 * DO NOT wire this into weekly generation — that is Phase 3E.
 */

// US legal volume -> millilitre constants (NIST Handbook 44 / US Code Title 15
// §205a). Used ONCE below to derive each ml record's density from that food's
// own USDA foodPortion gramWeight; recorded here for auditability, NOT read at
// runtime.
const US_CUP_ML = 236.588;

/** @typedef {Object} NutritionRecord
 *  @property {string} canonicalIngredientId
 *  @property {'raw'|'dry'|'drained'|'as_packed'|'as_sold'|'edible_portion'} convention
 *  @property {'g'|'ml'|'count'} basisUnit
 *  @property {number} basisQuantity           100 for g/ml, 1 for count
 *  @property {number} kcal
 *  @property {number} proteinG
 *  @property {number} carbsG
 *  @property {number} fatG
 *  @property {{dataset:string,foodDescription:string,identifier:string,dataType:(string|null),energyNutrientId:(string|null),retrievedOn:string}} source
 *  @property {({method:string,constant:(number|null),constantUnit:(string|null),constantSource:({kind:string,reference:string,identifier:(string|null)}|null),note:string}|null)} transformation
 *  @property {{status:'eligible'|'ineligible',reason:(string|null)}} certification
 */

const RETRIEVED = '2026-08-29';

// helpers to keep record literals short and consistent
const src = (dataset, foodDescription, identifier, dataType, energyNutrientId) =>
  ({ dataset, foodDescription, identifier, dataType, energyNutrientId, retrievedOn: RETRIEVED });
const eligible = { status: 'eligible', reason: null };
const ineligible = (reason) => ({ status: 'ineligible', reason });

// g -> mL density derived from this food's own USDA "1 cup" foodPortion.
const density = (cupGrams, portionModifier, fdcId) => ({
  method: 'density_g_to_ml',
  constant: Number((cupGrams / US_CUP_ML).toFixed(6)),
  constantUnit: 'g/ml',
  constantSource: {
    kind: 'USDA FDC foodPortion / US legal cup',
    reference: `USDA FDC food ${fdcId} foodPortion "${portionModifier}" = ${cupGrams} g; US legal cup = ${US_CUP_ML} mL (NIST Handbook 44)`,
    identifier: String(fdcId),
  },
  note: `per-100 mL = source per-100 g * ${Number((cupGrams / US_CUP_ML).toFixed(6))} g/mL`,
});

// Mealzy modeling convention: ready-to-serve broth treated as water density
// (1.000 g/mL). The USDA cup portions for these broths are internally
// contradictory (chicken 249 g, beef 240 g, vegetable 221 g per "cup") and all
// imply densities that are physically implausible for a salted aqueous liquid;
// broth macros are ~0 so the choice moves a serving by <1 kcal. Honestly a
// MODELING CONVENTION, not a sourced density.
const brothDensity = (fdcId, cupGrams) => ({
  method: 'density_g_to_ml',
  constant: 1.0,
  constantUnit: 'g/ml',
  constantSource: {
    kind: 'Mealzy modeling convention',
    reference: `ready-to-serve broth modeled as water density 1.000 g/mL; chosen because USDA FDC ${fdcId} portion weights are internally inconsistent (~${cupGrams} g/"cup") and broth macros are ~0`,
    identifier: null,
  },
  note: 'per-100 mL = source per-100 g * 1.000 (Mealzy modeling convention)',
});

// per-100 g -> per-1-count from this food's own USDA portion gramWeight.
const portion = (grams, portionModifier, fdcId) => ({
  method: 'portion_g_to_unit',
  constant: grams,
  constantUnit: 'g/count',
  constantSource: {
    kind: 'USDA FDC foodPortion',
    reference: `USDA FDC food ${fdcId} foodPortion "${portionModifier}" = ${grams} g`,
    identifier: String(fdcId),
  },
  note: `per-1-count = source per-100 g * ${grams} / 100`,
});

/** @type {NutritionRecord[]} */
const NUTRITION_RECORDS = [
  // ── g · USDA Foundation (energy id 2047 unless noted) ───────────────────
  { canonicalIngredientId: 'chicken_breast', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 106.034, proteinG: 22.525, carbsG: 0, fatG: 1.934, source: src('USDA FoodData Central', 'Chicken, breast, boneless, skinless, raw', '2646170', 'Foundation', '2047'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'chicken_thighs', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 144.07, proteinG: 18.6125, carbsG: 0, fatG: 7.916, source: src('USDA FoodData Central', 'Chicken, thigh, boneless, skinless, raw', '2646171', 'Foundation', '2047'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'salmon_fillets', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 197.294, proteinG: 20.31875, carbsG: 0, fatG: 13.11, source: src('USDA FoodData Central', 'Fish, salmon, Atlantic, farm raised, raw', '2684441', 'Foundation', '2047'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'ground_beef', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 184.8648, proteinG: 18.15625, carbsG: 0, fatG: 12.85, source: src('USDA FoodData Central', 'Beef, ground, 90% lean meat / 10% fat, raw', '2514743', 'Foundation', '2047'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'white_rice', convention: 'dry', basisUnit: 'g', basisQuantity: 100, kcal: 358.705, proteinG: 7.03885, carbsG: 80.31315, fatG: 1.033, source: src('USDA FoodData Central', 'Rice, white, long grain, unenriched, raw', '2512381', 'Foundation', '2047'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'brown_rice', convention: 'dry', basisUnit: 'g', basisQuantity: 100, kcal: 365.518, proteinG: 7.25305, carbsG: 76.68795, fatG: 3.306, source: src('USDA FoodData Central', 'Rice, brown, long grain, unenriched, raw', '2512380', 'Foundation', '2047'), transformation: null, certification: eligible },
  // generic `rice` = Mealzy convention: white long-grain dry unenriched (same source food as white_rice)
  { canonicalIngredientId: 'rice', convention: 'dry', basisUnit: 'g', basisQuantity: 100, kcal: 358.705, proteinG: 7.03885, carbsG: 80.31315, fatG: 1.033, source: src('USDA FoodData Central', 'Rice, white, long grain, unenriched, raw', '2512381', 'Foundation', '2047'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'almonds', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 625.75, proteinG: 21.45038, carbsG: 20.03462, fatG: 51.09, source: src('USDA FoodData Central', 'Nuts, almonds, whole, raw', '2346393', 'Foundation', '2047'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'canned_chickpeas', convention: 'drained', basisUnit: 'g', basisQuantity: 100, kcal: 137.22, proteinG: 7.01875, carbsG: 20.32025, fatG: 3.096, source: src('USDA FoodData Central', 'Chickpeas (garbanzo beans, bengal gram), canned, sodium added, drained and rinsed', '2644288', 'Foundation', '2047'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'black_beans_canned', convention: 'drained', basisUnit: 'g', basisQuantity: 100, kcal: 118.361, proteinG: 6.9125, carbsG: 19.8135, fatG: 1.273, source: src('USDA FoodData Central', 'Beans, black, canned, sodium added, drained and rinsed', '2644285', 'Foundation', '2047'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'apple', convention: 'edible_portion', basisUnit: 'g', basisQuantity: 100, kcal: 60.9536, proteinG: 0.1328125, carbsG: 14.7680875, fatG: 0.15, source: src('USDA FoodData Central', 'Apples, gala, with skin, raw', '1750341', 'Foundation', '2047'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'cucumber', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 15.9, proteinG: 0.625, carbsG: 2.95, fatG: 0.178, source: src('USDA FoodData Central', 'Cucumber, with peel, raw', '2346406', 'Foundation', '2047'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'eggplant', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 26.1, proteinG: 0.852, carbsG: 5.4, fatG: 0.12, source: src('USDA FoodData Central', 'Eggplant, raw', '2685577', 'Foundation', '2047'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'broccoli', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 31, proteinG: 2.57, carbsG: 6.27, fatG: 0.34, source: src('USDA FoodData Central', 'Broccoli, raw', '747447', 'Foundation', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'garlic', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 143, proteinG: 6.62, carbsG: 28.2, fatG: 0.38, source: src('USDA FoodData Central', 'Garlic, raw', '1104647', 'Foundation', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'greek_yogurt', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 61, proteinG: 10.3, carbsG: 3.64, fatG: 0.37, source: src('USDA FoodData Central', 'Yogurt, Greek, plain, nonfat', '330137', 'Foundation', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'hummus', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 229, proteinG: 7.35, carbsG: 14.9, fatG: 17.1, source: src('USDA FoodData Central', 'Hummus, commercial', '321358', 'Foundation', '1008'), transformation: null, certification: eligible },

  // ── g · USDA SR Legacy (energy id 1008) ────────────────────────────────
  { canonicalIngredientId: 'cod_fillet', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 82, proteinG: 17.8, carbsG: 0, fatG: 0.67, source: src('USDA FoodData Central', 'Fish, cod, Atlantic, raw', '171955', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'shrimp', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 85, proteinG: 20.1, carbsG: 0, fatG: 0.51, source: src('USDA FoodData Central', 'Crustaceans, shrimp, raw', '175179', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'venison', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 120, proteinG: 23, carbsG: 0, fatG: 2.42, source: src('USDA FoodData Central', 'Game meat, deer, raw', '173855', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'plain_yogurt', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 63, proteinG: 5.25, carbsG: 7.04, fatG: 1.55, source: src('USDA FoodData Central', 'Yogurt, plain, low fat', '170886', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'butter', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 717, proteinG: 0.85, carbsG: 0.06, fatG: 81.11, source: src('USDA FoodData Central', 'Butter, salted', '173410', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'feta', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 265, proteinG: 14.2, carbsG: 3.88, fatG: 21.5, source: src('USDA FoodData Central', 'Cheese, feta', '173420', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'spinach', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 23, proteinG: 2.86, carbsG: 3.63, fatG: 0.39, source: src('USDA FoodData Central', 'Spinach, raw', '168462', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'onion', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 40, proteinG: 1.1, carbsG: 9.34, fatG: 0.1, source: src('USDA FoodData Central', 'Onions, raw', '170000', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'tomato', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 18, proteinG: 0.88, carbsG: 3.89, fatG: 0.2, source: src('USDA FoodData Central', 'Tomatoes, red, ripe, raw, year round average', '170457', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'carrots', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 41, proteinG: 0.93, carbsG: 9.58, fatG: 0.24, source: src('USDA FoodData Central', 'Carrots, raw', '170393', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'potato', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 77, proteinG: 2.05, carbsG: 17.5, fatG: 0.09, source: src('USDA FoodData Central', 'Potatoes, flesh and skin, raw', '170026', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'sweet_potato', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 86, proteinG: 1.57, carbsG: 20.1, fatG: 0.05, source: src('USDA FoodData Central', 'Sweet potato, raw, unprepared', '168482', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'lemon', convention: 'edible_portion', basisUnit: 'g', basisQuantity: 100, kcal: 29, proteinG: 1.1, carbsG: 9.32, fatG: 0.3, source: src('USDA FoodData Central', 'Lemons, raw, without peel', '167746', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'lime', convention: 'edible_portion', basisUnit: 'g', basisQuantity: 100, kcal: 30, proteinG: 0.7, carbsG: 10.5, fatG: 0.2, source: src('USDA FoodData Central', 'Limes, raw', '168155', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'cilantro', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 23, proteinG: 2.13, carbsG: 3.67, fatG: 0.52, source: src('USDA FoodData Central', 'Coriander (cilantro) leaves, raw', '169997', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'oats', convention: 'dry', basisUnit: 'g', basisQuantity: 100, kcal: 379, proteinG: 13.2, carbsG: 67.7, fatG: 6.52, source: src('USDA FoodData Central', 'Cereals, oats, regular and quick, not fortified, dry', '173904', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'bread', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 266, proteinG: 8.85, carbsG: 49.4, fatG: 3.33, source: src('USDA FoodData Central', 'Bread, white, commercially prepared (includes soft bread crumbs)', '174924', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'couscous', convention: 'dry', basisUnit: 'g', basisQuantity: 100, kcal: 376, proteinG: 12.8, carbsG: 77.4, fatG: 0.64, source: src('USDA FoodData Central', 'Couscous, dry', '169699', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'quinoa', convention: 'dry', basisUnit: 'g', basisQuantity: 100, kcal: 368, proteinG: 14.12, carbsG: 64.16, fatG: 6.07, source: src('USDA FoodData Central', 'Quinoa, uncooked', '168874', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'red_lentils', convention: 'dry', basisUnit: 'g', basisQuantity: 100, kcal: 358, proteinG: 23.9, carbsG: 63.1, fatG: 2.17, source: src('USDA FoodData Central', 'Lentils, pink or red, raw', '174284', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'canned_tomatoes', convention: 'as_packed', basisUnit: 'g', basisQuantity: 100, kcal: 16, proteinG: 0.79, carbsG: 3.47, fatG: 0.25, source: src('USDA FoodData Central', 'Tomatoes, red, ripe, canned, packed in tomato juice', '170051', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'peanut_butter', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 598, proteinG: 22.2, carbsG: 22.3, fatG: 51.4, source: src('USDA FoodData Central', 'Peanut butter, smooth style, with salt', '174266', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'honey', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 304, proteinG: 0.3, carbsG: 82.4, fatG: 0, source: src('USDA FoodData Central', 'Honey', '169640', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'salt', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, source: src('USDA FoodData Central', 'Salt, table', '173468', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'pepper', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 251, proteinG: 10.4, carbsG: 64, fatG: 3.26, source: src('USDA FoodData Central', 'Spices, pepper, black', '170931', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'cumin', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 375, proteinG: 17.8, carbsG: 44.2, fatG: 22.3, source: src('USDA FoodData Central', 'Spices, cumin seed', '170923', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'paprika', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 282, proteinG: 14.1, carbsG: 54, fatG: 12.9, source: src('USDA FoodData Central', 'Spices, paprika', '171329', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'cinnamon', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 247, proteinG: 3.99, carbsG: 80.6, fatG: 1.24, source: src('USDA FoodData Central', 'Spices, cinnamon, ground', '171320', 'SR Legacy', '1008'), transformation: null, certification: eligible },
  { canonicalIngredientId: 'rosemary', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 331, proteinG: 4.88, carbsG: 64.1, fatG: 15.2, source: src('USDA FoodData Central', 'Spices, rosemary, dried', '171333', 'SR Legacy', '1008'), transformation: null, certification: eligible },

  // ── g · ineligible (deliberate, machine-readable reasons) ──────────────
  { canonicalIngredientId: 'beef_chuck', convention: 'raw', basisUnit: 'g', basisQuantity: 100, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, source: src('none', 'no defensible generic US raw beef-chuck record', 'none', null, null), transformation: null, certification: ineligible('no_defensible_source: USDA has only "chuck for stew, separable lean and fat" or NZ-imported "lean only" raw chuck; a Mealzy source/convention decision is still pending') },
  { canonicalIngredientId: 'harissa_paste', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, source: src('none', 'no defensible generic structured source', 'none', null, null), transformation: null, certification: ineligible('blocked: USDA has Branded-only harissa; no verified generic non-USDA food-composition source; consumer-aggregator values are not acceptable') },
  { canonicalIngredientId: 'halloumi_cheese', convention: 'as_sold', basisUnit: 'g', basisQuantity: 100, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, source: src('none', 'no primary-verified record', 'none', null, null), transformation: null, certification: ineligible('unverified_source: USDA has Branded-only halloumi; the UK CoFID generic-halloumi candidate could not be verified from primary official material this phase (CoFID ships as a 4.42 MB Excel; no parser available without a new dependency). Indicative secondary values are not acceptable') },

  // ── ml · density_g_to_ml (per 100 mL, derived once from source per-100 g) ─
  { canonicalIngredientId: 'milk', convention: 'as_sold', basisUnit: 'ml', basisQuantity: 100, kcal: 51.56645, proteinG: 3.403386, carbsG: 4.950379, fatG: 2.042031, source: src('USDA FoodData Central', 'Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D', '171267', 'SR Legacy', '1008'), transformation: density(244, '1 cup', 171267), certification: eligible },
  { canonicalIngredientId: 'almond_milk', convention: 'as_sold', basisUnit: 'ml', basisQuantity: 100, kcal: 15.469935, proteinG: 0.567231, carbsG: 0.350652, fatG: 1.258221, source: src('USDA FoodData Central', 'Almond milk, unsweetened', '2705409', 'Survey (FNDDS)', '1008'), transformation: density(244, '1 cup', 2705409), certification: eligible },
  { canonicalIngredientId: 'olive_oil', convention: 'as_sold', basisUnit: 'ml', basisQuantity: 100, kcal: 807.07432, proteinG: 0, carbsG: 0, fatG: 91.298, source: src('USDA FoodData Central', 'Oil, olive, salad or cooking', '171413', 'SR Legacy', '1008'), transformation: density(216, '1 cup', 171413), certification: eligible },
  { canonicalIngredientId: 'vegetable_oil', convention: 'as_sold', basisUnit: 'ml', basisQuantity: 100, kcal: 814.546772, proteinG: 0, carbsG: 0, fatG: 92.1433, source: src('USDA FoodData Central', 'Oil, canola', '172336', 'SR Legacy', '1008'), transformation: density(218, '1 cup', 172336), certification: eligible },
  { canonicalIngredientId: 'soy_sauce', convention: 'as_sold', basisUnit: 'ml', basisQuantity: 100, kcal: 57.124619, proteinG: 8.773479, carbsG: 5.313667, fatG: 0.614359, source: src('USDA FoodData Central', 'Soy sauce made from soy and wheat (shoyu)', '174277', 'SR Legacy', '1008'), transformation: density(255, '1 cup', 174277), certification: eligible },
  { canonicalIngredientId: 'lemon_juice', convention: 'as_sold', basisUnit: 'ml', basisQuantity: 100, kcal: 22.689238, proteinG: 0.360965, carbsG: 7.11617, fatG: 0.247519, source: src('USDA FoodData Central', 'Lemon juice, raw', '167747', 'SR Legacy', '1008'), transformation: density(244, '1 cup', 167747), certification: eligible },
  { canonicalIngredientId: 'lime_juice', convention: 'as_sold', basisUnit: 'ml', basisQuantity: 100, kcal: 25.571875, proteinG: 0.429607, carbsG: 8.612607, fatG: 0.071601, source: src('USDA FoodData Central', 'Lime juice, raw', '168156', 'SR Legacy', '1008'), transformation: density(242, '1 cup', 168156), certification: eligible },
  { canonicalIngredientId: 'vegetable_broth', convention: 'as_sold', basisUnit: 'ml', basisQuantity: 100, kcal: 5, proteinG: 0.24, carbsG: 0.93, fatG: 0.07, source: src('USDA FoodData Central', 'Soup, vegetable broth, ready to serve', '171583', 'SR Legacy', '1008'), transformation: brothDensity(171583, 221), certification: eligible },
  { canonicalIngredientId: 'chicken_broth', convention: 'as_sold', basisUnit: 'ml', basisQuantity: 100, kcal: 6, proteinG: 0.64, carbsG: 0.44, fatG: 0.21, source: src('USDA FoodData Central', 'Soup, chicken broth, ready-to-serve', '174536', 'SR Legacy', '1008'), transformation: brothDensity(174536, 249), certification: eligible },
  { canonicalIngredientId: 'beef_broth', convention: 'as_sold', basisUnit: 'ml', basisQuantity: 100, kcal: 7, proteinG: 1.14, carbsG: 0.04, fatG: 0.22, source: src('USDA FoodData Central', 'Soup, beef broth or bouillon canned, ready-to-serve', '171538', 'SR Legacy', '1008'), transformation: brothDensity(171538, 240), certification: eligible },

  // ── count · portion_g_to_unit (per 1 unit, derived once from source per-100 g) ─
  { canonicalIngredientId: 'eggs', convention: 'raw', basisUnit: 'count', basisQuantity: 1, kcal: 71.5, proteinG: 6.28, carbsG: 0.36, fatG: 4.755, source: src('USDA FoodData Central', 'Egg, whole, raw, fresh', '171287', 'SR Legacy', '1008'), transformation: portion(50, '1 large', 171287), certification: eligible },
  { canonicalIngredientId: 'banana', convention: 'edible_portion', basisUnit: 'count', basisQuantity: 1, kcal: 105.02, proteinG: 1.2862, carbsG: 26.9512, fatG: 0.3894, source: src('USDA FoodData Central', 'Bananas, raw', '173944', 'SR Legacy', '1008'), transformation: portion(118, '1 medium (7" to 7-7/8" long)', 173944), certification: eligible },
  { canonicalIngredientId: 'bell_peppers', convention: 'raw', basisUnit: 'count', basisQuantity: 1, kcal: 30.94, proteinG: 1.1781, carbsG: 7.1757, fatG: 0.357, source: src('USDA FoodData Central', 'Peppers, sweet, red, raw', '170108', 'SR Legacy', '1008'), transformation: portion(119, '1 medium (approx 2-3/4" long, 2-1/2 dia.)', 170108), certification: eligible },
  { canonicalIngredientId: 'corn_tortillas', convention: 'as_sold', basisUnit: 'count', basisQuantity: 1, kcal: 52.32, proteinG: 1.368, carbsG: 10.7136, fatG: 0.684, source: src('USDA FoodData Central', 'Tortillas, ready-to-bake or -fry, corn', '175036', 'SR Legacy', '1008'), transformation: portion(24, '1 tortilla (Mealzy: 1 standard corn tortilla = 24 g; USDA does not label this "6-inch")', 175036), certification: eligible },
];

module.exports = { NUTRITION_RECORDS, US_CUP_ML };
