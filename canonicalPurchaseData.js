'use strict';

/**
 * Canonical Purchase Data — Phase 2 (Purchasable Grocery Economics).
 *
 * WHAT THIS IS: one ordinary US-supermarket PURCHASE ASSUMPTION per canonical
 * ingredient — the package/container a shopper would realistically buy to
 * cover a week's aggregated requirement of that ingredient. This is the layer
 * that turns "the week needs 650 g of rice" into "buy one 907 g bag, $X".
 *
 * WHY A SEPARATE FILE (not folded into canonicalIngredientData.js): canonical
 * ingredient IDENTITY ("what ingredient is this, really") must stay
 * independent of MARKET assumptions ("how is it sold, and for how much,
 * here"). The same canonical id (`white_rice`) should eventually be able to
 * carry a US profile and, say, an EU profile without its identity changing.
 * Mobile v1 is US/USD only — there is exactly one profile per ingredient here
 * and no regional framework. Do not add one in this phase.
 *
 * PRICE SOURCE: not duplicated. Every profile's `packagePriceCents` is
 * DERIVED at module load from the single matching row in ingredientPriceData.js
 * `PRICES`, matched by EXACT canonical name equality (canonicalName === row.name)
 * — the same deterministic, no-guessing rule Phase 1's resolver uses. A
 * canonical ingredient with no exact-name price row gets NO profile and is
 * therefore not purchase-certifiable (uncertain -> unresolved, never
 * uncertain -> probable match). As of Phase 2 all current canonical
 * ingredients have an exact-name match (the canonical vocabulary was seeded
 * FROM PRICES in Phase 1), but the resolver still handles the missing case
 * for safety and future ingredients.
 *
 *   packagePriceCents = round(price_per_unit_in_baseUnit * packageQuantity * 100)
 *
 * CONFIDENCE: only `confidence: 'estimated'` contributes to authoritative
 * budget certification. `confidence: 'unknown'` still yields a purchase
 * quantity (so the grocery math is complete) but CANNOT certify a budget —
 * the week's status becomes "purchase pricing incomplete", never "certified".
 * The ingredients marked `unknown` here are the amortized-rate spice rows
 * (cumin / paprika / cinnamon / rosemary): their price_per_unit in
 * ingredientPriceData.js is an explicitly amortized per-recipe-use estimate,
 * NOT a package price, so deriving a package cost from it would understate a
 * real spice jar. Adding real spice-jar package prices is a later-phase call,
 * not a Phase 2 invention. (Phase 3C removed the blended `salt and pepper`
 * pseudo-ingredient entirely.)
 *
 * MONEY: integer cents only, everywhere. No floating-point dollars.
 *
 * ID CONTRACT: keyed by canonicalIngredientId. Persisted plan blobs record
 * the resolved numbers (see server.js weeklyPurchasePlan) so a historical
 * plan stays stable even if these assumptions are later revised.
 */

const { CANONICAL_INGREDIENTS } = require('./canonicalIngredientData');
const { PRICES } = require('./ingredientPriceData');

// 'variable_weight' (F2C-impl): a good bought proportionally by canonical
// base-unit quantity — no minimum package, no ceil-to-package. Its profile
// carries { rateQuantity, ratePriceCents } instead of { packageQuantity,
// packagePriceCents }; see the discriminated validation below.
const PACKAGE_TYPES = Object.freeze(['weight_package', 'volume_package', 'count_package', 'per_unit', 'variable_weight']);
const PACKAGE_UNITS = Object.freeze(['g', 'ml', 'count']);

// confidence values that are sufficient to feed authoritative budget
// certification. Anything not in this set yields purchase quantities but
// never a "certified" budget.
const CERTIFIABLE_CONFIDENCE = Object.freeze(new Set(['estimated']));

const PURCHASE_DATA_METHOD =
  'ordinary US supermarket package assumption (package size estimated from typical retail pack formats); ' +
  'packagePriceCents derived from the exact-name ingredientPriceData.js PRICES row, not independently sourced';

