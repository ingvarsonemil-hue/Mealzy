'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const budgetEngine = require('../budgetEngine.js');
const {
  evaluateBudget, evaluateWeeklyBudget, bucketOverage, isBudgetEnforceable,
  toCents, centsToUSD, nextDayGuidanceUSD, pickMostExpensiveDayIndex,
  runWithBudgetRepair, runWeeklyBudgetRepair,
  MAX_GENERATION_ATTEMPTS, MAX_WEEKLY_REPAIR_ROUNDS,
} = budgetEngine;

describe('money — integer cents, never floating-point dollars', () => {
  test('toCents/centsToUSD round-trip cleanly', () => {
    assert.equal(toCents(60), 6000);
    assert.equal(toCents(59.99), 5999);
    assert.equal(centsToUSD(6000), 60);
  });

  test('$59.99 total against a $60 budget passes', () => {
    assert.equal(evaluateWeeklyBudget(59.99, 60).withinBudget, true);
  });

  test('$60.00 total against a $60 budget passes (boundary, not strictly-less-than)', () => {
    assert.equal(evaluateWeeklyBudget(60.00, 60).withinBudget, true);
  });

  test('$60.01 total against a $60 budget fails', () => {
    const r = evaluateWeeklyBudget(60.01, 60);
    assert.equal(r.withinBudget, false);
    assert.equal(r.overageUSD, 0.01);
  });

  test('floating-point noise just above a whole dollar (60.0000000001) must not fail a valid $60 plan', () => {
    assert.equal(evaluateWeeklyBudget(60.0000000001, 60).withinBudget, true);
  });

  test('a sum that is genuinely a cent over due to decimal drift (60.009999999) must not silently pass', () => {
    assert.equal(evaluateWeeklyBudget(60.009999999, 60).withinBudget, false);
  });

  test('awkward decimal sums (repeated 0.1-style additions) still compare correctly', () => {
    // 0.1 + 0.2 !== 0.3 in raw floating point; cents-based comparison must not care.
    const weeklyCost = [11.10, 6.20, 7.30, 10.00, 8.05, 12.25, 6.10].reduce((a, b) => a + b, 0);
    const r = evaluateWeeklyBudget(weeklyCost, 61);
    assert.equal(r.withinBudget, true); // sums to exactly 61.00
  });
});

describe('evaluateWeeklyBudget — the named, testable weekly invariant check', () => {
  test('weekly plan below budget passes', () => {
    assert.equal(evaluateWeeklyBudget(55, 60).withinBudget, true);
  });
  test('weekly plan exactly at budget passes', () => {
    assert.equal(evaluateWeeklyBudget(60, 60).withinBudget, true);
  });
  test('weekly plan one cent over budget fails', () => {
    assert.equal(evaluateWeeklyBudget(60.01, 60).withinBudget, false);
  });
});

describe('bucketOverage — never logs raw personal dollar amounts', () => {
  test('buckets small/medium/large overages, and 0 for within-budget', () => {
    assert.equal(bucketOverage(0), '0');
    assert.equal(bucketOverage(5), '0-10');
    assert.equal(bucketOverage(15), '10-25');
    assert.equal(bucketOverage(40), '25-50');
    assert.equal(bucketOverage(90), '50+');
  });
});

describe('isBudgetEnforceable — currency gate unchanged (pricing.js/ingredient_prices are USD-only)', () => {
  test('USD and unset currency are enforceable', () => {
    assert.equal(isBudgetEnforceable('USD'), true);
    assert.equal(isBudgetEnforceable(undefined), true);
  });
  test('any non-USD currency is not enforceable', () => {
    assert.equal(isBudgetEnforceable('SEK'), false);
    assert.equal(isBudgetEnforceable('gbp'), false);
  });
});

