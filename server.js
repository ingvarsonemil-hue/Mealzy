/**
 * Mealzy server.js
 *
 * Sessions  : stateless JWT in httpOnly cookie â€” survive server restarts
 * Persistence: SQLite via sql.js (see db.js) â€” survives browser clears
 * Payments   : Stripe webhook activates Pro server-side, regardless of redirect
 */

'use strict';

require('dotenv').config();

// â”€â”€ JWT secret guard â€” refuse to start without it â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Structured logging â€” replaces console.log/error throughout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    // In production on Render, logs go to stdout â€” no file needed.
    // Locally, also write errors to a file for easier debugging:
    ...(process.env.NODE_ENV !== 'production'
      ? [new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
         new winston.transports.File({ filename: 'logs/combined.log' })]
      : [])
  ]
});

// Make logger globally available â€” Morgan should replace console.log with logger calls over time
global.log = logger;

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust Render's proxy so express-rate-limit can read the real client IP
app.set('trust proxy', 1);
app.disable('x-powered-by');

const JWT_SECRET    = process.env.JWT_SECRET;
const JWT_EXPIRES   = '24h';
const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// Note: analytics.json and leads.json were legacy flat-file stores â€” all analytics now live in SQLite via await db.logEvent()

// â”€â”€ Explicit output shapes â€” define exactly what each endpoint returns to clients â”€â”€
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

// â”€â”€ Security headers on every response â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Admin middleware â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
  if (!token || ADMIN_TOKEN.length < 32 || !timingSafeCompare(token, ADMIN_TOKEN)) {
    logger.warn('[admin] Unauthorized attempt', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// â”€â”€ Stripe webhook needs raw body â€” must be BEFORE express.json() â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

// â”€â”€ Explicit CORS configuration with allowlist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Page view tracking (fires before static files are served) â”€â”€
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

// â”€â”€ React marketing pages (see vite.config.mjs for the full page list) â”€â”€â”€â”€â”€â”€
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
      // Vite assets are content-hashed â€” safe to cache forever
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
} else {
  logger.error('[startup] dist/ build missing â€” serving legacy public/ pages. Run npm run build.');
}

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: setSecurityHeaders
}));

// TikTok domain verification
app.get('/tiktok5D5PTssMk9TzIVSQAXCcHPlwQwQ52nQc.txt', async (req, res) => {
  res.type('text/plain').send('tiktok-developers-site-verification=5D5PTssMk9TzIVSQAXCcHPIwQwQ52nQc');
});

// â”€â”€ Rate limiters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  message: { error: "You're generating plans fast â€” wait 60 seconds and try again." }
});

// Demo meal limiter â€” 3 per IP per 24 hours (no account required)
const demoLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'demo_limit', message: "You've used today's 3 free demos. Create a free account â€” it only takes 30 seconds." }
});

// AI coach / grocery list limiter â€” both call Anthropic and require a session,
// so this only bounds how fast a logged-in user can spend API budget.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're sending requests too fast â€” wait 60 seconds and try again." }
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

// Stripe-touching routes â€” bound how fast a session can hit the Stripe API
const stripeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

// Admin routes â€” defense in depth on top of the token check itself
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

// Cron routes â€” guarded by CRON_SECRET, but bound retry/brute-force speed too
const cronLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

// Catch-all safety net for every other /api/* route not covered by a
// purpose-specific limiter above. /api/health is exempt â€” keep-alive.yml
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

// â”€â”€ Cookie helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const cookies = parseCookies(req);
    const token   = cookies.mealzy_session;
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET); // throws if expired/tampered
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
      // fall through as anonymous â€” do not fail the request
    }
  }
  next();
}

// â”€â”€ Input sanitisation helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Email format validation (RFC-5322-ish, deliberately conservative) â”€â”€â”€â”€â”€â”€
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

// â”€â”€ HTML escape for email and HTML context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Constant-time string comparison (prevents timing attacks) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function timingSafeCompare(a, b) {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch (e) {
    // Lengths don't match â€” use fake comparison to prevent timing leak
    return false;
  }
}

// â”€â”€ Common weak passwords to reject â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const COMMON_PASSWORDS = new Set([
  'password', 'password123', '123456789', 'qwerty', 'abc123', 'letmein', 'welcome',
  'monkey', 'dragon', 'master', 'admin', 'sunshine', 'princess', 'football', 'shadow',
  'michael', 'batman', 'trustno1', 'starwars', 'superman', 'password1', 'admin123'
]);

// â”€â”€ Password strength validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ In-memory usage tracker (free-plan generation cap) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const usageTracker = new Map();
const FREE_PLAN_LIMIT = 3; // anonymous (no-session) requests only â€” logged-in free users use the 30-day daily trial below
const referralBonus   = new Map(); // kept for in-session backward compat; SQLite is source of truth

// â”€â”€ Free-tier 30-day daily trial (logged-in users) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TRIAL_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

// â”€â”€ Failed login tracking â€” per-account rate limiting and lockout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  // Deliberately do NOT clear ipFailedAttempts here â€” a successful login
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



// Constant-time filler for signin timing â€” computed once at startup so the
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

// Fix: Windows system env vars can override .env with empty string â€” read .env directly as fallback
const _anthropicKey = (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim())
  || (() => { try { return require('fs').readFileSync('.env','utf8').split('\n').find(l=>l.startsWith('ANTHROPIC_API_KEY='))?.split('=').slice(1).join('=').trim(); } catch(e){} })()
  || '';
if (!_anthropicKey) logger.warn('[WARN] ANTHROPIC_API_KEY is not set â€” AI features will fail');
else logger.info('[OK] ANTHROPIC_API_KEY loaded (len=' + _anthropicKey.length + ')');
const anthropic = new Anthropic({ apiKey: _anthropicKey });

const DAILY_SPEND_CAP_USD = Number(process.env.DAILY_SPEND_CAP_USD) || 5;
// claude-haiku-4-5-20251001 pricing, confirmed current as of this session:
// $1.00 / million input tokens, $5.00 / million output tokens.
// Cache-read/cache-creation tokens are billed cheaper by Anthropic, but
// we deliberately count them at the full input rate here â€” this is a
// safety backstop, not a billing reconciliation, so it's correct to
// slightly OVERestimate real spend rather than risk underestimating it.
const HAIKU_INPUT_COST_PER_TOKEN = 1 / 1_000_000;
const HAIKU_OUTPUT_COST_PER_TOKEN = 5 / 1_000_000;

