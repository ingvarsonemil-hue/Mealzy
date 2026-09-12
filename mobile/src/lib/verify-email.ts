/**
 * Pure outcome logic for the Verify Email screen, kept out of verify-email.tsx
 * so it can be unit-tested under plain `node --test`, matching sign-in.ts's and
 * create-first-week.ts's convention.
 *
 * Three outcomes, deliberately distinct: the status check can fail outright
 * (network/server error - the user never learns whether they're verified),
 * or it can succeed and report either verified or not-yet-verified.
 */
export type VerifyEmailOutcome =
  | { status: 'verified' }
  | { status: 'not-yet-verified'; notice: string }
  | { status: 'check-failed'; error: string };

export function resolveVerifyEmailOutcome(checkSucceeded: boolean, emailVerified: boolean): VerifyEmailOutcome {
  if (!checkSucceeded) {
    return { status: 'check-failed', error: "We couldn't check your verification status. Please try again." };
  }
  if (emailVerified) {
    return { status: 'verified' };
  }
  return {
    status: 'not-yet-verified',
    notice: "Still not verified. Check your inbox, then tap 'I've verified' again.",
  };
}
