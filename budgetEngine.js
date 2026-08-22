'use strict';

/**
 * Budget Engine v1 — server-side enforcement of the core invariant:
 *
 *   authoritativeEstimatedWeeklyCost <= requestedWeeklyBudget
 *
 * for week mode, and the derived per-day share of it in single-day mode
 * (there is no coherent "week" to defer to across independent single-day
 * requests — see server.js for why that mode keeps its own simpler check).
 *
 * Pure logic only: money comparison, picking which day to repair, and the
 * bounded generate-check-repair loops. Prompt building and the actual AI
 * calls stay in server.js since they need its generation closures (dietary
 * rules, allergy checks, etc.) — this module only decides whether a result
 * is acceptable and when/what to retry.
 *
 * Authoritative cost source: whatever the caller passes as a cost (either
 * result.totalCost or a custom getCost/getDayCost), which server.js always
 * derives from pricing.priceIngredients() via calculateMealCost() — never
 * an AI-guessed cost field.
 */

// Single-day mode: 1 initial generation + up to 2 budget repairs.
const MAX_GENERATION_ATTEMPTS = 3;

// Week mode: the 7 days are generated once each (no per-day repair loop —
// see "money must be compared safely" / "do not turn a weekly budget into
// 7 rigid budgets" below), then at most this many single-day repairs are
// made against the FINAL weekly total. Worst case: 7 initial + 2 repair
// generations = 9 model calls, well under a naive "retry the whole week"
// design.
const MAX_WEEKLY_REPAIR_ROUNDS = 2;

// pricing.js / ingredient_prices rows are USD-only; there is no FX
// conversion anywhere in this codebase. Enforcing a non-USD-labeled budget
// number against a USD cost would compare unlike units and produce a false
// guarantee, so v1 only enforces when the profile's currency is USD (or
// unset, which defaults to USD elsewhere in server.js). Other currencies
// are logged as skipped (see server.js) rather than silently mis-enforced.
const ENFORCEABLE_CURRENCY = 'USD';

function isBudgetEnforceable(currency) {
  return !currency || String(currency).toUpperCase() === ENFORCEABLE_CURRENCY;
}

// ── Money — integer cents everywhere a decision is made ─────────────────────
// Floating-point dollars (e.g. 0.1 + 0.2 !== 0.3) must never decide whether a
// plan passes or fails. Every comparison in this module converts to integer
// cents first; USD figures are only reconstituted for display/logging.