// Known limitation: under high concurrency, multiple simultaneous requests
// could all pass the pre-check before any of them records its spend,
// allowing a small overshoot right at the cap boundary. Acceptable for a
// safety backstop at this traffic scale â€” not worth adding transaction
// locking for.
async function callAnthropicWithSpendCap(params) {
  const currentSpend = await db.getDailySpend();
  if (currentSpend >= DAILY_SPEND_CAP_USD) {
    logger.error('[spend-cap] Daily Anthropic spend cap reached â€” blocking call', {
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
  const cost = (inputTokens * HAIKU_INPUT_COST_PER_TOKEN) + (outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN);
  db.addDailySpend(cost).catch(err => {
    logger.error('[spend-cap] failed to record spend (non-fatal)', { message: err.message });
  });
  return completion;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EMAIL UTILITY (Resend API â€” set RESEND_API_KEY in Render env vars)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) {
    // Graceful fallback â€” log so Emil can copy-paste the link during dev
    logger.debug(`[email] RESEND_API_KEY not set â€” would send subject: ${subject}`);
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
    logger.info(`[email] Sent â€” id: ${data.id}`);
    return { ok: true, id: data.id };
  } catch(err) {
    console.error('[email] sendEmail error:', err.message);
    return { ok: false, error: err.message };
  }
}

// â”€â”€ Email HTML templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function emailBase(content) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="background:#3d8b5e;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
          <span style="color:white;font-size:22px;font-weight:800;letter-spacing:-0.5px;">ðŸ¥— Mealzy</span>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
          ${content}
          <hr style="border:none;border-top:1px solid #e8f0eb;margin:28px 0"/>
          <p style="color:#888;font-size:12px;text-align:center;margin:0;">
            Mealzy Â· <a href="https://mealzy.org" style="color:#3d8b5e;text-decoration:none;">mealzy.org</a> Â·
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
    <a href="${safeUrl}" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">Reset My Password â†’</a>
    <p style="color:#888;font-size:13px;margin:0;">Or paste this link in your browser:<br/><span style="color:#3d8b5e;word-break:break-all;">${safeUrl}</span></p>
    <p style="color:#aaa;font-size:12px;margin-top:16px;">If you didn't request this, ignore this email. Your password won't change.</p>
  `);
}

function emailAccountExists(name) {
  const safeName = escapeHtml(name || 'there');
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">Someone tried to sign up with your email</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${safeName}, someone just tried to create a Mealzy account using this email address. You already have an account â€” if this was you, just sign in instead.</p>
    <a href="https://mealzy.org/login.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">Sign In â†’</a>
    <p style="color:#888;font-size:13px;margin:0;">Forgot your password? <a href="https://mealzy.org/login.html" style="color:#3d8b5e;text-decoration:none;">Reset it here</a>.</p>
    <p style="color:#aaa;font-size:12px;margin-top:16px;">If this wasn't you, no action is needed â€” your account is safe and nothing has changed.</p>
  `);
}


function emailVerifyAddress(name, verifyUrl) {
  const safeName = escapeHtml(name || 'there');
  const safeUrl = escapeHtml(verifyUrl);
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">Verify your email</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${safeName}, welcome to Mealzy! Please verify your email to unlock AI meal plans, grocery lists, and the coach. This link expires in 24 hours.</p>
    <a href="${safeUrl}" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">Verify My Email â†’</a>
    <p style="color:#888;font-size:13px;margin:0;">Or paste this link in your browser:<br/><span style="color:#3d8b5e;word-break:break-all;">${safeUrl}</span></p>
  `);
}


function emailDay3Nudge(name, plansLeft) {
  const safeName = escapeHtml(name || 'there');
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">You've got ${plansLeft} free plan${plansLeft !== 1 ? 's' : ''} left this month ðŸ¥—</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${safeName} â€” you signed up 3 days ago. Here's what Pro unlocks when you're ready:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      ${['Unlimited AI meal plans â€” every week, every goal change', 'PDF export â€” print your plan, take it to the shop', 'Unlimited AI coaching with Mia â€” ask anything, any time', 'Advanced macros per meal â€” protein, carbs, fat broken down'].map(f => `
      <tr><td style="padding:6px 0;color:#333;font-size:14px;">âœ… ${f}</td></tr>`).join('')}
    </table>
    <a href="https://mealzy.org/upgrade.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:16px;">Start Pro â€” 7 Days Free â†’</a>
    <p style="color:#888;font-size:13px;margin:0;">$12/month. Cancel any time with one click.</p>
  `);
}

function emailLimitHit(name) {
  const safeName = escapeHtml(name || 'there');
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">You hit your free plan limit ðŸš€</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${safeName} â€” you've used all your free plans this month. That means you're actually using Mealzy â€” which is great.</p>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Upgrade to Pro and never hit a limit again. Your <strong>7-day free trial</strong> starts the moment you click â€” no charge until the trial ends.</p>
    <a href="https://mealzy.org/upgrade.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:16px;">Start My 7-Day Free Trial â†’</a>
    <p style="color:#888;font-size:13px;margin:0;">$12/month after the trial. Cancel any time.</p>
  `);
}

function emailReferralReward(name, referredName) {
  const safeName = escapeHtml(name || 'there');
  const safeReferred = escapeHtml(referredName || 'someone you referred');
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">You earned a free plan!</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${safeName} â€” ${safeReferred} just upgraded to Pro. As a thank you, we've added an extra plan to your account this month.</p>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Keep referring friends to earn more free plans.</p>
    <a href="https://mealzy.org/dashboard.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:16px;">Go to My Dashboard â†’</a>
  `);
}

