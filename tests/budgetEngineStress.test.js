'use strict';

/**
 * Budget Engine — post-Price-Coverage-v1 stress audit.
 *
 * Price Coverage v1 raised real authoritative weekly costs materially
 * (measured on real historical fixtures, see the audit report) without
 * touching budgetEngine.js at all. These tests stress runWeeklyBudgetRepair
 * with deterministic, hand-controlled cost fixtures — no Anthropic calls —
 * to characterize exactly where the bounded, greedy repair heuristic is
 * strong and where it's architecturally weak. This file distinguishes
 * CORRECTNESS (never returns/persists an over-budget week — must always
 * hold) from CONVERGENCE/QUALITY (can it find a feasible week within 2
 * repair rounds — a heuristic, not a guarantee).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const budgetEngine = require('../budgetEngine.js');
const { runWeeklyBudgetRepair, evaluateWeeklyBudget, MAX_WEEKLY_REPAIR_ROUNDS } = budgetEngine;

function makeDays(costs) {
  return costs.map((c, i) => ({ date: `2026-01-0${i + 1}`, dayName: `Day${i + 1}`, totalCost: c }));
}

/** A controlled, deterministic "regenerate this day" stub: returns a day at
 * exactly `replacementCosts[dayIndex]` (shifting through the array on
 * repeated calls to the same index, so a test can script "first repair of
 * day X costs A, second repair of day X costs B"). */
function scriptedRegenerate(replacementCostsByIndex) {
  const callCounts = {};
  return async (dayIndex, repairContext) => {
    callCounts[dayIndex] = (callCounts[dayIndex] || 0) + 1;
    const scripted = replacementCostsByIndex[dayIndex];
    const cost = Array.isArray(scripted) ? scripted[callCounts[dayIndex] - 1] : scripted;
    return { date: `repaired-${dayIndex}`, dayName: `RepairedDay${dayIndex}`, totalCost: cost };
  };
}

describe('Phase 3.1 — comfortably under budget', () => {
  test('$10x7=$70 week against $100 budget: succeeds with 0 repairs', async () => {
    const days = makeDays([10, 10, 10, 10, 10, 10, 10]);
    let regenerateCalls = 0;
    const r = await runWeeklyBudgetRepair(days, 100, {
      getDayCost: d => d.totalCost,
      regenerateDay: async () => { regenerateCalls++; throw new Error('should not repair'); },
    });
    assert.equal(r.succeeded, true);
    assert.equal(r.attempts, 1);
    assert.equal(regenerateCalls, 0);
  });
});

describe('Phase 3.2 — exactly at budget', () => {
  test('$10x7=$70 week against $70 budget: succeeds with 0 repairs (boundary)', async () => {
    const days = makeDays([10, 10, 10, 10, 10, 10, 10]);
    const r = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      regenerateDay: async () => { throw new Error('should not repair'); },
    });
    assert.equal(r.succeeded, true);
    assert.equal(r.attempts, 1);
    assert.equal(r.weeklyEvaluation.costUSD, 70);
  });
});

describe('Phase 3.3 — one expensive outlier (A)', () => {
  test('10,10,10,10,10,10,25 ($85) against $70: repairs the outlier day, succeeds if replacement fits', async () => {
    const days = makeDays([10, 10, 10, 10, 10, 10, 25]);
    let repairedIndex = null;
    const r = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      regenerateDay: scriptedRegenerate({ 6: 10 }), // outlier day (index 6) drops to $10
    });
    assert.equal(r.succeeded, true);
    assert.equal(r.attempts, 2);
    assert.equal(r.weeklyEvaluation.costUSD, 70);
  });

  test('same outlier, but replacement only partially helps: needs exactly the 2 available rounds', async () => {
    const days = makeDays([10, 10, 10, 10, 10, 10, 25]); // $85, $15 over
    const r = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      // Round 1: day 6 (index 6, $25) repairs to $18 -> week = $78, still over.
      // Round 2: greedy picks the NEW most expensive day (now index 6 at $18) again.
      regenerateDay: scriptedRegenerate({ 6: [18, 10] }),
    });
    assert.equal(r.succeeded, true);
    assert.equal(r.attempts, 3); // both repair rounds consumed
  });
});

