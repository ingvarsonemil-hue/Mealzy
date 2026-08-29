'use strict';

/**
 * Certification Assessment — Phase 3E0-D. DETERMINISTIC, READ-ONLY.
 *
 * Answers: "Given this structured proposed ingredient / meal / week, what can
 * Mealzy authoritatively certify right now, and exactly why not the rest?"
 *
 * ASSESSMENT, NOT ENFORCEMENT — nothing here is wired into generation
 * acceptance (server.js), the repair loop, or persistence. Importing this
 * module changes no behaviour elsewhere.
 *
 * Every authoritative decision is DELEGATED, never re-implemented:
 *   identity   -> canonicalIngredients.resolveIngredient        (frozen Phase 1)
 *   nutrition  -> nutritionEngine.calculate*                     (frozen Phase 3D)
 *   purchase   -> groceryAggregation.buildWeeklyPurchasePlan +
 *                 canonicalPurchaseData                          (frozen Phase 2)
 *   consumption-> pricing.priceIngredient(s)                     (DIAGNOSTIC ONLY)
 *
 * Frozen decisions this layer encodes (3E0-C):
 *   - The LLM proposes only. A caller `canonicalIngredientId` is a HINT,
 *     accepted only when it exists AND agrees with the resolver's answer for
 *     `name`. An unresolved name is NEVER rescued by a proposed id.
 *   - Consumption-level recipe cost does NOT certify the grocery-budget
 *     promise; the authoritative number is Phase 2's weekly package total.
 *   - No silent omission: a failed ingredient makes its whole meal
 *     non-nutrition-authoritative; partial totals are diagnostic only.
 *
 * SCOPE: certifies DETERMINISTIC INGREDIENT / NUTRITION / PURCHASE / BUDGET
 * only. It excludes dietary-safety (allergy / diet rules — that lives in
 * server.js and cannot be composed here without expanding scope), so
 * `certified: true` is necessary-but-not-sufficient for full candidate
 * validity; the caller still runs dietary safety separately.
 *
 * NO NORMALIZATION LAYER. 3E0-C's future normalizeGeneratedIngredientName() is
 * NOT implemented — the frozen exact resolver is the sole identity authority.
 * Coverage stays low for free-form output by design: we measure the boundary,
 * not weaken it. tests/certificationAssessment.test.js carries a read-only
 * normalization-candidate report drawn from B1/B2 examples.
 */

const canonicalIngredients = require('./canonicalIngredients');
const nutritionEngine = require('./nutritionEngine');
const groceryAggregation = require('./groceryAggregation');
const canonicalPurchaseData = require('./canonicalPurchaseData');
const pricing = require('./pricing');
const { PRICES } = require('./ingredientPriceData');
const {
  CANONICAL_STATUS, QUANTITY_STATUS, NUTRITION_STATUS, PURCHASE_STATUS,
  PRICING_STATUS, FAILURE, CERTIFICATION_VERSION,
} = require('./certificationStatus');

const SUPPORTED_UNITS = new Set(['g', 'ml', 'count']);

// ── Ingredient assessment ───────────────────────────────────────────────────

/**
 * Assess one structured ingredient proposal.
 *
 * @param {{name:*, amountValue:*, amountUnit:*, canonicalIngredientId?:*, preparation?:*}} input
 *   `preparation` is optional, presentation-only, and never touched by any
 *   certification dimension — only echoed back on `.input.preparation`.
 * @returns frozen result — see inline shape. Never throws for bad input.
 */