function emailWeeklyDigest(name, isPro) {
  const safeName = escapeHtml(name || 'there');
  const upgradeSection = !isPro
    ? `<p style="color:#555;font-size:14px;line-height:1.6;margin:0;">Running low on free plans? <strong>Pro unlocks unlimited plans for $12/month.</strong> <a href="https://mealzy.org/upgrade.html" style="color:#3d8b5e;text-decoration:none;font-weight:700;">Upgrade now â†’</a></p>`
    : '';
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">Your meal plan for this week is waiting.</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${safeName} â€” it's Monday. Takes 30 seconds to plan your whole week.</p>
    <a href="https://mealzy.org/meal-planner.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">Generate This Week's Plan â†’</a>
    <p style="color:#888;font-size:13px;margin:0 0 24px;">Your calorie target and budget are already saved. Just hit generate.</p>
    <hr style="border:none;border-top:1px solid #e8f0eb;margin:24px 0"/>
    ${upgradeSection}
  `);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HEALTH
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â”€â”€ Stripe payment links â€” served from env vars so links update without code deploys â”€â”€
// To add a new plan: set the env var in .env (local) + Render dashboard (production), redeploy.
const STRIPE_MONTHLY_FALLBACK = 'https://buy.stripe.com/28E28r1Q73q0e6neQRffy00';
app.get('/stripe-config.js', async (req, res) => {
  const monthly        = process.env.STRIPE_MONTHLY_URL        || STRIPE_MONTHLY_FALLBACK;
  const annual         = process.env.STRIPE_ANNUAL_URL         || monthly; // falls back to monthly if annual not set
  // Family and the abandonment discount must never silently resolve to the Pro
  // monthly link â€” that would charge (or promise) the wrong price. null here
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// AUTH ENDPOINTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// POST /api/auth/signup
app.post('/api/auth/signup', authLimiter, async (req, res) => {
  try {
    const name     = sanitise(req.body.name,  100);
    const email    = sanitise(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'missing_fields', message: 'name, email, and password are required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'invalid_email', message: 'Please enter a valid email address.' });
    }
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: 'password_weak', message: passwordCheck.message });
    }

    const existing = await db.getUserByEmail(email);
    if (existing) {
      await sendEmail(existing.email, 'Someone tried to sign up with your email', emailAccountExists(existing.name)).catch(() => {});
      return res.json({ success: true, message: 'If an account exists with this email, we\'ve sent a notice to it. Sign in or reset your password if this was you.' });
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
    sendEmail(email, 'Verify your email â€” Mealzy', emailVerifyAddress(name, verifyUrl)).catch(() => {});

    await db.logEvent('signup', { userId }, '');

    setJwtCookie(res, buildSessionPayload({ id: userId, email, pro: false, token_version: 0 }));
    res.json({ success: true, user: { id: userId, name, email, pro: false, ref_code: refCode } });
  } catch(err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/signin
app.post('/api/auth/signin', authLimiter, async (req, res) => {
  try {
    const email    = sanitise(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      return res.status(400).json({ error: 'missing_fields', message: 'email and password are required.' });
    }

    const ip = clientIp(req);

    // Check per-account lockout (15 minutes after 10 failed attempts) and
    // the IP-wide backstop (15 minutes after 50 failed attempts across accounts)
    if (isAccountLocked(email, ip) || isIpLocked(ip)) {
      const retryAfter = 900; // 15 minutes in seconds
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: 'invalid_credentials',
        message: 'Email or password is incorrect.'
      });
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH); // match timing of the real-user path

      const lockResult = recordFailedLogin(email, ip);
      if (lockResult.accountLocked || lockResult.ipLocked) {
        res.setHeader('Retry-After', 900);
        return res.status(429).json({ error: 'invalid_credentials', message: 'Email or password is incorrect.' });
      }
      res.setHeader('Retry-After', 60);
      
      return res.status(401).json({ error: 'invalid_credentials', message: 'Email or password is incorrect.' });
    }

    const storedHash = user.hashed_password || '';

    if (!/^\$2[aby]\$/.test(storedHash)) {
      // Pre-migration account â€” no bcrypt hash to compare against. Reject up front
      // rather than falling through to a comparison that can never succeed.
      logger.warn('[auth] Legacy pre-bcrypt account attempted login', { email });
      await bcrypt.compare(password, DUMMY_HASH); // match timing of the real-user path
      return res.status(401).json({ error: 'invalid_credentials', message: 'Email or password is incorrect.' });
    }

    const valid = await bcrypt.compare(password, storedHash);

    if (!valid) {
      const lockResult = recordFailedLogin(email, ip);
      if (lockResult.accountLocked || lockResult.ipLocked) {
        const retryAfter = lockResult.lockedUntil
          ? Math.ceil((lockResult.lockedUntil - Date.now()) / 1000)
          : 900;
        res.setHeader('Retry-After', retryAfter);
        return res.status(429).json({ error: 'invalid_credentials', message: 'Email or password is incorrect.' });
      }
      res.setHeader('Retry-After', 60);
      return res.status(401).json({ error: 'invalid_credentials', message: 'Email or password is incorrect.' });
    }

    // Success â€” clear failed login attempts for this account
    clearFailedLogins(email, ip);
    setJwtCookie(res, buildSessionPayload(user));
    res.json({ success: true, user: OutputShapes.User(user) });
  } catch(err) {
    console.error('Signin error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/auth/me â€” returns current user (with profile) if JWT is valid
app.get('/api/auth/me', requireSession, async (req, res) => {
  const session = req.session;

  const user = await db.getUserById(session.userId);
  if (!user) {
    clearJwtCookie(res);
    return res.status(401).json({ error: 'user_not_found' });
  }

  // Always refresh the cookie to extend the session while the user is active
  setJwtCookie(res, buildSessionPayload(user, session.loginAt));

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

// POST /api/auth/signout-all â€” revoke all existing sessions for this user
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
      return res.status(400).json({ error: 'invalid_token', message: 'This link has already been used. Try signing in with your new password â€” if that doesn\'t work, request a new reset link.' });
    }
    if (new Date(record.expires_at) < new Date()) {
      await db.markResetTokenUsed(incomingHash);
      return res.status(400).json({ error: 'expired_token', message: 'This link has expired. Reset links are valid for 1 hour â€” please request a new one.' });
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
    sendEmail(user.email, 'Verify your email â€” Mealzy', emailVerifyAddress(user.name, verifyUrl)).catch(() => {});
    res.json({ success: true, message: 'Verification email sent â€” check your inbox.' });
  } catch(err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GOOGLE OAUTH
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const GOOGLE_REDIRECT_URI = process.env.NODE_ENV === 'production'
  ? 'https://mealzy.org/auth/google/callback'
  : 'http://localhost:3000/auth/google/callback';

// GET /auth/google â€” kick off the OAuth flow
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

// GET /auth/google/callback â€” exchange code, upsert user, issue JWT cookie
app.get('/auth/google/callback', async (req, res) => {
  const { code, error, state } = req.query;
  if (error || !code) return res.redirect('/login.html?error=google_cancelled');
  const cookies = parseCookies(req);
  if (!state || state !== cookies.oauth_state) {
    logger.warn('[google-oauth] CSRF state mismatch â€” possible attack');
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PROFILE ENDPOINTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// DELETE /api/profile â€” permanently delete the authenticated user's profile data
app.delete('/api/profile', requireSession, async (req, res) => {
  const session = req.session;
  await db.run('DELETE FROM profiles WHERE user_id = ?', [session.userId]);
  res.json({ success: true });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FAMILY PROFILES (multi-profile for Family plan)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// GET /api/family-profiles â€” list all family profiles for the authenticated user
app.get('/api/family-profiles', requireSession, async (req, res) => {
  const session = req.session;
  const profiles = await db.getFamilyProfiles(session.userId);
  res.json({ success: true, profiles });
});

// POST /api/family-profiles â€” create or update a family profile
// Body: { id (optional â€” omit to create), name, calorieGoal, budget, dietaryRestrictions, avatar }
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DEMO MEAL â€” no auth, rate limited, for homepage interactive demo
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PLAN HISTORY ENDPOINTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PRO ACTIVATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// POST /api/pro/activate â€” called from pro-welcome.html as a belt-and-suspenders
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
  // confirming an active/trialing subscription against the Stripe API directly â€”
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
  user.pro = 1; // reflect the update just made â€” `user` was fetched before setUserPro
  setJwtCookie(res, buildSessionPayload(user, session.loginAt));
  res.json({ success: true, pro: true });
});

// â”€â”€ POST /api/cancel-subscription â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Cancels the user's Stripe subscription at period end and logs survey reason.
app.post('/api/cancel-subscription', stripeLimiter, requireSession, async (req, res) => {
  const session = req.session;

  const user = await db.getUserById(session.userId);
  if (!user) return res.status(404).json({ error: 'user_not_found', message: 'User not found. Please log in again.' });
  if (!user.pro) return res.status(400).json({ error: 'not_pro', message: 'You don\'t have an active Pro subscription to cancel.' });
  if (!user.stripe_customer_id) return res.status(400).json({ error: 'no_stripe_customer', message: 'No active subscription found â€” email support@mealzy.org and we\'ll sort it out immediately.' });

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
      return res.status(404).json({ error: 'no_active_subscription', message: 'No active subscription found â€” email support@mealzy.org and we\'ll sort it out immediately.' });
    }

    const sub = subscriptions.data[0];
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });

    await db.logEvent('cancel_survey', { userId: user.id, reason, detail }, '');
    logger.info(`[cancel] ${user.id} â€” reason: ${reason}`);
    logger.info(`[cancel] ${user.id} — reason: ${reason}`);

    const cancelAt = new Date(sub.current_period_end * 1000).toISOString().split('T')[0];
    res.json({ success: true, cancel_at: cancelAt });
  } catch (e) {
    logger.error('[cancel-subscription] error:', e.message);
    res.status(500).json({ error: 'cancel_failed', message: 'Failed to cancel subscription. Please try again or email support@mealzy.org.' });
  }
});

// â”€â”€ DELETE /api/account â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ GET /api/nps/check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns { show: true } if the user is â‰¥7 days old and hasn't submitted NPS.
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

// â”€â”€ POST /api/nps/submit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Records NPS score (0â€“10) and optional comment, marks user as submitted.
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
    logger.info(`[nps] ${user.id} â€” score: ${score}`);

    res.json({ success: true });
  } catch (e) {
    logger.error('[nps/submit] error:', e.message);
    res.status(500).json({ error: 'submit_failed' });
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STRIPE WEBHOOK â€” server-side Pro activation (primary path)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
        logger.info(`[stripe] Pro activated â€” userId: ${user ? user.id : 'unknown'}`);

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
            logger.info(`[stripe] Pro removed â€” userId: ${user.id}, event: ${event.type}`);
          }
        } else {
          console.warn(`[stripe] ${event.type} â€” no user found for customer ${customerId}`);
        }
      } catch(e) { console.error('[stripe] subscription.deleted error:', e.message); }
    }
  }

  try { await db.markWebhookEventProcessed(event.id); } catch(e) { console.error('[stripe] mark processed error:', e.message); }

  res.json({ received: true });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ADMIN â€” GRANT PRO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
    logger.info(`[admin] Pro granted â€” userId: ${user.id}`);
    res.json({ success: true, message: `Pro activated for ${user.email}` });
  } catch(e) {
    logger.error('[admin grant-pro]', e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ADMIN EXPORT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ANALYTICS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

app.post('/api/track', trackLimiter, async (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).json({ error: 'event required' });
  const dataStr = JSON.stringify(data || {});
  if (dataStr.length > 5000) {
    return res.status(400).json({ error: 'payload_too_large' });
  }
  const ip = clientIp(req);
  await db.logEvent(event, data || {}, ip.slice(-8));
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// REFERRAL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// POST /api/referral â€” credit a referral (called at signup when a pending ref exists)
app.post('/api/referral', authLimiter, requireSession, async (req, res) => {
  // Require authentication â€” only a real signed-in new user can trigger referral credit
  const session = req.session;

  const { referrer_email, new_user_email } = req.body;

  // The authenticated user must be the one being referred
  if (session.email !== (new_user_email || '').toLowerCase()) {
    return res.status(403).json({ error: 'can_only_credit_own_signup' });
  }

  // Referrer must exist in DB â€” referrer_email may be a ref_ code or a raw email
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
  } catch(e) { /* non-fatal â€” proceed */ }

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

// GET /api/referral-capture â€” called when visitor lands with ?ref=EMAIL
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EMAIL LEADS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

app.post('/api/email-leads', leadLimiter, async (req, res) => {
  try {
    const email    = sanitise(req.body.email, 254).toLowerCase();
    const source   = sanitise(req.body.source, 100) || 'unknown';
    const name     = sanitise(req.body.name,   100);
    const discount = req.body.discount ? 1 : 0; // abandonment flow â€” mark for 50% off code
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MEAL GENERATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const DEFAULT_INGREDIENT_COST_USD = 0.50;

function _parseIngredientQuantity(amountStr) {
  const m = String(amountStr || '').match(/[\d.]+/);
  const n = m ? parseFloat(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function _findIngredientPriceRow(name, priceRows) {
  const norm = String(name || '').toLowerCase().trim();
  if (!norm) return null;
  return priceRows.find(p => p.name === norm)
    || priceRows.find(p => norm.includes(p.name) || p.name.includes(norm))
    || null;
}

/** Deterministic ingredient-cost lookup: matches ingredient names against
 * ingredient_prices, falls back to a flat default for unmatched items.
 * Never asks the AI to guess prices. */
async function calculateMealCost(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) return 0;
  const priceRows = await db.getIngredientPrices();
  let total = 0;
  for (const ing of ingredients) {
    const priceRow = _findIngredientPriceRow(ing?.name, priceRows);
    total += priceRow
      ? priceRow.price_per_unit * _parseIngredientQuantity(ing?.amount)
      : DEFAULT_INGREDIENT_COST_USD;
  }
  return Math.round(total * 100) / 100;
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

    // â”€â”€ Freemium gate: server-side pro check is authoritative â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    ); // plan bypass â€” fails closed if PRO_TOKEN unset/short/mismatched

    if (!isPro && session) {
      // Re-query DB â€” the JWT payload may be stale if Pro was just activated
      isPro = sessionUser?.pro === 1;
    }

    // â”€â”€ Quota check (read-only) â€” credits/trial state are only *consumed* later,
    // after the plan passes validation (see below).
    const ip = clientIp(req);
    let anonUsage = null;
    let trialLocalDate = null;
    if (!swap_meal_type && !isPro) {
      if (session) {
        // â”€â”€ Logged-in free users: 30-day daily trial, 1 plan per local calendar day â”€â”€
        if (weekStart) {
          return res.status(400).json({
            error: 'week_mode_unavailable_on_trial',
            message: 'Full week generation isn\'t available during your free trial. Generate today\'s plan instead.',
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
        if (Date.now() >= trialEndsAtMs) {
          await db.logEvent('free_trial_expired', { userId: session.userId }, '');
          return res.status(402).json({
            error: 'free_limit_reached',
            message: 'Your 30-day free trial has ended.',
            upgrade_url: '/pricing.html',
            resets_in: null,
            used: null,
            limit: null
          });
        }

        const alreadyToday = await db.getTrialGenerationByDate(session.userId, trialLocalDate);
        if (alreadyToday) {
          await db.logEvent('trial_already_generated_today', { userId: session.userId }, '');
          return res.status(409).json({
            error: 'already_generated_today',
            message: 'You already generated a plan today. Come back tomorrow for your next one.'
          });
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

    // â”€â”€ Profile field extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const name               = sanitise(profile.name || 'User', 100);
    const goal               = sanitise(profile.fitness_goal || profile.goal || 'eat healthier', 200);
    const dietaryPrefs       = Array.isArray(profile.dietary_preferences || profile.dietaryPrefs) ? (profile.dietary_preferences || profile.dietaryPrefs) : [];
    const allergies          = capList(profile.allergies, 20, 40);
    const cookingSkill       = sanitise(profile.cooking_skill || profile.cookingSkill || 'intermediate', 50);
    const dailyCalories      = Math.min(4000, Math.max(1200, Number(profile.daily_calories || profile.dailyCalories || 2000)));
    const dailyProtein       = Number(profile.daily_protein  || (profile.macros?.protein) || 150);
    const dailyCarbs         = Number(profile.daily_carbs    || (profile.macros?.carbs) || 200);
    const dailyFat           = Number(profile.daily_fat      || (profile.macros?.fat) || 65);
    const budget             = Number(profile.budget_weekly  || profile.budget || 100);
    const currency           = sanitise(profile.currency || 'USD', 10);
    const cookingTimeMinutes = Number(profile.cooking_time_minutes || profile.cookingTimeMinutes || 30);
    const language           = sanitise(profile.language || 'en', 10);
    const languageNames = { en:'English',sv:'Swedish',no:'Norwegian',da:'Danish',de:'German',fr:'French',es:'Spanish',it:'Italian',pt:'Portuguese',nl:'Dutch',ja:'Japanese',fi:'Finnish',pl:'Polish',tr:'Turkish',ko:'Korean',zh:'Chinese',ar:'Arabic',hi:'Hindi',ru:'Russian' };
    const languageName   = languageNames[language] || 'English';
    const priceTierMultiplier = profile.price_tier === 'budget' ? 0.8 : profile.price_tier === 'premium' ? 1.3 : 1.0;
    const priceTierLabel = profile.price_tier === 'budget' ? 'Budget' : profile.price_tier === 'premium' ? 'Premium' : 'Mid-range';
    const dailyBudget    = (budget / 7 * priceTierMultiplier).toFixed(2);
    const perMealBudget  = (budget / 7 / 4 * priceTierMultiplier).toFixed(2);

    // â”€â”€ Dietary restriction enforcement â€” explicit banned lists per preference â”€â”€
    // These blocks go at the TOP of all meal plan prompts (most important instruction first).
    const DIET_RULES = {
      vegan:       'VEGAN â€” zero animal products. NEVER use: meat, fish, seafood, chicken, beef, pork, lamb, turkey, duck, eggs, milk, cheese, butter, cream, yoghurt, honey, ghee, lard, whey, gelatin. Use ONLY: vegetables, fruits, legumes, grains, nuts, seeds, plant-based oils, tofu, tempeh, seitan (if not GF), coconut milk, oat milk, soy milk, almond milk.',
      vegetarian:  'VEGETARIAN â€” no meat or fish. NEVER use: chicken, beef, pork, lamb, turkey, duck, fish, salmon, tuna, shrimp, prawns, cod, sardines, anchovies, bacon, ham, sausage. Eggs and dairy are allowed.',
      'gluten-free':'GLUTEN-FREE â€” no gluten. NEVER use: wheat, white flour, bread, sourdough, toast, wrap, pita, tortilla, pasta, noodles, couscous, barley, rye, seitan, soy sauce (use tamari), malt, crackers, croutons, breadcrumbs, regular oats. ALLOWED: rice, quinoa, potatoes, corn, certified GF oats, rice noodles, tamari.',
      keto:        'KETO â€” max 25g total net carbs per day across all 4 meals. NEVER use: bread, pasta, rice, potatoes, corn, tortillas, wraps, noodles, couscous, sugar, honey, fruit juice, bananas, grapes, mangoes, apples, oranges, lentils, chickpeas, beans, peas, sweet potatoes, quinoa. ALLOWED: meat, fish, eggs, cheese, cream, butter, avocado, leafy greens, cauliflower, broccoli, zucchini, nuts, seeds, olive oil.',
      halal:       'HALAL â€” no pork or alcohol. NEVER use: pork, bacon, ham, lard, gelatin (unless halal-certified), alcohol, wine, beer in cooking.',
      'dairy-free':'DAIRY-FREE â€” no dairy. NEVER use: milk, cheese, butter, cream, yoghurt, ghee, whey, casein. Use: plant-based alternatives like coconut milk, oat milk, soy milk, vegan butter.',
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
      ? `\nâš ï¸ DIETARY RULES â€” HIGHEST PRIORITY â€” THESE OVERRIDE EVERYTHING ELSE:\n${activeDietRules}\nDouble-check every ingredient against these rules before including it.\n`
      : '';
    const allergyBlock = allergies.length > 0
      ? `\nâš ï¸ ALLERGY WARNING â€” NEVER include these ingredients in any form: ${allergies.join(', ')}.\n`
      : '';
    const clientAvoidList = capList(avoid_meals, 30, 80);
    const dislikedMeals = session ? await db.getUserDislikedMeals(session.userId) : [];
    const avoidList = Array.from(new Set([...clientAvoidList, ...dislikedMeals])).slice(0, 60);
    const avoidBlock = avoidList.length > 0
      ? `STRICT AVOID â€” do not include any of these previously rejected meals: ${avoidList.join(', ')}.`
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
    // Filter protein suggestions to match dietary restrictions â€” prevents biasing the model with forbidden proteins
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

    // â”€â”€ JSON schema embedded in the prompt for reliable parsing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const mealSchema = `{
  "type": "breakfast|lunch|dinner|snack",
  "name": "string",
  "description": "string â€” MUST start with a cooking method word (e.g. Grilled, Pan-seared, Slow-cooked, Roasted, Baked, Crispy, SautÃ©ed). Format: [Method] [ingredient] with [accompaniment]. Under ${isPro ? '15' : '10'} words.",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "cookTime": number,
  "servings": 1,
  "estimatedCost": number,
  "ingredients": [{ "name": "string", "amount": "string", "cost": number }],
  "instructions": ["string"],
  "imageKeyword": "simple English food keyword e.g. scrambled eggs"
}`;

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // SINGLE MEAL SWAP
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if (swap_meal_type) {
      const mealCalories = { breakfast: Math.round(dailyCalories * 0.25), lunch: Math.round(dailyCalories * 0.35), dinner: Math.round(dailyCalories * 0.30), snack: Math.round(dailyCalories * 0.10) };
      const targetCals   = mealCalories[swap_meal_type] || Math.round(dailyCalories * 0.25);

      const swapPrompt = `${dietaryBlock}${allergyBlock}Generate ONE practical home-cooked ${swap_meal_type} meal for ${name}.

Cuisine: ${todayCuisine}. Featured protein: ${todayProtein}. Variety seed: ${randomSeed}.
Target: ~${targetCals} kcal. Cooking skill: ${cookingSkill}. Max time: ${cookingTimeMinutes} min.
Budget: max ${currency} ${perMealBudget} for this meal. Use common supermarket ingredients only.

${avoidBlock}

LANGUAGE: All meal name, description, and ingredient names MUST be in ${languageName}. JSON keys stay in English.

Respond ONLY with valid JSON matching this exact schema (no markdown, no extra text):
${mealSchema.replace('"type": "breakfast|lunch|dinner|snack"', `"type": "${swap_meal_type}"`)}`;

      const completion = await callAnthropicWithSpendCap({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system: [{ type: 'text', text: 'You are a professional nutritionist and chef. Always respond with valid JSON only, no markdown fences, no explanation. Never include ingredients that violate dietary restrictions or allergies.', cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: swapPrompt }]
      });

      const meal = parseJsonResponse(completion.content[0].text);
      meal.cost = await calculateMealCost(meal.ingredients);

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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // FULL MEAL PLAN â€” one day's worth of meals, called once per day
    // (7 times for a week, once for the legacy single-day path)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
      ? `BATCH COOKING MODE: Make dinner yield 3 servings. Schedule the leftovers as Tuesday and Wednesday lunch automatically â€” label them as 'Leftover: [dinner name]' with identical macros. This reduces daily cooking time significantly.`
      : '';

    // Prompt caching: stable role block cached, volatile dietary block appended uncached
    const _baseSys = isPro
      ? 'You are a professional nutritionist and executive chef. Respond with valid JSON only, no markdown. Pro users deserve restaurant-quality recipes â€” detailed techniques, precise measurements. NEVER violate dietary restrictions or allergies â€” this is non-negotiable.'
      : 'You are a professional nutritionist. Respond with valid JSON only, no markdown. Keep instructions simple and concise. NEVER violate dietary restrictions or allergies â€” this is non-negotiable.';
    const _sysBlocks = [{ type: 'text', text: _baseSys, cache_control: { type: 'ephemeral' } }];
    if (dietaryBlock) _sysBlocks.push({ type: 'text', text: `CRITICAL: ${activeDietRules.split('\n')[0]}` });

    /** Generates and validates ONE day's 4-meal plan. Throws AllergyViolationError
     * if a generated meal contains a declared allergen. Never trusts AI totals â€”
     * calorie/macro/cost sums are always recomputed here. */
    async function generateDayMealPlan(dayDate, variety) {
      const { todayCuisine, todayProtein, randomSeed } = variety;

      const fullPlanPrompt = `${dietaryBlock}${allergyBlock}${ingredientOverlapLine}

Generate a practical, delicious daily meal plan for ${name} on ${dayDate}.

Cuisine style: ${todayCuisine}. Variety seed: ${randomSeed}. Suggested protein for ONE meal only: ${todayProtein} (use different proteins across other meals for variety â€” no protein should appear in more than 2 of the 4 meals).
Use real, everyday supermarket ingredients. Meals must be realistic for a home cook.

User profile:
- Goal: ${goal}
- Daily calorie target: ${dailyCalories} kcal TOTAL (Protein ${dailyProtein}g / Carbs ${dailyCarbs}g / Fat ${dailyFat}g)
- PER-MEAL CALORIE TARGETS (each meal MUST hit within Â±15% of its target):
  Breakfast: ${mealCalorieTargets.breakfast} kcal | Lunch: ${mealCalorieTargets.lunch} kcal | Dinner: ${mealCalorieTargets.dinner} kcal | Snack: ${mealCalorieTargets.snack} kcal
- Cooking skill: ${cookingSkill}
- Max time per meal: ${cookingTimeMinutes} min
- STRICT DAILY BUDGET: ${currency} ${dailyBudget} total. Each meal max ${currency} ${perMealBudget}. estimatedCost across all 4 meals MUST NOT exceed ${currency} ${dailyBudget}.
- User's price tier: ${priceTierLabel}. Adjust ingredient quality and brand expectations accordingly â€” Budget means value supermarket staples, Premium means quality cuts and fresh produce.

${batchCookingLine ? batchCookingLine + '\n\n' : ''}${avoidBlock}

${proInstructions}

LANGUAGE: Write ALL meal names, descriptions, and ingredient names in ${languageName}. JSON keys stay in English.

Generate exactly 4 meals: breakfast, lunch, dinner, snack.
${dietaryBlock ? `Remember: ${activeDietRules.split('\n')[0]}` : ''}

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

      // â”€â”€ Macro sanity check + daily sums â€” computed in code, never trusted from the model â”€â”€
      if (mealPlan.meals) {
        const sums = { calories: 0, protein: 0, carbs: 0, fat: 0, cost: 0 };
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
          meal.cost      = await calculateMealCost(meal.ingredients);
          sums.cost     += meal.cost;
        }
        mealPlan.totalCalories = Math.round(sums.calories);
        mealPlan.totalProtein  = Math.round(sums.protein);
        mealPlan.totalCarbs    = Math.round(sums.carbs);
        mealPlan.totalFat      = Math.round(sums.fat);
        mealPlan.totalCost     = Math.round(sums.cost * 100) / 100;
      }

      // â”€â”€ Allergy enforcement â€” server-side scan after AI generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
      // WEEK MODE â€” 1 generation credit unlocks a full 7-day plan
      // (21 meals + snacks), matching the marketing promise and the
      // 7-day grid on meal-planner.html.
      // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
      const days = [];
      let prevCuisine = null;
      for (let i = 0; i < 7; i++) {
        const dayDate = addDaysToDateStr(weekStart, i);
        const variety = pickDayVariety(prevCuisine);
        prevCuisine = variety.todayCuisine;

        let dayMealPlan;
        try {
          dayMealPlan = await generateDayMealPlan(dayDate, variety);
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
      }

      // â”€â”€ Weekly totals â€” sums and per-day averages computed in code, never trusted from the model â”€â”€
      const weeklyTotals = days.reduce((acc, d) => {
        acc.totalCalories += d.totalCalories || 0;
        acc.totalProtein  += d.totalProtein  || 0;
        acc.totalCarbs    += d.totalCarbs    || 0;
        acc.totalFat      += d.totalFat      || 0;
        acc.totalCost     += d.totalCost     || 0;
        return acc;
      }, { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, totalCost: 0 });
      weeklyTotals.totalCost   = Math.round(weeklyTotals.totalCost * 100) / 100;
      weeklyTotals.avgCalories = Math.round(weeklyTotals.totalCalories / 7);
      weeklyTotals.avgProtein  = Math.round(weeklyTotals.totalProtein  / 7);
      weeklyTotals.avgCarbs    = Math.round(weeklyTotals.totalCarbs    / 7);
      weeklyTotals.avgFat      = Math.round(weeklyTotals.totalFat      / 7);

      // â”€â”€ Quota consumption â€” 1 credit for the whole week, only after every
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
        try {
          await db.savePlan(weekPlanId, session.userId, { weekStart, days, weeklyTotals, savedAt: new Date().toISOString() });
        } catch (saveErr) {
          console.error('[generate-meal] week DB save error (non-fatal):', saveErr);
        }
      }

      res.json({ success: true, weekStart, days, weeklyTotals });

      // Auto-generate and persist each day's grocery list in the background â€”
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // SINGLE-DAY MODE (legacy) â€” used by dashboard.html's "today" widget.
    // Kept unchanged so it doesn't affect the 7-day credit accounting above.
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    let mealPlan;
    try {
      mealPlan = await generateDayMealPlan(date, { todayCuisine, todayProtein, randomSeed });
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

    // â”€â”€ Quota consumption â€” only now, after the plan has passed allergy/macro
    // validation and is guaranteed to be returned. Errors and rejects above never reach here.
    if (!swap_meal_type) {
      if (isPro) {
        await db.logEvent('generate_plan', { pro: true }, '');
      } else if (session) {
        await db.recordTrialGeneration(session.userId, trialLocalDate, planId);
        await db.logEvent('generate_plan', { userId: session.userId, trialLocalDate }, '');
      } else {
        incrementUsage(ip);
        await db.logEvent('generate_plan', { plan_num: (anonUsage?.count || 0) + 1 }, '');
      }
    }

    await attachMealImages(mealPlan.meals);

    if (session) {
      try {
        await db.savePlan(planId, session.userId, { date: planDate, plan: mealPlan, savedAt: new Date().toISOString() });
      } catch (saveErr) {
        console.error('[generate-meal] DB save error (non-fatal):', saveErr);
      }
    }

    res.json({ success: true, date, mealPlan });

    // Auto-generate and persist this day's grocery list in the background â€”
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GROCERY LIST
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/** Derive the weekday name (Monday..Sunday) from a YYYY-MM-DD date string. */
function getDayNameFromDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return 'Unspecified';
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
}

