'use strict';

/**
 * Plan Repair Engine — the ONE bounded generate/evaluate/repair loop shared
 * by Budget Engine's cost invariant and Macro Engine's target check.
 *
 * Phase 1 macro enforcement deliberately does NOT bolt a second, independent
 * retry loop onto Budget Engine's — that would double the worst-case
 * Anthropic calls for no proven reason (see the meal-generation pipeline
 * audit and the macro-enforcement follow-up). Instead this module wraps
 * budgetEngine's pure cost decisions and macroEngine's pure macro decisions
 * into a single generate -> evaluate-both -> repair-together loop, bounded
 * by the SAME attempt ceilings budgetEngine already defines
 * (MAX_GENERATION_ATTEMPTS for single-day, MAX_WEEKLY_REPAIR_ROUNDS for
 * week mode) — no new ceiling, no additional calls beyond what Budget
 * Engine could already make on its own.
 *
 * Budget stays the hard invariant, unchanged from Budget Engine v1: a
 * day/week still over budget after the bounded attempts is a controlled
 * failure (`succeeded: false`, never saved/returned as successful). Macro
 * deviation is a SOFT signal in Phase 1 — it influences which day gets
 * regenerated and what the repair prompt asks for, but a plan still outside
 * macro tolerance after the same bounded attempts is still returned,
 * honestly labeled via macroEngine's status (`outside_target_estimate`),
 * never silently upgraded and never a reason by itself to reject the plan.
 *
 * This module never touches a meal's actual protein/carbs/fat numbers —
 * those stay whatever the model returned (model-generated estimates, not
 * deterministic nutrition data; see macroEngine.js). It only decides
 * whether to ask for another attempt and what to tell the model went wrong.
 */

const budgetEngine = require('./budgetEngine');
const macroEngine = require('./macroEngine');

/**
 * Runs `generateFn` up to `maxAttempts` times for ONE day, stopping as soon
 * as budget (if enforceable) AND macro both pass. Because macro alone never
 * hard-fails, `succeeded` reflects ONLY the budget invariant — matching
 * Budget Engine v1's existing contract exactly, so callers that already
 * branch on `succeeded` (e.g. returning budgetUnreachableResponse) keep
 * working unchanged. Callers MUST separately inspect `macroEval.status` for
 * an honest macro-status field; a macro-only miss is never a reason to
 * reject the plan in Phase 1.
 *
 * `generateFn(repairContext, attempt)` receives `null` on the first attempt,
 * then on each retry:
 *   { attempt, maxAttempts,
 *     budget: { previousCostUSD, budgetUSD } | null,
 *     macro:  { deviations, worstAxis } | null }
 * `budget`/`macro` are populated only when THAT constraint actually failed
 * the previous attempt, so a repair prompt never asks the model to fix
 * something that was already fine — and both are included together
 * whenever both are currently failing, per one shared repair prompt.
 */
async function runCombinedDayRepair(generateFn, {
  budgetEnforceable = true,
  budgetUSD,
  macroTargets,
  maxAttempts = budgetEngine.MAX_GENERATION_ATTEMPTS,
  macroTolerancePct = macroEngine.MACRO_TOLERANCE_PCT,
  getCost = (r) => Number(r?.totalCost) || 0,
  getMacroTotals = (r) => ({
    protein: Number(r?.totalProtein) || 0,
    carbs: Number(r?.totalCarbs) || 0,
    fat: Number(r?.totalFat) || 0,
  }),
  onAttempt,
} = {}) {
  let lastResult = null;
  let lastBudgetEval = null;
  let lastMacroEval = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const budgetFailingPrev = budgetEnforceable && !!lastBudgetEval && !lastBudgetEval.withinBudget;
    const macroFailingPrev = !!lastMacroEval && !lastMacroEval.withinTolerance;

    const repairContext = attempt === 1 ? null : {
      attempt,
      maxAttempts,
      budget: budgetFailingPrev ? { previousCostUSD: lastBudgetEval.costUSD, budgetUSD } : null,
      macro: macroFailingPrev ? { deviations: lastMacroEval.deviations, worstAxis: lastMacroEval.worstAxis } : null,
    };

    const result = await generateFn(repairContext, attempt);
    const budgetEval = budgetEnforceable ? budgetEngine.evaluateBudget(getCost(result), budgetUSD) : null;
    const macroEval = macroEngine.evaluateMacros(getMacroTotals(result), macroTargets, macroTolerancePct);

    lastResult = result;
    lastBudgetEval = budgetEval;
    lastMacroEval = macroEval;

    if (onAttempt) await onAttempt(attempt, budgetEval, macroEval, maxAttempts);

    const budgetOK = !budgetEnforceable || budgetEval.withinBudget;
    const macroOK = macroEval.withinTolerance;
    if (budgetOK && macroOK) {
      return { result, budgetEval, macroEval, attempts: attempt, succeeded: true };
    }
  }

  const succeeded = !budgetEnforceable || (!!lastBudgetEval && lastBudgetEval.withinBudget);
  return { result: lastResult, budgetEval: lastBudgetEval, macroEval: lastMacroEval, attempts: maxAttempts, succeeded };
}

/** Picks the index of the day with the worst (largest-magnitude) macro
 * deviation among days currently outside tolerance. Deterministic tie-break:
 * earliest day wins ties (same convention as
 * budgetEngine.pickMostExpensiveDayIndex). Returns 0 if called with no
 * failing days (callers only call this when at least one exists). */