describe('nextDayGuidanceUSD — adaptive per-day guidance, NOT a rigid 1/7 split', () => {
  test('with the full week left, guidance is the simple average', () => {
    assert.equal(nextDayGuidanceUSD(60, 7), 60 / 7);
  });

  test('cheap early days leave more budget — and therefore a HIGHER guidance — for later days', () => {
    // Day 1 guidance at the very start of a $60/7-day week.
    const day1Guidance = nextDayGuidanceUSD(60, 7);
    // Day 1 actually cost only $4 (cheap) — remaining budget grows relative to what a flat split would have left.
    const remainingAfterCheapDay1 = 60 - 4;
    const day2Guidance = nextDayGuidanceUSD(remainingAfterCheapDay1, 6);
    assert.ok(day2Guidance > day1Guidance, `expected day2 guidance (${day2Guidance}) > day1 guidance (${day1Guidance}) after a cheap day 1`);
  });

  test('an expensive early day correctly tightens guidance for later days', () => {
    const day1Guidance = nextDayGuidanceUSD(60, 7);
    const remainingAfterExpensiveDay1 = 60 - 20; // day 1 blew way past its share
    const day2Guidance = nextDayGuidanceUSD(remainingAfterExpensiveDay1, 6);
    assert.ok(day2Guidance < day1Guidance);
  });

  test('remaining budget cannot go negative silently — guidance floors instead of going negative', () => {
    const guidance = nextDayGuidanceUSD(-15, 3); // week is already overspent
    assert.ok(guidance >= 0);
    assert.equal(guidance, 2); // default floor
  });

  test('zero remaining days does not divide by zero', () => {
    const guidance = nextDayGuidanceUSD(10, 0);
    assert.ok(Number.isFinite(guidance));
  });
});

describe('pickMostExpensiveDayIndex — deterministic greedy repair target, not a solver', () => {
  test('picks the single most expensive day', () => {
    const days = [{ c: 5 }, { c: 20 }, { c: 8 }];
    assert.equal(pickMostExpensiveDayIndex(days, d => d.c), 1);
  });
  test('ties break to the earliest day, deterministically', () => {
    const days = [{ c: 10 }, { c: 10 }, { c: 3 }];
    assert.equal(pickMostExpensiveDayIndex(days, d => d.c), 0);
  });
});

describe('runWithBudgetRepair — single-day mode\'s bounded generate/check/repair loop (unchanged)', () => {
  test('first attempt already under budget: accepted on attempt 1', async () => {
    const generateFn = async (repairContext) => { assert.equal(repairContext, null); return { totalCost: 50 }; };
    const { succeeded, attempts } = await runWithBudgetRepair(generateFn, 60);
    assert.equal(succeeded, true);
    assert.equal(attempts, 1);
  });

  test('first attempt over, second under: accepted on attempt 2', async () => {
    const costs = [80, 55];
    const generateFn = async (_, attempt) => ({ totalCost: costs[attempt - 1] });
    const { succeeded, attempts } = await runWithBudgetRepair(generateFn, 60);
    assert.equal(succeeded, true);
    assert.equal(attempts, 2);
  });

  test('all attempts over budget: controlled failure, bounded at MAX_GENERATION_ATTEMPTS', async () => {
    let calls = 0;
    const generateFn = async () => { calls += 1; return { totalCost: 100 }; };
    const { succeeded, attempts } = await runWithBudgetRepair(generateFn, 60);
    assert.equal(succeeded, false);
    assert.equal(attempts, MAX_GENERATION_ATTEMPTS);
    assert.equal(calls, MAX_GENERATION_ATTEMPTS);
  });

  test('an AllergyViolationError-like error propagates immediately, no retry', async () => {
    let calls = 0;
    class FakeAllergyError extends Error {}
    const generateFn = async () => { calls += 1; throw new FakeAllergyError('nuts'); };
    await assert.rejects(() => runWithBudgetRepair(generateFn, 60), FakeAllergyError);
    assert.equal(calls, 1);
  });

  test('a generic Anthropic/API error propagates immediately, not reinterpreted as over-budget', async () => {
    let calls = 0;
    const generateFn = async () => { calls += 1; throw new Error('anthropic_api_error'); };
    await assert.rejects(() => runWithBudgetRepair(generateFn, 60), /anthropic_api_error/);
    assert.equal(calls, 1);
  });

  test('a pricing/DB error propagates immediately, not reinterpreted as over-budget', async () => {
    let calls = 0;
    class FakeDbError extends Error {}
    const generateFn = async () => { calls += 1; throw new FakeDbError('turso_unavailable'); };
    await assert.rejects(() => runWithBudgetRepair(generateFn, 60), FakeDbError);
    assert.equal(calls, 1);
  });
});

