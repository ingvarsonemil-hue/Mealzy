/* Auth + account API calls, shared by login.html / reset-password.html and
 * the authenticated app pages (dashboard, meal-planner, grocery-list).
 * Endpoint contracts must match server.js exactly — do not change shapes.
 * POST /api/auth/signup        { name, email, password } -> { user }
 * POST /api/auth/signin        { email, password } -> { user }
 * POST /api/auth/reset-request { email } -> 200 always (no account enumeration)
 * POST /api/auth/reset-confirm { token, newPassword }
 * GET  /api/auth/me            -> 200 { id, name, email, pro, ref_code, profile } | 401 { error }
 * POST /api/auth/signout       -> { success: true }
 * GET  /api/profile            -> { profile }
 * POST /api/referral           { referrer_email, new_user_email }
 * POST /api/email-leads        { email, name?, source, discount? }
 */

const json = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

export async function signUp({ name, email, password }) {
  const res = await fetch('/api/auth/signup', json({ name, email, password }));
  const data = await res.json();
  return { ok: res.ok, data };
}

export async function signIn({ email, password }) {
  const res = await fetch('/api/auth/signin', json({ email, password }));
  const data = await res.json();
  return { ok: res.ok, data };
}

export function requestPasswordReset(email) {
  return fetch('/api/auth/reset-request', json({ email }));
}

export async function confirmPasswordReset(token, newPassword) {
  const res = await fetch('/api/auth/reset-confirm', json({ token, newPassword }));
  const data = await res.json();
  return { ok: res.ok, data };
}

/* Fire-and-forget: same calls the legacy login.js made after signup. */
export function recordEmailLead(email, name) {
  try { fetch('/api/email-leads', json({ email, name, source: 'signup' })); } catch (e) { /* non-blocking */ }
}

export function recordReferral(referrerEmail, newUserEmail) {
  try { fetch('/api/referral', json({ referrer_email: referrerEmail, new_user_email: newUserEmail })); } catch (e) { /* non-blocking */ }
}

/* Session probe used by login.html to skip the form for signed-in users. */
export async function fetchSession() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) return null;
  return res.json();
}

/* Full auth/me fetch used by app-shell pages, which need to tell an
 * unauthenticated (401) response apart from a network failure. */
export async function fetchMe() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) {
    const err = new Error('not_authenticated');
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export function signOut() {
  return fetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
}

/* email-leads with an arbitrary source/discount flag, for the app pages'
 * abandonment / upgrade-prompt / pdf-upgrade capture flows. Distinct from
 * recordEmailLead() above (signup source only, used by login.html). */
export function recordAppEmailLead(email, { source, name, discount } = {}) {
  return fetch('/api/email-leads', json({ email, source, name, discount })).then((r) => r.json());
}

export async function fetchProfile() {
  const res = await fetch('/api/profile');
  if (!res.ok) return null;
  return res.json();
}

/* Password rules mirrored from the legacy checklist (server revalidates). */
export const PW_RULES = [
  { id: 'len', label: 'At least 12 characters', test: (pw) => pw.length >= 12 },
  { id: 'upper', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lower', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { id: 'num', label: 'One number', test: (pw) => /\d/.test(pw) },
  { id: 'special', label: 'One special character', test: (pw) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw) }
];
