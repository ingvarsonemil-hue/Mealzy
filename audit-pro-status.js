#!/usr/bin/env node
/**
 * One-off audit: find Pro users with no evidence they should be Pro.
 *
 * Context: is_pro was once trusted from the client JWT (since fixed — see
 * dd23968). This checks the DB directly for accounts that are pro=1 without
 * a stripe_customer_id (paid) or a pro_until (referral reward), and for
 * referral rewards whose pro_until has already passed.
 *
 * Run: node audit-pro-status.js
 * Requires: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
 */

'use strict';
require('dotenv').config();

const db = require('./db');

async function main() {
  await db.initDb();

  const proUsers = await db.all(
    'SELECT id, email, pro_until, stripe_customer_id, created_at FROM users WHERE pro = 1'
  );

  const now = new Date();
  const unexplained = proUsers.filter(u => !u.stripe_customer_id && !u.pro_until);
  const staleReferrals = proUsers.filter(u => u.pro_until && new Date(u.pro_until) < now);

  console.log(`[audit-pro-status] Pro users checked: ${proUsers.length}`);

  console.log(`\n[audit-pro-status] Unexplained Pro (no stripe_customer_id, no pro_until): ${unexplained.length}`);
  unexplained.forEach(u => console.log(`  - ${u.email} (id: ${u.id}, created_at: ${u.created_at})`));

  console.log(`\n[audit-pro-status] Stale referral Pro (pro_until has passed): ${staleReferrals.length}`);
  staleReferrals.forEach(u => console.log(`  - ${u.email} (id: ${u.id}, pro_until: ${u.pro_until})`));

  if (unexplained.length === 0 && staleReferrals.length === 0) {
    console.log('\n[audit-pro-status] No anomalies found.');
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[audit-pro-status] FATAL:', err);
    process.exit(1);
  });
