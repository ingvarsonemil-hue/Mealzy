/**
 * Mealzy server.js
 *
 * Sessions  : stateless JWT in httpOnly cookie — survive server restarts
 * Persistence: SQLite via sql.js (see db.js) — survives browser clears
 * Payments   : Stripe webhook activates Pro server-side, regardless of redirect
 */

'use strict';

require('dotenv').config();

// ── JWT secret guard — refuse to start without it ──────────────────────────
if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET is not set. Set it in .env or Render env vars before starting.');
  process.exit(1);
}

const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const { randomUUID } = require('crypto');
const jwt          = require('jsonwebtoken');
const bcrypt       = require('bcryptjs');
const rateLimit    = require('express-rate-limit');
const Anthropic    = require('@anthropic-ai/sdk');
const winston      = require('winston');
const db           = require('./db');

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

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust Render's proxy so express-rate-limit can read the real client IP
app.set('trust proxy', 1);

const JWT_SECRET    = process.env.JWT_SECRET;
const JWT_EXPIRES   = '24h';
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

// ── Security headers on every response ────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://js.stripe.com https://accounts.google.com https://cdn.jsdelivr.net https://www.googletagmanager.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net; " +
    "font-src https://fonts.gstatic.com https://cdn.jsdelivr.net; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.stripe.com https://accounts.google.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net; " +
    "frame-src https://js.stripe.com;"
  );
  next();
});

// ── Admin middleware ────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    logger.warn('[admin] Unauthorized attempt', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Stripe webhook needs raw body — must be BEFORE express.json() ─────────
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

// ── Explicit CORS configuration with allowlist ─────────────────────────────
const cors = require('cors');
app.use(cors({
  origin: ['https://mealzy.org', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token', 'x-pro-token', 'x-cron-secret']
}));

app.use(express.json({ limit: '1mb' }));

// ── Page view tracking (fires before static files are served) ──
app.use((req, res, next) => {
  if (req.method === 'GET' && (req.path.endsWith('.html') || req.path === '/')) {
    const page = req.path === '/' ? '/index.html' : req.path;
    const ip   = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    db.logEvent('page_view', { page }, ip.slice(-8)).catch(() => {});
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// TikTok domain verification
app.get('/tiktok5D5PTssMk9TzIVSQAXCcHPlwQwQ52nQc.txt', async (req, res) => {
  res.type('text/plain').send('tiktok-developers-site-verification=5D5PTssMk9TzIVSQAXCcHPIwQwQ52nQc');
});

// ── Rate limiters ──────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' }
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

// ── Cookie helpers ─────────────────────────────────────────────────────────
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

// ── Input sanitisation helpers ─────────────────────────────────────────────
function sanitise(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

// ── In-memory usage tracker (free-plan generation cap) ────────────────────
const usageTracker = new Map();
const FREE_PLAN_LIMIT = 3;
const referralBonus   = new Map(); // kept for in-session backward compat; SQLite is source of truth

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
const anthropic = new Anthropic({ apiKey: _anthropicKey });

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

// ── Email HTML templates ──────────────────────────────────────────────────────

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
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">Reset your password</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Hi ${name || 'there'}, here's your password reset link. It expires in 15 minutes.</p>
    <a href="${resetUrl}" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">Reset My Password →</a>
    <p style="color:#888;font-size:13px;margin:0;">Or paste this link in your browser:<br/><span style="color:#3d8b5e;word-break:break-all;">${resetUrl}</span></p>
    <p style="color:#aaa;font-size:12px;margin-top:16px;">If you didn't request this, ignore this email. Your password won't change.</p>
  `);
}

function emailDay3Nudge(name, plansLeft) {
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">You've got ${plansLeft} free plan${plansLeft !== 1 ? 's' : ''} left this month 🥗</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${name || 'there'} — you signed up 3 days ago. Here's what Pro unlocks when you're ready:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      ${['Unlimited AI meal plans — every week, every goal change', 'PDF export — print your plan, take it to the shop', 'Unlimited AI coaching with Mia — ask anything, any time', 'Advanced macros per meal — protein, carbs, fat broken down'].map(f => `
      <tr><td style="padding:6px 0;color:#333;font-size:14px;">✅ ${f}</td></tr>`).join('')}
    </table>
    <a href="https://mealzy.org/upgrade.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:16px;">Start Pro — 7 Days Free →</a>
    <p style="color:#888;font-size:13px;margin:0;">$8/month. Cancel any time with one click.</p>
  `);
}

function emailLimitHit(name) {
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">You hit your free plan limit 🚀</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${name || 'there'} — you've used all your free plans this month. That means you're actually using Mealzy — which is great.</p>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Upgrade to Pro and never hit a limit again. Your <strong>7-day free trial</strong> starts the moment you click — no charge until the trial ends.</p>
    <a href="https://mealzy.org/upgrade.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:16px;">Start My 7-Day Free Trial →</a>
    <p style="color:#888;font-size:13px;margin:0;">$8/month after the trial. Cancel any time.</p>
  `);
}

function emailReferralReward(name, referredName) {
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">🎉 You earned a free month of Pro!</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${name || 'there'} — ${referredName || 'someone you referred'} just upgraded to Pro. As a thank you, we've added <strong>30 days of Pro</strong> to your account.</p>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">Your Pro access is now active. Enjoy unlimited meal plans, PDF export, advanced macros, and unlimited AI coaching.</p>
    <a href="https://mealzy.org/dashboard.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:16px;">Go to My Dashboard →</a>
  `);
}

function emailWeeklyDigest(name) {
  return emailBase(`
    <h2 style="color:#1a1a1a;font-size:22px;font-weight:800;margin:0 0 12px;">New week — new meal plan 🥗</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${name || 'there'} — it's a new week. Take 30 seconds to generate your meal plan and you'll know exactly what to eat (and spend) all week.</p>
    <a href="https://mealzy.org/meal-planner.html" style="display:inline-block;background:#3d8b5e;color:white;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">Generate This Week's Plan →</a>
    <hr style="border:none;border-top:1px solid #e8f0eb;margin:24px 0"/>
    <p style="color:#888;font-size:13px;margin:0 0 12px;">Want more? <a href="https://mealzy.org/upgrade.html" style="color:#3d8b5e;font-weight:700;">Upgrade to Pro</a> for unlimited plans, PDF export, and unlimited AI coaching — $8/month.</p>
  `);
}

// ════════════════════════════════════════════════════════════════════════════
// HEALTH
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try { dbOk = await db.ping(); } catch(e) {}
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'error',
    timestamp: new Date().toISOString(),
    version: '3.0.0'
  });
});

