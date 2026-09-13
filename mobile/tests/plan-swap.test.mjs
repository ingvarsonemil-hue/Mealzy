// Mealzy Mobile — Meal Swap UI pure-logic tests (mobile/src/lib/plan-swap.ts
// and mobile/src/components/plan/plan-current-adapter.ts's parseMealId).
//
// Run with:  node --test mobile/tests/plan-swap.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  slotKey,
  isSlotSwapped,
  parseMealId,
  classifySwapAlternativesResponse,
  classifySwapCommitResponse,
} from '../src/lib/plan-swap.ts';

function emptyWeek(swappedSlots = []) {
  return { weekStart: '2026-09-07', days: [], weeklyTotals: { totalCost: 0, avgCalories: 0, avgProtein: 0, avgCarbs: 0, avgFat: 0 }, swappedSlots };
}

// ── slotKey / isSlotSwapped ──────────────────────────────────────────────────

test('slotKey: joins date and slot with a colon', () => {
  assert.equal(slotKey('2026-09-07', 'breakfast'), '2026-09-07:breakfast');
});

test('isSlotSwapped: true only when the exact key is present', () => {
  const week = emptyWeek(['2026-09-07:breakfast']);
  assert.equal(isSlotSwapped(week, '2026-09-07', 'breakfast'), true);
  assert.equal(isSlotSwapped(week, '2026-09-07', 'lunch'), false);
  assert.equal(isSlotSwapped(week, '2026-09-08', 'breakfast'), false);
});

test('isSlotSwapped: false on an empty swappedSlots list', () => {
  assert.equal(isSlotSwapped(emptyWeek(), '2026-09-07', 'breakfast'), false);
});

// ── classifySwapAlternativesResponse ─────────────────────────────────────────

const RAW_MEAL = {
  type: 'breakfast',
  name: 'Yogurt bowl',
  description: 'Greek yogurt with berries',
  calories: 320,
  protein: 22,
  carbs: 30,
  fat: 8,
  cost: 2.1,
  ingredients: [{ name: 'yogurt', amount: '200g' }],
  cookTime: 5,
  instructions: ['Mix it all together'],
};

test('classifySwapAlternativesResponse: 200 with alternatives -> ok, raw preserved verbatim', () => {
  const result = classifySwapAlternativesResponse({
    status: 200,
    data: { success: true, date: '2026-09-07', slot: 'breakfast', alternatives: [RAW_MEAL] },
  });
  assert.equal(result.kind, 'ok');
  assert.equal(result.alternatives.length, 1);
  assert.deepEqual(result.alternatives[0].raw, RAW_MEAL);
  assert.equal(result.alternatives[0].display.name, 'Yogurt bowl');
  assert.equal(result.alternatives[0].display.calories, 320);
});

test('classifySwapAlternativesResponse: 200 with an empty alternatives array -> error, never ok with nothing to pick', () => {
  const result = classifySwapAlternativesResponse({ status: 200, data: { success: true, alternatives: [] } });
  assert.equal(result.kind, 'error');
});

test('classifySwapAlternativesResponse: 402 pro_required carries the server message', () => {
  const result = classifySwapAlternativesResponse({
    status: 402,
    data: { error: 'pro_required', message: 'Meal swaps are a Pro feature. Upgrade to swap meals.' },
  });
  assert.equal(result.kind, 'pro_required');
  assert.equal(result.message, 'Meal swaps are a Pro feature. Upgrade to swap meals.');
});

test('classifySwapAlternativesResponse: 402 pro_required falls back to a generic message when the server omits one', () => {
  const result = classifySwapAlternativesResponse({ status: 402, data: { error: 'pro_required' } });
  assert.equal(result.kind, 'pro_required');
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
});

test('classifySwapAlternativesResponse: 409 slot_already_swapped -> already_swapped (NOT 400 - verified against routes/mealSwap.js)', () => {
  const result = classifySwapAlternativesResponse({ status: 409, data: { error: 'slot_already_swapped' } });
  assert.equal(result.kind, 'already_swapped');
});

test('classifySwapAlternativesResponse: 503 -> busy, a retry-friendly non-error state', () => {
  const result = classifySwapAlternativesResponse({ status: 503, data: { error: 'service_temporarily_unavailable' } });
  assert.equal(result.kind, 'busy');
});

test('classifySwapAlternativesResponse: an unexpected status/shape is the generic error bucket', () => {
  assert.equal(classifySwapAlternativesResponse({ status: 500, data: {} }).kind, 'error');
  assert.equal(classifySwapAlternativesResponse({ status: 400, data: { error: 'invalid_request' } }).kind, 'error');
  assert.equal(classifySwapAlternativesResponse({ status: 200, data: null }).kind, 'error');
});

// ── classifySwapCommitResponse ────────────────────────────────────────────────

const RAW_DAY = {
  date: '2026-09-07',
  dayName: 'Monday',
  meals: [RAW_MEAL],
  totalCalories: 320,
  totalProtein: 22,
  totalCarbs: 30,
  totalFat: 8,
  totalCost: 2.1,
};

test('classifySwapCommitResponse: 200 with a day -> ok, day parsed via the shared toDay coercion', () => {
  const result = classifySwapCommitResponse({
    status: 200,
    data: { success: true, date: '2026-09-07', slot: 'breakfast', day: RAW_DAY },
  });
  assert.equal(result.kind, 'ok');
  assert.equal(result.day.date, '2026-09-07');
  assert.equal(result.day.meals.length, 1);
  assert.equal(result.day.totalCalories, 320);
});

test('classifySwapCommitResponse: 409 slot_already_swapped -> already_swapped (double-tap / multi-device race)', () => {
  const result = classifySwapCommitResponse({ status: 409, data: { error: 'slot_already_swapped' } });
  assert.equal(result.kind, 'already_swapped');
});

test('classifySwapCommitResponse: 402 pro_required -> pro_required with message', () => {
  const result = classifySwapCommitResponse({ status: 402, data: { error: 'pro_required', message: 'Upgrade to swap.' } });
  assert.equal(result.kind, 'pro_required');
  assert.equal(result.message, 'Upgrade to swap.');
});

test('classifySwapCommitResponse: 400 invalid payload -> generic error, never mistaken for already_swapped', () => {
  const result = classifySwapCommitResponse({ status: 400, data: { error: 'invalid_meal' } });
  assert.equal(result.kind, 'error');
});

test('classifySwapCommitResponse: 200 success but a malformed/missing day -> error, never a fabricated day', () => {
  assert.equal(classifySwapCommitResponse({ status: 200, data: { success: true } }).kind, 'error');
  assert.equal(classifySwapCommitResponse({ status: 200, data: { success: true, day: 'not-an-object' } }).kind, 'error');
});

// ── parseMealId ───────────────────────────────────────────────────────────────

test('parseMealId: splits on the LAST dash, not the first (date itself contains dashes)', () => {
  assert.deepEqual(parseMealId('2026-09-07-0'), { date: '2026-09-07', mealIndex: 0 });
  assert.deepEqual(parseMealId('2026-09-07-2'), { date: '2026-09-07', mealIndex: 2 });
});

test('parseMealId: malformed ids return null rather than a garbage guess', () => {
  assert.equal(parseMealId('no-index-here-x'), null);
  assert.equal(parseMealId('nodash'), null);
  assert.equal(parseMealId(''), null);
});
