import * as React from 'react';
import PasswordField from '@/components/PasswordField';
import { Button } from '@/components/ui/button';
import { Label, Input } from '@/components/ui/field';
import { Check, GoogleLogo } from '@/components/icons';
import { signIn, signUp, requestPasswordReset, fetchSession, fetchProfile, recordEmailLead, recordReferral } from '@/lib/auth';
import { cn, isValidEmail } from '@/lib/utils';

const OAUTH_ERRORS = {
  google_failed: 'Google sign-in failed. Please try again or use email.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_not_configured: 'Google sign-in is not yet available.'
};

const BRAND_FEATURES = [
  'Hits your exact calorie and macro targets',
  'Stays within your grocery budget',
  'Generates the shopping list automatically',
  'Free — no credit card needed'
];

const HEADINGS = {
  signin: { h: 'Welcome back', sub: 'Your plans are waiting.' },
  signup: { h: 'Create your account', sub: 'A full week of meals, a minute from now.' },
  reset: { h: 'Reset password', sub: "Enter your email and we'll send a reset link." }
};

function ls(action, key, value) {
  try {
    if (action === 'get') return localStorage.getItem(key);
    if (action === 'set') localStorage.setItem(key, value);
    if (action === 'remove') localStorage.removeItem(key);
  } catch (e) { /* private mode */ }
  return null;
}

/* Post-auth bookkeeping identical to legacy login.js. */
function storeUser(user) {
  ls('set', 'mealzy_user', JSON.stringify({ name: user.name, email: user.email }));
}

/* Forwards the homepage demo's targets (?budget=&diet=/&dietary=&household=)
 * on to onboarding.html so the wizard can pre-fill them — otherwise they're
 * dropped the moment this page finishes and the user starts over. */
function onboardingUrl(qs) {
  const keep = new URLSearchParams();
  ['budget', 'diet', 'dietary', 'household'].forEach((k) => {
    const v = qs.get(k);
    if (v) keep.set(k, v);
  });
  const s = keep.toString();
  return 'onboarding.html' + (s ? '?' + s : '');
}