// ── Supabase config shim (kept for HTML pages that still load it) ──────────
app.get('/supabase-config.js', async (req, res) => {
  res.type('js').send(
    `window.SUPABASE_URL=${JSON.stringify(process.env.SUPABASE_URL || '')};` +
    `window.SUPABASE_KEY=${JSON.stringify(process.env.SUPABASE_ANON_KEY || '')};`
  );
});

// ── Stripe payment links — served from env vars so links update without code deploys ──
// To add a new plan: set the env var in .env (local) + Render dashboard (production), redeploy.
const STRIPE_MONTHLY_FALLBACK = 'https://buy.stripe.com/28E28r1Q73q0e6neQRffy00';
app.get('/stripe-config.js', async (req, res) => {
  const monthly        = process.env.STRIPE_MONTHLY_URL        || STRIPE_MONTHLY_FALLBACK;
  const annual         = process.env.STRIPE_ANNUAL_URL         || monthly; // falls back to monthly if annual not set
  const familyMonthly  = process.env.STRIPE_FAMILY_MONTHLY_URL || monthly;
  const familyAnnual   = process.env.STRIPE_FAMILY_ANNUAL_URL  || monthly;
  const discount       = process.env.STRIPE_DISCOUNT_URL       || monthly;
  res.type('js').send(
    `window.STRIPE_MONTHLY=${JSON.stringify(monthly)};` +
    `window.STRIPE_ANNUAL=${JSON.stringify(annual)};` +
    `window.STRIPE_FAMILY_MONTHLY=${JSON.stringify(familyMonthly)};` +
    `window.STRIPE_FAMILY_ANNUAL=${JSON.stringify(familyAnnual)};` +
    `window.STRIPE_DISCOUNT=${JSON.stringify(discount)};` +
    `window.STRIPE_ANNUAL_READY=${JSON.stringify(!!process.env.STRIPE_ANNUAL_URL)};`
  );
});

// ════════════════════════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

// POST /api/auth/signup
app.post('/api/auth/signup', authLimiter, async (req, res) => {
  try {
    const name     = sanitise(req.body.name,  100);
    const email    = sanitise(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'missing_fields', message: 'name, email, and password are required.' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'invalid_email', message: 'Please enter a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password_too_short', message: 'Password must be at least 8 characters.' });
    }

    const existing = await db.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'account_exists', message: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = randomUUID();
    await db.createUser({ id: userId, name, email, hashedPassword });

    // Generate short referral code ref_[6 alphanumeric chars]
    const refCode = 'ref_' + Math.random().toString(36).slice(2, 8).toUpperCase();
    try { await db.setUserRefCode(userId, refCode); } catch(e) {}
    try { await db.run('UPDATE users SET signup_date = ? WHERE id = ?', [new Date().toISOString(), userId]); } catch(e) {}

    await db.logEvent('signup', { email }, '');

    const jwtPayload = { userId, email, pro: false };
    setJwtCookie(res, jwtPayload);
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

    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Email or password is incorrect.' });
    }

    let valid = false;
    const storedHash = user.hashed_password || '';

    if (storedHash.startsWith('$2')) {
      // bcrypt hash — normal path
      valid = await bcrypt.compare(password, storedHash);
    } else {
      // Legacy: client sent SHA-256 hex; compare directly then rehash with bcrypt
      valid = storedHash === password;
      if (valid) {
        const newHash = await bcrypt.hash(password, 12);
        await db.updatePassword(user.id, newHash);
      }
    }

    if (!valid) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Email or password is incorrect.' });
    }

    const jwtPayload = { userId: user.id, email: user.email, pro: user.pro === 1 };
    setJwtCookie(res, jwtPayload);
    res.json({ success: true, user: OutputShapes.User(user) });
  } catch(err) {
    console.error('Signin error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/auth/me — returns current user (with profile) if JWT is valid
app.get('/api/auth/me', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });

  const user = await db.getUserById(session.userId);
  if (!user) {
    clearJwtCookie(res);
    return res.status(401).json({ error: 'user_not_found' });
  }

  // Always refresh the cookie to extend the session while the user is active
  const serverPro = user.pro === 1;
  setJwtCookie(res, { userId: user.id, email: user.email, pro: serverPro });

  const profile = await db.getProfile(user.id);
  res.json(OutputShapes.UserWithProfile(user, profile));
});

// POST /api/auth/signout
app.post('/api/auth/signout', async (req, res) => {
  clearJwtCookie(res);
  res.json({ success: true });
});

