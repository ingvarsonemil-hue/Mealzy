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

function _findPriceRow(name, priceRows) {
  const norm = String(name || '').toLowerCase().trim();
  if (!norm || !Array.isArray(priceRows)) return null;
  return priceRows.find(p => p.name === norm)
    || priceRows.find(p => norm.includes(p.name) || p.name.includes(norm))
    || null;
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
    return { costUSD: UNKNOWN_INGREDIENT_ESTIMATE_USD, source: PRICE_SOURCE.UNKNOWN_INGREDIENT, category: null };
  }

  // Surfaced alongside cost so callers (e.g. deterministic grocery
  // categorization) can bucket a priced item without re-implementing this
  // module's ingredient-name matching. Present whenever a price row matched,
  // regardless of whether the unit itself priced successfully.
  const category = priceRow.category ?? null;

  const rowUnit = normalizeDbUnit(priceRow.unit);
  const rawAmountUnit = ingredient?.amountUnit;
  const hasAmountUnitField = rawAmountUnit !== undefined && rawAmountUnit !== null && rawAmountUnit !== '';

  if (hasAmountUnitField) {
    // New structured contract was supplied - it must be fully valid or we
    // refuse rather than guess. This is the "unsupported unit" path: e.g.
    // the model returned "cup"/"tbsp"/"oz", or a unit that doesn't match
    // what this ingredient is actually priced in.
    const amountValue = Number(ingredient?.amountValue);
    const validQuantity = Number.isFinite(amountValue) && amountValue > 0;
    const unitIsSupported = SUPPORTED_UNITS.has(rawAmountUnit);
    const unitMatchesPriceRow = rowUnit && rawAmountUnit === rowUnit;

    if (!validQuantity || !unitIsSupported || !unitMatchesPriceRow) {
      return { costUSD: UNKNOWN_INGREDIENT_ESTIMATE_USD, source: PRICE_SOURCE.UNSUPPORTED_UNIT, category };
    }

    return { costUSD: _round2(priceRow.price_per_unit * amountValue), source: PRICE_SOURCE.VERIFIED, category };
  }

  // No amountUnit field at all -> pre-existing data saved before this change.
  if (!rowUnit) {
    return { costUSD: UNKNOWN_INGREDIENT_ESTIMATE_USD, source: PRICE_SOURCE.UNSUPPORTED_UNIT, category };
  }
  const legacyQty = _legacyParseQuantity(ingredient?.amount);
  return { costUSD: _round2(priceRow.price_per_unit * legacyQty), source: PRICE_SOURCE.LEGACY_ESTIMATE, category };
}

/**
 * Prices a full ingredient list (one meal, or one grocery list). Never reads
 * an AI-supplied `cost`/`estimatedCost` field on the ingredient - the
 * returned costUSD is always independently computed here.
 */
function priceIngredients(ingredients, priceRows) {
  const items = Array.isArray(ingredients) ? ingredients : [];
  let totalUSD = 0;
  let allVerified = items.length > 0;
  const priced = items.map(ing => {
    const { costUSD, source, category } = priceIngredient(ing, priceRows);
    totalUSD += costUSD;
    if (source !== PRICE_SOURCE.VERIFIED) allVerified = false;
    return { ...ing, costUSD, priceSource: source, category };
  });
  return { totalUSD: _round2(totalUSD), allVerified, items: priced };
}

module.exports = {
  priceIngredient,
  priceIngredients,
  normalizeDbUnit,
  PRICE_SOURCE,
  SUPPORTED_UNITS,
  UNKNOWN_INGREDIENT_ESTIMATE_USD,
};
