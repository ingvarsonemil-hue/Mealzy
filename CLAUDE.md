# Mealzy — Claude Code Instructions

Tiered docs: this file holds project-wide context and hard rules. Frontend/design rules live in `public/CLAUDE.md`; agent system rules live in `.agents/skills/CLAUDE.md`. Rules are not repeated across tiers — read the tier for the folder you're working in.

## Project
Free AI meal planner at mealzy.org. Generates a week of personalized meals in 30s hitting calorie/macro targets and grocery budget. Built by Emil (16yo solo founder). Local checkout: `C:\Users\emili\Documents\mealzy\`.

**Stack:** Node.js + Express (server.js — all API routes), Turso SQLite (@libsql/client, db.js), JWT in httpOnly cookies, Stripe subscriptions + webhook, Anthropic claude-haiku-4-5-20251001 (meal generation + AI coach "Mia"), Render free tier, vanilla HTML/CSS/JS (18 pages in /public/), Winston logger.

**Tiers:** Free (3 plans/month) · Pro $8/mo or $62/yr · Family $16/mo or $130/yr

**Repo:** ingvarsonemil-hue/Mealzy

## Hard rules (do not violate)
- Never commit secrets, credentials, or .env files.
- Always read a file before editing it — never assume contents.
- Keep files under 500 lines. server.js (~2,400 lines) is oversized and flagged for route-splitting; don't grow it further.
- Render free tier: expect cold starts, and storage is ephemeral — nothing persisted to local disk survives a restart.
- Never trust the JWT payload for Pro/subscription status — always re-query the DB.
- Shell is PowerShell — no `&&` chaining; run commands individually.
- Bump the service worker cache version (`mealzy-vN`, first line of public/sw.js) on every JS/CSS deploy, or fixes silently fail to appear for returning visitors.
- CSS trap: `public/style.css` is the primary stylesheet and `public/styles.css` is orphaned legacy — but index.html and pricing.html still load BOTH. Confirm which file(s) a page actually links before editing any styling.
- Screenshot verification in light AND dark mode is mandatory before considering any visual fix done — never trust a "success" report alone.

## Brand
Voice: warm, calm, direct. No emojis. Primary color #3d8b5e (forest green). Headings: Fraunces italic. Body: Inter.

## Known open bugs
- `getUsersForWeeklyDigest()` in db.js (~line 402) has no Pro filter — upgrade emails go to already-paid Pro users.
- Dashboard streak badge (`id="streakBadge"`, dashboard.html ~line 218) is hardcoded "1 day streak" — disconnected from real data.
