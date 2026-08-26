'use strict';

// Regression tests for the LIVE login page — public/login.html + public/js/login.js.
//
// Confirmed via server.js route precedence + an actual `npm run build`:
//   - dist/ is registered as static middleware BEFORE public/ (server.js).
//   - server.js's distPages loop also registers a `/login` (no extension) route
//     that serves dist/login.html.
//   - BUT client/vite.config.mjs's rollupOptions.input only currently builds
//     `main` and `pricing` — `login` is not wired in, so `npm run build` never
//     produces dist/login.html.
//   - Therefore /login.html (the URL every real link, email, and redirect in
//     this codebase actually uses) is served by public/login.html, and GET
//     /login (no extension) 500s (dist/login.html doesn't exist to sendFile).
//
// Root cause of the reported screenshot (default browser controls, serif
// heading, tiny legal copy): confirmed live via getComputedStyle() on the
// actually-served /login.html — inputs, buttons, and body text were all
// rendering with zero applied font-family/border/background because the base
// `.form-input` / `.btn` / `body` rules that its markup depends on live only
// in public/css/style-base.css (the app-page stylesheet), which login.html
// never loads. tokens.css already had the dark-mode override
// (`[data-theme="dark"] .form-input`) and the icon-wrapper variant
// (`.form-input-wrapper .form-input`) for these same classes, but the base
// light-mode rule itself was missing — a real gap, not an intentional design.
//
// Fix: added the missing base body/.btn/.btn-primary/.btn-full/.btn-quiet/
// .form-input rules to public/css/tokens.css (loaded first, by every page),
// using only tokens already defined in that same file, so app pages (which
// load style-base.css afterward, same specificity, same file-order-wins
// cascade) are completely unaffected.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const LOGIN_HTML_PATH = path.join(__dirname, '..', 'public', 'login.html');
const LOGIN_HTML_SRC = fs.readFileSync(LOGIN_HTML_PATH, 'utf8');

const LOGIN_JS_PATH = path.join(__dirname, '..', 'public', 'js', 'login.js');
const LOGIN_JS_SRC = fs.readFileSync(LOGIN_JS_PATH, 'utf8');

const TOKENS_CSS_PATH = path.join(__dirname, '..', 'public', 'css', 'tokens.css');
const TOKENS_CSS_SRC = fs.readFileSync(TOKENS_CSS_PATH, 'utf8');

const VITE_CONFIG_PATH = path.join(__dirname, '..', 'vite.config.mjs');
const VITE_CONFIG_SRC = fs.readFileSync(VITE_CONFIG_PATH, 'utf8');

const SERVER_JS_SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

describe('1: live public/login.html loads the required Mealzy styles', () => {
  test('login.html links tokens.css, landing.css, funnel.css, fonts.css', () => {
    assert.match(LOGIN_HTML_SRC, /<link rel="stylesheet" href="\/css\/fonts\.css">/);
    assert.match(LOGIN_HTML_SRC, /<link rel="stylesheet" href="\/css\/tokens\.css">/);
    assert.match(LOGIN_HTML_SRC, /<link rel="stylesheet" href="\/css\/landing\.css">/);
    assert.match(LOGIN_HTML_SRC, /<link rel="stylesheet" href="\/css\/funnel\.css">/);
  });

  test('theme-init.js is still the first script in <head> (dark-mode flash prevention, unrelated to this fix, must not regress)', () => {
    const firstScript = LOGIN_HTML_SRC.match(/<script[^>]*src="([^"]+)"/);
    assert.ok(firstScript);
    assert.match(firstScript[1], /theme-init\.js$/);
  });
});

