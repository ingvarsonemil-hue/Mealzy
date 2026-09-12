export type DeleteAccountResult = { ok: boolean; message?: string };

type DeleteAccountResponse = { error?: string; message?: string };

// DELETE /api/delete-account (mobile soft-delete + 30-day grace period) -
// NOT /api/account, which is the web's immediate hard-delete route. Mobile
// called the wrong one silently until this fix; keep this as the one place
// the endpoint is named so it can't drift again.
export const DELETE_ACCOUNT_ENDPOINT = '/api/delete-account';

const OFFLINE_MESSAGE = 'Could not reach Mealzy. Check your connection and try again.';
const REAUTH_REQUIRED_MESSAGE =
  'For your security, please sign in again before deleting your account.';
const ACTIVE_SUBSCRIPTION_MESSAGE =
  'Please cancel your Pro subscription before deleting your account.';
const GENERIC_FAILURE_MESSAGE = 'Could not delete your account. Please try again.';

/** Maps DELETE /api/delete-account's response status/body to an ActionResult. */
export function resolveDeleteAccountOutcome(
  status: number,
  data: DeleteAccountResponse | null,
): DeleteAccountResult {
  if (status === 200) return { ok: true };
  if (status === 403 && data?.error === 'reauth_required') {
    return { ok: false, message: data.message || REAUTH_REQUIRED_MESSAGE };
  }
  if (status === 409) {
    return { ok: false, message: data?.message || ACTIVE_SUBSCRIPTION_MESSAGE };
  }
  if (status >= 500) return { ok: false, message: OFFLINE_MESSAGE };
  return { ok: false, message: data?.message || GENERIC_FAILURE_MESSAGE };
}