// ── Raw package assumptions, keyed by canonicalIngredientId. packageUnit
// always equals the canonical baseUnit (verified at load). packagePriceCents
// is filled in below from the matching PRICES row. ─────────────────────────
const RAW_PACKAGE_ASSUMPTIONS = {
  // Poultry / meat (weight)
  chicken_breast:  { packageType: 'weight_package', packageQuantity: 907,  packageUnit: 'g', confidence: 'estimated', notes: '~2 lb family tray' },
  chicken_thighs:  { packageType: 'weight_package', packageQuantity: 907,  packageUnit: 'g', confidence: 'estimated', notes: '~2 lb pack' },
  ground_beef:     { packageType: 'weight_package', packageQuantity: 454,  packageUnit: 'g', confidence: 'estimated', notes: '~1 lb pack' },
  beef_chuck:      { packageType: 'weight_package', packageQuantity: 680,  packageUnit: 'g', confidence: 'estimated', notes: '~1.5 lb roast/steak (Phase 3C: was key lean_chuck)' },

  // Fish / other protein (weight)
  salmon_fillets:  { packageType: 'weight_package', packageQuantity: 340,  packageUnit: 'g', confidence: 'estimated', notes: '~12 oz two-fillet pack' },
  cod_fillet:      { packageType: 'weight_package', packageQuantity: 454,  packageUnit: 'g', confidence: 'estimated', notes: '~1 lb fillet pack' },
  shrimp:          { packageType: 'weight_package', packageQuantity: 454,  packageUnit: 'g', confidence: 'estimated', notes: '~1 lb frozen bag' },
  venison:         { packageType: 'weight_package', packageQuantity: 454,  packageUnit: 'g', confidence: 'estimated', notes: '~1 lb cut' },

  // Dairy / eggs
  eggs:            { packageType: 'count_package',  packageQuantity: 12,   packageUnit: 'count', confidence: 'estimated', notes: 'one dozen carton' },
  milk:            { packageType: 'volume_package', packageQuantity: 1893, packageUnit: 'ml', confidence: 'estimated', notes: 'half gallon' },
  almond_milk:     { packageType: 'volume_package', packageQuantity: 1893, packageUnit: 'ml', confidence: 'estimated', notes: 'half-gallon carton' },
  greek_yogurt:    { packageType: 'weight_package', packageQuantity: 907,  packageUnit: 'g', confidence: 'estimated', notes: '32 oz tub' },
  plain_yogurt:    { packageType: 'weight_package', packageQuantity: 907,  packageUnit: 'g', confidence: 'estimated', notes: '32 oz tub' },
  butter:          { packageType: 'weight_package', packageQuantity: 454,  packageUnit: 'g', confidence: 'estimated', notes: '1 lb / 4-stick pack' },
  halloumi_cheese: { packageType: 'weight_package', packageQuantity: 250,  packageUnit: 'g', confidence: 'estimated', notes: '~8.8 oz block' },
  feta:            { packageType: 'weight_package', packageQuantity: 227,  packageUnit: 'g', confidence: 'estimated', notes: '8 oz block/tub' },

  // Produce
  banana:          { packageType: 'per_unit',       packageQuantity: 1,    packageUnit: 'count', confidence: 'estimated', notes: 'sold individually' },
  apple:           { packageType: 'weight_package', packageQuantity: 1360, packageUnit: 'g', confidence: 'estimated', notes: '~3 lb bag' },
  spinach:         { packageType: 'weight_package', packageQuantity: 142,  packageUnit: 'g', confidence: 'estimated', notes: '5 oz clamshell' },
  broccoli:        { packageType: 'weight_package', packageQuantity: 340,  packageUnit: 'g', confidence: 'estimated', notes: '340 g/head is a Mealzy compatibility assumption chosen for the Phase 3A count->g migration, NOT an externally sourced weight. Same figure used to derive the ingredientPriceData.js broccoli $/g rate from the unchanged pre-existing $2.50/head assumption' },
  bell_peppers:    { packageType: 'per_unit',       packageQuantity: 1,    packageUnit: 'count', confidence: 'estimated', notes: 'sold individually' },
  onion:           { packageType: 'weight_package', packageQuantity: 1360, packageUnit: 'g', confidence: 'estimated', notes: '~3 lb bag' },
  tomato:          { packageType: 'weight_package', packageQuantity: 500,  packageUnit: 'g', confidence: 'estimated', notes: '~1 lb loose/on-the-vine' },
  carrots:         { packageType: 'weight_package', packageQuantity: 907,  packageUnit: 'g', confidence: 'estimated', notes: '2 lb bag' },
  potato:          { packageType: 'weight_package', packageQuantity: 2268, packageUnit: 'g', confidence: 'estimated', notes: '5 lb bag' },
  sweet_potato:    { packageType: 'weight_package', packageQuantity: 680,  packageUnit: 'g', confidence: 'estimated', notes: '~1.5 lb loose' },
  lemon:           { packageType: 'weight_package', packageQuantity: 100,  packageUnit: 'g', confidence: 'estimated', notes: '~1 fruit sold loose' },
  lime:            { packageType: 'weight_package', packageQuantity: 70,   packageUnit: 'g', confidence: 'estimated', notes: '~1 fruit sold loose' },
  garlic:          { packageType: 'weight_package', packageQuantity: 150,  packageUnit: 'g', confidence: 'estimated', notes: '~3-head mesh bag' },
  cilantro:        { packageType: 'weight_package', packageQuantity: 30,   packageUnit: 'g', confidence: 'estimated', notes: 'one bunch' },
  cucumber:        { packageType: 'weight_package', packageQuantity: 300,  packageUnit: 'g', confidence: 'estimated', notes: '~1 cucumber' },
  eggplant:        { packageType: 'weight_package', packageQuantity: 450,  packageUnit: 'g', confidence: 'estimated', notes: '~1 eggplant' },

  // Grains / starches
  white_rice:      { packageType: 'weight_package', packageQuantity: 907,  packageUnit: 'g', confidence: 'estimated', notes: '2 lb bag' },
  brown_rice:      { packageType: 'weight_package', packageQuantity: 907,  packageUnit: 'g', confidence: 'estimated', notes: '2 lb bag' },
  rice:            { packageType: 'weight_package', packageQuantity: 907,  packageUnit: 'g', confidence: 'estimated', notes: '2 lb bag (generic rice)' },
  oats:            { packageType: 'weight_package', packageQuantity: 1190, packageUnit: 'g', confidence: 'estimated', notes: '42 oz canister' },
  bread:           { packageType: 'weight_package', packageQuantity: 567,  packageUnit: 'g', confidence: 'estimated', notes: '20 oz loaf' },
  couscous:        { packageType: 'weight_package', packageQuantity: 454,  packageUnit: 'g', confidence: 'estimated', notes: '1 lb box' },
  quinoa:          { packageType: 'weight_package', packageQuantity: 850,  packageUnit: 'g', confidence: 'estimated', notes: '30 oz sealed box (~850 g), representative Mealzy v1 assumption from a prior F2 Target Good & Gather Organic Quinoa observation ($6.19); not every retailer sells this size/price' },
  corn_tortillas:  { packageType: 'count_package',  packageQuantity: 30,   packageUnit: 'count', confidence: 'estimated', notes: '30-count pack' },
  red_lentils:     { packageType: 'weight_package', packageQuantity: 454,  packageUnit: 'g', confidence: 'estimated', notes: '1 lb bag dry' },
  almonds:         { packageType: 'weight_package', packageQuantity: 454,  packageUnit: 'g', confidence: 'estimated', notes: '1 lb bag' },

  // Canned / jarred
  canned_chickpeas:   { packageType: 'weight_package', packageQuantity: 425, packageUnit: 'g', confidence: 'estimated', notes: '15 oz can' },
  black_beans_canned: { packageType: 'weight_package', packageQuantity: 425, packageUnit: 'g', confidence: 'estimated', notes: '15 oz can' },
  canned_tomatoes:    { packageType: 'weight_package', packageQuantity: 411, packageUnit: 'g', confidence: 'estimated', notes: '14.5 oz can' },
  hummus:             { packageType: 'weight_package', packageQuantity: 283, packageUnit: 'g', confidence: 'estimated', notes: '10 oz tub' },
  harissa_paste:      { packageType: 'weight_package', packageQuantity: 200, packageUnit: 'g', confidence: 'estimated', notes: '~200 g jar' },
  peanut_butter:      { packageType: 'weight_package', packageQuantity: 454, packageUnit: 'g', confidence: 'estimated', notes: '16 oz jar' },
  honey:              { packageType: 'weight_package', packageQuantity: 340, packageUnit: 'g', confidence: 'estimated', notes: '12 oz bottle' },

  // Oils / liquids / broths (volume)
  olive_oil:       { packageType: 'volume_package', packageQuantity: 500,  packageUnit: 'ml', confidence: 'estimated', notes: '500 ml bottle' },
  vegetable_oil:   { packageType: 'volume_package', packageQuantity: 1420, packageUnit: 'ml', confidence: 'estimated', notes: '48 oz canola bottle (Phase 3C: canonicalName is now "canola oil")' },
  soy_sauce:       { packageType: 'volume_package', packageQuantity: 296,  packageUnit: 'ml', confidence: 'estimated', notes: '10 oz bottle' },
  lemon_juice:     { packageType: 'volume_package', packageQuantity: 444,  packageUnit: 'ml', confidence: 'estimated', notes: '15 oz bottle' },
  lime_juice:      { packageType: 'volume_package', packageQuantity: 444,  packageUnit: 'ml', confidence: 'estimated', notes: '15 oz bottle' },
  vegetable_broth: { packageType: 'volume_package', packageQuantity: 946,  packageUnit: 'ml', confidence: 'estimated', notes: '32 oz carton' },
  chicken_broth:   { packageType: 'volume_package', packageQuantity: 946,  packageUnit: 'ml', confidence: 'estimated', notes: '32 oz carton' },
  beef_broth:      { packageType: 'volume_package', packageQuantity: 946,  packageUnit: 'ml', confidence: 'estimated', notes: '32 oz carton' },

  // Seasoning — salt & pepper have real per-gram rows (v2) and are
  // certifiable; the amortized-rate spice rows are NOT (see file header).
  // (Phase 3C: the 'salt_and_pepper' pseudo-ingredient profile was removed
  // with its canonical identity.)
  salt:            { packageType: 'weight_package', packageQuantity: 737,  packageUnit: 'g', confidence: 'estimated', notes: '26 oz canister' },
  pepper:          { packageType: 'weight_package', packageQuantity: 85,   packageUnit: 'g', confidence: 'estimated', notes: '3 oz tin' },
  cumin:           { packageType: 'weight_package', packageQuantity: 45,   packageUnit: 'g', confidence: 'unknown', notes: 'ingredientPriceData rate is amortized per-recipe-use, not a jar price' },
  paprika:         { packageType: 'weight_package', packageQuantity: 45,   packageUnit: 'g', confidence: 'unknown', notes: 'ingredientPriceData rate is amortized per-recipe-use, not a jar price' },
  cinnamon:        { packageType: 'weight_package', packageQuantity: 45,   packageUnit: 'g', confidence: 'unknown', notes: 'ingredientPriceData rate is amortized per-recipe-use, not a jar price' },
  rosemary:        { packageType: 'weight_package', packageQuantity: 25,   packageUnit: 'g', confidence: 'unknown', notes: 'ingredientPriceData rate is amortized per-recipe-use, not a jar price' },
};

