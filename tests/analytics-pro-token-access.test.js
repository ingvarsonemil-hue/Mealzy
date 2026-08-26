'use strict';

// Regression tests for Issue B: opening Analytics must never prompt a
// customer for a "Pro token", and the internal admin mechanism must never
// place PRO_TOKEN in a customer-facing URL.
//
// History (two fixes, same file):
//
// 1. analytics.html's getProToken() called window.prompt() unconditionally
//    on every page load, on behalf of two admin-only widgets (conversion
//    funnel, site-wide activity) that are `display:none` by default for
//    everyone. First fix replaced the prompt with a `?admin_token=` query
//    param the frontend would forward as the `x-pro-token` header.
//
// 2. That query-param approach was itself unsafe: a URL parameter persists
//    in browser history, server access logs, Referer headers on outbound
//    requests, and any copied/shared/screenshotted link — all of which would
//    leak PRO_TOKEN. Current fix: the browser-side admin path is disabled
//    entirely. getProToken() always returns '', so the funnel/site-wide
//    fetches never fire and their cards simply stay hidden. The two
//    PRO_TOKEN-gated endpoints remain reachable directly (curl/Postman +
//    the x-pro-token header) for internal use — the backend enforcement is
//    untouched by either fix.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ANALYTICS_HTML_PATH = path.join(__dirname, '..', 'public', 'analytics.html');
const ANALYTICS_SRC = fs.readFileSync(ANALYTICS_HTML_PATH, 'utf8');

const SERVER_JS_PATH = path.join(__dirname, '..', 'server.js');
const SERVER_SRC = fs.readFileSync(SERVER_JS_PATH, 'utf8');

describe('B/6: a customer opening Analytics is never prompted for a token', () => {
  test('window.prompt is not called anywhere in analytics.html', () => {
    assert.doesNotMatch(ANALYTICS_SRC, /window\.prompt/);
  });

  test('personal analytics content (charts, goals) is rendered for every authenticated user, unconditionally, with no admin fetch in the load path', () => {
    const initSrc = ANALYTICS_SRC.slice(ANALYTICS_SRC.indexOf('async function init()'), ANALYTICS_SRC.indexOf('function getLast7Days'));
    assert.match(initSrc, /buildCharts\(\);/);
    assert.match(initSrc, /renderGoalsProgress\(\);/);
    assert.doesNotMatch(initSrc, /loadFunnelStats\(\);/, 'init() must not call the admin funnel widget');
    assert.doesNotMatch(initSrc, /loadSiteAnalytics\(\);/, 'init() must not call the admin site-wide widget');
  });

  test('the admin-only cards stay hidden (display:none) — nothing in the page can ever show them to a customer', () => {
    assert.match(ANALYTICS_SRC, /style="[^"]*display:none;?"\s*id="funnelCard"/);
    assert.match(ANALYTICS_SRC, /style="[^"]*display:none;?"\s*id="siteAnalyticsCard"/);
  });
});

describe('7/10: the normal Analytics page URL does not require, and never carries, admin_token — PRO_TOKEN is not written into a customer-facing URL', () => {
  test('getProToken() no longer reads any URL query parameter', () => {
    const fnSrc = ANALYTICS_SRC.slice(ANALYTICS_SRC.indexOf('function getProToken()'), ANALYTICS_SRC.indexOf('function getProToken()') + 120);
    assert.doesNotMatch(fnSrc, /URLSearchParams/, 'must not read admin_token (or any token) from the URL — that leaks via history/logs/Referer');
    assert.match(fnSrc, /function getProToken\(\) \{ return ''; \}/);
  });

  test('no application code constructs a URL containing "admin_token" or "pro_token"', () => {
    assert.doesNotMatch(ANALYTICS_SRC, /[?&](admin_token|pro_token)=/);
  });

  test('a plain page load never sends x-pro-token, because the token is always empty', () => {
    const fetchSrc = ANALYTICS_SRC.slice(ANALYTICS_SRC.indexOf('async function loadFunnelStats'), ANALYTICS_SRC.indexOf('function getLast7Days'));
    assert.match(fetchSrc, /const token = getProToken\(\);\s*\n\s*if \(!token\) return;/, 'the fetch functions must still bail out before sending any header when the token is empty');
  });
});

