'use strict';

/**
 * Mealzy Mobile M3C: native Bearer authentication.
 *
 * Adversarial coverage for:
 *   - the shared performSignup / performSignin seam (web contract unchanged)
 *   - POST /api/auth/mobile/signup + /api/auth/mobile/signin
 *   - Authorization: Bearer extraction + cookie/Bearer precedence in
 *     getSessionFromReq
 *   - /api/auth/me transport behaviour (no rotation / no Set-Cookie for Bearer)
 *   - revocation parity (token_version bump, password reset, signout-all)
 *   - the fixed 7-day native expiry and the original-loginAt absolute cap
 *
 * Runs the real Express app against a temp file-backed libSQL DB. No Anthropic,
 * no network, no money. Each request uses a unique X-Forwarded-For so the auth
 * rate limiter never interferes (trust proxy = 1). Tests that need a stable
 * client IP (shared lockout) opt in explicitly.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { randomUUID } = crypto;
const jwt = require('jsonwebtoken');

// ── env MUST be set before server.js / db.js are required ────────────────────
const TMP_DB = path.join(os.tmpdir(), `mealzy-test-mobile-auth-${randomUUID()}.db`);
process.env.TURSO_DATABASE_URL = `file:${TMP_DB}`;
delete process.env.TURSO_AUTH_TOKEN;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-m3c';
delete process.env.NODE_ENV;              // not 'production'
delete process.env.UNSPLASH_ACCESS_KEY;   // no image fetch
process.env.CERTIFICATION_GATE = 'shadow';

const db = require('../db.js');
const app = require('../server.js');

const SECRET = process.env.JWT_SECRET;
const GOOD_PW = 'Testpass123!word';   // >= 12 chars, 3+ classes, not common

let server;
let baseUrl;
let ipCounter = 0;
const freshIp = () => `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

test.before(async () => {
  await db.initDb();
  // `plan_generations` is provisioned outside initDb() in production (manual
  // Turso migration). A fresh test DB lacks it, and GET /api/auth/me reads it
  // for non-Pro users. Create it here so the endpoint behaves as it does in
  // production. This is test-only setup; db.js is not modified.
  await db.run(`CREATE TABLE IF NOT EXISTS plan_generations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    month TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    updated_at TEXT,
    UNIQUE(user_id, month)
  )`);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TMP_DB + suffix); } catch (e) { /* already gone */ }
  }
});

function request(method, urlPath, { headers = {}, body, ip } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const h = {
      'X-Forwarded-For': ip || freshIp(),
      ...headers,
    };
    if (data !== null) {
      h['Content-Type'] = 'application/json';
      h['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(`${baseUrl}${urlPath}`, { method, headers: h }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (e) { /* leave null */ }
        resolve({ status: res.statusCode, headers: res.headers, json, raw });
      });
    });
    req.on('error', reject);
    if (data !== null) req.write(data);
    req.end();
  });
}

const uniqEmail = () => `m3c-${randomUUID().slice(0, 12)}@example.test`;
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// Create an account through the native endpoint; returns { token, user }.
async function mobileSignup(email = uniqEmail()) {
  const r = await request('POST', '/api/auth/mobile/signup', {
    body: { name: 'M3C Tester', email, password: GOOD_PW },
  });
  assert.equal(r.status, 200, `mobile signup failed: ${r.raw}`);
  assert.ok(r.json.token, 'expected a token');
  return { email, token: r.json.token, user: r.json.user };
}

// ───────────────────────────────────────────────────────────────────────────
// A. existing web cookie signin still works
// ───────────────────────────────────────────────────────────────────────────
test('A. web signup + cookie signin still works end to end', async () => {
  const email = uniqEmail();
  const su = await request('POST', '/api/auth/signup', {
    body: { name: 'Web User', email, password: GOOD_PW },
  });
  assert.equal(su.status, 200);
  assert.ok(String(su.headers['set-cookie'] || '').includes('mealzy_session='));

  const si = await request('POST', '/api/auth/signin', {
    body: { email, password: GOOD_PW },
  });
  assert.equal(si.status, 200);
  assert.equal(si.json.success, true);
  assert.equal(si.json.user.email, email);
  const cookie = String(si.headers['set-cookie'] || '');
  assert.ok(cookie.includes('mealzy_session='));
  assert.ok(/HttpOnly/i.test(cookie));
  assert.ok(/SameSite=Lax/i.test(cookie));
  assert.ok(/Max-Age=86400/.test(cookie));
});