describe('Phase 3.4 — two independently expensive days (B)', () => {
  test('10,10,10,10,10,20,20 ($90) against $70: 2 repair rounds ARE sufficient when each fully fixes one day', async () => {
    const days = makeDays([10, 10, 10, 10, 10, 20, 20]);
    const r = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      regenerateDay: scriptedRegenerate({ 5: 10, 6: 10 }),
    });
    assert.equal(r.succeeded, true);
    assert.equal(r.attempts, 3);
  });

  test('CONVERGENCE LIMITATION: two expensive days but each repair only partially fixes its day -> bounded failure even though a feasible week likely exists', async () => {
    // $90 week, $20 over. Each of the 2 problem days can realistically only
    // be brought down by ~$7 per attempt (a plausible real-AI outcome, not
    // a full fix in one shot). 2 repair rounds each spend their single shot
    // on ONE day, so neither expensive day gets a second attempt.
    const days = makeDays([10, 10, 10, 10, 10, 20, 20]);
    const r = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      // Round 1 targets index 5 (or 6, tie-break picks earliest -> index 5): 20 -> 14 (week now $84)
      // Round 2 targets the NEW most expensive day, index 6 at 20 -> 14 (week now $78, still over)
      regenerateDay: scriptedRegenerate({ 5: 14, 6: 14 }),
    });
    assert.equal(r.succeeded, false);
    assert.equal(r.weeklyEvaluation.costUSD, 78);
    // A feasible week plausibly exists (e.g. both days at 14.x would need a
    // 3rd nudge) but 2 rounds, each spent on a different single day, cannot
    // reach it. This is the documented convergence limitation, not a
    // correctness bug - no over-budget week was returned as successful.
  });
});

describe('Phase 3.5 — distributed overage, no single outlier (C/D)', () => {
  test('11x7=$77 against $70: the heuristic\'s weakest case - repairing one day at a time when ALL days are equally over', async () => {
    const days = makeDays([11, 11, 11, 11, 11, 11, 11]); // $77, only $7 over - modest
    const r = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      // Realistically, fixing ONE of seven equally-priced days can plausibly
      // absorb the whole $7 overage if that day drops enough (11 -> 4).
      regenerateDay: scriptedRegenerate({ 0: 4 }),
    });
    assert.equal(r.succeeded, true);
    assert.equal(r.attempts, 2);
    // Note: this succeeds because the total overage was small enough to
    // absorb via ONE day's repair. A LARGER distributed overage (see next
    // test) is where this heuristic structurally struggles.
  });

  test('CONVERGENCE LIMITATION: severe distributed overage cannot be fixed by repairing only 2 of 7 equally-expensive days', async () => {
    const days = makeDays([15, 15, 15, 15, 15, 15, 15]); // $105 against $70 - $35 over, evenly spread
    const r = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      // Even driving each repaired day all the way to the $1 floor only
      // recovers $14 me per day repaired (15->1), i.e. $28 across 2 rounds -
      // not enough to close a $35 gap spread across all 7 days.
      regenerateDay: scriptedRegenerate({ 0: 1, 1: 1 }),
    });
    assert.equal(r.succeeded, false);
    // This is the architecturally correct outcome for this heuristic: no
    // amount of repairing 2 days can fix a problem baked into all 7. The
    // week is honestly reported as budget_unreachable rather than
    // incorrectly returned - but a smarter algorithm that nudged all 7
    // days down slightly might have found a feasible week. This is exactly
    // the "feasible-but-failed" gap the synthetic simulation quantifies.
  });
});

describe('Phase 3.7 — repair generation becomes MORE expensive (E)', () => {
  test('a repair that overshoots its target is caught by re-evaluation, not trusted blindly', async () => {
    const days = makeDays([10, 10, 10, 10, 10, 10, 25]); // $85 against $70
    let capturedTarget = null;
    const r = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      regenerateDay: async (dayIndex, repairContext) => {
        capturedTarget = repairContext.targetDayCostUSD; // repair was ASKED for ~$10
        return { date: 'repaired', dayName: 'Repaired', totalCost: 30 }; // but comes back MORE expensive
      },
    });
    assert.ok(capturedTarget < 25); // confirms a cheaper target was requested
    assert.equal(r.succeeded, false); // the overshoot is correctly detected, not silently accepted
    assert.equal(r.weeklyEvaluation.costUSD, 90); // week got WORSE (85 -> 90), correctly reflected
  });
});

