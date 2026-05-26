'use strict';

const { createClient } = require('@libsql/client');

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
  ];
  for (const sql of alters) {
    try { await _client.execute(sql); } catch(e) { /* column already exists */ }
  }

  try {
    await _client.execute(`UPDATE users SET signup_date = created_at WHERE signup_date IS NULL`);
  } catch(e) {}
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
    `INSERT INTO users (id, name, email, hashed_password, pro) VALUES (?, ?, ?, ?, 0)`,
    [id, name, email.toLowerCase().trim(), hashedPassword]
  );
}

async function getUserByEmail(email) {
  return get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
}

async function getUserById(id) {
  return get('SELECT * FROM users WHERE id = ?', [id]);
}

async function getUserByGoogleId(googleId) {
  return get('SELECT * FROM users WHERE google_id = ?', [googleId]);
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

async function getRecentPlans(userId, limit = 10) {
  const rows = await all(
    'SELECT data FROM plans WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit]
  );
  return rows.map(r => { try { return JSON.parse(r.data); } catch(e) { return null; } }).filter(Boolean);
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

async function getUsersNeedingNudge() {
  return all(`
    SELECT id, name, email FROM users
    WHERE pro = 0
      AND nudge_sent = 0
      AND signup_date IS NOT NULL
      AND datetime(signup_date) <= datetime('now', '-3 days')
    LIMIT 100
  `);
}

async function markNudgeSent(userId) {
  await run('UPDATE users SET nudge_sent = 1 WHERE id = ?', [userId]);
}

async function getUsersForWeeklyDigest() {
  return all(`
    SELECT id, name, email FROM users
    WHERE pro = 0 AND email IS NOT NULL AND email != ''
    LIMIT 500
  `);
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
  setUserPro, updatePassword, getAllUsers,
  removeUserPro, setStripeCustomerId, setUserProUntil,
  // ref codes
  setUserRefCode, getUserByRefCode,
  // nurture
  getUsersNeedingNudge, markNudgeSent, getUsersForWeeklyDigest,
  // profiles
  saveProfile, getProfile,
  // plans
  savePlan, getRecentPlans,
  // share links
  saveShareLink, getShareLink, incrementShareViews,
  // reset tokens
  createResetToken, getResetToken, markResetTokenUsed, purgeExpiredTokens,
  // leads
  saveLead, countLeads,
  // analytics
  logEvent, getAnalytics, getFunnelStats,
  // family profiles
  getFamilyProfiles, saveFamilyProfile, deleteFamilyProfile, countFamilyProfiles,
  // referrals
  saveReferral, markReferralConverted, getReferralCount, addBonusPlan, getUserBonusPlans,
  // health
  ping,
};
