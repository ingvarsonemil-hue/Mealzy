'use strict';

const { createClient } = require('@libsql/client');
const { randomUUID } = require('crypto');

let _client = null;

// ── Init ──────────────────────────────────────────────────────────────────────

async function initDb() {
  _client = createClient({
    url:       process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  await _applySchema();
  console.log('[db] Turso ready');
}

async function _applySchema() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      email            TEXT UNIQUE NOT NULL,
      hashed_password  TEXT NOT NULL,
      pro              INTEGER DEFAULT 0,
      created_at       TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS profiles (
      user_id    TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS plans (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS reset_tokens (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used       INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS leads (
      id         TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      source     TEXT,
      name       TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS analytics (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      event      TEXT NOT NULL,
      data       TEXT,
      ip_tail    TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS family_profiles (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      name       TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS referrals (
      id             TEXT PRIMARY KEY,
      referrer_email TEXT NOT NULL,
      referred_ip    TEXT,
      referred_email TEXT,
      converted      INTEGER DEFAULT 0,
      created_at     TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS share_links (
      share_id   TEXT PRIMARY KEY,
      plan_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      data       TEXT NOT NULL,
      views      INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS email_queue (
      id         TEXT PRIMARY KEY,
      to_email   TEXT NOT NULL,
      subject    TEXT NOT NULL,
      html       TEXT NOT NULL,
      sent       INTEGER DEFAULT 0,
      error      TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      sent_at    TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS recipes (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS coach_usage (
      user_id  TEXT NOT NULL,
      date     TEXT NOT NULL,
      count    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, date)
    )`,
    `CREATE TABLE IF NOT EXISTS grocery_lists (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      plan_id    TEXT NOT NULL,
      day        TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS processed_webhook_events (
      event_id     TEXT PRIMARY KEY,
      processed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS daily_api_spend (
      date TEXT PRIMARY KEY,
      cost_usd REAL NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS verification_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS ingredient_prices (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL UNIQUE,
      category       TEXT DEFAULT 'pantry',
      price_per_unit REAL NOT NULL,
      unit           TEXT NOT NULL,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS meal_feedback (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      meal_name  TEXT NOT NULL,
      action     TEXT NOT NULL,
      reason     TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS favorites (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      meal_key   TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS trial_generations (
      user_id    TEXT NOT NULL,
      local_date TEXT NOT NULL,
      plan_id    TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, local_date)
    )`,
    // ── Mealzy Mobile M4E — one-free-week entitlement ─────────────────────────
    // Exactly one row per user (user_id PRIMARY KEY). status is 'reserved'
    // (a week generation is in flight) or 'consumed' (a complete weekly plan
    // was successfully persisted for free). request_id scopes ownership so one
    // request can never release or promote another request's reservation.
    `CREATE TABLE IF NOT EXISTS free_week_entitlement (
      user_id     TEXT PRIMARY KEY,
      status      TEXT NOT NULL,
      request_id  TEXT NOT NULL,
      week_start  TEXT,
      plan_id     TEXT,
      reserved_at TEXT NOT NULL DEFAULT (datetime('now')),
      consumed_at TEXT
    )`,
  ];

  for (const sql of tables) {
    await _client.execute(sql);
  }

  const alters = [
    `ALTER TABLE users ADD COLUMN bonus_plans INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN ref_code TEXT`,
    `ALTER TABLE users ADD COLUMN pro_until TEXT`,
    `ALTER TABLE users ADD COLUMN signup_date TEXT`,
    `ALTER TABLE users ADD COLUMN nudge_sent INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN limit_email_sent INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN stripe_customer_id TEXT`,
    `ALTER TABLE users ADD COLUMN google_id TEXT`,
    `ALTER TABLE users ADD COLUMN nps_submitted_at TEXT`,
    `ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN email_verified INTEGER`,
    `ALTER TABLE users ADD COLUMN trial_started_at TEXT`,
  ];
  for (const sql of alters) {
    try { await _client.execute(sql); } catch(e) { /* column already exists */ }
  }

  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_grocery_user_plan_day ON grocery_lists(user_id, plan_id, day)`,
    `CREATE INDEX IF NOT EXISTS idx_ingredient_prices_name ON ingredient_prices(name)`,
    `CREATE INDEX IF NOT EXISTS idx_meal_feedback_user_action ON meal_feedback(user_id, action)`,
    `CREATE INDEX IF NOT EXISTS idx_meal_feedback_user_id ON meal_feedback(user_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_user_mealkey ON favorites(user_id, meal_key)`,
  ];
  for (const sql of indexes) {
    try { await _client.execute(sql); } catch(e) { /* index already exists */ }
  }

  try {
    await _client.execute(`UPDATE users SET signup_date = created_at WHERE signup_date IS NULL`);
  } catch(e) {}

  try {
    await _client.execute(`UPDATE users SET email_verified = 1 WHERE email_verified IS NULL`);
  } catch(e) {}

  // ── ingredient_prices unit-normalization fix (pricing foundation) ──────────
  // These three rows stored a package/pack price under a non-gram/ml unit
  // ("lb", "1L", "800g tub"), which the cost calculator silently treated as
  // if it were a per-gram/per-ml price - producing costs off by 2-3 orders
  // of magnitude (e.g. salmon priced at $9/lb computed as $9/g).
  // Converted to canonical g/ml at the SAME economic value, not re-priced:
  //   salmon fillets: $9.00/lb  -> $9.00 / 453.59237 g/lb = $0.0198/g
  //   almond milk:    $2.80/1L  -> $2.80 / 1000 ml         = $0.0028/ml
  //   greek yogurt:   $5.40/800g tub -> $5.40 / 800 g       = $0.00675/g
  // Guarded on the OLD unit so this only fires once and is a no-op if the
  // row has already been corrected (manually or by a prior boot).
  const unitFixes = [
    { name: 'salmon fillets', oldUnit: 'lb',           newUnit: 'g',  newPrice: 0.0198 },
    { name: 'almond milk',    oldUnit: '1L',            newUnit: 'ml', newPrice: 0.0028 },
    { name: 'greek yogurt',   oldUnit: '800g tub',       newUnit: 'g',  newPrice: 0.00675 },
  ];
  for (const fix of unitFixes) {
    try {
      await _client.execute({
        sql: `UPDATE ingredient_prices SET price_per_unit = ?, unit = ? WHERE name = ? AND unit = ?`,
        args: [fix.newPrice, fix.newUnit, fix.name, fix.oldUnit],
      });
    } catch(e) { /* best-effort, non-fatal */ }
  }

  // ── Mealzy Mobile M4E — historical free-week entitlement backfill ──────────
  // Idempotent: only inserts a 'consumed' row for a user who does not already
  // have an entitlement row and who has at least one genuine historical weekly
  // plan. Best-effort — a failure here must never block boot.
  try {
    await backfillFreeWeekEntitlements();
  } catch (e) {
    console.error('[db] free_week_entitlement backfill error (non-fatal):', e && e.message);
  }
}

// ── Low-level helpers ─────────────────────────────────────────────────────────

function _toObj(row, columns) {
  if (!row) return null;
  const obj = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

async function run(sql, params = []) {
  await _client.execute({ sql, args: params });
}

async function get(sql, params = []) {
  const result = await _client.execute({ sql, args: params });
  return result.rows[0] ? _toObj(result.rows[0], result.columns) : null;
}

async function all(sql, params = []) {
  const result = await _client.execute({ sql, args: params });
  return result.rows.map(row => _toObj(row, result.columns));
}

// ── Users ─────────────────────────────────────────────────────────────────────

async function createUser({ id, name, email, hashedPassword }) {
  await run(
    `INSERT INTO users (id, name, email, hashed_password, pro, email_verified) VALUES (?, ?, ?, ?, 0, 0)`,
    [id, name, email.toLowerCase().trim(), hashedPassword]
  );
}

// Dev-only: force a single account to read as Pro + verified on localhost, so
// the paywall/verification gate still work for everyone else. Never active
// when NODE_ENV === 'production'.
function _applyDevProOverride(user) {
  const devEmail = process.env.DEV_PRO_EMAIL;
  if (user && devEmail && process.env.NODE_ENV !== 'production' &&
      user.email === devEmail.toLowerCase().trim()) {
    user.pro = 1;
    user.email_verified = 1;
  }
  return user;
}

async function getUserByEmail(email) {
  const user = await get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
  return _applyDevProOverride(user);
}

async function getUserById(id) {
  const user = await get('SELECT * FROM users WHERE id = ?', [id]);
  return _applyDevProOverride(user);
}

async function getUserByGoogleId(googleId) {
  const user = await get('SELECT * FROM users WHERE google_id = ?', [googleId]);
  return _applyDevProOverride(user);
}

async function createUserGoogle({ id, name, email, googleId }) {
  await run(
    `INSERT INTO users (id, name, email, hashed_password, pro, google_id) VALUES (?, ?, ?, '', 0, ?)`,
    [id, name, email.toLowerCase().trim(), googleId]
  );
}

async function linkGoogleId(userId, googleId) {
  await run('UPDATE users SET google_id = ? WHERE id = ?', [googleId, userId]);
}

async function setUserPro(userId) {
  await run('UPDATE users SET pro = 1 WHERE id = ?', [userId]);
}

async function updatePassword(userId, hashedPassword) {
  await run('UPDATE users SET hashed_password = ? WHERE id = ?', [hashedPassword, userId]);
}

async function bumpTokenVersion(userId) {
  await run('UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?', [userId]);
}

async function getAllUsers() {
  return all('SELECT id, name, email, pro, created_at FROM users ORDER BY created_at DESC');
}

// ── Profiles ──────────────────────────────────────────────────────────────────

async function saveProfile(userId, profileObj) {
  await run(
    `INSERT INTO profiles (user_id, data, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    [userId, JSON.stringify(profileObj)]
  );
}

async function getProfile(userId) {
  const row = await get('SELECT data FROM profiles WHERE user_id = ?', [userId]);
  if (!row) return null;
  try { return JSON.parse(row.data); } catch(e) { return null; }
}

// ── Plans ─────────────────────────────────────────────────────────────────────

async function savePlan(id, userId, planObj) {
  await run(
    `INSERT INTO plans (id, user_id, data) VALUES (?, ?, ?)`,
    [id, userId, JSON.stringify(planObj)]
  );
}

/** Most recent plan's created_at for a user, or null if they have none yet.
 * Used to detect week-over-week return (see server.js maybeLogWeekReturn). */
async function getLastPlanCreatedAt(userId) {
  return get('SELECT created_at FROM plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId]);
}

async function getRecentPlans(userId, limit = 10) {
  const rows = await all(
    'SELECT data FROM plans WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit]
  );
  return rows.map(r => { try { return JSON.parse(r.data); } catch(e) { return null; } }).filter(Boolean);
}

/** Looks up one plan by id, scoped to userId so a plan_id can never be used
 * to read another user's plan. Used to recover a plan blocked-generation
 * responses already know the id of (see server.js's trial_generations check). */
async function getPlanById(id, userId) {
  const row = await get('SELECT data FROM plans WHERE id = ? AND user_id = ?', [id, userId]);
  if (!row) return null;
  try { return JSON.parse(row.data); } catch(e) { return null; }
}

// ── Reset Tokens ──────────────────────────────────────────────────────────────

async function createResetToken(token, userId, expiresAt) {
  await run(
    `INSERT INTO reset_tokens (token, user_id, expires_at, used) VALUES (?, ?, ?, 0)`,
    [token, userId, expiresAt]
  );
}

async function getResetToken(token) {
  return get('SELECT * FROM reset_tokens WHERE token = ? AND used = 0', [token]);
}

async function markResetTokenUsed(token) {
  await run('UPDATE reset_tokens SET used = 1 WHERE token = ?', [token]);
}

async function purgeExpiredTokens() {
  await run(`DELETE FROM reset_tokens WHERE expires_at < datetime('now') OR used = 1`);
}

// ── Verification Tokens ─────────────────────────────────────────────────────

async function createVerificationToken(token, userId, expiresAt) {
  await run(
    `INSERT INTO verification_tokens (token, user_id, expires_at, used) VALUES (?, ?, ?, 0)`,
    [token, userId, expiresAt]
  );
}

async function getVerificationToken(token) {
  return get('SELECT * FROM verification_tokens WHERE token = ? AND used = 0', [token]);
}

async function markVerificationTokenUsed(token) {
  await run('UPDATE verification_tokens SET used = 1 WHERE token = ?', [token]);
}

async function markEmailVerified(userId) {
  await run('UPDATE users SET email_verified = 1 WHERE id = ?', [userId]);
}

async function purgeExpiredVerificationTokens() {
  await run(`DELETE FROM verification_tokens WHERE expires_at < datetime('now') OR used = 1`);
}

// ── Leads ─────────────────────────────────────────────────────────────────────

async function saveLead(id, email, source, name) {
  await run(
    `INSERT INTO leads (id, email, source, name) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    [id, email.toLowerCase().trim(), source || 'unknown', name || '']
  );
}

async function countLeads() {
  const row = await get('SELECT COUNT(*) AS n FROM leads');
  return row ? row.n : 0;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

async function logEvent(event, data, ipTail) {
  try {
    await _client.execute({
      sql:  'INSERT INTO analytics (event, data, ip_tail) VALUES (?, ?, ?)',
      args: [event, JSON.stringify(data || {}), ipTail || ''],
    });
  } catch(e) { /* non-fatal */ }
}

async function getAnalytics() {
  const rows = await all('SELECT event, data, ip_tail, created_at FROM analytics ORDER BY created_at DESC LIMIT 5000');
  return rows.map(r => ({
    event:   r.event,
    data:    (() => { try { return JSON.parse(r.data); } catch(e) { return {}; } })(),
    ip_tail: r.ip_tail,
    ts:      r.created_at,
  }));
}

// ── Webhook idempotency ───────────────────────────────────────────────────────

async function isWebhookEventProcessed(eventId) {
  const row = await get('SELECT event_id FROM processed_webhook_events WHERE event_id = ?', [eventId]);
  return !!row;
}

async function markWebhookEventProcessed(eventId) {
  await run(
    'INSERT OR IGNORE INTO processed_webhook_events (event_id) VALUES (?)',
    [eventId]
  );
}

// ── Family Profiles ───────────────────────────────────────────────────────────

async function getFamilyProfiles(userId) {
  const rows = await all(
    'SELECT id, name, data, created_at FROM family_profiles WHERE user_id = ? ORDER BY created_at ASC',
    [userId]
  );
  return rows.map(r => ({
    id:        r.id,
    name:      r.name,
    createdAt: r.created_at,
    ...(() => { try { return JSON.parse(r.data); } catch(e) { return {}; } })(),
  }));
}

async function saveFamilyProfile(id, userId, name, dataObj) {
  await run(
    `INSERT INTO family_profiles (id, user_id, name, data)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data`,
    [id, userId, name, JSON.stringify(dataObj || {})]
  );
}

async function deleteFamilyProfile(id, userId) {
  await run('DELETE FROM family_profiles WHERE id = ? AND user_id = ?', [id, userId]);
}

async function countFamilyProfiles(userId) {
  const row = await get('SELECT COUNT(*) AS n FROM family_profiles WHERE user_id = ?', [userId]);
  return row ? row.n : 0;
}

// ── Referrals ─────────────────────────────────────────────────────────────────

async function saveReferral(id, referrerEmail, referredIp, referredEmail) {
  await run(
    `INSERT INTO referrals (id, referrer_email, referred_ip, referred_email, converted)
     VALUES (?, ?, ?, ?, 0) ON CONFLICT DO NOTHING`,
    [id, referrerEmail.toLowerCase().trim(), referredIp || '', (referredEmail || '').toLowerCase().trim()]
  );
}

async function markReferralConverted(referrerEmail, referredEmail) {
  await run(
    `UPDATE referrals SET converted = 1 WHERE referrer_email = ? AND referred_email = ? AND converted = 0`,
    [referrerEmail.toLowerCase().trim(), (referredEmail || '').toLowerCase().trim()]
  );
}

async function getReferralCount(referrerEmail) {
  const row = await get(
    'SELECT COUNT(*) AS n FROM referrals WHERE referrer_email = ?',
    [referrerEmail.toLowerCase().trim()]
  );
  return row ? row.n : 0;
}

async function addBonusPlan(email) {
  await run(
    `UPDATE users SET bonus_plans = COALESCE(bonus_plans, 0) + 1 WHERE email = ?`,
    [email.toLowerCase().trim()]
  );
}

async function getUserBonusPlans(userId) {
  const row = await get('SELECT bonus_plans FROM users WHERE id = ?', [userId]);
  return row ? (row.bonus_plans || 0) : 0;
}

// ── Ref codes ─────────────────────────────────────────────────────────────────

async function setUserRefCode(userId, refCode) {
  await run('UPDATE users SET ref_code = ? WHERE id = ?', [refCode, userId]);
}

async function getUserByRefCode(refCode) {
  return get('SELECT * FROM users WHERE ref_code = ?', [refCode]);
}

async function setUserProUntil(userId, untilDate) {
  await run('UPDATE users SET pro = 1, pro_until = ? WHERE id = ?', [untilDate, userId]);
}

async function setStripeCustomerId(userId, customerId) {
  await run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customerId, userId]);
}

async function removeUserPro(userId) {
  await run('UPDATE users SET pro = 0, pro_until = NULL WHERE id = ?', [userId]);
}

async function deleteUserAccount(userId, email) {
  const lowerEmail = (email || '').toLowerCase().trim();
  await _client.batch([
    { sql: 'DELETE FROM profiles WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM plans WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM grocery_lists WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM recipes WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM favorites WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM family_profiles WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM share_links WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM coach_usage WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM free_week_entitlement WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM reset_tokens WHERE user_id = ?', args: [userId] },
    { sql: 'DELETE FROM leads WHERE email = ?', args: [lowerEmail] },
    { sql: 'DELETE FROM email_queue WHERE to_email = ?', args: [lowerEmail] },
    { sql: 'DELETE FROM referrals WHERE referrer_email = ? OR referred_email = ?', args: [lowerEmail, lowerEmail] },
    { sql: "DELETE FROM analytics WHERE data LIKE '%' || ? || '%'", args: [lowerEmail] },
    { sql: 'DELETE FROM users WHERE id = ?', args: [userId] },
  ], 'write');
}

async function getUsersNeedingNudge() {
  return all(`
    SELECT id, name, email FROM users
    WHERE pro = 0
      AND nudge_sent = 0
      AND signup_date IS NOT NULL
      AND datetime(signup_date) <= datetime('now', '-3 days')
      AND email_verified = 1
    LIMIT 100
  `);
}

async function markNudgeSent(userId) {
  await run('UPDATE users SET nudge_sent = 1 WHERE id = ?', [userId]);
}

async function getUsersForWeeklyDigest() {
  return all(`
    SELECT id, name, email, pro FROM users
    WHERE email IS NOT NULL AND email != ''
      AND pro = 0
      AND email_verified = 1
    LIMIT 500
  `);
}

// ── Recipes ───────────────────────────────────────────────────────────────────

async function saveRecipe(id, userId, recipeObj) {
  await run(
    `INSERT INTO recipes (id, user_id, data) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    [id, userId, JSON.stringify(recipeObj)]
  );
}

async function getRecipes(userId) {
  const rows = await all(
    'SELECT id, data, created_at FROM recipes WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return rows.map(r => ({
    id:        r.id,
    createdAt: r.created_at,
    ...(() => { try { return JSON.parse(r.data); } catch(e) { return {}; } })(),
  }));
}

// ── Favorites ─────────────────────────────────────────────────────────────────

async function saveFavorite(id, userId, mealKey, mealObj) {
  await run(
    `INSERT INTO favorites (id, user_id, meal_key, data) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, meal_key) DO UPDATE SET data = excluded.data`,
    [id, userId, mealKey, JSON.stringify(mealObj)]
  );
}

async function getFavorites(userId) {
  const rows = await all(
    'SELECT id, meal_key, data, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return rows.map(r => ({
    id:        r.id,
    mealKey:   r.meal_key,
    createdAt: r.created_at,
    ...(() => { try { return JSON.parse(r.data); } catch(e) { return {}; } })(),
  }));
}

async function deleteFavorite(userId, mealKey) {
  await run('DELETE FROM favorites WHERE user_id = ? AND meal_key = ?', [userId, mealKey]);
}

// ── Share links ───────────────────────────────────────────────────────────────

async function saveShareLink(shareId, planId, userId, planData) {
  await run(
    `INSERT INTO share_links (share_id, plan_id, user_id, data)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(share_id) DO UPDATE SET data = excluded.data`,
    [shareId, planId, userId, JSON.stringify(planData)]
  );
}

async function getShareLink(shareId) {
  const row = await get('SELECT * FROM share_links WHERE share_id = ?', [shareId]);
  if (!row) return null;
  try { row.plan = JSON.parse(row.data); return row; } catch(e) { return null; }
}

async function incrementShareViews(shareId) {
  try { await _client.execute({ sql: 'UPDATE share_links SET views = views + 1 WHERE share_id = ?', args: [shareId] }); } catch(e) {}
}

// ── Analytics funnel ──────────────────────────────────────────────────────────

async function getFunnelStats() {
  const users    = await all('SELECT id, pro, created_at FROM users');
  const now      = new Date();
  const weekAgo  = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const total    = users.length;
  const proUsers = users.filter(u => u.pro === 1).length;
  const thisWeek = users.filter(u => u.created_at >= weekAgo).length;

  const plansRow  = await get(`SELECT COUNT(*) AS n FROM analytics WHERE event = 'generate_plan'`);
  const plans     = plansRow ? plansRow.n : 0;

  const refRows   = await all(`
    SELECT referrer_email, COUNT(*) AS n FROM referrals
    WHERE converted = 1
    GROUP BY referrer_email
    ORDER BY n DESC
    LIMIT 5
  `);

  const signupRow    = await get(`SELECT COUNT(*) AS n FROM analytics WHERE event = 'signup' AND created_at >= ?`, [monthAgo]);
  const monthSignups = signupRow ? signupRow.n : 0;

  const limitRow  = await get(`SELECT COUNT(*) AS n FROM analytics WHERE event = 'free_limit_hit' AND created_at >= ?`, [monthAgo]);
  const limitHits = limitRow ? limitRow.n : 0;

  const upgradeRow    = await get(`SELECT COUNT(*) AS n FROM analytics WHERE event = 'upgrade_click' AND created_at >= ?`, [monthAgo]);
  const upgradeClicks = upgradeRow ? upgradeRow.n : 0;

  const convRate     = total > 0 ? ((proUsers / total) * 100).toFixed(1) + '%' : '0%';
  const plansPerUser = total > 0 ? (plans / total).toFixed(1) : '0';

  return {
    total_users:      total,
    pro_users:        proUsers,
    free_users:       total - proUsers,
    users_this_week:  thisWeek,
    conversion_rate:  convRate,
    plans_generated:  plans,
    plans_per_user_avg: plansPerUser,
    this_month: {
      signups:        monthSignups,
      free_limit_hits: limitHits,
      upgrade_clicks: upgradeClicks,
    },
    mrr_estimate:  `$${(proUsers * 8).toLocaleString()}/month`,
    top_referrers: refRows.map(r => ({ email: r.referrer_email, conversions: r.n })),
  };
}

// ── Coach usage ───────────────────────────────────────────────────────────────

async function getCoachUsage(userId) {
  const today = new Date().toISOString().split('T')[0];
  const row = await get('SELECT count FROM coach_usage WHERE user_id = ? AND date = ?', [userId, today]);
  return row ? Number(row.count) : 0;
}

async function incrementCoachUsage(userId) {
  const today = new Date().toISOString().split('T')[0];
  await run(
    `INSERT INTO coach_usage (user_id, date, count) VALUES (?, ?, 1)
     ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1`,
    [userId, today]
  );
}

// ── Daily API spend ───────────────────────────────────────────────────────────

async function getDailySpend() {
  const today = new Date().toISOString().split('T')[0];
  const row = await get('SELECT cost_usd FROM daily_api_spend WHERE date = ?', [today]);
  return row ? Number(row.cost_usd) : 0;
}

async function addDailySpend(costUsd) {
  const today = new Date().toISOString().split('T')[0];
  await run(
    `INSERT INTO daily_api_spend (date, cost_usd) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET cost_usd = cost_usd + excluded.cost_usd`,
    [today, costUsd]
  );
}

// ── Plan generation quotas ──────────────────────────────────────────────────────

async function getPlanGenerationCount(userId, month) {
  const row = await get('SELECT count FROM plan_generations WHERE user_id = ? AND month = ?', [userId, month]);
  return row ? Number(row.count) : 0;
}

async function incrementPlanGeneration(userId, month) {
  await run(
    `INSERT INTO plan_generations (id, user_id, month, count, updated_at) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, month) DO UPDATE SET count = count + 1, updated_at = CURRENT_TIMESTAMP`,
    [randomUUID(), userId, month]
  );
}

// ── Free-tier 30-day daily trial ────────────────────────────────────────────────

/** Sets trial_started_at only if it isn't already set — idempotent so a race
 * between two near-simultaneous first requests can't push the start later. */
async function setTrialStart(userId, isoTimestamp) {
  await run(
    `UPDATE users SET trial_started_at = ? WHERE id = ? AND trial_started_at IS NULL`,
    [isoTimestamp, userId]
  );
}

async function getTrialGenerationByDate(userId, localDate) {
  return get(
    'SELECT user_id, local_date, plan_id, created_at FROM trial_generations WHERE user_id = ? AND local_date = ?',
    [userId, localDate]
  );
}

async function recordTrialGeneration(userId, localDate, planId) {
  await run(
    `INSERT INTO trial_generations (user_id, local_date, plan_id) VALUES (?, ?, ?)`,
    [userId, localDate, planId]
  );
}

async function getTrialPlanIdsForUser(userId) {
  const rows = await all(
    'SELECT plan_id, local_date FROM trial_generations WHERE user_id = ? ORDER BY local_date ASC',
    [userId]
  );
  return rows.map(r => ({ planId: r.plan_id, localDate: r.local_date }));
}

/** Most recent trial generation for a user — used to gate the post-30-day
 * weekly free plan (one every 7 days, forever). */
async function getLastTrialGeneration(userId) {
  return get(
    'SELECT user_id, local_date, plan_id, created_at FROM trial_generations WHERE user_id = ? ORDER BY local_date DESC LIMIT 1',
    [userId]
  );
}

// ── Grocery lists ─────────────────────────────────────────────────────────────

async function saveGroceryList(id, userId, planId, day, groceryListObj) {
  await run(
    `INSERT INTO grocery_lists (id, user_id, plan_id, day, data) VALUES (?, ?, ?, ?, ?)`,
    [id, userId, planId, day, JSON.stringify(groceryListObj)]
  );
}

async function getGroceryListsForPlan(planId) {
  const rows = await all(
    'SELECT id, user_id, day, data, created_at FROM grocery_lists WHERE plan_id = ? ORDER BY created_at ASC',
    [planId]
  );
  return rows.map(r => ({
    id:        r.id,
    userId:    r.user_id,
    day:       r.day,
    createdAt: r.created_at,
    ...(() => { try { return JSON.parse(r.data); } catch(e) { return {}; } })(),
  }));
}

async function deleteGroceryListForPlanDay(planId, day, userId) {
  await run(
    'DELETE FROM grocery_lists WHERE plan_id = ? AND day = ? AND user_id = ?',
    [planId, day, userId]
  );
}

/** Applies a partial update (checked, actualCost) to one item inside a stored
 * grocery list's JSON blob, keyed by (plan_id, day, user_id) since that's the
 * row grocery_lists is scoped to. Returns the updated item, or null if the
 * list row or the item id isn't found. */
async function updateGroceryItem(planId, day, userId, itemId, updates) {
  const row = await get(
    'SELECT id, data FROM grocery_lists WHERE plan_id = ? AND day = ? AND user_id = ?',
    [planId, day, userId]
  );
  if (!row) return null;

  let parsed;
  try { parsed = JSON.parse(row.data); } catch(e) { return null; }

  let item = null;
  for (const items of Object.values(parsed.categories || {})) {
    item = (items || []).find(i => i.id === itemId);
    if (item) break;
  }
  if (!item) return null;

  Object.assign(item, updates);
  await run('UPDATE grocery_lists SET data = ? WHERE id = ?', [JSON.stringify(parsed), row.id]);
  return item;
}

/** Aggregates grocery lists across every day the user has generated so far in
 * their trial (each daily generation gets its own plan_id, unlike week-mode
 * where 7 days share one plan_id) — reuses the same per-row shape as
 * getGroceryListsForPlan so callers can treat it the same way. */
async function getGroceryListsForUserTrial(userId) {
  const planRows = await getTrialPlanIdsForUser(userId);
  if (planRows.length === 0) return [];
  const planIds = planRows.map(r => r.planId);
  const placeholders = planIds.map(() => '?').join(', ');
  const rows = await all(
    `SELECT id, user_id, plan_id, day, data, created_at FROM grocery_lists WHERE plan_id IN (${placeholders}) ORDER BY created_at ASC`,
    planIds
  );
  return rows.map(r => ({
    id:        r.id,
    userId:    r.user_id,
    planId:    r.plan_id,
    day:       r.day,
    createdAt: r.created_at,
    ...(() => { try { return JSON.parse(r.data); } catch(e) { return {}; } })(),
  }));
}

async function getGroceryListByDay(planId, day) {
  const row = await get(
    'SELECT id, user_id, day, data, created_at FROM grocery_lists WHERE plan_id = ? AND day = ?',
    [planId, day]
  );
  if (!row) return null;
  let parsed = {};
  try { parsed = JSON.parse(row.data); } catch(e) {}
  return {
    id:        row.id,
    userId:    row.user_id,
    day:       row.day,
    createdAt: row.created_at,
    ...parsed,
  };
}

// ── Ingredient prices ─────────────────────────────────────────────────────────

let _ingredientPricesCache = null;
let _ingredientPricesCacheAt = 0;
const INGREDIENT_PRICES_CACHE_MS = 5 * 60 * 1000;

async function getIngredientPrices() {
  const now = Date.now();
  if (_ingredientPricesCache && (now - _ingredientPricesCacheAt) < INGREDIENT_PRICES_CACHE_MS) {
    return _ingredientPricesCache;
  }
  const rows = await all('SELECT name, category, price_per_unit, unit FROM ingredient_prices');
  _ingredientPricesCache = rows;
  _ingredientPricesCacheAt = now;
  return rows;
}

/** Idempotent insert-or-update by `name` (the table's UNIQUE key) — used by
 * scripts/applyIngredientPrices.js to apply ingredientPriceData.js (the
 * canonical, version-controlled dataset of documented price estimates) to
 * the live table. Never called
 * from a user-facing route. Invalidates the in-memory price cache so the
 * next getIngredientPrices() call picks up the change immediately rather
 * than waiting out INGREDIENT_PRICES_CACHE_MS. */
async function upsertIngredientPrice({ name, category, unit, price_per_unit }) {
  await run(
    `INSERT INTO ingredient_prices (id, name, category, unit, price_per_unit)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET category = excluded.category, unit = excluded.unit, price_per_unit = excluded.price_per_unit`,
    [randomUUID(), name, category, unit, price_per_unit]
  );
  _ingredientPricesCache = null;
}

// ── Meal feedback ─────────────────────────────────────────────────────────────

async function saveMealFeedback({ userId, mealName, action, reason }) {
  await run(
    `INSERT INTO meal_feedback (id, user_id, meal_name, action, reason) VALUES (?, ?, ?, ?, ?)`,
    [randomUUID(), userId, mealName, action, reason || null]
  );
}

async function getUserDislikedMeals(userId) {
  const rows = await all(
    `SELECT DISTINCT meal_name FROM meal_feedback WHERE user_id = ? AND action IN ('dislike', 'swap')`,
    [userId]
  );
  return rows.map(r => r.meal_name);
}

// ── Mealzy Mobile M4E — free-week entitlement ─────────────────────────────────
//
// A narrowly-scoped write helper that surfaces rowsAffected from the underlying
// libSQL execute result. The module-level run() contract (returns undefined) is
// deliberately left untouched; only this family of helpers needs atomic
// rows-affected visibility to make reserve/promote/release/reclaim races safe.
async function _writeAffected(sql, args = []) {
  const r = await _client.execute({ sql, args });
  return Number(r.rowsAffected || 0);
}

const FREE_WEEK_WEEKSTART_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Atomically reserve the free week for a user. INSERT keyed by user_id — a
 * pre-existing row (reserved OR consumed) makes this a no-op. Returns
 * { reserved: true } only for the request that actually created the row. */
async function reserveFreeWeek(userId, requestId, weekStart) {
  const n = await _writeAffected(
    `INSERT INTO free_week_entitlement (user_id, status, request_id, week_start, reserved_at)
     VALUES (?, 'reserved', ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO NOTHING`,
    [userId, requestId, weekStart || null]
  );
  return { reserved: n > 0 };
}

async function getFreeWeekEntitlement(userId) {
  return get(
    `SELECT user_id, status, request_id, week_start, plan_id, reserved_at, consumed_at
       FROM free_week_entitlement WHERE user_id = ?`,
    [userId]
  );
}

/** reserved -> consumed. Requires matching user_id AND request_id AND
 * status='reserved' — a different request can never promote this reservation. */
async function promoteFreeWeek(userId, requestId, planId, weekStart) {
  const n = await _writeAffected(
    `UPDATE free_week_entitlement
        SET status = 'consumed', plan_id = ?, week_start = ?, consumed_at = datetime('now')
      WHERE user_id = ? AND request_id = ? AND status = 'reserved'`,
    [planId || null, weekStart || null, userId, requestId]
  );
  return { promoted: n > 0 };
}

/** Deletes ONLY a reservation owned by this exact request. Never touches a
 * consumed row, never touches another request's reservation. */
async function releaseFreeWeekReservation(userId, requestId) {
  const n = await _writeAffected(
    `DELETE FROM free_week_entitlement
      WHERE user_id = ? AND request_id = ? AND status = 'reserved'`,
    [userId, requestId]
  );
  return { released: n > 0 };
}

/** Take ownership of a stale reservation (status='reserved' AND older than the
 * exact 15-minute cutoff). `cutoffMs` is a JS epoch-ms instant; the row's
 * reserved_at is compared against it in UTC. Exactly one concurrent caller can
 * win — the UPDATE's WHERE clause stops matching once request_id/reserved_at
 * are rewritten. Returns { reclaimed: true } for the winner only. */
async function reclaimStaleFreeWeekReservation(userId, requestId, weekStart, cutoffMs) {
  const cutoffEpochSec = Math.floor(Number(cutoffMs) / 1000);
  const n = await _writeAffected(
    `UPDATE free_week_entitlement
        SET request_id = ?, week_start = ?, reserved_at = datetime('now')
      WHERE user_id = ? AND status = 'reserved'
        AND reserved_at <= datetime(?, 'unixepoch')`,
    [requestId, weekStart || null, userId, cutoffEpochSec]
  );
  return { reclaimed: n > 0 };
}

/** THE atomicity primitive (M4E task 11). Persists the weekly plan AND promotes
 * the reservation to consumed in ONE libSQL write transaction
 * (`_client.batch([...], 'write')` — statements applied all-or-nothing; a
 * failing statement rejects the promise AND rolls the transaction back, so no
 * partial state ever commits).
 *
 * Both statements share the identical ownership predicate
 * (user_id = ? AND request_id = ? AND status = 'reserved'), so after a
 * successful commit the only reachable rowsAffected pairs are (1,1) and (0,0):
 *   - (1,1) -> { outcome: 'committed' }  — this request owned the reservation,
 *              the plan is persisted and the entitlement is consumed
 *   - (0,0) -> { outcome: 'ownership_lost' } — the reservation is no longer
 *              owned by this request (e.g. a stale-reclaim by another request);
 *              nothing was persisted, nothing was promoted. This is NOT a
 *              persistence failure.
 * A mixed (1,0) / (0,1) pair is impossible given the shared predicate + single
 * transaction; if it is ever observed it is a hard invariant violation and this
 * throws (the caller fails the request closed — it never invents recovery). */
async function promoteFreeWeekWithPlan({ userId, requestId, planId, weekStart, planObj }) {
  const guard = `EXISTS (SELECT 1 FROM free_week_entitlement
                           WHERE user_id = ? AND request_id = ? AND status = 'reserved')`;
  const res = await _client.batch([
    {
      sql: `INSERT INTO plans (id, user_id, data)
            SELECT ?, ?, ? WHERE ${guard}`,
      args: [planId, userId, JSON.stringify(planObj), userId, requestId],
    },
    {
      sql: `UPDATE free_week_entitlement
               SET status = 'consumed', plan_id = ?, week_start = ?, consumed_at = datetime('now')
             WHERE user_id = ? AND request_id = ? AND status = 'reserved'`,
      args: [planId, weekStart || null, userId, requestId],
    },
  ], 'write');

  // rowsAffected is the ONLY reliable per-statement signal here. lastInsertRowid
  // is not — libSQL reports the previous rowid for a zero-row INSERT ... SELECT.
  const insertAffected = Number(res[0] && res[0].rowsAffected || 0);
  const updateAffected = Number(res[1] && res[1].rowsAffected || 0);

  if (insertAffected === 1 && updateAffected === 1) return { outcome: 'committed' };
  if (insertAffected === 0 && updateAffected === 0) return { outcome: 'ownership_lost' };

  const err = new Error('free_week_atomic_invariant_violation');
  err.code = 'FREE_WEEK_ATOMIC_INVARIANT';
  err.detail = { insertAffected, updateAffected };
  throw err;
}

/** Idempotent historical classification. Parses each plan's data as JSON and
 * inserts a 'consumed' entitlement row for every user whose history contains a
 * genuine weekly plan (parsed object, weekStart matching YYYY-MM-DD, days is an
 * array). Single-day blobs, malformed JSON and ambiguous strings never qualify.
 * Never overwrites an existing entitlement row. */
async function backfillFreeWeekEntitlements() {
  const rows = await all(
    `SELECT p.user_id AS user_id, p.id AS plan_id, p.data AS data
       FROM plans p
      WHERE NOT EXISTS (
        SELECT 1 FROM free_week_entitlement f WHERE f.user_id = p.user_id
      )
      ORDER BY p.created_at ASC`
  );

  let inserted = 0;
  const done = new Set();
  for (const r of rows) {
    if (done.has(r.user_id)) continue;

    let parsed;
    try { parsed = JSON.parse(r.data); } catch (e) { continue; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    if (typeof parsed.weekStart !== 'string' || !FREE_WEEK_WEEKSTART_RE.test(parsed.weekStart)) continue;
    if (!Array.isArray(parsed.days)) continue;

    done.add(r.user_id);
    const n = await _writeAffected(
      `INSERT INTO free_week_entitlement
         (user_id, status, request_id, week_start, plan_id, reserved_at, consumed_at)
       VALUES (?, 'consumed', 'backfill', ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(user_id) DO NOTHING`,
      [r.user_id, parsed.weekStart, r.plan_id]
    );
    inserted += n;
  }
  return { inserted };
}

// ── Health ────────────────────────────────────────────────────────────────────

async function ping() {
  const row = await get('SELECT 1 AS ok');
  return !!(row && row.ok === 1);
}

module.exports = {
  initDb,
  get:  (sql, params) => get(sql, params || []),
  all:  (sql, params) => all(sql, params || []),
  run:  (sql, params) => run(sql, params || []),
  // users
  createUser, getUserByEmail, getUserById, getUserByGoogleId, createUserGoogle, linkGoogleId,
  setUserPro, updatePassword, getAllUsers, bumpTokenVersion,
  removeUserPro, setStripeCustomerId, setUserProUntil, deleteUserAccount,
  // ref codes
  setUserRefCode, getUserByRefCode,
  // nurture
  getUsersNeedingNudge, markNudgeSent, getUsersForWeeklyDigest,
  // profiles
  saveProfile, getProfile,
  // plans
  savePlan, getRecentPlans, getLastPlanCreatedAt, getPlanById,
  // share links
  saveShareLink, getShareLink, incrementShareViews,
  // reset tokens
  createResetToken, getResetToken, markResetTokenUsed, purgeExpiredTokens,
  // verification tokens
  createVerificationToken, getVerificationToken, markVerificationTokenUsed, markEmailVerified, purgeExpiredVerificationTokens,
  // leads
  saveLead, countLeads,
  // analytics
  logEvent, getAnalytics, getFunnelStats,
  // family profiles
  getFamilyProfiles, saveFamilyProfile, deleteFamilyProfile, countFamilyProfiles,
  // referrals
  saveReferral, markReferralConverted, getReferralCount, addBonusPlan, getUserBonusPlans,
  // recipes
  saveRecipe, getRecipes,
  // favorites
  saveFavorite, getFavorites, deleteFavorite,
  // coach usage
  getCoachUsage, incrementCoachUsage,
  // plan generation quotas
  getPlanGenerationCount, incrementPlanGeneration,
  // free-tier 30-day daily trial
  setTrialStart, getTrialGenerationByDate, recordTrialGeneration, getTrialPlanIdsForUser, getLastTrialGeneration,
  // free-week entitlement (M4E)
  reserveFreeWeek, getFreeWeekEntitlement, promoteFreeWeek, releaseFreeWeekReservation,
  reclaimStaleFreeWeekReservation, promoteFreeWeekWithPlan, backfillFreeWeekEntitlements,
  // daily API spend
  getDailySpend, addDailySpend,
  // ingredient prices
  getIngredientPrices,
  upsertIngredientPrice,
  // meal feedback
  saveMealFeedback, getUserDislikedMeals,
  // grocery lists
  saveGroceryList, getGroceryListsForPlan, getGroceryListsForUserTrial, getGroceryListByDay, deleteGroceryListForPlanDay, updateGroceryItem,
  // health
  ping,
  // webhook idempotency
  isWebhookEventProcessed, markWebhookEventProcessed,
};
