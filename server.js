/**
 * Mealzy server.js
 *
 * Sessions  : stateless JWT in httpOnly cookie — survive server restarts
 * Persistence: SQLite via sql.js (see db.js) — survives browser clears
 * Payments   : Stripe webhook activates Pro server-side, regardless of redirect
 */

'use strict';

require('dotenv').config();

// ── JWT secret guard — refuse to start without it ───────────────────────────
if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET is not set. Set it in .env or Render env vars before starting.');
  process.exit(1);
}

const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const { randomUUID, timingSafeEqual } = require('crypto');
const jwt          = require('jsonwebtoken');
const bcrypt       = require('bcryptjs');
const rateLimit    = require('express-rate-limit');
const Anthropic    = require('@anthropic-ai/sdk');
const winston      = require('winston');
const db           = require('./db');
const { resolveTrackedEventData } = require('./analyticsIdentity');
const pricing      = require('./pricing');
const budgetEngine = require('./budgetEngine');
const macroEngine = require('./macroEngine');
const planRepairEngine = require('./planRepairEngine');
const groceryAgg   = require('./groceryAggregation');
const generationVocabulary = require('./generationVocabulary');
const certificationGate = require('./certificationGate');
const { getISOWeekKey } = require('./weekKey');

// Phase 3E — deterministic certification gate for WEEK-MODE generation.
//   'off' (default / any unknown value): no certification behaviour at all —
//         current prompt, current acceptance.
//   'shadow': constrained week prompt + deterministic assessment + telemetry;
//         zero repair calls; never blocks a response.
//   'on': constrained week prompt + deterministic assessment + at most one
//         repair + hard 422 failure when still uncertified.
// `on` is STRUCTURALLY UNREACHABLE while certificationGate.HARD_GATE_PRODUCTION_
// AUTHORIZED is false (deterministic dietary/allergen enforcement is missing):
// resolveEffectiveMode downgrades a requested 'on' to EFFECTIVE 'shadow'.
const CERTIFICATION_GATE_REQUESTED = certificationGate.resolveGateMode(process.env.CERTIFICATION_GATE);
const _gateModeResolution = certificationGate.resolveEffectiveMode(CERTIFICATION_GATE_REQUESTED);
const CERTIFICATION_GATE_MODE = _gateModeResolution.effective;
const CERTIFICATION_GATE_ACTIVE = CERTIFICATION_GATE_MODE !== certificationGate.GATE_MODE.OFF;

// ── Structured logging — replaces console.log/error throughout ──────────────
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()                          // JSON in prod (parseable by log viewers)
      : winston.format.prettyPrint()                   // Human-readable locally
  ),
  transports: [
    new winston.transports.Console(),
    // In production on Render, logs go to stdout — no file needed.
    // Locally, also write errors to a file for easier debugging:
    ...(process.env.NODE_ENV !== 'production'
      ? [new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
         new winston.transports.File({ filename: 'logs/combined.log' })]
      : [])
  ]
});

// Make logger globally available — Morgan should replace console.log with logger calls over time
global.log = logger;

// Phase 3E — one-time boot notice: `on` enforces the deterministic
// ingredient/nutrition/purchase/package-budget gate only. It is NOT the
// complete Mealzy hard certification gate until deterministic dietary/allergen
// enforcement exists (certificationGate.HARD_GATE_PRODUCTION_AUTHORIZED).
if (_gateModeResolution.downgraded) {
  logger.warn('[certification-gate] ============================================================');
  logger.warn(`[certification-gate] CERTIFICATION_GATE=on was REQUESTED but is NOT AVAILABLE.`);
  logger.warn('[certification-gate] Hard enforcement requires the deterministic dietary/allergen');
  logger.warn('[certification-gate] substrate, which does not exist yet (HARD_GATE_PRODUCTION_');
  logger.warn('[certification-gate] AUTHORIZED = false). Effective mode is DOWNGRADED to "shadow":');
  logger.warn('[certification-gate] assessment + telemetry only, ZERO repair calls, never blocks.');
  logger.warn('[certification-gate] ============================================================');
} else if (CERTIFICATION_GATE_MODE === certificationGate.GATE_MODE.ON) {
  logger.warn('[certification-gate] CERTIFICATION_GATE=on enforces the deterministic ingredient/nutrition/purchase/package-budget gate ONLY — NOT the complete Mealzy hard certification gate (deterministic dietary/allergen enforcement is not implemented yet).');
} else if (CERTIFICATION_GATE_MODE === certificationGate.GATE_MODE.SHADOW) {
  logger.info('[certification-gate] CERTIFICATION_GATE=shadow — assessing week generation and emitting telemetry; never blocking, never repairing.');
}

const app  = express();
const PORT = process.env.PORT || 3000;

// Export the configured Express app so integration tests can drive the real
// registered routes (see tests/generateMealCertificationRoute3EC3A1.test.js).
// The production process still starts normally via the `require.main === module`
// guard at the bottom of this file — importing server.js binds no port and
// runs no DB init.
module.exports = app;

// Trust Render's proxy so express-rate-limit can read the real client IP
app.set('trust proxy', 1);
app.disable('x-powered-by');

const JWT_SECRET    = process.env.JWT_SECRET;
const JWT_EXPIRES   = '24h';
const NATIVE_JWT_EXPIRES = '7d'; // native (Bearer) sessions — fixed, no refresh, no renewal
const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// Note: analytics.json and leads.json were legacy flat-file stores — all analytics now live in SQLite via await db.logEvent()

// ── Explicit output shapes — define exactly what each endpoint returns to clients ──
const OutputShapes = {
  User: (user, includeRefCode = false) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    pro: user.pro === 1,
    ...(includeRefCode ? { ref_code: user.ref_code || null } : {})
  }),
  UserWithProfile: (user, profile) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    pro: user.pro === 1,
    email_verified: user.email_verified === 1,
    ref_code: user.ref_code || null,
    profile
  }),
  AdminUserExport: (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    pro: user.pro === 1,
    created_at: user.created_at
  }),
  ReferralStatus: (bonusPlans, effectiveLimit, used) => ({
    bonus_plans: bonusPlans,
    effective_limit: effectiveLimit,
    used
  })
};

// ── Security headers on every response ────────────────────────────────────────
// Shared by the global fallback middleware below and the express.static
// setHeaders() callbacks, so static assets (.html/.js/.css/.json) carry the
// same headers as every other route even if middleware ordering ever changes.
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://js.stripe.com https://accounts.google.com https://cdn.jsdelivr.net https://www.googletagmanager.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.stripe.com https://accounts.google.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com; " +
    "frame-src https://js.stripe.com; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "frame-ancestors 'none';"
  );
}

app.use((req, res, next) => {
  setSecurityHeaders(res);
  next();
});

// ── Markdown content negotiation (acceptmarkdown.com) ─────────────────────────
// A handful of key pages can be served as Markdown to agents that ask for it.
// Files live in public/llm/<name>.md. Every negotiated path carries
// `Vary: Accept` so a CDN never cross-serves the HTML and Markdown variants.
const MARKDOWN_PAGES = {
  '/': 'index.md',
  '/about': 'about.md',
  '/contact': 'contact.md',
  '/privacy': 'privacy.md'
};

/** True when the client's Accept header prefers Markdown over HTML. */
function prefersMarkdown(acceptHeader) {
  if (!acceptHeader) return false;
  let md = -1, html = -1;
  for (const raw of String(acceptHeader).split(',')) {
    const [type, ...params] = raw.trim().toLowerCase().split(';');
    let q = 1;
    for (const p of params) {
      const m = p.trim().match(/^q=([0-9.]+)$/);
      if (m) q = parseFloat(m[1]);
    }
    if (type === 'text/markdown' || type === 'text/x-markdown') md = Math.max(md, q);
    else if (type === 'text/html' || type === 'application/xhtml+xml') html = Math.max(html, q);
  }
  return md >= 0 && md >= html;
}

const NOT_FOUND_MD = [
  '# 404 — Page Not Found',
  '',
  'This path does not exist on mealzy.org.',
  '',
  '- Site map: https://mealzy.org/sitemap.xml',
  '- Agent guide: https://mealzy.org/llms.txt',
  '- Homepage: https://mealzy.org/',
  ''
].join('\n');

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const key = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
  const mdFile = MARKDOWN_PAGES[key];
  if (!mdFile) return next();
  res.vary('Accept');
  if (!prefersMarkdown(req.headers.accept)) return next();
  const mdPath = path.join(__dirname, 'public', 'llm', mdFile);
  if (!fs.existsSync(mdPath)) return next();
  res.type('text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.send(fs.readFileSync(mdPath, 'utf8'));
});

// ── Admin middleware ───────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
  if (!token || ADMIN_TOKEN.length < 32 || !timingSafeCompare(token, ADMIN_TOKEN)) {
    logger.warn('[admin] Unauthorized attempt', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Stripe webhook needs raw body — must be BEFORE express.json() ──────────────
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

// ── Explicit CORS configuration with allowlist ─────────────────────────────────
const cors = require('cors');
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? ['https://mealzy.org', 'https://www.mealzy.org']
  : ['https://mealzy.org', 'http://localhost:3000'];
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token', 'x-pro-token', 'x-cron-secret']
}));

app.use((req, res, next) => {
  if (req.path === '/api/recipes/import-photo') return next();
  express.json({ limit: '64kb' })(req, res, next);
});

// ── Page view tracking (fires before static files are served) ──────────────────
app.use((req, res, next) => {
  if (req.method === 'GET' && (req.path.endsWith('.html') || req.path === '/')) {
    const page = req.path === '/' ? '/index.html' : req.path;
    const ip   = clientIp(req);
    db.logEvent('page_view', { page }, ip.slice(-8)).catch(() => {});
  }
  next();
});

// privacy.html is a stale duplicate of privacy-policy.html; redirect old/bookmarked/indexed links
app.get('/privacy.html', (req, res) => {
  res.redirect(301, '/privacy-policy.html');
});

// ── React marketing pages (see vite.config.mjs for the full page list) ────────
// vite build outputs dist/ (index.html, pricing.html, login.html, etc. +
// hashed assets). When present, dist/ wins for every page it builds; app
// pages with no React version (dashboard, meal-planner, settings, ...)
// always come from public/. Without a build (local dev before `npm run
// build`) everything falls back to public/.
const distDir = path.join(__dirname, 'dist');
const hasDistBuild = fs.existsSync(path.join(distDir, 'index.html'));

if (hasDistBuild) {
  app.use(express.static(distDir, {
    setHeaders: (res, filePath) => {
      setSecurityHeaders(res);
      // Vite assets are content-hashed — safe to cache forever
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
} else {
  logger.error('[startup] dist/ build missing — serving legacy public/ pages. Run npm run build.');
}

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: setSecurityHeaders
}));

// TikTok domain verification
app.get('/tiktok5D5PTssMk9TzIVSQAXCcHPlwQwQ52nQc.txt', async (req, res) => {
  res.type('text/plain').send('tiktok-developers-site-verification=5D5PTssMk9TzIVSQAXCcHPIwQwQ52nQc');
});

// ── Rate limiters ──────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 10,
  standardHeaders: true,  // Sets RateLimit-* headers
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
  handler: (req, res) => {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }
});

const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're generating plans fast — wait 60 seconds and try again." }
});

// Demo meal limiter — 3 per IP per 24 hours (no account required)
const demoLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'demo_limit', message: "You've used today's 3 free demos. Create a free account — it only takes 30 seconds." }
});

// AI coach / grocery list limiter — both call Anthropic and require a session,
// so this only bounds how fast a logged-in user can spend API budget.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're sending requests too fast — wait 60 seconds and try again." }
});

const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

const leadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

// Stripe-touching routes — bound how fast a session can hit the Stripe API
const stripeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

// Admin routes — defense in depth on top of the token check itself
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

// Cron routes — guarded by CRON_SECRET, but bound retry/brute-force speed too
const cronLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

// Catch-all safety net for every other /api/* route not covered by a
// purpose-specific limiter above. /api/health is exempt — keep-alive.yml
// pings it every 9 minutes and it does no paid or expensive work.
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
  skip: (req) => req.originalUrl.split('?')[0] === '/api/health'
});
app.use('/api/', generalApiLimiter);

// ── Cookie helpers ─────────────────────────────────────────────────────────────
function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(part => {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k.trim()] = decodeURIComponent(v.join('=').trim());
  });
  return cookies;
}

function setJwtCookie(res, payload) {
  const token  = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  const maxAge = 24 * 60 * 60; // 24 hours in seconds
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `mealzy_session=${token}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Path=/${secure}`
  );
  return token;
}

function clearJwtCookie(res) {
  res.setHeader('Set-Cookie', 'mealzy_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/');
}

/**
 * Native (Bearer) session token. Used ONLY by /api/auth/mobile/* routes.
 * Same JWT_SECRET and payload shape as the web cookie, but a fixed 7-day
 * expiry and no cookie, no renewal, no refresh. loginAt is stamped once by
 * buildSessionPayload at signup/signin.
 */
function issueNativeSessionToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: NATIVE_JWT_EXPIRES });
}

/**
 * Extract a native Bearer credential from the Authorization header.
 * Strict: exactly "<scheme> <credential>", scheme case-insensitively "bearer",
 * a single non-empty credential with no comma and no extra components.
 * Returns the raw token string, or null. jwt.verify remains authoritative.
 */
function extractBearerToken(req) {
  const raw = req.headers && req.headers['authorization'];
  if (typeof raw !== 'string') return null; // absent, or multiple headers (array)
  const parts = raw.trim().split(' ');
  if (parts.length !== 2) return null;                 // reject extra components / extra whitespace
  if (parts[0].toLowerCase() !== 'bearer') return null;
  const token = parts[1];
  if (!token || token.indexOf(',') !== -1) return null; // reject empty / multiple credentials
  return token;
}

function buildSessionPayload(user, existingLoginAt) {
  return {
    userId: user.id,
    email: user.email,
    pro: user.pro === 1 || user.pro === true,
    tv: user.token_version || 0,
    loginAt: existingLoginAt || Date.now(),
  };
}

/**
 * Verify the JWT cookie. Returns the decoded payload or null.
 * On sensitive endpoints (pro activation, plan save) callers re-query
 * the DB for the live pro flag rather than trusting the JWT payload.
 */
function getSessionFromReq(req) {
  try {
    const cookieToken = parseCookies(req).mealzy_session;
    if (cookieToken) {
      // Cookie present -> cookie wins. A bad cookie does NOT fall through to Bearer.
      if (req) req._authTransport = 'cookie';
      return jwt.verify(cookieToken, JWT_SECRET); // throws if expired/tampered
    }
    const bearer = extractBearerToken(req);
    if (!bearer) return null;
    if (req) req._authTransport = 'bearer';
    return jwt.verify(bearer, JWT_SECRET); // throws if expired/tampered
  } catch(e) {
    return null;
  }
}

async function requireSession(req, res, next) {
  const decoded = getSessionFromReq(req);
  if (!decoded) return res.status(401).json({ error: 'not_authenticated' });
  if (decoded.loginAt && (Date.now() - decoded.loginAt) > MAX_SESSION_MS) {
    clearJwtCookie(res);
    return res.status(401).json({ error: 'session_expired' });
  }
  let user;
  try {
    user = await db.getUserById(decoded.userId);
  } catch (err) {
    logger.error('[session] user lookup error', { message: err.message });
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
  if (!user || (user.token_version || 0) !== (decoded.tv || 0)) {
    clearJwtCookie(res);
    return res.status(401).json({ error: 'session_revoked' });
  }
  req.session = decoded;
  next();
}

async function requireVerifiedEmail(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'not_authenticated' });
  try {
    const user = await db.getUserById(req.session.userId);
    if (!user) return res.status(401).json({ error: 'user_not_found' });
    if (!user.email_verified) {
      return res.status(403).json({
        error: 'email_not_verified',
        message: 'Please verify your email to use this feature. Check your inbox, or resend the link from your account settings.'
      });
    }
    next();
  } catch(err) {
    logger.error('[verify-gate] lookup error', { message: err.message });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

async function optionalSession(req, res, next) {
  req.session = null;
  const decoded = getSessionFromReq(req);
  if (decoded && !(decoded.loginAt && (Date.now() - decoded.loginAt) > MAX_SESSION_MS)) {
    try {
      const user = await db.getUserById(decoded.userId);
      if (user && (user.token_version || 0) === (decoded.tv || 0)) {
        req.session = decoded;
      }
    } catch (err) {
      logger.error('[session] optional lookup error', { message: err.message });
      // fall through as anonymous — do not fail the request
    }
  }
  next();
}

// ── Input sanitisation helpers ────────────────────────────────────────────────
function sanitise(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function capList(arr, maxItems, maxLen) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, maxItems)
    .filter(x => typeof x === 'string')
    .map(x => sanitise(x, maxLen));
}

// ── Email format validation (RFC-5322-ish, deliberately conservative) ────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

// ── HTML escape for email and HTML context ────────────────────────────────────
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return str.replace(/[&<>"']/g, (char) => map[char]);
}

// ── Constant-time string comparison (prevents timing attacks) ────────────────
function timingSafeCompare(a, b) {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch (e) {
    // Lengths don't match — use fake comparison to prevent timing leak
    return false;
  }
}

// ── Common weak passwords to reject ───────────────────────────────────────────
const COMMON_PASSWORDS = new Set([
  'password', 'password123', '123456789', 'qwerty', 'abc123', 'letmein', 'welcome',
  'monkey', 'dragon', 'master', 'admin', 'sunshine', 'princess', 'football', 'shadow',
  'michael', 'batman', 'trustno1', 'starwars', 'superman', 'password1', 'admin123'
]);

// ── Password strength validation ──────────────────────────────────────────────
function validatePasswordStrength(password) {
  if (password.length < 12) {
    return { valid: false, message: 'Password must be at least 12 characters.' };
  }
  const lowerPassword = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowerPassword)) {
    return { valid: false, message: 'This password is too common. Please choose a more unique password.' };
  }
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  const hasComplexity = [hasUppercase, hasLowercase, hasNumbers, hasSpecial].filter(Boolean).length >= 3;
  if (!hasComplexity) {
    return { valid: false, message: 'Password must contain uppercase, lowercase, numbers, and special characters.' };
  }
  return { valid: true };
}

// ── In-memory usage tracker (free-plan generation cap) ───────────────────────
const usageTracker = new Map();
const FREE_PLAN_LIMIT = 3; // anonymous (no-session) requests only — logged-in free users use the 30-day daily trial below
const referralBonus   = new Map(); // kept for in-session backward compat; SQLite is source of truth

// ── Free-tier: daily plan for the first 30 days, then 1 plan every 7 days forever (logged-in users) ──
const TRIAL_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const WEEKLY_PLAN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Validates a client-supplied IANA timezone name; falls back to UTC for
 * anything missing, oversized, or not recognised by Intl. */
function resolveClientTimezone(rawTimezone) {
  if (typeof rawTimezone !== 'string' || rawTimezone.length === 0 || rawTimezone.length > 60) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: rawTimezone });
    return rawTimezone;
  } catch (e) {
    return 'UTC';
  }
}

/** Today's calendar date (YYYY-MM-DD) in the given IANA timezone. */
function getLocalDateString(timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

// ── Failed login tracking — per-account rate limiting and lockout ─────────────
const failedLoginAttempts = new Map(); // "email|ip" -> { count, lastAttempt, lockedUntil }
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const ipFailedAttempts = new Map(); // ip -> { count, lastAttempt, lockedUntil }
const MAX_IP_FAILED_ATTEMPTS = 50;
const IP_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function failKey(email, ip) {
  return `${email}|${ip}`;
}

function isAccountLocked(email, ip) {
  const record = failedLoginAttempts.get(failKey(email, ip));
  if (!record || !record.lockedUntil) return false;
  if (Date.now() < record.lockedUntil) return true;
  failedLoginAttempts.delete(failKey(email, ip));
  return false;
}

function isIpLocked(ip) {
  const record = ipFailedAttempts.get(ip);
  if (!record || !record.lockedUntil) return false;
  if (Date.now() < record.lockedUntil) return true;
  ipFailedAttempts.delete(ip);
  return false;
}

function recordFailedLogin(email, ip) {
  const now = Date.now();
  const key = failKey(email, ip);
  const record = failedLoginAttempts.get(key) || { count: 0, lastAttempt: now, lockedUntil: null };
  record.count += 1;
  record.lastAttempt = now;
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    logger.warn('[auth] Account lockout triggered', { email, ip, attempts: record.count });
  }
  failedLoginAttempts.set(key, record);

  const ipRecord = ipFailedAttempts.get(ip) || { count: 0, lastAttempt: now, lockedUntil: null };
  ipRecord.count += 1;
  ipRecord.lastAttempt = now;
  if (ipRecord.count >= MAX_IP_FAILED_ATTEMPTS) {
    ipRecord.lockedUntil = now + IP_LOCKOUT_DURATION_MS;
    logger.warn('[auth] IP-wide lockout triggered', { ip, attempts: ipRecord.count });
  }
  ipFailedAttempts.set(ip, ipRecord);

  return {
    accountLocked: !!record.lockedUntil,
    ipLocked: !!ipRecord.lockedUntil,
    lockedUntil: record.lockedUntil || ipRecord.lockedUntil || null,
  };
}

function clearFailedLogins(email, ip) {
  failedLoginAttempts.delete(failKey(email, ip));
  // Deliberately do NOT clear ipFailedAttempts here — a successful login
  // on one account must not reset an attacker's spray-attempt counter
  // against other accounts from the same IP.
}


// Periodic cleanup so these Maps can't grow unbounded (mirrors the
// pattern from the original security audit for exactly this concern).
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
  for (const [k, v] of failedLoginAttempts) {
    if ((v.lastAttempt || 0) < cutoff) failedLoginAttempts.delete(k);
  }
  for (const [k, v] of ipFailedAttempts) {
    if ((v.lastAttempt || 0) < cutoff) ipFailedAttempts.delete(k);
  }
  if (failedLoginAttempts.size > 10000) failedLoginAttempts.clear();
  if (ipFailedAttempts.size > 10000) ipFailedAttempts.clear();
}, 10 * 60 * 1000).unref();



// Constant-time filler for signin timing — computed once at startup so the
// no-such-user / wrong-password / legacy-account paths all pay the same
// bcrypt.compare() cost and don't leak account existence via response time.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-safety', 12);

function clientIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function getUsage(ip) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const record = usageTracker.get(ip);
  if (!record || record.month !== monthKey) return { count: 0, month: monthKey };
  return record;
}
function incrementUsage(ip) {
  const usage = getUsage(ip);
  usage.count += 1;
  usageTracker.set(ip, usage);
  return usage;
}
async function getEffectiveLimit(email) {
  const memBonus = email ? (referralBonus.get(email) || 0) : 0;
  if (email && memBonus === 0) {
    // Check SQLite for persisted bonus_plans (survives server restarts)
    try {
      const user = await db.getUserByEmail(email);
      const dbBonus = user?.bonus_plans || 0;
      if (dbBonus > 0) return FREE_PLAN_LIMIT + dbBonus;
    } catch(e) { /* non-fatal */ }
  }
  return FREE_PLAN_LIMIT + memBonus;
}

// Fix: Windows system env vars can override .env with empty string — read .env directly as fallback
const _anthropicKey = (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim())
  || (() => { try { return require('fs').readFileSync('.env','utf8').split('\n').find(l=>l.startsWith('ANTHROPIC_API_KEY='))?.split('=').slice(1).join('=').trim(); } catch(e){} })()
  || '';
if (!_anthropicKey) logger.warn('[WARN] ANTHROPIC_API_KEY is not set — AI features will fail');
else logger.info('[OK] ANTHROPIC_API_KEY loaded (len=' + _anthropicKey.length + ')');
let anthropic = new Anthropic({ apiKey: _anthropicKey });

// Test-only seam. NOT reachable over HTTP and NOT part of any route. Integration
// tests call this to swap in a deterministic stub so the real /api/generate-meal
// route can be exercised without making (or paying for) an Anthropic request.
// Production always keeps the real client constructed above; nothing else
// reassigns `anthropic`.
app.__setAnthropicClientForTests = (client) => { anthropic = client; };