// POST /api/auth/reset-request
app.post('/api/auth/reset-request', authLimiter, async (req, res) => {
  try {
    await db.purgeExpiredTokens(); // housekeeping

    const email = sanitise(req.body.email, 254).toLowerCase();
    if (!email) return res.status(400).json({ error: 'email_required' });

    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.json({ success: true });
    }

    const rawToken  = randomUUID();
    const tokenHash = require('crypto').createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
    await db.createResetToken(tokenHash, user.id, expiresAt);

    const host     = process.env.APP_URL || 'https://mealzy.org';
    const resetUrl = `${host}/reset-password.html?token=${rawToken}`;

    const emailSent = await sendEmail(user.email, 'Reset your Mealzy password', emailPasswordReset(user.name, resetUrl));
    if (emailSent.ok) {
      res.json({ success: true, found: true });
    } else {
      res.json({ success: true, found: true, resetUrl, note: 'Email delivery failed — use this link directly' });
    }
  } catch(err) {
    console.error('Reset request error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/reset-confirm
app.post('/api/auth/reset-confirm', authLimiter, async (req, res) => {
  try {
    const token           = sanitise(req.body.token,          36);
    const newHashedPassword = sanitise(req.body.newHashedPassword, 64);

    if (!token || !newHashedPassword) {
      return res.status(400).json({ error: 'token and newHashedPassword required' });
    }

    const incomingHash = require('crypto').createHash('sha256').update(sanitise(req.body.token, 36)).digest('hex');
    const record = await db.getResetToken(incomingHash);
    if (!record) {
      return res.status(400).json({ error: 'invalid_token', message: 'Invalid or already-used reset link. Request a new one.' });
    }
    if (new Date(record.expires_at) < new Date()) {
      await db.markResetTokenUsed(incomingHash);
      return res.status(400).json({ error: 'expired_token', message: 'This reset link has expired. Request a new one.' });
    }

    await db.updatePassword(record.user_id, newHashedPassword);
    await db.markResetTokenUsed(incomingHash);
    res.json({ success: true, message: 'Password updated. You can now sign in with your new password.' });
  } catch(err) {
    console.error('Reset confirm error:', err);
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
      await db.logEvent('signup_google', { email }, '');
      user = await db.getUserById(newId);
    } else if (!user.google_id) {
      await db.linkGoogleId(user.id, googleId);
      await db.logEvent('google_linked', { email }, '');
    }

    setJwtCookie(res, { userId: user.id, email: user.email, pro: !!user.pro });
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
app.post('/api/profile', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const { profile } = req.body;
  if (!profile || typeof profile !== 'object') {
    return res.status(400).json({ error: 'profile object required' });
  }
  await db.saveProfile(session.userId, profile);
  res.json({ success: true });
});

// GET /api/profile
app.get('/api/profile', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const profile = await db.getProfile(session.userId);
  if (!profile) return res.status(404).json({ error: 'no_profile' });
  res.json({ success: true, profile });
});

// DELETE /api/profile — permanently delete the authenticated user's profile data
app.delete('/api/profile', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  await db.run('DELETE FROM profiles WHERE user_id = ?', [session.userId]);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
// FAMILY PROFILES (multi-profile for Family plan)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/family-profiles — list all family profiles for the authenticated user
app.get('/api/family-profiles', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const profiles = await db.getFamilyProfiles(session.userId);
  res.json({ success: true, profiles });
});

// POST /api/family-profiles — create or update a family profile
// Body: { id (optional — omit to create), name, calorieGoal, budget, dietaryRestrictions, avatar }
app.post('/api/family-profiles', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });

  // Check user is pro (family profiles are a pro feature)
  const user = await db.getUserById(session.userId);
  if (!user?.pro) return res.status(403).json({ error: 'pro_required', message: 'Family profiles require a Pro or Family plan.' });

  const { id: profileId, name, calorieGoal, budget, dietaryRestrictions, avatar } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  // Limit to 4 profiles per user
  const existing = await db.getFamilyProfiles(session.userId);
  const isUpdate = profileId && existing.find(p => p.id === profileId);
  if (!isUpdate && existing.length >= 4) {
    return res.status(400).json({ error: 'max_profiles', message: 'Family plan supports up to 4 profiles.' });
  }

  const id = profileId || randomUUID();
  const data = {
    calorieGoal: parseInt(calorieGoal) || 2000,
    budget: parseFloat(budget) || 100,
    dietaryRestrictions: Array.isArray(dietaryRestrictions) ? dietaryRestrictions : [],
    avatar: sanitise(avatar || '', 4)
  };

  await db.saveFamilyProfile(id, session.userId, sanitise(name, 100), data);
  await db.logEvent('family_profile_saved', { userId: session.userId }, '');
  res.json({ success: true, id, name, ...data });
});

