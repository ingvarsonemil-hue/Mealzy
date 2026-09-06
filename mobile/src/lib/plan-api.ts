/**
 * Plan networking — thin wrappers over the existing apiFetch primitive.
 *
 * Kept separate from plan.ts so the pure logic there stays importable under
 * plain `node --test` without pulling in the Expo/native module chain.
 *
 * Bearer auth and 401 invalidation are entirely owned by apiFetch / the auth
 * context. These functions never read or attach a token, never compute
 * certification / macro targets / budget status, and never send plan_token or
 * is_pro.
 */
import { apiFetch } from './api';
import {
  classifyGenerateOutcome,
  classifyGroceryCheckPatchResponse,
  classifyGroceryChecksResponse,
  classifySavedWeekResponse,
  type GenerateOutcome,
  type GroceryChecksResult,
  type SavedWeekResult,
} from './plan';

/**
 * GET /api/plans and classify the result for the current week.
 *
 *  - { kind: 'found', week } : the GET succeeded and the week exists
 *  - { kind: 'none' }        : the GET succeeded and no current-week plan exists
 *  - { kind: 'error' }       : network failure / non-success response — the
 *                              caller MUST NOT treat this as "no plan"
 *
 * 401 handling stays entirely with apiFetch / the auth context.
 */
export async function fetchSavedWeek(weekStart: string): Promise<SavedWeekResult> {
  try {
    const res = await apiFetch('/api/plans');
    return classifySavedWeekResponse(res, weekStart);
  } catch {
    return { kind: 'error' };
  }
}

export type GenerateResult = GenerateOutcome | { kind: 'network' };

/**
 * POST /api/generate-meal with exactly { profile, weekStart }. The optional
 * AbortSignal flows straight through apiFetch to fetch(); aborting only stops
 * the client request, never the server-side generation.
 */
export async function generateWeek(
  profile: unknown,
  weekStart: string,
  opts: { signal?: AbortSignal } = {},
): Promise<GenerateResult> {
  try {
    const res = await apiFetch('/api/generate-meal', {
      method: 'POST',
      body: JSON.stringify({ profile, weekStart }),
      signal: opts.signal,
    });
    return classifyGenerateOutcome(res);
  } catch {
    // AbortError (screen unmounted) or a genuine network failure. 401 never
    // lands here — apiFetch resolves it and the auth context takes over.
    return { kind: 'network' };
  }
}

/** GET /api/plans/:planId/grocery-checks - read-only, no side effects. */
export async function fetchGroceryChecks(planId: string): Promise<GroceryChecksResult> {
  try {
    const res = await apiFetch(`/api/plans/${encodeURIComponent(planId)}/grocery-checks`);
    return classifyGroceryChecksResponse(res);
  } catch {
    return { kind: 'error' };
  }
}

/**
 * PATCH /api/plans/:planId/grocery-checks/:canonicalIngredientId - checked
 * state only. Returns whether it actually saved; the caller (shop.tsx) owns
 * rolling back its optimistic UI update on false.
 */
export async function setGroceryChecked(
  planId: string,
  canonicalIngredientId: string,
  checked: boolean,
): Promise<boolean> {
  try {
    const res = await apiFetch(
      `/api/plans/${encodeURIComponent(planId)}/grocery-checks/${encodeURIComponent(canonicalIngredientId)}`,
      { method: 'PATCH', body: JSON.stringify({ checked }) },
    );
    return classifyGroceryCheckPatchResponse(res);
  } catch {
    return false;
  }
}
