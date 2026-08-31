'use strict';

/**
 * Certification Gate — Phase 3E.
 *
 * Turns the existing deterministic certification assessment into a generation
 * ACCEPT / REPAIR / FAIL gate for WEEK-MODE generation. A generated week is
 * accepted only when certificationAssessment.assessWeek reports
 * `certified: true`. If it does not, the caller may run exactly ONE bounded
 * repair pass (driven by the deterministic failures); still uncertified ->
 * the request fails through the existing failure path.
 *
 * AUTHORITY: this module NEVER re-implements certification. It calls
 * certificationAssessment.assessWeek and reports its verdict verbatim. It only
 * orchestrates the one-shot repair and packages the failures for a prompt.
 *
 * THREE MODES (env CERTIFICATION_GATE; unknown/blank -> 'off', fail safe):
 *   'off'    -> no certification behaviour at all. The caller keeps the
 *               current prompt and current acceptance. This module is not
 *               invoked.
 *   'shadow' -> constrained week prompt + deterministic assessment + telemetry.
 *               ZERO repair calls. NEVER blocks a response.
 *   'on'     -> constrained week prompt + deterministic assessment + at most
 *               ONE repair + HARD failure when still uncertified.
 *
 * ── 'on' IS STRUCTURALLY UNREACHABLE RIGHT NOW ────────────────────────────
 * Deterministic dietary / allergen enforcement does NOT exist yet (diet rules
 * are prompt-only; allergens are a post-hoc string scan in server.js).
 * assessWeek itself excludes dietary safety by design. So HARD_GATE_PRODUCTION_
 * AUTHORIZED is false, and:
 *   - resolveEffectiveMode() downgrades a requested 'on' to EFFECTIVE 'shadow'
 *     (requested mode kept only for diagnostics);
 *   - runCertificationGate() additionally refuses to run any 'on' behaviour
 *     (repair / rejection) unless HARD_GATE_PRODUCTION_AUTHORIZED === true.
 * Neither the code path nor the substrate is removed — 'on' simply cannot
 * execute until that constant flips. Consumers must not represent a passing
 * result as a complete hard-certification pass while `hardGateComplete` is
 * false.
 */

const certificationAssessment = require('./certificationAssessment');
const budgetEngine = require('./budgetEngine');
const { CERTIFICATION_VERSION } = require('./certificationStatus');

// Phase 3E-C1 — the deterministic dietary/allergen substrate (dietSafety /
// dietRestrictionContract / dietAttributeData) is wired SHADOW-ONLY and is
// LAZY-LOADED: it is `require`d only inside runCertificationGate (via
// _loadDietSubstrate — once, for the single normalization boundary — and again
// inside assessGeneratedWeekDietSafetyShadow), which the server invokes only for
// effective mode 'shadow' (incl. downgraded 'on'). With CERTIFICATION_GATE=off
// the server never reaches that path, so the substrate and its load-time
// validation are never pulled into the runtime dependency graph — a malformed
// future dietary-data change cannot stop an off-mode boot.
let _dietSafety = null;
let _dietRestrictionContract = null;
function _loadDietSubstrate() {
  if (_dietSafety === null) {
    _dietSafety = require('./dietSafety');
    _dietRestrictionContract = require('./dietRestrictionContract');
  }
  return { dietSafety: _dietSafety, dietRestrictionContract: _dietRestrictionContract };
}

const GATE_MODE = Object.freeze({ OFF: 'off', SHADOW: 'shadow', ON: 'on' });
const _KNOWN_MODES = new Set(Object.values(GATE_MODE));
const MAX_REPAIR_ROUNDS = 1;

// Explicit safeguard markers. The deterministic dietary/allergen substrate
// does not exist yet, so the gate cannot be the complete Mealzy hard
// certification gate regardless of mode.
const DIETARY_ALLERGEN_SUBSTRATE_PRESENT = false;
const HARD_GATE_PRODUCTION_AUTHORIZED = DIETARY_ALLERGEN_SUBSTRATE_PRESENT;
const GATE_EXCLUDES = Object.freeze(['dietary_safety', 'allergen_safety']);

