require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── File paths for persistent data ──
const LEADS_FILE    = path.join(__dirname, 'leads.json');
const ANALYTICS_FILE = path.join(__dirname, 'analytics.json');

// ── User data directory ──
const DATA_DIR          = path.join(__dirname, 'data');
const USERS_FILE        = path.join(DATA_DIR, 'users.json');
const RESET_TOKENS_FILE = path.join(DATA_DIR, 'reset-tokens.json');
const BACKUP_FILE       = path.join(DATA_DIR, 'backup.jsonl');

// Create data directory structure on startup
[DATA_DIR, path.join(DATA_DIR, 'profiles'), path.join(DATA_DIR, 'plans')].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Generic file helpers ──
function appendJsonLine(filePath, obj) {
  try {
    fs.appendFileSync(filePath, JSON.stringify(obj) + '\n', 'utf8');
  } catch(e) { /* fail silently */ }
}

function readJsonLines(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch(e) { return null; } })
      .filter(Boolean);
  } catch(e) { return []; }
}

// ── User data helpers ──
function readUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return {};
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch(e) { return {}; }
}

function writeUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch(e) { console.error('writeUsers error:', e); }
}

function readProfile(userId) {
  const file = path.join(DATA_DIR, 'profiles', `${userId}.json`);
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch(e) { return null; }
}

function writeProfile(userId, profile) {
  const file = path.join(DATA_DIR, 'profiles', `${userId}.json`);
  try {
    fs.writeFileSync(file, JSON.stringify(profile, null, 2), 'utf8');
  } catch(e) { console.error('writeProfile error:', e); }
}

function readResetTokens() {
  try {
    if (!fs.existsSync(RESET_TOKENS_FILE)) return {};
    return JSON.parse(fs.readFileSync(RESET_TOKENS_FILE, 'utf8'));
  } catch(e) { return {}; }
}

function writeResetTokens(tokens) {
  try {
    fs.writeFileSync(RESET_TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
  } catch(e) { console.error('writeResetTokens error:', e); }
}

// ── Append-only backup (survives across deploys if disk is persistent) ──
function backupWrite(type, data) {
  appendJsonLine(BACKUP_FILE, { type, data, ts: new Date().toISOString() });
}

// ── Cookie helpers ──
function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(part => {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k.trim()] = decodeURIComponent(v.join('=').trim());
  });
  return cookies;
}

