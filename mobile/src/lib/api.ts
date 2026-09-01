import { clearToken, getToken } from './session';

/**
 * Low-level networking primitive for the Mealzy backend.
 *
 * - Absolute URLs against EXPO_PUBLIC_API_URL (production fallback below).
 * - Injects `Authorization: Bearer <token>` when a stored credential exists
 *   AND the session has not been invalidated by a prior 401.
 * - Preserves caller-supplied headers.
 * - On a 401: marks the session invalidated, attempts credential deletion,
 *   and notifies the auth layer once (with whether cleanup failed).
 * - No redirect / navigation logic. No token logging, ever.
 */
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://mealzy.org').replace(/\/+$/, '');

type UnauthorizedHandler = (cleanupFailed: boolean) => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;
let handlingUnauthorized = false;

// Once a 401 is seen, the stored credential is considered revoked. No further
// request carries it - even if SecureStore deletion failed and the value is
// still on disk - until a fresh sign-in calls resetSessionInvalidated().
let sessionInvalidated = false;

/** Registered by AuthProvider so a background 401 can drop the session. */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  unauthorizedHandler = fn;
}

/** Called after a successful sign-in / sign-up persists a new token. */
export function resetSessionInvalidated(): void {
  sessionInvalidated = false;
}

export type ApiResponse<T = unknown> = {
  status: number;
  ok: boolean;
  data: T | null;
};

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = sessionInvalidated ? null : await getToken();

  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }

  if (res.status === 401) {
    await handleUnauthorized();
  }

  return { status: res.status, ok: res.ok, data };
}

async function handleUnauthorized(): Promise<void> {
  // Stop any in-flight or subsequent request from re-sending the credential,
  // regardless of whether the concurrency guard or the deletion succeed.
  sessionInvalidated = true;

  if (handlingUnauthorized) return;
  handlingUnauthorized = true;

  try {
    let cleanupFailed = false;
    try {
      await clearToken();
    } catch {
      // Genuine SecureStore deletion failure. Do not log. Do not rethrow -
      // the response path must not produce an unhandled rejection.
      cleanupFailed = true;
    }
    try {
      unauthorizedHandler?.(cleanupFailed);
    } catch {
      // A misbehaving handler must not break the response path or wedge the guard.
    }
  } finally {
    // Always resets, even if the above somehow throws.
    handlingUnauthorized = false;
  }
}
