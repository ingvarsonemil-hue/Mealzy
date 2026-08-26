'use strict';

/**
 * Macro Engine v1 — server-side evaluation of daily protein/carbs/fat totals
 * against the user's targets. Phase 1 of the "calories hit, macros miss"
 * fix (see the meal-generation pipeline audit).
 *
 * IMPORTANT — what this module does NOT do: Mealzy has no ingredient
 * nutrition database. Every meal's protein/carbs/fat is a model-generated
 * ESTIMATE (see server.js's generateDayMealPlan), not something computed
 * from real ingredient data. This module only sums/compares those estimates
 * against the user's target — it never recalculates, corrects, or fabricates
 * a macro number. That is why a passing result is called
 * "within_target_estimate", never "certified" or "verified" — unlike Budget
 * Engine's cost figures (which ARE grounded in pricing.js's real ingredient
 * price table), macro totals stay estimates even when they land on target.
 *
 * Pure logic only — no Anthropic calls, no DB, no Express. Mirrors
 * budgetEngine.js's shape (evaluate -> classify) so the two can share one
 * repair loop (see planRepairEngine.js) instead of running two independent
 * retry mechanisms.
 */

const MACRO_AXES = Object.freeze(['protein', 'carbs', 'fat']);

// Same tolerance the prompt already asks the model to hit calories within
// (see server.js's "PER-MEAL CALORIE TARGETS ... within ±15%") — a repair is
// requested whenever a macro axis misses its daily target by more than this.
const MACRO_TOLERANCE_PCT = 15;

const MACRO_STATUS = Object.freeze({
  WITHIN_TARGET_ESTIMATE: 'within_target_estimate',
  OUTSIDE_TARGET_ESTIMATE: 'outside_target_estimate',
});

// Same breakfast/lunch/dinner/snack split server.js already uses for
// mealCalorieTargets — reused here so per-meal macro targets land on the
// same meals carrying the same share of the day.
const MEAL_WEIGHTS = Object.freeze({ breakfast: 0.25, lunch: 0.30, dinner: 0.35, snack: 0.10 });

// NOT a recommended range — a backstop against corrupt/malicious machine
// data only (a stray extra digit, a bad migration, a hostile payload).
// Any positive, finite value at or below this ceiling is a real target and
// is preserved EXACTLY, no matter how unusual (a 40g or a 350g protein
// target both pass through untouched) — Mealzy does not invent fitness
// guidance by silently clamping a legitimate goal into some "normal" range.
// Only a value past this line — physiologically impossible for any human
// diet — is treated as unusable and replaced with the existing default.
const IMPOSSIBLE_CEILING_G = Object.freeze({ protein: 1000, carbs: 2000, fat: 1000 });

const DEFAULTS = Object.freeze({ protein: 150, carbs: 200, fat: 65 });

/** Safe numeric coercion for one macro target.
 *   - non-numeric (string, undefined, null, NaN) -> fallback
 *   - <= 0 (zero or negative) -> fallback
 *   - > ceiling (impossible machine value) -> fallback
 *   - otherwise -> the value EXACTLY as given, unmodified
 * Never clamps a value into range — a value either passes through exactly
 * or is replaced by the existing default; there is no in-between "adjusted"
 * number that could be mistaken for the user's real target. Never throws. */
function sanitizeMacroTarget(value, fallback, ceiling) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  if (n > ceiling) return fallback;
  return n;
}

/** Builds a safe { protein, carbs, fat } daily target from a raw profile
 * object, accepting either the flat daily_protein/daily_carbs/daily_fat
 * fields or the nested `macros` object server.js already reads. A
 * malformed value (non-numeric, missing, zero, negative) or an impossible
 * one (past IMPOSSIBLE_CEILING_G) falls back to Mealzy's existing defaults
 * (150/200/65g) — the same defaults server.js already used before this
 * module existed. Any other value — however unusual — is a validated
 * numeric target already stored on the profile and is preserved EXACTLY
 * for evaluation; this function never invents a fitness recommendation and
 * never silently substitutes a "normalized" number for a real one. */
function buildDailyMacroTargets(profile) {
  const p = profile || {};
  const rawProtein = p.daily_protein ?? p.macros?.protein;
  const rawCarbs   = p.daily_carbs   ?? p.macros?.carbs;
  const rawFat     = p.daily_fat     ?? p.macros?.fat;
  return {
    protein: sanitizeMacroTarget(rawProtein, DEFAULTS.protein, IMPOSSIBLE_CEILING_G.protein),
    carbs:   sanitizeMacroTarget(rawCarbs,   DEFAULTS.carbs,   IMPOSSIBLE_CEILING_G.carbs),
    fat:     sanitizeMacroTarget(rawFat,     DEFAULTS.fat,     IMPOSSIBLE_CEILING_G.fat),
  };
}