function setSessionCookie(res, token) {
  const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `mealzy_session=${token}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Path=/${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'mealzy_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/');
}

// ── In-memory session store: token → { userId, email, expires } ──
// Note: sessions reset on server restart. Users are re-authenticated via cookie on next request.
// For production at scale, move this to Redis or a database.
const sessions = new Map();
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function createSession(userId, email) {
  const token = randomUUID();
  sessions.set(token, { userId, email, expires: Date.now() + SESSION_MAX_AGE_MS });
  return token;
}

function getSessionFromReq(req) {
  const cookies = parseCookies(req);
  const token = cookies.mealzy_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expires < Date.now()) { sessions.delete(token); return null; }
  return session;
}

// ── Simple in-memory usage tracker (resets on server restart) ──
const usageTracker = new Map();
const FREE_PLAN_LIMIT = 3;

// Referral bonus: key = referrer email, value = extra free plans earned
const referralBonus = new Map();

function getUsage(ip) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const record = usageTracker.get(ip);
  if (!record || record.month !== monthKey) {
    return { count: 0, month: monthKey };
  }
  return record;
}

function incrementUsage(ip) {
  const usage = getUsage(ip);
  usage.count += 1;
  usageTracker.set(ip, usage);
  return usage;
}

function getEffectiveLimit(email) {
  const bonus = email ? (referralBonus.get(email) || 0) : 0;
  return FREE_PLAN_LIMIT + bonus;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '2.0.0' }));

// Serve Supabase public config to the browser (anon key is safe to expose)
app.get('/supabase-config.js', (req, res) => {
  res.type('js').send(
    `window.SUPABASE_URL=${JSON.stringify(process.env.SUPABASE_URL||'')};` +
    `window.SUPABASE_KEY=${JSON.stringify(process.env.SUPABASE_ANON_KEY||'')};`
  );
});

// ════════════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ════════════════════════════════════════════════════════════════

// POST /api/auth/signup
app.post('/api/auth/signup', (req, res) => {
  try {
    const { name, email, hashedPassword } = req.body;
    if (!name || !email || !hashedPassword) {
      return res.status(400).json({ error: 'missing_fields', message: 'name, email, and hashedPassword are required.' });
    }
    const emailLower = email.toLowerCase().trim();
    const users = readUsers();
    if (users[emailLower]) {
      return res.status(409).json({ error: 'account_exists', message: 'An account with this email already exists.' });
    }
    const userId = randomUUID();
    const user = {
      id: userId,
      name: name.trim(),
      email: emailLower,
      hashedPassword,
      pro: false,
      created: new Date().toISOString()
    };
    users[emailLower] = user;
    writeUsers(users);
    backupWrite('signup', { id: userId, name: user.name, email: emailLower, created: user.created });
    appendJsonLine(ANALYTICS_FILE, { event: 'signup', data: { email: emailLower }, ts: new Date().toISOString() });
    const token = createSession(userId, emailLower);
    setSessionCookie(res, token);
    res.json({ success: true, user: { id: userId, name: user.name, email: emailLower, pro: false } });
  } catch(err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'signup_failed', message: 'Sign up failed. Please try again.' });
  }
});

// POST /api/auth/signin
app.post('/api/auth/signin', (req, res) => {
  try {
    const { email, hashedPassword } = req.body;
    if (!email || !hashedPassword) {
      return res.status(400).json({ error: 'missing_fields', message: 'email and hashedPassword are required.' });
    }
    const emailLower = email.toLowerCase().trim();
    const users = readUsers();
    const user = users[emailLower];
    if (!user) {
      return res.status(401).json({ error: 'not_found', message: 'No account found with that email. Please sign up first.' });
    }
    if (user.hashedPassword !== hashedPassword) {
      return res.status(401).json({ error: 'wrong_password', message: 'Incorrect password. Try again.' });
    }
    const token = createSession(user.id, emailLower);
    setSessionCookie(res, token);
    res.json({ success: true, user: { id: user.id, name: user.name, email: emailLower, pro: user.pro || false } });
  } catch(err) {
    console.error('Signin error:', err);
    res.status(500).json({ error: 'signin_failed', message: 'Sign in failed. Please try again.' });
  }
});

// GET /api/auth/me — returns current user (with profile) if session is valid
app.get('/api/auth/me', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const users = readUsers();
  const user = users[session.email];
  if (!user) {
    // Session exists but user was deleted — clear it
    const cookies = parseCookies(req);
    if (cookies.mealzy_session) sessions.delete(cookies.mealzy_session);
    clearSessionCookie(res);
    return res.status(401).json({ error: 'user_not_found' });
  }
  const profile = readProfile(user.id);
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    pro: user.pro || false,
    profile
  });
});

// POST /api/auth/signout
app.post('/api/auth/signout', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.mealzy_session;
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  res.json({ success: true });
});

// POST /api/auth/reset-request
// Returns the token directly in the response (no email sending yet).
// Show it on screen with instructions.
app.post('/api/auth/reset-request', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email_required' });
    const emailLower = email.toLowerCase().trim();
    const users = readUsers();
    if (!users[emailLower]) {
      // Don't reveal whether account exists
      return res.json({ success: true, found: false });
    }
    const token = randomUUID();
    const tokens = readResetTokens();
    tokens[token] = { email: emailLower, expires: Date.now() + 60 * 60 * 1000 }; // 1 hour
    writeResetTokens(tokens);
    backupWrite('reset_request', { email: emailLower });
    res.json({ success: true, found: true, token });
  } catch(err) {
    console.error('Reset request error:', err);
    res.status(500).json({ error: 'reset_failed' });
  }
});

// POST /api/auth/reset-confirm
app.post('/api/auth/reset-confirm', (req, res) => {
  try {
    const { token, newHashedPassword } = req.body;
    if (!token || !newHashedPassword) {
      return res.status(400).json({ error: 'token and newHashedPassword required' });
    }
    const tokens = readResetTokens();
    const record = tokens[token];
    if (!record) {
      return res.status(400).json({ error: 'invalid_token', message: 'Invalid reset token. Request a new one.' });
    }
    if (record.expires < Date.now()) {
      delete tokens[token];
      writeResetTokens(tokens);
      return res.status(400).json({ error: 'expired_token', message: 'Reset token has expired. Request a new one.' });
    }
    const users = readUsers();
    if (!users[record.email]) {
      return res.status(400).json({ error: 'user_not_found' });
    }
    users[record.email].hashedPassword = newHashedPassword;
    writeUsers(users);
    delete tokens[token];
    writeResetTokens(tokens);
    backupWrite('password_reset', { email: record.email });
    res.json({ success: true, message: 'Password updated. You can now sign in with your new password.' });
  } catch(err) {
    console.error('Reset confirm error:', err);
    res.status(500).json({ error: 'reset_confirm_failed' });
  }
});

// ════════════════════════════════════════════════════════════════
// PROFILE ENDPOINTS
// ════════════════════════════════════════════════════════════════

// POST /api/profile — save or update user profile
app.post('/api/profile', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const { profile } = req.body;
  if (!profile) return res.status(400).json({ error: 'profile required' });
  writeProfile(session.userId, profile);
  backupWrite('profile', { userId: session.userId, profile });
  res.json({ success: true });
});

// GET /api/profile — get user profile
app.get('/api/profile', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const profile = readProfile(session.userId);
  if (!profile) return res.status(404).json({ error: 'no_profile' });
  res.json({ success: true, profile });
});

// ════════════════════════════════════════════════════════════════
// PLAN HISTORY ENDPOINTS
// ════════════════════════════════════════════════════════════════

// POST /api/plans/save — save a generated meal plan for the current user
app.post('/api/plans/save', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const { plan, date } = req.body;
  if (!plan) return res.status(400).json({ error: 'plan required' });
  try {
    const userPlansDir = path.join(DATA_DIR, 'plans', session.userId);
    if (!fs.existsSync(userPlansDir)) fs.mkdirSync(userPlansDir, { recursive: true });
    const planDate = date || new Date().toISOString().split('T')[0];
    const filename = `${planDate}_${Date.now()}.json`;
    fs.writeFileSync(
      path.join(userPlansDir, filename),
      JSON.stringify({ date: planDate, plan, savedAt: new Date().toISOString() }, null, 2)
    );
    backupWrite('plan', { userId: session.userId, date: planDate });
    res.json({ success: true });
  } catch(err) {
    console.error('Plan save error:', err);
    res.status(500).json({ error: 'save_failed' });
  }
});

// GET /api/plans — get last 10 saved plans for the current user
app.get('/api/plans', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  try {
    const userPlansDir = path.join(DATA_DIR, 'plans', session.userId);
    if (!fs.existsSync(userPlansDir)) return res.json({ success: true, plans: [] });
    const files = fs.readdirSync(userPlansDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 10);
    const plans = files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(userPlansDir, f), 'utf8')); }
      catch(e) { return null; }
    }).filter(Boolean);
    res.json({ success: true, plans });
  } catch(err) {
    res.json({ success: true, plans: [] });
  }
});

// ════════════════════════════════════════════════════════════════
// PRO ACTIVATION
// ════════════════════════════════════════════════════════════════

// POST /api/pro/activate — mark current user as Pro (called from pro-welcome.html)
app.post('/api/pro/activate', (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  const users = readUsers();
  if (!users[session.email]) return res.status(404).json({ error: 'user_not_found' });
  users[session.email].pro = true;
  writeUsers(users);
  backupWrite('pro_activate', { email: session.email, activatedAt: new Date().toISOString() });
  appendJsonLine(ANALYTICS_FILE, { event: 'pro_activated', data: { email: session.email }, ts: new Date().toISOString() });
  res.json({ success: true, pro: true });
});

// ════════════════════════════════════════════════════════════════
// ADMIN EXPORT
// ════════════════════════════════════════════════════════════════

// GET /api/admin/export — export all user data (passwords excluded), PRO_TOKEN protected
app.get('/api/admin/export', (req, res) => {
  const token = req.headers['x-pro-token'] || req.query.token;
  if (!token || token !== process.env.PRO_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const users = readUsers();
    const safeUsers = Object.fromEntries(
      Object.entries(users).map(([email, u]) => [
        email,
        { id: u.id, name: u.name, email: u.email, pro: u.pro || false, created: u.created }
      ])
    );
    const backupContent = fs.existsSync(BACKUP_FILE) ? fs.readFileSync(BACKUP_FILE, 'utf8') : '';
    res.json({
      user_count: Object.keys(users).length,
      pro_count: Object.values(users).filter(u => u.pro).length,
      users: safeUsers,
      backup_line_count: backupContent.split('\n').filter(Boolean).length,
      exported_at: new Date().toISOString(),
      note: 'Passwords are excluded from this export.'
    });
  } catch(e) {
    res.status(500).json({ error: 'Export failed', message: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ANALYTICS
// ════════════════════════════════════════════════════════════════

// POST /api/track — lightweight analytics event tracking
app.post('/api/track', (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).json({ error: 'event required' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  appendJsonLine(ANALYTICS_FILE, {
    event,
    data: data || {},
    ip: ip.slice(-8),
    ts: new Date().toISOString()
  });
  res.json({ ok: true });
});

// GET /api/analytics — aggregated stats (PRO_TOKEN protected)
app.get('/api/analytics', (req, res) => {
  const token = req.headers['x-pro-token'] || req.query.token;
  if (token !== process.env.PRO_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const events = readJsonLines(ANALYTICS_FILE);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = events.filter(e => new Date(e.ts) >= monthStart);
  const count = (arr, type) => arr.filter(e => e.event === type).length;
  const dayCounts = {};
  events.forEach(e => {
    const day = new Date(e.ts).getDay();
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  });
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const mostActiveDay = dayNames[Object.entries(dayCounts).sort((a,b) => b[1]-a[1])[0]?.[0]] || 'N/A';
  const users = readUsers();
  res.json({
    total_events: events.length,
    total_users: Object.keys(users).length,
    pro_users: Object.values(users).filter(u => u.pro).length,
    this_month: {
      signups: count(thisMonth, 'signup'),
      plans_generated: count(thisMonth, 'generate_plan'),
      free_limit_hits: count(thisMonth, 'free_limit_hit'),
      upgrade_clicks: count(thisMonth, 'upgrade_click'),
      share_clicks: count(thisMonth, 'share_click'),
      page_views: count(thisMonth, 'page_view'),
      pro_activations: count(thisMonth, 'pro_activated'),
    },
    all_time: {
      signups: count(events, 'signup'),
      plans_generated: count(events, 'generate_plan'),
      free_limit_hits: count(events, 'free_limit_hit'),
      upgrade_clicks: count(events, 'upgrade_click'),
      pro_activations: count(events, 'pro_activated'),
    },
    most_active_day: mostActiveDay,
    total_leads: readJsonLines(LEADS_FILE).length,
  });
});

// ════════════════════════════════════════════════════════════════
// REFERRAL
// ════════════════════════════════════════════════════════════════

// POST /api/referral — credit a referrer when a referred user signs up
app.post('/api/referral', (req, res) => {
  const { referrer_email, new_user_email } = req.body;
  if (!referrer_email) return res.status(400).json({ error: 'referrer_email required' });
  const current = referralBonus.get(referrer_email) || 0;
  referralBonus.set(referrer_email, current + 1);
  appendJsonLine(ANALYTICS_FILE, {
    event: 'referral_signup',
    data: { referrer: referrer_email, new_user: new_user_email },
    ts: new Date().toISOString()
  });
  res.json({ ok: true, bonus_plans: current + 1 });
});

// GET /api/referral-status — check referral bonus for an email
app.get('/api/referral-status', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  const bonus = referralBonus.get(email) || 0;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const usage = getUsage(ip);
  const effectiveLimit = getEffectiveLimit(email);
  res.json({ bonus_plans: bonus, effective_limit: effectiveLimit, used: usage.count });
});

// ════════════════════════════════════════════════════════════════
// EMAIL LEADS
// ════════════════════════════════════════════════════════════════

// POST /api/email-leads — capture email, write to leads.json
app.post('/api/email-leads', (req, res) => {
  try {
    const { email, source = 'unknown', name = '' } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const lead = { email: email.toLowerCase().trim(), source, name, ts: new Date().toISOString() };
    appendJsonLine(LEADS_FILE, lead);
    res.json({ success: true });
  } catch (err) {
    console.error('Email lead error:', err);
    res.json({ success: true }); // fail silently to client
  }
});

// ════════════════════════════════════════════════════════════════
// MEAL GENERATION
// ════════════════════════════════════════════════════════════════

// POST /api/generate-meal — generate daily meal plan or swap a single meal
app.post('/api/generate-meal', async (req, res) => {
  try {
    const { profile, date, swap_meal_type, plan_token, user_email, avoid_meals } = req.body;

    if (!profile) {
      return res.status(400).json({ error: 'Profile is required' });
    }

    // ── Freemium gate ──
    // Check server-side Pro status first (authoritative), then fall back to client claim
    const session = getSessionFromReq(req);
    let isPro = plan_token === process.env.PRO_TOKEN;
    if (!isPro && session) {
      const users = readUsers();
      const user = users[session.email];
      isPro = user?.pro === true;
    }
    // Backward compat: accept client-sent is_pro for users without server accounts
    if (!isPro) isPro = req.body.is_pro === true;

    if (!swap_meal_type && !isPro) {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      const usage = getUsage(ip);
      const effectiveLimit = getEffectiveLimit(user_email || '');
      if (usage.count >= effectiveLimit) {
        appendJsonLine(ANALYTICS_FILE, { event: 'free_limit_hit', data: {}, ts: new Date().toISOString() });
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
      appendJsonLine(ANALYTICS_FILE, { event: 'generate_plan', data: { plan_num: usage.count + 1 }, ts: new Date().toISOString() });
    } else if (!swap_meal_type && isPro) {
      appendJsonLine(ANALYTICS_FILE, { event: 'generate_plan', data: { pro: true }, ts: new Date().toISOString() });
    }

    const name = profile.name || 'User';
    const goal = profile.fitness_goal || profile.goal || 'eat healthier';
    const dietaryPrefs = profile.dietary_preferences || profile.dietaryPrefs || [];
    const allergies = profile.allergies || [];
    const cookingSkill = profile.cooking_skill || profile.cookingSkill || 'intermediate';
    const dailyCalories = profile.daily_calories || profile.dailyCalories || 2000;
    const dailyProtein = profile.daily_protein || (profile.macros && profile.macros.protein) || 150;
    const dailyCarbs = profile.daily_carbs || (profile.macros && profile.macros.carbs) || 200;
    const dailyFat = profile.daily_fat || (profile.macros && profile.macros.fat) || 65;
    const budget = profile.budget_weekly || profile.budget || 100;
    const currency = profile.currency || 'USD';
    const cookingTimeMinutes = profile.cooking_time_minutes || profile.cookingTimeMinutes || 30;
    const language = profile.language || 'en';
    const languageNames = { en:'English', sv:'Swedish', no:'Norwegian', da:'Danish', de:'German', fr:'French', es:'Spanish', it:'Italian', pt:'Portuguese', nl:'Dutch', ja:'Japanese', fi:'Finnish', pl:'Polish', tr:'Turkish', ko:'Korean', zh:'Chinese', ar:'Arabic', hi:'Hindi', ru:'Russian' };
    const languageName = languageNames[language] || 'English';
    const dailyBudget = (budget / 7).toFixed(2);
    const perMealBudget = (budget / 7 / 4).toFixed(2);

    const dietaryInfo = dietaryPrefs.length > 0 ? `Dietary preferences: ${dietaryPrefs.join(', ')}.` : '';
    const allergyInfo = allergies.length > 0 ? `Allergies/restrictions: ${allergies.join(', ')}.` : '';
    const avoidInfo = avoid_meals && avoid_meals.length > 0 ? `The user previously disliked these meals — do NOT suggest them: ${avoid_meals.join(', ')}.` : '';

    const cuisineGroups = {
      mediterranean: ['Greek','Italian','Spanish','Moroccan','Turkish','Lebanese','Tunisian'],
      asian: ['Japanese','Chinese','Korean','Vietnamese','Thai','Filipino','Malaysian','Indonesian'],
      indian: ['North Indian','South Indian','Bengali','Punjabi','Goan'],
      middleeastern: ['Lebanese','Persian','Israeli','Egyptian','Jordanian'],
      american: ['American','Tex-Mex','Southern BBQ','New England','Californian'],
      mexican: ['Mexican','Oaxacan','Yucatecan','Street Food Mexican'],
      scandinavian: ['Swedish','Norwegian','Danish','Finnish'],
      african: ['Ethiopian','West African','South African','Moroccan'],
      european: ['French','German','British','Polish','Portuguese'],
      latin: ['Brazilian','Argentinian','Peruvian','Colombian']
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
    const randomSeed = Math.floor(Math.random() * 99999);

    // === SINGLE MEAL SWAP ===
    if (swap_meal_type) {
      const mealCalories = {
        breakfast: Math.round(dailyCalories * 0.25),
        lunch: Math.round(dailyCalories * 0.35),
        dinner: Math.round(dailyCalories * 0.30),
        snack: Math.round(dailyCalories * 0.10)
      };
      const targetCals = mealCalories[swap_meal_type] || Math.round(dailyCalories * 0.25);

      const swapPrompt = `Generate ONE practical home-cooked ${swap_meal_type} meal for ${name}.

Cuisine: ${todayCuisine}, protein: ${todayProtein}. Seed: ${randomSeed}.
Calories: ~${targetCals} kcal. Skill: ${cookingSkill}. Max time: ${cookingTimeMinutes} min.
Budget: max ${currency} ${perMealBudget} for this meal. Use common supermarket ingredients.
${dietaryInfo}
${allergyInfo}
${avoidInfo}
LANGUAGE: All meal name, description, and ingredient names must be in ${languageName}.

Respond ONLY with this JSON (no markdown):
{
  "type": "${swap_meal_type}",
  "name": "Meal Name",
  "description": "Short description under 10 words",
  "calories": ${targetCals},
  "protein": 25,
  "carbs": 35,
  "fat": 12,
  "cookTime": 20,
  "servings": 1,
  "estimatedCost": 5.00,
  "ingredients": [
    { "name": "ingredient", "amount": "1 cup", "cost": 1.20 }
  ],
  "instructions": ["Step 1", "Step 2", "Step 3"],
  "imageKeyword": "food keyword for image search"
}`;

      const completion = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: 'You are a professional nutritionist and chef. Always respond with valid JSON only, no markdown, no explanation.',
        messages: [{ role: 'user', content: swapPrompt }]
      });

      let rawContent = completion.content[0].text.trim();
      rawContent = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      const jsonStart = rawContent.indexOf('{');
      if (jsonStart > 0) rawContent = rawContent.slice(jsonStart);
      const meal = JSON.parse(rawContent);

      if (process.env.UNSPLASH_ACCESS_KEY) {
        try {
          const query = encodeURIComponent((meal.imageKeyword || meal.name) + ' dish plated food photography');
          const imgRes = await fetch(`https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape`, {
            headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }
          });
          const imgData = await imgRes.json();
          if (imgData.results && imgData.results[0]) {
            meal.image_url = imgData.results[0].urls.small;
          }
        } catch (e) { /* keep default */ }
      }

      return res.json({ success: true, meal });
    }

    // === FULL DAILY MEAL PLAN ===
    const prompt = `Generate a practical, delicious daily meal plan for ${name} on ${date}.

Cuisine style: ${todayCuisine}. Featured protein: ${todayProtein}. Variety seed: ${randomSeed}.
Use real, everyday ingredients available at a regular supermarket — nothing exotic or hard to find. Meals should be satisfying and realistic for a home cook.

User profile:
- Goal: ${goal}
- Daily calorie target: ${dailyCalories} kcal (Protein ${dailyProtein}g, Carbs ${dailyCarbs}g, Fat ${dailyFat}g)
- Cooking skill: ${cookingSkill}
- Max time per meal: ${cookingTimeMinutes} min
- STRICT DAILY BUDGET: ${currency} ${dailyBudget} total for all meals. Each meal max ${currency} ${perMealBudget}. estimatedCost values MUST be realistic and the sum across all 4 meals MUST NOT exceed ${currency} ${dailyBudget}.
${dietaryInfo}
${allergyInfo}
${avoidInfo}

LANGUAGE: Write ALL meal names, descriptions, and ingredient names in ${languageName}. JSON keys stay in English.

Generate exactly 4 meals: breakfast, lunch, dinner, snack.

Respond ONLY with this JSON (keep ingredients to ${isPro ? '6' : '4'} max, instructions to ${isPro ? '5' : '3'} max, descriptions under ${isPro ? '15' : '10'} words):
{
  "meals": [
    {
      "type": "breakfast",
      "name": "Meal Name",
      "description": "Short description",
      "calories": 450,
      "protein": 25,
      "carbs": 45,
      "fat": 15,
      "cookTime": 15,
      "servings": 1,
      "estimatedCost": 4.50,
      "ingredients": [
        { "name": "ingredient", "amount": "1 cup", "cost": 1.20 }
      ],
      "instructions": ["Step 1", "Step 2", "Step 3"],
      "imageKeyword": "simple english food keyword for image search e.g. scrambled eggs"
    }
  ],
  "totalCalories": 1950,
  "totalCost": 18.50,
  "nutritionNote": "Short note"
}`;

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: isPro ? 6000 : 4000,
      system: isPro
        ? 'You are a professional nutritionist and chef. Always respond with valid JSON only, no markdown, no explanation. Pro users get detailed, restaurant-quality instructions — up to 5 steps per meal with precise techniques.'
        : 'You are a professional nutritionist and chef. Always respond with valid JSON only, no markdown, no explanation. Keep instructions to max 3 steps each to stay within token limits.',
      messages: [{ role: 'user', content: prompt }]
    });

    let rawContent = completion.content[0].text.trim();
    console.log('AI response length:', rawContent.length, '| Last 100 chars:', rawContent.slice(-100));
    rawContent = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    let mealPlan;

    try {
      mealPlan = JSON.parse(rawContent);
    } catch (parseError) {
      let jsonStr = rawContent;
      const startIdx = jsonStr.indexOf('{');
      if (startIdx > 0) jsonStr = jsonStr.slice(startIdx);
      try {
        const lastComplete = jsonStr.lastIndexOf(',"imageKeyword"');
        if (lastComplete > 0) {
          const endOfMeal = jsonStr.indexOf('}', lastComplete) + 1;
          jsonStr = jsonStr.slice(0, endOfMeal) + '],"totalCalories":2000,"totalCost":20,"nutritionNote":"Balanced meal plan"}';
        }
        mealPlan = JSON.parse(jsonStr);
      } catch (e) {
        throw new Error('Failed to parse meal plan JSON');
      }
    }

    if (process.env.UNSPLASH_ACCESS_KEY && mealPlan.meals) {
      await Promise.all(mealPlan.meals.map(async (meal) => {
        try {
          const query = encodeURIComponent((meal.imageKeyword || meal.name) + ' dish plated food photography');
          const imgRes = await fetch(`https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape`, {
            headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }
          });
          const imgData = await imgRes.json();
          if (imgData.results && imgData.results[0]) {
            meal.image_url = imgData.results[0].urls.small;
          }
        } catch (e) { /* keep default image if fetch fails */ }
      }));
    }

    res.json({ success: true, date, mealPlan });
  } catch (error) {
    console.error('Error generating meal plan:', error);
    res.status(500).json({
      error: 'Failed to generate meal plan',
      message: error.message,
      fallback: generateFallbackMealPlan(req.body.profile)
    });
  }
});

// ════════════════════════════════════════════════════════════════
// GROCERY LIST
// ════════════════════════════════════════════════════════════════

// POST /api/generate-grocery-list
app.post('/api/generate-grocery-list', async (req, res) => {
  try {
    const { profile, meals, weekStart } = req.body;

    if (!meals || meals.length === 0) {
      return res.status(400).json({ error: 'Meals array is required' });
    }

    const {
      budget = 100,
      currency = 'USD',
      dietaryPrefs = [],
      allergies = [],
      language: groceryLang = 'en'
    } = profile || {};
    const groceryLangNames = { en:'English', sv:'Swedish', no:'Norwegian', da:'Danish', de:'German', fr:'French', es:'Spanish', it:'Italian', pt:'Portuguese', nl:'Dutch', ja:'Japanese', fi:'Finnish', pl:'Polish', tr:'Turkish', ko:'Korean', zh:'Chinese', ar:'Arabic', hi:'Hindi', ru:'Russian' };
    const groceryLangName = groceryLangNames[groceryLang] || 'English';

    const mealList = meals.map(m => `- ${m.name} (${m.type})`).join('\n');
    const allergyInfo = allergies.length > 0 ? `Avoid: ${allergies.join(', ')}.` : '';
    const prefInfo = dietaryPrefs.length > 0 ? `Dietary preferences: ${dietaryPrefs.join(', ')}.` : '';

    const prompt = `Generate a complete grocery list for the following weekly meals:

${mealList}

${prefInfo}
${allergyInfo}
Weekly budget: ${currency} ${budget}. Keep total cost at or under this amount.
Write all ingredient names in ${groceryLangName}. JSON keys stay in English.

Consolidate duplicate ingredients. Group by category.

Respond ONLY with valid JSON:
{
  "weekStart": "${weekStart}",
  "totalCost": 85.50,
  "budgetAmount": ${budget},
  "currency": "${currency}",
  "categories": {
    "produce": [
      { "name": "Spinach", "amount": "200g", "cost": 2.50, "checked": false }
    ],
    "protein": [],
    "dairy": [],
    "grains": [],
    "pantry": [],
    "frozen": [],
    "beverages": [],
    "other": []
  }
}`;

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: 'You are a professional nutritionist. Always respond with valid JSON only.',
      messages: [{ role: 'user', content: prompt }]
    });

    const rawContent = completion.content[0].text.trim();
    let groceryList;

    try {
      groceryList = JSON.parse(rawContent);
    } catch (parseError) {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        groceryList = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse grocery list JSON');
      }
    }

    res.json({ success: true, groceryList });
  } catch (error) {
    console.error('Error generating grocery list:', error);
    res.status(500).json({ error: 'Failed to generate grocery list', message: error.message });
  }
});

// ════════════════════════════════════════════════════════════════
// AI COACH
// ════════════════════════════════════════════════════════════════

// POST /api/ai-coach — AI nutritionist chat
app.post('/api/ai-coach', async (req, res) => {
  try {
    const { messages, profile, is_pro } = req.body;
    // Check server-side pro status first
    const session = getSessionFromReq(req);
    let isCoachPro = is_pro === true;
    if (session) {
      const users = readUsers();
      const user = users[session.email];
      if (user?.pro) isCoachPro = true;
    }

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const {
      name = 'User',
      goal = 'eat healthier',
      dailyCalories = 2000,
      macros = { protein: 150, carbs: 200, fat: 67 },
      dietaryPrefs = [],
      allergies = [],
      weight = 70,
      height = 170,
      age = 30,
      currency = 'USD',
      preferred_cuisine = '',
      language: coachLang = 'en'
    } = profile || {};
    const coachLangNames = { en:'English', sv:'Swedish', no:'Norwegian', da:'Danish', de:'German', fr:'French', es:'Spanish', it:'Italian', pt:'Portuguese', nl:'Dutch', ja:'Japanese', fi:'Finnish', pl:'Polish', tr:'Turkish', ko:'Korean', zh:'Chinese', ar:'Arabic', hi:'Hindi', ru:'Russian' };
    const coachLangName = coachLangNames[coachLang] || 'English';

    const currencyToCountry = {
      USD: 'United States', GBP: 'United Kingdom', EUR: 'Europe',
      SEK: 'Sweden', NOK: 'Norway', DKK: 'Denmark',
      CAD: 'Canada', AUD: 'Australia', NZD: 'New Zealand',
      CHF: 'Switzerland', JPY: 'Japan', CNY: 'China',
      KRW: 'South Korea', INR: 'India', BRL: 'Brazil',
      MXN: 'Mexico', ARS: 'Argentina', ZAR: 'South Africa',
      AED: 'United Arab Emirates', SAR: 'Saudi Arabia',
      SGD: 'Singapore', HKD: 'Hong Kong', PLN: 'Poland',
      CZK: 'Czech Republic', HUF: 'Hungary', TRY: 'Turkey',
      THB: 'Thailand', MYR: 'Malaysia', IDR: 'Indonesia', PHP: 'Philippines'
    };
    const userCountry = currencyToCountry[currency] || 'their country';

    const systemPrompt = `You are Mia, a friendly, knowledgeable AI nutritionist and wellness coach for the Mealzy app. You are talking with ${name}.

User profile:
- Goal: ${goal}
- Daily calorie target: ${dailyCalories} kcal
- Macro targets: Protein ${macros.protein}g, Carbs ${macros.carbs}g, Fat ${macros.fat}g
- Weight: ${weight}kg, Height: ${height}cm, Age: ${age}
- Dietary preferences: ${dietaryPrefs.length > 0 ? dietaryPrefs.join(', ') : 'None specified'}
- Allergies: ${allergies.length > 0 ? allergies.join(', ') : 'None'}
- Country / region: ${userCountry} (currency: ${currency})
- Preferred cuisine: ${preferred_cuisine || 'No preference'}

Your personality:
- Warm, encouraging, and science-based
- Give practical, actionable advice
- No emojis — plain text only
- Keep responses ${isCoachPro ? 'thorough but focused: up to 3 paragraphs, no hard word limit' : 'concise and focused: 1-2 short paragraphs max, never more than 120 words'}
- Never give medical diagnoses or replace professional medical advice
- Always tailor advice to the user's specific goals and profile
- Always respond in ${coachLangName}`;

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: isCoachPro ? 600 : 300,
      system: systemPrompt,
      messages: messages.slice(-10)
    });

    const reply = completion.content[0].text;

    res.json({
      success: true,
      message: {
        role: 'assistant',
        content: reply,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error in AI coach:', error);
    res.status(500).json({ error: 'Failed to get AI response', message: error.message });
  }
});

// ════════════════════════════════════════════════════════════════
// FALLBACK MEAL PLAN
// ════════════════════════════════════════════════════════════════

function generateFallbackMealPlan(profile) {
  const calories = profile?.dailyCalories || 2000;
  return {
    meals: [
      {
        type: 'breakfast', name: 'Greek Yogurt Parfait',
        description: 'Creamy Greek yogurt layered with fresh berries and granola',
        calories: Math.round(calories * 0.25), protein: 20, carbs: 35, fat: 8,
        cookTime: 5, servings: 1, estimatedCost: 3.50,
        ingredients: [
          { name: 'Greek yogurt', amount: '200g', cost: 1.80 },
          { name: 'Mixed berries', amount: '100g', cost: 1.20 },
          { name: 'Granola', amount: '50g', cost: 0.50 }
        ],
        instructions: ['Spoon yogurt into a bowl.', 'Layer with fresh berries.', 'Top with granola and serve.']
      },
      {
        type: 'lunch', name: 'Grilled Chicken Salad',
        description: 'Tender grilled chicken over crisp greens with avocado',
        calories: Math.round(calories * 0.30), protein: 40, carbs: 20, fat: 18,
        cookTime: 20, servings: 1, estimatedCost: 6.00,
        ingredients: [
          { name: 'Chicken breast', amount: '150g', cost: 3.00 },
          { name: 'Mixed salad greens', amount: '100g', cost: 1.20 },
          { name: 'Avocado', amount: '1/2', cost: 1.00 },
          { name: 'Cherry tomatoes', amount: '100g', cost: 0.80 }
        ],
        instructions: ['Season and grill chicken 6-7 min per side.', 'Let rest 5 min, then slice.', 'Arrange over greens with avocado and lemon juice.']
      },
      {
        type: 'snack', name: 'Apple with Almond Butter',
        description: 'Crisp apple slices with creamy almond butter',
        calories: Math.round(calories * 0.10), protein: 5, carbs: 25, fat: 8,
        cookTime: 2, servings: 1, estimatedCost: 2.00,
        ingredients: [
          { name: 'Apple', amount: '1 medium', cost: 0.80 },
          { name: 'Almond butter', amount: '2 tbsp', cost: 1.20 }
        ],
        instructions: ['Wash and slice the apple.', 'Serve with almond butter for dipping.']
      },
      {
        type: 'dinner', name: 'Salmon with Roasted Vegetables',
        description: 'Pan-seared salmon with colorful roasted seasonal vegetables',
        calories: Math.round(calories * 0.35), protein: 45, carbs: 30, fat: 20,
        cookTime: 30, servings: 1, estimatedCost: 9.00,
        ingredients: [
          { name: 'Salmon fillet', amount: '200g', cost: 5.00 },
          { name: 'Broccoli', amount: '150g', cost: 1.20 },
          { name: 'Bell pepper', amount: '1', cost: 1.00 },
          { name: 'Olive oil', amount: '1 tbsp', cost: 0.30 }
        ],
        instructions: ['Roast veg at 200°C for 20 min.', 'Cook salmon 4 min per side.', 'Serve with lemon wedge.']
      }
    ],
    totalCalories: calories,
    totalCost: 20.50,
    nutritionNote: 'Balanced meal plan with lean proteins, complex carbs, and healthy fats.'
  };
}

// Catch-all: serve index.html for unmatched routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Mealzy running on http://localhost:${PORT}`));