/**
 * Calls the AI to build a categorized grocery list for the given meals.
 * When `day` is passed, every item is tagged with that single day (used by the
 * per-day auto-generation flow). Otherwise the AI is asked to infer each
 * item's day from context (used by the multi-day manual fallback).
 */
async function generateGroceryListForMeals({ meals, profile, weekStart, day }) {
  const { budget = 100, currency = 'USD', dietaryPrefs = [], allergies = [], language: groceryLang = 'en' } = profile || {};
  const langNames = { en:'English',sv:'Swedish',no:'Norwegian',da:'Danish',de:'German',fr:'French',es:'Spanish',it:'Italian',pt:'Portuguese',nl:'Dutch',ja:'Japanese',fi:'Finnish',pl:'Polish',tr:'Turkish',ko:'Korean',zh:'Chinese',ar:'Arabic',hi:'Hindi',ru:'Russian' };
  const langName  = langNames[groceryLang] || 'English';

  const mealList    = meals.map(m => `- ${m.name} (${m.type})`).join('\n');
  const allergyInfo = allergies.length > 0 ? `ALLERGY WARNING â€” never include: ${allergies.join(', ')}.` : '';
  const prefInfo    = dietaryPrefs.length > 0 ? `Dietary preferences: ${dietaryPrefs.join(', ')}. All items must comply.` : '';
  const dayLine     = day
    ? `All these meals are for ${day}. Tag every item's "day" field as "${day}".`
    : `Tag each item's "day" field with the day of the week (Monday..Sunday) it is needed for, inferred from the meal list order. If it can't be determined, use "Unspecified".`;
  const exampleDay  = day || 'Monday';

  const prompt = `Generate a complete grocery list for the following meals:\n\n${mealList}\n\n${prefInfo}\n${allergyInfo}\n${dayLine}\nBudget: ${currency} ${budget}. Keep total cost at or under this amount.\nWrite all ingredient names in ${langName}. JSON keys stay in English.\nConsolidate duplicate ingredients. Group by category.\n\nRespond ONLY with valid JSON:\n{\n  "weekStart": "${weekStart || ''}",\n  "totalCost": 85.50,\n  "budgetAmount": ${budget},\n  "currency": "${currency}",\n  "categories": {\n    "produce": [{ "name": "Spinach", "amount": "200g", "cost": 2.50, "checked": false, "day": "${exampleDay}" }],\n    "protein": [],\n    "dairy": [],\n    "grains": [],\n    "pantry": [],\n    "frozen": [],\n    "beverages": [],\n    "other": []\n  }\n}`;

  const completion = await callAnthropicWithSpendCap({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    system: 'You are a professional nutritionist. Always respond with valid JSON only, no markdown.',
    messages: [{ role: 'user', content: prompt }]
  });

  return parseJsonResponse(completion.content[0].text);
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
  message: { error: "You're sending requests too fast â€” wait 60 seconds and try again." },
  keyGenerator: (req) => req.grocerySession.userId,
});

