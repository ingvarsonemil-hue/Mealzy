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
const shoppingDisplay = require('./shoppingDisplayUnits');
const budgetEngine = require('./budgetEngine');
const canonicalIngredients = require('./canonicalIngredients');
const canonicalPurchaseData = require('./canonicalPurchaseData');

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
  const { costUSD, source, category, canonicalName } = pricing.priceIngredient(row, priceRows);
  const finalCostUSD = source === pricing.PRICE_SOURCE.VERIFIED
    ? costUSD
    : Math.round(costUSD * row.occurrenceCount * 100) / 100;
  return { costUSD: finalCostUSD, source, category, canonicalName };
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
 * "500g", "300ml" for the raw g/ml fallback. Not fancy pluralized English
 * (the per-occurrence AI-written amounts are gone once merged), just an
 * honest reflection of the numeric total actually priced. Used only when no
 * shopper-facing conversion applies (see formatShoppingAmount below) — the
 * bare-number count case ("4") was replaced by formatCountDisplay, which
 * needs the ingredient name this function doesn't have. */
function formatGroceryAmountDisplay(amountValue, amountUnit) {
  const rounded = Math.round(amountValue * 100) / 100;
  return `${rounded}${amountUnit}`;
}

/**
 * Chooses the SHOPPING DISPLAY string for one aggregated row — a third,
 * display-only representation, separate from the recipe/pricing quantity
 * (amountValue/amountUnit, unchanged, still what costUSD was computed from;
 * see shoppingDisplayUnits.js file header for why these must never merge).
 *
 * Resolution order:
 *   1. A registered produce conversion (garlic/onion/lemon/lime, grams only)
 *      -> "1/2 onion", "2 cloves garlic".
 *   2. A count-unit item -> "3 eggs" (name-aware, unlike a bare number).
 *   3. Fallback: the raw "120g" / "300ml" display.
 * `canonicalName` is the exact resolved price-row name (null for an
 * unknown ingredient with no matched row) — never the AI's raw ingredient
 * text, so this can never confuse "lemon" with "lemon juice".
 */
