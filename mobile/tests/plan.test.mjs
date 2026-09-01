// Mealzy Mobile M4B — pure Plan-logic tests.
//
// Run with:  node --test mobile/tests/plan.test.mjs
//
// No Jest, no RNTL, no new dependency. This is a plain .mjs file (so `tsc` in
// mobile/ never type-checks it) importing the TypeScript source directly —
// Node strips the types at load time.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  currentWeekStart,
  weekDateRange,
  selectWeeklyPlan,
  classifyGenerateOutcome,
  classifySavedWeekResponse,
} from '../src/lib/plan.ts';

// ── currentWeekStart ────────────────────────────────────────────────────────

test('currentWeekStart: Monday maps to itself', () => {
  assert.equal(currentWeekStart(new Date(2026, 2, 2, 9, 30)), '2026-03-02'); // Mon 2 Mar 2026
});

test('currentWeekStart: Tuesday maps back to Monday', () => {
  assert.equal(currentWeekStart(new Date(2026, 2, 3, 0, 1)), '2026-03-02');
});

test('currentWeekStart: Sunday maps back to the same week Monday', () => {
  assert.equal(currentWeekStart(new Date(2026, 2, 8, 23, 59)), '2026-03-02'); // Sun 8 Mar 2026
});

test('currentWeekStart: month boundary', () => {
  assert.equal(currentWeekStart(new Date(2026, 8, 1, 12, 0)), '2026-08-31'); // Tue 1 Sep 2026 -> Mon 31 Aug
});

test('currentWeekStart: year boundary', () => {
  assert.equal(currentWeekStart(new Date(2026, 0, 1, 12, 0)), '2025-12-29'); // Thu 1 Jan 2026 -> Mon 29 Dec 2025
});

test('currentWeekStart: does not shift across a UTC day boundary', () => {
  // Late local Monday evening; a naive toISOString() would roll to Tuesday UTC.
  assert.equal(currentWeekStart(new Date(2026, 2, 2, 23, 30)), '2026-03-02');
});

test('weekDateRange: Monday..Sunday labels', () => {
  assert.deepEqual(weekDateRange('2026-03-02'), { startLabel: 'Mar 2', endLabel: 'Mar 8' });
  assert.deepEqual(weekDateRange('2025-12-29'), { startLabel: 'Dec 29', endLabel: 'Jan 4' });
});

// ── selectWeeklyPlan ────────────────────────────────────────────────────────

const weeklyBlob = {
  weekStart: '2026-03-02',
  savedAt: 'z',
  days: [
    { date: '2026-03-02', dayName: 'Monday', totalCalories: 1900, totalCost: 7.5, meals: [
      { type: 'breakfast', name: 'Oats', description: 'Warm oats', calories: 400, protein: 20, carbs: 60, fat: 8, cost: 1.2,
        ingredients: [{ name: 'rolled oats', amount: '60g' }] },
    ] },
  ],
  weeklyTotals: { totalCost: 52.5, avgCalories: 1900, avgProtein: 120, avgCarbs: 210, avgFat: 60, budgetStatus: 'not_enforced' },
};
const singleDayBlob = { date: '2026-03-02', plan: { meals: [] }, savedAt: 'z' };

test('selectWeeklyPlan: finds the matching weekly blob and normalises it', () => {
  const w = selectWeeklyPlan([singleDayBlob, weeklyBlob], '2026-03-02');
  assert.ok(w);
  assert.equal(w.weekStart, '2026-03-02');
  assert.equal(w.days.length, 1);
  assert.equal(w.days[0].meals[0].name, 'Oats');
  assert.equal(w.days[0].meals[0].cost, 1.2);
  assert.equal(w.weeklyTotals.totalCost, 52.5);
  assert.equal(w.weeklyTotals.budgetStatus, 'not_enforced');
  assert.equal(w.planId, undefined);
});

test('selectWeeklyPlan: ignores a single-day blob whose date equals the weekStart', () => {
  assert.equal(selectWeeklyPlan([{ date: '2026-03-02', plan: {}, savedAt: 'z' }], '2026-03-02'), null);
});

test('selectWeeklyPlan: ignores malformed / unrelated blobs, never throws', () => {
  const list = [null, 'nope', 42, {}, { weekStart: 123 }, { weekStart: '2026-03-02' /* no days */ },
    { weekStart: '2026-03-02', days: 'not-an-array' }, { weekStart: '2099-01-05', days: [] }];
  assert.equal(selectWeeklyPlan(list, '2026-03-02'), null);
});

test('selectWeeklyPlan: no match returns null', () => {
  assert.equal(selectWeeklyPlan([weeklyBlob], '2026-03-09'), null);
  assert.equal(selectWeeklyPlan('not-a-list', '2026-03-02'), null);
});

