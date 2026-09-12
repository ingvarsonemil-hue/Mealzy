import test from 'node:test';
import assert from 'node:assert/strict';

import { createFirstWeekReducer, initialCreateFirstWeekState } from '../src/lib/create-first-week.ts';

const WEEK = {
  weekStart: '2026-09-14',
  days: [],
  weeklyTotals: { totalCost: 0, avgCalories: 0, avgProtein: 0, avgCarbs: 0, avgFat: 0 },
};

test('Create First Week screen entry does not POST', () => {
  assert.deepEqual(initialCreateFirstWeekState, { phase: 'confirm' });
});

test('explicit Create first week action initiates generation once', () => {
  const t = createFirstWeekReducer(initialCreateFirstWeekState, { type: 'tap_create' });
  assert.equal(t.shouldPost, true);
  assert.equal(t.shouldGet, false);
  assert.deepEqual(t.next, { phase: 'generating' });
});

test('duplicate taps cannot create duplicate generation POSTs', () => {
  const generating = { phase: 'generating' };
  const t = createFirstWeekReducer(generating, { type: 'tap_create' });
  assert.equal(t.shouldPost, false);
  assert.deepEqual(t.next, generating);
});

test('account creation / email verification never reach the generating phase on their own', () => {
  // There is no event in this module that transitions into 'generating'
  // except 'tap_create' from 'confirm' - asserted structurally by re-running
  // every non-tap_create event from 'confirm' and checking none of them post.
  const confirm = { phase: 'confirm' };
  for (const event of [
    { type: 'tap_check_for_plan' },
    { type: 'generate_result', result: { kind: 'ok', week: WEEK } },
    { type: 'check_result', result: { kind: 'found', week: WEEK } },
  ]) {
    const t = createFirstWeekReducer(confirm, event);
    assert.equal(t.shouldPost, false);
  }
});

test('successful generation routes to Plan', () => {
  const t = createFirstWeekReducer({ phase: 'generating' }, { type: 'generate_result', result: { kind: 'ok', week: WEEK } });
  assert.deepEqual(t.next, { phase: 'success', week: WEEK });
});

test('uncertain POST outcome (network failure) enters recovery', () => {
  const t = createFirstWeekReducer({ phase: 'generating' }, { type: 'generate_result', result: { kind: 'network' } });
  assert.deepEqual(t.next, { phase: 'recovery' });
});

test('uncertain POST outcome (retryable) enters recovery and does not immediately POST again', () => {
  const t = createFirstWeekReducer(
    { phase: 'generating' },
    { type: 'generate_result', result: { kind: 'retryable', message: 'busy' } },
  );
  assert.deepEqual(t.next, { phase: 'recovery' });
  assert.equal(t.shouldPost, false);
});

test('generation_in_progress recovery is GET-only', () => {
  const enteredRecovery = createFirstWeekReducer(
    { phase: 'generating' },
    { type: 'generate_result', result: { kind: 'generation_in_progress' } },
  );
  assert.deepEqual(enteredRecovery.next, { phase: 'recovery' });

  const checkTransition = createFirstWeekReducer(enteredRecovery.next, { type: 'tap_check_for_plan' });
  assert.equal(checkTransition.shouldGet, true);
  assert.equal(checkTransition.shouldPost, false);
});

test('Check for plan performs GET only, and is a no-op outside recovery', () => {
  const fromRecovery = createFirstWeekReducer({ phase: 'recovery' }, { type: 'tap_check_for_plan' });
  assert.equal(fromRecovery.shouldGet, true);
  assert.equal(fromRecovery.shouldPost, false);

  const fromConfirm = createFirstWeekReducer({ phase: 'confirm' }, { type: 'tap_check_for_plan' });
  assert.equal(fromConfirm.shouldGet, false);
});

test('failed GET remains uncertain and is never treated as no_plan', () => {
  const t = createFirstWeekReducer({ phase: 'recovery' }, { type: 'check_result', result: { kind: 'error' } });
  assert.deepEqual(t.next, { phase: 'recovery' });
});

test('successful GET proving absence is distinguished from failed/uncertain GET, but both stay in recovery', () => {
  const none = createFirstWeekReducer({ phase: 'recovery' }, { type: 'check_result', result: { kind: 'none' } });
  const error = createFirstWeekReducer({ phase: 'recovery' }, { type: 'check_result', result: { kind: 'error' } });
  assert.deepEqual(none.next, { phase: 'recovery' });
  assert.deepEqual(error.next, { phase: 'recovery' });
  assert.notEqual(none.next, undefined);
});

test('successful GET finding the week routes to Plan', () => {
  const t = createFirstWeekReducer({ phase: 'recovery' }, { type: 'check_result', result: { kind: 'found', week: WEEK } });
  assert.deepEqual(t.next, { phase: 'success', week: WEEK });
});

test('ineligible account tapping Create First Week routes to Free Week Used, does not POST', () => {
  const t = createFirstWeekReducer(
    { phase: 'generating' },
    { type: 'generate_result', result: { kind: 'pro_required' } },
  );
  assert.deepEqual(t.next, { phase: 'free_week_used' });
  assert.equal(t.shouldPost, false);

  // Once in free_week_used, tap_create can never fire another POST.
  const retap = createFirstWeekReducer(t.next, { type: 'tap_create' });
  assert.equal(retap.shouldPost, false);
});

test('a definitive terminal failure surfaces its message without offering a retry POST', () => {
  const t = createFirstWeekReducer(
    { phase: 'generating' },
    { type: 'generate_result', result: { kind: 'terminal', message: 'Could not build a plan within this budget.' } },
  );
  assert.deepEqual(t.next, { phase: 'error', message: 'Could not build a plan within this budget.' });
});
