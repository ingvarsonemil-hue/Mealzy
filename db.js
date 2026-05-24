/**
 * db.js — SQLite persistence layer for Mealzy
 *
 * Uses sql.js (pure JavaScript / WASM) so it compiles everywhere without
 * Python or node-gyp. The database is a single file: mealzy.db
 *
 * RENDER DISK NOTE:
 * Render's free tier wipes the filesystem on every deploy/restart.
 * To make mealzy.db survive deploys, add a persistent disk in the Render
 * dashboard:
 *   Service → Disks → Add Disk
 *   Mount path: /opt/render/project/src
 *   Size: 1 GB
 * That's it — the db file at /opt/render/project/src/mealzy.db persists
 * across all deploys and restarts at $1/month.
 */

'use strict';

const initSqlJs = require('sql.js');
const fs        = require('fs');
const path      = require('path');

const DB_PATH = path.join(__dirname, 'mealzy.db');

let _db   = null;  // sql.js Database instance
let _dirty = false; // true when in-memory state differs from disk

// ── Init ──────────────────────────────────────────────────────────────────────

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }

  _applySchema();
  _saveDb(); // write initial file so it exists on disk
  console.log(`[db] SQLite ready — ${DB_PATH}`);
}

function _applySchema() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      email        TEXT UNIQUE NOT NULL,
      hashed_password TEXT NOT NULL,
      pro          INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profiles (
      user_id      TEXT PRIMARY KEY,
      data         TEXT NOT NULL,
      updated_at   TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS plans (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      data         TEXT NOT NULL,
      created_at   TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reset_tokens (
      token        TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      expires_at   TEXT NOT NULL,
      used         INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS leads (
      id           TEXT PRIMARY KEY,
      email        TEXT NOT NULL,
      source       TEXT,
      name         TEXT,
      created_at   TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      event        TEXT NOT NULL,
      data         TEXT,
      ip_tail      TEXT,
      created_at   TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS family_profiles (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      data         TEXT NOT NULL,
      created_at   TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id             TEXT PRIMARY KEY,
      referrer_email TEXT NOT NULL,
      referred_ip    TEXT,
      referred_email TEXT,
      converted      INTEGER DEFAULT 0,
      created_at     TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS share_links (
      share_id   TEXT PRIMARY KEY,
      plan_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      data       TEXT NOT NULL,
      views      INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_queue (
      id         TEXT PRIMARY KEY,
      to_email   TEXT NOT NULL,
      subject    TEXT NOT NULL,
      html       TEXT NOT NULL,
      sent       INTEGER DEFAULT 0,
      error      TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      sent_at    TEXT
    );
  `);

  // Add columns to existing tables (ignore if already exists)
  const alters = [
    `ALTER TABLE users ADD COLUMN bonus_plans INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN ref_code TEXT`,
    `ALTER TABLE users ADD COLUMN pro_until TEXT`,
    `ALTER TABLE users ADD COLUMN signup_date TEXT`,
    `ALTER TABLE users ADD COLUMN nudge_sent INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN limit_email_sent INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN stripe_customer_id TEXT`,
    `ALTER TABLE users ADD COLUMN google_id TEXT`
  ];
  for (const sql of alters) {
    try { _db.run(sql); } catch(e) { /* column already exists */ }
  }
  // Populate signup_date for existing users if null
  try { _db.run(`UPDATE users SET signup_date = created_at WHERE signup_date IS NULL`); } catch(e) {}
}

// Save in-memory db to disk. Called after every write.
function _saveDb() {
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  _dirty = false;
}

// ── Low-level helpers ─────────────────────────────────────────────────────────

// run a write statement; saves to disk immediately
function run(sql, params = []) {
  _db.run(sql, params);
  _saveDb();
}

// return one row or null
function get(sql, params = []) {
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

// return all rows
function all(sql, params = []) {
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ── Users ─────────────────────────────────────────────────────────────────────

function createUser({ id, name, email, hashedPassword }) {
  run(
    `INSERT INTO users (id, name, email, hashed_password, pro)
     VALUES (?, ?, ?, ?, 0)`,
    [id, name, email.toLowerCase().trim(), hashedPassword]
  );
}

function getUserByEmail(email) {
  return get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
}

function getUserById(id) {
  return get('SELECT * FROM users WHERE id = ?', [id]);
}

function getUserByGoogleId(googleId) {
  return get('SELECT * FROM users WHERE google_id = ?', [googleId]);
}

function createUserGoogle({ id, name, email, googleId }) {
  run(
    `INSERT INTO users (id, name, email, hashed_password, pro, google_id)
     VALUES (?, ?, ?, '', 0, ?)`,
    [id, name, email.toLowerCase().trim(), googleId]
  );
}

function linkGoogleId(userId, googleId) {
  run('UPDATE users SET google_id = ? WHERE id = ?', [googleId, userId]);
}

function setUserPro(userId) {
  run('UPDATE users SET pro = 1 WHERE id = ?', [userId]);
}

function updatePassword(userId, hashedPassword) {
  run('UPDATE users SET hashed_password = ? WHERE id = ?', [hashedPassword, userId]);
}

function getAllUsers() {
  return all('SELECT id, name, email, pro, created_at FROM users ORDER BY created_at DESC');
}

// ── Profiles ──────────────────────────────────────────────────────────────────

function saveProfile(userId, profileObj) {
  run(
    `INSERT INTO profiles (user_id, data, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    [userId, JSON.stringify(profileObj)]
  );
}

function getProfile(userId) {
  const row = get('SELECT data FROM profiles WHERE user_id = ?', [userId]);
  if (!row) return null;
  try { return JSON.parse(row.data); } catch(e) { return null; }
}

// ── Plans ─────────────────────────────────────────────────────────────────────

function savePlan(id, userId, planObj) {
  run(
    `INSERT INTO plans (id, user_id, data) VALUES (?, ?, ?)`,
    [id, userId, JSON.stringify(planObj)]
  );
}

function getRecentPlans(userId, limit = 10) {
  const rows = all(
    'SELECT data FROM plans WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit]
  );
  return rows.map(r => { try { return JSON.parse(r.data); } catch(e) { return null; } }).filter(Boolean);
}

// ── Reset Tokens ──────────────────────────────────────────────────────────────

function createResetToken(token, userId, expiresAt) {
  run(
    `INSERT INTO reset_tokens (token, user_id, expires_at, used) VALUES (?, ?, ?, 0)`,
    [token, userId, expiresAt]
  );
}

function getResetToken(token) {
  return get('SELECT * FROM reset_tokens WHERE token = ? AND used = 0', [token]);
}

function markResetTokenUsed(token) {
  run('UPDATE reset_tokens SET used = 1 WHERE token = ?', [token]);
}

function purgeExpiredTokens() {
  run(`DELETE FROM reset_tokens WHERE expires_at < datetime('now') OR used = 1`);
}

// ── Leads ─────────────────────────────────────────────────────────────────────

function saveLead(id, email, source, name) {
  // Upsert — same email might come in twice
  run(
    `INSERT INTO leads (id, email, source, name)
     VALUES (?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
    [id, email.toLowerCase().trim(), source || 'unknown', name || '']
  );
}

function countLeads() {
  const row = get('SELECT COUNT(*) AS n FROM leads');
  return row ? row.n : 0;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

function logEvent(event, data, ipTail) {
  // fire-and-forget; don't let analytics errors crash the server
  try {
    _db.run(
      `INSERT INTO analytics (event, data, ip_tail) VALUES (?, ?, ?)`,
      [event, JSON.stringify(data || {}), ipTail || '']
    );
    _saveDb();
  } catch(e) { /* non-fatal */ }
}

function getAnalytics() {
  const rows = all('SELECT event, data, ip_tail, created_at FROM analytics ORDER BY created_at DESC LIMIT 5000');
  return rows.map(r => ({
    event: r.event,
    data: (() => { try { return JSON.parse(r.data); } catch(e) { return {}; } })(),
    ip_tail: r.ip_tail,
    ts: r.created_at
  }));
}

// ── Family Profiles ───────────────────────────────────────────────────────────

function getFamilyProfiles(userId) {
  const rows = all(
    'SELECT id, name, data, created_at FROM family_profiles WHERE user_id = ? ORDER BY created_at ASC',
    [userId]
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    ...(() => { try { return JSON.parse(r.data); } catch(e) { return {}; } })()
  }));
}

function saveFamilyProfile(id, userId, name, dataObj) {
  run(
    `INSERT INTO family_profiles (id, user_id, name, data)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data`,
    [id, userId, name, JSON.stringify(dataObj || {})]
  );
}

function deleteFamilyProfile(id, userId) {
  run('DELETE FROM family_profiles WHERE id = ? AND user_id = ?', [id, userId]);
}

function countFamilyProfiles(userId) {
  const row = get('SELECT COUNT(*) AS n FROM family_profiles WHERE user_id = ?', [userId]);
  return row ? row.n : 0;
}

// ── Referrals ─────────────────────────────────────────────────────────────────

function saveReferral(id, referrerEmail, referredIp, referredEmail) {
  run(
    `INSERT INTO referrals (id, referrer_email, referred_ip, referred_email, converted)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT DO NOTHING`,
    [id, referrerEmail.toLowerCase().trim(), referredIp || '', (referredEmail || '').toLowerCase().trim()]
  );
}

function markReferralConverted(referrerEmail, referredEmail) {
  run(
    `UPDATE referrals SET converted = 1 WHERE referrer_email = ? AND referred_email = ? AND converted = 0`,
    [referrerEmail.toLowerCase().trim(), (referredEmail || '').toLowerCase().trim()]
  );
}

function getReferralCount(referrerEmail) {
  const row = get(
    'SELECT COUNT(*) AS n FROM referrals WHERE referrer_email = ?',
    [referrerEmail.toLowerCase().trim()]
  );
  return row ? row.n : 0;
}

function addBonusPlan(email) {
  run(
    `UPDATE users SET bonus_plans = COALESCE(bonus_plans, 0) + 1 WHERE email = ?`,
    [email.toLowerCase().trim()]
  );
}

function getUserBonusPlans(userId) {
  const row = get('SELECT bonus_plans FROM users WHERE id = ?', [userId]);
  return row ? (row.bonus_plans || 0) : 0;
}

// ── Ref codes ─────────────────────────────────────────────────────────────────

function setUserRefCode(userId, refCode) {
  run('UPDATE users SET ref_code = ? WHERE id = ?', [refCode, userId]);
}

function getUserByRefCode(refCode) {
  return get('SELECT * FROM users WHERE ref_code = ?', [refCode]);
}

function setUserProUntil(userId, untilDate) {
  run('UPDATE users SET pro = 1, pro_until = ? WHERE id = ?', [untilDate, userId]);
}

function setStripeCustomerId(userId, customerId) {
  run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customerId, userId]);
}

function removeUserPro(userId) {
  run('UPDATE users SET pro = 0, pro_until = NULL WHERE id = ?', [userId]);
}

function getUsersNeedingNudge() {
  // Users who signed up 3 days ago, are not Pro, and haven't been sent a nudge yet
  return all(`
    SELECT id, name, email FROM users
    WHERE pro = 0
      AND nudge_sent = 0
      AND signup_date IS NOT NULL
      AND datetime(signup_date) <= datetime('now', '-3 days')
    LIMIT 100
  `);
}

function markNudgeSent(userId) {
  run('UPDATE users SET nudge_sent = 1 WHERE id = ?', [userId]);
}

function getUsersForWeeklyDigest() {
  // Active free users (signed up, not pro, email known)
  return all(`
    SELECT id, name, email FROM users
    WHERE pro = 0 AND email IS NOT NULL AND email != ''
    LIMIT 500
  `);
}

// ── Share links ───────────────────────────────────────────────────────────────

function saveShareLink(shareId, planId, userId, planData) {
  run(
    `INSERT INTO share_links (share_id, plan_id, user_id, data)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(share_id) DO UPDATE SET data = excluded.data`,
    [shareId, planId, userId, JSON.stringify(planData)]
  );
}

function getShareLink(shareId) {
  const row = get('SELECT * FROM share_links WHERE share_id = ?', [shareId]);
  if (!row) return null;
  try {
    row.plan = JSON.parse(row.data);
    return row;
  } catch(e) { return null; }
}

function incrementShareViews(shareId) {
  // fire-and-forget, don't let this fail loudly
  try { _db.run('UPDATE share_links SET views = views + 1 WHERE share_id = ?', [shareId]); _saveDb(); } catch(e) {}
}

// ── Analytics funnel ──────────────────────────────────────────────────────────

function getFunnelStats() {
  const users     = all('SELECT id, pro, created_at FROM users');
  const now       = new Date();
  const weekAgo   = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const total     = users.length;
  const proUsers  = users.filter(u => u.pro === 1).length;
  const thisWeek  = users.filter(u => u.created_at >= weekAgo).length;

  // Get plan counts from analytics
  const plansRow  = get(`SELECT COUNT(*) AS n FROM analytics WHERE event = 'generate_plan'`);
  const plans     = plansRow ? plansRow.n : 0;

  // Top referrers
  const refRows   = all(`
    SELECT referrer_email, COUNT(*) AS n FROM referrals
    WHERE converted = 1
    GROUP BY referrer_email
    ORDER BY n DESC
    LIMIT 5
  `);

  // This month signups
  const signupRow = get(`SELECT COUNT(*) AS n FROM analytics WHERE event = 'signup' AND created_at >= ?`, [monthAgo]);
  const monthSignups = signupRow ? signupRow.n : 0;

  // Free limit hits this month
  const limitRow  = get(`SELECT COUNT(*) AS n FROM analytics WHERE event = 'free_limit_hit' AND created_at >= ?`, [monthAgo]);
  const limitHits = limitRow ? limitRow.n : 0;

  // Upgrade clicks this month
  const upgradeRow = get(`SELECT COUNT(*) AS n FROM analytics WHERE event = 'upgrade_click' AND created_at >= ?`, [monthAgo]);
  const upgradeClicks = upgradeRow ? upgradeRow.n : 0;

  const convRate = total > 0 ? ((proUsers / total) * 100).toFixed(1) + '%' : '0%';
  const plansPerUser = total > 0 ? (plans / total).toFixed(1) : '0';

  return {
    total_users: total,
    pro_users: proUsers,
    free_users: total - proUsers,
    users_this_week: thisWeek,
    conversion_rate: convRate,
    plans_generated: plans,
    plans_per_user_avg: plansPerUser,
    this_month: {
      signups: monthSignups,
      free_limit_hits: limitHits,
      upgrade_clicks: upgradeClicks
    },
    mrr_estimate: `$${(proUsers * 8).toLocaleString()}/month`,
    top_referrers: refRows.map(r => ({ email: r.referrer_email, conversions: r.n }))
  };
}

// ── DB health check (for /api/health) ─────────────────────────────────────────
function ping() {
  const row = get('SELECT 1 AS ok');
  return row && row.ok === 1;
}

// expose the raw db instance for direct queries (ping uses it)
Object.defineProperty(module.exports || {}, 'db', { get: () => _db });

module.exports = {
  initDb,
  // expose raw db
  get db() { return _db; },
  // expose low-level helpers for direct queries in server.js
  get: (sql, params) => get(sql, params || []),
  all: (sql, params) => all(sql, params || []),
  run: (sql, params) => run(sql, params || []),
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
  ping
};
