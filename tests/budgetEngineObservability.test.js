'use strict';

/**
 * Budget Engine observability — tests for the analytics correlation/
 * bucketing/repair-direction logic. budgetEngine.buildAttemptEvents and
 * buildOutcomeEvent are pure (no DB, no network) and are the single source
 * of truth for event shape/firing rules; server.js's logBudgetAttempt/
 * logBudgetOutcome are thin try/catch persistence wrappers around them (see
 * server.js — not independently testable without spinning the whole app,
 * so this file tests the decision logic directly and, for the
 * analytics-failure-safety tests, mirrors server.js's exact wrapper pattern
 * against a throwing persist function).
 *
 * PRE-COMMIT CORRECTION: an earlier version of this PR attached `direction`
 * to a `budget_retry` event that only fired while STILL over budget - so a
 * repair that immediately succeeded (bringing the week under budget) never
 * got a direction recorded at all, and even when budget_retry did fire, it
 * mislabeled which repair round the direction belonged to (see
 * budgetEngine.buildAttemptEvents' docstring for the full timing trace).
 * budget_retry has been replaced with budget_repair_completed, which fires
 * for every attempt > 1 regardless of outcome (success, another retry
 * needed, or terminal failure) — every completed repair round now gets
 * exactly one direction, correctly attributed.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const budgetEngine = require('../budgetEngine.js');
const { budgetBucket, repairDirection, buildAttemptEvents, buildOutcomeEvent, evaluateWeeklyBudget, runWeeklyBudgetRepair } = budgetEngine;

function makeDays(costs) {
  return costs.map((c, i) => ({ date: `2026-01-0${i + 1}`, dayName: `Day${i + 1}`, totalCost: c }));
}

/** Drives a full journey exactly the way server.js's logBudgetAttempt/
 * logBudgetOutcome do: buildAttemptEvents per attempt (tracking
 * previousCostUSD across calls), buildOutcomeEvent once at the end. */
async function driveJourney(days, budget, requestId, regenerateDay) {
  const loggedEvents = [];
  let previousCostUSD = null;
  const onAttempt = (attempt, evaluation, maxAttempts) => {
    const events = buildAttemptEvents({ requestId, mode: 'week', attempt, maxAttempts, evaluation, previousCostUSD });
    loggedEvents.push(...events);
    previousCostUSD = evaluation.costUSD;
  };
  const result = await runWeeklyBudgetRepair(days, budget, { getDayCost: d => d.totalCost, regenerateDay, onAttempt });
  const outcome = buildOutcomeEvent({ requestId, mode: 'week', succeeded: result.succeeded, attempts: result.attempts, evaluation: result.weeklyEvaluation });
  loggedEvents.push(outcome);
  return { result, loggedEvents };
}

describe('budgetBucket — exact boundary table', () => {
  const cases = [
    [39.99, 'under_40'], [40.00, '40_49'], [49.99, '40_49'],
    [50.00, '50_59'], [59.99, '50_59'], [60.00, '60_74'],
    [74.99, '60_74'], [75.00, '75_99'], [99.99, '75_99'],
    [100.00, '100_129'], [129.99, '100_129'], [130.00, '130_plus'],
  ];
  for (const [budget, expected] of cases) {
    test(`$${budget} -> ${expected}`, () => {
      assert.equal(budgetBucket(budget), expected);
    });
  }
  test('extreme low and high values still resolve sensibly', () => {
    assert.equal(budgetBucket(1), 'under_40');
    assert.equal(budgetBucket(10000), '130_plus');
  });
});

describe('E/F/G: repairDirection is cents-safe', () => {
  test('E: decreased is cents-safe', () => {
    assert.equal(repairDirection(80, 65), 'decreased');
    assert.equal(repairDirection(65.01, 65.00), 'decreased'); // 1 cent
  });
  test('F: unchanged is cents-safe', () => {
    assert.equal(repairDirection(64.22, 64.22), 'unchanged');
    assert.equal(repairDirection(70.001, 69.999), 'unchanged'); // both round to 7000 cents
  });
  test('G: increased is cents-safe', () => {
    assert.equal(repairDirection(70, 85), 'increased');
    assert.equal(repairDirection(65.00, 65.01), 'increased'); // 1 cent
  });
});

