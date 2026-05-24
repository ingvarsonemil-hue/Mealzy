# MORGAN — Reflection Memory
Last updated: 2026-05-24
Total reflections: 1
Running accuracy: no data yet

## Active Lessons (read these first before every session)

- **Database is Turso, not sql.js.** Migrated 2026-05-24. All db.* calls are async — always await them. `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are in Render env vars.
- **All route handlers must be `async (req, res) => {`.** Missing async causes silent bugs when awaiting db calls.
- **12/12 startup checks pass as of 2026-05-24.** If a deploy shows fewer, check Render env vars first.
- **Env var mistakes are the #1 deploy failure cause.** Always verify both .env (local) and Render dashboard (production) when adding new dependencies.

## Current Stack State (2026-05-24)

- Database: Turso (@libsql/client) — cloud SQLite, data persists across redeploys
- Auth: JWT + Google OAuth (both live)
- Stripe: 4 tiers live — Free, Pro Monthly ($8), Pro Annual ($62), Family Monthly ($16), Family Annual ($130), Discount ($4)
- Hosting: Render free tier, keep-alive Action pings /api/health every 9 min
- Monitoring: UptimeRobot pinging /api/health every 5 min
- AI: Prompt caching active on all 5 Anthropic API calls

## Reflection Log (newest first)

### 2026-05-24 — Turso migration
**What happened:** Migrated from sql.js to Turso. Script added `await` to all db calls but missed non-async route handlers and `getEffectiveLimit()`. Required two extra commits to fix syntax errors on Render.
**Root cause:** Automated regex couldn't detect which callbacks were non-async.
**Lesson:** After any bulk async migration, always run `node --check server.js` locally before pushing.