const GATE_STATUS = Object.freeze({
  CERTIFIED: 'certified',                   // accept (first pass or after repair)
  FAILED: 'failed',                         // mode 'on', still uncertified (incl. unsupported currency)
  SHADOW_UNCERTIFIED: 'shadow_uncertified', // mode 'shadow', would not have certified — never blocks
});

const FAILURE_REASON = Object.freeze({
  UNSUPPORTED_CURRENCY: 'unsupported_currency', // package-budget certification cannot run for this currency
  UNCERTIFIED_AFTER_REPAIR: 'uncertified_after_repair',
  UNCERTIFIED_NO_REPAIR: 'uncertified_no_repair_fn',
  REPAIR_GENERATION_ERROR: 'repair_generation_error',
});

/** Normalise the raw env value to the REQUESTED mode. Only exactly
 * 'off' | 'shadow' | 'on' (case-insensitive, trimmed) are honoured; anything
 * else -> 'off'. This is the requested mode, not necessarily the effective
 * one — see resolveEffectiveMode. */
function resolveGateMode(rawEnvValue) {
  const v = String(rawEnvValue || '').trim().toLowerCase();
  return _KNOWN_MODES.has(v) ? v : GATE_MODE.OFF;
}

/**
 * Resolve the REQUESTED mode to the EFFECTIVE runtime mode.
 *
 * Hard enforcement ('on') is structurally unreachable while
 * HARD_GATE_PRODUCTION_AUTHORIZED is false (the deterministic dietary/allergen
 * substrate does not exist yet). A requested 'on' in that condition is
 * downgraded to 'shadow' — assessment + telemetry, zero repair, never blocks.
 * The requested mode is preserved for diagnostics only.
 *
 * @returns {{requested:string, effective:string, downgraded:boolean, reason:(string|null)}}
 */
function resolveEffectiveMode(requestedMode) {
  const requested = _KNOWN_MODES.has(requestedMode) ? requestedMode : GATE_MODE.OFF;
  if (requested === GATE_MODE.ON && !HARD_GATE_PRODUCTION_AUTHORIZED) {
    return {
      requested,
      effective: GATE_MODE.SHADOW,
      downgraded: true,
      reason: 'hard_gate_not_production_authorized',
    };
  }
  return { requested, effective: requested, downgraded: false, reason: null };
}

/**
 * The unsupported-currency boundary for the NEW authoritative week
 * certification contract. A week whose currency is not enforceable by
 * budgetEngine.isBudgetEnforceable() can never be package-budget-certified, so
 * under effective hard mode it must fail BEFORE any generation call. No FX
 * conversion — this is only a predicate. 'off' legacy behaviour does not use
 * this; 'shadow' is non-blocking and does not use it either.
 */
function isCurrencyCertifiable(currency) {
  return budgetEngine.isBudgetEnforceable(currency) === true;
}

/**
 * Assess a server-shaped week ({ days: [{ meals: [...] }], ... }) and pull out
 * the per-ingredient failures for a repair prompt. Delegates wholly to
 * certificationAssessment.assessWeek.
 */
function assessGeneratedWeek(week) {
  const days = Array.isArray(week && week.days) ? week.days : [];
  const assessment = certificationAssessment.assessWeek({
    days: days.map((d) => ({ meals: Array.isArray(d && d.meals) ? d.meals : [] })),
    requestedBudgetCents: week && week.requestedBudgetCents,
    currency: (week && week.currency) || 'USD',
  });

  const failingIngredients = [];
  assessment.days.forEach((d, dayIndex) => {
    d.meals.forEach((m, mealIndex) => {
      m.ingredients.forEach((ing, ingredientIndex) => {
        if (ing.certified) return;
        failingIngredients.push({
          dayIndex,
          mealIndex,
          ingredientIndex,
          name: ing.input.name,
          amountUnit: ing.input.amountUnit,
          resolverCanonicalIngredientId: ing.resolverCanonicalIngredientId,
          failures: [...ing.failures],
        });
      });
    });
  });

  return {
    certified: assessment.certified === true,
    budgetEnforceable: assessment.purchase.enforceable === true,
    hardGateComplete: DIETARY_ALLERGEN_SUBSTRATE_PRESENT, // false until the dietary/allergen substrate exists
    excludes: GATE_EXCLUDES,
    assessment,
    failingIngredients,
    weekFailures: [...assessment.failures],
    purchase: {
      allCovered: assessment.purchase.allCovered,
      withinBudget: assessment.purchase.withinBudget,
      enforceable: assessment.purchase.enforceable,
      uncovered: assessment.purchase.uncovered.map((u) => ({ ...u })),
    },
  };
}