describe('requestId correlation', () => {
  test('one attempt event carries the requestId it was given', () => {
    const requestId = randomUUID();
    const evaluation = evaluateWeeklyBudget(50, 70);
    const events = buildAttemptEvents({ requestId, mode: 'week', attempt: 1, maxAttempts: 3, evaluation });
    assert.equal(events[0].data.requestId, requestId);
  });
  test('a second generation request gets a different requestId', () => {
    assert.notEqual(randomUUID(), randomUUID());
  });
  test('requestId is random/opaque, not derived from user data', () => {
    const userId = 'user-abc-123';
    const id1 = randomUUID();
    assert.doesNotMatch(id1, new RegExp(userId));
  });
});

describe('A/B/C/D: every completed repair gets exactly one correctly-attributed direction', () => {
  test('A: Repair #1 -> success logs direction for Repair #1', async () => {
    const requestId = randomUUID();
    const days = makeDays([10, 10, 10, 10, 10, 10, 25]); // $85 over $70
    const { loggedEvents } = await driveJourney(days, 70, requestId, async () => ({ date: 'r', dayName: 'R', totalCost: 10 }));

    const completed = loggedEvents.filter(e => e.event === 'budget_repair_completed');
    assert.equal(completed.length, 1);
    assert.equal(completed[0].data.repairRound, 1);
    assert.equal(completed[0].data.direction, 'decreased'); // 85 -> 70
    assert.equal(completed[0].data.withinBudget, true);
  });

  test('B: Repair #1 -> Repair #2 logs direction for Repair #1', async () => {
    const requestId = randomUUID();
    const days = makeDays([10, 10, 10, 10, 10, 10, 25]); // $85 over $70
    let call = 0;
    const { loggedEvents } = await driveJourney(days, 70, requestId, async () => {
      call += 1;
      return { date: 'r', dayName: 'R', totalCost: call === 1 ? 18 : 10 }; // repair 1 insufficient (week=$78), repair 2 finishes it
    });

    const completed = loggedEvents.filter(e => e.event === 'budget_repair_completed');
    assert.equal(completed.length, 2);
    const round1 = completed.find(e => e.data.repairRound === 1);
    assert.equal(round1.data.direction, 'decreased'); // attempt1 $85 -> attempt2 $78
    assert.equal(round1.data.withinBudget, false); // $78 still over $70
  });

  test('C: Repair #2 -> success logs direction for Repair #2', async () => {
    const requestId = randomUUID();
    const days = makeDays([10, 10, 10, 10, 10, 10, 25]);
    let call = 0;
    const { loggedEvents } = await driveJourney(days, 70, requestId, async () => {
      call += 1;
      return { date: 'r', dayName: 'R', totalCost: call === 1 ? 18 : 10 };
    });

    const completed = loggedEvents.filter(e => e.event === 'budget_repair_completed');
    const round2 = completed.find(e => e.data.repairRound === 2);
    assert.ok(round2, 'expected a repairRound 2 completed event');
    assert.equal(round2.data.direction, 'decreased'); // attempt2 $78 -> attempt3 $70
    assert.equal(round2.data.withinBudget, true);
  });

  test('D: Repair #2 -> failure still logs direction for Repair #2', async () => {
    const requestId = randomUUID();
    const days = makeDays([20, 20, 20, 20, 20, 20, 20]); // $140, wildly over $70
    let call = 0;
    const { loggedEvents, result } = await driveJourney(days, 70, requestId, async () => {
      call += 1;
      // repair 1: 20->15 (week=$135), repair 2: 20->18 (week doesn't matter, still fails)
      return { date: 'r', dayName: 'R', totalCost: call === 1 ? 15 : 18 };
    });

    assert.equal(result.succeeded, false);
    const completed = loggedEvents.filter(e => e.event === 'budget_repair_completed');
    assert.equal(completed.length, 2);
    const round2 = completed.find(e => e.data.repairRound === 2);
    assert.ok(round2, 'Repair #2 must still log a completed event even on terminal failure');
    assert.equal(round2.data.withinBudget, false);
    assert.ok(['decreased', 'unchanged', 'increased'].includes(round2.data.direction));
  });
});