// DELETE /api/family-profiles/:id
app.delete('/api/family-profiles/:id', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  await db.deleteFamilyProfile(req.params.id, session.userId);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
// DEMO MEAL — no auth, rate limited, for homepage interactive demo
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/demo-meal', demoLimiter, async (req, res) => {
  try {
    const ip           = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const calorieGoal  = Math.min(Math.max(parseInt(req.body.calorieGoal) || 2000, 1200), 4000);
    const budget       = Math.min(Math.max(parseFloat(req.body.budget) || 60, 20), 500);
    const dietary      = sanitise(req.body.dietary || 'none', 100);

    await db.logEvent('demo_generated', { calorieGoal, budget, dietary }, ip.slice(-8));

    const dietaryLine = dietary && dietary !== 'none'
      ? `DIETARY REQUIREMENT: All meals must be ${dietary}. Strictly no ingredients that violate this.`
      : '';

    const perMealBudget = (budget / 7 / 2).toFixed(2); // lunch + dinner only
    const dailyBudget   = (budget / 7).toFixed(2);

    const demoPrompt = `You are a professional meal planner. Generate a simple, practical Monday-to-Friday lunch and dinner plan.

Requirements:
- Daily calorie target: ${calorieGoal} kcal total (split roughly 35% lunch, 40% dinner, 25% other)
- Weekly grocery budget: $${budget} total. Per-meal budget: max $${perMealBudget} each.
- Cooking skill: beginner-friendly, everyday supermarket ingredients only.
${dietaryLine}

Generate exactly 10 meals: lunch and dinner for Monday, Tuesday, Wednesday, Thursday, Friday.
Keep meal names short (under 6 words) and descriptions under 8 words.

Respond ONLY with valid JSON, no markdown, no extra text:
{
  "meals": [
    { "day": "Monday",    "type": "lunch",  "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Monday",    "type": "dinner", "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Tuesday",   "type": "lunch",  "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Tuesday",   "type": "dinner", "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Wednesday", "type": "lunch",  "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Wednesday", "type": "dinner", "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Thursday",  "type": "lunch",  "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Thursday",  "type": "dinner", "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Friday",    "type": "lunch",  "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number },
    { "day": "Friday",    "type": "dinner", "name": "string", "description": "string", "calories": number, "protein": number, "estimatedCost": number }
  ],
  "weeklyEstimatedCost": number,
  "avgDailyCalories": number
}`;

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1800,
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
    console.error('[demo-meal] error:', err);
    res.status(500).json({ error: 'Failed to generate demo. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PLAN HISTORY ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

// POST /api/plans/save
app.post('/api/plans/save', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
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
app.get('/api/plans', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const plans = await db.getRecentPlans(session.userId, 10);
  res.json({ success: true, plans });
});

// ════════════════════════════════════════════════════════════════════════════
// PRO ACTIVATION
// ════════════════════════════════════════════════════════════════════════════

// POST /api/pro/activate — called from pro-welcome.html as a belt-and-suspenders
// backup to the Stripe webhook. Both paths set pro = 1 in the DB.
app.post('/api/pro/activate', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });

  const user = await db.getUserById(session.userId);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  // If already Pro (webhook already ran), just refresh the JWT cookie and return
  if (user.pro === 1) {
    setJwtCookie(res, { userId: user.id, email: user.email, pro: true });
    return res.json({ success: true, pro: true });
  }

  // Stripe webhook is the primary path; this is just a backup
  // Safe to activate any authenticated user regardless of stripe_customer_id
  await db.setUserPro(session.userId);
  await db.logEvent('pro_activated', { email: session.email, source: 'pro_welcome_verified' }, '');
  setJwtCookie(res, { userId: user.id, email: user.email, pro: true });
  res.json({ success: true, pro: true });
});

// ── POST /api/cancel-subscription ─────────────────────────────────────────
// Cancels the user's Stripe subscription at period end and logs survey reason.
app.post('/api/cancel-subscription', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated', message: 'Please log in to cancel your subscription.' });

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

    await db.logEvent('cancel_survey', { email: user.email, reason, detail }, '');
    logger.info(`[cancel] ${user.email} — reason: ${reason}`);

    const cancelAt = new Date(sub.current_period_end * 1000).toISOString().split('T')[0];
    res.json({ success: true, cancel_at: cancelAt });
  } catch (e) {
    logger.error('[cancel-subscription] error:', e.message);
    res.status(500).json({ error: 'cancel_failed', message: 'Failed to cancel subscription. Please try again or email support@mealzy.org.' });
  }
});