const _FAILURE_HINT = {
  unresolved_canonical_ingredient: 'not a recognised ingredient — replace it with an allowed ingredient of the same role',
  invalid_proposed_canonical_id: 'ingredient identity could not be confirmed — use a plain allowed ingredient name',
  proposed_canonical_id_mismatch: 'ingredient name and identity disagreed — use a plain allowed ingredient name',
  invalid_quantity: 'amountValue must be a positive number',
  incompatible_unit: 'amountUnit must be the canonical base unit (g, ml, or count) for this ingredient',
  missing_nutrition_record: 'this ingredient cannot be verified — replace it with an allowed ingredient',
  ineligible_nutrition_record: 'this ingredient cannot be verified — replace it with an allowed ingredient',
  missing_purchase_profile: 'this ingredient cannot be priced — replace it with an allowed ingredient',
  purchase_not_certifiable: 'this ingredient cannot be priced with confidence — replace it with an allowed ingredient',
  structure_invalid: 'meal structure is malformed',
};

/**
 * Deterministic, PII-free repair instruction built purely from the assessment
 * failures. Never invents replacement ingredients or authoritative values.
 */
function buildRepairInstruction(gateResult) {
  const lines = gateResult.failingIngredients.slice(0, 60).map((f) => {
    const why = (f.failures.length ? f.failures : ['structure_invalid'])
      .map((code) => _FAILURE_HINT[code] || code)
      .join('; ');
    return `- day ${f.dayIndex + 1}, meal ${f.mealIndex + 1}, ingredient "${f.name}" (${f.amountUnit ?? 'no unit'}): ${why}`;
  });

  const budgetLine = gateResult.purchase.enforceable && gateResult.purchase.allCovered && !gateResult.purchase.withinBudget
    ? '\nThe full weekly grocery package cost is over budget — prefer cheaper allowed ingredients and reuse ingredients already used elsewhere in the week.'
    : '';

  return [
    'The server\'s deterministic verifier rejected the following ingredients from the plan you generated:',
    lines.join('\n'),
    budgetLine,
    '',
    'Return the SAME plan structure with ONLY these failing ingredients changed (fix the name, unit, or amount, or swap an unverifiable ingredient for an allowed one). Keep every meal, every passing ingredient, and every count identical. The ingredient contract still applies in full.',
  ].filter(Boolean).join('\n');
}

function _result(status, extra) {
  return {
    status,
    repaired: false,
    repairAttempts: 0,
    hardGateComplete: DIETARY_ALLERGEN_SUBSTRATE_PRESENT,
    excludes: GATE_EXCLUDES,
    ...extra,
  };
}

/**
 * SHADOW-ONLY deterministic dietary/allergen observation of a generated week.
 *
 * Runs B2 (dietSafety) against the settled week + the user's normalised
 * restriction set and returns a small, privacy-safe summary. This is evidence
 * only: the caller MUST NOT compose `dietSafetyCertified` into acceptance,
 * block persistence, trigger repair, or return a 422 because of it.
 *
 * Privacy: the returned summary is BOTH the analytics payload and the persisted
 * diagnostic, so it contains ONLY aggregate signal — enum statuses, integer
 * counts, enum failure reasons, and the generic canonical INGREDIENT ids that
 * are already inside the certification analytics boundary. It deliberately does
 * NOT include the user's normalised restriction selections
 * (activeDietIds / activeAllergenIds / activePreferenceOnlyIds) or any raw
 * restriction text — those are the user's health/profile choices and already
 * live in the profile; the shadow checkpoint does not need them duplicated.
 *
 * @param {{days:Array}} week
 * @param {{diets?:Array, allergens?:Array} | object} restrictions
 *   Either the raw Mealzy channels ({ diets, allergens }) OR an object already
 *   returned by dietRestrictionContract.normalizeRestrictions (detected by the
 *   presence of `activeDietIds`). When runCertificationGate calls this it passes
 *   the ALREADY-normalised object it built once for the whole gate execution, so
 *   normalizeRestrictions runs exactly once per gate run. Standalone callers may
 *   still pass raw channels.
 */