// ───────────────────────────────────────────────────────────────────────────
// B. existing web signup still works (shape + enumeration-safe duplicate)
// ───────────────────────────────────────────────────────────────────────────
test('B. web signup returns user shape; duplicate is enumeration-safe with no token/cookie', async () => {
  const email = uniqEmail();
  const first = await request('POST', '/api/auth/signup', {
    body: { name: 'Dup User', email, password: GOOD_PW },
  });
  assert.equal(first.status, 200);
  assert.deepEqual(Object.keys(first.json.user).sort(), ['email', 'id', 'name', 'pro', 'ref_code'].sort());
  assert.equal(first.json.user.pro, false);
  assert.ok(first.json.user.ref_code.startsWith('ref_'));

  const dup = await request('POST', '/api/auth/signup', {
    body: { name: 'Dup User', email, password: GOOD_PW },
  });
  assert.equal(dup.status, 200);
  assert.equal(dup.json.success, true);
  assert.ok(dup.json.message);
  assert.equal(dup.json.user, undefined);
  assert.equal(dup.json.token, undefined);
  assert.equal(dup.headers['set-cookie'], undefined);

  // validation errors preserved
  const weak = await request('POST', '/api/auth/signup', {
    body: { name: 'x', email: uniqEmail(), password: 'short' },
  });
  assert.equal(weak.status, 400);
  assert.equal(weak.json.error, 'password_weak');

  const bad = await request('POST', '/api/auth/signup', {
    body: { name: 'x', email: 'not-an-email', password: GOOD_PW },
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'invalid_email');
});

// ───────────────────────────────────────────────────────────────────────────
// C. web signin/signup/me JSON never contains a token
// ───────────────────────────────────────────────────────────────────────────
test('C. web auth JSON bodies never contain a JWT', async () => {
  const email = uniqEmail();
  const su = await request('POST', '/api/auth/signup', { body: { name: 'NoTok', email, password: GOOD_PW } });
  const si = await request('POST', '/api/auth/signin', { body: { email, password: GOOD_PW } });

  const cookie = String(si.headers['set-cookie']).split(';')[0];
  const me = await request('GET', '/api/auth/me', { headers: { Cookie: cookie } });

  for (const r of [su, si, me]) {
    assert.equal(r.json.token, undefined);
    assert.doesNotMatch(r.raw, /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\./);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// D. native signup returns token, no Set-Cookie
// ───────────────────────────────────────────────────────────────────────────
test('D. native signup returns a Bearer token and never a Set-Cookie', async () => {
  const email = uniqEmail();
  const r = await request('POST', '/api/auth/mobile/signup', {
    body: { name: 'Native', email, password: GOOD_PW },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
  assert.ok(r.json.token);
  assert.equal(r.headers['set-cookie'], undefined);
  assert.deepEqual(Object.keys(r.json.user).sort(), ['email', 'id', 'name', 'pro', 'ref_code'].sort());
  assert.equal(r.json.user.pro, false);

  // duplicate through the native route is also enumeration-safe, no token
  const dup = await request('POST', '/api/auth/mobile/signup', {
    body: { name: 'Native', email, password: GOOD_PW },
  });
  assert.equal(dup.status, 200);
  assert.equal(dup.json.token, undefined);
  assert.equal(dup.headers['set-cookie'], undefined);
});

// ───────────────────────────────────────────────────────────────────────────
// E. native signin returns token, no Set-Cookie
// ───────────────────────────────────────────────────────────────────────────
test('E. native signin returns a Bearer token and never a Set-Cookie', async () => {
  const { email } = await mobileSignup();
  const r = await request('POST', '/api/auth/mobile/signin', { body: { email, password: GOOD_PW } });
  assert.equal(r.status, 200);
  assert.ok(r.json.token);
  assert.equal(r.headers['set-cookie'], undefined);
  assert.deepEqual(Object.keys(r.json.user).sort(), ['email', 'id', 'name', 'pro'].sort());
});

// ───────────────────────────────────────────────────────────────────────────
// F. valid Bearer authenticates /api/auth/me
// ───────────────────────────────────────────────────────────────────────────
test('F. valid Bearer authenticates GET /api/auth/me', async () => {
  const { token, email, user } = await mobileSignup();
  const me = await request('GET', '/api/auth/me', { headers: bearer(token) });
  assert.equal(me.status, 200);
  assert.equal(me.json.email, email);
  assert.equal(me.json.id, user.id);
  assert.equal(me.json.pro, false);
});

// ───────────────────────────────────────────────────────────────────────────
// G. Bearer authenticates an existing requireSession route
// ───────────────────────────────────────────────────────────────────────────
test('G. Bearer authenticates an existing requireSession route (GET /api/profile)', async () => {
  const { token } = await mobileSignup();
  const noauth = await request('GET', '/api/profile');
  assert.equal(noauth.status, 401);

  const authed = await request('GET', '/api/profile', { headers: bearer(token) });
  assert.notEqual(authed.status, 401);
  assert.equal(authed.status, 404);          // authenticated, just no profile yet
  assert.equal(authed.json.error, 'no_profile');
});

// ───────────────────────────────────────────────────────────────────────────
// H. Bearer populates optionalSession correctly (both branches)
// ───────────────────────────────────────────────────────────────────────────
test('H. optionalSession attaches the Bearer identity; a revoked Bearer falls back to anonymous', async () => {
  const { token, user } = await mobileSignup();

  const evOk = `m3c_track_ok_${randomUUID().slice(0, 8)}`;
  const rOk = await request('POST', '/api/track', { headers: bearer(token), body: { event: evOk, data: {} } });
  assert.equal(rOk.status, 200);
  const rowOk = await db.get(
    `SELECT json_extract(data, '$.userId') AS uid FROM analytics WHERE event = ? LIMIT 1`, [evOk],
  );
  assert.equal(rowOk.uid, user.id, 'optionalSession did not attach the Bearer userId');

  // revoke, then the same token must be treated as anonymous (not 401) by optionalSession
  await db.bumpTokenVersion(user.id);
  const evRevoked = `m3c_track_rev_${randomUUID().slice(0, 8)}`;
  const rRev = await request('POST', '/api/track', { headers: bearer(token), body: { event: evRevoked, data: {} } });
  assert.equal(rRev.status, 200);
  const rowRev = await db.get(
    `SELECT json_extract(data, '$.userId') AS uid FROM analytics WHERE event = ? LIMIT 1`, [evRevoked],
  );
  assert.equal(rowRev.uid, null, 'revoked Bearer must not authenticate through optionalSession');
});

// ───────────────────────────────────────────────────────────────────────────
// I. malformed Authorization rejected
// ───────────────────────────────────────────────────────────────────────────
test('I. malformed Authorization headers are rejected', async () => {
  const { token } = await mobileSignup();
  const malformed = [
    `Bearer`,
    `Bearer  ${token}`,          // double space
    `Bearer ${token} extra`,     // extra component
    `Bearer ${token},${token}`,  // comma / multiple credentials
    `Token ${token}`,            // wrong scheme
    `${token}`,                  // no scheme
    `Bearer\t${token}`,          // tab, not single space
  ];
  for (const value of malformed) {
    const r = await request('GET', '/api/auth/me', { headers: { Authorization: value } });
    assert.equal(r.status, 401, `expected 401 for Authorization: ${JSON.stringify(value)}`);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// J. empty Bearer rejected
// ───────────────────────────────────────────────────────────────────────────
test('J. empty Bearer credential is rejected', async () => {
  const r1 = await request('GET', '/api/auth/me', { headers: { Authorization: 'Bearer ' } });
  assert.equal(r1.status, 401);
  const r2 = await request('GET', '/api/auth/me', { headers: { Authorization: 'bearer' } });
  assert.equal(r2.status, 401);
});

// ───────────────────────────────────────────────────────────────────────────
// K. invalid / wrong-secret JWT rejected
// ───────────────────────────────────────────────────────────────────────────
test('K. garbage and wrong-secret tokens are rejected', async () => {
  const garbage = await request('GET', '/api/auth/me', { headers: bearer('not.a.jwt') });
  assert.equal(garbage.status, 401);

  const wrongSecret = jwt.sign(
    { userId: randomUUID(), email: uniqEmail(), pro: false, tv: 0, loginAt: Date.now() },
    'the-wrong-secret', { expiresIn: '7d' },
  );
  const r = await request('GET', '/api/auth/me', { headers: bearer(wrongSecret) });
  assert.equal(r.status, 401);
});

// ───────────────────────────────────────────────────────────────────────────
// L. expired JWT rejected
// ───────────────────────────────────────────────────────────────────────────
test('L. an expired native-shape JWT is rejected', async () => {
  const { user } = await mobileSignup();
  const expired = jwt.sign(
    { userId: user.id, email: user.email, pro: false, tv: 0, loginAt: Date.now() },
    SECRET, { expiresIn: '-10s' },
  );
  const r = await request('GET', '/api/auth/me', { headers: bearer(expired) });
  assert.equal(r.status, 401);
});

// ───────────────────────────────────────────────────────────────────────────
// M. token_version bump revokes a native JWT
// ───────────────────────────────────────────────────────────────────────────
test('M. token_version bump revokes an issued native JWT', async () => {
  const { token, user } = await mobileSignup();
  const before = await request('GET', '/api/auth/me', { headers: bearer(token) });
  assert.equal(before.status, 200);

  await db.bumpTokenVersion(user.id);

  const after = await request('GET', '/api/auth/me', { headers: bearer(token) });
  assert.equal(after.status, 401);
  assert.equal(after.json.error, 'session_revoked');
});

// ───────────────────────────────────────────────────────────────────────────
// N. password-reset revocation revokes a native JWT
// ───────────────────────────────────────────────────────────────────────────
test('N. completing a password reset revokes previously issued native JWTs', async () => {
  const { token, user } = await mobileSignup();

  const rawReset = randomUUID();
  const resetHash = crypto.createHash('sha256').update(rawReset).digest('hex');
  await db.createResetToken(resetHash, user.id, new Date(Date.now() + 3600e3).toISOString());

  const rc = await request('POST', '/api/auth/reset-confirm', {
    body: { token: rawReset, newPassword: 'Brandnew123!pass' },
  });
  assert.equal(rc.status, 200, rc.raw);

  const after = await request('GET', '/api/auth/me', { headers: bearer(token) });
  assert.equal(after.status, 401);
  assert.equal(after.json.error, 'session_revoked');
});

// ───────────────────────────────────────────────────────────────────────────
// O. signout-all revokes a native JWT
// ───────────────────────────────────────────────────────────────────────────
test('O. POST /api/auth/signout-all (via Bearer) revokes that same native JWT', async () => {
  const { token } = await mobileSignup();
  const so = await request('POST', '/api/auth/signout-all', { headers: bearer(token) });
  assert.equal(so.status, 200);

  const after = await request('GET', '/api/auth/me', { headers: bearer(token) });
  assert.equal(after.status, 401);
});

// ───────────────────────────────────────────────────────────────────────────
// P. native exp - iat == 604800 seconds (fixed 7 days)
// ───────────────────────────────────────────────────────────────────────────
test('P. native token encodes exactly a 7-day lifetime', async () => {
  const { token } = await mobileSignup();
  const decoded = jwt.decode(token);
  assert.equal(decoded.exp - decoded.iat, 7 * 24 * 60 * 60);
  assert.ok(decoded.userId && decoded.email);
  assert.equal(decoded.tv, 0);
  assert.ok(typeof decoded.loginAt === 'number');
  assert.equal(decoded.aud, undefined);   // frozen decision 1: no aud:'native'
});

// ───────────────────────────────────────────────────────────────────────────
// Q. an old loginAt beyond MAX_SESSION_MS is rejected even with a fresh exp
// ───────────────────────────────────────────────────────────────────────────
test('Q. the original loginAt still enforces the 7-day absolute session cap', async () => {
  const { user } = await mobileSignup();
  const staleLoginAt = Date.now() - (8 * 24 * 60 * 60 * 1000);
  const token = jwt.sign(
    { userId: user.id, email: user.email, pro: false, tv: 0, loginAt: staleLoginAt },
    SECRET, { expiresIn: '7d' },
  );
  const r = await request('GET', '/api/auth/me', { headers: bearer(token) });
  assert.equal(r.status, 401);
  assert.equal(r.json.error, 'session_expired');
});

// ───────────────────────────────────────────────────────────────────────────
// R. Bearer /api/auth/me does not rotate or Set-Cookie
// ───────────────────────────────────────────────────────────────────────────
test('R. GET /api/auth/me with a Bearer returns no token and no Set-Cookie', async () => {
  const { token } = await mobileSignup();
  for (let i = 0; i < 2; i++) {
    const me = await request('GET', '/api/auth/me', { headers: bearer(token) });
    assert.equal(me.status, 200);
    assert.equal(me.headers['set-cookie'], undefined);
    assert.equal(me.json.token, undefined);
    assert.doesNotMatch(me.raw, /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\./);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// S. cookie /api/auth/me still renews the cookie with the original loginAt
// ───────────────────────────────────────────────────────────────────────────
test('S. cookie GET /api/auth/me still renews the cookie, preserving loginAt', async () => {
  const email = uniqEmail();
  await request('POST', '/api/auth/signup', { body: { name: 'Renew', email, password: GOOD_PW } });
  const si = await request('POST', '/api/auth/signin', { body: { email, password: GOOD_PW } });
  const setCookie = String(si.headers['set-cookie'][0]);
  const cookieVal = setCookie.split(';')[0];
  const originalLoginAt = jwt.decode(cookieVal.split('=')[1]).loginAt;

  await new Promise((r) => setTimeout(r, 1100));
  const me = await request('GET', '/api/auth/me', { headers: { Cookie: cookieVal } });
  assert.equal(me.status, 200);
  const renewed = String(me.headers['set-cookie'][0]);
  assert.ok(renewed.includes('mealzy_session='));
  const renewedToken = renewed.split(';')[0].split('=')[1];
  assert.equal(jwt.decode(renewedToken).loginAt, originalLoginAt);
});

// ───────────────────────────────────────────────────────────────────────────
// T. cookie / Bearer precedence
// ───────────────────────────────────────────────────────────────────────────
test('T. precedence: cookie wins; bad cookie does not fall through to Bearer', async () => {
  const userX = await mobileSignup();
  const userY = await mobileSignup();

  const cookieX = `mealzy_session=${jwt.sign(
    { userId: userX.user.id, email: userX.email, pro: false, tv: 0, loginAt: Date.now() },
    SECRET, { expiresIn: '24h' },
  )}`;

  // valid cookie X + valid Bearer Y -> resolves as X
  const both = await request('GET', '/api/auth/me', {
    headers: { Cookie: cookieX, ...bearer(userY.token) },
  });
  assert.equal(both.status, 200);
  assert.equal(both.json.email, userX.email);

  // invalid cookie + valid Bearer -> 401 (no fallthrough)
  const badCookie = await request('GET', '/api/auth/me', {
    headers: { Cookie: 'mealzy_session=not-a-jwt', ...bearer(userY.token) },
  });
  assert.equal(badCookie.status, 401);

  // no cookie + valid Bearer -> Bearer user
  const bearerOnly = await request('GET', '/api/auth/me', { headers: bearer(userY.token) });
  assert.equal(bearerOnly.status, 200);
  assert.equal(bearerOnly.json.email, userY.email);
});

// ───────────────────────────────────────────────────────────────────────────
// U. mobile signin uses the existing shared lockout state
// ───────────────────────────────────────────────────────────────────────────
test('U. mobile signin shares failed-login lockout state with web signin', async () => {
  const { email } = await mobileSignup();
  const ip = '10.55.55.55';   // stable IP so account lockout accumulates

  // 9 bad attempts split across the two transports
  for (let i = 0; i < 5; i++) {
    const r = await request('POST', '/api/auth/mobile/signin', { ip, body: { email, password: 'wrongwrongwrong1' } });
    assert.ok(r.status === 401 || r.status === 429);
  }
  for (let i = 0; i < 4; i++) {
    await request('POST', '/api/auth/signin', { ip, body: { email, password: 'wrongwrongwrong1' } });
  }
  // 10th failure trips the lock; the next attempt is 429 with Retry-After
  await request('POST', '/api/auth/mobile/signin', { ip, body: { email, password: 'wrongwrongwrong1' } });
  const locked = await request('POST', '/api/auth/mobile/signin', { ip, body: { email, password: GOOD_PW } });
  assert.equal(locked.status, 429);
  assert.ok(locked.headers['retry-after']);
});

// ───────────────────────────────────────────────────────────────────────────
// V. mobile signup preserves verification-email behaviour
// ───────────────────────────────────────────────────────────────────────────
test('V. native signup creates an unverified user and a verification token', async () => {
  const email = uniqEmail();
  const r = await request('POST', '/api/auth/mobile/signup', {
    body: { name: 'Verify Me', email, password: GOOD_PW },
  });
  assert.equal(r.status, 200);

  const user = await db.getUserByEmail(email);
  assert.ok(user);
  assert.notEqual(user.email_verified, 1);

  const vrow = await db.get(
    `SELECT COUNT(*) AS n FROM verification_tokens WHERE user_id = ?`, [user.id],
  );
  assert.ok(vrow.n >= 1, 'expected a verification token to be created');
});

// ───────────────────────────────────────────────────────────────────────────
// W. no certification code / path is involved in the auth seam
// ───────────────────────────────────────────────────────────────────────────
test('W. the auth implementation does not reference certification', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  // isolate the auth region we added / touched
  const start = src.indexOf('async function performSignup');
  const end = src.indexOf('// GET /api/auth/me');
  assert.ok(start !== -1 && end !== -1 && end > start);
  const authRegion = src.slice(start, end);
  assert.doesNotMatch(authRegion, /certification/i);
  assert.doesNotMatch(authRegion, /certificationGate|certificationAssessment/);
});
