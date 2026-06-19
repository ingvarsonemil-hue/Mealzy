# Mealzy — Claude Code Instructions

## Project
Free AI meal planner at mealzy.org. Generates a week of personalized meals in 30s hitting calorie/macro targets and grocery budget. Built by Emil (16yo solo founder).

**Stack:** Node.js + Express (server.js), Turso SQLite (@libsql/client, db.js), JWT in httpOnly cookies, Stripe subscriptions + webhook, Anthropic claude-haiku-4-5-20251001 (meal gen + AI coach "Mia"), Render free tier, Vanilla HTML/CSS/JS (18 pages in /public/), Winston logger.

**Tiers:** Free (3 plans/month) · Pro $12/mo or $62/yr · Family $16/mo or $130/yr

**Repo:** ingvarsonemil-hue/Mealzy

## Rules
- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary — prefer editing existing files
- NEVER create documentation files unless explicitly requested
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- Keep files under 500 lines
- Validate input at system boundaries
- Always consider Render free-tier limits (cold starts, ephemeral storage)

## Key Files
- server.js — main Express app + all API routes
- db.js — Turso/libsql database client
- public/ — all 18 HTML pages (vanilla JS/CSS)
- .github/scripts/run-agent.js — agent runner for GitHub Actions

## Brand
- Voice: warm, calm, direct — no emojis, no banned words (level up, game-changer, transform, clean eating)
- Green: #3d8b5e
- Font: Fraunces (headings)
- CTA pattern: "Start Planning Free" / "Free at mealzy.org"

## Design System
- Single source of truth: public/tokens.css
- Dark mode: public/theme-init.js (must be first script in every page head)
- Bump service worker cache version (mealzy-vN in sw.js) on every visual deploy

## File Access
All project files are at: C:\Users\emili\Documents\mealzy\
Always read a file before editing using the full path.
Never assume file contents — always read first.