describe('runWeeklyBudgetRepair — the mandatory FINAL weekly invariant', () => {
  function makeDays(costs) {
    return costs.map((c, i) => ({ date: `2026-01-0${i + 1}`, dayName: `Day${i + 1}`, totalCost: c }));
  }

  test('D: an expensive individual day is accepted as-is when the full week fits ($11/$6/$7/$10/$8/$12/$6 = $60)', async () => {
    const days = makeDays([11, 6, 7, 10, 8, 12, 6]);
    let regenerateCalls = 0;
    const { succeeded, attempts, weeklyEvaluation, days: finalDays } = await runWeeklyBudgetRepair(days, 60, {
      getDayCost: d => d.totalCost,
      regenerateDay: async () => { regenerateCalls += 1; return days[0]; },
    });
    assert.equal(succeeded, true);
    assert.equal(attempts, 1); // no repair needed at all
    assert.equal(regenerateCalls, 0); // Monday's $11 was never rejected or retried
    assert.equal(weeklyEvaluation.costUSD, 60);
    assert.deepEqual(finalDays.map(d => d.totalCost), [11, 6, 7, 10, 8, 12, 6]);
  });

  test('A/B/C via a full week: below, at, and one cent over budget', async () => {
    const below = await runWeeklyBudgetRepair(makeDays([8, 8, 8, 8, 8, 8, 8]), 60, { getDayCost: d => d.totalCost, regenerateDay: async () => { throw new Error('should not repair'); } });
    assert.equal(below.succeeded, true);

    const atBudget = await runWeeklyBudgetRepair(makeDays([10, 10, 10, 10, 10, 5, 5]), 60, { getDayCost: d => d.totalCost, regenerateDay: async () => { throw new Error('should not repair'); } });
    assert.equal(atBudget.succeeded, true);
    assert.equal(atBudget.weeklyEvaluation.costUSD, 60);

    const oneCentOver = await runWeeklyBudgetRepair(makeDays([8.58, 8.57, 8.57, 8.57, 8.57, 8.57, 8.58]), 60, {
      getDayCost: d => d.totalCost,
      regenerateDay: async (i) => ({ ...makeDays([8.58, 8.57, 8.57, 8.57, 8.57, 8.57, 8.58])[i], totalCost: 8.50 }),
    });
    assert.equal(oneCentOver.succeeded, true); // repaired back under budget
    assert.ok(oneCentOver.attempts > 1);
  });

  test('H/I: a budget miss triggers exactly one repair, and a successful repair passes', async () => {
    const days = makeDays([15, 8, 8, 8, 8, 8, 8]); // sums to 63, over a 60 budget
    let regenerateCalls = 0;
    const { succeeded, attempts, weeklyEvaluation } = await runWeeklyBudgetRepair(days, 60, {
      getDayCost: d => d.totalCost,
      regenerateDay: async (dayIndex, repairContext) => {
        regenerateCalls += 1;
        assert.equal(dayIndex, 0); // the $15 day is the most expensive
        assert.ok(repairContext.targetDayCostUSD < 15);
        return { ...days[dayIndex], totalCost: 10 }; // repaired cheaper -> 10+8*6=58, under budget
      },
    });
    assert.equal(regenerateCalls, 1);
    assert.equal(succeeded, true);
    assert.equal(attempts, 2);
    assert.equal(weeklyEvaluation.costUSD, 58);
  });

  test('J: exhausted repair attempts produce a controlled, bounded failure', async () => {
    const days = makeDays([20, 20, 20, 20, 20, 20, 20]); // wildly over any reasonable budget
    let regenerateCalls = 0;
    const { succeeded, attempts, weeklyEvaluation } = await runWeeklyBudgetRepair(days, 60, {
      getDayCost: d => d.totalCost,
      regenerateDay: async (dayIndex) => { regenerateCalls += 1; return { ...days[dayIndex], totalCost: 20 }; }, // repair never actually helps
    });
    assert.equal(succeeded, false);
    assert.equal(attempts, MAX_WEEKLY_REPAIR_ROUNDS + 1); // 1 initial evaluation + 2 repair rounds
    assert.equal(regenerateCalls, MAX_WEEKLY_REPAIR_ROUNDS); // at most 2 day-level regenerations, never a full week re-roll
    assert.equal(weeklyEvaluation.withinBudget, false);
  });

  test('F: remaining/weekly totals cannot go negative silently — a day with a negative or NaN cost is treated as 0-safe by toCents, not as free budget', () => {
    assert.equal(toCents(NaN), 0);
    assert.equal(toCents(undefined), 0);
  });

  test('K: an AllergyViolationError-like error from regenerateDay propagates immediately, not retried as a budget miss', async () => {
    const days = makeDays([20, 20, 20, 20, 20, 20, 20]);
    class FakeAllergyError extends Error {}
    let regenerateCalls = 0;
    await assert.rejects(
      () => runWeeklyBudgetRepair(days, 60, {
        getDayCost: d => d.totalCost,
        regenerateDay: async () => { regenerateCalls += 1; throw new FakeAllergyError('nuts'); },
      }),
      FakeAllergyError
    );
    assert.equal(regenerateCalls, 1); // failed on the first repair attempt, never retried past it
  });

  test('L: a generic Anthropic/API error from regenerateDay propagates immediately', async () => {
    const days = makeDays([20, 20, 20, 20, 20, 20, 20]);
    let regenerateCalls = 0;
    await assert.rejects(
      () => runWeeklyBudgetRepair(days, 60, {
        getDayCost: d => d.totalCost,
        regenerateDay: async () => { regenerateCalls += 1; throw new Error('anthropic_api_error'); },
      }),
      /anthropic_api_error/
    );
    assert.equal(regenerateCalls, 1);
  });

  test('M: a pricing/database error from regenerateDay propagates immediately', async () => {
    const days = makeDays([20, 20, 20, 20, 20, 20, 20]);
    class FakeDbError extends Error {}
    let regenerateCalls = 0;
    await assert.rejects(
      () => runWeeklyBudgetRepair(days, 60, {
        getDayCost: d => d.totalCost,
        regenerateDay: async () => { regenerateCalls += 1; throw new FakeDbError('turso_unavailable'); },
      }),
      FakeDbError
    );
    assert.equal(regenerateCalls, 1);
  });

  test('onAttempt fires once per evaluation (initial + each repair round), with withinBudget reported correctly', async () => {
    const days = makeDays([15, 8, 8, 8, 8, 8, 8]); // over budget once, then fixed
    const seen = [];
    await runWeeklyBudgetRepair(days, 60, {
      getDayCost: d => d.totalCost,
      regenerateDay: async (i) => ({ ...days[i], totalCost: 10 }),
      onAttempt: (attempt, evaluation) => seen.push({ attempt, withinBudget: evaluation.withinBudget }),
    });
    assert.deepEqual(seen, [{ attempt: 1, withinBudget: false }, { attempt: 2, withinBudget: true }]);
  });

  test('does not mutate the input days array', async () => {
    const days = makeDays([15, 8, 8, 8, 8, 8, 8]);
    const originalFirstCost = days[0].totalCost;
    await runWeeklyBudgetRepair(days, 60, {
      getDayCost: d => d.totalCost,
      regenerateDay: async (i) => ({ ...days[i], totalCost: 10 }),
    });
    assert.equal(days[0].totalCost, originalFirstCost);
  });
});
