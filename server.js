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
const rateLimit    = require('express-rate-limit');
const Anthropic    = require('@anthropic-ai/sdk');
const db           = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET    = process.env.JWT_SECRET;
const JWT_EXPIRES   = '30d';
const ANALYTICS_FILE = path.join(__dirname, 'analytics.json'); // legacy, keep for old data
const LEADS_FILE     = path.join(__dirname, 'leads.json');     // legacy

// ── Security headers on every response ────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ── Stripe webhook needs raw body — must be BEFORE express.json() ─────────
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
  const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds
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
function getEffectiveLimit(email) {
  const memBonus = email ? (referralBonus.get(email) || 0) : 0;
  if (email && memBonus === 0) {
    // Check SQLite for persisted bonus_plans (survives server restarts)
    try {
      const user = db.getUserByEmail(email);
      const dbBonus = user?.bonus_plans || 0;
      if (dbBonus > 0) return FREE_PLAN_LIMIT + dbBonus;
    } catch(e) { /* non-fatal */ }
  }
  return FREE_PLAN_LIMIT + memBonus;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ════════════════════════════════════════════════════════════════════════════
// HEALTH
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  let dbOk = false;
  try { dbOk = db.ping(); } catch(e) {}
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'error',
    timestamp: new Date().toISOString(),
    version: '3.0.0'
  });
});

// ── Supabase config shim (kept for HTML pages that still load it) ──────────
app.get('/supabase-config.js', (req, res) => {
  res.type('js').send(
    `window.SUPABASE_URL=${JSON.stringify(process.env.SUPABASE_URL || '')};` +
    `window.SUPABASE_KEY=${JSON.stringify(process.env.SUPABASE_ANON_KEY || '')};`
  );
});

// ════════════════════════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

// POST /api/auth/signup
app.post('/api/auth/signup', authLimiter, (req, res) => {
  try {
    const name           = sanitise(req.body.name,           100);
    const email          = sanitise(req.body.email,          254).toLowerCase();
    const hashedPassword = sanitise(req.body.hashedPassword,  64);

    if (!name || !email || !hashedPassword) {
      return res.status(400).json({ error: 'missing_fields', message: 'name, email, and hashedPassword are required.' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'invalid_email', message: 'Please enter a valid email address.' });
    }

    const existing = db.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'account_exists', message: 'An account with this email already exists.' });
    }

    const userId = randomUUID();
    db.createUser({ id: userId, name, email, hashedPassword });
    db.logEvent('signup', { email }, '');

    const jwtPayload = { userId, email, pro: false };
    setJwtCookie(res, jwtPayload);
    res.json({ success: true, user: { id: userId, name, email, pro: false } });
  } catch(err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/signin
app.post('/api/auth/signin', authLimiter, (req, res) => {
  try {
    const email          = sanitise(req.body.email,          254).toLowerCase();
    const hashedPassword = sanitise(req.body.hashedPassword,  64);

    if (!email || !hashedPassword) {
      return res.status(400).json({ error: 'missing_fields', message: 'email and hashedPassword are required.' });
    }

    const user = db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'not_found', message: 'No account found with that email. Please sign up first.' });
    }
    if (user.hashed_password !== hashedPassword) {
      return res.status(401).json({ error: 'wrong_password', message: 'Incorrect password. Try again.' });
    }

    const jwtPayload = { userId: user.id, email: user.email, pro: user.pro === 1 };
    setJwtCookie(res, jwtPayload);
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, pro: user.pro === 1 } });
  } catch(err) {
    console.error('Signin error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/auth/me — returns current user (with profile) if JWT is valid
app.get('/api/auth/me', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });

  const user = db.getUserById(session.userId);
  if (!user) {
    clearJwtCookie(res);
    return res.status(401).json({ error: 'user_not_found' });
  }

  // If pro was granted server-side after token was issued, refresh the cookie
  const serverPro = user.pro === 1;
  if (serverPro && !session.pro) {
    setJwtCookie(res, { userId: user.id, email: user.email, pro: true });
  }

  const profile = db.getProfile(user.id);
  res.json({ id: user.id, name: user.name, email: user.email, pro: serverPro, profile });
});

