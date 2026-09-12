/**
 * Pure display logic for the Sign In screen, kept out of sign-in.tsx so it
 * can be unit-tested under plain `node --test`, matching plan.ts's and
 * create-first-week.ts's convention.
 */
export type SignInAuthError = { message: string } | null;

// Mirrors sign-in.tsx's `error ?? authError?.message` precedence: a
// form-level error (bad credentials, this submit) always outranks the
// AuthProvider's connection/local error from a background retry.
export function resolveSignInErrorMessage(localError: string | null, authError: SignInAuthError): string | null {
  return localError ?? authError?.message ?? null;
}