function assessIngredient(input) {
  const src = input && typeof input === 'object' ? input : {};
  const name = src.name;
  const amountValue = src.amountValue;
  const amountUnit = src.amountUnit;
  const proposedId = src.canonicalIngredientId;
  const hasProposedId = proposedId !== undefined && proposedId !== null;
  // preparation: presentation-only. Preserved verbatim, NEVER parsed,
  // normalized, resolved, or consulted by any certification dimension.
  const preparation = src.preparation !== undefined ? src.preparation : null;

  const failures = [];

  // 1. IDENTITY — frozen exact resolver is the sole authority.
  const resolution = canonicalIngredients.resolveIngredient(name);
  const resolvedId = resolution.resolved ? resolution.ingredient.id : null;

  let canonicalStatus;
  let effectiveId = null; // the id certification is allowed to trust (null unless fully agreed)

  if (!resolution.resolved) {
    canonicalStatus = CANONICAL_STATUS.UNRESOLVED;
    failures.push(FAILURE.UNRESOLVED_CANONICAL_INGREDIENT);
    // A proposed id can NEVER rescue an unresolved name. If one was supplied
    // and is itself malformed/nonexistent, that is also worth surfacing.
    if (hasProposedId && !_isKnownCanonicalId(proposedId)) {
      failures.push(FAILURE.INVALID_PROPOSED_CANONICAL_ID);
    }
  } else if (hasProposedId && !_isKnownCanonicalId(proposedId)) {
    canonicalStatus = CANONICAL_STATUS.INVALID_PROPOSED_ID;
    failures.push(FAILURE.INVALID_PROPOSED_CANONICAL_ID);
  } else if (hasProposedId && proposedId !== resolvedId) {
    canonicalStatus = CANONICAL_STATUS.PROPOSED_ID_MISMATCH;
    failures.push(FAILURE.PROPOSED_CANONICAL_ID_MISMATCH);
  } else {
    canonicalStatus = CANONICAL_STATUS.RESOLVED;
    effectiveId = resolvedId;
  }

  const canonical = effectiveId ? canonicalIngredients.getById(effectiveId) : null;

  // 2. QUANTITY / UNIT — structural; checked against the canonical base unit
  //    when we have an identity, otherwise reported as not_assessed.
  let quantityStatus;
  const nQty = Number(amountValue);
  const qtyFinitePositive = Number.isFinite(nQty) && nQty > 0;
  if (!qtyFinitePositive) {
    quantityStatus = QUANTITY_STATUS.INVALID_QUANTITY;
    failures.push(FAILURE.INVALID_QUANTITY);
  } else if (!canonical) {
    quantityStatus = QUANTITY_STATUS.NOT_ASSESSED;
  } else if (!SUPPORTED_UNITS.has(amountUnit) || amountUnit !== canonical.baseUnit) {
    quantityStatus = QUANTITY_STATUS.INCOMPATIBLE_UNIT;
    failures.push(FAILURE.INCOMPATIBLE_UNIT);
  } else {
    quantityStatus = QUANTITY_STATUS.OK;
  }

  // 3. NUTRITION — delegate wholly to nutritionEngine (frozen Phase 3D).
  let nutritionStatus = NUTRITION_STATUS.NOT_ASSESSED;
  let nutrition = null;
  if (effectiveId) {
    const nut = nutritionEngine.calculateIngredientNutrition({
      canonicalIngredientId: effectiveId, amountValue, amountUnit,
    });
    nutrition = {
      status: nut.status,
      kcal: nut.kcal, proteinG: nut.proteinG, carbsG: nut.carbsG, fatG: nut.fatG,
      authoritative: nut.authoritative,
    };
    switch (nut.status) {
      case nutritionEngine.STATUS.COVERED:
        nutritionStatus = NUTRITION_STATUS.COVERED;
        break;
      case nutritionEngine.STATUS.MISSING_NUTRITION_RECORD:
        nutritionStatus = NUTRITION_STATUS.MISSING_RECORD;
        failures.push(FAILURE.MISSING_NUTRITION_RECORD);
        break;
      case nutritionEngine.STATUS.INELIGIBLE_RECORD:
        nutritionStatus = NUTRITION_STATUS.INELIGIBLE_RECORD;
        failures.push(FAILURE.INELIGIBLE_NUTRITION_RECORD);
        break;
      default:
        // unit/quantity/id engine errors: already captured above; not covered.
        nutritionStatus = NUTRITION_STATUS.NOT_ASSESSED;
    }
  }

  // 4. PURCHASE — profile existence + certification-grade confidence.
  //    (The package MATH — rounding, cross-day reuse — is week-level; here we
  //    only check the ingredient CAN feed it. Phase 2 owns the arithmetic.)
  let purchaseStatus = PURCHASE_STATUS.NOT_ASSESSED;
  if (effectiveId) {
    const profile = canonicalPurchaseData.getPurchaseProfile(effectiveId);
    if (!profile) {
      purchaseStatus = PURCHASE_STATUS.MISSING_PROFILE;
      failures.push(FAILURE.MISSING_PURCHASE_PROFILE);
    } else if (!canonicalPurchaseData.isCertifiableProfile(profile)) {
      purchaseStatus = PURCHASE_STATUS.NOT_CERTIFIABLE;
      failures.push(FAILURE.PURCHASE_NOT_CERTIFIABLE);
    } else {
      purchaseStatus = PURCHASE_STATUS.COVERED;
    }
  }

  // 5. CONSUMPTION PRICING — DIAGNOSTIC ONLY, never a failure, never certifies.
  let pricingStatus = PRICING_STATUS.NOT_ASSESSED;
  let consumptionCostUSD = null;
  {
    const priced = pricing.priceIngredient({ name, amountValue, amountUnit }, PRICES);
    pricingStatus = priced.source;
    consumptionCostUSD = priced.costUSD;
  }

  const certified =
    canonicalStatus === CANONICAL_STATUS.RESOLVED &&
    quantityStatus === QUANTITY_STATUS.OK &&
    nutritionStatus === NUTRITION_STATUS.COVERED &&
    purchaseStatus === PURCHASE_STATUS.COVERED;

  return Object.freeze({
    input: Object.freeze({ name: name ?? null, amountValue: amountValue ?? null, amountUnit: amountUnit ?? null,
      proposedCanonicalIngredientId: hasProposedId ? proposedId : null, preparation }),
    canonicalIngredientId: effectiveId,          // authoritative id, or null when not trustable
    resolverCanonicalIngredientId: resolvedId,   // what the frozen resolver returned, for transparency
    canonicalStatus,
    quantityStatus,
    nutritionStatus,
    purchaseStatus,
    pricingStatus,                               // diagnostic
    consumptionCostUSD,                          // diagnostic
    nutrition: nutrition ? Object.freeze(nutrition) : null,
    failures: Object.freeze([...new Set(failures)]),
    certified,
  });
}

