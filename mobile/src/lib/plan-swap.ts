/**
 * Meal swap (routes/mealSwap.js) — pure logic only, split out of plan.ts to
 * stay under the project's 500-line-file limit. Same no-network,
 * no-Expo/native-import constraint as plan.ts, so it stays unit-testable
 * under plain `node --test`.
 *
 * "<date>:<slot>" is the single-use-per-slot key both endpoints share
 * (routes/mealSwap.js's slotKeyFor) - kept here too so the client and server
 * never disagree about how a slot is identified.
 */

import { errorCode, isRecord, toDay, toMeal, type PlanDay, type PlanMeal, type WeekPlan } from './plan.ts';

export function slotKey(date: string, slot: string): string {
  return `${date}:${slot}`;
}

export function isSlotSwapped(week: WeekPlan, date: string, slot: string): boolean {
  return week.swappedSlots.includes(slotKey(date, slot));
}

/**
 * Recover the (date, meal index) a `PlanMealViewModel.id` (`${date}-${i}`,
 * see plan-current-adapter.ts's toMealViewModels) encodes. Splits on the
 * LAST '-': the date itself contains two dashes (YYYY-MM-DD), so a naive
 * split('-') would misparse it. Shared here (rather than in the adapter,
 * which has @/-alias imports plain `node --test` cannot resolve) so every
 * caller - Meal Detail navigation, the swap flow - parses the same id the
 * same way instead of re-deriving this rule.
 */
export function parseMealId(mealId: string): { date: string; mealIndex: number } | null {
  const lastDash = mealId.lastIndexOf('-');
  if (lastDash <= 0) return null;
  const date = mealId.slice(0, lastDash);
  const mealIndex = Number(mealId.slice(lastDash + 1));
  if (!Number.isInteger(mealIndex) || mealIndex < 0) return null;
  return { date, mealIndex };
}

/**
 * One alternative from POST /swap-alternatives. `raw` is sent back to
 * POST /swap-commit byte-for-byte unmodified (the contract explicitly says
 * "the exact chosen alternative object... sent back unmodified") - `display`
 * is only this client's own narrow read of the same object for rendering,
 * via the existing toMeal() coercion.
 */
export type SwapAlternative = {
  raw: unknown;
  display: PlanMeal;
};

export type SwapAlternativesResult =
  | { kind: 'ok'; alternatives: SwapAlternative[] }
  | { kind: 'pro_required'; message: string }
  | { kind: 'already_swapped' }
  | { kind: 'busy' }
  | { kind: 'error' };

/**
 * Pure classifier for POST /api/plans/:planId/swap-alternatives. Mirrors the
 * ACTUAL routes/mealSwap.js status codes (verified by reading the route, not
 * assumed): an already-swapped slot is 409, not 400 - a 400 there is a
 * malformed-request shape (bad date/slot/profile) this client should never
 * itself produce, and lands in the generic 'error' bucket like any other
 * unexpected status.
 */
export function classifySwapAlternativesResponse(res: { status: number; data: unknown }): SwapAlternativesResult {
  const { status, data } = res;
  const code = errorCode(data);

  if (status === 200 && isRecord(data) && data.success === true && Array.isArray(data.alternatives)) {
    const alternatives: SwapAlternative[] = data.alternatives
      .filter(isRecord)
      .map((raw) => ({ raw, display: toMeal(raw) }));
    if (alternatives.length === 0) return { kind: 'error' };
    return { kind: 'ok', alternatives };
  }
  if (status === 402 && code === 'pro_required') {
    const message =
      isRecord(data) && typeof data.message === 'string' ? data.message : 'Meal swaps are a Pro feature.';
    return { kind: 'pro_required', message };
  }
  if (status === 409 && code === 'slot_already_swapped') return { kind: 'already_swapped' };
  if (status === 503) return { kind: 'busy' };
  return { kind: 'error' };
}

export type SwapCommitResult =
  | { kind: 'ok'; day: PlanDay }
  | { kind: 'already_swapped' }
  | { kind: 'pro_required'; message: string }
  | { kind: 'error' };

/**
 * Pure classifier for POST /api/plans/:planId/swap-commit. `day` is the
 * server's recomputed day object - the caller must replace its local day
 * with this verbatim rather than splicing the chosen meal in client-side,
 * since only the server recomputed this day's totals.
 *
 * Deliberately does NOT read/return anything about weeklyTotals or a
 * grocery/purchase total: the backend does not recompute those on a swap
 * (see routes/mealSwap.js's own NOTE comment), and this classifier must
 * never manufacture the appearance that it did.
 */
export function classifySwapCommitResponse(res: { status: number; data: unknown }): SwapCommitResult {
  const { status, data } = res;
  const code = errorCode(data);

  if (status === 200 && isRecord(data) && data.success === true && isRecord(data.day)) {
    return { kind: 'ok', day: toDay(data.day) };
  }
  if (status === 409 && code === 'slot_already_swapped') return { kind: 'already_swapped' };
  if (status === 402 && code === 'pro_required') {
    const message =
      isRecord(data) && typeof data.message === 'string' ? data.message : 'Meal swaps are a Pro feature.';
    return { kind: 'pro_required', message };
  }
  return { kind: 'error' };
}