/** Splits a daily macro target across breakfast/lunch/dinner/snack using the
 * same weighting server.js already applies to calories, for the per-meal
 * prompt line (each number stays a target for the model to aim for, not a
 * hard per-meal enforcement — same status as the existing per-meal calorie
 * targets). */
function splitMacroTargetsPerMeal(dailyTargets) {
  const out = {};
  for (const meal of Object.keys(MEAL_WEIGHTS)) {
    const w = MEAL_WEIGHTS[meal];
    out[meal] = {
      protein: Math.round(dailyTargets.protein * w),
      carbs: Math.round(dailyTargets.carbs * w),
      fat: Math.round(dailyTargets.fat * w),
    };
  }
  return out;
}

/** Signed percentage deviation of `actual` from `target`, one decimal place.
 * Returns 0 (never NaN/Infinity) when target is missing/non-positive — a
 * bad target must never be able to force a false "way off target" reading. */
function deviationPct(actual, target) {
  const a = Number(actual) || 0;
  const t = Number(target);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return Math.round(((a - t) / t) * 1000) / 10;
}

/**
 * Compares actual daily protein/carbs/fat totals (already summed
 * deterministically by server.js from the model's per-meal numbers — see
 * the audit) against the day's target. Never trusts/recalculates the
 * underlying meal numbers themselves; only judges the sums against target.
 *
 * `tolerancePct` (default ±15%, matching the calorie tolerance already in
 * the prompt) decides `withinTolerance`; `worstAxis` names whichever of
 * protein/carbs/fat is furthest off (by absolute percentage), used both for
 * picking which day most needs a repair (week mode) and for the directional
 * repair-prompt guidance (see buildDirectionalGuidance).
 */
function evaluateMacros(actualTotals, targetTotals, tolerancePct = MACRO_TOLERANCE_PCT) {
  const deviations = {};
  for (const axis of MACRO_AXES) deviations[axis] = deviationPct(actualTotals?.[axis], targetTotals?.[axis]);

  let worstAxis = MACRO_AXES[0];
  for (const axis of MACRO_AXES) {
    if (Math.abs(deviations[axis]) > Math.abs(deviations[worstAxis])) worstAxis = axis;
  }

  const withinTolerance = MACRO_AXES.every((axis) => Math.abs(deviations[axis]) <= tolerancePct);

  return {
    status: withinTolerance ? MACRO_STATUS.WITHIN_TARGET_ESTIMATE : MACRO_STATUS.OUTSIDE_TARGET_ESTIMATE,
    withinTolerance,
    tolerancePct,
    deviations,
    worstAxis,
    actualTotals: {
      protein: Number(actualTotals?.protein) || 0,
      carbs: Number(actualTotals?.carbs) || 0,
      fat: Number(actualTotals?.fat) || 0,
    },
    targetTotals: {
      protein: Number(targetTotals?.protein) || 0,
      carbs: Number(targetTotals?.carbs) || 0,
      fat: Number(targetTotals?.fat) || 0,
    },
  };
}

/** Human-readable, directional repair guidance for whichever axes are
 * currently outside tolerance — e.g. "protein too low (27.9% under
 * target)". Returns [] when nothing exceeds tolerance (never asks the model
 * to fix an axis that's already fine). Used verbatim in the repair prompt
 * (see server.js buildRepairBlock) so the model gets the actual measured
 * gap, not a generic "fix the macros" instruction. */
function buildDirectionalGuidance(deviations, tolerancePct = MACRO_TOLERANCE_PCT) {
  const lines = [];
  for (const axis of MACRO_AXES) {
    const dev = deviations[axis];
    if (Math.abs(dev) <= tolerancePct) continue;
    const direction = dev > 0 ? 'too high' : 'too low';
    const relation = dev > 0 ? 'over' : 'under';
    lines.push(`${axis} ${direction} (${Math.abs(dev).toFixed(1)}% ${relation} target)`);
  }
  return lines;
}

module.exports = {
  MACRO_AXES,
  MACRO_TOLERANCE_PCT,
  MACRO_STATUS,
  MEAL_WEIGHTS,
  IMPOSSIBLE_CEILING_G,
  sanitizeMacroTarget,
  buildDailyMacroTargets,
  splitMacroTargetsPerMeal,
  deviationPct,
  evaluateMacros,
  buildDirectionalGuidance,
};