function _isKnownCanonicalId(id) {
  return typeof id === 'string' && id.length > 0 && canonicalIngredients.getById(id) !== null;
}

// ── Meal assessment ─────────────────────────────────────────────────────────

/**
 * Assess one meal: { type?, name?, ingredients: [ {name, amountValue, amountUnit, canonicalIngredientId?} ] }.
 * Nutrition rule is EXACTLY Phase 3D's: the meal is nutrition-authoritative
 * only when every ingredient row is covered. No row is ever silently dropped —
 * an unusable ingredient is passed to nutritionEngine as an unknown id so the
 * meal correctly reports INCOMPLETE.
 *
 * Does not mutate `meal`.
 */
function assessMeal(meal) {
  const m = meal && typeof meal === 'object' ? meal : {};
  const rawIngredients = Array.isArray(m.ingredients) ? m.ingredients : [];

  const structureOk = Array.isArray(m.ingredients) && rawIngredients.length > 0
    && rawIngredients.every((i) => i && typeof i === 'object');

  const ingredients = rawIngredients.map(assessIngredient);

  // Feed nutritionEngine one row per ingredient — unresolved / mismatched /
  // invalid-id ingredients go in with a sentinel id so the meal is correctly
  // INCOMPLETE rather than quietly computed over a subset.
  const nutritionRows = rawIngredients.map((raw, idx) => {
    const a = ingredients[idx];
    return {
      canonicalIngredientId: a.canonicalStatus === CANONICAL_STATUS.RESOLVED ? a.canonicalIngredientId : '__uncertified__',
      amountValue: raw && raw.amountValue,
      amountUnit: raw && raw.amountUnit,
    };
  });
  const mealNutrition = nutritionEngine.calculateMealNutrition(nutritionRows);

  const canonicalCoverage = ingredients.length > 0
    && ingredients.every((a) => a.canonicalStatus === CANONICAL_STATUS.RESOLVED);
  const purchaseCoverage = ingredients.length > 0
    && ingredients.every((a) => a.purchaseStatus === PURCHASE_STATUS.COVERED);

  // Diagnostic consumption pricing for the whole meal (NOT budget authority).
  const consumption = pricing.priceIngredients(
    rawIngredients.map((i) => ({ name: i && i.name, amountValue: i && i.amountValue, amountUnit: i && i.amountUnit })),
    PRICES,
  );

  const failures = _flattenFailures(ingredients);
  if (!structureOk) failures.unshift(FAILURE.STRUCTURE_INVALID);

  const certified = structureOk && canonicalCoverage && mealNutrition.authoritative && purchaseCoverage;

  return Object.freeze({
    type: m.type ?? null,
    name: m.name ?? null,
    structureStatus: structureOk ? 'ok' : 'invalid',
    canonicalCoverage: canonicalCoverage ? 'covered' : 'incomplete',
    purchaseCoverage: purchaseCoverage ? 'covered' : 'incomplete',
    nutrition: Object.freeze({
      status: mealNutrition.status,                 // 'covered' | 'nutrition_incomplete'
      authoritative: mealNutrition.authoritative,
      totals: mealNutrition.totals ? Object.freeze({ ...mealNutrition.totals }) : null,
      diagnosticCoveredTotals: Object.freeze({ ...mealNutrition.coveredTotals }), // Phase 3D diagnostic semantics
    }),
    diagnosticConsumptionPricing: Object.freeze({
      totalUSD: consumption.totalUSD,
      datasetPricedCostUSD: consumption.datasetPricedCostUSD,
      unknownEstimatedCostUSD: consumption.unknownEstimatedCostUSD,
      unknownIngredientCount: consumption.unknownIngredientCount,
    }),
    ingredients: Object.freeze(ingredients),
    failures: Object.freeze([...new Set(failures)]),
    certified,
  });
}