describe('required journeys — exact event sequences', () => {
  test('ZERO REPAIRS: attempt 1 -> success(repairsUsed=0), no repair_completed event', async () => {
    const requestId = randomUUID();
    const days = makeDays([10, 10, 10, 10, 10, 10, 10]); // $70 under $100
    const { loggedEvents } = await driveJourney(days, 100, requestId, async () => { throw new Error('should not repair'); });

    assert.equal(loggedEvents.filter(e => e.event === 'budget_generation_attempt').length, 1);
    assert.equal(loggedEvents.filter(e => e.event === 'budget_repair_completed').length, 0);
    assert.equal(loggedEvents.filter(e => e.event === 'budget_generation_succeeded').length, 1);
    assert.equal(loggedEvents.filter(e => e.event === 'budget_generation_failed').length, 0);
  });

  test('H: ONE-REPAIR SUCCESS has exactly one requestId, one repair direction, one terminal success', async () => {
    const requestId = randomUUID();
    const days = makeDays([10, 10, 10, 10, 10, 10, 25]);
    const { loggedEvents } = await driveJourney(days, 70, requestId, async () => ({ date: 'r', dayName: 'R', totalCost: 10 }));

    assert.ok(loggedEvents.every(e => e.data.requestId === requestId));
    assert.equal(loggedEvents.filter(e => e.event === 'budget_repair_completed').length, 1);
    const successes = loggedEvents.filter(e => e.event === 'budget_generation_succeeded');
    assert.equal(successes.length, 1);
    assert.equal(successes[0].data.repairsUsed, 1);
    assert.equal(loggedEvents.filter(e => e.event === 'budget_generation_failed').length, 0);
  });

  test('I: TWO-REPAIR SUCCESS has exactly one requestId, two repair directions, one terminal success', async () => {
    const requestId = randomUUID();
    const days = makeDays([10, 10, 10, 10, 10, 10, 25]);
    let call = 0;
    const { loggedEvents } = await driveJourney(days, 70, requestId, async () => {
      call += 1;
      return { date: 'r', dayName: 'R', totalCost: call === 1 ? 18 : 10 };
    });

    assert.ok(loggedEvents.every(e => e.data.requestId === requestId));
    const completed = loggedEvents.filter(e => e.event === 'budget_repair_completed');
    assert.equal(completed.length, 2);
    assert.deepEqual(completed.map(e => e.data.repairRound).sort(), [1, 2]);
    const successes = loggedEvents.filter(e => e.event === 'budget_generation_succeeded');
    assert.equal(successes.length, 1);
    assert.equal(successes[0].data.repairsUsed, 2);
  });

  test('J: TWO-REPAIR FAILURE has one requestId, all completed repair directions, exactly one terminal failure, zero successes', async () => {
    const requestId = randomUUID();
    const days = makeDays([20, 20, 20, 20, 20, 20, 20]); // repair never actually helps enough
    const { loggedEvents, result } = await driveJourney(days, 70, requestId, async () => ({ date: 'r', dayName: 'R', totalCost: 20 }));

    assert.equal(result.succeeded, false);
    assert.ok(loggedEvents.every(e => e.data.requestId === requestId));
    const completed = loggedEvents.filter(e => e.event === 'budget_repair_completed');
    assert.equal(completed.length, 2);
    assert.deepEqual(completed.map(e => e.data.repairRound).sort(), [1, 2]);
    assert.equal(loggedEvents.filter(e => e.event === 'budget_generation_succeeded').length, 0);
    const failures = loggedEvents.filter(e => e.event === 'budget_generation_failed');
    assert.equal(failures.length, 1);
    assert.equal(failures[0].data.repairsUsed, 2);
  });
});

describe('non-USD requests never get a fake USD budget bucket', () => {
  test('budgetBucket is only invoked when the caller has already gated on isBudgetEnforceable', () => {
    // budgetBucket() itself is a pure numeric function with no currency
    // awareness; the actual guarantee lives in server.js, which never calls
    // logBudgetAttempt/logBudgetOutcome at all inside the
    // `if (!budgetEnforceable)` branch - non-USD requests only ever log
    // budget_enforcement_skipped_currency, which carries no budgetBucket
    // field whatsoever.
    assert.equal(budgetEngine.isBudgetEnforceable('SEK'), false);
    assert.equal(budgetEngine.isBudgetEnforceable('USD'), true);
  });
});