function formatShoppingAmount({ name, amountValue, amountUnit, canonicalName }) {
  const produceDisplay = shoppingDisplay.getProduceShoppingDisplay(canonicalName, amountValue, amountUnit);
  if (produceDisplay) return produceDisplay;
  if (amountUnit === 'count') return shoppingDisplay.formatCountDisplay(name, amountValue);
  return formatGroceryAmountDisplay(amountValue, amountUnit);
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
  let unknownEstimatedCostUSD = 0;
  let unknownIngredientCount = 0;
  for (const row of aggregated) {
    const { costUSD, source, category, canonicalName } = priceAggregatedRow(row, priceRows);
    recomputedTotal += costUSD;
    if (source === pricing.PRICE_SOURCE.UNKNOWN_INGREDIENT || source === pricing.PRICE_SOURCE.UNSUPPORTED_UNIT) {
      unknownEstimatedCostUSD += costUSD;
      unknownIngredientCount += 1;
    }
    seq += 1;
    categories[groceryBucketFor(category)].push({
      id: `g_${String(seq).padStart(3, '0')}`,
      name: row.name,
      amount: formatShoppingAmount({ name: row.name, amountValue: row.amountValue, amountUnit: row.amountUnit, canonicalName }),
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

  const roundedTotal = Math.round(recomputedTotal * 100) / 100;
  // Budget certification — see budgetEngine.classifyBudgetStatus for why
  // this is a hard 0-unknown threshold rather than a dollar/percentage one.
  // Never itself a retry trigger; purely a truthful status alongside the
  // existing totalCost <= budgetAmount number, which is unaffected. Only
  // meaningful for the enforceable currency (USD) that Budget Engine v1
  // actually validates against — see budgetEngine.isBudgetEnforceable.
  const budgetStatus = budgetEngine.isBudgetEnforceable(currency)
    ? budgetEngine.classifyBudgetStatus({ withinBudget: roundedTotal <= Number(budget), unknownIngredientCount })
    : budgetEngine.BUDGET_STATUS.NOT_ENFORCED;

  return {
    weekStart: weekStart || '',
    totalCost: roundedTotal,
    // Same rationale as pricing.js priceIngredients: lets a caller tell "a
    // little unverified pantry spend" apart from "a lot of unverified spend
    // that could be masking an expensive unknown ingredient" instead of
    // relying on a single all-or-nothing verified/estimated flag.
    unknownEstimatedCostUSD: Math.round(unknownEstimatedCostUSD * 100) / 100,
    unknownIngredientCount,
    budgetStatus,
    budgetAmount: budget,
    currency,
    categories,
  };
}

// ── PHASE 2 — Purchasable Grocery Economics ────────────────────────────────
// Everything above is the LEGACY consumed-quantity path (recipe grams x
// per-gram price), unchanged — it still drives the grocery UI and the per-day
// repair loop. Below is the NEW authoritative weekly PURCHASE economics:
//   recipe quantities -> canonical ids -> aggregate the WHOLE WEEK's
//   requiredQuantity (base unit) -> package assumption -> purchaseQuantity =
//   ceil(required / packageQuantity) * packageQuantity -> purchaseCostCents =
//   packageCount * packagePriceCents (integer cents) -> certification.
// MANDATORY: aggregate BEFORE package rounding — 300 g + 350 g rice = 650 g
// = ONE 907 g bag, never two. Aliases of one canonical id merge; distinct
// canonical ids never merge. Nothing here guesses an identity or a price: an
// unresolved ingredient, or one with no certification-grade profile, is
// reported uncovered and blocks certification rather than being defaulted.

const PURCHASE_PRICING_STATUS = Object.freeze({
  COVERED: 'covered',                         // resolved canonical id + certification-grade profile + compatible unit + valid quantity
  UNRESOLVED_INGREDIENT: 'unresolved_ingredient', // name did not resolve to a canonical identity
  MISSING_PROFILE: 'missing_profile',         // resolved, but no curated purchase profile exists
  UNCERTIFIED_PRICING: 'uncertified_pricing', // profile exists but its confidence is not certification-grade (e.g. amortized spice rate)
  UNIT_MISMATCH: 'unit_mismatch',             // recipe unit differs from the canonical base unit (no conversion is attempted)
  INVALID_QUANTITY: 'invalid_quantity',       // one or more occurrences had a non-finite / negative amount
});

const _COVERED = PURCHASE_PRICING_STATUS.COVERED;

/**
 * Flattens every meal's ingredients across the WHOLE input (a full week in
 * practice) and aggregates them by canonical identity into one requirement
 * row per distinct ingredient. Pure and synchronous.
 *
 * Row shape:
 *   { canonicalIngredientId | null, displayName, requiredQuantity,
 *     requiredUnit | null, occurrenceCount,
 *     flags: { unresolved, unitMismatch, invalidQuantity, negativeQuantity } }
 *
 * requiredQuantity is the SUM of every occurrence's amount, each occurrence
 * first clamped at 0 (a negative amount can never reduce the requirement —
 * it only raises the invalidQuantity flag). No unit conversion is ever done:
 * an occurrence whose unit isn't the canonical base unit is excluded from the
 * sum and raises unitMismatch.
 */
function aggregateWeeklyRequirements(meals) {
  const byKey = new Map();
  const order = [];

  for (const meal of Array.isArray(meals) ? meals : []) {
    for (const ing of meal?.ingredients || []) {
      const rawName = ing?.name;
      const resolution = canonicalIngredients.resolveIngredient(rawName);
      const resolved = resolution.resolved ? resolution.ingredient : null;
      const key = resolved ? `id::${resolved.id}` : `unresolved::${resolution.normalized ?? ''}`;
      if (!resolved && !resolution.normalized) continue; // not a usable name at all

      if (!byKey.has(key)) {
        byKey.set(key, {
          canonicalIngredientId: resolved ? resolved.id : null,
          displayName: resolved ? resolved.canonicalName : resolution.normalized,
          requiredQuantity: 0,
          requiredUnit: resolved ? resolved.baseUnit : null,
          occurrenceCount: 0,
          flags: { unresolved: !resolved, unitMismatch: false, invalidQuantity: false, negativeQuantity: false },
        });
        order.push(key);
      }
      const row = byKey.get(key);
      row.occurrenceCount += 1;

      const rawUnit = ing?.amountUnit;
      const rawValue = Number(ing?.amountValue);

      if (resolved && rawUnit !== resolved.baseUnit) {
        row.flags.unitMismatch = true;
        continue; // excluded from the sum — no conversion
      }
      if (!Number.isFinite(rawValue)) {
        row.flags.invalidQuantity = true;
        continue;
      }
      if (rawValue < 0) {
        row.flags.negativeQuantity = true;
        row.flags.invalidQuantity = true;
        continue; // clamped to 0 contribution
      }
      row.requiredQuantity += rawValue;
      if (row.requiredUnit === null && !resolved) row.requiredUnit = rawUnit || null;
    }
  }

  return order.map(k => byKey.get(k));
}

/**
 * Turns one aggregated requirement row into a purchase row: resolves the
 * package profile, rounds the week's requirement UP to whole packages, and
 * prices it in integer cents.
 *
 * purchaseCostCents is null (not 0) whenever no trustworthy package price
 * applies — 0 would be indistinguishable from "genuinely free".
 */
function computeRowPurchase(requirementRow) {
  const base = {
    canonicalIngredientId: requirementRow.canonicalIngredientId,
    name: requirementRow.displayName,
    requiredQuantity: Math.round(requirementRow.requiredQuantity * 1000) / 1000,
    requiredUnit: requirementRow.requiredUnit,
    occurrenceCount: requirementRow.occurrenceCount,
    packageType: null,
    packageQuantity: null,
    packageUnit: null,
    packageCount: null,
    purchaseQuantity: null,
    purchaseUnit: null,
    packagePriceCents: null,
    purchaseCostCents: null,
    confidence: null,
  };

  if (requirementRow.flags.unresolved) {
    return { ...base, pricingStatus: PURCHASE_PRICING_STATUS.UNRESOLVED_INGREDIENT };
  }
  if (requirementRow.flags.unitMismatch) {
    return { ...base, pricingStatus: PURCHASE_PRICING_STATUS.UNIT_MISMATCH };
  }
  if (requirementRow.flags.invalidQuantity) {
    return { ...base, pricingStatus: PURCHASE_PRICING_STATUS.INVALID_QUANTITY };
  }

  const profile = canonicalPurchaseData.getPurchaseProfile(requirementRow.canonicalIngredientId);
  if (!profile) {
    return { ...base, pricingStatus: PURCHASE_PRICING_STATUS.MISSING_PROFILE };
  }

  const required = Math.max(0, requirementRow.requiredQuantity);
  const packageCount = required <= 0 ? 0 : Math.ceil(required / profile.packageQuantity);
  const purchaseQuantity = packageCount * profile.packageQuantity;
  const purchaseCostCents = packageCount * profile.packagePriceCents;

  const withProfile = {
    ...base,
    packageType: profile.packageType,
    packageQuantity: profile.packageQuantity,
    packageUnit: profile.packageUnit,
    packageCount,
    purchaseQuantity,
    purchaseUnit: profile.packageUnit,
    packagePriceCents: profile.packagePriceCents,
    purchaseCostCents,
    confidence: profile.confidence,
  };

  // A legitimately-zero requirement (every occurrence was zero) is still not
  // something we can certify — treat it as an invalid quantity.
  if (required <= 0) {
    return { ...withProfile, purchaseCostCents: null, purchaseQuantity: null, packageCount: null, pricingStatus: PURCHASE_PRICING_STATUS.INVALID_QUANTITY };
  }

  const certifiable = canonicalPurchaseData.isCertifiableProfile(profile);
  return { ...withProfile, pricingStatus: certifiable ? PURCHASE_PRICING_STATUS.COVERED : PURCHASE_PRICING_STATUS.UNCERTIFIED_PRICING };
}

/**
 * The whole weekly purchase pipeline: aggregate -> package-round -> price ->
 * certify. Deterministic and pure. Returns a plain object suitable for
 * persisting inside a plan blob (see server.js) so a historical plan's
 * purchase economics stay stable even if the assumptions are later revised.
 *
 * @param {Array} meals    [{ ingredients: [{ name, amountValue, amountUnit }] }, ...] — the whole week
 * @param {Object} opts
 * @param {number} opts.budgetCents  weekly budget in integer cents
 * @param {string} opts.currency     ISO currency; only USD is enforced/certified
 */
function buildWeeklyPurchasePlan(meals, { budgetCents, currency } = {}) {
  const enforceable = budgetEngine.isBudgetEnforceable(currency);
  const requirementRows = aggregateWeeklyRequirements(meals);
  const rows = requirementRows.map(computeRowPurchase);

  // coveredPurchaseCostCents — sum over trustworthy COVERED rows; the provable
  //   minimum the week costs. weeklyPurchaseCostCents — best-effort total
  //   (observability only, never certified). certifiedEstimatedPurchaseCostCents
  //   — the authoritative complete estimate, null unless every ingredient has
  //   certifiable pricing, so a partial subtotal can never masquerade as it.
  let coveredPurchaseCostCents = 0;
  let weeklyPurchaseCostCents = 0;
  const uncovered = [];

  for (const row of rows) {
    if (row.pricingStatus === _COVERED) {
      coveredPurchaseCostCents += row.purchaseCostCents;
      weeklyPurchaseCostCents += row.purchaseCostCents;
    } else {
      if (Number.isInteger(row.purchaseCostCents)) weeklyPurchaseCostCents += row.purchaseCostCents;
      uncovered.push({ name: row.name, canonicalIngredientId: row.canonicalIngredientId, reason: row.pricingStatus });
    }
  }

  const allCovered = uncovered.length === 0 && rows.length > 0;
  const budgetCentsInt = Number.isFinite(Number(budgetCents)) ? Math.round(Number(budgetCents)) : 0;
  // Proven from the covered subtotal alone — the uncovered remainder can only
  // ADD cost, so covered > budget means the week is genuinely over budget
  // regardless of coverage completeness.
  const withinBudget = coveredPurchaseCostCents <= budgetCentsInt;
  const certifiedEstimatedPurchaseCostCents = allCovered ? coveredPurchaseCostCents : null;

  const purchaseBudgetStatus = budgetEngine.classifyPurchaseBudgetStatus({ enforceable, allCovered, withinBudget });

  return {
    currency: currency || 'USD',
    enforceable,
    budgetCents: budgetCentsInt,
    rows,
    coveredPurchaseCostCents,
    certifiedEstimatedPurchaseCostCents,
    weeklyPurchaseCostCents,
    coveredIngredientCount: rows.length - uncovered.length,
    uncoveredIngredientCount: uncovered.length,
    uncovered,
    allCovered,
    withinBudget,
    purchaseBudgetStatus,
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
  formatShoppingAmount,
  buildGroceryList,
  GROCERY_CATEGORY_KEYS,
  PURCHASE_PRICING_STATUS,
  aggregateWeeklyRequirements,
  computeRowPurchase,
  buildWeeklyPurchasePlan,
};