describe('2: live login controls are not relying on browser defaults', () => {
  test('tokens.css now defines a base body rule using tokens already declared in the same file', () => {
    assert.match(TOKENS_CSS_SRC, /^body \{[\s\S]{0,200}?font-family: var\(--font-body\);/m);
    assert.match(TOKENS_CSS_SRC, /^body \{[\s\S]{0,200}?color: var\(--color-foreground\);/m);
    assert.match(TOKENS_CSS_SRC, /^body \{[\s\S]{0,200}?background: var\(--color-parchment\);/m);
  });

  test('tokens.css now defines base .btn / .btn-primary / .btn-full / .btn-quiet rules (login.js\'s buttons use exactly these classes)', () => {
    assert.match(TOKENS_CSS_SRC, /\.btn \{/);
    assert.match(TOKENS_CSS_SRC, /\.btn-primary \{ background: var\(--color-green\)/);
    assert.match(TOKENS_CSS_SRC, /\.btn-full \{ width: 100%; \}/);
    assert.match(TOKENS_CSS_SRC, /\.btn-quiet \{/);
  });

  test('tokens.css now defines a base .form-input rule (border/radius/background/font), not just the dark-mode override that already existed', () => {
    assert.match(TOKENS_CSS_SRC, /\.form-input, \.form-select, \.form-textarea \{[\s\S]*?border: 1px solid var\(--color-border\);/);
    // The dark-mode override and icon-wrapper variant already existed before this fix — must still be present, untouched.
    assert.match(TOKENS_CSS_SRC, /\[data-theme="dark"\] \.form-input \{/);
    assert.match(TOKENS_CSS_SRC, /\.form-input-wrapper \.form-input \{/);
  });

  test('every color/font value in the new base rules is a token reference, not a raw hex/rgb value (design-system rule)', () => {
    const newRulesSrc = TOKENS_CSS_SRC.slice(
      TOKENS_CSS_SRC.indexOf('/* Base body/button/input rules'),
      TOKENS_CSS_SRC.indexOf('.form-input-wrapper {')
    );
    // rgba(var(--token), alpha) is fine — it's still fully token-driven, just wrapped for alpha compositing.
    const rawColors = (newRulesSrc.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/g) || [])
      .filter((v) => !/rgba?\(\s*var\(--/.test(v));
    assert.deepEqual(rawColors, [], `found raw color values instead of tokens: ${rawColors}`);
  });

  test('login.html markup only uses classes now covered by the new base rules (form-input, btn btn-primary btn-full, btn-quiet)', () => {
    assert.match(LOGIN_HTML_SRC, /class="form-input"/);
    assert.match(LOGIN_HTML_SRC, /class="btn btn-primary btn-full"/);
    assert.match(LOGIN_HTML_SRC, /class="btn btn-quiet btn-full"/);
  });
});

describe('3: public/login.html still uses real auth endpoints (unchanged by the CSS fix)', () => {
  test('login.js calls the real signin/signup/reset endpoints', () => {
    assert.match(LOGIN_JS_SRC, /fetch\('\/api\/auth\/signin'/);
    assert.match(LOGIN_JS_SRC, /fetch\('\/api\/auth\/signup'/);
    assert.match(LOGIN_JS_SRC, /fetch\('\/api\/auth\/reset-request'/);
  });

  test('Google OAuth still points at /auth/google', () => {
    assert.match(LOGIN_JS_SRC, /window\.location\.href = '\/auth\/google'/);
  });

  test('signin redirects through /api/profile to decide dashboard vs onboarding, same as before', () => {
    assert.match(LOGIN_JS_SRC, /fetch\('\/api\/profile'\)/);
    assert.match(LOGIN_JS_SRC, /window\.location\.href = 'dashboard\.html'/);
  });
});

describe('4: stale free-plan copy is gone from the live page', () => {
  test('no "3 meal plans a month" claim remains', () => {
    assert.doesNotMatch(LOGIN_HTML_SRC, /3 meal plans a month/);
  });

  test('the real logged-in free-tier policy is stated instead', () => {
    assert.match(LOGIN_HTML_SRC, /1 plan a day for your first 30 days, then 1 a week/);
  });

  test('feature claims are hedged, not stated as absolute guarantees', () => {
    assert.doesNotMatch(LOGIN_HTML_SRC, /Hits your exact calorie and macro targets/);
    assert.doesNotMatch(LOGIN_HTML_SRC, /Stays within your grocery budget/);
  });
});

describe('5: LoginPage.jsx remains non-live — no vite input change was made', () => {
  test('vite.config.mjs does not register a "login" build input', () => {
    const inputBlock = VITE_CONFIG_SRC.slice(VITE_CONFIG_SRC.indexOf('input:'), VITE_CONFIG_SRC.indexOf('input:') + 400);
    assert.doesNotMatch(inputBlock, /login:/, 'adding a login build input is a deliberate future task, not part of this fix');
  });

  test('server.js still lists /login in distPages (pre-existing, unrelated to this fix) — confirms /login (no extension) 500s today, and is not the route real links use', () => {
    assert.match(SERVER_JS_SRC, /const distPages = \[\s*\n\s*'pricing', 'upgrade', 'login',/);
  });

  test('every real internal link/redirect in server.js and login.js targets login.html, not the bare /login route', () => {
    const redirectTargets = SERVER_SRC_LOGIN_HTML_REFS();
    assert.ok(redirectTargets.length > 0, 'expected at least one /login.html reference');
    assert.ok(redirectTargets.every((t) => t.includes('login.html')));
  });

  function SERVER_SRC_LOGIN_HTML_REFS() {
    return (SERVER_JS_SRC.match(/redirect\('\/login\.html[^']*'\)/g) || []);
  }
});