// Flatten `.failures` arrays off a list of assessed children.
const _flattenFailures = (list) => list.flatMap((x) => [...x.failures]);

// ── Week assessment ─────────────────────────────────────────────────────────

/**
 * Assess a synthetic structured week.
 * @param {{days?:Array<{meals:Array}>, meals?:Array, requestedBudgetCents:number, currency?:string}} week
 *        `days` (preferred, mirrors server.js) or a flat `meals` list.
 * Authoritative weekly purchase economics are delegated wholly to
 * buildWeeklyPurchasePlan (no re-derivation of rounding / reuse / cents here).
 * Consumption cost is diagnostic only, NOT the budget authority.
 * Does not mutate `week`. `certified: true` == every deterministic dimension
 * of THIS layer (identity + quantity + nutrition + purchase coverage +
 * authoritative package budget); it is not server enforcement and excludes
 * dietary-safety (see header).
 */
function assessWeek(week) {
  const w = week && typeof week === 'object' ? week : {};
  const days = _extractDays(w);
  const flatMeals = days.flatMap((d) => (Array.isArray(d.meals) ? d.meals : []));
  const requestedBudgetCents = Number.isFinite(Number(w.requestedBudgetCents))
    ? Math.round(Number(w.requestedBudgetCents)) : null;
  const currency = w.currency || 'USD';

  const structureOk = days.length > 0
    && days.every((d) => Array.isArray(d.meals) && d.meals.length > 0);

  const assessedDays = days.map((d) => {
    const meals = (Array.isArray(d.meals) ? d.meals : []).map(assessMeal);
    const dayNutrition = _sumMealTotals(meals);
    return {
      meals,
      nutritionAuthoritative: meals.length > 0 && meals.every((mm) => mm.nutrition.authoritative),
      nutritionTotals: dayNutrition.authoritative ? dayNutrition.totals : null,
      diagnosticCoveredTotals: dayNutrition.covered,
    };
  });

  const allMeals = assessedDays.flatMap((d) => d.meals);
  const canonicalCoverage = allMeals.length > 0
    && allMeals.every((mm) => mm.canonicalCoverage === 'covered');
  const nutritionCoverage = allMeals.length > 0
    && allMeals.every((mm) => mm.nutrition.authoritative);

  // AUTHORITATIVE purchase economics — Phase 2 engine, unchanged.
  const purchasePlan = groceryAggregation.buildWeeklyPurchasePlan(
    flatMeals.map((m) => ({ ingredients: Array.isArray(m && m.ingredients) ? m.ingredients : [] })),
    { budgetCents: requestedBudgetCents == null ? 0 : requestedBudgetCents, currency },
  );

  // Weekly nutrition totals — authoritative only when every meal is covered.
  const weekNutrition = _sumMealTotals(allMeals);

  // Diagnostic consumption cost for the whole week (NOT budget authority).
  const weekConsumption = pricing.priceIngredients(
    flatMeals.flatMap((m) => (Array.isArray(m && m.ingredients) ? m.ingredients : [])
      .map((i) => ({ name: i && i.name, amountValue: i && i.amountValue, amountUnit: i && i.amountUnit }))),
    PRICES,
  );

  const purchaseCoverageComplete = purchasePlan.allCovered === true;
  const withinAuthoritativeBudget = purchasePlan.withinBudget === true;
  const budgetEnforceable = purchasePlan.enforceable === true;

  const failures = _flattenFailures(allMeals);
  if (!structureOk) failures.unshift(FAILURE.STRUCTURE_INVALID);

  const certified =
    structureOk &&
    canonicalCoverage &&
    nutritionCoverage &&
    budgetEnforceable &&
    purchaseCoverageComplete &&
    withinAuthoritativeBudget &&
    requestedBudgetCents != null;

  return Object.freeze({
    structureStatus: structureOk ? 'ok' : 'invalid',
    dayCount: days.length,
    mealCount: allMeals.length,
    requestedBudgetCents,
    currency,

    canonicalCoverage: canonicalCoverage ? 'covered' : 'incomplete',
    nutritionCoverage: nutritionCoverage ? 'complete' : 'incomplete',

    nutrition: Object.freeze({
      authoritative: weekNutrition.authoritative,
      weeklyTotals: weekNutrition.authoritative ? Object.freeze({ ...weekNutrition.totals }) : null,
      diagnosticCoveredTotals: Object.freeze({ ...weekNutrition.covered }),
    }),

    purchase: Object.freeze({
      status: purchasePlan.purchaseBudgetStatus,                     // Phase 2's own classification
      allCovered: purchasePlan.allCovered,
      withinBudget: purchasePlan.withinBudget,
      enforceable: purchasePlan.enforceable,
      weeklyPurchaseCostCents: purchasePlan.weeklyPurchaseCostCents,  // best-effort, observability
      coveredPurchaseCostCents: purchasePlan.coveredPurchaseCostCents,
      certifiedEstimatedPurchaseCostCents: purchasePlan.certifiedEstimatedPurchaseCostCents, // authoritative complete estimate, or null
      uncovered: Object.freeze(purchasePlan.uncovered.map((u) => Object.freeze({ ...u }))),
      plan: purchasePlan,                                            // whole Phase 2 object, for snapshotting
    }),

    diagnosticConsumptionPricing: Object.freeze({
      totalUSD: weekConsumption.totalUSD,
      unknownEstimatedCostUSD: weekConsumption.unknownEstimatedCostUSD,
      unknownIngredientCount: weekConsumption.unknownIngredientCount,
      note: 'consumption-level estimate — NOT the grocery-budget authority (see certificationAssessment header)',
    }),

    days: Object.freeze(assessedDays.map((d) => Object.freeze({
      ...d,
      meals: Object.freeze(d.meals),
      nutritionTotals: d.nutritionTotals ? Object.freeze({ ...d.nutritionTotals }) : null,
      diagnosticCoveredTotals: Object.freeze({ ...d.diagnosticCoveredTotals }),
    }))),

    failures: Object.freeze([...new Set(failures)]),
    certified,
  });
}

