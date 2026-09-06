'use strict';

/**
 * Phase 2 — Purchasable Grocery Economics (authoritative weekly PURCHASE cost).
 *
 * Split out of groceryAggregation.js (F2C-impl structural correction) so each
 * file stays a single concern and under the 500-line limit. This module owns
 * ONLY the authoritative weekly purchase pipeline:
 *   recipe quantities -> canonical ids -> aggregate the WHOLE WEEK's
 *   requiredQuantity (base unit) -> package assumption -> purchase quantity ->
 *   purchaseCostCents (integer cents) -> certification.
 * MANDATORY: aggregate BEFORE package rounding — 300 g + 350 g rice = 650 g
 * = ONE 907 g bag, never two. Aliases of one canonical id merge; distinct
 * canonical ids never merge. Nothing here guesses an identity or a price: an
 * unresolved ingredient, or one with no certification-grade profile, is
 * reported uncovered and blocks certification rather than being defaulted.
 *
 * The LEGACY consumed-quantity grocery path (buildGroceryList, display
 * helpers, pricing.js) stays in groceryAggregation.js. groceryAggregation.js
 * thin-re-exports this module's API for backwards compatibility.
 */

const budgetEngine = require('./budgetEngine');
const canonicalIngredients = require('./canonicalIngredients');
const canonicalPurchaseData = require('./canonicalPurchaseData');
const { groceryBucketFor } = require('./groceryCategories'); // Phase C: mobile Groceries category

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
 *     requiredUnit | null, rawCategory | null, occurrenceCount,
 *     flags: { unresolved, unitMismatch, invalidQuantity, negativeQuantity } }
 *
 * rawCategory is the resolved canonical ingredient's own `category` field
 * (canonicalIngredients.js's authoritative per-ingredient classification -
 * one of VALID_CATEGORIES, e.g. 'meat'/'produce'/'dairy'/'pantry') - null
 * when unresolved. computeRowPurchase below buckets it through
 * groceryCategories.groceryBucketFor into the grocery-UI taxonomy.
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
          rawCategory: resolved ? resolved.category : null,
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
function computeRowPurchase(requirementRow, getProfile = canonicalPurchaseData.getPurchaseProfile) {
  const base = {
    canonicalIngredientId: requirementRow.canonicalIngredientId,
    name: requirementRow.displayName,
    // Bucketed via the same authoritative mapping groceryAggregation.js
    // uses - never a client-side guess. 'other' for an unresolved
    // ingredient (rawCategory null) or any category outside the closed
    // vocabulary, exactly like groceryBucketFor's existing fallback.
    category: groceryBucketFor(requirementRow.rawCategory),
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

  const profile = getProfile(requirementRow.canonicalIngredientId);
  if (!profile) {
    return { ...base, pricingStatus: PURCHASE_PRICING_STATUS.MISSING_PROFILE };
  }

  const required = Math.max(0, requirementRow.requiredQuantity);

  // variable_weight (F2C-impl): proportional cost, no package rounding. Quantity
  // is normalized to 0.001 base-unit at THIS boundary only (collapses a
  // fractional-sum's float noise deterministically); aggregation + nutrition
  // are untouched.
  if (profile.packageType === 'variable_weight') {
    const requiredMilli = Math.round(required * 1000);
    const vwBase = {
      ...base,
      packageType: 'variable_weight',
      packageUnit: profile.packageUnit,
      rateQuantity: profile.rateQuantity,
      ratePriceCents: profile.ratePriceCents,
      confidence: profile.confidence,
    };
    if (requiredMilli <= 0) {
      return { ...vwBase, pricingStatus: PURCHASE_PRICING_STATUS.INVALID_QUANTITY };
    }
    // round-half-up of (requiredMilli*ratePriceCents)/(rateQuantity*1000) as a
    // pure-integer closed form; fail-closed outside the safe-integer range.
    const denominator = 2 * profile.rateQuantity * 1000;
    const numerator = 2 * requiredMilli * profile.ratePriceCents + profile.rateQuantity * 1000;
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
      return { ...vwBase, pricingStatus: PURCHASE_PRICING_STATUS.INVALID_QUANTITY };
    }
    const purchaseCostCents = Math.floor(numerator / denominator); // may legitimately be 0 for a tiny covered requirement
    const normalizedRequired = requiredMilli / 1000;
    const certifiable = canonicalPurchaseData.isCertifiableProfile(profile);
    return {
      ...vwBase,
      purchaseQuantity: normalizedRequired,
      purchaseUnit: profile.packageUnit,
      purchaseCostCents,
      pricingStatus: certifiable ? PURCHASE_PRICING_STATUS.COVERED : PURCHASE_PRICING_STATUS.UNCERTIFIED_PRICING,
    };
  }

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
 * @param {Function} [opts.getProfile]  profile resolver (id -> profile|null);
 *   defaults to canonicalPurchaseData.getPurchaseProfile. A test seam — it lets
 *   a spec exercise the variable_weight branch against a synthetic profile
 *   without adding a real RAW_PACKAGE_ASSUMPTIONS entry. Production callers
 *   never pass it; behaviour with it omitted is unchanged.
 */
function buildWeeklyPurchasePlan(meals, { budgetCents, currency, getProfile } = {}) {
  const enforceable = budgetEngine.isBudgetEnforceable(currency);
  const requirementRows = aggregateWeeklyRequirements(meals);
  const resolveProfile = getProfile || canonicalPurchaseData.getPurchaseProfile;
  const rows = requirementRows.map((r) => computeRowPurchase(r, resolveProfile));

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
  PURCHASE_PRICING_STATUS,
  aggregateWeeklyRequirements,
  computeRowPurchase,
  buildWeeklyPurchasePlan,
};
