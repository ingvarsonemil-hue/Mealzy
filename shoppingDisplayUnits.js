'use strict';

/**
 * Grocery Units v2 — shopper-facing display conversion.
 *
 * This module NEVER touches pricing. Recipe/pricing quantity (amountValue +
 * amountUnit, always grams/milliliters/count — see pricing.js) is the only
 * thing costUSD is ever computed from. This module only produces a THIRD,
 * separate representation: what a human actually buys at the store, e.g.
 * "120g onion" (recipe/pricing quantity) -> "1 onion" (shopping display).
 * Callers must keep amountValue/amountUnit/costUSD exactly as pricing.js
 * computed them; only the display STRING shown to the shopper changes.
 *
 * Keyed by the exact canonical `ingredient_prices` row name the ingredient
 * resolved to (pricing.js's `canonicalName`), never by the AI's raw
 * ingredient text — this is what keeps "lemon" (whole fruit, this registry
 * applies) cleanly separate from "lemon juice" (a different canonical row,
 * not in this registry, stays in ml). No fuzzy matching.
 *
 * avgUnitGrams is a documented, explicit, testable approximation — not a
 * precise conversion. It answers "roughly how many of these would a shopper
 * buy for this many grams," not "exactly how much does one weigh."
 */

const SHOPPING_UNIT_REGISTRY = {
  garlic: {
    singular: 'clove garlic',
    plural: 'cloves garlic',
    avgUnitGrams: 5,       // one garlic clove averages ~5g
    gridStep: 1,           // whole cloves only — nobody buys 1/4 of a clove
    minDisplay: 1,
  },
  onion: {
    singular: 'onion',
    plural: 'onions',
    avgUnitGrams: 110,     // one medium yellow onion averages ~110g
    gridStep: 0.25,        // quarters
    minDisplay: 0.25,
  },
  lemon: {
    singular: 'lemon',
    plural: 'lemons',
    avgUnitGrams: 58,      // matches ingredientPriceData.js's own lemon note (~100g note revised: ~58g edible/typical whole fruit)
    gridStep: 0.5,         // halves
    minDisplay: 0.5,
  },
  lime: {
    singular: 'lime',
    plural: 'limes',
    avgUnitGrams: 67,      // matches ingredientPriceData.js's own lime note (~80g each)
    gridStep: 0.5,
    minDisplay: 0.5,
  },
};

function _gcd(a, b) {
  return b === 0 ? a : _gcd(b, a % b);
}

/** Formats a positive decimal count as a human shopping fraction/whole
 * number string ("1/4", "1/2", "3/4", "1", "1 1/2", "2"), rounded to the
 * nearest `gridStep` — never raw decimals like "0.73". */
function _formatFractionCount(rawCount, gridStep, minDisplay) {
  const clamped = Math.max(minDisplay, rawCount);
  const rounded = Math.round(clamped / gridStep) * gridStep;
  const denominator = Math.round(1 / gridStep);
  if (denominator <= 1) return String(Math.round(rounded));

  const totalNumerator = Math.round(rounded * denominator);
  const whole = Math.floor(totalNumerator / denominator);
  const fracNumerator = totalNumerator % denominator;
  if (fracNumerator === 0) return String(whole);

  const divisor = _gcd(fracNumerator, denominator);
  const num = fracNumerator / divisor;
  const den = denominator / divisor;
  return whole > 0 ? `${whole} ${num}/${den}` : `${num}/${den}`;
}

/**
 * Returns a shopper-facing display string for a produce item whose PRICING
 * quantity is grams (e.g. "1/2 onion"), or null when this ingredient/unit
 * combination isn't in the registry — callers must fall back to the
 * existing raw g/ml/count display in that case.
 *
 * `canonicalName` must be the exact canonical price-row name the ingredient
 * resolved to (pricing.js `canonicalName`); `amountUnit` must be 'g' — a
 * whole-fruit/vegetable count conversion from milliliters is never valid
 * (that would mean the ingredient was mismeasured as a liquid, a separate,
 * already-flagged UNSUPPORTED_UNIT problem — see pricing.js).
 */
function getProduceShoppingDisplay(canonicalName, amountValue, amountUnit) {
  if (amountUnit !== 'g') return null;
  const entry = SHOPPING_UNIT_REGISTRY[canonicalName];
  if (!entry) return null;
  const amount = Number(amountValue);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const rawCount = amount / entry.avgUnitGrams;
  const countStr = _formatFractionCount(rawCount, entry.gridStep, entry.minDisplay);
  const isPluralWhole = /^\d+$/.test(countStr) && Number(countStr) !== 1;
  const label = isPluralWhole ? entry.plural : entry.singular;
  return `${countStr} ${label}`;
}

/** Shopper-facing display for a count-unit item, e.g. "3 eggs", "1 egg" —
 * the existing bare-number display ("3") never told the shopper WHAT they
 * were counting. Simple regular-plural heuristic — adequate for the
 * count-unit ingredients Mealzy actually generates (eggs, tortillas,
 * bananas, bell peppers), all of which the prompt tends to name in the
 * plural ("eggs"); not a general English pluralizer/singularizer. A name
 * that's already singular for count===1 (e.g. "egg") is left as-is. */
function formatCountDisplay(name, amountValue) {
  const rounded = Math.round(amountValue * 100) / 100;
  const cleanName = String(name || '').trim();
  if (!cleanName) return String(rounded);
  const endsWithS = /s$/i.test(cleanName) && !/ss$/i.test(cleanName);

  if (rounded === 1) {
    const singular = endsWithS ? cleanName.slice(0, -1) : cleanName;
    return `1 ${singular}`;
  }
  const plural = endsWithS ? cleanName : (/[xz]$|[cs]h$/i.test(cleanName) ? `${cleanName}es` : `${cleanName}s`);
  return `${rounded} ${plural}`;
}

module.exports = {
  SHOPPING_UNIT_REGISTRY,
  getProduceShoppingDisplay,
  formatCountDisplay,
};
