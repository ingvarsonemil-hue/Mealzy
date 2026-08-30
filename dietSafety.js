'use strict';

/**
 * Deterministic Dietary / Allergen Safety Engine — Phase 3E-B2.
 *
 * Answers, for a normalised restriction set and a structured meal / week:
 * is every active supported hard restriction deterministically SATISFIED,
 * VIOLATED, or UNRESOLVED — and are there any restrictions Mealzy cannot
 * support at all?
 *
 * ── AUTHORITY MODEL ──────────────────────────────────────────────────────
 *   raw restriction strings
 *     → dietRestrictionContract.normalizeRestrictions   (finite supported set)
 *   raw generated ingredient name
 *     → canonicalIngredients.resolveIngredient          (SOLE identity authority)
 *     → canonical id
 *     → dietAttributeData.getSafetyRecord               (tri-state facts)
 *     → per-restriction verdict
 *     → meal verdict → week verdict
 *
 *   - The LLM is NEVER a dietary/allergen authority. A model-supplied
 *     `canonicalIngredientId` on an ingredient row is IGNORED for identity —
 *     only the strict resolver's answer for the NAME is used. An unresolved
 *     name is never rescued by a proposed id.
 *   - Raw ingredient-name regex / substring matching is NEVER used. The word
 *     "chicken" in a free-text name has no authority; only a canonical
 *     resolution does.
 *   - No fuzzy matching anywhere (the resolver already forbids it).
 *
 * ── CORE INVARIANT ───────────────────────────────────────────────────────
 *   UNRESOLVED must never become SAFE. A week is `certified: true` ONLY when
 *   every restriction normalises to a supported hard rule, every ingredient
 *   resolves canonically, every relevant safety property is known, and no
 *   diet or allergen violation exists in any meal. Anything else →
 *   `certified: false`. No partial certification.
 *
 * ── NOT WIRED IN ─────────────────────────────────────────────────────────
 * B2 is substrate only. This module is not imported by server.js or
 * certificationGate.js and changes no runtime behaviour. It does not log or
 * persist anything.
 */

const canonicalIngredients = require('./canonicalIngredients');
const dietAttributeData = require('./dietAttributeData');
const dietRestrictionContract = require('./dietRestrictionContract');

const { PROPERTY_VALUE } = dietAttributeData;

const STATUS = Object.freeze({
  SAFE: 'safe',
  VIOLATION: 'violation',
  UNRESOLVED: 'unresolved',
  UNSUPPORTED_RESTRICTION: 'unsupported_restriction',
});

const FAILURE_TYPE = Object.freeze({
  DIET_VIOLATION: 'diet_violation',
  DIET_UNRESOLVED: 'diet_unresolved',
  ALLERGEN_VIOLATION: 'allergen_violation',
  ALLERGEN_UNRESOLVED: 'allergen_unresolved',
  UNRESOLVED_INGREDIENT: 'unresolved_ingredient',
  UNSUPPORTED_RESTRICTION: 'unsupported_restriction',
});

// Which single safety-record property is authoritative for each supported diet,
// and the value of that property that constitutes a violation. Anything
// 'unresolved' on that property → UNRESOLVED (never SAFE).
const DIET_AUTHORITY = Object.freeze({
  vegetarian: { property: 'animalSlaughter' },
  vegan: { property: 'animalDerived' },
  'gluten-free': { property: 'glutenGrain' },
  'dairy-free': { property: 'dairyMilk' },
});

// Supported allergen id → authoritative safety-record property.
const ALLERGEN_AUTHORITY = Object.freeze({
  gluten: { property: 'gluten' },
  milk: { property: 'dairyMilk' },
  egg: { property: 'egg' },
  peanut: { property: 'peanut' },
  tree_nut: { property: 'treeNut' },
  soy: { property: 'soy' },
  fish: { property: 'fish' },
  crustacean_shellfish: { property: 'crustaceanShellfish' },
  sesame: { property: 'sesame' },
});

// ── Single ingredient × single restriction ───────────────────────────────

function _verdictFromProperty(value) {
  if (value === PROPERTY_VALUE.PRESENT) return STATUS.VIOLATION;
  if (value === PROPERTY_VALUE.ABSENT) return STATUS.SAFE;
  return STATUS.UNRESOLVED; // 'unresolved' or anything unexpected
}

/**
 * Assess one already-resolved canonical id against one restriction.
 * @param {string} canonicalId
 * @param {{kind:'diet'|'allergen', id:string}} restriction
 * @returns {{status:string, property:string|null}}
 */
