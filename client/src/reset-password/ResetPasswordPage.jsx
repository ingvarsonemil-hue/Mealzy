import * as React from 'react';
import PasswordField from '@/components/PasswordField';
import { Button } from '@/components/ui/button';
import { Label, Input } from '@/components/ui/field';
import { confirmPasswordReset } from '@/lib/auth';
import { cn } from '@/lib/utils';

/* POST /api/auth/reset-confirm { token, newPassword } — token arrives in the
 * URL from the email link (see server.js reset-request). States mirror the
 * legacy page: invalid link, form, success. */
export default function ResetPasswordPage() {
  const token = React.useMemo(() => new URLSearchParams(window.location.search).get('token'), []);
  const [view, setView] = React.useState(token ? 'form' : 'invalid');
  const [invalidMsg, setInvalidMsg] = React.useState(
    token ? "This link doesn't work anymore" : 'No reset token found in the URL. Please request a new password reset link.'
  );
  const [pw, setPw] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const successRef = React.useRef(null);

  React.useEffect(() => {
    if (view === 'success') successRef.current?.focus();
  }, [view]);

  const mismatch = confirm.length > 0 && pw !== confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (pw !== confirm) { setError('Passwords do not match.'); return; }
    if (pw.length < 12) { setError('Password must be at least 12 characters.'); return; }
    setBusy(true);
    try {
      const { ok, data } = await confirmPasswordReset(token, pw);
      if (!ok) {
        if (data.error === 'invalid_token' || data.error === 'expired_token') {
          setInvalidMsg(data.message || "This link doesn't work anymore");
          setView('invalid');
        } else {
          setError(data.error || 'Something went wrong. Please try again.');
          setBusy(false);
        }
        return;
      }
      setView('success');
    } catch (err) {
      setError('Could not connect. Please check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <main id="main" className="flex min-h-screen items-center justify-center bg-muted-bg px-5 py-10">
        <div className="w-full max-w-md rounded-lg border border-border-warm bg-cream p-8 shadow-card">
          <a href="/" className="font-display text-2xl font-black italic text-foreground no-underline">Mealzy</a>

          {view === 'invalid' && (
            <div className="mt-6">
              <p role="alert" className="rounded-md border border-error/30 bg-error/10 px-3.5 py-3 text-sm leading-normal text-brick dark:text-red-300">
                {invalidMsg}
              </p>
              <p className="mt-4 text-[15px] leading-[1.65] text-muted-fg">
                It may have expired or already been used. Reset links only work once and expire after
                1 hour — just request a new one below.
              </p>
              <Button href="login.html" full className="mt-6">Back to sign in</Button>
            </div>
          )}

          {view === 'form' && (
            <div className="mt-6">
              <h1 className="font-display text-2xl font-bold italic leading-tight tracking-[-0.01em]">
                Set a new password
              </h1>
              <p className="mt-2 text-[15px] leading-[1.65] text-muted-fg">
                Choose a strong password (at least 12 characters, with uppercase, lowercase, numbers,
                and a special character).
              </p>

              {error && (
                <p role="alert" className="mt-4 rounded-md border border-error/30 bg-error/10 px-3.5 py-3 text-sm leading-normal text-brick dark:text-red-300">
                  {error}
                </p>
              )}

              <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
                <PasswordField
                  id="new-password"
                  label="New password"
                  placeholder="Min. 12 characters"
                  autoComplete="new-password"
                  minLength={12}
                  checklist
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                />
                <div>
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    aria-invalid={mismatch || undefined}
                    aria-describedby={mismatch ? 'confirm-password-error' : undefined}
                    className={cn(mismatch && 'border-error focus:border-error focus:ring-error/10')}
                  />
                  {mismatch && (
                    <p id="confirm-password-error" className="mt-1.5 text-[13px] text-brick dark:text-red-300">
                      Passwords don&rsquo;t match
                    </p>
                  )}
                </div>
                <Button type="submit" full disabled={busy} className="mt-1">
                  {busy ? 'Updating...' : 'Set New Password'}
                </Button>
              </form>
            </div>
          )}

          {view === 'success' && (
            <div className="mt-6" tabIndex={-1} ref={successRef}>
              <h1 className="font-display text-2xl font-bold italic leading-tight tracking-[-0.01em]">
                Password updated
              </h1>
              <p role="status" className="mt-4 rounded-md border border-green/30 bg-green/10 px-3.5 py-3 text-sm leading-normal text-green-deep dark:text-green-light">
                Your password has been changed successfully.
              </p>
              <p className="mt-4 text-[15px] leading-[1.65] text-muted-fg">
                You can now sign in with your new password.
              </p>
              <Button href="login.html" full className="mt-6">Sign in</Button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
