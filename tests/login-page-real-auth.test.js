'use strict';

// Regression tests for client/src/login/LoginPage.jsx — a FUTURE/NON-LIVE
// component, kept for whenever the client's React migration adds `login` to
// vite.config.mjs's build inputs (see tests/live-login-page.test.js, test 5,
// which asserts that hasn't happened yet). It is NOT the production login
// fix — that's public/login.html, covered separately in
// tests/live-login-page.test.js. Do not treat these tests as proof the live
// site is fixed.
//
// LoginPage.jsx previously had NO real authentication: handleSubmit awaited a
// bare `setTimeout` and redirected unconditionally, calling no API at all.
// It also duplicated its own ad-hoc Tailwind classes/fonts instead of the
// shared design-system components every other real React auth page
// (ResetPasswordPage.jsx) uses. Both are fixed here so the component is
// correct whenever that migration eventually happens — but today it changes
// nothing a customer sees.
//
// These tests assert the source directly (no JSX render harness in this
// repo — see tests/dashboard-pro-status.test.js for the established
// vm-based pattern used elsewhere for plain JS instead).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const LOGIN_PAGE_PATH = path.join(__dirname, '..', 'client', 'src', 'login', 'LoginPage.jsx');
const LOGIN_PAGE_SRC = fs.readFileSync(LOGIN_PAGE_PATH, 'utf8');

const LOGIN_HTML_PATH = path.join(__dirname, '..', 'public', 'login.html');
const LOGIN_HTML_SRC = fs.readFileSync(LOGIN_HTML_PATH, 'utf8');

const AUTH_LIB_PATH = path.join(__dirname, '..', 'client', 'src', 'lib', 'auth.js');
const AUTH_LIB_SRC = fs.readFileSync(AUTH_LIB_PATH, 'utf8');

describe('B: LoginPage.jsx uses real authentication, not a fake timeout', () => {
  test('no simulated/fake auth delay remains', () => {
    assert.doesNotMatch(LOGIN_PAGE_SRC, /setTimeout\(\(?\)? ?=> ?r\(\)/);
    assert.doesNotMatch(LOGIN_PAGE_SRC, /simulated/i);
    assert.doesNotMatch(LOGIN_PAGE_SRC, /TODO: swap with your auth utility/);
  });

  test('sign-in calls the real signIn() from lib/auth.js, which hits /api/auth/signin', () => {
    assert.match(LOGIN_PAGE_SRC, /import \{[^}]*signIn[^}]*\} from '@\/lib\/auth'/);
    assert.match(LOGIN_PAGE_SRC, /await signIn\(\{ email: [^,]+, password \}\)/);
    assert.match(AUTH_LIB_SRC, /fetch\('\/api\/auth\/signin'/);
  });
});

describe('C: signup uses the real auth path too', () => {
  test('sign-up calls signUp() from lib/auth.js, which hits /api/auth/signup', () => {
    assert.match(LOGIN_PAGE_SRC, /import \{[^}]*signUp[^}]*\} from '@\/lib\/auth'/);
    assert.match(LOGIN_PAGE_SRC, /await signUp\(\{ name: [^,]+, email: cleanEmail, password \}\)/);
    assert.match(AUTH_LIB_SRC, /fetch\('\/api\/auth\/signup'/);
  });

  test('LoginPage now offers both Sign in and Create account (previously sign-up was just a dead link)', () => {
    assert.match(LOGIN_PAGE_SRC, /Sign in/);
    assert.match(LOGIN_PAGE_SRC, /Create account/);
  });
});

describe('A: required style/build assets are the shared design-system components, not a bespoke one-off', () => {
  test('LoginPage reuses the same Button/Input/Label/PasswordField components as the other real auth page (ResetPasswordPage.jsx)', () => {
    assert.match(LOGIN_PAGE_SRC, /import \{ Button \} from '@\/components\/ui\/button'/);
    assert.match(LOGIN_PAGE_SRC, /import \{ Label, Input \} from '@\/components\/ui\/field'/);
    assert.match(LOGIN_PAGE_SRC, /import PasswordField from '@\/components\/PasswordField'/);
  });

  test('LoginPage uses the app\'s real design tokens (font-display, text-foreground, bg-green) instead of default Tailwind gray/stone utilities', () => {
    assert.match(LOGIN_PAGE_SRC, /font-display/);
    assert.doesNotMatch(LOGIN_PAGE_SRC, /text-stone-\d/, 'must not use default Tailwind stone palette instead of the app\'s tokens');
    assert.doesNotMatch(LOGIN_PAGE_SRC, /bg-parchment\b.*text-stone/, 'must not mix an unrelated ad-hoc palette');
  });

  test('LoginPage no longer imports a separate Google Font — it inherits the app-wide self-hosted Fraunces/Inter', () => {
    assert.doesNotMatch(LOGIN_PAGE_SRC, /@fontsource\/plus-jakarta-sans/);
  });
});

describe('D: pricing/onboarding query params are preserved through login, not silently discarded', () => {
  test('onboardingUrl() forwards budget/diet/dietary/cookingTime to onboarding.html, matching the legacy public/js/login.js behavior', () => {
    assert.match(LOGIN_PAGE_SRC, /\['budget', 'diet', 'dietary', 'cookingTime'\]/);
  });

  test('a ?ref= referral param is captured into localStorage, matching legacy behavior', () => {
    assert.match(LOGIN_PAGE_SRC, /mealzy_pending_ref/);
  });
});

describe('E/F: copy matches actual backend policy — no stale "3 plans/month" or overstated guarantees', () => {
  test('LoginPage.jsx states the real logged-in free-tier policy (1/day for 30 days, then 1/week)', () => {
    assert.doesNotMatch(LOGIN_PAGE_SRC, /3 meal plans a month/);
    assert.match(LOGIN_PAGE_SRC, /1 plan a day for your first 30 days, then 1 a week/);
  });

  test('public/login.html (still the live page until a client build produces dist/login.html) has the same fix applied', () => {
    assert.doesNotMatch(LOGIN_HTML_SRC, /3 meal plans a month/);
    assert.match(LOGIN_HTML_SRC, /1 plan a day for your first 30 days, then 1 a week/);
  });

  test('feature claims are hedged ("aims for" / "built around"), not stated as absolute guarantees', () => {
    assert.doesNotMatch(LOGIN_PAGE_SRC, /Hits your exact calorie and macro targets/);
    assert.doesNotMatch(LOGIN_PAGE_SRC, /Stays within your grocery budget/);
    assert.doesNotMatch(LOGIN_HTML_SRC, /Hits your exact calorie and macro targets/);
    assert.doesNotMatch(LOGIN_HTML_SRC, /Stays within your grocery budget/);
  });
});

describe('G: existing auth tests / contracts remain untouched', () => {
  test('lib/auth.js endpoint contracts are unchanged (still match server.js exactly)', () => {
    assert.match(AUTH_LIB_SRC, /POST \/api\/auth\/signup\s+\{ name, email, password \} -> \{ user \}/);
    assert.match(AUTH_LIB_SRC, /POST \/api\/auth\/signin\s+\{ email, password \} -> \{ user \}/);
  });

  test('LoginPage redirects through /api/profile after sign-in, same as the legacy page, so dashboard vs onboarding routing is unchanged', () => {
    assert.match(LOGIN_PAGE_SRC, /fetchProfile\(\)/);
    assert.match(LOGIN_PAGE_SRC, /dashboard\.html/);
  });

  test('Google OAuth still points at the real /auth/google start route', () => {
    assert.match(LOGIN_PAGE_SRC, /\/auth\/google/);
  });
});
