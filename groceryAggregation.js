'use strict';

/**
 * Budget Engine v2 — deterministic grocery-ingredient aggregation.
 *
 * Pure functions only: no AI calls, no DB, no network. Turns the meal
 * ingredients Mealzy already generated and priced into grocery rows,
 * instead of asking a second Anthropic call to invent a new ingredient list
 * from meal names (see server.js generateGroceryListForMeals). This is the
 * single source of truth for grocery-item identity — pricing.js is reused
 * as-is for the actual cost lookup.
 *
 * Identity is deliberately conservative: two ingredient occurrences only
 * merge when both their normalized name AND their unit match exactly.
 * "chicken" and "chicken breast" never merge just because they're related —
 * false merging silently changes what the user is told to buy, which is
 * worse than a duplicate grocery row. No fuzzy matching, no unit
 * conversion (kg/L never appear in freshly-generated data — the meal
 * generation prompt already forces every ingredient's amountUnit to g/ml/
 * count — so there is nothing to convert here; see pricing.js).
 */

const pricing = require('./pricing');

function normalizeIngredientName(name) {
  return String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** True when an ingredient carries the modern structured contract (a
 * present amountUnit field) — mirrors pricing.js's own hasAmountUnitField
 * check exactly, so "is this ingredient eligible for deterministic
 * aggregation" and "will pricing.js treat it as modern data" never diverge.
 * Does NOT require the unit to be g/ml/count — an unsupported unit is still
 * "structured", just priced conservatively by pricing.js (see
 * priceAggregatedRow below). */
function isStructuredIngredient(ingredient) {
  const unit = ingredient?.amountUnit;
  return unit !== undefined && unit !== null && unit !== '';
}

/** Gate for the whole deterministic path: every ingredient across every
 * supplied meal must be structured, and there must be at least one
 * ingredient. A single legacy-format meal (pre-dating amountValue/
 * amountUnit) sends the WHOLE request to the legacy AI-generation fallback
 * — partial mixing of deterministic and AI-invented items would reintroduce
 * exactly the inconsistency this module exists to remove. */
function mealsAreFullyStructured(meals) {
  let sawAny = false;
  for (const meal of Array.isArray(meals) ? meals : []) {
    for (const ing of meal?.ingredients || []) {
      sawAny = true;
      if (!isStructuredIngredient(ing)) return false;
    }
  }
  return sawAny;
}

/** Combines matching (normalizedName + amountUnit) occurrences from a flat
 * list of {name, amountValue, amountUnit} ingredients into deterministic
 * rows. Returns one row per distinct (name, unit) pair with amountValue
 * SUMMED and occurrenceCount tracked — occurrenceCount matters because
 * pricing.js's unknown/unsupported-ingredient fallback is a FLAT estimate
 * per line item, not a per-quantity price; see priceAggregatedRow. */
function aggregateIngredientOccurrences(occurrences) {
  const items = Array.isArray(occurrences) ? occurrences : [];
  const byKey = new Map();
  const order = [];

  for (const occ of items) {
    const name = normalizeIngredientName(occ?.name);
    if (!name) continue;
    const unit = occ?.amountUnit;
    const key = `${name}::${unit}`;
    const amountValue = Number(occ?.amountValue);
    const validAmount = Number.isFinite(amountValue) && amountValue > 0;

    if (!byKey.has(key)) {
      byKey.set(key, {
        name,
        amountUnit: unit,
        amountValue: validAmount ? amountValue : 0,
        occurrenceCount: 1,
      });
      order.push(key);
    } else {
      const row = byKey.get(key);
      row.occurrenceCount += 1;
      if (validAmount) row.amountValue += amountValue;
    }
  }

  return order.map(k => byKey.get(k));
}

/** Flattens every meal's ingredients into one list, then aggregates it.
 * `meals` is [{ ingredients: [...] }, ...] — in practice this is always the
 * meals from a single day (see server.js's call sites), but nothing here
 * assumes that; it aggregates whatever ingredient occurrences it's given. */
function aggregateMealIngredients(meals) {
  const all = [];
  for (const meal of Array.isArray(meals) ? meals : []) {
    for (const ing of meal?.ingredients || []) all.push(ing);
  }
  return aggregateIngredientOccurrences(all);
}

/**
 * Prices one aggregated row via pricing.js — the SAME shared pricing path
 * meal-plan costs and Budget Engine use, never a second pricing
 * implementation.
 *
 * The critical safety rule: pricing.js's VERIFIED path is linear in
 * quantity, so pricing the merged amountValue once gives an identical total
 * to summing each occurrence's price individually — safe to merge. But its
 * unknown/unsupported-unit/legacy fallbacks are a FLAT per-occurrence
 * estimate, not a function of quantity. Pricing a merged row with
 * occurrenceCount=3 exactly once at that flat rate would understate the
 * authoritative cost by 3x — three separately-unpriceable ingredients must
 * not become cheaper just because they share a name. So non-VERIFIED
 * results are multiplied by occurrenceCount here before being returned.
 *
 * KNOWN, BOUNDED ROUNDING NOTE: pricing.js rounds every price to the cent
 * at the moment it's computed (_round2), which was already true before this
 * module existed. Because this module reprices a MERGED quantity once
 * instead of summing several already-cent-rounded per-occurrence prices,
 * the deterministic grocery total can differ from the itemized meal-cost
 * total by roughly ±1 cent per aggregated row — e.g. three 33g occurrences
 * at $0.011/g round individually to $0.36 x 3 = $1.08, but 99g merged rounds
 * to $1.09. This is standard cent-rounding-of-a-sum-vs-sum-of-roundings
 * drift, not an ingredient-consistency bug (verified empirically: it never
 * exceeds ~1 cent per row and is not biased toward understating cost). Not
 * "fixed" here because doing so would mean changing pricing.js's per-item
 * rounding strategy, which is out of scope for this module (see file
 * header — this module reuses pricing.js as-is, it does not modify it).
 */
function priceAggregatedRow(row, priceRows) {
  const { costUSD, source, category } = pricing.priceIngredient(row, priceRows);
  const finalCostUSD = source === pricing.PRICE_SOURCE.VERIFIED
    ? costUSD
    : Math.round(costUSD * row.occurrenceCount * 100) / 100;
  return { costUSD: finalCostUSD, source, category };
}

const GROCERY_CATEGORY_KEYS = ['produce', 'protein', 'dairy', 'grains', 'pantry', 'frozen', 'beverages', 'other'];

// ingredient_prices.category only ever holds a handful of values (see
// db.getIngredientPrices) — a small closed map, not a general taxonomy.
// Anything unmapped (including "no price row matched at all") lands in
// 'other' rather than guessing.
const DB_CATEGORY_TO_GROCERY_BUCKET = { meat: 'protein', protein: 'protein', dairy: 'dairy', produce: 'produce', pantry: 'pantry' };
function groceryBucketFor(dbCategory) {
  return DB_CATEGORY_TO_GROCERY_BUCKET[dbCategory] || 'other';
}

/** Deterministic display string for an aggregated row's merged quantity —
 * "500g", "300ml", "4" for count. Not fancy pluralized English (the
 * per-occurrence AI-written amounts are gone once merged), just an honest
 * reflection of the numeric total actually priced. */
function formatGroceryAmountDisplay(amountValue, amountUnit) {
  const rounded = Math.round(amountValue * 100) / 100;
  return amountUnit === 'count' ? String(rounded) : `${rounded}${amountUnit}`;
}

/**
 * Assembles a full grocery-list response object from a set of meals and an
 * already-fetched priceRows array — pure aside from that one input, so it's
 * directly unit-testable without a DB. This is the entire deterministic
 * pipeline: flatten -> aggregate -> price (occurrence-safe) -> categorize ->
 * format, in the exact output shape the grocery-list frontend already
 * expects ({weekStart, totalCost, budgetAmount, currency, categories}).
 */
function buildGroceryList(meals, priceRows, { weekStart, budget, currency, day } = {}) {
  const aggregated = aggregateMealIngredients(meals);

  const categories = {};
  for (const key of GROCERY_CATEGORY_KEYS) categories[key] = [];

  let seq = 0;
  let recomputedTotal = 0;
  for (const row of aggregated) {
    const { costUSD, source, category } = priceAggregatedRow(row, priceRows);
    recomputedTotal += costUSD;
    seq += 1;
    categories[groceryBucketFor(category)].push({
      id: `g_${String(seq).padStart(3, '0')}`,
      name: row.name,
      amount: formatGroceryAmountDisplay(row.amountValue, row.amountUnit),
      amountValue: row.amountValue,
      amountUnit: row.amountUnit,
      cost: costUSD,
      estimatedCost: costUSD,
      actualCost: null,
      priceSource: source,
      checked: false,
      day: day || 'Unspecified',
    });
  }

  return {
    weekStart: weekStart || '',
    totalCost: Math.round(recomputedTotal * 100) / 100,
    budgetAmount: budget,
    currency,
    categories,
  };
}

module.exports = {
  normalizeIngredientName,
  isStructuredIngredient,
  mealsAreFullyStructured,
  aggregateIngredientOccurrences,
  aggregateMealIngredients,
  priceAggregatedRow,
  groceryBucketFor,
  formatGroceryAmountDisplay,
  buildGroceryList,
  GROCERY_CATEGORY_KEYS,
};
