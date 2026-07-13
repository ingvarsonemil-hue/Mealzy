/* Auth + account API calls for login.html / reset-password.html.
 * Endpoint contracts must match server.js exactly — do not change shapes.
 * POST /api/auth/signup        { name, email, password } -> { user }
 * POST /api/auth/signin        { email, password } -> { user }
 * POST /api/auth/reset-request { email } -> 200 always (no account enumeration)
 * POST /api/auth/reset-confirm { token, newPassword }
 * GET  /api/auth/me            -> { name, email, pro, profile }
 * GET  /api/profile            -> { profile }
 * POST /api/referral           { referrer_email, new_user_email }
 * POST /api/email-leads        { email, name, source }
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
