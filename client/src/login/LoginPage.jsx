import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Label, Input } from '@/components/ui/field';
import PasswordField from '@/components/PasswordField';
import { GoogleLogo } from '@/components/icons';
import { signIn, signUp, fetchSession, fetchProfile, recordEmailLead, recordReferral } from '@/lib/auth';
import { cn, isValidEmail } from '@/lib/utils';

/* Forwards the homepage demo's targets (?budget=&diet=&dietary=&cookingTime=)
 * on to onboarding.html so the wizard can pre-fill them — mirrors the legacy
 * public/js/login.js behavior so this flow doesn't regress on the React page. */
function onboardingUrl() {
  const qs = new URLSearchParams(window.location.search);
  const keep = new URLSearchParams();
  ['budget', 'diet', 'dietary', 'cookingTime'].forEach((k) => {
    const v = qs.get(k);
    if (v) keep.set(k, v);
  });
  const s = keep.toString();
  return 'onboarding.html' + (s ? '?' + s : '');
}

const OAUTH_ERRORS = {
  google_failed: 'Google sign-in failed. Please try again or use email.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_not_configured: 'Google sign-in is not yet available.'
};

export default function LoginPage() {
  const qs = React.useMemo(() => new URLSearchParams(window.location.search), []);
  const [tab, setTab] = React.useState(qs.get('signup') === '1' ? 'signup' : 'signin');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState(qs.get('email') ? decodeURIComponent(qs.get('email')) : '');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [checkingSession, setCheckingSession] = React.useState(true);
  const [msg, setMsg] = React.useState(
    OAUTH_ERRORS[qs.get('error')] ? { kind: 'error', text: OAUTH_ERRORS[qs.get('error')] } : null
  );
  const emailRef = React.useRef(null);

  React.useEffect(() => {
    const ref = qs.get('ref');
    if (ref) localStorage.setItem('mealzy_pending_ref', ref);

    (async () => {
      const session = await fetchSession();
      if (!session) { setCheckingSession(false); emailRef.current?.focus(); return; }
      localStorage.setItem('mealzy_user', JSON.stringify({ name: session.name, email: session.email }));
      if (session.pro) localStorage.setItem('mealzy_pro', 'true');
      if (session.profile) localStorage.setItem('mealzy_profile', JSON.stringify(session.profile));
      window.location.href = session.profile ? 'dashboard.html' : onboardingUrl();
    })();
  }, [qs]);

  const switchTab = (next) => {
    setTab(next);
    setMsg(null);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (!isValidEmail(email) || !password) {
      setMsg({ kind: 'error', text: 'Please enter a valid email and password.' });
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await signIn({ email: email.trim().toLowerCase(), password });
      if (!ok) {
        setMsg({ kind: 'error', text: data.message || 'Sign in failed. Please try again.' });
        setBusy(false);
        return;
      }
      localStorage.setItem('mealzy_user', JSON.stringify({ name: data.user.name, email: data.user.email }));
      if (data.user.pro) localStorage.setItem('mealzy_pro', 'true'); else localStorage.removeItem('mealzy_pro');
      const profileData = await fetchProfile();
      if (profileData) localStorage.setItem('mealzy_profile', JSON.stringify(profileData.profile));
      window.location.href = profileData ? 'dashboard.html' : onboardingUrl();
    } catch (err) {
      setMsg({ kind: 'error', text: 'Could not connect. Please check your connection and try again.' });
      setBusy(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (!name.trim() || !isValidEmail(email) || password.length < 12) {
      setMsg({ kind: 'error', text: 'Please fill in all fields — password needs at least 12 characters.' });
      return;
    }
    setBusy(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { ok, data } = await signUp({ name: name.trim(), email: cleanEmail, password });
      if (!ok) {
        setMsg({ kind: 'error', text: data.message || 'Sign up failed. Please try again.' });
        setBusy(false);
        return;
      }
      if (data.user) {
        localStorage.setItem('mealzy_user', JSON.stringify({ name: data.user.name, email: data.user.email }));
        if (data.user.ref_code) localStorage.setItem('mealzy_ref_code', data.user.ref_code);
        if (data.user.pro) localStorage.setItem('mealzy_pro', 'true');
        recordEmailLead(cleanEmail, name.trim());
        const pendingRef = localStorage.getItem('mealzy_pending_ref');
        if (pendingRef && pendingRef !== cleanEmail) {
          recordReferral(pendingRef, cleanEmail);
          localStorage.removeItem('mealzy_pending_ref');
        }
        localStorage.setItem('mealzy_is_new_user', '1');
        window.location.href = onboardingUrl();
      } else {
        setMsg({ kind: 'success', text: data.message || 'Check your email to continue.' });
        setBusy(false);
      }
    } catch (err) {
      setMsg({ kind: 'error', text: 'Could not connect. Please check your connection and try again.' });
      setBusy(false);
    }
  };

  if (checkingSession) return null;

  const isSignIn = tab === 'signin';

  return (
    <div className="flex min-h-screen flex-col bg-muted-bg lg:flex-row">
      {/* Left — brand panel (desktop only) */}
      <div className="relative hidden overflow-hidden bg-forest px-12 py-12 text-on-forest-body lg:flex lg:w-5/12 lg:flex-col lg:justify-between">
        <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-forest-raise" aria-hidden="true" />
        <div className="absolute -right-16 top-1/3 h-48 w-48 rounded-full bg-forest-raise" aria-hidden="true" />
        <div className="absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-forest-raise" aria-hidden="true" />

        <a href="/" className="relative z-10 font-display text-2xl font-black italic text-on-forest-strong no-underline">
          Mealzy
        </a>

        <div className="relative z-10 max-w-md">
          <p className="text-lg leading-relaxed text-on-forest-strong">A full week of meals in 30 seconds.</p>
          <ul className="mt-6 flex flex-col gap-3 text-[15px] text-on-forest-body">
            <li>Aims for your calorie and macro targets</li>
            <li>Built around your grocery budget</li>
            <li>Generates the shopping list automatically</li>
            <li>Free — no credit card needed</li>
          </ul>
        </div>

        <p className="relative z-10 text-sm text-on-forest-muted">Built by Emil, 16, Sweden</p>
      </div>

      {/* Right — auth form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:mx-0">
          <a href="/" className="mb-8 block font-display text-2xl font-black italic text-foreground no-underline lg:hidden">
            Mealzy
          </a>

          <h1 className="font-display text-3xl font-bold italic leading-tight tracking-[-0.01em] text-foreground">
            {isSignIn ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-2 text-[15px] text-muted-fg">
            {isSignIn ? 'Your plans are waiting.' : 'A full week of meals, 30 seconds from now.'}
          </p>

          <div role="tablist" aria-label="Authentication options" className="mt-6 flex gap-1 rounded-md border border-border-warm bg-white p-1">
            <button
              type="button"
              role="tab"
              aria-selected={isSignIn}
              onClick={() => switchTab('signin')}
              className={cn(
                'flex-1 rounded-[4px] px-3 py-2 text-sm font-semibold transition-colors',
                isSignIn ? 'bg-green text-white' : 'text-muted-fg hover:text-foreground'
              )}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isSignIn}
              onClick={() => switchTab('signup')}
              className={cn(
                'flex-1 rounded-[4px] px-3 py-2 text-sm font-semibold transition-colors',
                !isSignIn ? 'bg-green text-white' : 'text-muted-fg hover:text-foreground'
              )}
            >
              Create account
            </button>
          </div>

          {msg && (
            <p
              role="alert"
              aria-live="assertive"
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

          <Button
            type="button"
            variant="quiet"
            full
            className="mt-6 border border-border-warm bg-white text-foreground hover:bg-muted-bg"
            onClick={() => { window.location.href = '/auth/google'; }}
          >
            <GoogleLogo /> Continue with Google
          </Button>

          <div className="mt-6 flex items-center gap-3 text-sm text-muted-fg" aria-hidden="true">
            <div className="h-px flex-1 bg-border-warm" />
            or
            <div className="h-px flex-1 bg-border-warm" />
          </div>

          {isSignIn ? (
            <form onSubmit={handleSignIn} className="mt-6 flex flex-col gap-4" noValidate>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  ref={emailRef}
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <PasswordField
                  id="password"
                  label="Password"
                  placeholder="Your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <a
                  href="/reset-password"
                  className="mt-2 inline-block text-sm font-medium text-green-deep underline decoration-from-font underline-offset-2 hover:text-foreground dark:text-green-light"
                >
                  Forgot password?
                </a>
              </div>
              <Button type="submit" full disabled={busy} className="mt-1">
                {busy ? 'Please wait...' : 'Sign in'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="mt-6 flex flex-col gap-4" noValidate>
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <PasswordField
                id="signup-password"
                label="Password"
                placeholder="Min. 12 characters"
                autoComplete="new-password"
                minLength={12}
                checklist
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" full disabled={busy} className="mt-1">
                {busy ? 'Please wait...' : 'Create account'}
              </Button>
            </form>
          )}

          <p className="mt-8 text-center text-[13px] leading-normal text-muted-fg">
            By continuing you agree to our <a href="terms.html" className="underline decoration-from-font underline-offset-2 hover:text-foreground">Terms</a> and{' '}
            <a href="privacy-policy.html" className="underline decoration-from-font underline-offset-2 hover:text-foreground">Privacy Policy</a>.
            <br />
            Free plan: 1 plan a day for your first 30 days, then 1 a week — no credit card required.
          </p>
        </div>
      </div>
    </div>
  );
}