const DAILY_SPEND_CAP_USD = Number(process.env.DAILY_SPEND_CAP_USD) || 5;
// Per-model pricing, confirmed current as of August 2026.
// Cache-read/cache-creation tokens are billed cheaper by Anthropic, but
// we deliberately count them at the full input rate here — this is a
// safety backstop, not a billing reconciliation, so it's correct to
// slightly OVERestimate real spend rather than risk underestimating it.
const MODEL_PRICING = {
  'claude-haiku-4-5-20251001': { input: 1 / 1_000_000, output: 5 / 1_000_000 },
  'claude-sonnet-5':           { input: 2 / 1_000_000, output: 10 / 1_000_000 },
};
// Fail-safe default for any model not in the table above: the most
// expensive known rate, so an untracked model overcounts against the
// spend cap rather than silently undercounting it.
const FALLBACK_PRICING = Object.values(MODEL_PRICING).reduce((max, p) =>
  (p.input + p.output > max.input + max.output) ? p : max
);
function getModelPricing(model) {
  const pricing = MODEL_PRICING[model];
  if (pricing) return pricing;
  logger.warn('[spend-cap] Unknown model — using most expensive known rate as a fail-safe', { model });
  return FALLBACK_PRICING;
}

// Known limitation: under high concurrency, multiple simultaneous requests
// could all pass the pre-check before any of them records its spend,
// allowing a small overshoot right at the cap boundary. Acceptable for a
// safety backstop at this traffic scale — not worth adding transaction
// locking for.
async function callAnthropicWithSpendCap(params) {
  const currentSpend = await db.getDailySpend();
  if (currentSpend >= DAILY_SPEND_CAP_USD) {
    logger.error('[spend-cap] Daily Anthropic spend cap reached — blocking call', {
      currentSpend, cap: DAILY_SPEND_CAP_USD
    });
    const err = new Error('daily_spend_cap_reached');
    err.spendCapReached = true;
    throw err;
  }
  const completion = await anthropic.messages.create(params);
  const usage = completion.usage || {};
  const inputTokens = (usage.input_tokens || 0)
    + (usage.cache_creation_input_tokens || 0)
    + (usage.cache_read_input_tokens || 0);
  const outputTokens = usage.output_tokens || 0;
  // completion.model is the model the API actually ran, echoed back by
  // Anthropic — more trustworthy than the requested params.model.
  const pricing = getModelPricing(completion.model || params.model);
  const cost = (inputTokens * pricing.input) + (outputTokens * pricing.output);
  db.addDailySpend(cost).catch(err => {
    logger.error('[spend-cap] failed to record spend (non-fatal)', { message: err.message });
  });
  return completion;
}

// ════════════════════════════════════════════════════════════════════════════
// EMAIL UTILITY (Resend API — set RESEND_API_KEY in Render env vars)
// ════════════════════════════════════════════════════════════════════════════

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) {
    // Graceful fallback — log so Emil can copy-paste the link during dev
    logger.debug(`[email] RESEND_API_KEY not set — would send subject: ${subject}`);
    return { ok: false, reason: 'no_api_key' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Mealzy <noreply@mealzy.org>',
        to,
        subject,
        html
      })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[email] Resend error:', data);
      return { ok: false, error: data };
    }
    logger.info(`[email] Sent — id: ${data.id}`);
    return { ok: true, id: data.id };
  } catch(err) {
    console.error('[email] sendEmail error:', err.message);
    return { ok: false, error: err.message };
  }
}

// ── Email HTML templates ───────────────────────────────────────────────────────

function emailBase(content) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="background:#3d8b5e;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
          <span style="color:white;font-size:22px;font-weight:800;letter-spacing:-0.5px;">🥗 Mealzy</span>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
          ${content}
          <hr style="border:none;border-top:1px solid #e8f0eb;margin:28px 0"/>
          <p style="color:#888;font-size:12px;text-align:center;margin:0;">
            Mealzy · <a href="https://mealzy.org" style="color:#3d8b5e;text-decoration:none;">mealzy.org</a> ·
            Questions? <a href="mailto:support@mealzy.org" style="color:#3d8b5e;text-decoration:none;">support@mealzy.org</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function emailPasswordReset(name, resetUrl) {
  const safeName = escapeHtml(name || 'there');
  const safeUrl = escapeHtml(resetUrl);
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">Reset your password</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${safeName}, here's your password reset link. It expires in 1 hour.</p>
    <a href="${safeUrl}" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">Reset My Password →</a>
    <p style="color:#888;font-size:13px;margin:0;">Or paste this link in your browser:<br/><span style="color:#3d8b5e;word-break:break-all;">${safeUrl}</span></p>
    <p style="color:#aaa;font-size:12px;margin-top:16px;">If you didn't request this, ignore this email. Your password won't change.</p>
  `);
}

function emailAccountExists(name) {
  const safeName = escapeHtml(name || 'there');
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">Someone tried to sign up with your email</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${safeName}, someone just tried to create a Mealzy account using this email address. You already have an account — if this was you, just sign in instead.</p>
    <a href="https://mealzy.org/login.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">Sign In →</a>
    <p style="color:#888;font-size:13px;margin:0;">Forgot your password? <a href="https://mealzy.org/login.html" style="color:#3d8b5e;text-decoration:none;">Reset it here</a>.</p>
    <p style="color:#aaa;font-size:12px;margin-top:16px;">If this wasn't you, no action is needed — your account is safe and nothing has changed.</p>
  `);
}


function emailVerifyAddress(name, verifyUrl) {
  const safeName = escapeHtml(name || 'there');
  const safeUrl = escapeHtml(verifyUrl);
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">Verify your email</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${safeName}, welcome to Mealzy! Please verify your email to unlock AI meal plans, grocery lists, and the coach. This link expires in 24 hours.</p>
    <a href="${safeUrl}" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">Verify My Email →</a>
    <p style="color:#888;font-size:13px;margin:0;">Or paste this link in your browser:<br/><span style="color:#3d8b5e;word-break:break-all;">${safeUrl}</span></p>
  `);
}


function emailDay3Nudge(name, plansLeft) {
  const safeName = escapeHtml(name || 'there');
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">You've got ${plansLeft} free plan${plansLeft !== 1 ? 's' : ''} left this month 🥗</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${safeName} — you signed up 3 days ago. Here's what Pro unlocks when you're ready:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      ${['Unlimited AI meal plans — every week, every goal change', 'PDF export — print your plan, take it to the shop', 'Unlimited AI coaching with Mia — ask anything, any time', 'Advanced macros per meal — protein, carbs, fat broken down'].map(f => `
      <tr><td style="padding:6px 0;color:#333;font-size:14px;">✅ ${f}</td></tr>`).join('')}
    </table>
    <a href="https://mealzy.org/upgrade.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:16px;">Upgrade to Pro →</a>
    <p style="color:#888;font-size:13px;margin:0;">$8/month. Cancel any time with one click.</p>
  `);
}

function emailLimitHit(name) {
  const safeName = escapeHtml(name || 'there');
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">You hit your free plan limit 🚀</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${safeName} — you've used all your free plans this month. That means you're actually using Mealzy — which is great.</p>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Upgrade to Pro and never hit a limit again. You'll be billed right away when you upgrade.</p>
    <a href="https://mealzy.org/upgrade.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:16px;">Upgrade to Pro →</a>
    <p style="color:#888;font-size:13px;margin:0;">$8/month. Cancel any time.</p>
  `);
}

function emailReferralReward(name, referredName) {
  const safeName = escapeHtml(name || 'there');
  const safeReferred = escapeHtml(referredName || 'someone you referred');
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">You earned a free plan!</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${safeName} — ${safeReferred} just upgraded to Pro. As a thank you, we've added an extra plan to your account this month.</p>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Keep referring friends to earn more free plans.</p>
    <a href="https://mealzy.org/dashboard.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:16px;">Go to My Dashboard →</a>
  `);
}