function _extractDays(w) {
  if (Array.isArray(w.days)) return w.days.filter((d) => d && typeof d === 'object');
  if (Array.isArray(w.meals)) return [{ meals: w.meals }];
  return [];
}

const _zeroTotals = () => ({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });

function _sumMealTotals(assessedMeals) {
  const covered = _zeroTotals();
  let allAuthoritative = assessedMeals.length > 0;
  for (const mm of assessedMeals) {
    const t = mm.nutrition.totals || mm.nutrition.diagnosticCoveredTotals;
    if (mm.nutrition.authoritative && mm.nutrition.totals) {
      covered.kcal += t.kcal; covered.proteinG += t.proteinG;
      covered.carbsG += t.carbsG; covered.fatG += t.fatG;
    } else {
      allAuthoritative = false;
      const d = mm.nutrition.diagnosticCoveredTotals;
      covered.kcal += d.kcal; covered.proteinG += d.proteinG;
      covered.carbsG += d.carbsG; covered.fatG += d.fatG;
    }
  }
  return { authoritative: allAuthoritative, totals: allAuthoritative ? covered : null, covered };
}

// ── Certified snapshot (SHAPE ONLY — not wired to persistence) ───────────────

/**
 * Build the minimal snapshot object for a CERTIFIED week. Returns null if the
 * week assessment is not certified (an uncertified week can never yield a
 * certified snapshot).
 *
 * Package economics are WEEKLY — the snapshot stores the whole Phase 2
 * purchase plan and the single authoritative weekly total. It deliberately
 * does NOT invent per-meal package-cost attribution.
 *
 * @param {object} weekAssessment  result of assessWeek()
 * @param {object} [opts]
 * @param {function} [opts.now]  () => ISO string, injectable for deterministic tests
 */
