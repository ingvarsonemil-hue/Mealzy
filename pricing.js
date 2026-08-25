'use strict';

/**
 * Single source of truth for ingredient cost calculation.
 * Used by both meal-plan generation (calculateMealCost in server.js) and
 * grocery-list generation (groundAndStampGroceryItems in server.js) so the
 * two flows can never diverge or duplicate pricing logic.
 *
 * Unit-aware only: grams are priced against $/g rows, milliliters against
 * $/ml rows, count against $/count rows. There is no cross-unit arithmetic —
 * an ingredient whose unit doesn't match its price row's unit is explicitly
 * flagged as unsupported rather than silently multiplied.
 */

// Flat estimate used when we cannot compute a real price. This is NOT a
// precise price — every caller receives `source` alongside `costUSD` and
// must not present this figure as exact. Kept at the same numeric value the
// old fallback used so this change doesn't quietly shift budget totals; a
// real per-category estimate is a follow-up, not part of this fix.
const UNKNOWN_INGREDIENT_ESTIMATE_USD = 0.50;

const PRICE_SOURCE = Object.freeze({
  VERIFIED: 'verified',                 // matched ingredient, matched unit, real db price
  UNKNOWN_INGREDIENT: 'unknown_ingredient', // no ingredient_prices row matched this name
  UNSUPPORTED_UNIT: 'unsupported_unit',     // matched ingredient, but the unit couldn't be priced safely
  LEGACY_ESTIMATE: 'legacy_estimate',       // pre-existing data with no structured amountValue/amountUnit
});

const SUPPORTED_UNITS = new Set(['g', 'ml', 'count']);

// Root-cause fix for the honey $0.50 fallback (Grocery Units + Unknown
// Pricing v2 audit): the generation prompt classifies honey as a liquid (->
// ml) because it's poured, but its canonical price row is $/g like every
// other viscous/solid pantry item — so every honey occurrence hit
// UNSUPPORTED_UNIT and silently became $0.50 regardless of quantity. Rather
// than trust `1 ml == 1 g` (explicitly forbidden — different substances have
// different densities), this converts using honey's real, documented
// density so honey keeps pricing as VERIFIED. Density source: honey is
// ~1.42 g/mL (higher than water because of its sugar content) — a
// well-established, non-controversial physical constant, not a guess.
// Deliberately a tiny, named allowlist (not a generic ml->g fallback for any
// mismatched ingredient) so this never silently "fixes" an ingredient whose
// unit mismatch is a genuine data problem rather than a known density fact.
const KNOWN_ML_TO_G_DENSITY = { honey: 1.42 };

// Maps the free-text `unit` values already present in ingredient_prices to
// one of the three canonical units above. Existing rows like "each", "head",
// "unit" all mean a discrete count; this reads them without requiring a data
// migration for rows outside the three fixed in this change.
const DB_UNIT_ALIASES = {
  g: 'g', gram: 'g', grams: 'g',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  unit: 'count', units: 'count', each: 'count', count: 'count', head: 'count',
  piece: 'count', pieces: 'count',
};

function normalizeDbUnit(rawUnit) {
  const key = String(rawUnit || '').toLowerCase().trim();
  return DB_UNIT_ALIASES[key] || null; // null = this db row's own unit isn't recognized as g/ml/count
}

function _round2(n) {
  return Math.round(n * 100) / 100;
}

// Small, curated exact-name synonym list (ingredientPriceData.js is the
// canonical source; this module owns only the resolution logic). Checked
// BEFORE the substring fallback so an alias always wins over a guess.
const { ALIASES } = require('./ingredientPriceData');
const ALIAS_MAP = new Map(ALIASES.map(a => [a.alias, a.canonical]));