function toCents(amountUSD) {
  const n = Number(amountUSD);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function centsToUSD(cents) {
  return Math.round(cents) / 100;
}

/** Compares one authoritative cost against a budget, entirely in integer
 * cents. Both must already be in USD (see isBudgetEnforceable) — this
 * function does no currency conversion. */
function evaluateBudget(costUSD, budgetUSD) {
  const costCents = toCents(costUSD);
  const budgetCents = toCents(budgetUSD);
  const withinBudget = costCents <= budgetCents;
  const overageCents = withinBudget ? 0 : costCents - budgetCents;
  const overageUSD = centsToUSD(overageCents);
  const overagePct = withinBudget || budgetCents <= 0 ? 0 : Math.round((overageCents / budgetCents) * 1000) / 10;
  return {
    withinBudget,
    costUSD: centsToUSD(costCents),
    budgetUSD: centsToUSD(budgetCents),
    overageUSD,
    overagePct,
  };
}

/** The named, testable entry point for the core weekly invariant:
 * authoritativeEstimatedWeeklyCost <= requestedWeeklyBudget. Same cents-safe
 * comparison as evaluateBudget — this alias exists so the weekly check in
 * server.js is never "just another inline comparison" but a single,
 * unit-tested decision point. */
function evaluateWeeklyBudget(weeklyCostUSD, weeklyBudgetUSD) {
  return evaluateBudget(weeklyCostUSD, weeklyBudgetUSD);
}

/** Buckets an overage percentage for analytics so exact personal budget
 * figures are never logged (see server.js telemetry calls). */
function bucketOverage(overagePct) {
  if (!overagePct || overagePct <= 0) return '0';
  if (overagePct <= 10) return '0-10';
  if (overagePct <= 25) return '10-25';
  if (overagePct <= 50) return '25-50';
  return '50+';
}

/** Buckets a USD weekly budget for analytics — coarse enough that no exact
 * personal budget figure is ever logged, fine enough to answer "which
 * budget tier fails most in production" (see the Budget Engine
 * observability PR report). Cents-safe: boundaries are inclusive of the
 * lower bound of each named bucket (e.g. exactly $40.00 is "40_49", not
 * "under_40"). Only meaningful for USD — callers must gate on
 * isBudgetEnforceable() before attaching this to an event, since a non-USD
 * number isn't a real USD budget. */
function budgetBucket(budgetUSD) {
  const cents = toCents(budgetUSD);
  if (cents < 4000) return 'under_40';
  if (cents < 5000) return '40_49';
  if (cents < 6000) return '50_59';
  if (cents < 7500) return '60_74';
  if (cents < 10000) return '75_99';
  if (cents < 13000) return '100_129';
  return '130_plus';
}

/** Coarse direction of a repair's effect on cost, for analytics — never the
 * raw before/after dollar values. Cents-safe: a change of less than one
 * cent (impossible in practice since both inputs are already cent-rounded,
 * but kept explicit) counts as "unchanged" rather than a false decrease/
 * increase. */
function repairDirection(previousCostUSD, currentCostUSD) {
  const prevCents = toCents(previousCostUSD);
  const currCents = toCents(currentCostUSD);
  if (currCents < prevCents) return 'decreased';
  if (currCents > prevCents) return 'increased';
  return 'unchanged';
}

/**
 * Pure: decides which analytics events should fire for one attempt of a
 * budget generate/repair loop — never persists anything itself, so the
 * decision logic is fully unit-testable without a DB or an HTTP request.
 * server.js's logBudgetAttempt calls this once per attempt and persists
 * whatever it returns.
 *
 * `requestId` is a random, ephemeral, request-scoped correlation key
 * (crypto.randomUUID() from server.js) — never derived from userId/email/
 * IP/session/diet/allergies/ingredients. `previousCostUSD` is the prior
 * attempt's cost (null on the very first attempt, or whenever the caller
 * has no prior attempt to compare against).
 *
 * TIMING (traced from runWeeklyBudgetRepair, not assumed): onAttempt fires
 * at the TOP of each loop iteration, evaluating the days as they currently
 * stand. For attempt >= 2, those days were already mutated by the PREVIOUS
 * iteration's regenerateDay call — so attempt N's evaluation (N >= 2)
 * always describes repair round (N-1)'s completed, repriced result. That's
 * true whether round (N-1) brought the week back under budget (success),
 * left it still over with another round to go, or left it still over with
 * none left (terminal failure) — the repair already happened by the time
 * this fires, regardless of outcome.
 *
 * Firing rules (exactly):
 *   budget_generation_attempt — always fires once, reporting THIS attempt's
 *     own result.
 *   budget_repair_completed — fires whenever attempt > 1, i.e. whenever a
 *     repair round just produced this evaluation. repairRound = attempt - 1
 *     (the round that just finished, not the one that might come next).
 *     `direction` compares this attempt's cost to the attempt right before
 *     it via repairDirection(). There is no separate "repair about to
 *     start" event — once direction data lives here, that signal would be
 *     fully redundant with an over-budget attempt event followed by either
 *     another attempt or a terminal failure event, so it was not kept
 *     alongside this one (avoids event spam with no distinct analytical
 *     value; a prior version of this function had exactly that redundant,
 *     mis-attributed event — see the observability-correction report).
 */
function buildAttemptEvents({ requestId, mode, attempt, maxAttempts, evaluation, previousCostUSD = null }) {
  const bucket = budgetBucket(evaluation.budgetUSD);
  const events = [{
    event: 'budget_generation_attempt',
    data: {
      requestId, mode, attempt, budgetBucket: bucket,
      withinBudget: evaluation.withinBudget,
      overageBucket: bucketOverage(evaluation.overagePct),
    },
  }];

  if (attempt > 1 && previousCostUSD !== null && previousCostUSD !== undefined) {
    events.push({
      event: 'budget_repair_completed',
      data: {
        requestId, mode, repairRound: attempt - 1, budgetBucket: bucket,
        direction: repairDirection(previousCostUSD, evaluation.costUSD),
        withinBudget: evaluation.withinBudget,
        overageBucket: bucketOverage(evaluation.overagePct),
      },
    });
  }

  return events;
}

/**
 * Pure: builds the single terminal event for a resolved budget generate/
 * repair loop — exactly one of budget_generation_succeeded or
 * budget_generation_failed, mutually exclusive by construction (the caller
 * passes one `succeeded` boolean, never both). `attempts` is the loop's
 * 1-indexed attempt count; `repairsUsed` (attempts - 1) is logged instead
 * since it's the analytically meaningful number (0, 1, or 2 repairs).
 */
function buildOutcomeEvent({ requestId, mode, succeeded, attempts, evaluation }) {
  const bucket = budgetBucket(evaluation.budgetUSD);
  const repairsUsed = attempts - 1;
  if (succeeded) {
    return { event: 'budget_generation_succeeded', data: { requestId, mode, repairsUsed, budgetBucket: bucket } };
  }
  return {
    event: 'budget_generation_failed',
    data: { requestId, mode, repairsUsed, budgetBucket: bucket, finalOverageBucket: bucketOverage(evaluation.overagePct) },
  };
}

/** A fair share of what's actually left, not a rigid 1/7 split of the whole
 * budget — lets an expensive day be balanced by cheaper ones elsewhere in
 * the week, as long as the FINAL weekly total (evaluateWeeklyBudget) still
 * fits. This is prompt GUIDANCE only; it never hard-rejects a day. Floors at
 * `floorUSD` so a week that's already overspent doesn't hand the model a
 * nonsensical $0.00 target. */
function nextDayGuidanceUSD(remainingBudgetUSD, remainingDays, floorUSD = 2) {
  if (!Number.isFinite(remainingDays) || remainingDays <= 0) return Math.max(floorUSD, remainingBudgetUSD);
  return Math.max(floorUSD, remainingBudgetUSD / remainingDays);
}

/**
 * Runs `generateFn` up to `maxAttempts` times, stopping as soon as the
 * result's cost fits `budgetUSD`. On a retry, generateFn receives a
 * repairContext ({ attempt, previousCostUSD, budgetUSD }) it can use to
 * tell the model what was too expensive — see server.js's repair prompt
 * block. Never retries indefinitely; after the last attempt the caller gets
 * `succeeded: false` and must return a controlled failure, never the
 * over-budget plan.
 *
 * Used only by single-day mode (see MAX_WEEKLY_REPAIR_ROUNDS/
 * runWeeklyBudgetRepair for week mode). Any exception thrown by generateFn —
 * an AllergyViolationError, a pricing/DB error, an Anthropic API error —
 * propagates immediately and is never reinterpreted as "over budget"; there
 * is no try/catch in this loop.
 */
async function runWithBudgetRepair(generateFn, budgetUSD, { maxAttempts = MAX_GENERATION_ATTEMPTS, getCost, onAttempt } = {}) {
  let lastResult = null;
  let lastEvaluation = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const repairContext = attempt === 1
      ? null
      : { attempt, previousCostUSD: lastEvaluation.costUSD, budgetUSD, maxAttempts };

    const result = await generateFn(repairContext, attempt);
    const costUSD = typeof getCost === 'function' ? getCost(result) : Number(result?.totalCost) || 0;
    const evaluation = evaluateBudget(costUSD, budgetUSD);

    lastResult = result;
    lastEvaluation = evaluation;

    if (onAttempt) await onAttempt(attempt, evaluation, maxAttempts);

    if (evaluation.withinBudget) {
      return { result, evaluation, attempts: attempt, succeeded: true };
    }
  }

  return { result: lastResult, evaluation: lastEvaluation, attempts: maxAttempts, succeeded: false };
}