function assessCanonicalAgainstRestriction(canonicalId, restriction) {
  const record = dietAttributeData.getSafetyRecord(canonicalId);
  if (!record) {
    // A resolved canonical id always has a record (dietAttributeData load
    // validation guarantees it). Defensive: treat as unresolved, never safe.
    return { status: STATUS.UNRESOLVED, property: null };
  }
  const authority = restriction.kind === 'diet'
    ? DIET_AUTHORITY[restriction.id]
    : ALLERGEN_AUTHORITY[restriction.id];
  if (!authority) return { status: STATUS.UNRESOLVED, property: null };

  return { status: _verdictFromProperty(record[authority.property]), property: authority.property };
}

// ── Meal ─────────────────────────────────────────────────────────────────

function _activeRestrictions(normalized) {
  const list = [];
  for (const id of normalized.activeDietIds) list.push({ kind: 'diet', id });
  for (const id of normalized.activeAllergenIds) list.push({ kind: 'allergen', id });
  return list;
}

function _worstStatus(current, next) {
  // Precedence: VIOLATION > UNRESOLVED > SAFE
  if (current === STATUS.VIOLATION || next === STATUS.VIOLATION) return STATUS.VIOLATION;
  if (current === STATUS.UNRESOLVED || next === STATUS.UNRESOLVED) return STATUS.UNRESOLVED;
  return STATUS.SAFE;
}

/**
 * Assess one meal against a normalised restriction set.
 *
 * @param {{ingredients?:Array<{name:*}>}} meal
 * @param {object} normalized  output of dietRestrictionContract.normalizeRestrictions
 * @returns frozen meal assessment (see shape inline). Never throws for bad input.
 */
function assessMeal(meal, normalized) {
  const m = meal && typeof meal === 'object' ? meal : {};
  const rawIngredients = Array.isArray(m.ingredients) ? m.ingredients : [];
  const restrictions = _activeRestrictions(normalized);

  const ingredients = [];
  const failures = [];
  let status = STATUS.SAFE;

  rawIngredients.forEach((raw, ingredientIndex) => {
    const name = raw && typeof raw === 'object' ? raw.name : raw;
    const resolution = canonicalIngredients.resolveIngredient(name);
    const canonicalId = resolution.resolved ? resolution.ingredient.id : null;

    const findings = [];

    if (!resolution.resolved) {
      // Identity-authority failure. EVERY ingredient must resolve through the
      // strict canonical resolver before the substrate can certify anything —
      // this holds even with zero active restrictions. It is UNRESOLVED, never
      // SAFE and never VIOLATION (there is no evidence of a specific
      // violation). A model-proposed canonical id on this row is deliberately
      // ignored — it can never establish identity.
      status = _worstStatus(status, STATUS.UNRESOLVED);
      failures.push({
        type: FAILURE_TYPE.UNRESOLVED_INGREDIENT,
        ingredientIndex,
        ingredientName: typeof name === 'string' ? name : null,
        canonicalIngredientId: null,
      });
      ingredients.push(Object.freeze({
        ingredientIndex,
        ingredientName: typeof name === 'string' ? name : null,
        canonicalIngredientId: null,
        resolved: false,
        findings: Object.freeze([]),
      }));
      return;
    }

    for (const restriction of restrictions) {
      const v = assessCanonicalAgainstRestriction(canonicalId, restriction);
      if (v.status === STATUS.SAFE) continue;

      status = _worstStatus(status, v.status);
      const isDiet = restriction.kind === 'diet';
      const failureType = v.status === STATUS.VIOLATION
        ? (isDiet ? FAILURE_TYPE.DIET_VIOLATION : FAILURE_TYPE.ALLERGEN_VIOLATION)
        : (isDiet ? FAILURE_TYPE.DIET_UNRESOLVED : FAILURE_TYPE.ALLERGEN_UNRESOLVED);

      const finding = {
        restrictionKind: restriction.kind,
        restrictionId: restriction.id,
        property: v.property,
        status: v.status,
      };
      findings.push(finding);
      failures.push({
        type: failureType,
        restrictionKind: restriction.kind,
        restrictionId: restriction.id,
        property: v.property,
        status: v.status,
        ingredientIndex,
        ingredientName: typeof name === 'string' ? name : null,
        canonicalIngredientId: canonicalId,
      });
    }

    ingredients.push(Object.freeze({
      ingredientIndex,
      ingredientName: typeof name === 'string' ? name : null,
      canonicalIngredientId: canonicalId,
      resolved: true,
      findings: Object.freeze(findings.map((f) => Object.freeze(f))),
    }));
  });

  // A meal "passes" only when nothing is violated or unresolved AND there are
  // no unsupported restrictions in scope. Unsupported restrictions are a
  // set-level fact; they are surfaced at the week level but also block a meal
  // pass so `passed` alone is never misread as certified.
  const passed = status === STATUS.SAFE && !normalized.hasUnsupported;

  return Object.freeze({
    status,                       // SAFE | VIOLATION | UNRESOLVED (restriction-scoped)
    passed,
    ingredients: Object.freeze(ingredients),
    failures: Object.freeze(failures.map((f) => Object.freeze(f))),
  });
}