function pickWorstMacroDayIndex(macroEvals) {
  let worstIdx = 0;
  let worstMag = -Infinity;
  (macroEvals || []).forEach((ev, i) => {
    if (ev.withinTolerance) return;
    const mag = Math.abs(ev.deviations[ev.worstAxis]);
    if (mag > worstMag) {
      worstMag = mag;
      worstIdx = i;
    }
  });
  return worstIdx;
}

/**
 * Enforces the WEEKLY budget invariant exactly as budgetEngine.
 * runWeeklyBudgetRepair already did (same greedy "repair the worst day"
 * heuristic, same maxRepairRounds ceiling), while ALSO tracking per-day
 * macro tolerance and folding it into the very same repair rounds — never a
 * second loop. Each round repairs exactly one day:
 *   - if the week is over budget, the most expensive day is repaired (the
 *     existing, unchanged priority — budget stays the hard invariant), and
 *     if that same day is ALSO outside macro tolerance, the repair prompt
 *     for it carries both;
 *   - otherwise (budget already fine), the day with the worst macro
 *     deviation is repaired instead.
 * Both evaluations are recomputed fresh every round from `currentDays`, so a
 * repair that fixes one constraint but worsens the other is caught by the
 * very next round's evaluation, and the next repair prompt for that day
 * reflects the CURRENT state, not stale ordering.
 *
 * `succeeded` reflects only the budget invariant, matching
 * runWeeklyBudgetRepair's existing contract. `dayMacroEvals` (aligned by
 * index with the returned `days`) lets the caller attach an honest per-day
 * macroStatus even when macro never fully converges within the bounded
 * rounds.
 */
async function runCombinedWeeklyRepair(days, weeklyBudgetUSD, dailyMacroTargets, {
  budgetEnforceable = true,
  regenerateDay,
  maxRepairRounds = budgetEngine.MAX_WEEKLY_REPAIR_ROUNDS,
  macroTolerancePct = macroEngine.MACRO_TOLERANCE_PCT,
  getDayCost = (d) => Number(d?.totalCost) || 0,
  getDayMacroTotals = (d) => ({
    protein: Number(d?.totalProtein) || 0,
    carbs: Number(d?.totalCarbs) || 0,
    fat: Number(d?.totalFat) || 0,
  }),
  onAttempt,
} = {}) {
  let currentDays = (days || []).slice();
  const maxAttempts = maxRepairRounds + 1;

  function evaluateAll() {
    const weeklyCostUSD = budgetEngine.centsToUSD(
      currentDays.reduce((sum, d) => sum + budgetEngine.toCents(getDayCost(d)), 0)
    );
    const weeklyBudgetEval = budgetEnforceable ? budgetEngine.evaluateWeeklyBudget(weeklyCostUSD, weeklyBudgetUSD) : null;
    const dayMacroEvals = currentDays.map((d) => macroEngine.evaluateMacros(getDayMacroTotals(d), dailyMacroTargets, macroTolerancePct));
    return { weeklyBudgetEval, dayMacroEvals };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { weeklyBudgetEval, dayMacroEvals } = evaluateAll();
    const budgetFailing = budgetEnforceable && !weeklyBudgetEval.withinBudget;
    const macroFailing = dayMacroEvals.some((ev) => !ev.withinTolerance);

    if (onAttempt) await onAttempt(attempt, weeklyBudgetEval, dayMacroEvals, maxAttempts);

    if (!budgetFailing && !macroFailing) {
      return { days: currentDays, weeklyBudgetEval, dayMacroEvals, attempts: attempt, succeeded: true };
    }
    if (attempt >= maxAttempts) {
      return { days: currentDays, weeklyBudgetEval, dayMacroEvals, attempts: attempt, succeeded: !budgetFailing };
    }

    let dayIndex;
    let budgetRepairInfo = null;
    let macroRepairInfo = null;

    if (budgetFailing) {
      dayIndex = budgetEngine.pickMostExpensiveDayIndex(currentDays, getDayCost);
      const previousDayCostUSD = getDayCost(currentDays[dayIndex]);
      const targetDayCostUSD = Math.max(1, budgetEngine.centsToUSD(
        budgetEngine.toCents(previousDayCostUSD) - budgetEngine.toCents(weeklyBudgetEval.overageUSD)
      ));
      budgetRepairInfo = { previousCostUSD: previousDayCostUSD, budgetUSD: targetDayCostUSD };
      if (!dayMacroEvals[dayIndex].withinTolerance) {
        macroRepairInfo = { deviations: dayMacroEvals[dayIndex].deviations, worstAxis: dayMacroEvals[dayIndex].worstAxis };
      }
    } else {
      dayIndex = pickWorstMacroDayIndex(dayMacroEvals);
      macroRepairInfo = { deviations: dayMacroEvals[dayIndex].deviations, worstAxis: dayMacroEvals[dayIndex].worstAxis };
    }

    const repairContext = { dayIndex, attempt: attempt + 1, maxAttempts, budget: budgetRepairInfo, macro: macroRepairInfo };
    currentDays[dayIndex] = await regenerateDay(dayIndex, repairContext);
  }

  // Unreachable — the loop above always returns by the final iteration.
  const { weeklyBudgetEval, dayMacroEvals } = evaluateAll();
  return { days: currentDays, weeklyBudgetEval, dayMacroEvals, attempts: maxAttempts, succeeded: !budgetEnforceable || weeklyBudgetEval.withinBudget };
}

module.exports = {
  runCombinedDayRepair,
  runCombinedWeeklyRepair,
  pickWorstMacroDayIndex,
};