export default function LoginPage() {
  const qs = React.useMemo(() => new URLSearchParams(window.location.search), []);
  const [view, setView] = React.useState(qs.get('signup') === '1' ? 'signup' : 'signin');
  const [msg, setMsg] = React.useState(() => {
    const err = OAUTH_ERRORS[qs.get('error')];
    return err ? { kind: 'error', text: err } : null;
  });
  const [busy, setBusy] = React.useState(false);
  const [si, setSi] = React.useState({ email: '', password: '' });
  const [su, setSu] = React.useState({ name: '', email: qs.get('email') || '', password: '' });
  const [resetEmail, setResetEmail] = React.useState('');
  const [resetSent, setResetSent] = React.useState(false);

  /* Session probe + referral capture, same order as legacy login.js init(). */
  const bootRan = React.useRef(false);
  React.useEffect(() => {
    if (bootRan.current) return;
    bootRan.current = true;
    const ref = qs.get('ref');
    if (ref) ls('set', 'mealzy_pending_ref', ref);
    (async () => {
      try {
        const data = await fetchSession();
        if (!data) return;
        storeUser(data);
        if (data.pro) ls('set', 'mealzy_pro', 'true');
        if (data.profile) ls('set', 'mealzy_profile', JSON.stringify(data.profile));
        window.location.href = data.profile ? 'dashboard.html' : onboardingUrl(qs);
      } catch (e) {
        if (ls('get', 'mealzy_user')) {
          window.location.href = ls('get', 'mealzy_profile') ? 'dashboard.html' : onboardingUrl(qs);
        }
      }
    })();
  }, [qs]);

  const showError = (text) => setMsg({ kind: 'error', text });
  const clearMsg = () => setMsg(null);

  const switchView = (next) => {
    setView(next);
    clearMsg();
    if (next === 'reset' && si.email) setResetEmail(si.email);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    clearMsg();
    setBusy(true);
    try {
      const { ok, data } = await signIn({ email: si.email.trim().toLowerCase(), password: si.password });
      if (!ok) {
        showError(data.message || 'Sign in failed. Please try again.');
        setBusy(false);
        return;
      }
      storeUser(data.user);
      if (data.user.pro) ls('set', 'mealzy_pro', 'true');
      else ls('remove', 'mealzy_pro');
      try {
        const pd = await fetchProfile();
        if (pd) {
          ls('set', 'mealzy_profile', JSON.stringify(pd.profile));
          window.location.href = 'dashboard.html';
        } else {
          window.location.href = onboardingUrl(qs);
        }
      } catch (err) {
        window.location.href = ls('get', 'mealzy_profile') ? 'dashboard.html' : onboardingUrl(qs);
      }
    } catch (err) {
      showError('Could not connect. Please check your connection and try again.');
      setBusy(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    clearMsg();
    const name = su.name.trim();
    const email = su.email.trim().toLowerCase();
    if (!name || !email || !su.password) {
      showError('Please fill in all fields.');
      return;
    }
    if (!isValidEmail(email)) {
      showError('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await signUp({ name, email, password: su.password });
      if (!ok) {
        showError(
          data.error === 'account_exists'
            ? 'An account with this email already exists. Sign in instead.'
            : data.message || 'Sign up failed. Please try again.'
        );
        setBusy(false);
        return;
      }
      storeUser(data.user);
      if (data.user.pro) ls('set', 'mealzy_pro', 'true');
      recordEmailLead(email, name);
      const pendingRef = ls('get', 'mealzy_pending_ref');
      if (pendingRef && pendingRef !== email) {
        recordReferral(pendingRef, email);
        ls('remove', 'mealzy_pending_ref');
      }
      ls('set', 'mealzy_is_new_user', '1');
      window.location.href = onboardingUrl(qs);
    } catch (err) {
      showError('Could not connect. Please check your connection and try again.');
      setBusy(false);
    }
  };

  const handleResetRequest = async (e) => {
    e.preventDefault();
    clearMsg();
    const email = resetEmail.trim().toLowerCase();
    if (!isValidEmail(email)) {
      showError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setResetSent(true);
      setMsg({ kind: 'success', text: 'If that email has an account, a reset link is on its way. Check your inbox.' });
    } catch (err) {
      showError('Could not connect. Email support@mealzy.org if this persists.');
    }
    setBusy(false);
  };

  const heading = HEADINGS[view];
  const tabClass = (active) =>
    cn(
      'min-h-[44px] flex-1 cursor-pointer border-b-2 pb-2.5 pt-2 text-[15px] font-semibold transition-colors duration-150',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green',
      active ? 'border-green text-foreground' : 'border-transparent text-muted-fg hover:text-foreground'
    );

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>

      {/* Slim brand bar replaces the panel on mobile */}
      <div className="flex h-14 items-center bg-forest px-5 lg:hidden">
        <a href="/" className="font-display text-xl font-black italic text-on-forest no-underline">Mealzy</a>
      </div>

      <main id="main" className="grid min-h-[calc(100vh-3.5rem)] lg:min-h-screen lg:grid-cols-2">
        {/* Brand panel — desktop only */}
        <div className="hidden bg-forest bg-[linear-gradient(175deg,var(--color-forest)_55%,var(--color-forest-deep)_100%)] text-on-forest lg:flex lg:items-center lg:justify-center">
          <div className="max-w-md px-10 py-16">
            <a href="/" className="font-display text-4xl font-black italic text-on-forest no-underline">Mealzy</a>
            <p className="mt-4 font-display text-2xl font-bold italic leading-snug tracking-[-0.01em] text-on-forest-strong">
              A full week of meals in 30 seconds.
            </p>
            <ul role="list" className="mt-10 flex flex-col gap-4">
              {BRAND_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 text-[15px] text-on-forest-body">
                  <Check width="16" height="16" className="shrink-0 text-green-light" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="mt-12 text-sm text-on-forest-muted">Built by Emil, Sweden</p>
          </div>
        </div>

        {/* Form column */}
        <div className="flex items-start justify-center px-5 py-10 sm:items-center sm:py-14">
          <div className="w-full max-w-sm">
            <h1 className="font-display text-[2rem] font-bold italic leading-tight tracking-[-0.02em]">{heading.h}</h1>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted-fg">{heading.sub}</p>

            {msg && (
              <p
                role="alert"
                className={cn(
                  'mt-5 rounded-md border px-3.5 py-3 text-sm leading-normal',
                  msg.kind === 'success'
                    ? 'border-green/30 bg-green/10 text-green-deep dark:text-green-light'
                    : 'border-error/30 bg-error/10 text-brick dark:text-red-300'
                )}
              >
                {msg.text}
              </p>
            )}

            {view !== 'reset' && (
              <>
                <div role="tablist" aria-label="Authentication options" className="mt-6 flex border-b border-border-warm">
                  <button role="tab" aria-selected={view === 'signin'} className={tabClass(view === 'signin')} onClick={() => switchView('signin')}>
                    Sign in
                  </button>
                  <button role="tab" aria-selected={view === 'signup'} className={tabClass(view === 'signup')} onClick={() => switchView('signup')}>
                    Create account
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => { window.location.href = '/auth/google'; }}
                  className="mt-6 flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-md border border-border-warm bg-white text-[15px] font-semibold text-foreground transition-[border-color,box-shadow] duration-150 hover:border-green hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green dark:bg-cream"
                >
                  <GoogleLogo />
                  Continue with Google
                </button>

                <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-fg" aria-hidden="true">
                  <span className="h-px flex-1 bg-border-warm" />
                  or
                  <span className="h-px flex-1 bg-border-warm" />
                </div>
              </>
            )}

            {view === 'signin' && (
              <form onSubmit={handleSignIn} role="tabpanel" className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" type="email" placeholder="you@example.com" required autoComplete="email" value={si.email} onChange={(e) => setSi({ ...si, email: e.target.value })} />
                </div>
                <div>
                  <PasswordField
                    id="si-password"
                    placeholder="Your password"
                    autoComplete="current-password"
                    value={si.password}
                    onChange={(e) => setSi({ ...si, password: e.target.value })}
                  />
                  <button type="button" onClick={() => switchView('reset')} className="mt-2 cursor-pointer text-sm font-medium text-green-deep hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green dark:text-green-light">
                    Forgot password?
                  </button>
                </div>
                <Button type="submit" full disabled={busy} className="mt-1">
                  {busy ? 'Please wait...' : 'Sign in'}
                </Button>
              </form>
            )}

            {view === 'signup' && (
              <form onSubmit={handleSignUp} role="tabpanel" className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="su-name">Full name</Label>
                  <Input id="su-name" type="text" placeholder="Your name" required value={su.name} onChange={(e) => setSu({ ...su, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" type="email" placeholder="you@example.com" required autoComplete="email" value={su.email} onChange={(e) => setSu({ ...su, email: e.target.value })} />
                </div>
                <PasswordField
                  id="su-password"
                  placeholder="Min. 12 characters"
                  autoComplete="new-password"
                  minLength={12}
                  checklist
                  value={su.password}
                  onChange={(e) => setSu({ ...su, password: e.target.value })}
                />
                <Button type="submit" full disabled={busy} className="mt-1">
                  {busy ? 'Please wait...' : 'Create account'}
                </Button>
              </form>
            )}

            {view === 'reset' && (
              <form onSubmit={handleResetRequest} className="mt-6 flex flex-col gap-4">
                <div>
                  <Label htmlFor="reset-email">Email</Label>
                  <Input id="reset-email" type="email" placeholder="you@example.com" autoComplete="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} />
                </div>
                <Button type="submit" full disabled={busy}>
                  {busy ? 'Please wait...' : 'Send Reset Link'}
                </Button>
                {resetSent && (
                  <p className="text-sm leading-relaxed text-muted-fg">Check your inbox — the link expires in 1 hour.</p>
                )}
                <Button variant="quiet" full type="button" className="text-muted-fg hover:bg-parchment hover:text-foreground" onClick={() => switchView('signin')}>
                  Back to sign in
                </Button>
              </form>
            )}

            {view !== 'reset' && (
              <p className="mt-6 text-[13px] leading-[1.6] text-muted-fg">
                By continuing you agree to our{' '}
                <a href="terms.html" className="text-green-deep underline dark:text-green-light">Terms</a> and{' '}
                <a href="privacy-policy.html" className="text-green-deep underline dark:text-green-light">Privacy Policy</a>.
                <br />
                Free plan: 3 meal plans a month. No credit card required.
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