/**
 * Finds the price row matching `name`, or null if none can be resolved
 * safely. Resolution order:
 *   1. Exact normalized match.
 *   2. A curated alias (ingredientPriceData.js ALIASES) resolved to its
 *      canonical row.
 *   3. A conservative substring fallback: a row is a candidate only if its
 *      name literally appears inside `name`, or vice versa. When multiple
 *      candidates exist, they resolve ONLY if there is a single longest
 *      candidate whose name is itself a superstring of every other
 *      candidate's name — a genuine specificity hierarchy ("almond milk"
 *      contains "milk"), not two unrelated products that both happen to
 *      appear in the text. Any other multi-candidate situation (a tie, or
 *      candidates that don't subsume each other) is treated as ambiguous
 *      and returns null — a false VERIFIED price is worse than an explicit
 *      fallback estimate, so this never guesses between genuine
 *      alternatives. This is what fixes the proven bug where "unsweetened
 *      almond milk" resolved to the "milk" row (whichever candidate
 *      happened to appear first in DB insertion order) instead of the more
 *      specific "almond milk" row.
 */
function _findPriceRow(name, priceRows) {
  const norm = String(name || '').toLowerCase().trim();
  if (!norm || !Array.isArray(priceRows)) return null;

  const exact = priceRows.find(p => p.name === norm);
  if (exact) return exact;

  const aliasTarget = ALIAS_MAP.get(norm);
  if (aliasTarget) {
    const aliased = priceRows.find(p => p.name === aliasTarget);
    if (aliased) return aliased;
  }

  const candidates = priceRows.filter(p => norm.includes(p.name) || p.name.includes(norm));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const byLengthDesc = [...candidates].sort((a, b) => b.name.length - a.name.length);
  const longest = byLengthDesc[0];
  const uniqueLongest = byLengthDesc[1].name.length !== longest.name.length;
  const longestSubsumesAll = candidates.every(c => c === longest || longest.name.includes(c.name));

  return (uniqueLongest && longestSubsumesAll) ? longest : null;
}