// ── db-unit -> canonical base unit (mirrors pricing.js normalizeDbUnit; kept
// local so this file does not depend on pricing.js). ──────────────────────
const DB_UNIT_TO_BASE = {
  g: 'g', gram: 'g', grams: 'g',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  unit: 'count', units: 'count', each: 'count', count: 'count', head: 'count',
  piece: 'count', pieces: 'count',
};

const _priceByName = new Map(PRICES.map(p => [p.name, p]));
const _canonicalById = new Map(CANONICAL_INGREDIENTS.map(c => [c.id, c]));

// ── Build + validate the exported profiles once ────────────────────────────
const PURCHASE_PROFILES = {};

/**
 * Validate one raw package/rate assumption against its canonical ingredient and
 * the ingredientPriceData price row, and return the frozen profile — or `null`
 * when the canonical has no exact-name price row (no coverage, not an error).
 * Throws on any contradictory/invalid assumption. Pure: reads only the
 * module-level canonical + price maps; never mutates PURCHASE_PROFILES.
 * Exported so tests can exercise the discriminated contract without adding a
 * real RAW_PACKAGE_ASSUMPTIONS entry.
 */
function deriveProfile(canonicalIngredientId, raw) {
  const canonical = _canonicalById.get(canonicalIngredientId);
  if (!canonical) {
    throw new Error(`canonicalPurchaseData: "${canonicalIngredientId}" is not a canonical ingredient id`);
  }
  if (!PACKAGE_TYPES.includes(raw.packageType)) {
    throw new Error(`canonicalPurchaseData: "${canonicalIngredientId}" invalid packageType ${JSON.stringify(raw.packageType)}`);
  }
  if (!PACKAGE_UNITS.includes(raw.packageUnit)) {
    throw new Error(`canonicalPurchaseData: "${canonicalIngredientId}" invalid packageUnit ${JSON.stringify(raw.packageUnit)}`);
  }
  if (raw.packageUnit !== canonical.baseUnit) {
    throw new Error(`canonicalPurchaseData: "${canonicalIngredientId}" packageUnit "${raw.packageUnit}" != canonical baseUnit "${canonical.baseUnit}"`);
  }
  if (raw.confidence !== 'estimated' && raw.confidence !== 'unknown') {
    throw new Error(`canonicalPurchaseData: "${canonicalIngredientId}" confidence must be 'estimated' or 'unknown'`);
  }

  const isVariable = raw.packageType === 'variable_weight';

  // Discriminated economics validation: fixed types carry { packageQuantity,
  // packagePriceCents }; variable_weight carries { rateQuantity, ratePriceCents }.
  // Neither may carry the other's fields.
  if (isVariable) {
    if (canonical.baseUnit === 'count') {
      throw new Error(`canonicalPurchaseData: "${canonicalIngredientId}" variable_weight is not valid for a 'count' baseUnit`);
    }
    if ('packageQuantity' in raw || 'packagePriceCents' in raw) {
      throw new Error(`canonicalPurchaseData: "${canonicalIngredientId}" variable_weight profile must not carry packageQuantity/packagePriceCents`);
    }
    if (!Number.isFinite(raw.rateQuantity) || raw.rateQuantity <= 0) {
      throw new Error(`canonicalPurchaseData: "${canonicalIngredientId}" rateQuantity must be a positive number`);
    }
  } else {
    if ('rateQuantity' in raw || 'ratePriceCents' in raw) {
      throw new Error(`canonicalPurchaseData: "${canonicalIngredientId}" fixed profile must not carry rateQuantity/ratePriceCents`);
    }
    if (!Number.isFinite(raw.packageQuantity) || raw.packageQuantity <= 0) {
      throw new Error(`canonicalPurchaseData: "${canonicalIngredientId}" packageQuantity must be a positive number`);
    }
  }

  const priceRow = _priceByName.get(canonical.canonicalName);
  if (!priceRow) {
    // Deterministic no-match -> no profile (uncertain -> unresolved). Not an
    // error: a canonical ingredient without an exact-name price row simply
    // has no purchase coverage.
    return null;
  }
  const rowBaseUnit = DB_UNIT_TO_BASE[String(priceRow.unit || '').toLowerCase().trim()] || null;
  if (rowBaseUnit !== raw.packageUnit) {
    throw new Error(`canonicalPurchaseData: "${canonicalIngredientId}" price row unit "${priceRow.unit}" does not normalize to packageUnit "${raw.packageUnit}"`);
  }

  if (isVariable) {
    // ratePriceCents: same derivation + positive-integer guard as packagePriceCents,
    // just against rateQuantity (the price-reference quantity).
    const ratePriceCents = Math.round(priceRow.price_per_unit * raw.rateQuantity * 100);
    if (!Number.isInteger(ratePriceCents) || ratePriceCents <= 0) {
      throw new Error(`canonicalPurchaseData: "${canonicalIngredientId}" derived ratePriceCents is not a positive integer (${ratePriceCents})`);
    }
    return Object.freeze({
      canonicalIngredientId,
      packageType: 'variable_weight',
      rateQuantity: raw.rateQuantity,
      ratePriceCents,
      packageUnit: raw.packageUnit,
      provenance: `derived from ingredientPriceData.js PRICES "${canonical.canonicalName}" (${priceRow.price_per_unit}/${priceRow.unit}); rate: ${raw.notes}`,
      confidence: raw.confidence,
    });
  }

  const packagePriceCents = Math.round(priceRow.price_per_unit * raw.packageQuantity * 100);
  if (!Number.isInteger(packagePriceCents) || packagePriceCents <= 0) {
    throw new Error(`canonicalPurchaseData: "${canonicalIngredientId}" derived packagePriceCents is not a positive integer (${packagePriceCents})`);
  }

  return Object.freeze({
    canonicalIngredientId,
    packageType: raw.packageType,
    packageQuantity: raw.packageQuantity,
    packageUnit: raw.packageUnit,
    packagePriceCents,
    provenance: `derived from ingredientPriceData.js PRICES "${canonical.canonicalName}" (${priceRow.price_per_unit}/${priceRow.unit}); package: ${raw.notes}`,
    confidence: raw.confidence,
  });
}