/** Picks the index of the most expensive day, via `getDayCost`. Deterministic
 * tie-break: the first (earliest) day wins ties, so repeated calls on
 * unchanged input always pick the same day. */
function pickMostExpensiveDayIndex(days, getDayCost) {
  let maxIdx = 0;
  let maxCents = -Infinity;
  (days || []).forEach((day, i) => {
    const cents = toCents(getDayCost(day));
    if (cents > maxCents) {
      maxCents = cents;
      maxIdx = i;
    }
  });
  return maxIdx;
}

/**
 * Enforces the WEEKLY invariant over an already-generated array of 7 days.
 * This is the mandatory final check — it runs even though each day was
 * generated once with adaptive guidance and no individual day was hard
 * -rejected (see nextDayGuidanceUSD). If the week's authoritative total is
 * over `weeklyBudgetUSD`, it repairs by regenerating only the single most
 * expensive day (a simple greedy fix, not an optimization solver), up to
 * `maxRepairRounds` times, re-checking the whole-week total after each one.
 *
 * `getDayCost(day)` returns one day's authoritative USD cost.
 * `regenerateDay(dayIndex, repairContext)` must return a replacement day
 * object for that index; repairContext is
 * { dayIndex, attempt, previousDayCostUSD, weeklyOverageUSD, targetDayCostUSD, maxAttempts }.
 *
 * Any exception thrown by regenerateDay (AllergyViolationError, a pricing/DB
 * error, an Anthropic API error) propagates immediately — there is no
 * try/catch here, so a non-budget failure is never reinterpreted as a
 * budget retry.
 *
 * Returns { days, weeklyEvaluation, attempts, succeeded }. `days` is a new
 * array — the input is never mutated. `succeeded: false` means the caller
 * MUST NOT save or return the plan; the last (still over-budget) days are
 * only included for logging/debugging, never for the response.
 */
