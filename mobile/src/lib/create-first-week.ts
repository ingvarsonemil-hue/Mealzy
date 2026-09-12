/**
 * Pure state machine for the Create First Week / Generating First Week /
 * Generation Recovery flow (Slice 3). No network, no Expo/native imports, so
 * it can be unit-tested under plain `node --test`, matching plan.ts's
 * convention.
 *
 * Deliberately reuses plan-api.ts's GenerateResult and plan.ts's
 * SavedWeekResult rather than inventing a second interpretation of backend
 * statuses (the same classifyGenerateOutcome / classifySavedWeekResponse the
 * existing Plan screen already relies on).
 *
 * Invariants enforced purely by which events are accepted from which phase:
 * - `tap_create` only does anything from 'confirm' - entering the screen,
 *   account creation, and email verification never produce this event, and a
 *   duplicate tap while 'generating' is a no-op (shouldPost stays false).
 * - `tap_check_for_plan` only does anything from 'recovery', and it always
 *   requests a GET, never a POST.
 * - An uncertain outcome (network failure, or a retryable classification)
 *   never re-issues a POST automatically - it moves to 'recovery' and waits
 *   for an explicit `tap_check_for_plan`.
 * - A GET that fails, or a GET that succeeds and finds nothing yet, both keep
 *   the machine in 'recovery' - neither is ever read as proof no plan exists.
 */
import type { GenerateResult } from './plan-api';
import type { SavedWeekResult, WeekPlan } from './plan';

export type CreateFirstWeekPhase =
  | { phase: 'confirm' }
  | { phase: 'generating' }
  | { phase: 'recovery' }
  | { phase: 'free_week_used' }
  | { phase: 'success'; week: WeekPlan }
  | { phase: 'error'; message: string };

export const initialCreateFirstWeekState: CreateFirstWeekPhase = { phase: 'confirm' };

export type CreateFirstWeekEvent =
  | { type: 'tap_create' }
  | { type: 'tap_check_for_plan' }
  | { type: 'generate_result'; result: GenerateResult }
  | { type: 'check_result'; result: SavedWeekResult };

export type CreateFirstWeekTransition = {
  next: CreateFirstWeekPhase;
  shouldPost: boolean;
  shouldGet: boolean;
};

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

function noOp(state: CreateFirstWeekPhase): CreateFirstWeekTransition {
  return { next: state, shouldPost: false, shouldGet: false };
}

function onGenerateResult(state: CreateFirstWeekPhase, result: GenerateResult): CreateFirstWeekTransition {
  if (state.phase !== 'generating') return noOp(state);

  switch (result.kind) {
    case 'ok':
      return { next: { phase: 'success', week: result.week }, shouldPost: false, shouldGet: false };
    case 'pro_required':
      // Not entitled to generate. No retry path, no generic error - the
      // caller routes straight to the Free Week Used screen.
      return { next: { phase: 'free_week_used' }, shouldPost: false, shouldGet: false };
    case 'generation_in_progress':
      return { next: { phase: 'recovery' }, shouldPost: false, shouldGet: false };
    case 'retryable':
    case 'network':
      // Uncertain outcome: GET-first recovery, never a blind re-POST.
      return { next: { phase: 'recovery' }, shouldPost: false, shouldGet: false };
    case 'profile_required':
    case 'email_unverified':
      // Should not occur this late in the flow, but fail safe with a plain
      // message rather than silently retrying or fabricating a state.
      return { next: { phase: 'error', message: GENERIC_ERROR_MESSAGE }, shouldPost: false, shouldGet: false };
    case 'terminal':
      return { next: { phase: 'error', message: result.message }, shouldPost: false, shouldGet: false };
  }
}

function onCheckResult(state: CreateFirstWeekPhase, result: SavedWeekResult): CreateFirstWeekTransition {
  if (state.phase !== 'recovery') return noOp(state);

  switch (result.kind) {
    case 'found':
      return { next: { phase: 'success', week: result.week }, shouldPost: false, shouldGet: false };
    case 'none':
      // Confirmed "not there yet" - not proof of failure. Stay in recovery,
      // same as the existing Plan screen's generation_in_progress handling.
      return { next: { phase: 'recovery' }, shouldPost: false, shouldGet: false };
    case 'error':
      // The GET itself failed. Remain uncertain; never becomes no_plan.
      return { next: { phase: 'recovery' }, shouldPost: false, shouldGet: false };
  }
}

export function createFirstWeekReducer(
  state: CreateFirstWeekPhase,
  event: CreateFirstWeekEvent,
): CreateFirstWeekTransition {
  switch (event.type) {
    case 'tap_create':
      if (state.phase !== 'confirm') return noOp(state);
      return { next: { phase: 'generating' }, shouldPost: true, shouldGet: false };
    case 'tap_check_for_plan':
      if (state.phase !== 'recovery') return noOp(state);
      return { next: state, shouldPost: false, shouldGet: true };
    case 'generate_result':
      return onGenerateResult(state, event.result);
    case 'check_result':
      return onCheckResult(state, event.result);
  }
}