function emailWeeklyDigest(name, isPro) {
  const safeName = escapeHtml(name || 'there');
  const upgradeSection = !isPro
    ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0;">Running low on free plans? <strong>Pro unlocks unlimited plans for $8/month.</strong> <a href="https://mealzy.org/upgrade.html" style="color:#3d8b5e;text-decoration:none;font-weight:700;">Upgrade now →</a></p>`
    : '';
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">Your meal plan for this week is waiting.</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${safeName} — it's Monday. Takes 30 seconds to plan your whole week.</p>
    <a href="https://mealzy.org/meal-planner.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">Generate This Week's Plan →</a>
    <p style="color:#888;font-size:13px;margin:0 0 24px;">Your calorie target and budget are already saved. Just hit generate.</p>
    <hr style="border:none;border-top:1px solid #e8f0eb;margin:24px 0"/>
    ${upgradeSection}
  `);
}

// ════════════════════════════════════════════════════════════════════════════
// HEALTH & DASHBOARD APIs
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try { dbOk = await db.ping(); } catch(e) {}
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'error',
    resend: !!process.env.RESEND_API_KEY,
    timestamp: new Date().toISOString(),
    version: '3.0.0'
  });
});

// ── Dashboard APIs (Production-ready) ────────────────────────────────────────
app.get('/api/v1/budget', requireSession, async (req, res) => {
  try {
    const profile = await db.getProfile(req.session.userId) || {};
    const total = Number(profile.budget_weekly || profile.budget || 0);
    // Calculate days left in the week (assuming week starts Monday)
    const today = new Date();
    const dayOfWeek = (today.getDay() + 6) % 7; // 0 = Monday
    const daysLeft = 7 - dayOfWeek;
    res.json({ total, spent: 0, daysLeft }); // Spent requires grocery list aggregation
  } catch (err) {
    res.status(500).json({ error: 'Failed to load budget' });
  }
});

app.get('/api/v1/macros/today', requireSession, async (req, res) => {
  try {
    const profile = await db.getProfile(req.session.userId) || {};
    res.json({
      calories: Number(profile.daily_calories || profile.dailyCalories || 2000),
      protein: Number(profile.daily_protein || profile.macros?.protein || 150),
      carbs: Number(profile.daily_carbs || profile.macros?.carbs || 200),
      fat: Number(profile.daily_fat || profile.macros?.fat || 65)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load macros' });
  }
});

app.get('/api/v1/meals/week', requireSession, async (req, res) => {
  try {
    const plans = await db.getRecentPlans(req.session.userId, 1);
    if (!plans.length || !plans[0]?.plan?.meals) {
      return res.json([]); // Triggers the empty state in the UI
    }
    // Flatten the week's meals into a simple array for the UI
    const meals = plans[0].plan.meals.slice(0, 5).map(m => ({
      name: m.name,
      day: m.day || 'This Week',
      mealType: m.type,
      cost: Number(m.estimatedCost || 0),
      thumb: m.image_url || ''
    }));
    res.json(meals);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load meals' });
  }
});

app.get('/api/v1/activity', requireSession, async (req, res) => {
  // Return a static welcome message, or query db.logEvent if you build an activity feed later
  res.json([
    { title: 'Welcome to your new dashboard', time: 'Just now' }
  ]);
});

// ── Stripe payment links — served from env vars so links update without code deploys ──
// To add a new plan: set the env var in .env (local) + Render dashboard (production), redeploy.
const STRIPE_MONTHLY_FALLBACK = 'https://buy.stripe.com/28E28r1Q73q0e6neQRffy00';
app.get('/stripe-config.js', async (req, res) => {
  const monthly        = process.env.STRIPE_MONTHLY_URL        || STRIPE_MONTHLY_FALLBACK;
  const annual         = process.env.STRIPE_ANNUAL_URL         || monthly; // falls back to monthly if annual not set
  // Family and the abandonment discount must never silently resolve to the Pro
  // monthly link — that would charge (or promise) the wrong price. null here
  // means "not configured"; callers must check the *_READY flag before using it.
  const familyMonthly  = process.env.STRIPE_FAMILY_MONTHLY_URL || null;
  const familyAnnual   = process.env.STRIPE_FAMILY_ANNUAL_URL  || null;
  const discount        = process.env.STRIPE_DISCOUNT_URL      || null;
  res.type('js').send(
    `window.STRIPE_MONTHLY=${JSON.stringify(monthly)};` +
    `window.STRIPE_ANNUAL=${JSON.stringify(annual)};` +
    `window.STRIPE_FAMILY_MONTHLY=${JSON.stringify(familyMonthly)};` +
    `window.STRIPE_FAMILY_ANNUAL=${JSON.stringify(familyAnnual)};` +
    `window.STRIPE_FAMILY_MONTHLY_READY=${JSON.stringify(!!process.env.STRIPE_FAMILY_MONTHLY_URL)};` +
    `window.STRIPE_FAMILY_ANNUAL_READY=${JSON.stringify(!!process.env.STRIPE_FAMILY_ANNUAL_URL)};` +
    `window.STRIPE_DISCOUNT=${JSON.stringify(discount)};` +
    `window.STRIPE_ANNUAL_READY=${JSON.stringify(!!process.env.STRIPE_ANNUAL_URL)};`
  );
});

// ════════════════════════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Transport-independent signup. Performs sanitisation, email + password-policy
 * validation, enumeration-safe duplicate handling, bcrypt(12), user creation,
 * referral code, signup_date, verification token/email, and the signup event.
 * Never writes a response, cookie, or token.
 *
 * Returns one of:
 *   { ok: false, status, body }                       — validation error
 *   { ok: true, duplicate: true, body }               — enumeration-safe existing account
 *   { ok: true, duplicate: false, user, sessionPayload } — new account created
 */
async function performSignup(input) {
  const src = input || {};
  const name     = sanitise(src.name,  100);
  const email    = sanitise(src.email, 254).toLowerCase();
  const password = typeof src.password === 'string' ? src.password : '';

  if (!name || !email || !password) {
    return { ok: false, status: 400, body: { error: 'missing_fields', message: 'name, email, and password are required.' } };
  }
  if (!isValidEmail(email)) {
    return { ok: false, status: 400, body: { error: 'invalid_email', message: 'Please enter a valid email address.' } };
  }
  const passwordCheck = validatePasswordStrength(password);
  if (!passwordCheck.valid) {
    return { ok: false, status: 400, body: { error: 'password_weak', message: passwordCheck.message } };
  }

  const existing = await db.getUserByEmail(email);
  if (existing) {
    await sendEmail(existing.email, 'Someone tried to sign up with your email', emailAccountExists(existing.name)).catch(() => {});
    return { ok: true, duplicate: true, body: { success: true, message: 'If an account exists with this email, we\'ve sent a notice to it. Sign in or reset your password if this was you.' } };
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  await db.createUser({ id: userId, name, email, hashedPassword });

  // Generate short referral code ref_[6 alphanumeric chars]
  const refCode = 'ref_' + Math.random().toString(36).slice(2, 8).toUpperCase();
  try { await db.setUserRefCode(userId, refCode); } catch(e) {}
  try { await db.run('UPDATE users SET signup_date = ? WHERE id = ?', [new Date().toISOString(), userId]); } catch(e) {}

  const rawVerifyToken = randomUUID();
  const verifyTokenHash = require('crypto').createHash('sha256').update(rawVerifyToken).digest('hex');
  const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  try { await db.createVerificationToken(verifyTokenHash, userId, verifyExpiresAt); } catch(e) {}
  const verifyHost = process.env.APP_URL || 'https://mealzy.org';
  const verifyUrl = `${verifyHost}/verify-email.html?token=${rawVerifyToken}`;
  sendEmail(email, 'Verify your email — Mealzy', emailVerifyAddress(name, verifyUrl)).catch(() => {});

  await db.logEvent('signup', { userId }, '');

  return {
    ok: true,
    duplicate: false,
    user: { id: userId, name, email, pro: false, ref_code: refCode },
    sessionPayload: buildSessionPayload({ id: userId, email, pro: false, token_version: 0 }),
  };
}

/**
 * Transport-independent signin. Performs sanitisation, missing-field handling,
 * per-account + per-IP lockout checks, dummy-hash timing equalisation, failed-
 * login recording with Retry-After semantics, bcrypt verification, and
 * clearFailedLogins on success. Never writes a response, cookie, or token.
 *
 * Returns one of:
 *   { ok: false, status, body, retryAfter? }   — rejected (400 / 401 / 429)
 *   { ok: true, user, sessionPayload }          — authenticated
 */
async function performSignin(input) {
  const src = input || {};
  const email    = sanitise(src.email, 254).toLowerCase();
  const password = typeof src.password === 'string' ? src.password : '';
  const ip       = src.ip;

  if (!email || !password) {
    return { ok: false, status: 400, body: { error: 'missing_fields', message: 'email and password are required.' } };
  }

  // Per-account lockout (15 min after 10 failed attempts) and the IP-wide
  // backstop (15 min after 50 failed attempts across accounts).
  if (isAccountLocked(email, ip) || isIpLocked(ip)) {
    return { ok: false, status: 429, retryAfter: 900, body: { error: 'invalid_credentials', message: 'Email or password is incorrect.' } };
  }

  const user = await db.getUserByEmail(email);
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH); // match timing of the real-user path
    const lockResult = recordFailedLogin(email, ip);
    if (lockResult.accountLocked || lockResult.ipLocked) {
      return { ok: false, status: 429, retryAfter: 900, body: { error: 'invalid_credentials', message: 'Email or password is incorrect.' } };
    }
    return { ok: false, status: 401, retryAfter: 60, body: { error: 'invalid_credentials', message: 'Email or password is incorrect.' } };
  }

  const storedHash = user.hashed_password || '';

  if (!/^\$2[aby]\$/.test(storedHash)) {
    // Pre-migration account — no bcrypt hash to compare against.
    logger.warn('[auth] Legacy pre-bcrypt account attempted login', { email });
    await bcrypt.compare(password, DUMMY_HASH); // match timing of the real-user path
    return { ok: false, status: 401, body: { error: 'invalid_credentials', message: 'Email or password is incorrect.' } };
  }

  const valid = await bcrypt.compare(password, storedHash);

  if (!valid) {
    const lockResult = recordFailedLogin(email, ip);
    if (lockResult.accountLocked || lockResult.ipLocked) {
      const retryAfter = lockResult.lockedUntil
        ? Math.ceil((lockResult.lockedUntil - Date.now()) / 1000)
        : 900;
      return { ok: false, status: 429, retryAfter, body: { error: 'invalid_credentials', message: 'Email or password is incorrect.' } };
    }
    return { ok: false, status: 401, retryAfter: 60, body: { error: 'invalid_credentials', message: 'Email or password is incorrect.' } };
  }

  clearFailedLogins(email, ip);
  return { ok: true, user, sessionPayload: buildSessionPayload(user) };
}

// POST /api/auth/signup
app.post('/api/auth/signup', authLimiter, async (req, res) => {
  try {
    const result = await performSignup(req.body || {});
    if (!result.ok) return res.status(result.status).json(result.body);
    if (result.duplicate) return res.json(result.body);
    setJwtCookie(res, result.sessionPayload);
    res.json({ success: true, user: result.user });
  } catch(err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/signin
app.post('/api/auth/signin', authLimiter, async (req, res) => {
  try {
    const result = await performSignin({ email: (req.body || {}).email, password: (req.body || {}).password, ip: clientIp(req) });
    if (!result.ok) {
      if (result.retryAfter) res.setHeader('Retry-After', result.retryAfter);
      return res.status(result.status).json(result.body);
    }
    setJwtCookie(res, result.sessionPayload);
    res.json({ success: true, user: OutputShapes.User(result.user) });
  } catch(err) {
    console.error('Signin error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/mobile/signup — native (Bearer) client. Same behaviour as
// /api/auth/signup, but returns a fixed 7-day Bearer token in the body and
// never sets a session cookie.
app.post('/api/auth/mobile/signup', authLimiter, async (req, res) => {
  try {
    const result = await performSignup(req.body || {});
    if (!result.ok) return res.status(result.status).json(result.body);
    if (result.duplicate) return res.json(result.body);
    const token = issueNativeSessionToken(result.sessionPayload);
    res.json({ success: true, token, user: result.user });
  } catch(err) {
    console.error('Mobile signup error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/mobile/signin — native (Bearer) client. Same behaviour as
// /api/auth/signin, but returns a fixed 7-day Bearer token in the body and
// never sets a session cookie.
app.post('/api/auth/mobile/signin', authLimiter, async (req, res) => {
  try {
    const result = await performSignin({ email: (req.body || {}).email, password: (req.body || {}).password, ip: clientIp(req) });
    if (!result.ok) {
      if (result.retryAfter) res.setHeader('Retry-After', result.retryAfter);
      return res.status(result.status).json(result.body);
    }
    const token = issueNativeSessionToken(result.sessionPayload);
    res.json({ success: true, token, user: OutputShapes.User(result.user) });
  } catch(err) {
    console.error('Mobile signin error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/auth/me — returns current user (with profile) if JWT is valid
app.get('/api/auth/me', requireSession, async (req, res) => {
  const session = req.session;

  const user = await db.getUserById(session.userId);
  if (!user) {
    clearJwtCookie(res);
    return res.status(401).json({ error: 'user_not_found' });
  }

  // Cookie (web) callers get a sliding renewal with the original loginAt.
  // Bearer (native) callers get no replacement token and no Set-Cookie.
  if (req._authTransport !== 'bearer') {
    setJwtCookie(res, buildSessionPayload(user, session.loginAt));
  }

  const profile = await db.getProfile(user.id);
  const shape = OutputShapes.UserWithProfile(user, profile);

  // Free-plan usage, surfaced so the dashboard can show "X of Y used" and
  // disable Generate before the user hits the 402 instead of after.
  if (!shape.pro) {
    const genMonth = new Date().toISOString().slice(0, 7);
    shape.plans_used = await db.getPlanGenerationCount(user.id, genMonth);
    shape.plans_limit = await getEffectiveLimit(user.email);
  }

  res.json(shape);
});

// POST /api/auth/signout
app.post('/api/auth/signout', async (req, res) => {
  clearJwtCookie(res);
  res.json({ success: true });
});

// POST /api/auth/signout-all — revoke all existing sessions for this user
app.post('/api/auth/signout-all', requireSession, async (req, res) => {
  try {
    await db.bumpTokenVersion(req.session.userId);
    clearJwtCookie(res);
    res.json({ success: true });
  } catch (err) {
    logger.error('[auth] signout-all error', { message: err.message });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/reset-request
app.post('/api/auth/reset-request', authLimiter, async (req, res) => {
  try {
    await db.purgeExpiredTokens(); // housekeeping

    const email = sanitise(req.body.email, 254).toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'email_required' });

    // Always return the same response regardless of whether email exists (prevent enumeration)
    const user = await db.getUserByEmail(email);
    if (user) {
      const rawToken  = randomUUID();
      const tokenHash = require('crypto').createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      await db.createResetToken(tokenHash, user.id, expiresAt);

      const host     = process.env.APP_URL || 'https://mealzy.org';
      const resetUrl = `${host}/reset-password.html?token=${rawToken}`;

      await sendEmail(user.email, 'Reset your Mealzy password', emailPasswordReset(user.name, resetUrl)).catch(() => {});
    }
    // Return same success message whether or not email exists
    res.json({ success: true, message: 'If an account exists with this email, we\'ve sent a password reset link. It expires in 1 hour.' });
  } catch(err) {
    console.error('Reset request error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/reset-confirm
app.post('/api/auth/reset-confirm', authLimiter, async (req, res) => {
  try {
    const token       = sanitise(req.body.token, 36);
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'token and newPassword required' });
    }

    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: 'password_weak', message: passwordCheck.message });
    }

    const incomingHash = require('crypto').createHash('sha256').update(sanitise(req.body.token, 36)).digest('hex');
    const record = await db.getResetToken(incomingHash);
    if (!record) {
      return res.status(400).json({ error: 'invalid_token', message: 'This link has already been used. Try signing in with your new password — if that doesn\'t work, request a new reset link.' });
    }
    if (new Date(record.expires_at) < new Date()) {
      await db.markResetTokenUsed(incomingHash);
      return res.status(400).json({ error: 'expired_token', message: 'This link has expired. Reset links are valid for 1 hour — please request a new one.' });
    }

    const finalHash = await bcrypt.hash(newPassword, 12);
    await db.updatePassword(record.user_id, finalHash);
    await db.bumpTokenVersion(record.user_id);
    await db.markResetTokenUsed(incomingHash);
    res.json({ success: true, message: 'Password updated. You can now sign in with your new password.' });
  } catch(err) {
    console.error('Reset confirm error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/verify-email
app.post('/api/auth/verify-email', authLimiter, async (req, res) => {
  try {
    const token = sanitise(req.body.token, 36);
    if (!token) return res.status(400).json({ error: 'token_required' });
    const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
    const record = await db.getVerificationToken(tokenHash);
    if (!record) {
      return res.status(400).json({ error: 'invalid_token', message: "This link doesn't work anymore." });
    }
    if (new Date(record.expires_at) < new Date()) {
      await db.markVerificationTokenUsed(tokenHash);
      return res.status(400).json({ error: 'expired_token', message: 'This link has expired. Request a new one from your account.' });
    }
    await db.markEmailVerified(record.user_id);
    await db.markVerificationTokenUsed(tokenHash);
    res.json({ success: true, message: 'Your email has been verified.' });
  } catch(err) {
    console.error('Verify email error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/resend-verification
app.post('/api/auth/resend-verification', authLimiter, requireSession, async (req, res) => {
  try {
    const user = await db.getUserById(req.session.userId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    if (user.email_verified) {
      return res.json({ success: true, message: 'Your email is already verified.' });
    }
    const rawToken = randomUUID();
    const tokenHash = require('crypto').createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.createVerificationToken(tokenHash, user.id, expiresAt);
    const host = process.env.APP_URL || 'https://mealzy.org';
    const verifyUrl = `${host}/verify-email.html?token=${rawToken}`;
    sendEmail(user.email, 'Verify your email — Mealzy', emailVerifyAddress(user.name, verifyUrl)).catch(() => {});
    res.json({ success: true, message: 'Verification email sent — check your inbox.' });
  } catch(err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GOOGLE OAUTH
// ════════════════════════════════════════════════════════════════════════════

const GOOGLE_REDIRECT_URI = process.env.NODE_ENV === 'production'
  ? 'https://mealzy.org/auth/google/callback'
  : 'http://localhost:3000/auth/google/callback';

// GET /auth/google — kick off the OAuth flow
app.get('/auth/google', authLimiter, async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.redirect('/login.html?error=google_not_configured');
  }
  const state = randomUUID();
  res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; SameSite=Lax; Max-Age=300; Path=/`);
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    prompt:        'select_account',
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /auth/google/callback — exchange code, upsert user, issue JWT cookie
app.get('/auth/google/callback', async (req, res) => {
  const { code, error, state } = req.query;
  if (error || !code) return res.redirect('/login.html?error=google_cancelled');
  const cookies = parseCookies(req);
  if (!state || state !== cookies.oauth_state) {
    logger.warn('[google-oauth] CSRF state mismatch — possible attack');
    return res.redirect('/login.html?error=csrf_detected');
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  GOOGLE_REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      logger.error('[google-oauth] token exchange failed', tokenData);
      return res.redirect('/login.html?error=google_failed');
    }

    const userRes  = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const gUser = await userRes.json();
    const { sub: googleId, email, name } = gUser;
    if (!email) return res.redirect('/login.html?error=google_failed');

    let user = await db.getUserByGoogleId(googleId) || await db.getUserByEmail(email);
    if (!user) {
      const newId = randomUUID();
      await db.createUserGoogle({ id: newId, name: name || email.split('@')[0], email, googleId });
      const refCode = 'ref_' + Math.random().toString(36).slice(2, 8).toUpperCase();
      try { await db.setUserRefCode(newId, refCode); } catch(e) {}
      try { await db.run('UPDATE users SET signup_date = ? WHERE id = ?', [new Date().toISOString(), newId]); } catch(e) {}
      await db.logEvent('signup_google', { userId: newId }, '');
      user = await db.getUserById(newId);
    } else if (!user.google_id) {
      await db.linkGoogleId(user.id, googleId);
      await db.logEvent('google_linked', { userId: user.id }, '');
    }

    setJwtCookie(res, buildSessionPayload(user));
    const profile = await db.getProfile(user.id);
    res.redirect(profile ? '/dashboard.html' : '/onboarding.html');
  } catch(err) {
    logger.error('[google-oauth] callback error', err);
    res.redirect('/login.html?error=google_failed');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PROFILE ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

// POST /api/profile
app.post('/api/profile', requireSession, async (req, res) => {
  const session = req.session;
  const { profile } = req.body;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return res.status(400).json({ error: 'profile object required' });
  }
  if (JSON.stringify(profile).length > 20000) {
    return res.status(400).json({ error: 'profile_too_large', message: 'Profile data is too large.' });
  }
  await db.saveProfile(session.userId, profile);
  res.json({ success: true });
});

// GET /api/profile
app.get('/api/profile', requireSession, async (req, res) => {
  const session = req.session;
  const profile = await db.getProfile(session.userId);
  if (!profile) return res.status(404).json({ error: 'no_profile' });
  res.json({ success: true, profile });
});

// DELETE /api/profile — permanently delete the authenticated user's profile data
app.delete('/api/profile', requireSession, async (req, res) => {
  const session = req.session;
  await db.run('DELETE FROM profiles WHERE user_id = ?', [session.userId]);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
// FAMILY PROFILES (multi-profile for Family plan)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/family-profiles — list all family profiles for the authenticated user
app.get('/api/family-profiles', requireSession, async (req, res) => {
  const session = req.session;
  const profiles = await db.getFamilyProfiles(session.userId);
  res.json({ success: true, profiles });
});

// POST /api/family-profiles — create or update a family profile
// Body: { id (optional — omit to create), name, calorieGoal, budget, dietaryRestrictions, avatar }
app.post('/api/family-profiles', requireSession, async (req, res) => {
  const session = req.session;

  // Check user is pro (family profiles are a pro feature)
  const user = await db.getUserById(session.userId);
  if (!user?.pro) return res.status(403).json({ error: 'pro_required', message: 'Family profiles require a Pro or Family plan.' });

  const { id: profileId, name, calorieGoal, budget, dietaryRestrictions, avatar } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  // Limit to 4 profiles per user
  const existing = await db.getFamilyProfiles(session.userId);
  const isUpdate = profileId && existing.find(p => p.id === profileId);
  if (profileId && !isUpdate) {
    return res.status(403).json({ error: 'not_your_profile' });
  }
  if (!isUpdate && existing.length >= 4) {
    return res.status(400).json({ error: 'max_profiles', message: 'Family plan supports up to 4 profiles.' });
  }

  const id = profileId || randomUUID();
  const data = {
    calorieGoal: Math.min(Math.max(parseInt(calorieGoal) || 2000, 1200), 4000),
    budget: Math.min(Math.max(parseFloat(budget) || 100, 20), 2000),
    dietaryRestrictions: Array.isArray(dietaryRestrictions)
      ? dietaryRestrictions.filter(d => typeof d === 'string').slice(0, 20).map(d => sanitise(d, 50))
      : [],
    avatar: sanitise(avatar || '', 4)
  };

  await db.saveFamilyProfile(id, session.userId, sanitise(name, 100), data);
  await db.logEvent('family_profile_saved', { userId: session.userId }, '');
  res.json({ success: true, id, name, ...data });
});

// DELETE /api/family-profiles/:id
app.delete('/api/family-profiles/:id', requireSession, async (req, res) => {
  const session = req.session;
  await db.deleteFamilyProfile(req.params.id, session.userId);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
// DEMO MEAL — no auth, rate limited, for homepage interactive demo
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/demo-meal', demoLimiter, async (req, res) => {
  try {
    const ip           = clientIp(req);
    const calorieGoal  = Math.min(Math.max(parseInt(req.body.calorieGoal) || 2000, 1200), 4000);
    const budget       = Math.min(Math.max(parseFloat(req.body.budget) || 60, 20), 500);
    const dietary      = sanitise(req.body.dietary || 'none', 100);

    await db.logEvent('demo_generated', { calorieGoal, budget, dietary }, ip.slice(-8));

    const dietaryLine = dietary && dietary !== 'none'
      ? `DIETARY REQUIREMENT: All meals must be ${dietary}. Strictly no ingredients that violate this.`
      : '';

    const perMealBudget = (budget / 7 / 3).toFixed(2); // breakfast + lunch + dinner
    const dailyBudget   = (budget / 7).toFixed(2);

    const demoPrompt = `You are a professional meal planner. Generate a simple, practical full 7-day meal plan with breakfast, lunch, and dinner every day.

Requirements:
- Daily calorie target: ${calorieGoal} kcal total (split roughly 25% breakfast, 35% lunch, 40% dinner)
- Weekly grocery budget: $${budget} total. Per-meal budget: max $${perMealBudget} each.
- Cooking skill: beginner-friendly, everyday supermarket ingredients only.
- Target 20-40g protein per meal to keep nutrition reasonably consistent across all meals.
- Use American English spelling throughout (e.g. "pita" not "pitta", "yogurt" not "yoghurt").
 ${dietaryLine}

Generate exactly 21 meals: breakfast, lunch, and dinner for Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, and Sunday.
Keep meal names short (under 6 words) and descriptions under 8 words.

Respond ONLY with valid JSON, no markdown, no extra text:
{
  "meals": [
    { "day": "Monday",    "type": "breakfast", "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Monday",    "type": "lunch",     "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Monday",    "type": "dinner",    "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Tuesday",   "type": "breakfast", "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Tuesday",   "type": "lunch",     "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Tuesday",   "type": "dinner",    "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Wednesday", "type": "breakfast", "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Wednesday", "type": "lunch",     "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Wednesday", "type": "dinner",    "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Thursday",  "type": "breakfast", "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Thursday",  "type": "lunch",     "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Thursday",  "type": "dinner",    "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Friday",    "type": "breakfast", "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Friday",    "type": "lunch",     "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Friday",    "type": "dinner",    "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Saturday",  "type": "breakfast", "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Saturday",  "type": "lunch",     "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Saturday",  "type": "dinner",    "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Sunday",    "type": "breakfast", "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Sunday",    "type": "lunch",     "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Sunday",    "type": "dinner",    "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number }
  ],
  "weeklyEstimatedCost": number,
  "avgDailyCalories": number
}`;

    const completion = await callAnthropicWithSpendCap({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3500,
      system: [{ type: 'text', text: 'You are a meal planning API. Always respond with valid JSON only. No markdown fences, no explanations.', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: demoPrompt }]
    });
    if (completion.usage?.cache_read_input_tokens || completion.usage?.cache_creation_input_tokens) {
      log.info(`[demo-meal cache] hit=${completion.usage.cache_read_input_tokens||0} write=${completion.usage.cache_creation_input_tokens||0}`);
    }

    const rawText = completion.content[0].text.trim();
    let plan;
    try {
      plan = parseJsonResponse(rawText);
    } catch(e) {
      return res.status(500).json({ error: 'Failed to generate demo. Please try again.' });
    }

    if (Array.isArray(plan.meals)) {
      for (const meal of plan.meals) {
        meal.name = normalizeSpelling(meal.name);
        meal.description = normalizeSpelling(meal.description);
      }
    }

    res.json({ success: true, plan });

  } catch(err) {
    if (err.spendCapReached) {
      return res.status(503).json({
        error: 'service_temporarily_unavailable',
        message: 'AI features are temporarily paused due to high demand. Please try again later.'
      });
    }
    console.error('[demo-meal] error:', err);
    res.status(500).json({ error: 'Failed to generate demo. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PLAN HISTORY ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

// POST /api/plans/save
app.post('/api/plans/save', requireSession, async (req, res) => {
  const session = req.session;
  const { plan, date } = req.body;
  if (!plan) return res.status(400).json({ error: 'plan required' });
  try {
    const planDate = date || new Date().toISOString().split('T')[0];
    await db.savePlan(randomUUID(), session.userId, { date: planDate, plan, savedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch(err) {
    console.error('Plan save error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/plans
app.get('/api/plans', requireSession, async (req, res) => {
  const session = req.session;
  const plans = await db.getRecentPlans(session.userId, 10);
  res.json({ success: true, plans });
});

// GET /api/plans/today
app.get('/api/plans/today', requireSession, async (req, res) => {
  const session = req.session;
  try {
    const today = new Date().toISOString().split('T')[0];
    const recent = await db.getRecentPlans(session.userId, 30);
    const plan = recent.find(p => p && p.date === today) || null;
    res.json({ success: true, plan });
  } catch (err) {
    console.error('Plan today fetch error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PRO ACTIVATION
// ════════════════════════════════════════════════════════════════════════════

// POST /api/pro/activate — called from pro-welcome.html as a belt-and-suspenders
// backup to the Stripe webhook. Both paths set pro = 1 in the DB.
app.post('/api/pro/activate', stripeLimiter, requireSession, async (req, res) => {
  const session = req.session;

  const user = await db.getUserById(session.userId);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  // If already Pro (webhook already ran), just refresh the JWT cookie and return
  if (user.pro === 1) {
    setJwtCookie(res, buildSessionPayload(user, session.loginAt));
    return res.json({ success: true, pro: true });
  }

  // Stripe webhook is the primary path; this is just a backup for the race where
  // pro-welcome.html loads before the webhook lands. Never grant Pro here without
  // confirming an active/trialing subscription against the Stripe API directly —
  // the webhook may simply not have arrived yet, so absence of proof isn't grounds
  // to grant it for free.
  if (!user.stripe_customer_id || !process.env.STRIPE_SECRET_KEY) {
    return res.status(400).json({ success: false, pro: false, error: 'activation_pending' });
  }

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const subscriptions = await stripe.subscriptions.list({ customer: user.stripe_customer_id, limit: 5 });
    const hasActiveSub = subscriptions.data.some(s => s.status === 'active' || s.status === 'trialing');
    if (!hasActiveSub) {
      return res.status(400).json({ success: false, pro: false, error: 'activation_pending' });
    }
  } catch (e) {
    logger.error('[pro/activate] Stripe verification error:', e.message);
    return res.status(400).json({ success: false, pro: false, error: 'activation_pending' });
  }

  await db.setUserPro(session.userId);
  await db.logEvent('pro_activated', { userId: session.userId, source: 'pro_welcome_verified' }, '');
  user.pro = 1; // reflect the update just made — `user` was fetched before setUserPro
  setJwtCookie(res, buildSessionPayload(user, session.loginAt));
  res.json({ success: true, pro: true });
});

// ── POST /api/cancel-subscription ────────────────────────────────────────────
// Cancels the user's Stripe subscription at period end and logs survey reason.
app.post('/api/cancel-subscription', stripeLimiter, requireSession, async (req, res) => {
  const session = req.session;

  const user = await db.getUserById(session.userId);
  if (!user) return res.status(404).json({ error: 'user_not_found', message: 'User not found. Please log in again.' });
  if (!user.pro) return res.status(400).json({ error: 'not_pro', message: 'You don\'t have an active Pro subscription to cancel.' });
  if (!user.stripe_customer_id) return res.status(400).json({ error: 'no_stripe_customer', message: 'No active subscription found — email support@mealzy.org and we\'ll sort it out immediately.' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'stripe_not_configured' });
  }

  const reason = String(req.body.reason || '').slice(0, 200);
  const detail = String(req.body.detail || '').slice(0, 500);

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripe_customer_id,
      status:   'active',
      limit:    1
    });

    if (subscriptions.data.length === 0) {
      return res.status(404).json({ error: 'no_active_subscription', message: 'No active subscription found — email support@mealzy.org and we\'ll sort it out immediately.' });
    }

    const sub = subscriptions.data[0];
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });

    await db.logEvent('cancel_survey', { userId: user.id, reason, detail }, '');
    logger.info(`[cancel] ${user.id} — reason: ${reason}`);

    const cancelAt = new Date(sub.current_period_end * 1000).toISOString().split('T')[0];
    res.json({ success: true, cancel_at: cancelAt });
  } catch (e) {
    logger.error('[cancel-subscription] error:', e.message);
    res.status(500).json({ error: 'cancel_failed', message: 'Failed to cancel subscription. Please try again or email support@mealzy.org.' });
  }
});

// ── DELETE /api/account ───────────────────────────────────────────────────────
// Permanently deletes the user's account and all associated data (GDPR erasure).
app.delete('/api/account', authLimiter, requireSession, async (req, res) => {
  const session = req.session;
  const user = await db.getUserById(session.userId);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  if (user.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripe_customer_id,
        status:   'active',
        limit:    1
      });
      if (subscriptions.data.length > 0) {
        return res.status(409).json({
          error: 'active_subscription',
          message: 'Please cancel your Pro subscription before deleting your account.'
        });
      }
    } catch (e) {
      logger.error('[delete-account] Stripe check error:', e.message);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }

  try {
    await db.deleteUserAccount(user.id, user.email);
    clearJwtCookie(res);
    res.json({ success: true });
  } catch (e) {
    logger.error('[delete-account] deletion error:', e.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── GET /api/nps/check ────────────────────────────────────────────────────────
// Returns { show: true } if the user is ≥7 days old and hasn't submitted NPS.
app.get('/api/nps/check', optionalSession, async (req, res) => {
  const session = req.session;
  if (!session) return res.json({ show: false });

  try {
    const user = await db.getUserById(session.userId);
    if (!user || user.nps_submitted_at) return res.json({ show: false });

    const signupDate = new Date(user.signup_date || user.created_at);
    const daysOld = (Date.now() - signupDate.getTime()) / (1000 * 60 * 60 * 24);
    res.json({ show: daysOld >= 7 });
  } catch (e) {
    res.json({ show: false });
  }
});

// ── POST /api/nps/submit ──────────────────────────────────────────────────────
// Records NPS score (0–10) and optional comment, marks user as submitted.
app.post('/api/nps/submit', requireSession, async (req, res) => {
  const session = req.session;

  const score = Number(req.body.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return res.status(400).json({ error: 'invalid_score' });
  }

  const comment = String(req.body.comment || '').slice(0, 500);

  try {
    const user = await db.getUserById(session.userId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    await db.logEvent('nps_response', { userId: user.id, score, comment }, '');
    await db.run('UPDATE users SET nps_submitted_at = datetime(\'now\') WHERE id = ?', [user.id]);
    logger.info(`[nps] ${user.id} — score: ${score}`);

    res.json({ success: true });
  } catch (e) {
    logger.error('[nps/submit] error:', e.message);
    res.status(500).json({ error: 'submit_failed' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// STRIPE WEBHOOK — server-side Pro activation (primary path)
// ════════════════════════════════════════════════════════════════════════════

async function handleStripeWebhook(req, res) {
  // Stripe SDK is optional: only wire up if keys are configured
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(200).json({ received: true, note: 'Stripe not configured' });
  }

  let event;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const sig    = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch(err) {
    console.error('Stripe webhook signature error:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    if (await db.isWebhookEventProcessed(event.id)) {
      return res.status(200).json({ received: true, note: 'Already processed' });
    }
  } catch(e) {
    console.error('[stripe] idempotency check error:', e.message);
  }

  if (event.type === 'checkout.session.completed') {
    const session  = event.data.object;
    const email    = session.customer_details?.email?.toLowerCase().trim();
    const customerId = session.customer;
    if (email) {
      const user = await db.getUserByEmail(email);
      if (user) {
        await db.setUserPro(user.id);
        if (customerId) try { await db.setStripeCustomerId(user.id, customerId); } catch(e) {}
        await db.logEvent('pro_activated', { userId: user.id, source: 'stripe_webhook' }, '');
        logger.info(`[stripe] Pro activated — userId: ${user ? user.id : 'unknown'}`);

      } else {
        console.warn(`[stripe] checkout.session.completed for unknown email: ${email}`);
        await db.logEvent('stripe_unknown_email', { email }, '');
      }
    }
  }

  // Remove Pro when subscription is cancelled or payment fails
  if (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed') {
    const obj = event.data.object;
    const customerId = obj.customer;
    if (customerId) {
      try {
        const user = await db.get('SELECT * FROM users WHERE stripe_customer_id = ?', [customerId]);
        if (user) {
          // Only remove if pro_until is not set (referral reward) and past its date
          const proUntil = user.pro_until ? new Date(user.pro_until) : null;
          if (!proUntil || proUntil < new Date()) {
            await db.removeUserPro(user.id);
            await db.logEvent('pro_removed', { userId: user.id, reason: event.type }, '');
            logger.info(`[stripe] Pro removed — userId: ${user.id}, event: ${event.type}`);
          }
        } else {
          console.warn(`[stripe] ${event.type} — no user found for customer ${customerId}`);
        }
      } catch(e) { console.error('[stripe] subscription.deleted error:', e.message); }
    }
  }

  try { await db.markWebhookEventProcessed(event.id); } catch(e) { console.error('[stripe] mark processed error:', e.message); }

  res.json({ received: true });
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — GRANT PRO
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/admin/grant-pro', adminLimiter, requireAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email required' });
  }
  try {
    const user = await db.getUserByEmail(email.trim().toLowerCase());
    if (!user) return res.status(404).json({ error: 'No user found with that email' });
    await db.setUserPro(user.id);
    await db.logEvent('pro_granted_admin', { userId: user.id }, '');
    logger.info(`[admin] Pro granted — userId: ${user.id}`);
    res.json({ success: true, message: `Pro activated for ${user.email}` });
  } catch(e) {
    logger.error('[admin grant-pro]', e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN EXPORT
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/export', adminLimiter, requireAdmin, async (req, res) => {
  logger.info('[admin] export requested', { ip: req.ip });
  try {
    const users    = await db.getAllUsers();
    const leads    = await db.countLeads();
    res.json({
      user_count:  users.length,
      pro_count:   users.filter(u => u.pro === 1).length,
      lead_count:  leads,
      users: users.map(u => OutputShapes.AdminUserExport(u)),
      exported_at: new Date().toISOString()
    });
  } catch(e) {
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ════════════════════════════════════════════════════════════════════════════

// optionalSession resolves+DB-verifies the session cookie when present but
// never rejects the request — anonymous analytics keeps working exactly as
// before. Any client-supplied `data.userId` is untrusted and is always
// replaced (or stripped) by resolveTrackedEventData using the server-verified
// identity, the same one generate_plan/week_return already use.
app.post('/api/track', trackLimiter, optionalSession, async (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).json({ error: 'event required' });
  const safeData = resolveTrackedEventData(data, req.session?.userId);
  const dataStr = JSON.stringify(safeData);
  if (dataStr.length > 5000) {
    return res.status(400).json({ error: 'payload_too_large' });
  }
  const ip = clientIp(req);
  await db.logEvent(event, safeData, ip.slice(-8));
  res.json({ ok: true });
});

app.get('/api/analytics', requireSession, async (req, res) => {
  const session = req.session;

  const proToken = req.headers['x-pro-token'];
  const isAdmin  = proToken && process.env.PRO_TOKEN &&
                   timingSafeCompare(proToken, process.env.PRO_TOKEN);

  if (!isAdmin) {
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthStartStr = monthStart.toISOString().replace('T', ' ').slice(0, 19);
    const genRow = await db.get(
      `SELECT COUNT(*) as n FROM analytics WHERE event = 'generate_plan' AND json_extract(data, '$.userId') = ? AND created_at >= ?`,
      [session.userId, monthStartStr]
    );
    const plans = await db.getRecentPlans(session.userId, 100);
    return res.json({
      plans_this_month:  genRow?.n || 0,
      total_plans_saved: plans.length,
    });
  }

  const events = await db.getAnalytics();
  const now    = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth  = events.filter(e => new Date(e.ts) >= monthStart);
  const count = (arr, type) => arr.filter(e => e.event === type).length;

  const users = await db.getAllUsers();
  res.json({
    total_events:   events.length,
    total_users:    users.length,
    pro_users:      users.filter(u => u.pro === 1).length,
    this_month: {
      page_views:        count(thisMonth, 'page_view'),
      signups:           count(thisMonth, 'signup') + count(thisMonth, 'signup_google'),
      plans_generated:   count(thisMonth, 'generate_plan'),
      free_limit_hits:   count(thisMonth, 'free_limit_hit'),
      upgrade_clicks:    count(thisMonth, 'upgrade_click'),
      pro_activations:   count(thisMonth, 'pro_activated'),
    },
    all_time: {
      page_views:      count(events, 'page_view'),
      signups:         count(events, 'signup') + count(events, 'signup_google'),
      plans_generated: count(events, 'generate_plan'),
      pro_activations: count(events, 'pro_activated'),
    },
    lead_count: await db.countLeads()
  });
});

// ════════════════════════════════════════════════════════════════════════════
// REFERRAL
// ════════════════════════════════════════════════════════════════════════════

// POST /api/referral — credit a referral (called at signup when a pending ref exists)
app.post('/api/referral', authLimiter, requireSession, async (req, res) => {
  // Require authentication — only a real signed-in new user can trigger referral credit
  const session = req.session;

  const { referrer_email, new_user_email } = req.body;

  // The authenticated user must be the one being referred
  if (session.email !== (new_user_email || '').toLowerCase()) {
    return res.status(403).json({ error: 'can_only_credit_own_signup' });
  }

  // Referrer must exist in DB — referrer_email may be a ref_ code or a raw email
  let referrer;
  if (typeof referrer_email === 'string' && referrer_email.startsWith('ref_')) {
    referrer = await db.getUserByRefCode(referrer_email);
  } else if (isValidEmail(referrer_email)) {
    referrer = await db.getUserByEmail(referrer_email.toLowerCase());
  }
  if (!referrer) return res.status(404).json({ error: 'referrer_not_found' });

  // Idempotency: one referral credit per referred user, ever
  try {
    const alreadyCredited = await db.get(
      'SELECT id FROM referrals WHERE referred_email = ? AND converted = 1 LIMIT 1',
      [session.email]
    );
    if (alreadyCredited) return res.status(409).json({ error: 'already_credited' });
  } catch(e) { /* non-fatal — proceed */ }

  const ip = clientIp(req);
  try {
    const { randomUUID } = require('crypto');
    await db.saveReferral(randomUUID(), referrer.email, ip, session.email);
    await db.addBonusPlan(referrer.email);
    await db.markReferralConverted(referrer.email, session.email);
  } catch(e) { console.error('[referral] DB error:', e); }

  const current = referralBonus.get(referrer.email) || 0;
  referralBonus.set(referrer.email, current + 1);

  await db.logEvent('referral_signup', { referrerId: referrer.id, newUserId: session.userId }, '');
  res.json({ ok: true, bonus_plans: current + 1 });
});

// GET /api/referral-capture — called when visitor lands with ?ref=EMAIL
// Stores the referral intent so it can be credited when they sign up
app.get('/api/referral-capture', async (req, res) => {
  const { ref, ip: queryIp } = req.query;
  let resolvedRef = ref;
  let referrerId = null;
  if (typeof ref === 'string' && ref.startsWith('ref_')) {
    const referrer = await db.getUserByRefCode(ref);
    resolvedRef = referrer ? referrer.email : null;
    referrerId = referrer ? referrer.id : null;
  } else if (typeof ref === 'string' && isValidEmail(ref)) {
    const referrer = await db.getUserByEmail(ref.toLowerCase());
    referrerId = referrer ? referrer.id : null;
  }
  if (!isValidEmail(resolvedRef)) return res.json({ ok: false });
  const ip = clientIp(req) || queryIp || '';
  try {
    const { randomUUID } = require('crypto');
    await db.saveReferral(randomUUID(), resolvedRef, ip.slice(-16), '');
  } catch(e) { /* non-fatal */ }
  await db.logEvent('referral_visit', referrerId ? { referrerId } : {}, ip.slice(-8));
  res.json({ ok: true });
});

app.get('/api/referral-status', async (req, res) => {
  const { email } = req.query;
  if (!isValidEmail(email)) return res.status(400).json({ error: 'email required' });
  const ip = clientIp(req);
  const usage         = getUsage(ip);
  const effectiveLimit = await getEffectiveLimit(email);

  // Get SQLite-persisted referral count (survives restarts)
  let referralCount = referralBonus.get(email) || 0;
  try {
    const dbCount = await db.getReferralCount(email);
    if (dbCount > referralCount) referralCount = dbCount;
  } catch(e) { /* non-fatal */ }

  res.json(OutputShapes.ReferralStatus(referralCount, effectiveLimit, usage.count));
});

// ════════════════════════════════════════════════════════════════════════════
// EMAIL LEADS
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/email-leads', leadLimiter, async (req, res) => {
  try {
    const email    = sanitise(req.body.email, 254).toLowerCase();
    const source   = sanitise(req.body.source, 100) || 'unknown';
    const name     = sanitise(req.body.name,   100);
    const discount = req.body.discount ? 1 : 0; // abandonment flow — mark for 50% off code
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    await db.saveLead(randomUUID(), email, source, name);
    // Log with discount flag so admin export can filter these for coupon send
    await db.logEvent('email_lead', { email, source, discount }, '');
    res.json({ success: true });
  } catch(err) {
    console.error('Email lead error:', err);
    res.json({ success: true }); // fail silently to client
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MEAL GENERATION
// ════════════════════════════════════════════════════════════════════════════

/** Deterministic, unit-aware ingredient-cost lookup — delegates to pricing.js,
 * the single source of truth shared with the grocery-list cost calculation.
 * Never asks the AI to guess prices, and never trusts the AI's own estimated
 * cost field. Returns { totalUSD, allVerified, items } — allVerified is false
 * whenever any ingredient fell back to an unknown/estimated/legacy price. */
async function calculateMealCost(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return { totalUSD: 0, datasetPricedCostUSD: 0, unknownEstimatedCostUSD: 0, unknownIngredientCount: 0, allVerified: true, items: [] };
  }
  const priceRows = await db.getIngredientPrices();
  return pricing.priceIngredients(ingredients, priceRows);
}

/**
 * Fires the Budget Engine analytics events for one runWeeklyBudgetRepair/
 * runWithBudgetRepair call. `requestId` is generated once per generation
 * request by the caller (see call sites) and attached to every event so a
 * single week's attempt -> repair completed -> attempt -> repair completed
 * -> outcome journey can be reconstructed later — it is a random, ephemeral
 * correlation key only
 * (crypto.randomUUID()), never derived from userId/email/IP/session/diet/
 * allergies/ingredients.
 *
 * All decision logic (which events fire, their exact payload, bucketing,
 * repair direction) lives in budgetEngine.buildAttemptEvents/
 * buildOutcomeEvent — pure and unit-tested. This function is only the thin
 * persistence wrapper, so Budget Engine correctness never depends on
 * analytics: every body here is wrapped in try/catch and only warns on
 * failure (db.logEvent already swallows its own errors internally, but
 * this also guards the payload-building call itself) — it can never abort
 * or alter plan generation.
 */
function logBudgetAttempt(mode, requestId) {
  let previousCostUSD = null;
  return async (attempt, evaluation, maxAttempts) => {
    try {
      const events = budgetEngine.buildAttemptEvents({ requestId, mode, attempt, maxAttempts, evaluation, previousCostUSD });
      for (const { event, data } of events) {
        await db.logEvent(event, data, '');
      }
      previousCostUSD = evaluation.costUSD;
    } catch (err) {
      logger.warn('[budget-analytics] logBudgetAttempt failed (non-fatal, generation continues):', { message: err.message });
    }
  };
}

async function logBudgetOutcome(mode, requestId, succeeded, attempts, evaluation) {
  try {
    const { event, data } = budgetEngine.buildOutcomeEvent({ requestId, mode, succeeded, attempts, evaluation });
    await db.logEvent(event, data, '');
  } catch (err) {
    logger.warn('[budget-analytics] logBudgetOutcome failed (non-fatal, generation continues):', { message: err.message });
  }
}

/** The truthful, non-blaming controlled-failure body for a plan that could
 * not be brought under budget after budgetEngine.MAX_GENERATION_ATTEMPTS
 * attempts. Never returns the over-budget plan as if it succeeded. */
function budgetUnreachableResponse(evaluation, extra) {
  return {
    error: 'budget_unreachable',
    message: "Mealzy couldn't build a plan within this budget using the current constraints. Try increasing the budget or relaxing one of your preferences.",
    estimatedCostUSD: evaluation.costUSD,
    budgetUSD: evaluation.budgetUSD,
    ...extra,
  };
}

/** Builds the ONE repair prompt block covering every constraint that failed
 * on the previous attempt — cost and/or macro, whichever apply — per
 * planRepairEngine's combined repairContext shape:
 *   { attempt, maxAttempts, budget: {previousCostUSD, budgetUSD}|null,
 *     macro: {deviations, worstAxis}|null }
 * Returns '' when there is no repairContext (first attempt) or neither sub-
 * object is failing. Never mentions a constraint that isn't currently
 * failing — a plan that's already within budget never gets told to cut
 * costs again just because macros still need fixing, and vice versa. */
function buildRepairBlock(repairContext, currency) {
  if (!repairContext) return '';
  const parts = [];
  if (repairContext.budget) {
    parts.push(`Cost too high: the previous attempt's authoritative estimated cost was ${currency} ${repairContext.budget.previousCostUSD.toFixed(2)}, over the ${currency} ${repairContext.budget.budgetUSD.toFixed(2)} target for this day. Rebuild using cheaper ingredients or simpler meals so the total fits within budget — do not shrink portion sizes to unrealistic amounts, swap to cheaper ingredients instead.`);
  }
  if (repairContext.macro) {
    const lines = macroEngine.buildDirectionalGuidance(repairContext.macro.deviations);
    if (lines.length) {
      parts.push(`Daily macro totals missed target: ${lines.join(', ')}. Adjust ingredient choices and portions (e.g. leaner or fattier protein sources, more or less starchy sides) to close this gap across the 4 meals.`);
    }
  }
  if (!parts.length) return '';
  return `\n⚠️ REPAIR REQUIRED (attempt ${repairContext.attempt}/${repairContext.maxAttempts}):\n${parts.map(p => `- ${p}`).join('\n')}\nEvery other requirement (diet, allergies, calorie targets, cooking time) still applies exactly as stated.\n`;
}

/** Thrown when a generated meal contains a declared allergen; the route
 * turns this into a 400 for single-day requests or fails the whole week. */
class AllergyViolationError extends Error {
  constructor(allergen, mealName) {
    super(`Allergy violation: ${allergen} in ${mealName}`);
    this.allergen = allergen;
    this.mealName = mealName;
  }
}

/** Adds `n` days to a YYYY-MM-DD date string, returning YYYY-MM-DD. */
function addDaysToDateStr(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

const WEEK_START_RE = /^\d{4}-\d{2}-\d{2}$/;

app.post('/api/generate-meal', generateLimiter, optionalSession, async (req, res) => {
  try {
    const { profile, date: rawDate, weekStart: rawWeekStart, swap_meal_type, plan_token, user_email, avoid_meals } = req.body;
    const date = sanitise(rawDate, 40);
    const weekStart = (!swap_meal_type && typeof rawWeekStart === 'string' && WEEK_START_RE.test(rawWeekStart)) ? rawWeekStart : null;

    if (!profile) return res.status(400).json({ error: 'Profile is required' });

    // ── Freemium gate: server-side pro check is authoritative ──────────────
    const session = req.session;

    let sessionUser = null;
    if (session) {
      sessionUser = await db.getUserById(session.userId);
      if (sessionUser && !sessionUser.email_verified) {
        return res.status(403).json({
          error: 'email_not_verified',
          message: 'Please verify your email to generate plans. Check your inbox, or resend the link from your account settings.'
        });
      }
    }

    const PRO_TOKEN = process.env.PRO_TOKEN || '';
    let isPro = !!(
      PRO_TOKEN.length >= 32 &&
      typeof plan_token === 'string' &&
      timingSafeCompare(plan_token, PRO_TOKEN)
    ); // plan bypass — fails closed if PRO_TOKEN unset/short/mismatched

    if (!isPro && session) {
      // Re-query DB — the JWT payload may be stale if Pro was just activated
      isPro = sessionUser?.pro === 1;
    }

    // ── Quota check (read-only) — credits/trial state are only *consumed* later,
    // after the plan passes validation (see below).
    const ip = clientIp(req);
    let anonUsage = null;
    let trialLocalDate = null;
    if (!swap_meal_type && !isPro) {
      if (session) {
        // ── Logged-in free users: 30-day daily trial, 1 plan per local calendar day ──
        if (weekStart) {
          return res.status(400).json({
            error: 'week_mode_unavailable_on_trial',
            message: 'Full week generation isn\'t available on the free plan yet. Generate today\'s plan instead.',
          });
        }

        const timezone = resolveClientTimezone(req.body.timezone);
        trialLocalDate = getLocalDateString(timezone);

        let trialStartedAt = sessionUser?.trial_started_at;
        if (!trialStartedAt) {
          trialStartedAt = new Date().toISOString();
          await db.setTrialStart(session.userId, trialStartedAt);
        }

        const trialEndsAtMs = new Date(trialStartedAt).getTime() + TRIAL_DAYS_MS;
        const trialActive = Date.now() < trialEndsAtMs;

        if (trialActive) {
          const alreadyToday = await db.getTrialGenerationByDate(session.userId, trialLocalDate);
          if (alreadyToday) {
            await db.logEvent('trial_already_generated_today', { userId: session.userId }, '');
            // Recover the plan that generation already produced today, rather than
            // leaving the user blocked with nothing to show — the server already
            // knows its id from trial_generations, so this is a lookup, not a new
            // generation (no quota is touched).
            const existingPlan = alreadyToday.plan_id
              ? await db.getPlanById(alreadyToday.plan_id, session.userId)
              : null;
            return res.status(409).json({
              error: 'already_generated_today',
              message: existingPlan
                ? 'You already created a plan today. We\'ve loaded it for you.'
                : 'You already generated a plan today. Come back tomorrow for your next one.',
              planId: alreadyToday.plan_id || null,
              existingPlan
            });
          }
        } else {
          // ── Past day 30: 1 free plan every 7 days, forever ──
          const lastGeneration = await db.getLastTrialGeneration(session.userId);
          if (lastGeneration) {
            const nextAllowedMs = new Date(lastGeneration.local_date).getTime() + WEEKLY_PLAN_INTERVAL_MS;
            if (Date.now() < nextAllowedMs) {
              const nextAllowedDate = new Date(nextAllowedMs).toISOString().split('T')[0];
              await db.logEvent('weekly_free_plan_limit_hit', { userId: session.userId }, '');
              return res.status(402).json({
                error: 'weekly_limit_reached',
                message: `Your free plan resets weekly. Next one is available ${nextAllowedDate}, or upgrade to Pro for unlimited plans.`,
                upgrade_url: '/pricing.html',
                resets_in: nextAllowedDate,
                used: null,
                limit: null
              });
            }
          }
        }
      } else {
        // Anonymous user: track by IP (in-memory, resets on server restart)
        anonUsage = getUsage(ip);
        if (anonUsage.count >= FREE_PLAN_LIMIT) {
          await db.logEvent('free_limit_hit', {}, '');
          return res.status(402).json({
            error: 'free_limit_reached',
            message: `You've used all ${FREE_PLAN_LIMIT} free plans this month.`,
            upgrade_url: '/pricing.html',
            resets_in: 'Start of next month',
            used: anonUsage.count,
            limit: FREE_PLAN_LIMIT
          });
        }
      }
    }

    // ── Profile field extraction ──────────────────────────────────────────
    const name               = sanitise(profile.name || 'User', 100);
    const goal               = sanitise(profile.fitness_goal || profile.goal || 'eat healthier', 200);
    const dietaryPrefs       = Array.isArray(profile.dietary_preferences || profile.dietaryPrefs) ? (profile.dietary_preferences || profile.dietaryPrefs) : [];
    const allergies          = capList(profile.allergies, 20, 40);
    const cookingSkill       = sanitise(profile.cooking_skill || profile.cookingSkill || 'intermediate', 50);
    const dailyCalories      = Math.min(4000, Math.max(1200, Number(profile.daily_calories || profile.dailyCalories || 2000)));
    // Malformed/missing/impossible values fall back safely to Mealzy's
    // existing defaults (150/200/65g) rather than an invented fitness
    // recommendation — see macroEngine.buildDailyMacroTargets.
    const dailyMacroTargets  = macroEngine.buildDailyMacroTargets(profile);
    const dailyProtein       = dailyMacroTargets.protein;
    const dailyCarbs         = dailyMacroTargets.carbs;
    const dailyFat           = dailyMacroTargets.fat;
    const mealMacroTargets   = macroEngine.splitMacroTargetsPerMeal(dailyMacroTargets);
    // Clamped the same way /api/generate-grocery-list already clamps `budget`
    // (see groundAndStampGroceryItems' caller) — an unclamped negative/absurd/
    // NaN value would make budgetEngine retry 3 times against an
    // unsatisfiable target, burning real Anthropic spend for no reason.
    let budget                = Number(profile.budget_weekly || profile.budget || 100);
    if (Number.isNaN(budget)) budget = 100;
    budget                    = Math.min(10000, Math.max(1, budget));
    const currency           = sanitise(profile.currency || 'USD', 10);
    // Budget Engine v1 enforcement threshold for SINGLE-DAY mode only.
    // Deliberately the RAW weekly budget divided by 7 — NOT the
    // price-tier-multiplied `dailyBudget` used in the prompt below (that
    // multiplier is a prompt-only hint about ingredient quality, and
    // inflating it for Premium tier would let a day legitimately exceed the
    // user's actual weekly budget). Single-day mode has no separate weekly
    // context to defer to (each request is independent/stateless — see
    // server.js's single-day block), so it enforces this figure directly.
    // Week mode does NOT use this as a hard per-day cap — see
    // budgetEngine.nextDayGuidanceUSD (adaptive per-day prompt guidance) and
    // budgetEngine.runWeeklyBudgetRepair (the actual, authoritative
    // whole-week invariant check) further down in this route.
    const dailyBudgetUSD     = budget / 7;
    const budgetEnforceable  = budgetEngine.isBudgetEnforceable(currency);
    const cookingTimeMinutes = Number(profile.cooking_time_minutes || profile.cookingTimeMinutes || 30);
    const language           = sanitise(profile.language || 'en', 10);
    const languageNames = { en:'English',sv:'Swedish',no:'Norwegian',da:'Danish',de:'German',fr:'French',es:'Spanish',it:'Italian',pt:'Portuguese',nl:'Dutch',ja:'Japanese',fi:'Finnish',pl:'Polish',tr:'Turkish',ko:'Korean',zh:'Chinese',ar:'Arabic',hi:'Hindi',ru:'Russian' };
    const languageName   = languageNames[language] || 'English';
    const priceTierMultiplier = profile.price_tier === 'budget' ? 0.8 : profile.price_tier === 'premium' ? 1.3 : 1.0;
    const priceTierLabel = profile.price_tier === 'budget' ? 'Budget' : profile.price_tier === 'premium' ? 'Premium' : 'Mid-range';
    const dailyBudget    = (budget / 7 * priceTierMultiplier).toFixed(2);
    const perMealBudget  = (budget / 7 / 4 * priceTierMultiplier).toFixed(2);

    // ── Dietary restriction enforcement — explicit banned lists per preference ──
    // These blocks go at the TOP of all meal plan prompts (most important instruction first).
    const DIET_RULES = {
      vegan:       'VEGAN — zero animal products. NEVER use: meat, fish, seafood, chicken, beef, pork, lamb, turkey, duck, eggs, milk, cheese, butter, cream, yoghurt, honey, ghee, lard, whey, gelatin. Use ONLY: vegetables, fruits, legumes, grains, nuts, seeds, plant-based oils, tofu, tempeh, seitan (if not GF), coconut milk, oat milk, soy milk, almond milk.',
      vegetarian:  'VEGETARIAN — no meat or fish. NEVER use: chicken, beef, pork, lamb, turkey, duck, fish, salmon, tuna, shrimp, prawns, cod, sardines, anchovies, bacon, ham, sausage. Eggs and dairy are allowed.',
      'gluten-free':'GLUTEN-FREE — no gluten. NEVER use: wheat, white flour, bread, sourdough, toast, wrap, pita, tortilla, pasta, noodles, couscous, barley, rye, seitan, soy sauce (use tamari), malt, crackers, croutons, breadcrumbs, regular oats. ALLOWED: rice, quinoa, potatoes, corn, certified GF oats, rice noodles, tamari.',
      keto:        'KETO — max 25g total net carbs per day across all 4 meals. NEVER use: bread, pasta, rice, potatoes, corn, tortillas, wraps, noodles, couscous, sugar, honey, fruit juice, bananas, grapes, mangoes, apples, oranges, lentils, chickpeas, beans, peas, sweet potatoes, quinoa. ALLOWED: meat, fish, eggs, cheese, cream, butter, avocado, leafy greens, cauliflower, broccoli, zucchini, nuts, seeds, olive oil.',
      halal:       'HALAL — no pork or alcohol. NEVER use: pork, bacon, ham, lard, gelatin (unless halal-certified), alcohol, wine, beer in cooking.',
      'dairy-free':'DAIRY-FREE — no dairy. NEVER use: milk, cheese, butter, cream, yoghurt, ghee, whey, casein. Use: plant-based alternatives like coconut milk, oat milk, soy milk, vegan butter.',
    };
    // Special combination rules that override individual rules
    const isVegan = dietaryPrefs.map(p=>p.toLowerCase()).includes('vegan');
    const isKeto  = dietaryPrefs.map(p=>p.toLowerCase()).includes('keto');
    const comboRules = (isVegan && isKeto)
      ? '\nKETO + VEGAN COMBINATION: Use ONLY these protein sources: tofu, tempeh, edamame, hemp seeds. Use ONLY these fats: avocado, coconut oil, olive oil, nuts (almonds, walnuts, macadamia), seeds (chia, flax, sunflower). Absolutely NO eggs, dairy, fish, or meat of any kind. NO grains, legumes (except edamame/tofu/tempeh), or starchy vegetables.'
      : '';
    const activeDietRules = (dietaryPrefs
      .map(p => DIET_RULES[p.toLowerCase()] || `STRICT DIETARY REQUIREMENT: User is ${p}. Every meal MUST comply.`)
      .join('\n')) + comboRules;
    const dietaryBlock = activeDietRules
      ? `\n⚠️ DIETARY RULES — HIGHEST PRIORITY — THESE OVERRIDE EVERYTHING ELSE:\n${activeDietRules}\nDouble-check every ingredient against these rules before including it.\n`
      : '';
    const allergyBlock = allergies.length > 0
      ? `\n⚠️ ALLERGY WARNING — NEVER include these ingredients in any form: ${allergies.join(', ')}.\n`
      : '';
    const clientAvoidList = capList(avoid_meals, 30, 80);
    const dislikedMeals = session ? await db.getUserDislikedMeals(session.userId) : [];
    const avoidList = Array.from(new Set([...clientAvoidList, ...dislikedMeals])).slice(0, 60);
    const avoidBlock = avoidList.length > 0
      ? `STRICT AVOID — do not include any of these previously rejected meals: ${avoidList.join(', ')}.`
      : '';

    const cuisineGroups = {
      mediterranean:['Greek','Italian','Spanish','Moroccan','Turkish','Lebanese','Tunisian'],
      asian:['Japanese','Chinese','Korean','Vietnamese','Thai','Filipino','Malaysian','Indonesian'],
      indian:['North Indian','South Indian','Bengali','Punjabi','Goan'],
      middleeastern:['Lebanese','Persian','Israeli','Egyptian','Jordanian'],
      american:['American','Tex-Mex','Southern BBQ','New England','Californian'],
      mexican:['Mexican','Oaxacan','Yucatecan','Street Food Mexican'],
      scandinavian:['Swedish','Norwegian','Danish','Finnish'],
      african:['Ethiopian','West African','South African','Moroccan'],
      european:['French','German','British','Polish','Portuguese'],
      latin:['Brazilian','Argentinian','Peruvian','Colombian']
    };
    const proteins = ['chicken','salmon','tuna','beef','tofu','eggs','shrimp','turkey','lentils','chickpeas','pork','lamb','cod','tempeh','sardines','halloumi','duck','venison'];

    const preferredCuisine = sanitise(profile.preferred_cuisine, 60) || null;
    const allCuisinesFlat = Object.values(cuisineGroups).flat();
    // Filter protein suggestions to match dietary restrictions — prevents biasing the model with forbidden proteins
    const proteinsByDiet = {
      vegan:       ['tofu','lentils','chickpeas','tempeh','edamame','hemp seeds','black beans','kidney beans'],
      vegetarian:  ['eggs','tofu','lentils','chickpeas','tempeh','halloumi','cottage cheese','greek yogurt'],
      keto:        ['chicken','salmon','beef','shrimp','turkey','pork','lamb','cod','sardines','duck','venison','eggs','tuna'],
      'dairy-free':['chicken','salmon','tuna','beef','tofu','eggs','shrimp','turkey','lentils','chickpeas','pork','lamb','cod','tempeh','sardines','duck','venison'],
      halal:       ['chicken','salmon','tuna','beef','tofu','eggs','shrimp','turkey','lentils','chickpeas','lamb','cod','tempeh','sardines','duck','venison'],
    };
    let eligibleProteins = [...proteins];
    for (const pref of dietaryPrefs.map(p=>p.toLowerCase())) {
      if (proteinsByDiet[pref]) {
        eligibleProteins = eligibleProteins.filter(p => proteinsByDiet[pref].includes(p));
        if (eligibleProteins.length === 0) eligibleProteins = proteinsByDiet[pref]; // fallback
      }
    }
    // Special keto+vegan combo: only plant-based fats/proteins
    if (isVegan && isKeto) eligibleProteins = ['tofu','tempeh','hemp seeds','edamame'];

    /** Picks a fresh cuisine/protein/seed for one day's generation, optionally
     * avoiding the previous day's cuisine so a 7-day week doesn't repeat. */
    function pickDayVariety(excludeCuisine) {
      let todayCuisine;
      if (preferredCuisine && cuisineGroups[preferredCuisine.toLowerCase().replace(/\s/g,'')]) {
        const group = cuisineGroups[preferredCuisine.toLowerCase().replace(/\s/g,'')];
        const pool = (excludeCuisine && group.length > 1) ? group.filter(c => c !== excludeCuisine) : group;
        todayCuisine = pool[Math.floor(Math.random() * pool.length)];
      } else if (preferredCuisine) {
        todayCuisine = preferredCuisine;
      } else {
        const pool = excludeCuisine ? allCuisinesFlat.filter(c => c !== excludeCuisine) : allCuisinesFlat;
        todayCuisine = pool[Math.floor(Math.random() * pool.length)];
      }
      const todayProtein = eligibleProteins[Math.floor(Math.random() * eligibleProteins.length)];
      const randomSeed    = Math.floor(Math.random() * 99999);
      return { todayCuisine, todayProtein, randomSeed };
    }
    const { todayCuisine, todayProtein, randomSeed } = pickDayVariety(null);

    // ── JSON schema embedded in the prompt for reliable parsing ──────────
    const mealSchema = `{
  "type": "breakfast|lunch|dinner|snack",
  "name": "string",
  "description": "string — MUST start with a cooking method word (e.g. Grilled, Pan-seared, Slow-cooked, Roasted, Baked, Crispy, Sautéed). Format: [Method] [ingredient] with [accompaniment]. Under ${isPro ? '15' : '10'} words.",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "cookTime": number,
  "servings": 1,
  "estimatedCost": number,
  "ingredients": [{ "name": "string", "amount": "string (human-readable, e.g. '200g' or '2 eggs')", "amountValue": number, "amountUnit": "g|ml|count", "cost": number }],
  "instructions": ["string"],
  "imageKeyword": "simple English food keyword e.g. scrambled eggs"
}`;
    // Every ingredient's amountValue/amountUnit MUST be grams for solids, milliliters
    // for liquids, or count for discrete items (eggs, slices) — never cups,
    // tablespoons, ounces, or other cooking units. Head/bunch vegetables
    // (broccoli, cauliflower, lettuce, kale) go in grams, not count. "amount"
    // stays a human-readable string for display; amountValue/amountUnit are
    // what the server actually prices.
    const ingredientUnitRule = `Every ingredient's "amountValue"/"amountUnit" MUST use grams (g) for solids, milliliters (ml) for liquids, or count (count) for discrete items like eggs or slices — convert from cups/tbsp/oz yourself, never leave it in those units. Example: "amount": "1 cup rice" -> "amountValue": 185, "amountUnit": "g". Vegetables sold by the head or bunch (broccoli, cauliflower, lettuce, kale) MUST be given in grams, never as a "count" — e.g. "1 head broccoli" -> "amountValue": 340, "amountUnit": "g". List "salt" and "pepper" as TWO separate ingredients, each on its own line — never a single combined "salt and pepper" entry.`;

    // ═══════════════════════════════════════════════════════════════════════
    // SINGLE MEAL SWAP
    // ═══════════════════════════════════════════════════════════════════════
    if (swap_meal_type) {
      const mealCalories = { breakfast: Math.round(dailyCalories * 0.25), lunch: Math.round(dailyCalories * 0.35), dinner: Math.round(dailyCalories * 0.30), snack: Math.round(dailyCalories * 0.10) };
      const targetCals   = mealCalories[swap_meal_type] || Math.round(dailyCalories * 0.25);

      const swapPrompt = `${dietaryBlock}${allergyBlock}Generate ONE practical home-cooked ${swap_meal_type} meal for ${name}.

Cuisine: ${todayCuisine}. Featured protein: ${todayProtein}. Variety seed: ${randomSeed}.
Target: ~${targetCals} kcal. Cooking skill: ${cookingSkill}. Max time: ${cookingTimeMinutes} min.
Budget: max ${currency} ${perMealBudget} for this meal. Use common supermarket ingredients only.

 ${avoidBlock}

LANGUAGE: All meal name, description, and ingredient names MUST be in ${languageName}. JSON keys stay in English.${languageName === 'English' ? ' Use American English spelling (e.g. "pita" not "pitta", "yogurt" not "yoghurt").' : ''}

${ingredientUnitRule}

Respond ONLY with valid JSON matching this exact schema (no markdown, no extra text):
 ${mealSchema.replace('"type": "breakfast|lunch|dinner|snack"', `"type": "${swap_meal_type}"`)}`;

      const completion = await callAnthropicWithSpendCap({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system: [{ type: 'text', text: 'You are a professional nutritionist and chef. Always respond with valid JSON only, no markdown fences, no explanation. Never include ingredients that violate dietary restrictions or allergies.', cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: swapPrompt }]
      });

      const meal = parseJsonResponse(completion.content[0].text);
      if (languageName === 'English') {
        meal.name = normalizeSpelling(meal.name);
        meal.description = normalizeSpelling(meal.description);
      }
      const priced = await calculateMealCost(meal.ingredients);
      meal.cost = priced.totalUSD;
      meal.costConfidence = priced.allVerified ? 'verified' : 'estimated';
      meal.unknownEstimatedCostUSD = priced.unknownEstimatedCostUSD;
      meal.unknownIngredientCount = priced.unknownIngredientCount;

      if (process.env.UNSPLASH_ACCESS_KEY) {
        try {
          const q = encodeURIComponent((meal.imageKeyword || meal.name) + ' dish plated food photography');
          const imgRes = await fetch(`https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape`, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } });
          const imgData = await imgRes.json();
          if (imgData.results?.[0]) meal.image_url = imgData.results[0].urls.small;
        } catch(e) { /* keep default */ }
      }

      return res.json({ success: true, meal });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FULL MEAL PLAN — one day's worth of meals, called once per day
    // (7 times for a week, once for the legacy single-day path)
    // ═══════════════════════════════════════════════════════════════════════

    // Pro vs Free difference:
    // Pro: full recipes (up to 8 ingredients, 6 detailed technique steps, full descriptions)
    // Free: quick meals (4 ingredients max, 3 simple steps, short descriptions)
    const proInstructions = isPro
      ? 'Pro users get restaurant-quality, detailed recipes. Include up to 8 ingredients with precise measurements, and up to 6 steps with professional techniques (temperatures, timing, textures, plating). Descriptions can be up to 15 words.'
      : 'Keep it simple. Max 4 ingredients, max 3 short steps. Descriptions under 10 words. Basic home cooking only.';

    // Per-meal calorie targets so the model doesn't undershoot
    const mealCalorieTargets = {
      breakfast: Math.round(dailyCalories * 0.25),
      lunch:     Math.round(dailyCalories * 0.30),
      dinner:    Math.round(dailyCalories * 0.35),
      snack:     Math.round(dailyCalories * 0.10),
    };

    const ingredientOverlapLine = `Ingredient efficiency: prioritize reusing ingredients across meals. If spinach is used at breakfast, use the remainder at lunch or dinner. If chicken is used at dinner, use leftovers in tomorrow's lunch. Minimize the number of unique ingredients across the 4 meals.`;
    const batchCookingLine = profile.batch_cooking
      ? `BATCH COOKING MODE: Make dinner yield 3 servings. Schedule the leftovers as Tuesday and Wednesday lunch automatically — label them as 'Leftover: [dinner name]' with identical macros. This reduces daily cooking time significantly.`
      : '';

    // Prompt caching: stable role block cached, volatile dietary block appended uncached
    const _baseSys = isPro
      ? 'You are a professional nutritionist and executive chef. Respond with valid JSON only, no markdown. Pro users deserve restaurant-quality recipes — detailed techniques, precise measurements. NEVER violate dietary restrictions or allergies — this is non-negotiable.'
      : 'You are a professional nutritionist. Respond with valid JSON only, no markdown. Keep instructions simple and concise. NEVER violate dietary restrictions or allergies — this is non-negotiable.';
    const _sysBlocks = [{ type: 'text', text: _baseSys, cache_control: { type: 'ephemeral' } }];
    if (dietaryBlock) _sysBlocks.push({ type: 'text', text: `CRITICAL: ${activeDietRules.split('\n')[0]}` });

    /** Generates and validates ONE day's 4-meal plan. Throws AllergyViolationError
     * if a generated meal contains a declared allergen. Never trusts AI totals —
     * calorie/macro/cost sums are always recomputed here.
     * `repairContext` is set only on a repair retry (single-day mode's
     * planRepairEngine.runCombinedDayRepair, or week mode's planRepairEngine.
     * runCombinedWeeklyRepair repairing one day): { attempt, maxAttempts,
     * budget: {previousCostUSD, budgetUSD}|null, macro: {deviations,
     * worstAxis}|null } — budget/macro are present only when that specific
     * constraint failed the previous attempt (see buildRepairBlock). It
     * never relaxes allergy/diet/cooking-time constraints — those stay
     * identical on every attempt; only the repair instruction changes.
     * `dailyGuidanceUSD`, when set, overrides the fixed price-tier `dailyBudget`
     * prompt figure — week mode passes the ADAPTIVE remaining-budget/
     * remaining-days share here (see budgetEngine.nextDayGuidanceUSD) instead
     * of a rigid 1/7 split. It is guidance only; no day is hard-rejected for
     * missing it — the final weekly total is what's actually enforced. */
    async function generateDayMealPlan(dayDate, variety, repairContext, dailyGuidanceUSD, applyGenerationContract) {
      const { todayCuisine, todayProtein, randomSeed } = variety;

      // Phase 3E — the deterministic ingredient contract. Applied only in
      // week mode, and only when CERTIFICATION_GATE is 'shadow' or 'on' (the
      // caller passes CERTIFICATION_GATE_ACTIVE). 'off' -> no prompt change.
      // Single-day / swap prompts are untouched this phase. Describes the
      // contract; the certification engine stays authoritative.
      const generationContractBlock = applyGenerationContract
        ? '\n' + generationVocabulary.buildGenerationContractBlock() + '\n'
        : '';

      // Combined repair block — carries EVERY constraint that failed on the
      // previous attempt (budget and/or macro) in one prompt, since both
      // ride the same bounded repair loop (see planRepairEngine.js). Never
      // mentions a constraint that already passed.
      const budgetRepairBlock = buildRepairBlock(repairContext, currency);

      const effectiveDailyBudget   = dailyGuidanceUSD != null ? dailyGuidanceUSD.toFixed(2) : dailyBudget;
      const effectivePerMealBudget = dailyGuidanceUSD != null ? (dailyGuidanceUSD / 4).toFixed(2) : perMealBudget;

      const fullPlanPrompt = `${dietaryBlock}${allergyBlock}${budgetRepairBlock}${ingredientOverlapLine}

Generate a practical, delicious daily meal plan for ${name} on ${dayDate}.

Cuisine style: ${todayCuisine}. Variety seed: ${randomSeed}. Suggested protein for ONE meal only: ${todayProtein} (use different proteins across other meals for variety — no protein should appear in more than 2 of the 4 meals).
Use real, everyday supermarket ingredients. Meals must be realistic for a home cook.

User profile:
- Goal: ${goal}
- Daily calorie target: ${dailyCalories} kcal TOTAL (Protein ${dailyProtein}g / Carbs ${dailyCarbs}g / Fat ${dailyFat}g)
- PER-MEAL CALORIE TARGETS (each meal MUST hit within ±15% of its target):
  Breakfast: ${mealCalorieTargets.breakfast} kcal | Lunch: ${mealCalorieTargets.lunch} kcal | Dinner: ${mealCalorieTargets.dinner} kcal | Snack: ${mealCalorieTargets.snack} kcal
- PER-MEAL MACRO TARGETS (aim within ±15% of each meal's target — the daily totals across all 4 meals matter most):
  Breakfast: protein ${mealMacroTargets.breakfast.protein}g / carbs ${mealMacroTargets.breakfast.carbs}g / fat ${mealMacroTargets.breakfast.fat}g
  Lunch: protein ${mealMacroTargets.lunch.protein}g / carbs ${mealMacroTargets.lunch.carbs}g / fat ${mealMacroTargets.lunch.fat}g
  Dinner: protein ${mealMacroTargets.dinner.protein}g / carbs ${mealMacroTargets.dinner.carbs}g / fat ${mealMacroTargets.dinner.fat}g
  Snack: protein ${mealMacroTargets.snack.protein}g / carbs ${mealMacroTargets.snack.carbs}g / fat ${mealMacroTargets.snack.fat}g
  Do not chase calories at the expense of these — a meal that hits its calorie target with the wrong protein/carb/fat mix does not satisfy the user's goal.
- Cooking skill: ${cookingSkill}
- Max time per meal: ${cookingTimeMinutes} min
- STRICT DAILY BUDGET: ${currency} ${effectiveDailyBudget} total. Each meal max ${currency} ${effectivePerMealBudget}. estimatedCost across all 4 meals MUST NOT exceed ${currency} ${effectiveDailyBudget}.
- User's price tier: ${priceTierLabel}. Adjust ingredient quality and brand expectations accordingly — Budget means value supermarket staples, Premium means quality cuts and fresh produce.

 ${batchCookingLine ? batchCookingLine + '\n\n' : ''}${avoidBlock}

 ${proInstructions}

LANGUAGE: Write ALL meal names, descriptions, and ingredient names in ${languageName}. JSON keys stay in English.${languageName === 'English' ? ' Use American English spelling (e.g. "pita" not "pitta", "yogurt" not "yoghurt").' : ''}

Generate exactly 4 meals: breakfast, lunch, dinner, snack.
 ${dietaryBlock ? `Remember: ${activeDietRules.split('\n')[0]}` : ''}

${ingredientUnitRule}
${generationContractBlock}
Respond ONLY with valid JSON (no markdown fences, no extra text):
{
  "meals": [
    ${mealSchema},
    ${mealSchema},
    ${mealSchema},
    ${mealSchema}
  ],
  "nutritionNote": "string (short, in ${languageName})"
}`;

      const completion = await callAnthropicWithSpendCap({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: isPro ? 6000 : 4000,
        system: _sysBlocks,
        messages: [{ role: 'user', content: fullPlanPrompt }]
      });
      if (completion.usage?.cache_read_input_tokens || completion.usage?.cache_creation_input_tokens) {
        log.info(`[meal cache] hit=${completion.usage.cache_read_input_tokens||0} write=${completion.usage.cache_creation_input_tokens||0}`);
      }

      const rawText = completion.content[0].text;
      logger.debug('[meal] AI response chars: ' + rawText.length);

      let mealPlan;
      try {
        mealPlan = parseJsonResponse(rawText);
      } catch(parseErr) {
        // Retry once with a simpler prompt
        console.warn('[meal] Parse failed, retrying with explicit JSON request...');
        const retryCompletion = await callAnthropicWithSpendCap({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          system: [{ type: 'text', text: 'You are a JSON API. Output only valid JSON, nothing else.', cache_control: { type: 'ephemeral' } }],
          messages: [
            { role: 'user', content: fullPlanPrompt },
            { role: 'assistant', content: rawText },
            { role: 'user', content: 'Your response was not valid JSON. Output ONLY the JSON object, starting with { and ending with }, no other text.' }
          ]
        });
        mealPlan = parseJsonResponse(retryCompletion.content[0].text);
      }

      if (languageName === 'English' && Array.isArray(mealPlan.meals)) {
        for (const meal of mealPlan.meals) {
          meal.name = normalizeSpelling(meal.name);
          meal.description = normalizeSpelling(meal.description);
        }
      }

      // ── Macro sanity check + daily sums — computed in code, never trusted from the model ──
      if (mealPlan.meals) {
        const sums = { calories: 0, protein: 0, carbs: 0, fat: 0, cost: 0, unknownEstimatedCostUSD: 0, unknownIngredientCount: 0, allCostsVerified: true };
        for (const meal of mealPlan.meals) {
          const p = Number(meal.protein) || 0;
          const c = Number(meal.carbs)   || 0;
          const f = Number(meal.fat)     || 0;
          const stated     = Number(meal.calories) || 0;
          const calculated = p * 4 + c * 4 + f * 9;
          if (Math.abs(stated - calculated) > 100) {
            log.warn(`[macro-check] meal "${meal.name}" calories stated ${stated} calculated ${calculated}`);
          }
          sums.calories += stated;
          sums.protein  += p;
          sums.carbs    += c;
          sums.fat      += f;
          const priced   = await calculateMealCost(meal.ingredients);
          meal.cost      = priced.totalUSD;
          meal.costConfidence = priced.allVerified ? 'verified' : 'estimated';
          meal.unknownEstimatedCostUSD = priced.unknownEstimatedCostUSD;
          meal.unknownIngredientCount = priced.unknownIngredientCount;
          sums.cost     += meal.cost;
          sums.unknownEstimatedCostUSD += priced.unknownEstimatedCostUSD;
          sums.unknownIngredientCount  += priced.unknownIngredientCount;
          if (!priced.allVerified) sums.allCostsVerified = false;
        }
        mealPlan.totalCalories = Math.round(sums.calories);
        mealPlan.totalProtein  = Math.round(sums.protein);
        mealPlan.totalCarbs    = Math.round(sums.carbs);
        mealPlan.totalFat      = Math.round(sums.fat);
        mealPlan.totalCost     = Math.round(sums.cost * 100) / 100;
        mealPlan.totalCostConfidence = sums.allCostsVerified ? 'verified' : 'estimated';
        // Dollar magnitude of the unverified portion — lets the client (or a
        // future stricter Budget Engine rule) distinguish "one cheap unknown
        // spice" from "an expensive protein silently priced at the $0.50
        // fallback" instead of relying on totalCostConfidence's all-or-
        // nothing verified/estimated flag. See pricing.js priceIngredients.
        mealPlan.totalUnknownEstimatedCostUSD = Math.round(sums.unknownEstimatedCostUSD * 100) / 100;
        // Budget certification signal (see budgetEngine.classifyBudgetStatus)
        // — a COUNT, not a dollar figure: the $0.50 fallback's own dollar
        // value is not a trustworthy risk measure (that's the whole bug this
        // gate exists to close), so certification keys off whether ANY line
        // item used the flat guess at all.
        mealPlan.totalUnknownIngredientCount = sums.unknownIngredientCount;
      }

      // ── Allergy enforcement — server-side scan after AI generation ──────────
      if (allergies.length > 0 && mealPlan.meals) {
        const lowerAllergies = allergies.map(a => a.toLowerCase());
        for (const meal of mealPlan.meals) {
          const haystack = [
            meal.name || '',
            meal.description || '',
            ...(meal.ingredients || []).map(i => i.name || '')
          ].join(' ').toLowerCase();
          // Whole-word/phrase match so "nut" doesn't false-positive on ingredients
          // that merely contain "nut" as a substring. Examples:
          //   allergy "nut"       + haystack "coconut curry"        -> no match
          //   allergy "nut"       + haystack "walnut brownies"      -> no match
          //   allergy "nut"       + haystack "pumpkin nutmeg soup"  -> no match
          //   allergy "nut"       + haystack "glazed doughnut"      -> no match
          //   allergy "nut"       + haystack "mixed nuts"           -> match ("nuts")
          //   allergy "nut"       + haystack "roasted nut medley"   -> match
          //   allergy "tree nut"  + haystack "tree nut butter"      -> match
          //   allergy "shellfish" + haystack "shellfish stock"      -> match
          const match = lowerAllergies.find(a => {
            const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`\\b${escaped}s?\\b`);
            return pattern.test(haystack);
          });
          if (match) throw new AllergyViolationError(match, meal.name);
        }
      }

      return mealPlan;
    }

    /** Fetches and attaches an Unsplash photo to each meal, best-effort. */
    async function attachMealImages(meals) {
      if (!process.env.UNSPLASH_ACCESS_KEY || !meals) return;
      await Promise.all(meals.map(async (meal) => {
        try {
          const q = encodeURIComponent((meal.imageKeyword || meal.name) + ' dish plated food photography');
          const imgRes = await fetch(`https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape`, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } });
          const imgData = await imgRes.json();
          if (imgData.results?.[0]) meal.image_url = imgData.results[0].urls.small;
        } catch(e) { /* keep default */ }
      }));
    }

    if (weekStart) {
      // ═══════════════════════════════════════════════════════════════════════
      // WEEK MODE — 1 generation credit unlocks a full 7-day plan
      // (21 meals + snacks), matching the marketing promise and the
      // 7-day grid on meal-planner.html.
      // ═══════════════════════════════════════════════════════════════════════
      const days = [];
      const dayVarieties = []; // kept per index so a week-level repair can regenerate a day with the same cuisine/protein context
      let prevCuisine = null;
      const budgetTelemetryId = session?.userId || 'anon';
      // Random, ephemeral correlation key for this one generation request's
      // budget_* events only — never derived from userId/email/IP/session/
      // diet/allergies/ingredients. Generated once per request, never
      // per-attempt, so a whole attempt->retry->outcome journey can be
      // reconstructed from analytics later (see logBudgetAttempt).
      const weekRequestId = randomUUID();
      if (!budgetEnforceable) {
        await db.logEvent('budget_enforcement_skipped_currency', { currency, userId: budgetTelemetryId }, '');
      }

      // Phase 3E — unsupported-currency PRE-GENERATION boundary. Only bites
      // when the certification gate is EFFECTIVELY 'on' (i.e. hard-gate
      // production authorized — currently unreachable). A week whose currency
      // is not enforceable by budgetEngine.isBudgetEnforceable() can never be
      // package-budget-certified, so under hard mode it must fail BEFORE any
      // Anthropic generation call. No FX conversion. 'off' legacy behaviour is
      // untouched; 'shadow' stays non-blocking (handled post-generation).
      if (CERTIFICATION_GATE_MODE === certificationGate.GATE_MODE.ON && !certificationGate.isCurrencyCertifiable(currency)) {
        await db.logEvent('certification_gate_result', {
          weekRequestId, requestedMode: CERTIFICATION_GATE_REQUESTED, mode: CERTIFICATION_GATE_MODE,
          status: certificationGate.GATE_STATUS.FAILED,
          failureReason: certificationGate.FAILURE_REASON.UNSUPPORTED_CURRENCY,
          stage: 'preflight', hardGateComplete: certificationGate.HARD_GATE_PRODUCTION_AUTHORIZED,
        }, '');
        return res.status(422).json({
          error: 'certification_failed',
          retry: false,
          reason: certificationGate.FAILURE_REASON.UNSUPPORTED_CURRENCY,
          message: "Verified weekly plans aren't available for this currency yet.",
        });
      }

      // Phase 3E-C3A-3 — gate-owned restriction PREFLIGHT. Runs BEFORE the
      // generation loop. server.js hands the raw diet/allergen channels to the
      // gate, which performs the single normalization boundary and returns a
      // request-scoped { normalized, preflight } context. OBSERVATIONAL ONLY
      // while HARD_GATE_PRODUCTION_AUTHORIZED is false: an unsupported hard
      // restriction is detected and logged here but NEVER rejects — generation,
      // certification, quota and save all proceed exactly as before. The
      // context's `normalized` is handed back to runCertificationGate below so
      // normalizeRestrictions runs exactly once per request. server.js treats
      // `normalized` as opaque and never interprets it.
      let gateRestrictionContext = null;
      if (CERTIFICATION_GATE_ACTIVE) {
        gateRestrictionContext = certificationGate.preflightRestrictions({ diets: dietaryPrefs, allergens: allergies });
        await db.logEvent('certification_gate_preflight', {
          weekRequestId, requestedMode: CERTIFICATION_GATE_REQUESTED, mode: CERTIFICATION_GATE_MODE,
          stage: 'pregen', ...gateRestrictionContext.preflight,
        }, '');
      }

      // Adaptive per-day guidance only — NOT a hard per-day cap. A $60/week
      // budget does not mean every day must cost <= $8.57; Monday can run
      // $11 as long as later days come in cheaper so the FINAL weekly total
      // (checked below, after every day is generated) still fits. Each day
      // is generated exactly once here — no per-day retry loop — and
      // remainingBudgetUSD/remainingDays just make the guidance handed to
      // later days reflect what's actually left, tightening if earlier days
      // ran high.
      let remainingBudgetUSD = budget;
      let remainingDays = 7;

      for (let i = 0; i < 7; i++) {
        const dayDate = addDaysToDateStr(weekStart, i);
        const variety = pickDayVariety(prevCuisine);
        prevCuisine = variety.todayCuisine;
        dayVarieties.push(variety);

        const dayGuidanceUSD = budgetEnforceable
          ? budgetEngine.nextDayGuidanceUSD(remainingBudgetUSD, remainingDays)
          : undefined;

        let dayMealPlan;
        try {
          dayMealPlan = await generateDayMealPlan(dayDate, variety, null, dayGuidanceUSD, CERTIFICATION_GATE_ACTIVE);
        } catch (err) {
          if (err instanceof AllergyViolationError) {
            await db.logEvent('allergy_violation_detected', { allergen: err.allergen, meal: err.mealName, userId: session?.userId || 'anon' }, '');
            logger.warn(`[allergy] Violation detected: "${err.allergen}" in "${err.mealName}" (week day ${i + 1}/${dayDate})`);
            return res.status(400).json({
              error: 'allergy_violation', retry: true, allergen: err.allergen,
              message: `Generated meal "${err.mealName}" may contain "${err.allergen}". Please regenerate your plan.`,
              day: dayDate
            });
          }
          throw err;
        }

        await attachMealImages(dayMealPlan.meals);
        days.push({ date: dayDate, dayName: getDayNameFromDate(dayDate), ...dayMealPlan });

        if (budgetEnforceable) {
          remainingBudgetUSD -= (dayMealPlan.totalCost || 0);
          remainingDays -= 1;
        }
      }

      // ── THE weekly budget invariant — mandatory, runs even though no
      // individual day above was hard-rejected. If the authoritative weekly
      // total is over budget, repair the single most expensive day (up to
      // MAX_WEEKLY_REPAIR_ROUNDS times) and re-check. A week that still
      // doesn't fit after that is a controlled failure: it is never saved
      // or returned as successful. ──────────────────────────────────────────
      // Hoisted so the weekly totals block below (after this if) can read
      // the settled evaluation for budget certification — see
      // budgetEngine.classifyBudgetStatus. Stays null for non-enforceable
      // currencies, handled explicitly below.
      //
      // ONE bounded repair loop covers both budget and macro for EVERY
      // currency (see planRepairEngine.runCombinedWeeklyRepair) — same
      // MAX_WEEKLY_REPAIR_ROUNDS ceiling regardless of budgetEnforceable, no
      // macro loop stacked alongside it. Macro targeting is gram-based, not
      // currency-gated, so it must not depend on budget enforcement — only
      // the budget SIDE of the evaluation is skipped for non-USD
      // (budgetEnforceable: false below), never a second/smaller ceiling.
      // `succeeded` reflects only the budget invariant, unchanged from
      // Budget Engine v1 — always true when !budgetEnforceable, so a
      // macro-only miss can never hard-fail a non-USD week either.
      let settledWeeklyEvaluation = null;
      const weekAttemptLogger = budgetEnforceable ? logBudgetAttempt('week', weekRequestId) : null;
      try {
        const { days: settledDays, weeklyBudgetEval, dayMacroEvals, attempts, succeeded } = await planRepairEngine.runCombinedWeeklyRepair(
          days,
          budget,
          dailyMacroTargets,
          {
            budgetEnforceable,
            getDayCost: (d) => d.totalCost || 0,
            regenerateDay: async (dayIndex, repairContext) => {
              const oldDay = days[dayIndex];
              try {
                const repairedPlan = await generateDayMealPlan(oldDay.date, dayVarieties[dayIndex], repairContext, undefined, CERTIFICATION_GATE_ACTIVE);
                await attachMealImages(repairedPlan.meals);
                return { date: oldDay.date, dayName: oldDay.dayName, ...repairedPlan };
              } catch (err) {
                if (err instanceof AllergyViolationError) err.day = oldDay.date;
                throw err;
              }
            },
            onAttempt: weekAttemptLogger
              ? (attempt, weeklyBudgetEval2, dayMacroEvals2, maxAttempts) => weekAttemptLogger(attempt, weeklyBudgetEval2, maxAttempts)
              : undefined,
          }
        );

        if (budgetEnforceable) {
          await logBudgetOutcome('week', weekRequestId, succeeded, attempts, weeklyBudgetEval);
          if (!succeeded) {
            return res.status(422).json(budgetUnreachableResponse(weeklyBudgetEval));
          }
        }
        days.length = 0;
        days.push(...settledDays);
        settledWeeklyEvaluation = weeklyBudgetEval;
        // Attach an honest per-day macro status — never "certified"; these
        // stay model-generated estimates (see macroEngine.js). Populated
        // regardless of currency: macro repair/evaluation is currency-
        // independent.
        days.forEach((d, i) => {
          const ev = dayMacroEvals[i];
          d.macroStatus = ev.status;
          d.macroDeviations = ev.deviations;
          d.macroWorstAxis = ev.worstAxis;
        });
      } catch (err) {
        if (err instanceof AllergyViolationError) {
          await db.logEvent('allergy_violation_detected', { allergen: err.allergen, meal: err.mealName, userId: session?.userId || 'anon' }, '');
          logger.warn(`[allergy] Violation detected: "${err.allergen}" in "${err.mealName}" (week repair, day ${err.day || 'unknown'})`);
          return res.status(400).json({
            error: 'allergy_violation', retry: true, allergen: err.allergen,
            message: `Generated meal "${err.mealName}" may contain "${err.allergen}". Please regenerate your plan.`,
            day: err.day
          });
        }
        throw err;
      }

      // ══════════════════════════════════════════════════════════════════════
      // Phase 3E — DETERMINISTIC CERTIFICATION GATE (week mode only).
      //   off    -> this whole block is skipped: current prompt, current
      //             acceptance, no telemetry.
      //   shadow -> assess + emit telemetry. Zero repair calls. Never blocks.
      //   on     -> assess + at most ONE bounded repair driven by the
      //             deterministic failures, then accept the certified week or
      //             fail with 422. Unsupported currency -> hard fail (never
      //             accepted as certified). NOT the complete Mealzy hard gate:
      //             deterministic dietary/allergen enforcement is absent, so
      //             the result carries hardGateComplete:false.
      // Runs after the budget/macro repair loop has settled `days`, before
      // weekly totals / quota / persistence, so a repaired week flows through
      // the same downstream code and nothing uncertified is ever saved.
      // certificationAssessment.assessWeek stays the sole authority.
      // ══════════════════════════════════════════════════════════════════════
      let certificationResult = null;
      if (CERTIFICATION_GATE_ACTIVE) {
        // CERTIFICATION_GATE_MODE is the EFFECTIVE mode — resolveEffectiveMode
        // guarantees it is never 'on' unless HARD_GATE_PRODUCTION_AUTHORIZED,
        // so today gateOn is always false (requested 'on' runs as 'shadow').
        const gateOn = CERTIFICATION_GATE_MODE === certificationGate.GATE_MODE.ON;
        const requestedBudgetCents = budgetEngine.toCents(budget);

        // Built (and only ever invoked) when mode is 'on'. One paid Anthropic
        // call: the deterministic failures + instruction go in, corrected
        // ingredient rows come back and are spliced into `days` with every
        // other meal field preserved; per-day cost is then refreshed.
        const generateRepairedWeek = async (gateResult, instruction) => {
          const compactWeek = days.map((d, di) => ({
            day: di + 1,
            meals: (d.meals || []).map((m, mi) => ({
              meal: mi + 1,
              ingredients: (m.ingredients || []).map(ing => ({
                name: ing.name, amountValue: ing.amountValue, amountUnit: ing.amountUnit,
              })),
            })),
          }));

          const repairPrompt = `${dietaryBlock}${allergyBlock}
${generationVocabulary.buildGenerationContractBlock()}

${instruction}

CURRENT PLAN (JSON):
${JSON.stringify({ days: compactWeek })}

Respond ONLY with valid JSON, same shape, ingredient arrays only (keep the same number of ingredients per meal):
{ "days": [ { "day": number, "meals": [ { "meal": number, "ingredients": [ { "name": string, "amountValue": number, "amountUnit": "g|ml|count" } ] } ] } ] }`;

          const completion = await callAnthropicWithSpendCap({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4000,
            system: [{ type: 'text', text: 'You are a JSON API. Output only valid JSON — no markdown, no explanation. Only change the ingredients the verifier rejected.', cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: repairPrompt }],
          });
          const parsed = parseJsonResponse(completion.content[0].text);

          const repairedDays = days.map(d => ({
            ...d,
            meals: (d.meals || []).map(m => ({ ...m, ingredients: [...(m.ingredients || [])] })),
          }));
          for (const rd of (Array.isArray(parsed.days) ? parsed.days : [])) {
            const dIdx = Number(rd.day) - 1;
            if (!repairedDays[dIdx]) continue;
            for (const rm of (Array.isArray(rd.meals) ? rd.meals : [])) {
              const mIdx = Number(rm.meal) - 1;
              const target = repairedDays[dIdx].meals[mIdx];
              if (!target || !Array.isArray(rm.ingredients)) continue;
              if (rm.ingredients.length !== target.ingredients.length) continue; // structure must be preserved
              target.ingredients = rm.ingredients.map((ri, k) => ({
                ...target.ingredients[k],
                name: typeof ri.name === 'string' && ri.name.trim() ? ri.name.trim() : target.ingredients[k].name,
                amountValue: Number.isFinite(Number(ri.amountValue)) && Number(ri.amountValue) > 0 ? Number(ri.amountValue) : target.ingredients[k].amountValue,
                amountUnit: typeof ri.amountUnit === 'string' && ri.amountUnit.trim() ? ri.amountUnit.trim() : target.ingredients[k].amountUnit,
              }));
            }
          }

          for (const d of repairedDays) {
            let cost = 0, unknownCount = 0;
            for (const m of d.meals || []) {
              const priced = await calculateMealCost(m.ingredients);
              m.cost = priced.totalUSD;
              m.costConfidence = priced.allVerified ? 'verified' : 'estimated';
              cost += priced.totalUSD;
              unknownCount += priced.unknownIngredientCount;
            }
            d.totalCost = Math.round(cost * 100) / 100;
            d.totalUnknownIngredientCount = unknownCount;
          }
          return repairedDays;
        };

        let gateOutcome = null;
        try {
          gateOutcome = await certificationGate.runCertificationGate({
            days,
            requestedBudgetCents,
            currency,
            mode: CERTIFICATION_GATE_MODE,
            // Phase 3E-C3A-3 — reuse the pre-generation preflight's normalized
            // object so normalizeRestrictions runs exactly once per request.
            restrictionContext: gateRestrictionContext,
            // Phase 3E-C1 — SHADOW-ONLY dietary/allergen observation. Kept as the
            // gate's internal-normalization fallback for direct callers; the
            // context above wins when present. They never affect acceptance,
            // repair, persistence, quota, or status codes.
            diets: dietaryPrefs,
            allergens: allergies,
            generateRepairedWeek: gateOn ? generateRepairedWeek : undefined,
            onEvent: (name, payload) => {
              db.logEvent(`certification_gate_${name}`, { weekRequestId, requestedMode: CERTIFICATION_GATE_REQUESTED, mode: CERTIFICATION_GATE_MODE, ...payload }, '').catch(() => {});
            },
          });
        } catch (gateErr) {
          logger.error('[certification-gate] unexpected error:', { message: gateErr.message });
          if (gateOn) {
            return res.status(422).json({ error: 'certification_failed', retry: true, message: "Mealzy couldn't build a fully verified plan this time. Please try generating again." });
          }
        }

        if (gateOutcome) {
          await db.logEvent('certification_gate_result', {
            weekRequestId, requestedMode: CERTIFICATION_GATE_REQUESTED, mode: CERTIFICATION_GATE_MODE,
            stage: 'postgen', status: gateOutcome.status,
            repaired: gateOutcome.repaired, repairAttempts: gateOutcome.repairAttempts,
            failureReason: gateOutcome.failureReason || null,
            // Phase 3E-C3A-2 / C3B combined shape — all composed inside runCertificationGate.
            certified: gateOutcome.certified,
            acceptable: gateOutcome.acceptable,
            enforced: gateOutcome.enforced,
            hardGateComplete: gateOutcome.hardGateComplete,
            deterministicStatus: gateOutcome.deterministicStatus,
            weekFailures: gateOutcome.gateResult.weekFailures,
            failingIngredientCount: gateOutcome.gateResult.failingIngredients.length,
            // Phase 3E-C1 — SHADOW dietary/allergen observation. Enum statuses,
            // counts and canonical ids only; no raw restriction/allergy text.
            dietSafety: gateOutcome.dietSafety || null,
          }, '');

          // Phase 3E-C3B — the SOLE certification rejection boundary. Keyed
          // ONLY on the gate's own combined verdict: enforced (this run was in
          // authorized hard mode) AND !acceptable. NOT on status, NOT on
          // certified, NOT on dietSafetyCertified, NOT on preflight — server.js
          // never re-derives the verdict. `enforced` is false in every reachable
          // production mode, so this never fires today.
          if (gateOutcome.enforced && !gateOutcome.acceptable) {
            // No plan persisted, no quota consumed (both happen further below).
            return res.status(422).json({
              error: 'certification_failed',
              retry: gateOutcome.retry === true,       // frozen retry hint from the gate
              reason: gateOutcome.failureReason || 'uncertified',
              message: gateOutcome.failureReason === certificationGate.FAILURE_REASON.UNSUPPORTED_CURRENCY
                ? "Verified weekly plans aren't available for this currency yet."
                : "Mealzy couldn't build a fully verified plan this time. Please try generating again.",
            });
          }
          if (gateOutcome.enforced && gateOutcome.repaired && Array.isArray(gateOutcome.days)) {
            days.length = 0;
            days.push(...gateOutcome.days);
          }

          // Phase 3E-C3C — the IMMUTABLE / VERSIONED historical certification
          // snapshot. Frozen 15-key schema. server.js is a RECORDER: every value
          // is copied verbatim from the authoritative gate outcome or from
          // server-owned mode resolution (requestedMode / effectiveMode /
          // downgraded). Nothing here is recomputed or reinterpreted. This one
          // object is what both the generation response and db.savePlan store,
          // so response and persisted snapshot are byte-identical (same ref).
          const _ds = gateOutcome.dietSafety || {};
          certificationResult = {
            certificationVersion: gateOutcome.certificationVersion,
            dietSubstrateVersion: gateOutcome.dietSubstrateVersion,
            certifiedAt: gateOutcome.certifiedAt,

            requestedMode: CERTIFICATION_GATE_REQUESTED,
            effectiveMode: CERTIFICATION_GATE_MODE,
            downgraded: _gateModeResolution.downgraded,
            enforced: gateOutcome.enforced,

            status: gateOutcome.status,
            certified: gateOutcome.certified,
            acceptable: gateOutcome.acceptable,
            hardGateComplete: gateOutcome.hardGateComplete,

            repaired: gateOutcome.repaired,
            repairAttempts: gateOutcome.repairAttempts,

            deterministicStatus: gateOutcome.deterministicStatus,

            // Frozen 12-key projection of the gate's privacy-safe dietary
            // summary — copies gate values, drops the gate-internal nested
            // dietSubstrateVersion (lifted to top level above). No raw
            // restrictions, no raw ingredient names.
            dietSafety: {
              observationalOnly: _ds.observationalOnly,
              dietSafetyCertified: _ds.dietSafetyCertified,
              dietSafetyStatus: _ds.dietSafetyStatus,
              supportedDietCount: _ds.supportedDietCount,
              supportedAllergenCount: _ds.supportedAllergenCount,
              preferenceOnlyCount: _ds.preferenceOnlyCount,
              unsupportedRestrictionCount: _ds.unsupportedRestrictionCount,
              dietViolationCount: _ds.dietViolationCount,
              allergenViolationCount: _ds.allergenViolationCount,
              unresolvedSafetyCount: _ds.unresolvedSafetyCount,
              failingCanonicalIngredientIds: _ds.failingCanonicalIngredientIds,
              unsupportedReasons: _ds.unsupportedReasons,
            },
          };
        }
      }

      // ── Weekly totals — sums and per-day averages computed in code, never
      // trusted from the model, AFTER any week-level budget repair above so
      // these always reflect the final, actually-saved/returned days. ──────
      const weeklyTotals = days.reduce((acc, d) => {
        acc.totalCalories += d.totalCalories || 0;
        acc.totalProtein  += d.totalProtein  || 0;
        acc.totalCarbs    += d.totalCarbs    || 0;
        acc.totalFat      += d.totalFat      || 0;
        acc.totalCost     += d.totalCost     || 0;
        acc.unknownIngredientCount += d.totalUnknownIngredientCount || 0;
        return acc;
      }, { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, totalCost: 0, unknownIngredientCount: 0 });
      weeklyTotals.totalCost   = Math.round(weeklyTotals.totalCost * 100) / 100;
      weeklyTotals.avgCalories = Math.round(weeklyTotals.totalCalories / 7);
      weeklyTotals.avgProtein  = Math.round(weeklyTotals.totalProtein  / 7);
      weeklyTotals.avgCarbs    = Math.round(weeklyTotals.totalCarbs    / 7);
      // Budget certification — see budgetEngine.classifyBudgetStatus. Uses
      // the FINAL settled weekly evaluation (after any week-level repair),
      // never triggers a further retry itself.
      weeklyTotals.budgetStatus = budgetEnforceable
        ? budgetEngine.classifyBudgetStatus({
            withinBudget: settledWeeklyEvaluation ? settledWeeklyEvaluation.withinBudget : true,
            unknownIngredientCount: weeklyTotals.unknownIngredientCount,
          })
        : budgetEngine.BUDGET_STATUS.NOT_ENFORCED;
      weeklyTotals.avgFat      = Math.round(weeklyTotals.totalFat      / 7);
      // Week-level macro status — the average day against the daily target,
      // never "certified" (see macroEngine.js: these stay model-generated
      // estimates). Individual days keep their own macroStatus above; this
      // is the holistic week view.
      {
        const weeklyMacroEval = macroEngine.evaluateMacros(
          { protein: weeklyTotals.avgProtein, carbs: weeklyTotals.avgCarbs, fat: weeklyTotals.avgFat },
          dailyMacroTargets
        );
        weeklyTotals.macroStatus = weeklyMacroEval.status;
        weeklyTotals.macroDeviations = weeklyMacroEval.deviations;
        weeklyTotals.macroWorstAxis = weeklyMacroEval.worstAxis;
      }

      // ── Weekly PURCHASE economics (Phase 2) — the authoritative weekly
      // budget number. Aggregates the whole week's ingredients by canonical
      // identity, rounds each up to real package sizes, and prices it in
      // integer cents (see groceryAggregation.buildWeeklyPurchasePlan). This
      // is SEPARATE from weeklyTotals.totalCost (the legacy consumed-quantity
      // estimate, kept for the repair loop and the grocery UI) and from
      // weeklyTotals.budgetStatus (which certifies that legacy number). A
      // week is only purchaseBudgetStatus === 'purchase_certified' when every
      // required ingredient has certification-grade purchase pricing AND the
      // certified total fits the budget. Persisted in the plan blob below so
      // a historical plan's purchase economics stay stable.
      {
        const purchasePlan = groceryAgg.buildWeeklyPurchasePlan(
          days.flatMap(d => d.meals || []),
          { budgetCents: budgetEngine.toCents(budget), currency }
        );
        weeklyTotals.coveredPurchaseCostCents = purchasePlan.coveredPurchaseCostCents;
        weeklyTotals.weeklyPurchaseCostCents = purchasePlan.weeklyPurchaseCostCents;
        // null unless every required ingredient has certifiable purchase
        // pricing — a partial subtotal is never the certified estimate.
        weeklyTotals.certifiedEstimatedPurchaseCostCents = purchasePlan.certifiedEstimatedPurchaseCostCents;
        weeklyTotals.purchaseBudgetStatus = purchasePlan.purchaseBudgetStatus;
        weeklyTotals.purchaseCoverage = {
          covered: purchasePlan.coveredIngredientCount,
          uncovered: purchasePlan.uncoveredIngredientCount,
        };
        weeklyTotals.purchasePlan = purchasePlan;
      }

      // Phase 3E — deterministic certification verdict for this week (see the
      // certification gate above). Present in 'shadow' and 'on'; absent in
      // 'off'. `enforced` is true only in 'on'. `hardGateComplete` is false
      // until deterministic dietary/allergen enforcement exists — consumers
      // must not present this as a complete Mealzy hard-certification pass.
      if (certificationResult) weeklyTotals.certification = certificationResult;

      // ── Quota consumption — 1 credit for the whole week, only after every
      // day has passed allergy/macro validation. Errors above never reach here.
      if (isPro) {
        await db.logEvent('generate_plan', { pro: true, weekStart }, '');
      } else if (session) {
        // Unreachable in practice: free/trial sessions are rejected above before
        // reaching week mode. Logged defensively in case that check ever changes.
        await db.logEvent('generate_plan', { userId: session.userId, weekStart }, '');
      } else {
        incrementUsage(ip);
        await db.logEvent('generate_plan', { plan_num: (anonUsage?.count || 0) + 1, weekStart }, '');
      }

      // Save the whole week as one plan row so days can't drift out of sync.
      const weekPlanId = randomUUID();
      if (session) {
        const previousWeekKey = await getPreviousPlanWeekKey(session.userId); // read before save
        try {
          await db.savePlan(weekPlanId, session.userId, { weekStart, days, weeklyTotals, savedAt: new Date().toISOString() });
          await maybeLogWeekReturn(session.userId, previousWeekKey); // only after a successful save
        } catch (saveErr) {
          console.error('[generate-meal] week DB save error (non-fatal):', saveErr);
        }
      }

      // Expose the plan id only when it's actually backed by a saved plan/grocery
      // rows (requires a session — see the `if (session)` savePlan call above).
      // A planId with nothing behind it would send the frontend chasing a 404.
      res.json({ success: true, weekStart, days, weeklyTotals, ...(session ? { planId: weekPlanId } : {}) });

      // Auto-generate and persist each day's grocery list in the background —
      // fire-and-forget so it never slows down or fails the plan response.
      if (session) {
        for (const d of days) {
          if (!d.meals?.length) continue;
          generateGroceryListForMeals({ meals: d.meals, profile, weekStart, day: d.dayName })
            .then(groceryList => db.saveGroceryList(randomUUID(), session.userId, weekPlanId, d.dayName, groceryList))
            .catch(err => console.error('[generate-meal] grocery auto-generate error (non-fatal):', err));
        }
      }

      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SINGLE-DAY MODE (legacy) — used by dashboard.html's "today" widget.
    // Kept unchanged so it doesn't affect the 7-day credit accounting above.
    // ═══════════════════════════════════════════════════════════════════════
    let mealPlan;
    const singleDayBudgetTelemetryId = session?.userId || 'anon';
    // Same requestId contract as week mode's weekRequestId (random,
    // ephemeral, request-scoped) - single-day mode's repair algorithm and
    // convergence questions are out of scope for this observability PR (see
    // report), but it shares logBudgetAttempt/logBudgetOutcome, which now
    // require a real requestId rather than a persistent userId in that slot.
    const singleDayRequestId = randomUUID();
    try {
      // ONE bounded repair loop covers both constraints for EVERY currency
      // (see planRepairEngine.runCombinedDayRepair) — no separate macro
      // retry loop stacked on top, and no smaller ceiling for non-USD.
      // Macro targeting is gram-based, not currency-gated, so it must not
      // depend on budget enforcement — only the budget SIDE of the
      // evaluation is skipped for non-USD (budgetEnforceable: false below).
      // `succeeded` reflects the budget invariant only, unchanged from
      // Budget Engine v1's contract — always true when !budgetEnforceable,
      // so a macro-only miss can never hard-fail a non-USD request either.
      if (!budgetEnforceable) {
        await db.logEvent('budget_enforcement_skipped_currency', { currency, userId: singleDayBudgetTelemetryId }, '');
      }
      const budgetAttemptLogger = budgetEnforceable ? logBudgetAttempt('single_day', singleDayRequestId) : null;
      const { result, budgetEval, macroEval, attempts, succeeded } = await planRepairEngine.runCombinedDayRepair(
        (repairContext) => generateDayMealPlan(date, { todayCuisine, todayProtein, randomSeed }, repairContext),
        {
          budgetEnforceable,
          budgetUSD: dailyBudgetUSD,
          macroTargets: dailyMacroTargets,
          onAttempt: budgetAttemptLogger
            ? (attempt, be, me, maxAttempts) => budgetAttemptLogger(attempt, be, maxAttempts)
            : undefined,
        }
      );
      if (budgetEnforceable) {
        await logBudgetOutcome('single_day', singleDayRequestId, succeeded, attempts, budgetEval);
        if (!succeeded) {
          return res.status(422).json(budgetUnreachableResponse(budgetEval));
        }
      }
      mealPlan = result;
      // Budget certification — evaluated AFTER the repair loop above has
      // already settled the plan; never itself a retry trigger (see
      // budgetEngine.classifyBudgetStatus). NOT_ENFORCED for non-USD,
      // exactly as before — this refactor only changes whether MACRO
      // repair runs for non-USD, never whether budget is enforced.
      mealPlan.budgetStatus = budgetEnforceable
        ? budgetEngine.classifyBudgetStatus({
            withinBudget: budgetEval.withinBudget,
            unknownIngredientCount: mealPlan.totalUnknownIngredientCount || 0,
          })
        : budgetEngine.BUDGET_STATUS.NOT_ENFORCED;
      // Phase 2: single-day mode has no weekly aggregation, so it cannot
      // produce a real purchase-cost certification. Label it explicitly so
      // its consumed-cost-only budgetStatus is never mistaken for the
      // authoritative weekly purchase certification (see budgetEngine
      // PURCHASE_BUDGET_STATUS).
      mealPlan.purchaseBudgetStatus = budgetEnforceable
        ? budgetEngine.PURCHASE_BUDGET_STATUS.NOT_CERTIFIED_SINGLE_DAY
        : budgetEngine.PURCHASE_BUDGET_STATUS.NOT_ENFORCED;
      // Macro status — honest, non-blocking, currency-independent. Never
      // "certified": per-meal protein/carbs/fat stay model-generated
      // estimates, never verified against real ingredient nutrition data
      // (see macroEngine.js).
      mealPlan.macroStatus = macroEval.status;
      mealPlan.macroDeviations = macroEval.deviations;
      mealPlan.macroWorstAxis = macroEval.worstAxis;
    } catch (err) {
      if (err instanceof AllergyViolationError) {
        await db.logEvent('allergy_violation_detected', { allergen: err.allergen, meal: err.mealName, userId: session?.userId || 'anon' }, '');
        logger.warn(`[allergy] Violation detected: "${err.allergen}" in "${err.mealName}"`);
        return res.status(400).json({ error: 'allergy_violation', retry: true, allergen: err.allergen, message: `Generated meal "${err.mealName}" may contain "${err.allergen}". Please regenerate your plan.` });
      }
      throw err;
    }

    // Save to DB server-side before responding so the plan is persisted even if
    // the client navigates away while this fetch is in-flight.
    const planDate = date || new Date().toISOString().split('T')[0];
    const planId   = randomUUID();

    // ── Quota consumption — only now, after the plan has passed allergy/macro
    // validation and is guaranteed to be returned. Errors and rejects above never reach here.
    // Logged-in free-trial users are the one path where the quota record
    // (trial_generations) doubles as the "already generated today" lookup
    // key for plan recovery — recording it before the plan is actually saved
    // would let the DB say "today's plan exists" while no plan does, so that
    // one is deferred until after db.savePlan() succeeds below.
    if (!swap_meal_type) {
      if (isPro) {
        await db.logEvent('generate_plan', { pro: true }, '');
      } else if (!session) {
        incrementUsage(ip);
        await db.logEvent('generate_plan', { plan_num: (anonUsage?.count || 0) + 1 }, '');
      }
    }

    await attachMealImages(mealPlan.meals);

    if (session) {
      const previousWeekKey = await getPreviousPlanWeekKey(session.userId); // read before save
      try {
        await db.savePlan(planId, session.userId, { date: planDate, plan: mealPlan, savedAt: new Date().toISOString() });
        if (!swap_meal_type && !isPro) {
          await db.recordTrialGeneration(session.userId, trialLocalDate, planId);
          await db.logEvent('generate_plan', { userId: session.userId, trialLocalDate }, '');
        }
        await maybeLogWeekReturn(session.userId, previousWeekKey); // only after a successful save
      } catch (saveErr) {
        console.error('[generate-meal] DB save error (non-fatal):', saveErr);
      }
    }

    // Same reasoning as week mode: only expose planId when a session actually
    // backs it with a saved plan/grocery rows.
    res.json({ success: true, date, mealPlan, ...(session ? { planId } : {}) });

    // Auto-generate and persist this day's grocery list in the background —
    // fire-and-forget so it never slows down or fails the plan response.
    if (session && mealPlan.meals?.length) {
      const day = getDayNameFromDate(planDate);
      generateGroceryListForMeals({ meals: mealPlan.meals, profile, weekStart: planDate, day })
        .then(groceryList => db.saveGroceryList(randomUUID(), session.userId, planId, day, groceryList))
        .catch(err => console.error('[generate-meal] grocery auto-generate error (non-fatal):', err));
    }

  } catch(error) {
    if (error.spendCapReached) {
      return res.status(503).json({
        error: 'service_temporarily_unavailable',
        message: 'AI features are temporarily paused due to high demand. Please try again later.'
      });
    }
    console.error('Error generating meal plan:', error);
    res.status(500).json({
      error: 'Something went wrong. Please try again.',
      fallback: generateFallbackMealPlan(req.body.profile)
    });
  }
});

/** Strip markdown fences and extract the first JSON object from AI output */
function parseJsonResponse(text) {
  let s = text.trim();
  // Remove markdown code fences
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  // If there's garbage before the first {
  const start = s.indexOf('{');
  if (start > 0) s = s.slice(start);
  return JSON.parse(s);
}

// British->American spelling fallback in case the AI ignores the prompt instruction.
const SPELLING_VARIANTS = [
  [/pitta/g, 'pita'],
  [/yoghurt/g, 'yogurt'],
];

/** Case-preserving, word-boundary-safe British->American spelling normalization for English meal text. */
function normalizeSpelling(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  for (const [pattern, replacement] of SPELLING_VARIANTS) {
    const re = new RegExp(`\\b${pattern.source}\\b`, 'gi');
    result = result.replace(re, (match) => {
      if (match[0] === match[0].toUpperCase()) {
        return replacement[0].toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// GROCERY LIST
// ════════════════════════════════════════════════════════════════════════════

/** Derive the weekday name (Monday..Sunday) from a YYYY-MM-DD date string. */
function getDayNameFromDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return 'Unspecified';
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
}

/**
 * Reads the ISO week key of a session user's most recently SAVED plan,
 * before a new plan is generated/saved. Must be called before db.savePlan()
 * for the current generation — once that insert lands, "most recent" would
 * be the new plan itself. Returns null for a user with no prior plan (their
 * first-ever generation), which callers use to mean "not a return".
 */
async function getPreviousPlanWeekKey(userId) {
  try {
    const lastPlan = await db.getLastPlanCreatedAt(userId);
    if (!lastPlan?.created_at) return null;
    return getISOWeekKey(new Date(lastPlan.created_at));
  } catch (err) {
    console.error('[week_return] previous-week lookup failed (non-fatal):', err);
    return null;
  }
}

/**
 * Logs `week_return` only after the new plan has been successfully
 * persisted — a failed savePlan() must never produce a false retention
 * event. Fires when `previousWeekKey` (captured via getPreviousPlanWeekKey
 * BEFORE the save, see call sites) differs from the current ISO week; does
 * nothing when previousWeekKey is null (first-ever plan) or unchanged
 * (repeated generation in the same week).
 */
async function maybeLogWeekReturn(userId, previousWeekKey) {
  if (!previousWeekKey) return; // first-ever plan — not a "return"
  try {
    const thisWeek = getISOWeekKey(new Date());
    if (previousWeekKey !== thisWeek) {
      await db.logEvent('week_return', { userId }, '');
    }
  } catch (err) {
    console.error('[week_return] log failed (non-fatal):', err);
  }
}

/**
 * Budget Engine v2 — builds a grocery list directly from the meals' own
 * already-generated, already-priced structured ingredients. No AI call, no
 * invented ingredient set: this is the fix for the gap where Mealzy priced
 * one ingredient set for the budget check and showed the user a different,
 * independently AI-invented one. All aggregation/categorization/pricing
 * logic lives in groceryAggregation.js (pure, unit-tested); this is just
 * the DB-fetching wrapper around it. */
async function buildDeterministicGroceryList({ meals, weekStart, budget, currency, day }) {
  const priceRows = await db.getIngredientPrices();
  return groceryAgg.buildGroceryList(meals, priceRows, { weekStart, budget, currency, day });
}

/**
 * LEGACY FALLBACK ONLY — calls the AI to invent a grocery list from meal
 * names/types. Kept solely for meals whose ingredients predate the
 * amountValue/amountUnit structured contract (see
 * groceryAggregation.isStructuredIngredient) and therefore can't feed the
 * deterministic path above without fabricating quantities. Every meal
 * generated since Budget Engine v1 already satisfies the structured
 * contract, so this path should see decreasing use over time; once no
 * client can submit an unstructured meal (old cached localStorage plans
 * fully cycled out), this function and its call site can be deleted.
 * Do not extend or improve this path — fix the gap by making callers send
 * structured ingredients instead (see /api/generate-grocery-list).
 */
async function generateGroceryListForMealsLegacyAI({ meals, profile, weekStart, day }) {
  const { budget = 100, currency = 'USD', dietaryPrefs = [], allergies = [], language: groceryLang = 'en' } = profile || {};
  const langNames = { en:'English',sv:'Swedish',no:'Norwegian',da:'Danish',de:'German',fr:'French',es:'Spanish',it:'Italian',pt:'Portuguese',nl:'Dutch',ja:'Japanese',fi:'Finnish',pl:'Polish',tr:'Turkish',ko:'Korean',zh:'Chinese',ar:'Arabic',hi:'Hindi',ru:'Russian' };
  const langName  = langNames[groceryLang] || 'English';

  const mealList    = meals.map(m => `- ${m.name} (${m.type})`).join('\n');
  const allergyInfo = allergies.length > 0 ? `ALLERGY WARNING — never include: ${allergies.join(', ')}.` : '';
  const prefInfo    = dietaryPrefs.length > 0 ? `Dietary preferences: ${dietaryPrefs.join(', ')}. All items must comply.` : '';
  const dayLine     = day
    ? `All these meals are for ${day}. Tag every item's "day" field as "${day}".`
    : `Tag each item's "day" field with the day of the week (Monday..Sunday) it is needed for, inferred from the meal list order. If it can't be determined, use "Unspecified".`;
  const exampleDay  = day || 'Monday';

  const unitRule = `Every item's "amountValue"/"amountUnit" MUST use grams (g) for solids, milliliters (ml) for liquids, or count (count) for discrete items — convert from cups/tbsp/oz yourself, never leave it in those units. Vegetables sold by the head or bunch (broccoli, cauliflower, lettuce, kale) MUST be given in grams, never as a "count".`;

  const prompt = `Generate a complete grocery list for the following meals:\n\n${mealList}\n\n${prefInfo}\n${allergyInfo}\n${dayLine}\nBudget: ${currency} ${budget}. Keep total cost at or under this amount.\nWrite all ingredient names in ${langName}. JSON keys stay in English.\nConsolidate duplicate ingredients. Group by category.\n${unitRule}\n\nRespond ONLY with valid JSON:\n{\n  "weekStart": "${weekStart || ''}",\n  "totalCost": 85.50,\n  "budgetAmount": ${budget},\n  "currency": "${currency}",\n  "categories": {\n    "produce": [{ "name": "Spinach", "amount": "200g", "amountValue": 200, "amountUnit": "g", "cost": 2.50, "checked": false, "day": "${exampleDay}" }],\n    "protein": [],\n    "dairy": [],\n    "grains": [],\n    "pantry": [],\n    "frozen": [],\n    "beverages": [],\n    "other": []\n  }\n}`;

  const completion = await callAnthropicWithSpendCap({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    system: 'You are a professional nutritionist. Always respond with valid JSON only, no markdown.',
    messages: [{ role: 'user', content: prompt }]
  });

  const groceryList = parseJsonResponse(completion.content[0].text);
  await groundAndStampGroceryItems(groceryList);
  return groceryList;
}

/** Grounds every item's cost using pricing.js — the SAME unit-aware
 * calculation path used for meal-plan costs (calculateMealCost above). The
 * AI's own guessed "cost" is never treated as authoritative; it is always
 * replaced by the independently-computed costUSD. Also stamps the fields the
 * grocery UI and the item-level PATCH endpoint depend on: a stable id unique
 * within this list, estimatedCost, actualCost (null until the user edits it),
 * priceSource (verified/unknown_ingredient/unsupported_unit/legacy_estimate),
 * and checked. Recomputes groceryList.totalCost from the grounded item costs
 * rather than leaving the AI's own guessed total in place. Mutates in place.
 * LEGACY-FALLBACK-ONLY — see generateGroceryListForMealsLegacyAI. Note this
 * prices each of the AI's own already-consolidated rows once, so it inherits
 * the same unknown-ingredient understatement risk described in
 * groceryAggregation.js if the AI merged an unpriceable ingredient itself;
 * not fixed here since this path is being phased out, not improved. */
async function groundAndStampGroceryItems(groceryList) {
  const priceRows = await db.getIngredientPrices();
  let seq = 0;
  let recomputedTotal = 0;
  for (const items of Object.values(groceryList.categories || {})) {
    for (const item of items || []) {
      const { costUSD, source } = pricing.priceIngredient(item, priceRows);
      item.cost = costUSD;
      item.priceSource = source;
      recomputedTotal += costUSD;
      seq += 1;
      item.id = `g_${String(seq).padStart(3, '0')}`;
      item.estimatedCost = costUSD;
      item.actualCost = null;
      item.checked = !!item.checked;
    }
  }
  groceryList.totalCost = Math.round(recomputedTotal * 100) / 100;
}

/**
 * Public entry point used by all 3 grocery-generation call sites. Routes to
 * the deterministic path (buildDeterministicGroceryList) whenever every
 * supplied meal's ingredients are structured; falls back to the legacy AI
 * generator otherwise (old cached client data, or a caller that didn't send
 * ingredients at all). See groceryAggregation.mealsAreFullyStructured for
 * the exact gate.
 */
async function generateGroceryListForMeals({ meals, profile, weekStart, day }) {
  const { budget = 100, currency = 'USD' } = profile || {};
  if (groceryAgg.mealsAreFullyStructured(meals)) {
    return buildDeterministicGroceryList({ meals, weekStart, budget, currency, day });
  }
  return generateGroceryListForMealsLegacyAI({ meals, profile, weekStart, day });
}

/** Splits a categorized grocery list into one grocery-list object per day, keyed by day name. */
function splitGroceryListByDay(groceryList) {
  const byDay = {};
  const categories = groceryList.categories || {};
  for (const [catName, items] of Object.entries(categories)) {
    for (const item of items || []) {
      const day = item.day || 'Unspecified';
      if (!byDay[day]) {
        byDay[day] = { weekStart: groceryList.weekStart, currency: groceryList.currency, totalCost: 0, categories: {} };
      }
      if (!byDay[day].categories[catName]) byDay[day].categories[catName] = [];
      byDay[day].categories[catName].push(item);
      byDay[day].totalCost += Number(item.cost) || 0;
    }
  }
  return byDay;
}

function requireGrocerySession(req, res, next) {
  return requireSession(req, res, () => {
    req.grocerySession = req.session;
    next();
  });
}

const groceryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're sending requests too fast — wait 60 seconds and try again." },
  keyGenerator: (req) => req.grocerySession.userId,
});

const GROCERY_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

// Historical-plan compatibility (Phase 3A broccoli count->g migration) —
// SCOPED TO THIS ROUTE ONLY. Old stored meal blobs (localStorage
// mealzy_meal_plans, replayed into POST /api/generate-grocery-list by
// public/js/groceries-sync.js) can still carry broccoli as amountUnit:'count'.
// Canonical broccoli is grams-only now, so without this an old plan's broccoli
// would price as an unsupported unit. This rewrites ONLY that one legacy shape
// at this ingestion boundary — using the same frozen 340 g/head assumption the
// broccoli $/g price was derived from — then hands ordinary grams to the
// current pricing path. Everywhere else (groceryAggregation, pricing) a
// broccoli/count is still an honest unit-contract violation; this does not
// change that.
const LEGACY_BROCCOLI_HEAD_GRAMS = 340;
function normalizeLegacyBroccoliCount(ing) {
  if (!ing || ing.amountUnit !== 'count') return ing;
  const name = String(ing.name || '').toLowerCase().trim();
  if (name !== 'broccoli' && name !== 'broccoli florets') return ing;
  const v = Number(ing.amountValue);
  if (!Number.isFinite(v) || v <= 0) return ing;
  return { ...ing, amountValue: v * LEGACY_BROCCOLI_HEAD_GRAMS, amountUnit: 'g' };
}

app.post('/api/generate-grocery-list', requireGrocerySession, requireVerifiedEmail, groceryLimiter, async (req, res) => {
  try {
    const session = req.grocerySession;

    const { profile = {}, meals: rawMeals, weekStart: rawWeekStart, day: rawDay, planId: requestedPlanId } = req.body;

    profile.allergies    = capList(profile.allergies, 20, 40);
    profile.dietaryPrefs = capList(profile.dietaryPrefs, 20, 40);

    // Pass through structured ingredients (validated/bounded) so this route
    // can reach the deterministic grocery path in generateGroceryListForMeals
    // instead of always falling back to the legacy AI generator. amountValue/
    // amountUnit are the only fields aggregation reads — anything else the
    // client sends (e.g. a client-guessed "cost") is dropped, matching the
    // rest of this route's never-trust-client-cost stance.
    const meals = Array.isArray(rawMeals)
      ? rawMeals.slice(0, 50).map(m => ({
          name: sanitise(m?.name, 100),
          type: sanitise(m?.type, 30),
          ingredients: Array.isArray(m?.ingredients)
            ? m.ingredients.slice(0, 30).map(ing => {
                const amountValue = Number(ing?.amountValue);
                return normalizeLegacyBroccoliCount({
                  name: sanitise(ing?.name, 100),
                  amountValue: Number.isFinite(amountValue) && amountValue > 0 ? Math.min(100000, amountValue) : undefined,
                  amountUnit: sanitise(ing?.amountUnit, 20) || undefined,
                });
              })
            : [],
        }))
      : [];
    console.log('[generate-grocery-list debug]', { userId: session.userId, rawMealsLength: Array.isArray(rawMeals) ? rawMeals.length : typeof rawMeals, sanitisedMealsLength: meals.length, rawWeekStart, rawDay });
    if (meals.length === 0) return res.status(400).json({ error: 'Meals array is required' });

    let budget = Number(profile.budget);
    if (Number.isNaN(budget)) budget = 100;
    budget = Math.min(10000, Math.max(1, budget));
    profile.budget = budget;

    const day = GROCERY_DAYS.includes(rawDay) ? rawDay : undefined;
    const weekStart = sanitise(rawWeekStart, 20);

    const groceryList = await generateGroceryListForMeals({ meals, profile, weekStart, day });

    let planId;
    try {
      if (day) {
        // Single-day generate/refresh — reuse the caller's planId only if it
        // already belongs to them, so a spoofed id can't delete/overwrite
        // another user's saved days.
        planId = requestedPlanId || null;
        if (planId) {
          const existingRows = await db.getGroceryListsForPlan(planId);
          if (existingRows.length > 0 && existingRows[0].userId !== session.userId) {
            planId = null;
          }
        }
        if (!planId) planId = randomUUID();
        await db.deleteGroceryListForPlanDay(planId, day, session.userId);
        await db.saveGroceryList(randomUUID(), session.userId, planId, day, groceryList);
      } else {
        planId = randomUUID();
        const byDay = splitGroceryListByDay(groceryList);
        await Promise.all(Object.entries(byDay).map(([d, dayList]) =>
          db.saveGroceryList(randomUUID(), session.userId, planId, d, dayList)
        ));
      }
    } catch (saveErr) {
      console.error('[generate-grocery-list] DB save error (non-fatal):', saveErr);
    }

    res.json({ success: true, groceryList, ...(planId ? { planId } : {}) });

  } catch(error) {
    if (error.spendCapReached) {
      return res.status(503).json({
        error: 'service_temporarily_unavailable',
        message: 'AI features are temporarily paused due to high demand. Please try again later.'
      });
    }
    console.error('Error generating grocery list:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/grocery-list/trial-summary — aggregated running total across every day
// generated so far in a free user's 30-day trial. Unlike week-mode (where 7 days
// share one plan_id and getGroceryListsForPlan covers them), each trial day gets
// its own plan_id, so this pulls across all of them via trial_generations.
app.get('/api/grocery-list/trial-summary', requireSession, async (req, res) => {
  const session = req.session;
  try {
    const lists = await db.getGroceryListsForUserTrial(session.userId);
    const totalCost = Math.round(lists.reduce((sum, l) => sum + (l.totalCost || 0), 0) * 100) / 100;
    res.json({
      success: true,
      totalCost,
      days: lists.map(l => ({ planId: l.planId, day: l.day, createdAt: l.createdAt }))
    });
  } catch(err) {
    console.error('[grocery-list] trial summary fetch error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/grocery-list/:planId/days — available days for the day-switcher UI
// (registered before the /:day route below — otherwise Express would match "days" as a day value)
app.get('/api/grocery-list/:planId/days', requireSession, async (req, res) => {
  const session = req.session;
  try {
    const lists = await db.getGroceryListsForPlan(req.params.planId);
    if (lists.length > 0 && lists[0].userId !== session.userId) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ success: true, days: lists.map(l => l.day) });
  } catch(err) {
    console.error('[grocery-list] days fetch error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/grocery-list/:planId/:day
app.get('/api/grocery-list/:planId/:day', requireSession, async (req, res) => {
  const session = req.session;
  try {
    const groceryList = await db.getGroceryListByDay(req.params.planId, req.params.day);
    if (!groceryList || groceryList.userId !== session.userId) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ success: true, groceryList });
  } catch(err) {
    console.error('[grocery-list] fetch error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// PATCH /api/grocery-list/:planId/:day/items/:itemId — toggle checked and/or
// save a user-edited actualCost for one item. Storage is keyed by (planId, day)
// per the grocery_lists table, so day is part of the path rather than the item
// id alone. Returns just the updated item, not the whole list.
app.patch('/api/grocery-list/:planId/:day/items/:itemId', requireSession, async (req, res) => {
  const session = req.session;
  try {
    const day = GROCERY_DAYS.includes(req.params.day) ? req.params.day : null;
    const itemId = sanitise(req.params.itemId, 40);
    if (!day || !itemId) return res.status(400).json({ error: 'Invalid day or item id' });

    const { checked, actualCost } = req.body || {};
    const updates = {};
    if (typeof checked === 'boolean') updates.checked = checked;
    if (actualCost === null) {
      updates.actualCost = null;
    } else if (actualCost !== undefined) {
      const n = Number(actualCost);
      if (!Number.isFinite(n) || n < 0 || n > 10000) {
        return res.status(400).json({ error: 'actualCost must be a number between 0 and 10000, or null' });
      }
      updates.actualCost = Math.round(n * 100) / 100;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const updatedItem = await db.updateGroceryItem(req.params.planId, day, session.userId, itemId, updates);
    if (!updatedItem) return res.status(404).json({ error: 'not_found' });

    res.json({ success: true, item: updatedItem });
  } catch(err) {
    console.error('[grocery-list] item patch error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// AI COACH
// ════════════════════════════════════════════════════════════════════════════

const coachLimiterFree = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're sending messages too fast — wait 60 seconds and try again." },
  keyGenerator: (req) => req.coachSession.userId,
});

const coachLimiterPro = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're sending messages too fast — wait 60 seconds and try again." },
  keyGenerator: (req) => req.coachSession.userId,
});

function requireCoachAuth(req, res, next) {
  return requireSession(req, res, () => {
    req.coachSession = req.session;
    next();
  });
}

async function routeCoachLimiter(req, res, next) {
  try {
    const dbUser = await db.getUserById(req.coachSession.userId);
    req.coachIsPro = dbUser?.pro === 1;
  } catch (err) {
    log.error('[coach] user lookup error:', { message: err.message });
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
  return (req.coachIsPro ? coachLimiterPro : coachLimiterFree)(req, res, next);
}

app.post('/api/ai-coach', requireCoachAuth, requireVerifiedEmail, routeCoachLimiter, async (req, res) => {
  try {
    const session = req.coachSession;
    const isCoachPro = req.coachIsPro;

    const { messages, profile } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }
    for (const m of messages) {
      if (typeof m?.content !== 'string' || m.content.length > 3000) {
        return res.status(400).json({ error: 'Invalid message content' });
      }
      if (m.role !== 'user' && m.role !== 'assistant') {
        return res.status(400).json({ error: 'Invalid message role' });
      }
    }

    const { name = 'User', goal = 'eat healthier', dailyCalories = 2000, macros = { protein: 150, carbs: 200, fat: 67 }, dietaryPrefs = [], allergies = [], weight = 70, height = 170, age = 30, currency = 'USD', preferred_cuisine = '', language: coachLang = 'en' } = profile || {};
    const langNames   = { en:'English',sv:'Swedish',no:'Norwegian',da:'Danish',de:'German',fr:'French',es:'Spanish',it:'Italian',pt:'Portuguese',nl:'Dutch',ja:'Japanese',fi:'Finnish',pl:'Polish',tr:'Turkish',ko:'Korean',zh:'Chinese',ar:'Arabic',hi:'Hindi',ru:'Russian' };
    const coachLangName = langNames[coachLang] || 'English';
    const currencyToCountry = { USD:'United States',GBP:'United Kingdom',EUR:'Europe',SEK:'Sweden',NOK:'Norway',DKK:'Denmark',CAD:'Canada',AUD:'Australia',CHF:'Switzerland',JPY:'Japan',KRW:'South Korea',INR:'India',BRL:'Brazil' };
    const userCountry = currencyToCountry[currency] || 'their country';

    // Prompt caching: stable Mia identity cached, volatile user profile appended uncached.
    // Earlier conversation turns also cached to save tokens on multi-turn sessions.
    const _miaBase = `You are Mia, a friendly, knowledgeable AI nutritionist and wellness coach for the Mealzy app.

Personality: warm, encouraging, science-based. Give practical, actionable advice. Plain text only.
Never diagnose or replace professional medical advice. Always tailor to this user's profile.
If a user's calorie target appears dangerously low (under 1200 kcal for adults), gently note that this may be too low and suggest consulting a healthcare professional.
If a user mentions restricting, purging, skipping meals excessively, or any disordered eating behaviour, do not engage with the restriction plan — instead warmly encourage them to speak with a healthcare professional or eating disorder support service.
Always acknowledge that cross-contamination is possible and users with severe allergies should verify ingredients independently.`;

    const _userCtx = `You are talking with ${name}.

User profile:
- Goal: ${goal}
- Daily calories: ${dailyCalories} kcal | Protein ${macros.protein}g / Carbs ${macros.carbs}g / Fat ${macros.fat}g
- Weight: ${weight}kg, Height: ${height}cm, Age: ${age}
- Dietary preferences: ${dietaryPrefs.length > 0 ? dietaryPrefs.join(', ') : 'None'}
- Allergies: ${allergies.length > 0 ? allergies.join(', ') : 'None'}
- Region: ${userCountry} (${currency})
- Preferred cuisine: ${preferred_cuisine || 'No preference'}
Length: ${isCoachPro ? 'thorough: up to 3 focused paragraphs' : 'concise: 1-2 short paragraphs, max 120 words'}.
Respond in ${coachLangName}.`;

    // Cache the 3 most recent non-final conversation turns.
    // Anthropic allows max 4 cache_control blocks per request; the system prompt
    // uses 1, leaving exactly 3 for conversation history.
    const _convo = messages.slice(-10);
    const _cachedConvo = _convo.map((msg, i) => {
      const isLast = i === _convo.length - 1;
      const isAmongLast3NonFinal = !isLast && i >= _convo.length - 4;
      if (isAmongLast3NonFinal && typeof msg.content === 'string') {
        return { role: msg.role, content: [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }] };
      }
      return msg;
    });

    const completion = await callAnthropicWithSpendCap({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: isCoachPro ? 600 : 300,
      system: [
        { type: 'text', text: _miaBase, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: _userCtx }
      ],
      messages: _cachedConvo
    });
    if (completion.usage?.cache_read_input_tokens || completion.usage?.cache_creation_input_tokens) {
      log.info(`[coach cache] hit=${completion.usage.cache_read_input_tokens||0} write=${completion.usage.cache_creation_input_tokens||0}`);
    }

    res.json({ success: true, message: { role: 'assistant', content: completion.content[0].text, timestamp: new Date().toISOString() } });

  } catch(error) {
    if (error.spendCapReached) {
      return res.status(503).json({
        error: 'service_temporarily_unavailable',
        message: 'AI features are temporarily paused due to high demand. Please try again later.'
      });
    }
    log.error('[coach] Anthropic error:', { message: error.message, status: error.status });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// FALLBACK MEAL PLAN (returned when AI generation fails)
// ════════════════════════════════════════════════════════════════════════════

function generateFallbackMealPlan(profile) {
  const calories = profile?.dailyCalories || 2000;
  return {
    meals: [
      { type:'breakfast',name:'Greek Yogurt Parfait',description:'Creamy Greek yogurt layered with fresh berries and granola',calories:Math.round(calories*.25),protein:20,carbs:35,fat:8,cookTime:5,servings:1,estimatedCost:3.50,ingredients:[{name:'Greek yogurt',amount:'200g',cost:1.80},{name:'Mixed berries',amount:'100g',cost:1.20},{name:'Granola',amount:'50g',cost:0.50}],instructions:['Spoon yogurt into a bowl.','Layer with fresh berries.','Top with granola and serve.'] },
      { type:'lunch',name:'Grilled Chicken Salad',description:'Tender grilled chicken over crisp greens with avocado',calories:Math.round(calories*.30),protein:40,carbs:20,fat:18,cookTime:20,servings:1,estimatedCost:6.00,ingredients:[{name:'Chicken breast',amount:'150g',cost:3.00},{name:'Mixed salad greens',amount:'100g',cost:1.20},{name:'Avocado',amount:'1/2',cost:1.00},{name:'Cherry tomatoes',amount:'100g',cost:0.80}],instructions:['Season and grill chicken 6-7 min per side.','Let rest 5 min, then slice.','Arrange over greens with avocado and lemon juice.'] },
      { type:'snack',name:'Apple with Almond Butter',description:'Crisp apple slices with creamy almond butter',calories:Math.round(calories*.10),protein:5,carbs:25,fat:8,cookTime:2,servings:1,estimatedCost:2.00,ingredients:[{name:'Apple',amount:'1 medium',cost:0.80},{name:'Almond butter',amount:'2 tbsp',cost:1.20}],instructions:['Wash and slice the apple.','Serve with almond butter for dipping.'] },
      { type:'dinner',name:'Salmon with Roasted Vegetables',description:'Pan-seared salmon with colorful roasted seasonal vegetables',calories:Math.round(calories*.35),protein:45,carbs:30,fat:20,cookTime:30,servings:1,estimatedCost:9.00,ingredients:[{name:'Salmon fillet',amount:'200g',cost:5.00},{name:'Broccoli',amount:'150g',cost:1.20},{name:'Bell pepper',amount:'1',cost:1.00},{name:'Olive oil',amount:'1 tbsp',cost:0.30}],instructions:['Roast veg at 200°C for 20 min.','Cook salmon 4 min per side.','Serve with lemon wedge.'] }
    ],
    totalCalories: calories,
    totalCost: 20.50,
    nutritionNote: 'Balanced meal plan with lean proteins, complex carbs, and healthy fats.'
  };
}

// ════════════════════════════════════════════════════════════════════════════
// XP / GAMIFICATION ENDPOINT
// ════════════════════════════════════════════════════════════════════════════

// POST /api/xp/award — award XP to the authenticated user (server validates)
// Body: { action: 'generate_plan' | 'swap_meal' | 'complete_day' | 'onboarding' }
app.post('/api/xp/award', requireSession, async (req, res) => {
  const session = req.session;

  const XP_MAP = {
    generate_plan:  50,
    swap_meal:      10,
    complete_day:   25,
    onboarding:    100,
  };

  const { action } = req.body;
  const xpEarned = XP_MAP[action];
  if (!xpEarned) return res.status(400).json({ error: 'unknown action' });

  try {
    const profile  = await db.getProfile(session.userId) || {};
    const newXP    = (profile.xp || 0) + xpEarned;
    const newLevel = calcLevel(newXP);
    const oldLevel = calcLevel(profile.xp || 0);

    profile.xp    = newXP;
    profile.level = newLevel;

    // Streak logic — only runs on generate_plan (the daily engagement action)
    let streakIncremented = false;
    if (action === 'generate_plan') {
      const today     = new Date().toISOString().split('T')[0];
      const lastActive = profile.lastActiveDate || null;
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      if (lastActive === today) {
        // already active today — no change
      } else if (lastActive === yesterday) {
        profile.streak = (profile.streak || 1) + 1;
        streakIncremented = true;
      } else {
        profile.streak = 1;
      }
      profile.lastActiveDate = today;
    }

    await db.saveProfile(session.userId, profile);
    await db.logEvent('xp_award', { action, xp: xpEarned, total: newXP, level: newLevel }, '');

    res.json({
      success: true,
      xp: newXP,
      level: newLevel,
      levelUp: newLevel > oldLevel,
      xpEarned,
      streak: profile.streak,
      streakIncremented,
    });
  } catch(err) {
    console.error('XP award error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/meal-feedback — record a like/dislike/swap for a meal (server-authoritative userId)
// Body: { mealName: string, action: 'like' | 'dislike' | 'swap', reason?: string }
const MEAL_FEEDBACK_ACTIONS = new Set(['like', 'dislike', 'swap']);
app.post('/api/meal-feedback', requireSession, async (req, res) => {
  const session = req.session;
  const { mealName: rawMealName, action, reason: rawReason } = req.body;

  const mealName = sanitise(rawMealName, 200);
  if (!mealName) return res.status(400).json({ error: 'mealName is required' });
  if (!MEAL_FEEDBACK_ACTIONS.has(action)) return res.status(400).json({ error: 'action must be like, dislike, or swap' });
  const reason = rawReason ? sanitise(rawReason, 200) : null;

  try {
    await db.saveMealFeedback({ userId: session.userId, mealName, action, reason });
    res.json({ success: true });
  } catch (err) {
    console.error('Meal feedback error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

function calcLevel(xp) {
  if (xp >= 1000) return 5;
  if (xp >= 500)  return 4;
  if (xp >= 250)  return 3;
  if (xp >= 100)  return 2;
  return 1;
}

// GET /api/share-card/:userId — public, no auth required
app.get('/api/share-card/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!userId || userId.length > 40) return res.status(404).json({ error: 'Not found' });
  try {
    const profile = await db.getProfile(userId);
    const user    = await db.getUserById(userId);
    if (!profile || !user) return res.status(404).json({ error: 'Not found' });
    res.json({
      name:       user.name?.split(' ')[0] || 'Meal Planner',
      level:      profile.level      || 1,
      xp:         profile.xp         || 0,
      weekStreak: profile.weekStreak || 0,
      badgeCount: (profile.badges    || []).length,
    });
  } catch(err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SHAREABLE MEAL PLANS — public, no login
// ════════════════════════════════════════════════════════════════════════════

const PLAN_SHARE_DAYS = new Set([
  'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
  'Today','Unspecified'
]);

// POST /api/plans/share — generate a shareable link for a plan
app.post('/api/plans/share', requireSession, async (req, res) => {
  const session = req.session;

  const { plan, date, title } = req.body;
  if (!plan || typeof plan !== 'object') {
    return res.status(400).json({ error: 'plan required' });
  }

  const meals = (Array.isArray(plan.meals) ? plan.meals : []).slice(0, 50).map(m => ({
    day:           PLAN_SHARE_DAYS.has(m?.day) ? m.day : 'Unspecified',
    type:          sanitise(m?.type, 20),
    name:          sanitise(m?.name, 120),
    description:   sanitise(m?.description, 300),
    calories:      Number(m?.calories)      || 0,
    protein:       Number(m?.protein)       || 0,
    cookTime:      Number(m?.cookTime)      || 0,
    // cost is the authoritative, pricing.js-computed value; estimatedCost is the
    // raw AI guess kept only as a fallback for links shared before this field existed
    cost:          Number(m?.cost) || 0,
    estimatedCost: Number(m?.estimatedCost) || 0,
  }));
  if (meals.length === 0) {
    return res.status(400).json({ error: 'plan.meals required' });
  }

  const safeTitle = sanitise(title, 200);
  const safeDate  = sanitise(date, 20);

  const shareId = require('crypto').randomBytes(5).toString('hex'); // 8 chars, e.g. "a1b2c3d4"
  const planId  = randomUUID();

  try {
    await db.saveShareLink(shareId, planId, session.userId, {
      plan: { ...plan, meals },
      date: safeDate,
      title: safeTitle,
      sharedAt: new Date().toISOString()
    });
    await db.logEvent('plan_shared', { shareId }, '');
    const shareUrl = `${process.env.APP_URL || 'https://mealzy.org'}/plan.html?id=${shareId}`;
    res.json({ success: true, shareId, shareUrl });
  } catch(err) {
    console.error('[share] error:', err);
    res.status(500).json({ error: 'Could not create share link. Please try again.' });
  }
});

// GET /api/shared-plan/:shareId — public, no auth
app.get('/api/shared-plan/:shareId', async (req, res) => {
  const { shareId } = req.params;
  if (!shareId || shareId.length > 20) return res.status(404).json({ error: 'Not found' });

  const link = await db.getShareLink(shareId);
  if (!link) return res.status(404).json({ error: 'Plan not found or link expired' });

  await db.incrementShareViews(shareId);
  res.json({ success: true, plan: link.plan, views: (link.views || 0) + 1 });
});

// ════════════════════════════════════════════════════════════════════════════
// REF CODE LOOKUP — handles /?ref=CODE on homepage
// ════════════════════════════════════════════════════════════════════════════

// GET /api/ref-lookup?code=ref_ABC123 — resolves a code to an email for referral credit
app.get('/api/ref-lookup', authLimiter, async (req, res) => {
  const { code } = req.query;
  if (!code) return res.json({ found: false });
  if (code.startsWith('ref_')) {
    const user = await db.getUserByRefCode(code);
    return res.json({ found: !!user });
  }
  res.json({ found: false });
});

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS FUNNEL — admin endpoint
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/analytics/funnel', requireSession, async (req, res) => {
  const session = req.session;

  const proToken = req.headers['x-pro-token'];
  const isAdmin  = proToken && process.env.PRO_TOKEN &&
                   timingSafeCompare(proToken, process.env.PRO_TOKEN);
  if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const stats = await db.getFunnelStats();
    res.json(stats);
  } catch(err) {
    console.error('[funnel] error:', err);
    res.status(500).json({ error: 'Could not compute funnel stats' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CRON ENDPOINTS — called by Render cron job or external scheduler
// Secured with a cron-specific secret header: x-cron-secret
// ════════════════════════════════════════════════════════════════════════════

function cronAuth(req, res) {
  const secret      = req.headers['x-cron-secret'];
  const timestamp   = parseInt(req.headers['x-cron-timestamp'] || '0', 10);
  const age         = Date.now() - timestamp;
  const CRON_SECRET = process.env.CRON_SECRET || '';
  if (!secret || CRON_SECRET.length < 32 || !timingSafeCompare(secret, CRON_SECRET)) {
    res.status(401).json({ error: 'Unauthorized' }); return false;
  }
  if (isNaN(timestamp) || age > 5 * 60 * 1000 || age < 0) {
    res.status(401).json({ error: 'Request expired or missing timestamp' }); return false;
  }
  return true;
}

// POST /api/cron/day3-nudge — send day-3 nudge emails to unconverted users
app.post('/api/cron/day3-nudge', cronLimiter, async (req, res) => {
  if (!cronAuth(req, res)) return;
  try {
    const users = await db.getUsersNeedingNudge();
    let sent = 0;
    for (const user of users) {
      const result = await sendEmail(
        user.email,
        "You've got 2 free plans left this month — here's what Pro unlocks",
        emailDay3Nudge(user.name, 2)
      );
      if (result.ok) {
        await db.markNudgeSent(user.id);
        sent++;
      }
      await new Promise(r => setTimeout(r, 100)); // gentle rate limiting
    }
    await db.logEvent('cron_day3_nudge', { sent, total: users.length }, '');
    res.json({ ok: true, sent, total: users.length });
  } catch(err) {
    console.error('[cron/day3-nudge] error:', err);
    res.status(500).json({ error: 'cron_failed' });
  }
});

// POST /api/cron/weekly-digest — send weekly reminder to all active free users
app.post('/api/cron/weekly-digest', cronLimiter, async (req, res) => {
  if (!cronAuth(req, res)) return;
  try {
    const users = await db.getUsersForWeeklyDigest();
    let sent = 0;
    for (const user of users) {
      const result = await sendEmail(
        user.email,
        'New week — generate your meal plan in 30 seconds',
        emailWeeklyDigest(user.name, user.pro === 1)
      );
      if (result.ok) sent++;
      await new Promise(r => setTimeout(r, 150));
    }
    await db.logEvent('cron_weekly_digest', { sent, total: users.length }, '');
    res.json({ ok: true, sent, total: users.length });
  } catch(err) {
    console.error('[cron/weekly-digest] error:', err);
    res.status(500).json({ error: 'cron_failed' });
  }
});

// ── Recipe routes (photo import, save, list) ──────────────────────────────────
require('./routes/recipes')(app, { anthropic, requireSession, requireVerifiedEmail, generateLimiter, db, callAnthropicWithSpendCap });
require('./routes/favorites')(app, { requireSession, db });

// ── Blog routes ───────────────────────────────────────────────────────────────
app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'blog', 'index.html'));
});
app.use('/blog', express.static(path.join(__dirname, 'public', 'blog'), {
  setHeaders: setSecurityHeaders
}));

// ── React build pages: serve the matching dist/*.html instead of index.html ──
if (hasDistBuild) {
  const distPages = [
    'pricing', 'upgrade', 'login', 'reset-password', 'privacy-policy', 'terms',
    'meal-plan-generator', 'plan', 'budget-meal-plan', 'weekly-meal-plan',
    'sunday-tax', 'support'
  ];
  for (const page of distPages) {
    app.get(`/${page}`, (req, res) => {
      res.sendFile(path.join(distDir, `${page}.html`));
    });
  }
}

// ── Clean-URL trust anchor pages ─────────────────────────────────────────────
// Agents check /about, /contact, /privacy to verify a business is real. Each
// maps to an existing full HTML page; content is unchanged.
const CLEAN_URL_PAGES = {
  '/about': path.join(__dirname, 'public', 'about.html'),
  '/contact': path.join(__dirname, 'public', 'support.html'),
  '/privacy': path.join(__dirname, 'public', 'privacy-policy.html')
};
for (const [route, file] of Object.entries(CLEAN_URL_PAGES)) {
  app.get(route, (req, res) => res.sendFile(file));
}

// ── Catch-all: real 404 for unknown paths ───────────────────────────────────
// Never a 200 with the app shell — that makes agents believe every path exists.
app.use((req, res) => {
  res.status(404);
  res.vary('Accept');
  if (req.path.startsWith('/api/')) {
    return res.json({ error: 'not_found' });
  }
  if (req.method === 'GET' && req.accepts('html') && !prefersMarkdown(req.headers.accept)) {
    return res.sendFile(path.join(__dirname, 'public', '404.html'));
  }
  res.type('text/markdown; charset=utf-8');
  res.send(NOT_FOUND_MD);
});

// ── Global error handler — prevents unhandled exceptions from crashing the server ──
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large', message: 'Request body is too large.' });
  }
  console.error('[ERROR]', err.stack || err.message || err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.stack || err);
  // Don't exit — Render will restart if truly unrecoverable
});

// ── Start server after DB is ready ────────────────────────────────────────────
// Guarded so `require('./server')` (integration tests) binds no port and runs
// no DB init. `node server.js` in production is unaffected — require.main is
// this module, so the block runs exactly as before.
if (require.main === module) {
db.initDb().then(async () => {
  app.listen(PORT, async () => {
    logger.info(`Mealzy running on http://localhost:${PORT}`);

    // Startup self-test — Avery checks these logs after every deploy
    const checks = [
      { name: 'JWT_SECRET',              ok: !!process.env.JWT_SECRET },
      { name: 'ANTHROPIC_API_KEY',       ok: !!process.env.ANTHROPIC_API_KEY },
      { name: 'STRIPE_SECRET_KEY',       ok: !!process.env.STRIPE_SECRET_KEY },
      { name: 'STRIPE_WEBHOOK_SECRET',   ok: !!process.env.STRIPE_WEBHOOK_SECRET },
      { name: 'STRIPE_MONTHLY_URL',      ok: !!process.env.STRIPE_MONTHLY_URL },
      { name: 'STRIPE_ANNUAL_URL',       ok: !!process.env.STRIPE_ANNUAL_URL },
      { name: 'STRIPE_FAMILY_MONTHLY_URL', ok: !!process.env.STRIPE_FAMILY_MONTHLY_URL },
      { name: 'STRIPE_FAMILY_ANNUAL_URL',  ok: !!process.env.STRIPE_FAMILY_ANNUAL_URL },
      { name: 'STRIPE_DISCOUNT_URL',     ok: !!process.env.STRIPE_DISCOUNT_URL },
      { name: 'GOOGLE_CLIENT_ID',        ok: !!process.env.GOOGLE_CLIENT_ID },
      { name: 'GOOGLE_CLIENT_SECRET',    ok: !!process.env.GOOGLE_CLIENT_SECRET },
      { name: 'RESEND_API_KEY',          ok: !!process.env.RESEND_API_KEY },
      { name: 'ADMIN_TOKEN',             ok: !!process.env.ADMIN_TOKEN },
      { name: 'PRO_TOKEN',               ok: !!process.env.PRO_TOKEN },
      { name: 'CRON_SECRET',             ok: !!process.env.CRON_SECRET },
      { name: 'TURSO_DATABASE_URL',      ok: !!process.env.TURSO_DATABASE_URL },
      { name: 'TURSO_AUTH_TOKEN',        ok: !!process.env.TURSO_AUTH_TOKEN },
      { name: 'APP_URL',                 ok: !!process.env.APP_URL },
      { name: 'DATABASE',                ok: await db.ping() },
    ];

    const pass = checks.filter(c => c.ok);
    const fail = checks.filter(c => !c.ok);
    logger.info(`[startup] ${pass.length}/${checks.length} checks passed`);
    if (fail.length) logger.warn(`[startup] Missing/failed: ${fail.map(c => c.name).join(', ')}`);
    else logger.info('[startup] All systems go');

    // ── Avery: keep-alive ping — prevents Render free tier spin-down ──────────
    if (process.env.NODE_ENV === 'production') {
      setInterval(() => {
        fetch('https://mealzy.org/api/health').catch(() => {});
      }, 14 * 60 * 1000); // every 14 minutes
      logger.info('[avery] Keep-alive ping active (14 min interval)');
    }
  });
}).catch(err => {
  console.error('[FATAL] Failed to initialise database:', err);
  process.exit(1);
});
}