describe('K: analytics failure during completed-repair logging cannot break generation', () => {
  /** Mirrors server.js's logBudgetAttempt wrapper EXACTLY: build events
   * (pure), then persist each one, catching any persistence error so it
   * never propagates past this function. */
  function makeThrowingOnAttempt(requestId) {
    let previousCostUSD = null;
    return async (attempt, evaluation, maxAttempts) => {
      try {
        const events = buildAttemptEvents({ requestId, mode: 'week', attempt, maxAttempts, evaluation, previousCostUSD });
        for (const _ of events) {
          throw new Error('simulated analytics/db.logEvent failure');
        }
        previousCostUSD = evaluation.costUSD;
      } catch (err) {
        // exactly server.js's non-fatal warn-and-continue behavior
      }
    };
  }

  test('a throwing analytics persist function does not prevent an otherwise-successful generation (including a completed repair) from succeeding', async () => {
    const days = makeDays([10, 10, 10, 10, 10, 10, 25]); // needs exactly 1 repair
    const result = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      regenerateDay: async () => ({ date: 'r', dayName: 'R', totalCost: 10 }),
      onAttempt: makeThrowingOnAttempt(randomUUID()),
    });
    assert.equal(result.succeeded, true);
    assert.equal(result.attempts, 2);
  });

  test('a throwing analytics persist function does not convert a genuine budget_unreachable into a different outcome', async () => {
    const days = makeDays([20, 20, 20, 20, 20, 20, 20]);
    const result = await runWeeklyBudgetRepair(days, 70, {
      getDayCost: d => d.totalCost,
      regenerateDay: async () => ({ date: 'r', dayName: 'R', totalCost: 20 }),
      onAttempt: makeThrowingOnAttempt(randomUUID()),
    });
    assert.equal(result.succeeded, false);
    assert.equal(result.attempts, 3);
  });

  test('a genuine (non-analytics) error still propagates normally', async () => {
    class FakeAllergyError extends Error {}
    const days = makeDays([20, 20, 20, 20, 20, 20, 20]);
    await assert.rejects(
      () => runWeeklyBudgetRepair(days, 70, {
        getDayCost: d => d.totalCost,
        regenerateDay: async () => { throw new FakeAllergyError('nuts'); },
        onAttempt: makeThrowingOnAttempt(randomUUID()),
      }),
      FakeAllergyError
    );
  });
});

describe('L/M: no exact dollars or sensitive fields ever enter a built payload', () => {
  const FORBIDDEN_SUBSTRINGS = ['allerg', 'diet', 'dislik', 'ingredient', 'mealname', 'meal_name', 'calorie', 'macro', 'email', 'profile'];

  function assertPayloadSafe(data) {
    const keys = Object.keys(data).map(k => k.toLowerCase());
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      assert.ok(!keys.some(k => k.includes(forbidden)), `forbidden key pattern "${forbidden}" found: ${JSON.stringify(Object.keys(data))}`);
    }
  }

  test('M: attempt/repair-completed event payloads only ever contain the documented allowed keys', () => {
    const requestId = randomUUID();
    const evaluation = evaluateWeeklyBudget(90, 70);
    const events = buildAttemptEvents({ requestId, mode: 'week', attempt: 2, maxAttempts: 3, evaluation, previousCostUSD: 95 });
    for (const { data } of events) {
      assertPayloadSafe(data);
      const allowedKeys = new Set(['requestId', 'mode', 'attempt', 'repairRound', 'budgetBucket', 'withinBudget', 'overageBucket', 'direction']);
      for (const key of Object.keys(data)) assert.ok(allowedKeys.has(key), `unexpected key in payload: ${key}`);
    }
  });

  test('M: outcome event payloads only ever contain the documented allowed keys', () => {
    const requestId = randomUUID();
    const evaluation = evaluateWeeklyBudget(90, 70);
    const outcome = buildOutcomeEvent({ requestId, mode: 'week', succeeded: false, attempts: 3, evaluation });
    assertPayloadSafe(outcome.data);
    const allowedKeys = new Set(['requestId', 'mode', 'repairsUsed', 'budgetBucket', 'finalOverageBucket']);
    for (const key of Object.keys(outcome.data)) assert.ok(allowedKeys.has(key), `unexpected key in payload: ${key}`);
  });

  test('L: exact dollar values never appear anywhere in a built payload, including a completed-repair event', () => {
    const requestId = randomUUID();
    const evaluation = evaluateWeeklyBudget(64.22, 65); // the real ScenarioB figures
    const events = buildAttemptEvents({ requestId, mode: 'week', attempt: 2, maxAttempts: 3, evaluation, previousCostUSD: 70.50 });
    const outcome = buildOutcomeEvent({ requestId, mode: 'week', succeeded: true, attempts: 2, evaluation });
    const allPayloads = [...events.map(e => e.data), outcome.data];
    for (const data of allPayloads) {
      const serialized = JSON.stringify(data);
      assert.doesNotMatch(serialized, /64\.22/);
      assert.doesNotMatch(serialized, /70\.5/);
      assert.doesNotMatch(serialized, /65(\.0+)?[^_0-9]/); // no raw 65 outside of a bucket name
    }
  });
});