function assessGeneratedWeekDietSafetyShadow(week, restrictions) {
  const { dietSafety, dietRestrictionContract } = _loadDietSubstrate();

  const days = Array.isArray(week && week.days) ? week.days : [];
  const normalized = restrictions && Array.isArray(restrictions.activeDietIds)
    ? restrictions
    : dietRestrictionContract.normalizeRestrictions(
      restrictions && typeof restrictions === 'object' ? restrictions : {},
    );
  const assessment = dietSafety.assessWeek(
    { days: days.map((d) => ({ meals: Array.isArray(d && d.meals) ? d.meals : [] })) },
    normalized,
  );

  const fails = assessment.failures || [];
  const countType = (t) => fails.filter((f) => f.type === t).length;
  const FT = dietSafety.FAILURE_TYPE;

  return Object.freeze({
    observationalOnly: true, // NEVER an acceptance input in C1
    dietSubstrateVersion: dietRestrictionContract.DIET_SUBSTRATE_VERSION,
    dietSafetyCertified: assessment.certified === true,
    dietSafetyStatus: assessment.status,
    supportedDietCount: assessment.activeDietIds.length,
    supportedAllergenCount: assessment.activeAllergenIds.length,
    preferenceOnlyCount: (assessment.activePreferenceOnlyIds || []).length,
    unsupportedRestrictionCount: assessment.unsupportedRestrictionCount,
    dietViolationCount: countType(FT.DIET_VIOLATION),
    allergenViolationCount: countType(FT.ALLERGEN_VIOLATION),
    unresolvedSafetyCount:
      countType(FT.DIET_UNRESOLVED) + countType(FT.ALLERGEN_UNRESOLVED) + countType(FT.UNRESOLVED_INGREDIENT),
    // canonical INGREDIENT ids only — generic Mealzy vocabulary, same boundary
    // as the existing certification failure logging. NOT the user's selections.
    failingCanonicalIngredientIds: [...new Set(fails.map((f) => f.canonicalIngredientId).filter(Boolean))],
    // enum reason + channel only — NEVER the raw restriction text or its id.
    unsupportedReasons: assessment.unsupportedRestrictions.map((u) => ({ reason: u.reason, channel: u.channel })),
  });
}

/**
 * Run the gate. The caller invokes this ONLY for mode 'shadow' or 'on'
 * (mode 'off' means this module is never touched).
 *
 * @param {object}   opts
 * @param {Array}    opts.days                   server-shaped days ([{ meals:[...] }, ...])
 * @param {number}   opts.requestedBudgetCents
 * @param {string}   opts.currency
 * @param {string}   opts.mode                   GATE_MODE.SHADOW | GATE_MODE.ON
 * @param {Function} [opts.generateRepairedWeek] async (gateResult, instruction) => days
 *                   Passed ONLY for mode 'on'. Never invoked in 'shadow'.
 * @param {Function} [opts.onEvent]              (name, payload) => void — telemetry hook
 * @param {boolean}  [opts.hardGateAuthorized]   INJECTION SEAM, tests only.
 *                   Defaults to HARD_GATE_PRODUCTION_AUTHORIZED. Production
 *                   (server.js) never passes it, so hard enforcement stays
 *                   structurally unreachable until the constant flips. Tests
 *                   pass `true` to exercise the eventual 'on' state machine.
 * @param {Array}    [opts.diets]                 raw diet-channel restriction strings
 * @param {Array}    [opts.allergens]             raw allergy-channel restriction strings
 *                   Phase 3E-C1: used ONLY for the SHADOW dietary/allergen
 *                   observation attached as `result.dietSafety`. Never composed
 *                   into acceptance, never blocks, never repairs, never 422s.
 *
 * @returns Every return carries the Phase 3E-C3A-2 combined shape:
 *   certified            deterministic-only verdict (unchanged meaning)
 *   deterministicStatus  { structure, canonicalCoverage, nutritionCoverage, purchase }
 *   dietSafetyCertified  dietary/allergen sub-verdict (never composed into `certified`)
 *   acceptable           certified && (!authorizedHardDiet || dietSafetyCertified)
 *   hardGateComplete     authorizedHardDiet && acceptable  (false until C4)
 *   status               GATE_STATUS (unchanged vocabulary)
 *   dietSafety           the privacy-safe shadow summary
 */