function buildCertifiedSnapshot(weekAssessment, opts = {}) {
  if (!weekAssessment || weekAssessment.certified !== true) return null;
  const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();

  return Object.freeze({
    certificationVersion: CERTIFICATION_VERSION,
    certifiedAt: now(),
    requestedBudgetCents: weekAssessment.requestedBudgetCents,
    currency: weekAssessment.currency,

    days: Object.freeze(weekAssessment.days.map((d) => Object.freeze({
      nutritionTotals: d.nutritionTotals ? Object.freeze({ ...d.nutritionTotals }) : null,
      meals: Object.freeze(d.meals.map((mm) => Object.freeze({
        type: mm.type,
        name: mm.name,
        nutrition: mm.nutrition.totals ? Object.freeze({ ...mm.nutrition.totals }) : null,
        ingredients: Object.freeze(mm.ingredients.map((a) => Object.freeze({
          canonicalIngredientId: a.canonicalIngredientId,
          displayName: a.input.name,
          amountValue: a.input.amountValue,
          amountUnit: a.input.amountUnit,
          preparation: a.input.preparation,   // presentation-only, preserved verbatim
        }))),
      }))),
    }))),

    weekNutrition: weekAssessment.nutrition.weeklyTotals
      ? Object.freeze({ ...weekAssessment.nutrition.weeklyTotals }) : null,

    weeklyPurchasePlan: weekAssessment.purchase.plan,
    authoritativeWeeklyPurchaseCostCents: weekAssessment.purchase.certifiedEstimatedPurchaseCostCents,

    certification: Object.freeze({
      certified: true,
      scope: 'deterministic_ingredient_nutrition_purchase_budget',
      excludes: Object.freeze(['dietary_safety']),
    }),
  });
}

module.exports = {
  CERTIFICATION_VERSION,
  CANONICAL_STATUS,
  QUANTITY_STATUS,
  NUTRITION_STATUS,
  PURCHASE_STATUS,
  PRICING_STATUS,
  FAILURE,
  assessIngredient,
  assessMeal,
  assessWeek,
  buildCertifiedSnapshot,
};