describe('8: customer Analytics works without admin credentials', () => {
  test('the redirect-to-login gate depends only on session auth (/api/auth/me), never on a token or serverUser.pro', () => {
    const initSrc = ANALYTICS_SRC.slice(ANALYTICS_SRC.indexOf('async function init()'), ANALYTICS_SRC.indexOf('  async function loadFunnelStats'));
    assert.match(initSrc, /await fetch\('\/api\/auth\/me'\)/);
    assert.match(initSrc, /window\.location\.href = 'login\.html'/, 'unauthenticated users are redirected to login');
    assert.doesNotMatch(initSrc, /if \(!u\.pro\)/, 'must not redirect/block Free users from the page');
    assert.doesNotMatch(initSrc, /getProToken\(\)/, 'the personal-analytics path must not depend on getProToken() at all');
  });

  const sidebarSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'partials', 'layout', 'sidebar.html'), 'utf8');
  test('the sidebar Analytics link carries no Pro-only indicator (matches product intent: free for all authenticated users)', () => {
    const analyticsLine = sidebarSrc.split('\n').find((l) => l.includes('href="analytics.html"'));
    assert.ok(analyticsLine, 'expected an Analytics nav link');
    assert.doesNotMatch(analyticsLine, /pro-only|locked|badge-pro/i);
  });
});

describe('9: admin endpoints remain server-protected regardless of what the frontend does', () => {
  test('/api/analytics is gated by a server-side timingSafeCompare against process.env.PRO_TOKEN, fail-closed, and ignores localStorage', () => {
    assert.match(SERVER_SRC, /app\.get\('\/api\/analytics', requireSession, async \(req, res\) => \{/);
    const analyticsRoute = SERVER_SRC.slice(SERVER_SRC.indexOf("app.get('/api/analytics', requireSession"), SERVER_SRC.indexOf("app.get('/api/analytics', requireSession") + 800);
    assert.match(analyticsRoute, /timingSafeCompare\(proToken, process\.env\.PRO_TOKEN\)/);
    assert.doesNotMatch(analyticsRoute, /mealzy_pro/);
  });

  test('/api/analytics/funnel enforces the same fail-closed check', () => {
    const funnelRoute = SERVER_SRC.slice(SERVER_SRC.indexOf("app.get('/api/analytics/funnel'"), SERVER_SRC.indexOf("app.get('/api/analytics/funnel'") + 500);
    assert.match(funnelRoute, /if \(!isAdmin\) return res\.status\(401\)/);
  });

  test('the server-side check still reads the token from a request header, never from a query string', () => {
    const analyticsRoute = SERVER_SRC.slice(SERVER_SRC.indexOf("app.get('/api/analytics', requireSession"), SERVER_SRC.indexOf("app.get('/api/analytics', requireSession") + 400);
    assert.match(analyticsRoute, /req\.headers\['x-pro-token'\]/);
    assert.doesNotMatch(analyticsRoute, /req\.query/);
  });
});

describe('no visible <input>/<label> in the markup solicits a token from a normal visitor', () => {
  test('no admin-token UI exists anywhere in the body', () => {
    const bodySrc = ANALYTICS_SRC.slice(ANALYTICS_SRC.indexOf('<body'), ANALYTICS_SRC.indexOf('<script>\n'));
    assert.doesNotMatch(bodySrc, /<input[^>]*token/i);
    assert.doesNotMatch(bodySrc, /<label[^>]*>[^<]*token/i);
  });
});

describe('no analytics data leaks between accounts', () => {
  test('the per-user analytics content reads from the authenticated session\'s own /api/auth/me + localStorage, not a shared/global store', () => {
    const initSrc = ANALYTICS_SRC.slice(ANALYTICS_SRC.indexOf('async function init()'), ANALYTICS_SRC.indexOf('function getLast7Days'));
    assert.match(initSrc, /await fetch\('\/api\/auth\/me'\)/);
  });
});
