# Mealzy — Claude Code Instructions

## Project
Free AI meal planner at mealzy.org. Generates a week of personalized meals in 30s hitting calorie/macro targets and grocery budget. Built by Emil (16yo solo founder).

**Stack:** Node.js + Express (`server.js`), Turso SQLite (`@libsql/client`, `db.js`), JWT in httpOnly cookies, Stripe subscriptions + webhook, Anthropic `claude-haiku-4-5-20251001` (meal gen + AI coach "Mia"), Render free tier, Vanilla HTML/CSS/JS (18 pages in `/public/`), Winston logger.

**Tiers:** Free (3 plans/month) · Pro $8/mo or $62/yr · Family $16/mo or $130/yr

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
- `server.js` — main Express app + all API routes
- `db.js` — Turso/libsql database client
- `public/` — all 18 HTML pages (vanilla JS/CSS)
- `.github/scripts/run-agent.js` — agent runner for GitHub Actions
- `.github/workflows/_run-agent.yml` — reusable agent workflow
- `.agents/skills/` — 19 agent skill files
- `.agents/memory/` — agent memory (per-agent, appended each run)
- `.agents/outputs/` — dated agent output files
- `.agents/config.json` — model config per agent

## Agent Team (19 agents, run via GitHub Actions cron)
**Marketing:** Alex (video/carousel), Maya (copy/landing), Jordan (email/retention), Sam (SEO/content), Riley (growth/conversion), Casey (pricing), Taylor (brand/Twitter)
**Product & Engineering:** Quinn (AI/prompts), Morgan (full-stack), Drew (PM), Charlie (support), Avery (DevOps)
**Business Ops:** Harper (legal), Finlay (finance), Logan (affiliates), Robin (research), Matteo (i18n)

Agent output blocks extracted by `run-agent.js`:
- `## SOCIAL POST` → posts to Facebook via `FACEBOOK_WEBHOOK`
- `## HTML CAROUSEL` → screenshots via HCTI → posts to Instagram via `INSTAGRAM_WEBHOOK`
- `## TWITTER POST` → posts via twitter-api-v2
- `## MEMORY UPDATE` → appended to `.agents/memory/<agent>.md`

## GitHub Vars
- `ANTHROPIC_API_KEY` ✅
- `FACEBOOK_WEBHOOK` ✅
- `INSTAGRAM_WEBHOOK` — pending (Make.com setup in progress)
- `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET` — add when ready

## Brand
- Voice: warm, calm, direct — no emojis, no banned words (level up, game-changer, transform, clean eating)
- Green: `#3d8b5e`
- Font: Fraunces (headings)
- CTA pattern: "Start Planning Free" / "Free at mealzy.org"
- Full brand rules: `brand-voice.md`