async function runWeeklyBudgetRepair(days, weeklyBudgetUSD, { getDayCost, regenerateDay, maxRepairRounds = MAX_WEEKLY_REPAIR_ROUNDS, onAttempt } = {}) {
  let currentDays = (days || []).slice();
  const maxAttempts = maxRepairRounds + 1;

  const weeklyCostUSD = () => centsToUSD(currentDays.reduce((sum, d) => sum + toCents(getDayCost(d)), 0));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const evaluation = evaluateWeeklyBudget(weeklyCostUSD(), weeklyBudgetUSD);

    if (onAttempt) await onAttempt(attempt, evaluation, maxAttempts);

    if (evaluation.withinBudget) {
      return { days: currentDays, weeklyEvaluation: evaluation, attempts: attempt, succeeded: true };
    }
    if (attempt >= maxAttempts) {
      return { days: currentDays, weeklyEvaluation: evaluation, attempts: attempt, succeeded: false };
    }

    const dayIndex = pickMostExpensiveDayIndex(currentDays, getDayCost);
    const previousDayCostUSD = getDayCost(currentDays[dayIndex]);
    // This day must drop by roughly the whole-week overage to bring the
    // total back in budget, assuming every other day stays as-is. Floored
    // so the repair prompt never asks for a nonsensical/impossible target.
    const targetDayCostUSD = Math.max(1, centsToUSD(toCents(previousDayCostUSD) - toCents(evaluation.overageUSD)));

    const repairContext = {
      dayIndex, attempt: attempt + 1, previousDayCostUSD,
      weeklyOverageUSD: evaluation.overageUSD, targetDayCostUSD, maxAttempts,
    };
    currentDays[dayIndex] = await regenerateDay(dayIndex, repairContext);
  }

  // Unreachable — the loop above always returns by the final iteration.
  const evaluation = evaluateWeeklyBudget(weeklyCostUSD(), weeklyBudgetUSD);
  return { days: currentDays, weeklyEvaluation: evaluation, attempts: maxAttempts, succeeded: evaluation.withinBudget };
}

module.exports = {
  MAX_GENERATION_ATTEMPTS,
  MAX_WEEKLY_REPAIR_ROUNDS,
  ENFORCEABLE_CURRENCY,
  isBudgetEnforceable,
  toCents,
  centsToUSD,
  evaluateBudget,
  evaluateWeeklyBudget,
  bucketOverage,
  budgetBucket,
  repairDirection,
  buildAttemptEvents,
  buildOutcomeEvent,
  nextDayGuidanceUSD,
  runWithBudgetRepair,
  pickMostExpensiveDayIndex,
  runWeeklyBudgetRepair,
};