// ── classifySavedWeekResponse (GET /api/plans) ──────────────────────────────

const okBody = (plans) => ({ success: true, plans });

test('classifySavedWeekResponse: 200 success + matching week -> found', () => {
  const r = classifySavedWeekResponse({ status: 200, data: okBody([singleDayBlob, weeklyBlob]) }, '2026-03-02');
  assert.equal(r.kind, 'found');
  assert.equal(r.week.weekStart, '2026-03-02');
});

test('classifySavedWeekResponse: 200 success + no matching week -> none', () => {
  assert.deepEqual(
    classifySavedWeekResponse({ status: 200, data: okBody([singleDayBlob]) }, '2026-03-02'),
    { kind: 'none' },
  );
  assert.deepEqual(
    classifySavedWeekResponse({ status: 200, data: okBody([weeklyBlob]) }, '2026-03-09'),
    { kind: 'none' },
  );
});

test('classifySavedWeekResponse: malformed/unrelated entries do not break the scan (still a clean none)', () => {
  const junk = [null, 'x', 7, {}, { weekStart: 1 }, { weekStart: '2026-03-02' }, { weekStart: '2026-03-02', days: 'no' }];
  assert.deepEqual(classifySavedWeekResponse({ status: 200, data: okBody(junk) }, '2026-03-02'), { kind: 'none' });
});

test('classifySavedWeekResponse: a non-success GET is error, never none', () => {
  for (const res of [
    { status: 500, data: { error: 'Something went wrong. Please try again.' } },
    { status: 503, data: { error: 'service_temporarily_unavailable' } },
    { status: 401, data: { error: 'not_authenticated' } },
    { status: 200, data: null },
    { status: 200, data: { success: false, plans: [] } },
    { status: 200, data: { plans: [] } },
    { status: 200, data: { success: true, plans: 'not-an-array' } },
    { status: 200, data: { success: true } },
  ]) {
    assert.deepEqual(classifySavedWeekResponse(res, '2026-03-02'), { kind: 'error' }, JSON.stringify(res));
  }
});

// ── classifyGenerateOutcome ─────────────────────────────────────────────────

const K = (status, data) => classifyGenerateOutcome({ status, data }).kind;

test('classifyGenerateOutcome: 200 with a valid week -> ok', () => {
  const r = classifyGenerateOutcome({ status: 200, data: { ...weeklyBlob, planId: 'p1', regenerated: false } });
  assert.equal(r.kind, 'ok');
  assert.equal(r.week.planId, 'p1');
});

test('classifyGenerateOutcome: 200 with an unreadable body -> terminal', () => {
  assert.equal(K(200, { success: true }), 'terminal');
});

test('classifyGenerateOutcome: 402 pro_required -> pro_required', () => {
  assert.equal(K(402, { error: 'pro_required', reason: 'free_week_consumed' }), 'pro_required');
});

test('classifyGenerateOutcome: 409 free_week_generation_in_progress -> generation_in_progress', () => {
  assert.equal(K(409, { error: 'free_week_generation_in_progress', retry: true }), 'generation_in_progress');
});

test('classifyGenerateOutcome: 400 profile_required -> profile_required', () => {
  assert.equal(K(400, { error: 'profile_required' }), 'profile_required');
});

test('classifyGenerateOutcome: 403 email_not_verified -> email_unverified', () => {
  assert.equal(K(403, { error: 'email_not_verified' }), 'email_unverified');
});

test('classifyGenerateOutcome: 400 allergy_violation + retry -> retryable', () => {
  assert.equal(K(400, { error: 'allergy_violation', retry: true }), 'retryable');
});

test('classifyGenerateOutcome: 429 / 503 / 500 -> retryable', () => {
  assert.equal(K(429, {}), 'retryable');
  assert.equal(K(503, { error: 'service_temporarily_unavailable' }), 'retryable');
  assert.equal(K(500, { error: 'Something went wrong. Please try again.' }), 'retryable');
});

test('classifyGenerateOutcome: 422 budget_unreachable -> terminal', () => {
  assert.equal(K(422, { error: 'budget_unreachable' }), 'terminal');
});

test('classifyGenerateOutcome: 422 certification_failed respects the server retry field', () => {
  assert.equal(K(422, { error: 'certification_failed', retry: true }), 'retryable');
  assert.equal(K(422, { error: 'certification_failed', retry: false }), 'terminal');
});

test('classifyGenerateOutcome: unknown status -> terminal, 401 not special-cased here', () => {
  assert.equal(K(418, { error: 'teapot' }), 'terminal');
  assert.equal(K(401, { error: 'not_authenticated' }), 'terminal');
});
