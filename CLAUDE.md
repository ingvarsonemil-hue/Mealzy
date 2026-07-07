# Mealzy — Claude Code Instructions

## Project
Free AI meal planner at mealzy.org. Generates a full week of personalized meals in 30 seconds, hitting calorie/macro targets and grocery budget, with auto-generated grocery lists. Solo-founder project (Emil, 16, Sweden).

## Stack
- Node.js + Express — server.js (all routes; ~2,400 lines, exempt from the 500-line rule below until the planned route split — do not refactor it unasked)
- Turso/libSQL — db.js (users, meal_plans, grocery_lists, and more)
- Auth: JWT in httpOnly cookies. NEVER trust the JWT payload for Pro/subscription status — always re-query the DB. (Client-trusted `is_pro` was a real, since-fixed vulnerability. Do not reintroduce it.)
- Stripe — Free (3 plans/month) · Pro $8/mo or $62/yr · Family $16/mo or $130/yr
- Anthropic API — claude-haiku-4-5-20251001 (meal generation + AI coach "Mia")
- Resend — transactional email (custom domain, DNS on Namecheap)
- Render free tier (Ohio) — no auto-deploy; deploys are triggered manually
- Frontend — vanilla HTML/CSS/JS, 18 pages in /public/, no framework. Winston logger.
- Repo: ingvarsonemil-hue/Mealzy · Emil's machine: C:\Users\emili\Documents\mealzy\
- Shell: on Emil's machine it's PowerShell — no `&&` chaining there, run commands individually. Remote/cloud sessions run bash and may chain normally.

## Rules — each is a check to run, not a judgment call
Run the check; if it fails, stop and fix or flag before continuing.

- **Scope — do what's asked, nothing more.**
  Check: before finishing, run `git diff --stat`. Every changed file must be required by the request. If one isn't, revert it before reporting done.
- **Never create files unless necessary — prefer editing existing files.**
  Check: before creating any file, list the target directory and name the existing file that could hold the change instead. Only create if nothing fits. For any new `.md` file: quote the message in this session where the user asked for a doc. Can't quote it → don't create it.
- **Always read a file in full before editing it.**
  Check: if the session was compacted/summarized since your last read, re-read before the next edit.