for (const [canonicalIngredientId, raw] of Object.entries(RAW_PACKAGE_ASSUMPTIONS)) {
  const profile = deriveProfile(canonicalIngredientId, raw);
  if (profile) PURCHASE_PROFILES[canonicalIngredientId] = profile;
}

Object.freeze(PURCHASE_PROFILES);

/** The purchase profile for a canonical ingredient id, or null. Null means
 * "no curated purchase coverage" — the caller must treat the ingredient as
 * NOT purchase-certifiable, never substitute a default. */
function getPurchaseProfile(canonicalIngredientId) {
  return PURCHASE_PROFILES[canonicalIngredientId] || null;
}

/** True when a profile's confidence is sufficient to feed authoritative
 * budget certification. A profile that exists but is `unknown` still yields
 * purchase quantities — it just can't certify a budget. */
function isCertifiableProfile(profile) {
  if (!profile || !CERTIFIABLE_CONFIDENCE.has(profile.confidence)) return false;
  if (profile.packageType === 'variable_weight') {
    return Number.isInteger(profile.ratePriceCents)
      && profile.ratePriceCents > 0
      && Number.isFinite(profile.rateQuantity)
      && profile.rateQuantity > 0;
  }
  return Number.isInteger(profile.packagePriceCents)
    && profile.packagePriceCents > 0
    && Number.isFinite(profile.packageQuantity)
    && profile.packageQuantity > 0;
}

module.exports = {
  PURCHASE_PROFILES,
  PACKAGE_TYPES,
  PACKAGE_UNITS,
  CERTIFIABLE_CONFIDENCE,
  PURCHASE_DATA_METHOD,
  getPurchaseProfile,
  isCertifiableProfile,
  deriveProfile,
};