const GROCERY_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

app.post('/api/generate-grocery-list', requireGrocerySession, requireVerifiedEmail, groceryLimiter, async (req, res) => {
  try {
    const session = req.grocerySession;

    const { profile = {}, meals: rawMeals, weekStart: rawWeekStart, day: rawDay, planId: requestedPlanId } = req.body;

    profile.allergies    = capList(profile.allergies, 20, 40);
    profile.dietaryPrefs = capList(profile.dietaryPrefs, 20, 40);

    const meals = Array.isArray(rawMeals)
      ? rawMeals.slice(0, 50).map(m => ({ name: sanitise(m?.name, 100), type: sanitise(m?.type, 30) }))
      : [];
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
        // Single-day generate/refresh â€” reuse the caller's planId only if it
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

// GET /api/grocery-list/trial-summary â€” aggregated running total across every day
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

// GET /api/grocery-list/:planId/days â€” available days for the day-switcher UI
// (registered before the /:day route below â€” otherwise Express would match "days" as a day value)
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// AI COACH
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const coachLimiterFree = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're sending messages too fast â€” wait 60 seconds and try again." },
  keyGenerator: (req) => req.coachSession.userId,
});

const coachLimiterPro = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're sending messages too fast â€” wait 60 seconds and try again." },
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
If a user mentions restricting, purging, skipping meals excessively, or any disordered eating behaviour, do not engage with the restriction plan â€” instead warmly encourage them to speak with a healthcare professional or eating disorder support service.
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FALLBACK MEAL PLAN (returned when AI generation fails)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function generateFallbackMealPlan(profile) {
  const calories = profile?.dailyCalories || 2000;
  return {
    meals: [
      { type:'breakfast',name:'Greek Yogurt Parfait',description:'Creamy Greek yogurt layered with fresh berries and granola',calories:Math.round(calories*.25),protein:20,carbs:35,fat:8,cookTime:5,servings:1,estimatedCost:3.50,ingredients:[{name:'Greek yogurt',amount:'200g',cost:1.80},{name:'Mixed berries',amount:'100g',cost:1.20},{name:'Granola',amount:'50g',cost:0.50}],instructions:['Spoon yogurt into a bowl.','Layer with fresh berries.','Top with granola and serve.'] },
      { type:'lunch',name:'Grilled Chicken Salad',description:'Tender grilled chicken over crisp greens with avocado',calories:Math.round(calories*.30),protein:40,carbs:20,fat:18,cookTime:20,servings:1,estimatedCost:6.00,ingredients:[{name:'Chicken breast',amount:'150g',cost:3.00},{name:'Mixed salad greens',amount:'100g',cost:1.20},{name:'Avocado',amount:'1/2',cost:1.00},{name:'Cherry tomatoes',amount:'100g',cost:0.80}],instructions:['Season and grill chicken 6-7 min per side.','Let rest 5 min, then slice.','Arrange over greens with avocado and lemon juice.'] },
      { type:'snack',name:'Apple with Almond Butter',description:'Crisp apple slices with creamy almond butter',calories:Math.round(calories*.10),protein:5,carbs:25,fat:8,cookTime:2,servings:1,estimatedCost:2.00,ingredients:[{name:'Apple',amount:'1 medium',cost:0.80},{name:'Almond butter',amount:'2 tbsp',cost:1.20}],instructions:['Wash and slice the apple.','Serve with almond butter for dipping.'] },
      { type:'dinner',name:'Salmon with Roasted Vegetables',description:'Pan-seared salmon with colorful roasted seasonal vegetables',calories:Math.round(calories*.35),protein:45,carbs:30,fat:20,cookTime:30,servings:1,estimatedCost:9.00,ingredients:[{name:'Salmon fillet',amount:'200g',cost:5.00},{name:'Broccoli',amount:'150g',cost:1.20},{name:'Bell pepper',amount:'1',cost:1.00},{name:'Olive oil',amount:'1 tbsp',cost:0.30}],instructions:['Roast veg at 200Â°C for 20 min.','Cook salmon 4 min per side.','Serve with lemon wedge.'] }
    ],
    totalCalories: calories,
    totalCost: 20.50,
    nutritionNote: 'Balanced meal plan with lean proteins, complex carbs, and healthy fats.'
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// XP / GAMIFICATION ENDPOINT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// POST /api/xp/award â€” award XP to the authenticated user (server validates)
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

    // Streak logic â€” only runs on generate_plan (the daily engagement action)
    let streakIncremented = false;
    if (action === 'generate_plan') {
      const today     = new Date().toISOString().split('T')[0];
      const lastActive = profile.lastActiveDate || null;
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      if (lastActive === today) {
        // already active today â€” no change
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

// POST /api/meal-feedback â€” record a like/dislike/swap for a meal (server-authoritative userId)
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

// GET /api/share-card/:userId â€” public, no auth required
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SHAREABLE MEAL PLANS â€” public, no login
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const PLAN_SHARE_DAYS = new Set([
  'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
  'Today','Unspecified'
]);

// POST /api/plans/share â€” generate a shareable link for a plan
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

// GET /api/shared-plan/:shareId â€” public, no auth
app.get('/api/shared-plan/:shareId', async (req, res) => {
  const { shareId } = req.params;
  if (!shareId || shareId.length > 20) return res.status(404).json({ error: 'Not found' });

  const link = await db.getShareLink(shareId);
  if (!link) return res.status(404).json({ error: 'Plan not found or link expired' });

  await db.incrementShareViews(shareId);
  res.json({ success: true, plan: link.plan, views: (link.views || 0) + 1 });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// REF CODE LOOKUP â€” handles /?ref=CODE on homepage
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// GET /api/ref-lookup?code=ref_ABC123 â€” resolves a code to an email for referral credit
app.get('/api/ref-lookup', authLimiter, async (req, res) => {
  const { code } = req.query;
  if (!code) return res.json({ found: false });
  if (code.startsWith('ref_')) {
    const user = await db.getUserByRefCode(code);
    return res.json({ found: !!user });
  }
  res.json({ found: false });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ANALYTICS FUNNEL â€” admin endpoint
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CRON ENDPOINTS â€” called by Render cron job or external scheduler
// Secured with a cron-specific secret header: x-cron-secret
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// POST /api/cron/day3-nudge â€” send day-3 nudge emails to unconverted users
app.post('/api/cron/day3-nudge', cronLimiter, async (req, res) => {
  if (!cronAuth(req, res)) return;
  try {
    const users = await db.getUsersNeedingNudge();
    let sent = 0;
    for (const user of users) {
      const result = await sendEmail(
        user.email,
        "You've got 2 free plans left this month â€” here's what Pro unlocks",
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

// POST /api/cron/weekly-digest â€” send weekly reminder to all active free users
app.post('/api/cron/weekly-digest', cronLimiter, async (req, res) => {
  if (!cronAuth(req, res)) return;
  try {
    const users = await db.getUsersForWeeklyDigest();
    let sent = 0;
    for (const user of users) {
      const result = await sendEmail(
        user.email,
        'New week â€” generate your meal plan in 30 seconds',
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

// â”€â”€ Recipe routes (photo import, save, list) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
require('./routes/recipes')(app, { anthropic, requireSession, requireVerifiedEmail, generateLimiter, db, callAnthropicWithSpendCap });
require('./routes/favorites')(app, { requireSession, db });

// â”€â”€ Blog routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'blog', 'index.html'));
});
app.use('/blog', express.static(path.join(__dirname, 'public', 'blog'), {
  setHeaders: setSecurityHeaders
}));

// â”€â”€ React build pages: serve the matching dist/*.html instead of index.html â”€â”€
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

// â”€â”€ Catch-all: serve index.html â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('*', async (req, res) => {
  if (hasDistBuild) {
    return res.sendFile(path.join(distDir, 'index.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// â”€â”€ Global error handler â€” prevents unhandled exceptions from crashing the server â”€â”€
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
  // Don't exit â€” Render will restart if truly unrecoverable
});

// â”€â”€ Start server after DB is ready â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
db.initDb().then(async () => {
  app.listen(PORT, async () => {
    logger.info(`Mealzy running on http://localhost:${PORT}`);

    // Startup self-test â€” Avery checks these logs after every deploy
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

    // â”€â”€ Avery: keep-alive ping â€” prevents Render free tier spin-down â”€â”€â”€â”€â”€â”€
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