// ── GET /api/nps/check ────────────────────────────────────────────────────
// Returns { show: true } if the user is ≥7 days old and hasn't submitted NPS.
app.get('/api/nps/check', async (req, res) => {
  const session = getSessionFromReq(req);
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

// ── POST /api/nps/submit ──────────────────────────────────────────────────
// Records NPS score (0–10) and optional comment, marks user as submitted.
app.post('/api/nps/submit', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });

  const score = Number(req.body.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return res.status(400).json({ error: 'invalid_score' });
  }

  const comment = String(req.body.comment || '').slice(0, 500);

  try {
    const user = await db.getUserById(session.userId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    await db.logEvent('nps_response', { email: user.email, score, comment }, '');
    await db.run('UPDATE users SET nps_submitted_at = datetime(\'now\') WHERE id = ?', [user.id]);
    logger.info(`[nps] ${user.email} — score: ${score}`);

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

  if (event.type === 'checkout.session.completed') {
    const session  = event.data.object;
    const email    = session.customer_details?.email?.toLowerCase().trim();
    const customerId = session.customer;
    if (email) {
      const user = await db.getUserByEmail(email);
      if (user) {
        await db.setUserPro(user.id);
        if (customerId) try { await db.setStripeCustomerId(user.id, customerId); } catch(e) {}
        await db.logEvent('pro_activated', { email, source: 'stripe_webhook' }, '');
        logger.info(`[stripe] Pro activated — userId: ${user ? user.id : 'unknown'}`);

        // Check if this user was referred — if so, credit the referrer
        try {
          const referral = await db.get(
            `SELECT referrer_email FROM referrals WHERE referred_email = ? AND converted = 0 LIMIT 1`,
            [email]
          );
          if (referral?.referrer_email) {
            await db.markReferralConverted(referral.referrer_email, email);
            await db.addBonusPlan(referral.referrer_email);
            const referrer = await db.getUserByEmail(referral.referrer_email);
            if (referrer) {
              // Grant referrer 30 days of Pro
              const proUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
              await db.setUserProUntil(referrer.id, proUntil);
              sendEmail(
                referrer.email,
                '🎉 You earned a free month of Pro!',
                emailReferralReward(referrer.name, user.name)
              ).catch(() => {});
              logger.info('[referral] Credited referrer with 30d Pro');
            }
          }
        } catch(e) { console.error('[referral-reward] error:', e.message); }

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
            await db.logEvent('pro_removed', { email: user.email, reason: event.type }, '');
            logger.info(`[stripe] Pro removed — userId: ${user.id}, event: ${event.type}`);
          }
        } else {
          console.warn(`[stripe] ${event.type} — no user found for customer ${customerId}`);
        }
      } catch(e) { console.error('[stripe] subscription.deleted error:', e.message); }
    }
  }

  res.json({ received: true });
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — GRANT PRO
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/admin/grant-pro', requireAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email required' });
  }
  try {
    const user = await db.getUserByEmail(email.trim().toLowerCase());
    if (!user) return res.status(404).json({ error: 'No user found with that email' });
    await db.setUserPro(user.id);
    await db.logEvent('pro_granted_admin', { email: user.email }, '');
    logger.info(`[admin] Pro granted to ${user.email}`);
    res.json({ success: true, message: `Pro activated for ${user.email}` });
  } catch(e) {
    logger.error('[admin grant-pro]', e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN EXPORT
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/export', requireAdmin, async (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  console.log('[export] token received:', token, '| expected:', process.env.PRO_TOKEN);
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

app.post('/api/track', async (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).json({ error: 'event required' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  await db.logEvent(event, data || {}, ip.slice(-8));
  res.json({ ok: true });
});

app.get('/api/analytics', requireAdmin, async (req, res) => {

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
app.post('/api/referral', authLimiter, async (req, res) => {
  // Require authentication — only a real signed-in new user can trigger referral credit
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });

  const { referrer_email, new_user_email } = req.body;
  if (!referrer_email) return res.status(400).json({ error: 'referrer_email required' });

  // The authenticated user must be the one being referred
  if (session.email !== (new_user_email || '').toLowerCase()) {
    return res.status(403).json({ error: 'can_only_credit_own_signup' });
  }

  // Referrer must exist in DB
  const referrer = await db.getUserByEmail(referrer_email.toLowerCase());
  if (!referrer) return res.status(404).json({ error: 'referrer_not_found' });

  // Idempotency: one referral credit per referred user, ever
  try {
    const alreadyCredited = await db.get(
      'SELECT id FROM referrals WHERE referred_email = ? AND converted = 1 LIMIT 1',
      [session.email]
    );
    if (alreadyCredited) return res.status(409).json({ error: 'already_credited' });
  } catch(e) { /* non-fatal — proceed */ }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  try {
    const { randomUUID } = require('crypto');
    await db.saveReferral(randomUUID(), referrer_email, ip, session.email);
    await db.addBonusPlan(referrer_email);
    await db.markReferralConverted(referrer_email, session.email);
  } catch(e) { console.error('[referral] DB error:', e); }

  const current = referralBonus.get(referrer_email) || 0;
  referralBonus.set(referrer_email, current + 1);

  await db.logEvent('referral_signup', { referrer: referrer_email, new_user: session.email }, '');
  res.json({ ok: true, bonus_plans: current + 1 });
});

// GET /api/referral-capture — called when visitor lands with ?ref=EMAIL
// Stores the referral intent so it can be credited when they sign up
app.get('/api/referral-capture', async (req, res) => {
  const { ref, ip: clientIp } = req.query;
  if (!ref || !ref.includes('@')) return res.json({ ok: false });
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || clientIp || '';
  try {
    const { randomUUID } = require('crypto');
    await db.saveReferral(randomUUID(), ref, ip.slice(-16), '');
  } catch(e) { /* non-fatal */ }
  await db.logEvent('referral_visit', { ref }, ip.slice(-8));
  res.json({ ok: true });
});

app.get('/api/referral-status', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  const session = getSessionFromReq(req);
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
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

app.post('/api/email-leads', async (req, res) => {
  try {
    const email    = sanitise(req.body.email, 254).toLowerCase();
    const source   = sanitise(req.body.source, 100) || 'unknown';
    const name     = sanitise(req.body.name,   100);
    const discount = req.body.discount ? 1 : 0; // abandonment flow — mark for 50% off code
    if (!email || !email.includes('@')) {
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

app.post('/api/generate-meal', generateLimiter, async (req, res) => {
  try {
    const { profile, date, swap_meal_type, plan_token, user_email, avoid_meals } = req.body;

    if (!profile) return res.status(400).json({ error: 'Profile is required' });

    // ── Freemium gate: server-side pro check is authoritative ─────────────
    const session = getSessionFromReq(req);
    let isPro = plan_token === process.env.PLAN_BYPASS_TOKEN; // plan bypass

    if (!isPro && session) {
      // Re-query DB — the JWT payload may be stale if Pro was just activated
      const dbUser = await db.getUserById(session.userId);
      isPro = dbUser?.pro === 1;
    }
    if (!swap_meal_type && !isPro) {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      const effectiveLimit = await getEffectiveLimit(session?.email || user_email || '');

      if (session) {
        // Logged-in user: count generate_plan events for this user this month from analytics
        // (uses analytics not plans table — counts generations, not saves)
        const monthStart = new Date();
        monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const monthStartStr = monthStart.toISOString().replace('T', ' ').slice(0, 19);
        const genRow = await db.get(
          `SELECT COUNT(*) as n FROM analytics WHERE event = 'generate_plan' AND json_extract(data, '$.userId') = ? AND created_at >= ?`,
          [session.userId, monthStartStr]
        );
        const generationsThisMonth = genRow?.n || 0;
        if (generationsThisMonth >= effectiveLimit) {
          await db.logEvent('free_limit_hit', { userId: session.userId }, '');
          return res.status(402).json({
            error: 'free_limit_reached',
            message: `You've used all ${effectiveLimit} free plans this month.`,
            upgrade_url: '/pricing.html',
            resets_in: 'Start of next month',
            used: generationsThisMonth,
            limit: effectiveLimit
          });
        }
        await db.logEvent('generate_plan', { plan_num: generationsThisMonth + 1, userId: session.userId }, '');
      } else {
        // Anonymous user: track by IP (in-memory, resets on server restart)
        const usage = getUsage(ip);
        if (usage.count >= effectiveLimit) {
          await db.logEvent('free_limit_hit', {}, '');
          return res.status(402).json({
            error: 'free_limit_reached',
            message: `You've used all ${effectiveLimit} free plans this month.`,
            upgrade_url: '/pricing.html',
            resets_in: 'Start of next month',
            used: usage.count,
            limit: effectiveLimit
          });
        }
        incrementUsage(ip);
        await db.logEvent('generate_plan', { plan_num: usage.count + 1 }, '');
      }
    } else if (!swap_meal_type && isPro) {
      await db.logEvent('generate_plan', { pro: true }, '');
    }

    // ── Profile field extraction ──────────────────────────────────────────
    const name               = sanitise(profile.name || 'User', 100);
    const goal               = sanitise(profile.fitness_goal || profile.goal || 'eat healthier', 200);
    const dietaryPrefs       = Array.isArray(profile.dietary_preferences || profile.dietaryPrefs) ? (profile.dietary_preferences || profile.dietaryPrefs) : [];
    const allergies          = Array.isArray(profile.allergies) ? profile.allergies : [];
    const cookingSkill       = sanitise(profile.cooking_skill || profile.cookingSkill || 'intermediate', 50);
    const dailyCalories      = Number(profile.daily_calories || profile.dailyCalories || 2000);
    const dailyProtein       = Number(profile.daily_protein  || (profile.macros?.protein) || 150);
    const dailyCarbs         = Number(profile.daily_carbs    || (profile.macros?.carbs) || 200);
    const dailyFat           = Number(profile.daily_fat      || (profile.macros?.fat) || 65);
    const budget             = Number(profile.budget_weekly  || profile.budget || 100);
    const currency           = sanitise(profile.currency || 'USD', 10);
    const cookingTimeMinutes = Number(profile.cooking_time_minutes || profile.cookingTimeMinutes || 30);
    const language           = sanitise(profile.language || 'en', 10);
    const languageNames = { en:'English',sv:'Swedish',no:'Norwegian',da:'Danish',de:'German',fr:'French',es:'Spanish',it:'Italian',pt:'Portuguese',nl:'Dutch',ja:'Japanese',fi:'Finnish',pl:'Polish',tr:'Turkish',ko:'Korean',zh:'Chinese',ar:'Arabic',hi:'Hindi',ru:'Russian' };
    const languageName   = languageNames[language] || 'English';
    const dailyBudget    = (budget / 7).toFixed(2);
    const perMealBudget  = (budget / 7 / 4).toFixed(2);

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
    const avoidBlock = avoid_meals?.length > 0
      ? `Do NOT suggest these previously disliked meals: ${avoid_meals.join(', ')}.`
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

    const preferredCuisine = profile.preferred_cuisine || null;
    let todayCuisine;
    if (preferredCuisine && cuisineGroups[preferredCuisine.toLowerCase().replace(/\s/g,'')]) {
      const group = cuisineGroups[preferredCuisine.toLowerCase().replace(/\s/g,'')];
      todayCuisine = group[Math.floor(Math.random() * group.length)];
    } else if (preferredCuisine) {
      todayCuisine = preferredCuisine;
    } else {
      const allCuisines = Object.values(cuisineGroups).flat();
      todayCuisine = allCuisines[Math.floor(Math.random() * allCuisines.length)];
    }
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
    const todayProtein = eligibleProteins[Math.floor(Math.random() * eligibleProteins.length)];
    const randomSeed   = Math.floor(Math.random() * 99999);

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
  "ingredients": [{ "name": "string", "amount": "string", "cost": number }],
  "instructions": ["string"],
  "imageKeyword": "simple English food keyword e.g. scrambled eggs"
}`;

    // ══════════════════════════════════════════════════════════════════════
    // SINGLE MEAL SWAP
    // ══════════════════════════════════════════════════════════════════════
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

      const completion = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system: [{ type: 'text', text: 'You are a professional nutritionist and chef. Always respond with valid JSON only, no markdown fences, no explanation. Never include ingredients that violate dietary restrictions or allergies.', cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: swapPrompt }]
      });

      const meal = parseJsonResponse(completion.content[0].text);

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

    // ══════════════════════════════════════════════════════════════════════
    // FULL DAILY MEAL PLAN
    // ══════════════════════════════════════════════════════════════════════

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

    const fullPlanPrompt = `${dietaryBlock}${allergyBlock}Generate a practical, delicious daily meal plan for ${name} on ${date}.

Cuisine style: ${todayCuisine}. Variety seed: ${randomSeed}. Suggested protein for ONE meal only: ${todayProtein} (use different proteins across other meals for variety — no protein should appear in more than 2 of the 4 meals).
Use real, everyday supermarket ingredients. Meals must be realistic for a home cook.

User profile:
- Goal: ${goal}
- Daily calorie target: ${dailyCalories} kcal TOTAL (Protein ${dailyProtein}g / Carbs ${dailyCarbs}g / Fat ${dailyFat}g)
- PER-MEAL CALORIE TARGETS (each meal MUST hit within ±15% of its target):
  Breakfast: ${mealCalorieTargets.breakfast} kcal | Lunch: ${mealCalorieTargets.lunch} kcal | Dinner: ${mealCalorieTargets.dinner} kcal | Snack: ${mealCalorieTargets.snack} kcal
- Cooking skill: ${cookingSkill}
- Max time per meal: ${cookingTimeMinutes} min
- STRICT DAILY BUDGET: ${currency} ${dailyBudget} total. Each meal max ${currency} ${perMealBudget}. estimatedCost across all 4 meals MUST NOT exceed ${currency} ${dailyBudget}.
- BUDGET MATH: The totalCost field MUST equal the exact arithmetic sum of all 4 estimatedCost values (breakfast + lunch + dinner + snack). Never echo the budget ceiling as totalCost — report only the actual calculated cost.
- MACRO CALCULATION: Derive each meal's protein, carbs, and fat from its actual ingredients and realistic portion sizes — do not reverse-engineer numbers to hit the daily targets. Each meal must satisfy: (protein×4 + carbs×4 + fat×9) within ±50 kcal of its stated calories field.

${avoidBlock}

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
  "totalCalories": number,
  "totalCost": number,
  "nutritionNote": "string (short, in ${languageName})"
}`;

    // Prompt caching: stable role block cached, volatile dietary block appended uncached
    const _baseSys = isPro
      ? 'You are a professional nutritionist and executive chef. Respond with valid JSON only, no markdown. Pro users deserve restaurant-quality recipes — detailed techniques, precise measurements. NEVER violate dietary restrictions or allergies — this is non-negotiable.'
      : 'You are a professional nutritionist. Respond with valid JSON only, no markdown. Keep instructions simple and concise. NEVER violate dietary restrictions or allergies — this is non-negotiable.';
    const _sysBlocks = [{ type: 'text', text: _baseSys, cache_control: { type: 'ephemeral' } }];
    if (dietaryBlock) _sysBlocks.push({ type: 'text', text: `CRITICAL: ${activeDietRules.split('\n')[0]}` });

    const completion = await anthropic.messages.create({
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
      const retryCompletion = await anthropic.messages.create({
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

    // ── Macro sanity check — log discrepancies for agent review ─────────────
    if (mealPlan.meals) {
      for (const meal of mealPlan.meals) {
        const p = Number(meal.protein) || 0;
        const c = Number(meal.carbs)   || 0;
        const f = Number(meal.fat)     || 0;
        const stated     = Number(meal.calories) || 0;
        const calculated = p * 4 + c * 4 + f * 9;
        if (Math.abs(stated - calculated) > 100) {
          log.warn(`[macro-check] meal "${meal.name}" calories stated ${stated} calculated ${calculated}`);
        }
      }
    }

    // ── Allergy enforcement — server-side scan after AI generation ───────────
    if (allergies.length > 0 && mealPlan.meals) {
      const lowerAllergies = allergies.map(a => a.toLowerCase());
      for (const meal of mealPlan.meals) {
        const haystack = [
          meal.name || '',
          meal.description || '',
          ...(meal.ingredients || []).map(i => i.name || '')
        ].join(' ').toLowerCase();
        const match = lowerAllergies.find(a => haystack.includes(a));
        if (match) {
          await db.logEvent('allergy_violation_detected', { allergen: match, meal: meal.name, userId: session?.userId || 'anon' }, '');
          logger.warn(`[allergy] Violation detected: "${match}" in "${meal.name}"`);
          return res.status(400).json({ error: 'allergy_violation', retry: true, allergen: match, message: `Generated meal "${meal.name}" may contain "${match}". Please regenerate your plan.` });
        }
      }
    }

    // Attach images if Unsplash is configured
    if (process.env.UNSPLASH_ACCESS_KEY && mealPlan.meals) {
      await Promise.all(mealPlan.meals.map(async (meal) => {
        try {
          const q = encodeURIComponent((meal.imageKeyword || meal.name) + ' dish plated food photography');
          const imgRes = await fetch(`https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape`, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } });
          const imgData = await imgRes.json();
          if (imgData.results?.[0]) meal.image_url = imgData.results[0].urls.small;
        } catch(e) { /* keep default */ }
      }));
    }

    res.json({ success: true, date, mealPlan });

  } catch(error) {
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

// ════════════════════════════════════════════════════════════════════════════
// GROCERY LIST
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/generate-grocery-list', async (req, res) => {
  try {
    const { profile, meals, weekStart } = req.body;
    if (!meals || meals.length === 0) return res.status(400).json({ error: 'Meals array is required' });

    const { budget = 100, currency = 'USD', dietaryPrefs = [], allergies = [], language: groceryLang = 'en' } = profile || {};
    const langNames   = { en:'English',sv:'Swedish',no:'Norwegian',da:'Danish',de:'German',fr:'French',es:'Spanish',it:'Italian',pt:'Portuguese',nl:'Dutch',ja:'Japanese',fi:'Finnish',pl:'Polish',tr:'Turkish',ko:'Korean',zh:'Chinese',ar:'Arabic',hi:'Hindi',ru:'Russian' };
    const langName    = langNames[groceryLang] || 'English';

    const mealList    = meals.map(m => `- ${m.name} (${m.type})`).join('\n');
    const allergyInfo = allergies.length > 0 ? `ALLERGY WARNING — never include: ${allergies.join(', ')}.` : '';
    const prefInfo    = dietaryPrefs.length > 0 ? `Dietary preferences: ${dietaryPrefs.join(', ')}. All items must comply.` : '';

    const prompt = `Generate a complete grocery list for the following weekly meals:\n\n${mealList}\n\n${prefInfo}\n${allergyInfo}\nWeekly budget: ${currency} ${budget}. Keep total cost at or under this amount.\nWrite all ingredient names in ${langName}. JSON keys stay in English.\nConsolidate duplicate ingredients. Group by category.\n\nRespond ONLY with valid JSON:\n{\n  "weekStart": "${weekStart}",\n  "totalCost": 85.50,\n  "budgetAmount": ${budget},\n  "currency": "${currency}",\n  "categories": {\n    "produce": [{ "name": "Spinach", "amount": "200g", "cost": 2.50, "checked": false }],\n    "protein": [],\n    "dairy": [],\n    "grains": [],\n    "pantry": [],\n    "frozen": [],\n    "beverages": [],\n    "other": []\n  }\n}`;

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: 'You are a professional nutritionist. Always respond with valid JSON only, no markdown.',
      messages: [{ role: 'user', content: prompt }]
    });

    const groceryList = parseJsonResponse(completion.content[0].text);
    res.json({ success: true, groceryList });

  } catch(error) {
    console.error('Error generating grocery list:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// AI COACH
// ════════════════════════════════════════════════════════════════════════════

const FREE_COACH_LIMIT = 10;

app.post('/api/ai-coach', async (req, res) => {
  try {
    const { messages, profile } = req.body;
    const session   = getSessionFromReq(req);
    let isCoachPro  = false;
    if (session) {
      const dbUser = await db.getUserById(session.userId);
      if (dbUser?.pro === 1) isCoachPro = true;
    }

    if (!messages || messages.length === 0) return res.status(400).json({ error: 'Messages array is required' });

    // Daily message limit for free users (persisted in SQLite — survives restarts)
    if (!isCoachPro && session) {
      const count = await db.getCoachUsage(session.userId);
      log.info(`[coach] userId=${session.userId} count=${count} limit=${FREE_COACH_LIMIT} isPro=${isCoachPro}`);
      if (count >= FREE_COACH_LIMIT) {
        return res.status(402).json({ error: 'coach_limit_reached', messagesUsed: count, limit: FREE_COACH_LIMIT });
      }
      await db.incrementCoachUsage(session.userId);
    } else {
      log.info(`[coach] userId=${session?.userId ?? 'anon'} count=- limit=- isPro=${isCoachPro}`);
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

    const completion = await anthropic.messages.create({
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
app.post('/api/xp/award', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });

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

// POST /api/plans/share — generate a shareable link for a plan
app.post('/api/plans/share', async (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });

  const { plan, date, title } = req.body;
  if (!plan) return res.status(400).json({ error: 'plan required' });

  const shareId = require('crypto').randomBytes(5).toString('hex'); // 8 chars, e.g. "a1b2c3d4"
  const planId  = randomUUID();

  try {
    await db.saveShareLink(shareId, planId, session.userId, { plan, date, title, sharedAt: new Date().toISOString() });
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
app.get('/api/ref-lookup', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.json({ found: false });
  // Support both email refs (legacy) and ref_CODE refs
  if (code.startsWith('ref_')) {
    const user = await db.getUserByRefCode(code);
    if (user) return res.json({ found: true, email: user.email });
    return res.json({ found: false });
  }
  // Legacy email ref
  if (code.includes('@')) return res.json({ found: true, email: code });
  res.json({ found: false });
});

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS FUNNEL — admin endpoint
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/analytics/funnel', requireAdmin, async (req, res) => {
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
  const secret    = req.headers['x-cron-secret'];
  const timestamp = parseInt(req.headers['x-cron-timestamp'] || '0', 10);
  const age       = Date.now() - timestamp;
  if (!secret || secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' }); return false;
  }
  if (isNaN(timestamp) || age > 5 * 60 * 1000 || age < 0) {
    res.status(401).json({ error: 'Request expired or missing timestamp' }); return false;
  }
  return true;
}

// POST /api/cron/day3-nudge — send day-3 nudge emails to unconverted users
app.post('/api/cron/day3-nudge', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cron/weekly-digest — send weekly reminder to all active free users
app.post('/api/cron/weekly-digest', async (req, res) => {
  if (!cronAuth(req, res)) return;
  try {
    const users = await db.getUsersForWeeklyDigest();
    let sent = 0;
    for (const user of users) {
      const result = await sendEmail(
        user.email,
        'New week — generate your meal plan in 30 seconds 🥗',
        emailWeeklyDigest(user.name)
      );
      if (result.ok) sent++;
      await new Promise(r => setTimeout(r, 150));
    }
    await db.logEvent('cron_weekly_digest', { sent, total: users.length }, '');
    res.json({ ok: true, sent, total: users.length });
  } catch(err) {
    console.error('[cron/weekly-digest] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Recipe routes (photo import, save, list) ──────────────────────────────
require('./routes/recipes')(app, { anthropic, getSessionFromReq, generateLimiter, db });

// ── Blog routes ────────────────────────────────────────────────────────────
app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'blog', 'index.html'));
});
app.use('/blog', express.static(path.join(__dirname, 'public', 'blog')));

// ── Catch-all: serve index.html ────────────────────────────────────────────
app.get('*', async (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global error handler — prevents unhandled exceptions from crashing the server ──
app.use((err, req, res, next) => {
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

// ── Start server after DB is ready ────────────────────────────────────────
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
      { name: 'PLAN_BYPASS_TOKEN',       ok: !!process.env.PLAN_BYPASS_TOKEN },
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

    // ── Avery: keep-alive ping — prevents Render free tier spin-down ──────
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