// Legacy best-effort parse for ingredients saved before the structured
// amountValue/amountUnit contract existed (old plans, old favorites). Only
// used when no amountUnit field is present at all — never for newly
// generated ingredients, and never treated as "verified".
function _legacyParseQuantity(amountStr) {
  const m = String(amountStr || '').match(/[\d.]+/);
  const n = m ? parseFloat(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Prices one ingredient. `ingredient` is expected to look like
 * { name, amountValue, amountUnit } for newly generated data, or the legacy
 * { name, amount } free-text shape for data saved before this change.
 *
 * Returns { costUSD, source } — costUSD is always a number so existing
 * numeric totals keep working; `source` tells the caller whether that
 * number is a real, verified price or an explicit estimate/unknown.
 */
function priceIngredient(ingredient, priceRows) {
  const priceRow = _findPriceRow(ingredient?.name, priceRows);

  if (!priceRow) {
    return { costUSD: UNKNOWN_INGREDIENT_ESTIMATE_USD, source: PRICE_SOURCE.UNKNOWN_INGREDIENT, category: null, canonicalName: null };
  }

  // Surfaced alongside cost so callers (e.g. deterministic grocery
  // categorization) can bucket a priced item without re-implementing this
  // module's ingredient-name matching. Present whenever a price row matched,
  // regardless of whether the unit itself priced successfully.
  const category = priceRow.category ?? null;
  // Surfaced so callers can build shopper-facing display conversions (see
  // shoppingDisplayUnits.js) keyed off the exact resolved canonical row —
  // never off the AI's raw ingredient text, so "lemon" and "lemon juice"
  // (two different canonical rows) can never be conflated.
  const canonicalName = priceRow.name;

  const rowUnit = normalizeDbUnit(priceRow.unit);
  const rawAmountUnit = ingredient?.amountUnit;
  const hasAmountUnitField = rawAmountUnit !== undefined && rawAmountUnit !== null && rawAmountUnit !== '';

  if (hasAmountUnitField) {
    // New structured contract was supplied - it must be fully valid or we
    // refuse rather than guess. This is the "unsupported unit" path: e.g.
    // the model returned "cup"/"tbsp"/"oz", or a unit that doesn't match
    // what this ingredient is actually priced in.
    const rawAmountValue = Number(ingredient?.amountValue);
    const validQuantity = Number.isFinite(rawAmountValue) && rawAmountValue > 0;
    const unitIsSupported = SUPPORTED_UNITS.has(rawAmountUnit);

    // Known-density conversion (see KNOWN_ML_TO_G_DENSITY above) — applies
    // BEFORE the unit-match check so a documented ml->g case (honey) prices
    // as VERIFIED instead of falling into UNSUPPORTED_UNIT.
    const density = rowUnit === 'g' && rawAmountUnit === 'ml' ? KNOWN_ML_TO_G_DENSITY[priceRow.name] : null;
    const amountValue = density ? rawAmountValue * density : rawAmountValue;
    const unitMatchesPriceRow = rowUnit && (rawAmountUnit === rowUnit || density);

    if (!validQuantity || !unitIsSupported || !unitMatchesPriceRow) {
      return { costUSD: UNKNOWN_INGREDIENT_ESTIMATE_USD, source: PRICE_SOURCE.UNSUPPORTED_UNIT, category, canonicalName };
    }

    return { costUSD: _round2(priceRow.price_per_unit * amountValue), source: PRICE_SOURCE.VERIFIED, category, canonicalName };
  }

  // No amountUnit field at all -> pre-existing data saved before this change.
  if (!rowUnit) {
    return { costUSD: UNKNOWN_INGREDIENT_ESTIMATE_USD, source: PRICE_SOURCE.UNSUPPORTED_UNIT, category, canonicalName };
  }
  const legacyQty = _legacyParseQuantity(ingredient?.amount);
  return { costUSD: _round2(priceRow.price_per_unit * legacyQty), source: PRICE_SOURCE.LEGACY_ESTIMATE, category, canonicalName };
}

/**
 * Prices a full ingredient list (one meal, or one grocery list). Never reads
 * an AI-supplied `cost`/`estimatedCost` field on the ingredient - the
 * returned costUSD is always independently computed here.
 *
 * Alongside the existing `allVerified` boolean (which collapses to false the
 * moment ANY ingredient is non-VERIFIED, regardless of dollar size — a $0.02
 * spice and a $0.50-masking-a-$9.59-venison-steak read identically), this
 * also returns the DOLLAR split: `datasetPricedCostUSD` (from VERIFIED/
 * LEGACY_ESTIMATE rows — a real matched price) vs `unknownEstimatedCostUSD`
 * (from UNKNOWN_INGREDIENT/UNSUPPORTED_UNIT — the flat $0.50-per-occurrence
 * guess), plus `unknownIngredientCount`. This is what lets a caller tell
 * "one cheap unverified spice" apart from "an expensive protein silently
 * priced at $0.50" without guessing from cost === 0.50 (see Grocery Units +
 * Unknown Pricing v2 audit, Budget Engine relationship).
 */
function priceIngredients(ingredients, priceRows) {
  const items = Array.isArray(ingredients) ? ingredients : [];
  let totalUSD = 0;
  let datasetPricedCostUSD = 0;
  let unknownEstimatedCostUSD = 0;
  let unknownIngredientCount = 0;
  let allVerified = items.length > 0;
  const priced = items.map(ing => {
    const { costUSD, source, category, canonicalName } = priceIngredient(ing, priceRows);
    totalUSD += costUSD;
    if (source === PRICE_SOURCE.UNKNOWN_INGREDIENT || source === PRICE_SOURCE.UNSUPPORTED_UNIT) {
      unknownEstimatedCostUSD += costUSD;
      unknownIngredientCount += 1;
    } else {
      datasetPricedCostUSD += costUSD;
    }
    if (source !== PRICE_SOURCE.VERIFIED) allVerified = false;
    return { ...ing, costUSD, priceSource: source, category, canonicalName };
  });
  return {
    totalUSD: _round2(totalUSD),
    datasetPricedCostUSD: _round2(datasetPricedCostUSD),
    unknownEstimatedCostUSD: _round2(unknownEstimatedCostUSD),
    unknownIngredientCount,
    allVerified,
    items: priced,
  };
}

module.exports = {
  priceIngredient,
  priceIngredients,
  normalizeDbUnit,
  PRICE_SOURCE,
  SUPPORTED_UNITS,
  UNKNOWN_INGREDIENT_ESTIMATE_USD,
  KNOWN_ML_TO_G_DENSITY,
};