// ── Week ─────────────────────────────────────────────────────────────────

function _extractDays(week) {
  const w = week && typeof week === 'object' ? week : {};
  if (Array.isArray(w.days)) return w.days.filter((d) => d && typeof d === 'object');
  if (Array.isArray(w.meals)) return [{ meals: w.meals }];
  return [];
}

/**
 * Assess a structured week against a Mealzy restriction set.
 *
 * @param {{days?:Array<{meals:Array}>, meals?:Array}} week
 * @param {{diets?:Array, allergens?:Array} | object} restrictions
 *   Either a raw Mealzy restriction set ({ diets, allergens }) or an
 *   already-normalised object (detected by the presence of `activeDietIds`).
 * @returns frozen week assessment.
 */
function assessWeek(week, restrictions) {
  const normalized = restrictions && Array.isArray(restrictions.activeDietIds)
    ? restrictions
    : dietRestrictionContract.normalizeRestrictions(restrictions || {});

  const days = _extractDays(week);
  const failures = [];

  // Unsupported restrictions — one failure each, before anything else. These
  // alone make the week uncertifiable regardless of ingredient safety.
  for (const u of normalized.unsupported) {
    failures.push(Object.freeze({
      type: FAILURE_TYPE.UNSUPPORTED_RESTRICTION,
      restrictionKind: u.channel === 'allergens' ? 'allergen' : 'diet',
      raw: u.raw,
      reason: u.reason,
      ...(u.id ? { recognisedAs: u.id } : {}),
    }));
  }

  const assessedMeals = [];
  let allMealsPassed = true;
  let anyViolation = false;
  let anyUnresolved = false;

  days.forEach((day, dayIndex) => {
    const meals = Array.isArray(day.meals) ? day.meals : [];
    meals.forEach((meal, mealIndex) => {
      const mealResult = assessMeal(meal, normalized);
      assessedMeals.push(Object.freeze({ dayIndex, mealIndex, ...mealResult }));

      if (mealResult.status === STATUS.VIOLATION) anyViolation = true;
      if (mealResult.status === STATUS.UNRESOLVED) anyUnresolved = true;
      if (mealResult.status !== STATUS.SAFE) allMealsPassed = false;

      for (const f of mealResult.failures) {
        failures.push(Object.freeze({ ...f, dayIndex, mealIndex }));
      }
    });
  });

  const hasMeals = assessedMeals.length > 0;

  // certified === true ONLY when: no unsupported restrictions, at least one
  // meal was assessed, every meal is SAFE (⇒ every ingredient resolved and
  // every relevant property known and no violation). Empty week → not
  // certified (nothing was proven).
  const certified =
    !normalized.hasUnsupported &&
    hasMeals &&
    allMealsPassed &&
    !anyViolation &&
    !anyUnresolved;

  let overallStatus;
  if (normalized.hasUnsupported) overallStatus = STATUS.UNSUPPORTED_RESTRICTION;
  else if (anyViolation) overallStatus = STATUS.VIOLATION;
  else if (anyUnresolved || !hasMeals) overallStatus = STATUS.UNRESOLVED;
  else overallStatus = STATUS.SAFE;

  return Object.freeze({
    certified,
    status: overallStatus,
    activeDietIds: normalized.activeDietIds,
    activeAllergenIds: normalized.activeAllergenIds,
    unsupportedRestrictions: normalized.unsupported,
    unsupportedRestrictionCount: normalized.unsupported.length,
    hasUnsupportedRestrictions: normalized.hasUnsupported,
    mealCount: assessedMeals.length,
    allMealsPassed: hasMeals && allMealsPassed,
    anyViolation,
    anyUnresolved,
    meals: Object.freeze(assessedMeals),
    failures: Object.freeze(failures),
  });
}

module.exports = {
  STATUS,
  FAILURE_TYPE,
  DIET_AUTHORITY,
  ALLERGEN_AUTHORITY,
  assessCanonicalAgainstRestriction,
  assessMeal,
  assessWeek,
};