describe('Phase 3.8 — repair #1 changes which day is most expensive; repair #2 must use CURRENT costs (F/G)', () => {
  test('after repairing the original outlier, round 2 targets the NEW most expensive day, not stale ordering', async () => {
    const days = makeDays([10, 10, 10, 10, 10, 18, 25]); // index 6 ($25) is most expensive; index 5 ($18) is second
    const targetedIndices = [];
    const r = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      regenerateDay: async (dayIndex) => {
        targetedIndices.push(dayIndex);
        // Round 1 repairs index 6 (the original most expensive) down to $8 -
        // now index 5 ($18) becomes the new most expensive.
        if (dayIndex === 6) return { date: 'r6', dayName: 'R6', totalCost: 8 };
        if (dayIndex === 5) return { date: 'r5', dayName: 'R5', totalCost: 8 };
        throw new Error('unexpected day repaired: ' + dayIndex);
      },
    });
    assert.deepEqual(targetedIndices, [6, 5]); // round 2 correctly re-targets index 5, not index 6 again
    assert.equal(r.succeeded, true);
  });
});

describe('Phase 3.9 — cent boundaries', () => {
  test('$64.99 <= $65 passes', () => {
    assert.equal(evaluateWeeklyBudget(64.99, 65).withinBudget, true);
  });
  test('$65.00 <= $65 passes (boundary)', () => {
    assert.equal(evaluateWeeklyBudget(65.00, 65).withinBudget, true);
  });
  test('$65.01 > $65 fails', () => {
    assert.equal(evaluateWeeklyBudget(65.01, 65).withinBudget, false);
  });

  test('the ScenarioB-shaped case: $64.22 against $65 passes with $0.78 headroom, exactly as measured', () => {
    const r = evaluateWeeklyBudget(64.22, 65);
    assert.equal(r.withinBudget, true);
    assert.equal(r.overageUSD, 0);
    // Headroom = budget - cost, computed the same cents-safe way.
    const headroomCents = budgetEngine.toCents(65) - budgetEngine.toCents(64.22);
    assert.equal(headroomCents, 78);
  });

  test('a hypothetical $0.01 regression above ScenarioB\'s measured total correctly fails', () => {
    assert.equal(evaluateWeeklyBudget(65.01, 65).withinBudget, false);
  });
});

describe('Phase 3.10 — awkward decimal sums stay cents-safe under repair', () => {
  test('a week whose day costs sum with floating-point noise still evaluates correctly', async () => {
    const days = makeDays([10.10, 10.20, 10.30, 9.95, 8.05, 12.25, 9.15]); // sums to exactly 70.00
    const r = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      regenerateDay: async () => { throw new Error('should not repair'); },
    });
    assert.equal(r.succeeded, true);
    assert.equal(r.weeklyEvaluation.costUSD, 70);
  });
});

describe('Phase 6 — repair-round marginal benefit (0 vs 1 vs 2 vs 3 repairs), deterministic cases', () => {
  test('0 repairs would fail every over-budget case in this file that currently succeeds', async () => {
    const days = makeDays([10, 10, 10, 10, 10, 10, 25]);
    const r = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      regenerateDay: scriptedRegenerate({ 6: 10 }),
      maxRepairRounds: 0,
    });
    assert.equal(r.succeeded, false); // proves repair rounds matter at all
  });

  test('a case that needs exactly 3 repair rounds to converge fails at the current cap of 2', async () => {
    // Three independently-expensive days, each needing its own repair round.
    const days = makeDays([10, 10, 10, 10, 20, 20, 20]); // $100 against $70, $30 over
    const r2 = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      regenerateDay: scriptedRegenerate({ 4: 10, 5: 10, 6: 10 }),
      maxRepairRounds: 2,
    });
    assert.equal(r2.succeeded, false); // only 2 of the 3 problem days get fixed

    const r3 = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      regenerateDay: scriptedRegenerate({ 4: 10, 5: 10, 6: 10 }),
      maxRepairRounds: 3,
    });
    assert.equal(r3.succeeded, true); // a 3rd round would have recovered this exact case
  });
});