// POST /api/auth/signout
app.post('/api/auth/signout', (req, res) => {
  clearJwtCookie(res);
  res.json({ success: true });
});

// POST /api/auth/reset-request
// Returns a reset URL (no email sending — shows link on screen, honest about it)
app.post('/api/auth/reset-request', authLimiter, (req, res) => {
  try {
    db.purgeExpiredTokens(); // housekeeping

    const email = sanitise(req.body.email, 254).toLowerCase();
    if (!email) return res.status(400).json({ error: 'email_required' });

    const user = db.getUserByEmail(email);
    if (!user) {
      // Don't reveal whether account exists — return generic success
      return res.json({ success: true, found: false });
    }

    const token     = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    db.createResetToken(token, user.id, expiresAt);

    const host     = process.env.APP_URL || 'https://mealzy.org';
    const resetUrl = `${host}/reset-password.html?token=${token}`;

    res.json({ success: true, found: true, resetUrl });
  } catch(err) {
    console.error('Reset request error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/reset-confirm
app.post('/api/auth/reset-confirm', authLimiter, (req, res) => {
  try {
    const token           = sanitise(req.body.token,          36);
    const newHashedPassword = sanitise(req.body.newHashedPassword, 64);

    if (!token || !newHashedPassword) {
      return res.status(400).json({ error: 'token and newHashedPassword required' });
    }

    const record = db.getResetToken(token);
    if (!record) {
      return res.status(400).json({ error: 'invalid_token', message: 'Invalid or already-used reset link. Request a new one.' });
    }
    if (new Date(record.expires_at) < new Date()) {
      db.markResetTokenUsed(token);
      return res.status(400).json({ error: 'expired_token', message: 'This reset link has expired. Request a new one.' });
    }

    db.updatePassword(record.user_id, newHashedPassword);
    db.markResetTokenUsed(token);
    res.json({ success: true, message: 'Password updated. You can now sign in with your new password.' });
  } catch(err) {
    console.error('Reset confirm error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PROFILE ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

// POST /api/profile
app.post('/api/profile', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const { profile } = req.body;
  if (!profile || typeof profile !== 'object') {
    return res.status(400).json({ error: 'profile object required' });
  }
  db.saveProfile(session.userId, profile);
  res.json({ success: true });
});

// GET /api/profile
app.get('/api/profile', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const profile = db.getProfile(session.userId);
  if (!profile) return res.status(404).json({ error: 'no_profile' });
  res.json({ success: true, profile });
});

// ════════════════════════════════════════════════════════════════════════════
// FAMILY PROFILES (multi-profile for Family plan)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/family-profiles — list all family profiles for the authenticated user
app.get('/api/family-profiles', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const profiles = db.getFamilyProfiles(session.userId);
  res.json({ success: true, profiles });
});

// POST /api/family-profiles — create or update a family profile
// Body: { id (optional — omit to create), name, calorieGoal, budget, dietaryRestrictions, avatar }
app.post('/api/family-profiles', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });

  // Check user is pro (family profiles are a pro feature)
  const user = db.getUserById(session.userId);
  if (!user?.pro) return res.status(403).json({ error: 'pro_required', message: 'Family profiles require a Pro or Family plan.' });

  const { id: profileId, name, calorieGoal, budget, dietaryRestrictions, avatar } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  // Limit to 4 profiles per user
  const existing = db.getFamilyProfiles(session.userId);
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

  db.saveFamilyProfile(id, session.userId, sanitise(name, 100), data);
  db.logEvent('family_profile_saved', { userId: session.userId }, '');
  res.json({ success: true, id, name, ...data });
});

// DELETE /api/family-profiles/:id
app.delete('/api/family-profiles/:id', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  db.deleteFamilyProfile(req.params.id, session.userId);
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

    db.logEvent('demo_generated', { calorieGoal, budget, dietary }, ip.slice(-8));

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
      system: 'You are a meal planning API. Always respond with valid JSON only. No markdown fences, no explanations.',
      messages: [{ role: 'user', content: demoPrompt }]
    });

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
app.post('/api/plans/save', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const { plan, date } = req.body;
  if (!plan) return res.status(400).json({ error: 'plan required' });
  try {
    const planDate = date || new Date().toISOString().split('T')[0];
    db.savePlan(randomUUID(), session.userId, { date: planDate, plan, savedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch(err) {
    console.error('Plan save error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/plans
app.get('/api/plans', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const plans = db.getRecentPlans(session.userId, 10);
  res.json({ success: true, plans });
});

// ════════════════════════════════════════════════════════════════════════════
// PRO ACTIVATION
// ════════════════════════════════════════════════════════════════════════════

// POST /api/pro/activate — called from pro-welcome.html as a belt-and-suspenders
// backup to the Stripe webhook. Both paths set pro = 1 in the DB.
app.post('/api/pro/activate', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });

  const user = db.getUserById(session.userId);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  db.setUserPro(session.userId);
  db.logEvent('pro_activated', { email: session.email, source: 'pro_welcome' }, '');

  // Refresh the JWT so the pro flag is up-to-date without requiring sign-in
  setJwtCookie(res, { userId: user.id, email: user.email, pro: true });
  res.json({ success: true, pro: true });
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
    if (email) {
      const user = db.getUserByEmail(email);
      if (user) {
        db.setUserPro(user.id);
        db.logEvent('pro_activated', { email, source: 'stripe_webhook' }, '');
        console.log(`[stripe] Pro activated for ${email}`);
      } else {
        // User might not have an account yet — log and move on
        console.warn(`[stripe] checkout.session.completed for unknown email: ${email}`);
        db.logEvent('stripe_unknown_email', { email }, '');
      }
    }
  }

  res.json({ received: true });
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN EXPORT
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/export', (req, res) => {
  const token = req.headers['x-pro-token'] || req.query.token;
  if (!token || token !== process.env.PRO_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const users    = db.getAllUsers();
    const leads    = db.countLeads();
    res.json({
      user_count:  users.length,
      pro_count:   users.filter(u => u.pro === 1).length,
      lead_count:  leads,
      users,
      exported_at: new Date().toISOString(),
      note: 'Passwords are excluded from this export.'
    });
  } catch(e) {
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/track', (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).json({ error: 'event required' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  db.logEvent(event, data || {}, ip.slice(-8));
  res.json({ ok: true });
});

app.get('/api/analytics', (req, res) => {
  const token = req.headers['x-pro-token'] || req.query.token;
  if (token !== process.env.PRO_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

  const events = db.getAnalytics();
  const now    = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth  = events.filter(e => new Date(e.ts) >= monthStart);
  const count = (arr, type) => arr.filter(e => e.event === type).length;

  const users = db.getAllUsers();
  res.json({
    total_events:   events.length,
    total_users:    users.length,
    pro_users:      users.filter(u => u.pro === 1).length,
    this_month: {
      signups:           count(thisMonth, 'signup'),
      plans_generated:   count(thisMonth, 'generate_plan'),
      free_limit_hits:   count(thisMonth, 'free_limit_hit'),
      upgrade_clicks:    count(thisMonth, 'upgrade_click'),
      pro_activations:   count(thisMonth, 'pro_activated'),
    },
    all_time: {
      signups:         count(events, 'signup'),
      plans_generated: count(events, 'generate_plan'),
      pro_activations: count(events, 'pro_activated'),
    },
    lead_count: db.countLeads()
  });
});

// ════════════════════════════════════════════════════════════════════════════
// REFERRAL
// ════════════════════════════════════════════════════════════════════════════

// POST /api/referral — credit a referral (called at signup when a pending ref exists)
app.post('/api/referral', (req, res) => {
  const { referrer_email, new_user_email } = req.body;
  if (!referrer_email) return res.status(400).json({ error: 'referrer_email required' });

  // Persist to SQLite referrals table
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  try {
    const { randomUUID } = require('crypto');
    db.saveReferral(randomUUID(), referrer_email, ip, new_user_email || '');
    db.addBonusPlan(referrer_email); // increment bonus_plans on the referrer's account
    db.markReferralConverted(referrer_email, new_user_email || '');
  } catch(e) { console.error('[referral] DB error:', e); }

  // Also update in-memory Map for immediate effect in current server session
  const current = referralBonus.get(referrer_email) || 0;
  referralBonus.set(referrer_email, current + 1);

  db.logEvent('referral_signup', { referrer: referrer_email, new_user: new_user_email }, '');
  res.json({ ok: true, bonus_plans: current + 1 });
});

// GET /api/referral-capture — called when visitor lands with ?ref=EMAIL
// Stores the referral intent so it can be credited when they sign up
app.get('/api/referral-capture', (req, res) => {
  const { ref, ip: clientIp } = req.query;
  if (!ref || !ref.includes('@')) return res.json({ ok: false });
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || clientIp || '';
  try {
    const { randomUUID } = require('crypto');
    db.saveReferral(randomUUID(), ref, ip.slice(-16), '');
  } catch(e) { /* non-fatal */ }
  db.logEvent('referral_visit', { ref }, ip.slice(-8));
  res.json({ ok: true });
});

app.get('/api/referral-status', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  const session = getSessionFromReq(req);
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  const usage         = getUsage(ip);
  const effectiveLimit = getEffectiveLimit(email);

  // Get SQLite-persisted referral count (survives restarts)
  let referralCount = referralBonus.get(email) || 0;
  try {
    const dbCount = db.getReferralCount(email);
    if (dbCount > referralCount) referralCount = dbCount;
  } catch(e) { /* non-fatal */ }

  res.json({ bonus_plans: referralCount, effective_limit: effectiveLimit, used: usage.count });
});

// ════════════════════════════════════════════════════════════════════════════
// EMAIL LEADS
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/email-leads', (req, res) => {
  try {
    const email    = sanitise(req.body.email, 254).toLowerCase();
    const source   = sanitise(req.body.source, 100) || 'unknown';
    const name     = sanitise(req.body.name,   100);
    const discount = req.body.discount ? 1 : 0; // abandonment flow — mark for 50% off code
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    db.saveLead(randomUUID(), email, source, name);
    // Log with discount flag so admin export can filter these for coupon send
    db.logEvent('email_lead', { email, source, discount }, '');
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
    let isPro = plan_token === process.env.PRO_TOKEN; // admin bypass

    if (!isPro && session) {
      // Re-query DB — the JWT payload may be stale if Pro was just activated
      const dbUser = db.getUserById(session.userId);
      isPro = dbUser?.pro === 1;
    }
    // Backward compat: accept client-sent is_pro for pre-auth users (no new signups should hit this)
    if (!isPro && req.body.is_pro === true) isPro = true;

    if (!swap_meal_type && !isPro) {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      const usage          = getUsage(ip);
      const effectiveLimit = getEffectiveLimit(user_email || '');
      if (usage.count >= effectiveLimit) {
        db.logEvent('free_limit_hit', {}, '');
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
      db.logEvent('generate_plan', { plan_num: usage.count + 1 }, '');
    } else if (!swap_meal_type && isPro) {
      db.logEvent('generate_plan', { pro: true }, '');
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

    // Strictly enforce dietary restrictions in the prompt
    const dietaryBlock = dietaryPrefs.length > 0
      ? `STRICT DIETARY REQUIREMENT: The user is ${dietaryPrefs.join(' and ')}. Every meal MUST comply. Do NOT include any ingredients that violate these restrictions.`
      : '';
    const allergyBlock = allergies.length > 0
      ? `ALLERGY WARNING: The user is allergic to: ${allergies.join(', ')}. NEVER include these ingredients in any form.`
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
    const todayProtein = proteins[Math.floor(Math.random() * proteins.length)];
    const randomSeed   = Math.floor(Math.random() * 99999);

    // ── JSON schema embedded in the prompt for reliable parsing ──────────
    const mealSchema = `{
  "type": "breakfast|lunch|dinner|snack",
  "name": "string",
  "description": "string (under ${isPro ? '15' : '10'} words)",
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

      const swapPrompt = `Generate ONE practical home-cooked ${swap_meal_type} meal for ${name}.

Cuisine: ${todayCuisine}. Featured protein: ${todayProtein}. Variety seed: ${randomSeed}.
Target: ~${targetCals} kcal. Cooking skill: ${cookingSkill}. Max time: ${cookingTimeMinutes} min.
Budget: max ${currency} ${perMealBudget} for this meal. Use common supermarket ingredients only.

${dietaryBlock}
${allergyBlock}
${avoidBlock}

LANGUAGE: All meal name, description, and ingredient names MUST be in ${languageName}. JSON keys stay in English.

Respond ONLY with valid JSON matching this exact schema (no markdown, no extra text):
${mealSchema.replace('"type": "breakfast|lunch|dinner|snack"', `"type": "${swap_meal_type}"`)}`;

      const completion = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system: 'You are a professional nutritionist and chef. Always respond with valid JSON only, no markdown fences, no explanation. Never include ingredients that violate dietary restrictions or allergies.',
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

    const fullPlanPrompt = `Generate a practical, delicious daily meal plan for ${name} on ${date}.

Cuisine style: ${todayCuisine}. Featured protein: ${todayProtein}. Variety seed: ${randomSeed}.
Use real, everyday supermarket ingredients. Meals must be realistic for a home cook.

User profile:
- Goal: ${goal}
- Daily calorie target: ${dailyCalories} kcal (Protein ${dailyProtein}g / Carbs ${dailyCarbs}g / Fat ${dailyFat}g)
- Cooking skill: ${cookingSkill}
- Max time per meal: ${cookingTimeMinutes} min
- STRICT DAILY BUDGET: ${currency} ${dailyBudget} total. Each meal max ${currency} ${perMealBudget}. estimatedCost across all 4 meals MUST NOT exceed ${currency} ${dailyBudget}.

${dietaryBlock}
${allergyBlock}
${avoidBlock}

${proInstructions}

LANGUAGE: Write ALL meal names, descriptions, and ingredient names in ${languageName}. JSON keys stay in English.

Generate exactly 4 meals: breakfast, lunch, dinner, snack.

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

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: isPro ? 6000 : 4000,
      system: isPro
        ? 'You are a professional nutritionist and executive chef. Respond with valid JSON only, no markdown. Pro users deserve restaurant-quality recipes — detailed techniques, precise measurements. NEVER violate dietary restrictions or allergies.'
        : 'You are a professional nutritionist. Respond with valid JSON only, no markdown. Keep instructions simple and concise. NEVER violate dietary restrictions or allergies.',
      messages: [{ role: 'user', content: fullPlanPrompt }]
    });

    const rawText = completion.content[0].text;
    console.log('[meal] AI response chars:', rawText.length, '| tail:', rawText.slice(-80));

    let mealPlan;
    try {
      mealPlan = parseJsonResponse(rawText);
    } catch(parseErr) {
      // Retry once with a simpler prompt
      console.warn('[meal] Parse failed, retrying with explicit JSON request...');
      const retryCompletion = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        system: 'You are a JSON API. Output only valid JSON, nothing else.',
        messages: [
          { role: 'user', content: fullPlanPrompt },
          { role: 'assistant', content: rawText },
          { role: 'user', content: 'Your response was not valid JSON. Output ONLY the JSON object, starting with { and ending with }, no other text.' }
        ]
      });
      mealPlan = parseJsonResponse(retryCompletion.content[0].text);
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

app.post('/api/ai-coach', async (req, res) => {
  try {
    const { messages, profile, is_pro } = req.body;
    const session   = getSessionFromReq(req);
    let isCoachPro  = is_pro === true;
    if (session) {
      const dbUser = db.getUserById(session.userId);
      if (dbUser?.pro === 1) isCoachPro = true;
    }

    if (!messages || messages.length === 0) return res.status(400).json({ error: 'Messages array is required' });

    const { name = 'User', goal = 'eat healthier', dailyCalories = 2000, macros = { protein: 150, carbs: 200, fat: 67 }, dietaryPrefs = [], allergies = [], weight = 70, height = 170, age = 30, currency = 'USD', preferred_cuisine = '', language: coachLang = 'en' } = profile || {};
    const langNames   = { en:'English',sv:'Swedish',no:'Norwegian',da:'Danish',de:'German',fr:'French',es:'Spanish',it:'Italian',pt:'Portuguese',nl:'Dutch',ja:'Japanese',fi:'Finnish',pl:'Polish',tr:'Turkish',ko:'Korean',zh:'Chinese',ar:'Arabic',hi:'Hindi',ru:'Russian' };
    const coachLangName = langNames[coachLang] || 'English';
    const currencyToCountry = { USD:'United States',GBP:'United Kingdom',EUR:'Europe',SEK:'Sweden',NOK:'Norway',DKK:'Denmark',CAD:'Canada',AUD:'Australia',CHF:'Switzerland',JPY:'Japan',KRW:'South Korea',INR:'India',BRL:'Brazil' };
    const userCountry = currencyToCountry[currency] || 'their country';

    const systemPrompt = `You are Mia, a friendly, knowledgeable AI nutritionist and wellness coach for the Mealzy app. You are talking with ${name}.

User profile:
- Goal: ${goal}
- Daily calories: ${dailyCalories} kcal | Protein ${macros.protein}g / Carbs ${macros.carbs}g / Fat ${macros.fat}g
- Weight: ${weight}kg, Height: ${height}cm, Age: ${age}
- Dietary preferences: ${dietaryPrefs.length > 0 ? dietaryPrefs.join(', ') : 'None'}
- Allergies: ${allergies.length > 0 ? allergies.join(', ') : 'None'}
- Region: ${userCountry} (${currency})
- Preferred cuisine: ${preferred_cuisine || 'No preference'}

Personality: warm, encouraging, science-based. Give practical, actionable advice. Plain text only.
Length: ${isCoachPro ? 'thorough: up to 3 focused paragraphs' : 'concise: 1-2 short paragraphs, max 120 words'}.
Never diagnose or replace professional medical advice. Always tailor to this user's profile.
Respond in ${coachLangName}.`;

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: isCoachPro ? 600 : 300,
      system: systemPrompt,
      messages: messages.slice(-10)
    });

    res.json({ success: true, message: { role: 'assistant', content: completion.content[0].text, timestamp: new Date().toISOString() } });

  } catch(error) {
    console.error('AI coach error:', error);
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
app.post('/api/xp/award', (req, res) => {
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
    const profile = db.getProfile(session.userId) || {};
    const newXP    = (profile.xp || 0) + xpEarned;
    const newLevel = calcLevel(newXP);
    const oldLevel = calcLevel(profile.xp || 0);

    profile.xp    = newXP;
    profile.level = newLevel;
    db.saveProfile(session.userId, profile);
    db.logEvent('xp_award', { action, xp: xpEarned, total: newXP, level: newLevel }, '');

    res.json({ success: true, xp: newXP, level: newLevel, levelUp: newLevel > oldLevel, xpEarned });
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

// ── Catch-all: serve index.html ────────────────────────────────────────────
app.get('*', (req, res) => {
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
db.initDb().then(() => {
  app.listen(PORT, () => console.log(`Mealzy running on http://localhost:${PORT}`));
}).catch(err => {
  console.error('[FATAL] Failed to initialise database:', err);
  process.exit(1);
});