async function runCertificationGate({
  days,
  requestedBudgetCents,
  currency,
  mode,
  generateRepairedWeek,
  onEvent,
  hardGateAuthorized,
  diets,
  allergens,
} = {}) {
  const emit = typeof onEvent === 'function' ? onEvent : () => {};
  // Defense in depth: hard enforcement is unreachable unless production
  // authorization is granted, regardless of what `mode` the caller passed.
  const authorized = hardGateAuthorized === undefined ? HARD_GATE_PRODUCTION_AUTHORIZED : hardGateAuthorized === true;
  const isOn = mode === GATE_MODE.ON && authorized;

  // Phase 3E-C3A-1 — SINGLE normalization boundary. runCertificationGate owns
  // the gate's interpretation of the raw diet/allergen channels: server.js
  // passes the raw request/profile values straight in and never normalises them
  // itself. normalizeRestrictions runs EXACTLY ONCE here; the frozen result is
  // reused for the whole gate execution (today: the shadow assessment; later:
  // preflight and repair-payload construction too).
  const { dietRestrictionContract } = _loadDietSubstrate();
  const normalizedRestrictions = dietRestrictionContract.normalizeRestrictions({ diets, allergens });

  const first = assessGeneratedWeek({ days, requestedBudgetCents, currency });
  const budgetEnforceable = first.budgetEnforceable;

  // SHADOW-ONLY dietary/allergen observation. Computed once against the settled
  // week; attached to every return value; NEVER an acceptance input in C1.
  // Receives the already-normalised object — no second normalization.
  const dietSafetyShadow = assessGeneratedWeekDietSafetyShadow({ days }, normalizedRestrictions);
  emit('diet_assessed', { round: 0, ...dietSafetyShadow });
  const withDiet = (status, extra) => _result(status, { dietSafety: dietSafetyShadow, ...extra });

  // Phase 3E-C3A-2 — the frozen COMBINED result shape. Composed HERE and ONLY
  // here; server.js consumes these fields verbatim and never recomposes them.
  //
  //   authorizedHardDiet := effective mode is 'on' AND production-authorized.
  //     Structurally unreachable today (HARD_GATE_PRODUCTION_AUTHORIZED === false
  //     ⇒ isOn === false), so in every reachable mode:
  //       acceptable        === deterministic.certified
  //       hardGateComplete  === false
  //     Dietary safety therefore stays observational until the C4 authorization
  //     checkpoint flips the constant and bumps CERTIFICATION_VERSION.
  const authorizedHardDiet = isOn;
  const combined = (det) => {
    const certified = det.certified === true;                       // deterministic-only — UNCHANGED meaning
    const dietSafetyCertified = dietSafetyShadow.dietSafetyCertified === true;
    const acceptable = certified && (!authorizedHardDiet || dietSafetyCertified);
    return {
      certified,
      // The deterministic assessment's own status, surfaced separately from the
      // overall gate `status` so callers can tell WHICH dimension failed.
      // Existing enums from certificationAssessment.assessWeek — no new vocabulary.
      deterministicStatus: {
        structure: det.assessment.structureStatus,
        canonicalCoverage: det.assessment.canonicalCoverage,
        nutritionCoverage: det.assessment.nutritionCoverage,
        purchase: det.assessment.purchase.status,
      },
      dietSafetyCertified,      // dietary/allergen SUB-verdict — never composed into `certified`
      acceptable,
      hardGateComplete: authorizedHardDiet && acceptable,
    };
  };

  emit('assessed', {
    round: 0,
    certified: first.certified,
    weekFailures: first.weekFailures,
    failingIngredientCount: first.failingIngredients.length,
    budgetEnforceable,
    hardGateComplete: first.hardGateComplete,
  });

  if (first.certified) {
    return withDiet(GATE_STATUS.CERTIFIED, { ...combined(first), days, assessment: first.assessment, gateResult: first });
  }

  // ── mode 'shadow': observe only, never block, never repair ───────────────
  if (!isOn) {
    return withDiet(GATE_STATUS.SHADOW_UNCERTIFIED, { ...combined(first), days, assessment: first.assessment, gateResult: first });
  }

  // ── mode 'on' from here ─────────────────────────────────────────────────

  // Unsupported currency safety net. The AUTHORITATIVE check runs at the
  // pre-generation boundary in the caller (before any Anthropic call); this
  // is the last-resort guard if a non-enforceable currency ever reaches here.
  // The week CANNOT be certified (package-budget certification cannot run), it
  // must NOT be accepted, and an ingredient edit cannot fix a currency — so no
  // repair call.
  if (!budgetEnforceable) {
    emit('failed', { reason: FAILURE_REASON.UNSUPPORTED_CURRENCY });
    return withDiet(GATE_STATUS.FAILED, {
      ...combined(first), days, assessment: first.assessment, gateResult: first, failureReason: FAILURE_REASON.UNSUPPORTED_CURRENCY,
    });
  }

  if (typeof generateRepairedWeek !== 'function') {
    return withDiet(GATE_STATUS.FAILED, {
      ...combined(first), days, assessment: first.assessment, gateResult: first, failureReason: FAILURE_REASON.UNCERTIFIED_NO_REPAIR,
    });
  }

  // Exactly one bounded repair pass.
  const instruction = buildRepairInstruction(first);
  emit('repair_started', { round: 1, weekFailures: first.weekFailures, failingIngredientCount: first.failingIngredients.length });

  let repairedDays;
  try {
    repairedDays = await generateRepairedWeek(first, instruction);
  } catch (err) {
    emit('repair_failed', { round: 1, reason: FAILURE_REASON.REPAIR_GENERATION_ERROR });
    return withDiet(GATE_STATUS.FAILED, {
      days, assessment: first.assessment, gateResult: first,
      repairAttempts: 1, failureReason: FAILURE_REASON.REPAIR_GENERATION_ERROR, repairError: err,
    });
  }

  const second = assessGeneratedWeek({ days: repairedDays, requestedBudgetCents, currency });
  emit('assessed', {
    round: 1,
    certified: second.certified,
    weekFailures: second.weekFailures,
    failingIngredientCount: second.failingIngredients.length,
    budgetEnforceable,
    hardGateComplete: second.hardGateComplete,
  });

  if (second.certified) {
    emit('repair_succeeded', { round: 1 });
    return withDiet(GATE_STATUS.CERTIFIED, {
      ...combined(second), days: repairedDays, assessment: second.assessment, gateResult: second, repaired: true, repairAttempts: 1,
    });
  }

  emit('repair_failed', { round: 1, reason: FAILURE_REASON.UNCERTIFIED_AFTER_REPAIR });
  return withDiet(GATE_STATUS.FAILED, {
    ...combined(second), days: repairedDays, assessment: second.assessment, gateResult: second,
    repaired: true, repairAttempts: 1, failureReason: FAILURE_REASON.UNCERTIFIED_AFTER_REPAIR,
  });
}

module.exports = {
  GATE_MODE,
  GATE_STATUS,
  FAILURE_REASON,
  MAX_REPAIR_ROUNDS,
  CERTIFICATION_VERSION,
  DIETARY_ALLERGEN_SUBSTRATE_PRESENT,
  HARD_GATE_PRODUCTION_AUTHORIZED,
  GATE_EXCLUDES,
  resolveGateMode,
  resolveEffectiveMode,
  isCurrencyCertifiable,
  assessGeneratedWeek,
  assessGeneratedWeekDietSafetyShadow,
  buildRepairInstruction,
  runCertificationGate,
};
