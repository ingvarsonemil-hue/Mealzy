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
  `);

  // Add bonus_plans column to existing users tables (ignore if already exists)
  try { _db.run(`ALTER TABLE users ADD COLUMN bonus_plans INTEGER DEFAULT 0`); } catch(e) { /* column already exists */ }
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

// ── DB health check (for /api/health) ─────────────────────────────────────────
function ping() {
  const row = get('SELECT 1 AS ok');
  return row && row.ok === 1;
}

module.exports = {
  initDb,
  // users
  createUser, getUserByEmail, getUserById, setUserPro, updatePassword, getAllUsers,
  // profiles
  saveProfile, getProfile,
  // plans
  savePlan, getRecentPlans,
  // reset tokens
  createResetToken, getResetToken, markResetTokenUsed, purgeExpiredTokens,
  // leads
  saveLead, countLeads,
  // analytics
  logEvent, getAnalytics,
  // family profiles
  getFamilyProfiles, saveFamilyProfile, deleteFamilyProfile, countFamilyProfiles,
  // referrals
  saveReferral, markReferralConverted, getReferralCount, addBonusPlan, getUserBonusPlans,
  // health
  ping
};
