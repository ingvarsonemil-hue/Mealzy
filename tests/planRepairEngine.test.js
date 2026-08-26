'use strict';

/**
 * Plan Repair Engine — combined budget + macro repair loop.
 *
 * These tests exist to prove #6/#7/#8 of the macro-enforcement report hold:
 * macro repair does NOT stack a second retry loop on Budget Engine, budget
 * and macro repairs share one bounded attempt ceiling, and a repair for one
 * constraint cannot silently break or erase evaluation of the other.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const budgetEngine = require('../budgetEngine.js');
const macroEngine = require('../macroEngine.js');
const planRepairEngine = require('../planRepairEngine.js');
const { runCombinedDayRepair, runCombinedWeeklyRepair, pickWorstMacroDayIndex } = planRepairEngine;

const TARGET = { protein: 179, carbs: 238, fat: 79 };
// The exact screenshot case.
const SCREENSHOT_ACTUAL = { protein: 129, carbs: 195, fat: 109 };

function dayResult({ cost = 10, protein = 179, carbs = 238, fat = 79 } = {}) {
  return { totalCost: cost, totalProtein: protein, totalCarbs: carbs, totalFat: fat };
}

describe('runCombinedDayRepair — non-USD (budgetEnforceable: false): macro repair must still run', () => {
  test('a macro miss triggers a repair attempt even with no budget enforcement', async () => {
    let calls = 0;
    const r = await runCombinedDayRepair(async () => {
      calls++;
      return calls === 1 ? dayResult({ cost: 999999, ...SCREENSHOT_ACTUAL }) : dayResult({ cost: 999999, ...TARGET });
    }, { budgetEnforceable: false, macroTargets: TARGET });
    assert.equal(calls, 2, 'macro repair must fire regardless of currency/budget enforcement');
    assert.equal(r.macroEval.withinTolerance, true);
  });

  test('an in-tolerance plan does not repair, even with an absurd cost (budget is genuinely not evaluated)', async () => {
    let calls = 0;
    const r = await runCombinedDayRepair(async () => { calls++; return dayResult({ cost: 999999, ...TARGET }); }, {
      budgetEnforceable: false,
      macroTargets: TARGET,
    });
    assert.equal(calls, 1);
    assert.equal(r.attempts, 1);
  });

  test('budgetEval is null throughout — never fabricates a budget verdict for an unsupported currency', async () => {
    const r = await runCombinedDayRepair(async () => dayResult({ cost: 999999, ...SCREENSHOT_ACTUAL }), {
      budgetEnforceable: false,
      macroTargets: TARGET,
    });
    assert.equal(r.budgetEval, null);
    assert.equal(r.succeeded, true, 'a macro-only miss must never hard-fail, and budget can never be the cause when unenforced');
  });

  test('the repair prompt context never contains a fabricated budget instruction', async () => {
    let calls = 0;
    let secondCallContext = null;
    await runCombinedDayRepair(async (repairContext) => {
      calls++;
      if (calls === 1) return dayResult({ cost: 999999, ...SCREENSHOT_ACTUAL });
      secondCallContext = repairContext;
      return dayResult({ cost: 999999, ...TARGET });
    }, { budgetEnforceable: false, macroTargets: TARGET });
    assert.equal(secondCallContext.budget, null, 'non-USD repair context must never carry budget guidance');
    assert.ok(secondCallContext.macro, 'non-USD repair context must still carry macro guidance');
  });

  test('non-USD single-day ceiling is the SAME shared ceiling as USD (3), not a separate/smaller one', async () => {
    let calls = 0;
    await runCombinedDayRepair(async () => { calls++; return dayResult({ cost: 999999, ...SCREENSHOT_ACTUAL }); }, {
      budgetEnforceable: false,
      macroTargets: TARGET,
    });
    assert.equal(calls, budgetEngine.MAX_GENERATION_ATTEMPTS);
  });
});

describe('runCombinedDayRepair — single day, shared loop', () => {
  test('inside ±15% on both axes -> no repair (1 call, attempt count 1)', async () => {
    let calls = 0;
    const r = await runCombinedDayRepair(async () => { calls++; return dayResult({ cost: 10 }); }, {
      budgetUSD: 15,
      macroTargets: TARGET,
    });
    assert.equal(calls, 1);
    assert.equal(r.attempts, 1);
    assert.equal(r.succeeded, true);
    assert.equal(r.macroEval.withinTolerance, true);
  });

  test('the screenshot case triggers a repair attempt', async () => {
    let calls = 0;
    let sawMacroRepairContext = null;
    const r = await runCombinedDayRepair(async (repairContext) => {
      calls++;
      if (calls === 1) return dayResult({ cost: 10, ...SCREENSHOT_ACTUAL });
      sawMacroRepairContext = repairContext?.macro;
      return dayResult({ cost: 10, ...TARGET }); // attempt 2 fixed
    }, { budgetUSD: 15, macroTargets: TARGET });

    assert.equal(calls, 2);
    assert.ok(sawMacroRepairContext, 'repair prompt must receive macro deviation info');
    assert.equal(sawMacroRepairContext.worstAxis, 'fat');
    assert.equal(r.succeeded, true); // budget was always fine
    assert.equal(r.macroEval.withinTolerance, true); // converged after repair
  });

  test('final unresolved macro miss returns an honest status, not a hard failure', async () => {
    // Every attempt still misses macro; budget is always fine.
    const r = await runCombinedDayRepair(async () => dayResult({ cost: 10, ...SCREENSHOT_ACTUAL }), {
      budgetUSD: 15,
      macroTargets: TARGET,
    });
    assert.equal(r.attempts, budgetEngine.MAX_GENERATION_ATTEMPTS);
    assert.equal(r.succeeded, true, 'macro-only miss must never be a hard failure in Phase 1');
    assert.equal(r.macroEval.status, macroEngine.MACRO_STATUS.OUTSIDE_TARGET_ESTIMATE);
    assert.notEqual(r.macroEval.status, 'certified');
  });

  test('budget failure alone is still a hard failure (existing invariant unchanged)', async () => {
    const r = await runCombinedDayRepair(async () => dayResult({ cost: 100, ...TARGET }), {
      budgetUSD: 15,
      macroTargets: TARGET,
    });
    assert.equal(r.succeeded, false);
    assert.equal(r.attempts, budgetEngine.MAX_GENERATION_ATTEMPTS);
  });

  test('budget + macro failure simultaneously: repair context carries both together', async () => {
    let secondCallContext = null;
    let calls = 0;
    await runCombinedDayRepair(async (repairContext) => {
      calls++;
      if (calls === 1) return dayResult({ cost: 100, ...SCREENSHOT_ACTUAL });
      secondCallContext = repairContext;
      return dayResult({ cost: 10, ...TARGET });
    }, { budgetUSD: 15, macroTargets: TARGET });

    assert.ok(secondCallContext.budget, 'must include budget guidance');
    assert.ok(secondCallContext.macro, 'must include macro guidance');
  });

  test('the model-call ceiling is exactly budgetEngine.MAX_GENERATION_ATTEMPTS, never more', async () => {
    let calls = 0;
    await runCombinedDayRepair(async () => { calls++; return dayResult({ cost: 100, ...SCREENSHOT_ACTUAL }); }, {
      budgetUSD: 15,
      macroTargets: TARGET,
    });
    assert.equal(calls, budgetEngine.MAX_GENERATION_ATTEMPTS);
  });
});

describe('runCombinedWeeklyRepair — week mode, one shared loop', () => {
  function makeDays(specs) {
    return specs.map((s, i) => ({ date: `2026-01-0${i + 1}`, dayName: `Day${i + 1}`, ...dayResult(s) }));
  }

  test('all 7 days within budget and macro tolerance -> 0 repairs', async () => {
    const days = makeDays(Array(7).fill({ cost: 10, ...TARGET }));
    let regenCalls = 0;
    const r = await runCombinedWeeklyRepair(days, 100, TARGET, {
      regenerateDay: async () => { regenCalls++; throw new Error('should not repair'); },
    });
    assert.equal(r.succeeded, true);
    assert.equal(r.attempts, 1);
    assert.equal(regenCalls, 0);
    assert.ok(r.dayMacroEvals.every((ev) => ev.withinTolerance));
  });

  test('multiple macro failures: the worst-deviation day is repaired first', async () => {
    const days = makeDays([
      { cost: 10, ...TARGET },
      { cost: 10, protein: 140, carbs: 238, fat: 79 },   // mild miss (~-21.8%)
      { cost: 10, ...SCREENSHOT_ACTUAL },                 // severe miss (fat +38%)
      { cost: 10, ...TARGET },
      { cost: 10, ...TARGET },
      { cost: 10, ...TARGET },
      { cost: 10, ...TARGET },
    ]);
    const repairedIndices = [];
    await runCombinedWeeklyRepair(days, 100, TARGET, {
      regenerateDay: async (dayIndex) => {
        repairedIndices.push(dayIndex);
        return { date: `r${dayIndex}`, dayName: `R${dayIndex}`, ...dayResult(TARGET) };
      },
    });
    assert.equal(repairedIndices[0], 2, 'the severe screenshot-shaped day must be repaired before the mild one');
  });

  test('budget + macro failure simultaneously (different days): budget invariant still repairs the most expensive day first', async () => {
    const days = makeDays([
      { cost: 10, ...TARGET },
      { cost: 10, ...TARGET },
      { cost: 40, ...TARGET },           // over-budget outlier
      { cost: 10, ...SCREENSHOT_ACTUAL }, // macro-failing day
      { cost: 10, ...TARGET },
      { cost: 10, ...TARGET },
      { cost: 10, ...TARGET },
    ]);
    // weekly budget: 10*6+40=100, against a 90 budget -> $10 over.
    const repairedIndices = [];
    const r = await runCombinedWeeklyRepair(days, 90, TARGET, {
      regenerateDay: async (dayIndex, repairContext) => {
        repairedIndices.push(dayIndex);
        if (dayIndex === 2) {
          assert.ok(repairContext.budget, 'the over-budget day must receive budget guidance');
          return { date: 'r2', dayName: 'R2', ...dayResult({ cost: 10, ...TARGET }) };
        }
        return { date: `r${dayIndex}`, dayName: `R${dayIndex}`, ...dayResult(TARGET) };
      },
    });
    assert.equal(repairedIndices[0], 2, 'budget stays the priority repair target, matching Budget Engine v1');
    // Round 2 should now go after the still-failing macro day (index 3).
    assert.equal(repairedIndices[1], 3);
    assert.equal(r.succeeded, true);
  });

  test('macro improves (partially) but budget worsens -> the next repair round receives BOTH constraints for that day', async () => {
    // Day 0 starts macro-failing only (screenshot-shaped); budget is fine.
    const days = makeDays([
      { cost: 10, ...SCREENSHOT_ACTUAL },
      { cost: 10, ...TARGET }, { cost: 10, ...TARGET }, { cost: 10, ...TARGET },
      { cost: 10, ...TARGET }, { cost: 10, ...TARGET }, { cost: 10, ...TARGET },
    ]); // $70 total, well within a $100 budget -> only macro fails initially
    const contexts = [];
    await runCombinedWeeklyRepair(days, 100, TARGET, {
      regenerateDay: async (dayIndex, repairContext) => {
        contexts.push(repairContext);
        // Protein/carbs improve into tolerance, but fat overshoots into
        // failure AND the replacement costs enough to blow the weekly
        // budget — both constraints are genuinely broken for round 2.
        return { date: 'r0', dayName: 'R0', ...dayResult({ cost: 50, protein: 155, carbs: 220, fat: 95 }) };
      },
    });
    assert.ok(contexts[0].macro, 'first repair must target the original macro failure');
    assert.equal(contexts[0].budget, null, 'budget was fine on attempt 1, must not be mentioned yet');
    assert.ok(contexts[1], 'a second repair round must have happened');
    assert.ok(contexts[1].budget, 'second repair must carry budget guidance (the fix blew the budget)');
    assert.ok(contexts[1].macro, 'second repair must ALSO still carry macro guidance (fat is still off)');
    assert.equal(contexts[1].macro.worstAxis, 'fat');
  });

  test('budget improves (partially) but macro worsens -> the next repair round receives BOTH constraints for that day', async () => {
    const days = makeDays([
      { cost: 40, ...TARGET }, // over-budget only, macro fine
      { cost: 10, ...TARGET }, { cost: 10, ...TARGET }, { cost: 10, ...TARGET },
      { cost: 10, ...TARGET }, { cost: 10, ...TARGET }, { cost: 10, ...TARGET },
    ]); // $100 total against a $90 budget -> $10 over, macro all fine initially
    const contexts = [];
    await runCombinedWeeklyRepair(days, 90, TARGET, {
      regenerateDay: async (dayIndex, repairContext) => {
        contexts.push(repairContext);
        // Cost drops from $40 to $35 — a real improvement, but not enough to
        // clear the (still slightly over) weekly budget — while the new
        // meal happens to badly miss its macro targets.
        return { date: 'r0', dayName: 'R0', ...dayResult({ cost: 35, ...SCREENSHOT_ACTUAL }) };
      },
    });
    assert.ok(contexts[0].budget, 'first repair must target the original budget failure');
    assert.equal(contexts[0].macro, null, 'macro was fine on attempt 1, must not be mentioned yet');
    assert.ok(contexts[1], 'a second repair round must have happened');
    assert.ok(contexts[1].budget, 'second repair must still carry budget guidance ($35 is still over)');
    assert.ok(contexts[1].macro, 'second repair must ALSO now carry macro guidance for the same day');
  });

  test('budget repair does not erase macro evaluation for untouched days', async () => {
    // Capped to 1 repair round so only the over-budget day (index 0) gets
    // regenerated — day 1 is deliberately left untouched by construction,
    // to prove its macro evaluation survives rather than being dropped or
    // overwritten by the budget-only repair happening elsewhere.
    const days = makeDays([
      { cost: 40, ...TARGET },            // repaired for budget
      { cost: 10, ...SCREENSHOT_ACTUAL }, // left untouched — must still be evaluated
      { cost: 10, ...TARGET },
      { cost: 10, ...TARGET },
      { cost: 10, ...TARGET },
      { cost: 10, ...TARGET },
      { cost: 10, ...TARGET },
    ]);
    const regeneratedIndices = [];
    const r = await runCombinedWeeklyRepair(days, 90, TARGET, {
      maxRepairRounds: 1,
      regenerateDay: async (dayIndex) => {
        regeneratedIndices.push(dayIndex);
        return { date: `r${dayIndex}`, dayName: `R${dayIndex}`, ...dayResult({ cost: 10, ...TARGET }) };
      },
    });
    assert.deepEqual(regeneratedIndices, [0], 'only the over-budget day should have been regenerated');
    // Day 1 (SCREENSHOT_ACTUAL) was never regenerated but must still show up
    // as macro-failing in the final evaluation, not silently dropped.
    assert.equal(r.dayMacroEvals[1].withinTolerance, false);
    assert.equal(r.succeeded, true, 'the budget invariant was fixed even though macro stayed unresolved');
  });

  test('the repair-round ceiling is unchanged: 7 initial + MAX_WEEKLY_REPAIR_ROUNDS repairs, never more', async () => {
    const days = makeDays(Array(7).fill({ cost: 10, ...SCREENSHOT_ACTUAL })); // never converges
    let regenCalls = 0;
    const r = await runCombinedWeeklyRepair(days, 100, TARGET, {
      regenerateDay: async (dayIndex) => { regenCalls++; return { date: `r${dayIndex}`, dayName: `R${dayIndex}`, ...dayResult({ cost: 10, ...SCREENSHOT_ACTUAL }) }; },
    });
    assert.equal(regenCalls, budgetEngine.MAX_WEEKLY_REPAIR_ROUNDS);
    assert.equal(r.attempts, budgetEngine.MAX_WEEKLY_REPAIR_ROUNDS + 1);
    assert.equal(r.succeeded, true, 'macro-only non-convergence must not fail the week');
  });

  test('final unresolved macro miss (week mode) returns honest per-day status, not certified', async () => {
    const days = makeDays(Array(7).fill({ cost: 10, ...SCREENSHOT_ACTUAL }));
    const r = await runCombinedWeeklyRepair(days, 100, TARGET, {
      regenerateDay: async (dayIndex) => ({ date: `r${dayIndex}`, dayName: `R${dayIndex}`, ...dayResult({ cost: 10, ...SCREENSHOT_ACTUAL }) }),
    });
    for (const ev of r.dayMacroEvals) {
      assert.equal(ev.status, macroEngine.MACRO_STATUS.OUTSIDE_TARGET_ESTIMATE);
      assert.notEqual(ev.status, 'certified');
    }
  });
});

describe('runCombinedWeeklyRepair — non-USD (budgetEnforceable: false): macro repair must still run', () => {
  function makeDays(specs) {
    return specs.map((s, i) => ({ date: `2026-01-0${i + 1}`, dayName: `Day${i + 1}`, ...dayResult(s) }));
  }

  test('a macro miss triggers repair even with an absurd cost and no budget enforcement', async () => {
    const days = makeDays([
      { cost: 999999, ...SCREENSHOT_ACTUAL },
      { cost: 999999, ...TARGET }, { cost: 999999, ...TARGET }, { cost: 999999, ...TARGET },
      { cost: 999999, ...TARGET }, { cost: 999999, ...TARGET }, { cost: 999999, ...TARGET },
    ]);
    let regenCalls = 0;
    const r = await runCombinedWeeklyRepair(days, 1, TARGET, { // budget target is nonsensical/irrelevant when unenforced
      budgetEnforceable: false,
      regenerateDay: async (dayIndex) => { regenCalls++; return { date: `r${dayIndex}`, dayName: `R${dayIndex}`, ...dayResult({ cost: 999999, ...TARGET }) }; },
    });
    assert.equal(regenCalls, 1, 'the macro-failing day must be repaired');
    assert.equal(r.dayMacroEvals[0].withinTolerance, true);
  });

  test('an all-in-tolerance week does not repair, regardless of cost', async () => {
    const days = makeDays(Array(7).fill({ cost: 999999, ...TARGET }));
    let regenCalls = 0;
    const r = await runCombinedWeeklyRepair(days, 1, TARGET, {
      budgetEnforceable: false,
      regenerateDay: async () => { regenCalls++; throw new Error('should not repair'); },
    });
    assert.equal(regenCalls, 0);
    assert.equal(r.attempts, 1);
    assert.equal(r.succeeded, true);
  });

  test('weeklyBudgetEval is null throughout — never fabricates a budget verdict', async () => {
    const days = makeDays(Array(7).fill({ cost: 999999, ...SCREENSHOT_ACTUAL }));
    const r = await runCombinedWeeklyRepair(days, 1, TARGET, {
      budgetEnforceable: false,
      regenerateDay: async (dayIndex) => ({ date: `r${dayIndex}`, dayName: `R${dayIndex}`, ...dayResult({ cost: 999999, ...SCREENSHOT_ACTUAL }) }),
    });
    assert.equal(r.weeklyBudgetEval, null);
    assert.equal(r.succeeded, true, 'macro-only non-convergence must never fail the week, and budget cannot be the cause when unenforced');
  });

  test('repair contexts never carry a fabricated budget instruction', async () => {
    const days = makeDays([
      { cost: 999999, ...SCREENSHOT_ACTUAL },
      { cost: 999999, ...TARGET }, { cost: 999999, ...TARGET }, { cost: 999999, ...TARGET },
      { cost: 999999, ...TARGET }, { cost: 999999, ...TARGET }, { cost: 999999, ...TARGET },
    ]);
    const contexts = [];
    await runCombinedWeeklyRepair(days, 1, TARGET, {
      budgetEnforceable: false,
      regenerateDay: async (dayIndex, repairContext) => {
        contexts.push(repairContext);
        return { date: `r${dayIndex}`, dayName: `R${dayIndex}`, ...dayResult({ cost: 999999, ...TARGET }) };
      },
    });
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].budget, null, 'non-USD week repair must never carry budget guidance');
    assert.ok(contexts[0].macro, 'non-USD week repair must still carry macro guidance');
  });

  test('non-USD week ceiling is the SAME shared ceiling as USD (7 initial + 2 repairs = 9 worst case)', async () => {
    const days = makeDays(Array(7).fill({ cost: 999999, ...SCREENSHOT_ACTUAL })); // never converges
    let regenCalls = 0;
    const r = await runCombinedWeeklyRepair(days, 1, TARGET, {
      budgetEnforceable: false,
      regenerateDay: async (dayIndex) => { regenCalls++; return { date: `r${dayIndex}`, dayName: `R${dayIndex}`, ...dayResult({ cost: 999999, ...SCREENSHOT_ACTUAL }) }; },
    });
    assert.equal(regenCalls, budgetEngine.MAX_WEEKLY_REPAIR_ROUNDS);
    assert.equal(r.attempts, budgetEngine.MAX_WEEKLY_REPAIR_ROUNDS + 1);
  });
});

describe('pickWorstMacroDayIndex', () => {
  test('picks the largest-magnitude deviation among failing days', () => {
    const evals = [
      macroEngine.evaluateMacros(TARGET, TARGET),               // fine
      macroEngine.evaluateMacros({ protein: 140, carbs: 238, fat: 79 }, TARGET), // mild
      macroEngine.evaluateMacros(SCREENSHOT_ACTUAL, TARGET),     // severe
    ];
    assert.equal(pickWorstMacroDayIndex(evals), 2);
  });
});