- **Never commit secrets, credentials, or .env files.**
  Check before every commit: `git diff --cached | grep -inE "sk-ant-|sk_live_|pk_live_|whsec_|TURSO_|Bearer [A-Za-z0-9._-]{20,}"` and `git status --short | grep -F ".env"` — both must return nothing. Any hit: unstage, stop, report. (The Bearer pattern requires a literal 20+ char token so `Bearer ${token}` template code doesn't false-positive.)
- **Keep files under 500 lines.**
  Check: after editing any file, run `wc -l <file>`. Over 500 → stop and propose a split before continuing. Exemptions: server.js (pre-existing, split planned). Files over 500 that you didn't touch are out of scope.
- **Validate input at every system boundary.**
  Check: for every new or modified route, list each field read from `req.body`, `req.query`, `req.params`, and cookies. Each must be type-checked and length/range-bounded before first use. Any unchecked field → add validation or flag it; the route is not done.
- **Render free tier — cold starts and ephemeral storage.**
  A cold start looks like: first request after ~15 min idle hangs 30–60+ seconds, then the Render log stream restarts from boot (Winston startup lines, "listening on port"). keep-alive.yml pings every 9 minutes but doesn't guarantee warmth.
  Check before reporting a live bug as fixed: hit the endpoint twice, judge only the second (warm) response.
  Ephemeral storage: anything written to local disk is lost on restart/deploy. Persistent data must go through Turso (db.js). Flag any code writing runtime data to disk expecting it to survive.

## Known active bugs — verify, then fix, then DELETE the entry
Each entry has a check command. Run it first: if the bug is already gone, remove the entry in the same commit. Never assume this list is current.

(No known active bugs. Add new entries here with a check command and log date.)

## CSS layout (post-redesign, 2026-07-06)
- public/css/tokens.css — single source of truth for all values.
- public/css/landing.css — marketing/funnel base (index, pricing, login, SEO pages, onboarding, upgrade, plan, reset-password, pro-welcome).
- public/css/funnel.css — page-specific layers on top of landing.css for those same pages.
- public/style.css — app pages (dashboard, meal-planner, grocery-list, analytics, ai-coach, settings).
- public/css/app-theme.css — overlay loaded after style.css on app pages; aligns them with the marketing look.
- public/styles.css — DELETED 2026-07-06 (was legacy/orphaned after the redesign; had circular custom-property aliases).

Check before editing any styling: `grep -n "stylesheet" public/<page>.html` and confirm which file(s) the page actually loads. Never assume.

## Brand — checks
- **Voice: warm, calm, direct — no emojis, no banned words.**
  Check on any copy change: `grep -inE "level.?up|game.?changer|transform|clean eating" <changed files>` must return nothing, and the diff must contain no emoji characters.
- **Green #3d8b5e — only via its token.**
  Check: if `git diff` shows `#3d8b5e` anywhere outside public/css/tokens.css, replace it with `var(--color-green)`.
- **Fraunces (headings), Inter (body) — both self-hosted.**
  Check: if the diff sets a font-family on a heading that isn't Fraunces, or on body text that isn't Inter, revert it.
- **CTA pattern: exactly "Start Planning Free" or "Free at mealzy.org".**
  Check: any new CTA text must match one of those strings, or flag why it can't.
- **No side-stripe border-left accents.**
  Check: `grep -n "border-left" <changed css/html>` on any visual change — a hit used as a decorative accent must be removed.

## Design system (full detail: /public/CLAUDE.md)
- **Tokens only — public/css/tokens.css is the single source of truth.**
  Check on any visual change: `git diff -- public/ | grep -oE "#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)"` — every value must be defined as a `--color-*`/`--clr-*` token in tokens.css. Anything else: replace with the token or flag.
- **public/js/theme-init.js must be the FIRST script in every page's `<head>`.**
  Check on every page you touch: `grep -n "<script" public/<page>.html | head -1` must point at js/theme-init.js.
- **Bump the cache version in public/sw.js (`const CACHE = 'mealzy-vN'`, line 1) on every commit that touches HTML/CSS/JS under public/.**
  Check: if the diff has visual changes but not sw.js, the change is not done. Skipping this is the #1 cause of "the fix didn't work" confusion.
- **Screenshot verification is mandatory before any visual fix is considered done.**
  Check: take a light-mode AND a dark-mode screenshot of the changed page and look at both. Never trust a success report alone.

## Agents (full detail: /.agents/skills/CLAUDE.md)
All agent status, roster, and run-agent.js routing live in .agents/skills/CLAUDE.md — status is NOT duplicated here because it has drifted from docs before. Before assuming any agent is paused or live, run the workflow gate check documented there: every job in .github/workflows/*agents*.yml must carry `if: false` to be truly paused. Every agent run spends Anthropic API tokens — never trigger one (cron, workflow_dispatch, or `node .github/scripts/run-agent.js`) unless Emil explicitly asks.

## Skills to read before design/UI work
.claude/skills/mealzy-design.md, .claude/skills/impeccable/SKILL.md, .claude/skills/ui-ux-pro-max/SKILL.md, .claude/skills/ui-audit/SKILL.md
Check each exists and is non-empty before relying on it (`wc -c <file>`). Verified 2026-07-06: all three above exist and have content. Known gaps: .claude/skills/stop-slop/ is an empty directory (no SKILL.md) and .claude/skills/security-audit.md exists but is 0 bytes — do not cite either until restored.

## File access
On Emil's machine, project files are at C:\Users\emili\Documents\mealzy\ — always use the full path there. Always read a file before editing. Never assume file contents.
