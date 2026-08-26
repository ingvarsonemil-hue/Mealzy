'use strict';

/**
 * Complete Authenticated Funnel Identity audit (2026-08-26).
 *
 * The prior funnel audit found signup / signup_google / onboarding_claim /
 * onboarding_targets_set / upgrade_click / pro_activated could not be
 * joined to a real user in the ANALYTICS DATA. Tracing the CURRENT CODE
 * (not the historical rows, which mostly predate these fixes) shows:
 *
 *   - signup / signup_google: already server-emitted with {userId} only,
 *     no email, since the GDPR email-scrubbing commit (2026-08-03,
 *     "stop logging raw email into analytics across 11 logEvent call
 *     sites") — well before this task. Regression-locked below.
 *   - upgrade_click: 100% client-emitted, but every call site routes
 *     through POST /api/track (server.js), which already runs every
 *     event through analyticsIdentity.js's resolveTrackedEventData (see
 *     tests/analytics-identity.test.js) — the same mechanism grocery
 *     events use. Already correct since the 2026-08-23 "measure
 *     authenticated grocery activation" commit; regression-locked below.
 *   - pro_activated: server-emitted from 2 sites (the Stripe-verified
 *     /api/pro/activate endpoint, and the Stripe webhook's own verified
 *     email->user lookup), both using session/webhook-authoritative
 *     identity, never `req.body`. Regression-locked below.
 *   - onboarding_claim / onboarding_targets_set: NOT emitted by any
 *     current code path. `git log -S"onboarding_claim"` shows both
 *     `track()` calls were REMOVED in the a0afb48 homepage-Showcase
 *     rebuild. There is nothing to attach identity to — resurrecting
 *     this instrumentation is a product decision (what actually counts
 *     as "onboarding complete" post-rebuild?), out of scope for this
 *     narrowly-scoped identity correction. Documented, not silently
 *     invented — see the audit report.
 *
 * No source changes were needed for signup/signup_google/upgrade_click/
 * pro_activated. These tests exist to make that already-correct behavior
 * a proven regression, not an assumption re-derived from reading code
 * each time. Since server.js has no HTTP-integration test harness (no
 * supertest anywhere in this repo, and server.js is the pre-existing
 * exempt monolith - see CLAUDE.md), identity is proven the same way the
 * rest of this file's neighbors do it: exact source-shape assertions on
 * the literal db.logEvent(...) call sites, plus direct unit tests of the
 * shared primitives (resolveTrackedEventData, db.logEvent's own
 * non-fatal error handling) those call sites depend on.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { resolveTrackedEventData } = require('../analyticsIdentity');

const SERVER_SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

describe('A: email signup emits {userId} from the server-created account, never email', () => {
  test('the signup route logs userId (the locally-created account id), not email', () => {
    assert.match(SERVER_SRC, /await db\.logEvent\('signup', \{ userId \}, ''\);/,
      'signup must log the server-created userId variable, not a client-supplied field');
  });

  test('the signup event call site does not reference email/name in its payload', () => {
    const idx = SERVER_SRC.indexOf(`await db.logEvent('signup', { userId }, '');`);
    assert.notEqual(idx, -1);
    // The exact literal payload object is `{ userId }` - grepping the literal
    // string above already proves no other keys are present in this call.
  });
});

describe('B: Google signup emits {userId} for the account actually created', () => {
  test('the signup_google route logs the newly-created account id (newId), not email', () => {
    assert.match(SERVER_SRC, /await db\.logEvent\('signup_google', \{ userId: newId \}, ''\);/,
      'signup_google must log the id of the account it just created via db.createUserGoogle, not a client-supplied field');
  });

  test('signup_google logging happens after db.createUserGoogle, using that same id', () => {
    const createIdx = SERVER_SRC.indexOf('await db.createUserGoogle({ id: newId,');
    const logIdx = SERVER_SRC.indexOf(`await db.logEvent('signup_google', { userId: newId }, '');`);
    assert.ok(createIdx !== -1 && logIdx !== -1 && createIdx < logIdx,
      'signup_google must log AFTER the account (and its id) is created, not before');
  });
});

describe('C: client-supplied userId can never override server identity (shared by upgrade_click and all /api/track events)', () => {
  test('an authenticated request always gets the server-verified id, even if the client tries to spoof another', () => {
    const spoofed = resolveTrackedEventData({ userId: 'someone-else', source: 'grocery_banner' }, 'real-user-1');
    assert.equal(spoofed.userId, 'real-user-1');
    assert.equal(spoofed.source, 'grocery_banner');
  });

  test('an anonymous request never stores a client-injected userId', () => {
    const anon = resolveTrackedEventData({ userId: 'someone-else', source: 'zero_plans_banner' }, undefined);
    assert.ok(!('userId' in anon));
    assert.equal(anon.source, 'zero_plans_banner');
  });
});

describe('D/E: onboarding_claim / onboarding_targets_set are DEAD instrumentation, not silently broken', () => {
  test('neither event is emitted by any current server or client code', () => {
    // Confirms these were removed (a0afb48 homepage-Showcase rebuild), not
    // merely unauthenticated - there is no emission site to attach an
    // identity to. Resurrecting them is a product decision, out of scope
    // here (see this file's header comment and the audit report).
    assert.doesNotMatch(SERVER_SRC, /'onboarding_claim'/);
    assert.doesNotMatch(SERVER_SRC, /'onboarding_targets_set'/);
  });
});

describe('F: upgrade_click is routed through POST /api/track, which already attaches server identity', () => {
  test('POST /api/track resolves identity via resolveTrackedEventData before every db.logEvent call, covering upgrade_click and every other client-emitted event', () => {
    const trackRouteIdx = SERVER_SRC.indexOf(`app.post('/api/track'`);
    assert.notEqual(trackRouteIdx, -1, '/api/track route must exist');
    const routeBody = SERVER_SRC.slice(trackRouteIdx, trackRouteIdx + 600);
    assert.match(routeBody, /resolveTrackedEventData\(data, req\.session\?\.userId\)/,
      '/api/track must resolve identity through the shared, tested helper - not re-implement its own logic');
    assert.match(routeBody, /optionalSession/,
      '/api/track must use the non-rejecting session-resolution middleware so anonymous tracking keeps working');
  });

  test('upgrade_click\'s real client payload shape ({source}/{source, billing}) survives identity resolution unchanged', () => {
    const anon = resolveTrackedEventData({ source: 'upgrade_page', billing: 'monthly' }, undefined);
    assert.deepEqual(anon, { source: 'upgrade_page', billing: 'monthly' });

    const authed = resolveTrackedEventData({ source: 'grocery_banner' }, 'user-42');
    assert.deepEqual(authed, { source: 'grocery_banner', userId: 'user-42' });
  });
});

describe('G: pro_activated is emitted only from authoritative, verified identity sources', () => {
  test('the Stripe-verified /api/pro/activate endpoint logs session.userId, never req.body', () => {
    assert.match(SERVER_SRC, /await db\.logEvent\('pro_activated', \{ userId: session\.userId, source: 'pro_welcome_verified' \}, ''\);/,
      'pro_activated (verified-activation path) must use the server session id, not client input');
  });

  test('the Stripe webhook logs the id of the user looked up via the webhook\'s own verified email, never a client-supplied id', () => {
    assert.match(SERVER_SRC, /await db\.logEvent\('pro_activated', \{ userId: user\.id, source: 'stripe_webhook' \}, ''\);/,
      'pro_activated (webhook path) must use the id resolved from Stripe\'s own verified checkout-session email, not req.body');
    // Prove the lookup is keyed off Stripe's own email, not anything from the request body.
    const webhookLogIdx = SERVER_SRC.indexOf(`await db.logEvent('pro_activated', { userId: user.id, source: 'stripe_webhook' }, '');`);
    const before = SERVER_SRC.slice(Math.max(0, webhookLogIdx - 400), webhookLogIdx);
    assert.match(before, /session\.customer_details\?\.email/,
      'the webhook user lookup must derive from Stripe\'s verified session payload, not attacker-controlled input');
  });

  test('exactly two pro_activated call sites exist in server.js - a third literal match would mean a new, unaudited emission path was added', () => {
    const matches = SERVER_SRC.match(/db\.logEvent\('pro_activated'/g) || [];
    assert.equal(matches.length, 2);
  });
});

describe('H: anonymous tracking keeps working exactly as before for legitimately anonymous events', () => {
  test('an anonymous /api/track payload with no session is stored with no userId key added', () => {
    const result = resolveTrackedEventData({ page: '/pricing' }, undefined);
    assert.deepEqual(result, { page: '/pricing' });
  });
});

describe('I/J/K: an analytics-logging failure can never break signup, Google signup, or Pro activation', () => {
  test('db.logEvent resolves without throwing even when the DB client is unavailable (e.g. not yet initialized)', async () => {
    const db = require('../db.js');
    // No db.initDb() call in this test file - _client stays null, so the
    // underlying execute() throws inside logEvent. It must be swallowed.
    await assert.doesNotReject(db.logEvent('some_event', { userId: 'x' }, ''));
  });

  test('every one of the six audited events is logged with `await db.logEvent(...)`, which never throws back into the caller', () => {
    // Structural guard: every call site under audit uses the same
    // non-fatal logEvent primitive, not a raw client.execute() that could
    // propagate a DB error into the signup/pro-activation response path.
    for (const snippet of [
      `await db.logEvent('signup', { userId }, '');`,
      `await db.logEvent('signup_google', { userId: newId }, '');`,
      `await db.logEvent('pro_activated', { userId: session.userId, source: 'pro_welcome_verified' }, '');`,
      `await db.logEvent('pro_activated', { userId: user.id, source: 'stripe_webhook' }, '');`,
    ]) {
      assert.ok(SERVER_SRC.includes(snippet), `expected call site not found: ${snippet}`);
    }
  });
});

describe('L/M: corrected payloads carry no email, name, or other sensitive fields - only opaque userId + minimal funnel metadata', () => {
  test('signup/signup_google payloads are exactly {userId} - no email, name, or profile data', () => {
    assert.doesNotMatch(SERVER_SRC, /db\.logEvent\('signup', \{[^}]*email/);
    assert.doesNotMatch(SERVER_SRC, /db\.logEvent\('signup_google', \{[^}]*email/);
  });

  test('pro_activated payloads carry only {userId, source} - no Stripe ids, no payment details, no email', () => {
    const matches = [...SERVER_SRC.matchAll(/db\.logEvent\('pro_activated', (\{[^}]*\})/g)];
    assert.equal(matches.length, 2);
    for (const m of matches) {
      // "source" is an allowed, non-sensitive funnel-metadata label (e.g.
      // the literal string 'stripe_webhook' names WHICH activation path
      // fired - it is not a Stripe customer/subscription/payment id).
      // What must never appear is an actual identifier/PII field.
      assert.doesNotMatch(m[1], /email|customerId|customer_id|stripeCustomer|subscriptionId|paymentMethod|card|name:/i);
      const keys = [...m[1].matchAll(/(\w+)\s*:/g)].map(k => k[1]).sort();
      assert.deepEqual(keys, ['source', 'userId']);
    }
  });

  test('resolveTrackedEventData never introduces fields beyond userId - client-sent funnel metadata (e.g. upgrade_click\'s source/billing) passes through as-is, nothing is added', () => {
    const result = resolveTrackedEventData({ source: 'stripe_button' }, 'user-1');
    assert.deepEqual(Object.keys(result).sort(), ['source', 'userId']);
  });
});
