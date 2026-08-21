# Mealzy — Claude Code Instructions

## Project
Free AI meal planner at mealzy.org. Generates a full week of personalized meals in 30 seconds, hitting calorie/macro targets and grocery budget, with auto-generated grocery lists. Solo-founder project (Emil, 16, Sweden). Self-taught, ships daily.

## Current priority (August 2026) — read this before picking what to work on
Retention is the bottleneck, not conversion. ~35 signups, 0 weekly active users, 0 paying subscribers. People sign up and never come back. When two pieces of work compete, prefer whatever gets a signed-up user back on day 7 over new generation features.

Target: 10 paying subscribers, ~$50 MRR at 49 kr/month. Not $200 — hold me to the real number if I say otherwise.

## Stack
- Node.js + Express — server.js (all routes; ~2,400 lines, exempt from the 500-line rule below until the planned route split — do not refactor it unasked)
- Turso/libSQL — db.js (users, plans, grocery_lists, and more)
- Auth: JWT in httpOnly cookies. NEVER trust the JWT payload for Pro/subscription status — always re-query the DB. (Client-trusted `is_pro` was a real, since-fixed vulnerability. Do not reintroduce it.)
- Stripe — Free (anonymous: 3 plans/month by IP; logged-in: 1 plan/day for the first 30 days, then 1/week) · Pro $8/mo or $62/yr · Family $16/mo or $128/yr. Stripe account is in my dad's name — never touch live keys, and anything with legal/tax/contract/refund weight gets flagged for him or a professional. I'm 16 and can't sign for this.
- Anthropic API — claude-haiku-4-5-20251001 (meal generation + AI coach "Mia"). Every generation is a paid call. Before adding a call, a retry loop, a per-item call, or a larger model: tell me what it costs. Bootstrapped budget.
- Resend — transactional email (custom domain, DNS on Namecheap)
- Render free tier (Ohio) — no auto-deploy; deploys triggered manually. Cold starts (~30-60s after ~15 min idle) and ephemeral local disk — persistent data must go through Turso, never local disk expecting it to survive a restart.
- Frontend — two parts. The homepage and other marketing/app pages (pricing, login, legal, plan tools, blog) are a React 19 + Vite app in /client/, built with `npm run build` to /dist/ and served by server.js when /dist/index.html exists (see `hasDistBuild` in server.js). The rest of the app (dashboard, meal-planner, grocery-list, analytics, ai-coach, settings — 18 pages) is vanilla HTML/CSS/JS in /public/, no framework. Winston logger.
- Repo: ingvarsonemil-hue/Mealzy · My machine: C:\Users\emili\Documents\mealzy\
- Shell: PowerShell locally — never chain commands with `&&`, use `;` or separate lines. Remote/cloud sessions run bash and may chain normally.

## Rules — each is a check to run, not a judgment call
Run the check; if it fails, stop and fix or flag before continuing.

- **Scope — do what's asked, nothing more.**
  Check: before finishing, run `git diff --stat`. Every changed file must be required by the request. If one isn't, revert it before reporting done.
- **Never create files unless necessary — prefer editing existing files.**
  Check: before creating any file, name the existing file that could hold the change instead. Only create if nothing fits. For any new `.md` file: quote the message where I asked for a doc. Can't quote it → don't create it.
- **Always read a file in full before editing it.**
  Check: if the session was compacted/summarized since your last read, re-read before the next edit.
- **Never commit secrets, credentials, or .env files.**
  Check before every commit: `git diff --cached | grep -inE "sk-ant-|sk_live_|pk_live_|whsec_|TURSO_|Bearer [A-Za-z0-9._-]{20,}"` and `git status --short | grep -F ".env"` — both must return nothing. Any hit: unstage, stop, report.
- **Keep files under 500 lines.**
  Check: after editing any file, run `wc -l <file>`. Over 500 → stop and propose a split before continuing. Exemption: server.js (pre-existing, split planned). Files you didn't touch are out of scope.
- **Validate input at every system boundary.**
  Check: for every new/modified route, list each field read from `req.body`, `req.query`, `req.params`, cookies. Each must be type-checked and length/range-bounded before first use.
- **Ask before building.** For any feature or non-obvious bug, ask clarifying questions first. Guessing wrong costs more than asking.

## Known active bugs — verify, then fix, then DELETE the entry
Each entry needs a check command. Run it first: if the bug is already gone, remove the entry in the same commit. Never assume this list is current.

(No known active bugs. Add new entries here with a check command and log date.)

## CSS layout (post-redesign, 2026-07-06)
- public/css/tokens.css — single source of truth for all values.
- public/css/landing.css — marketing/funnel base (index, pricing, login, SEO pages, onboarding, upgrade, plan, reset-password, pro-welcome).
- public/css/funnel.css — page-specific layers on top of landing.css for those same pages.
- public/style.css — app pages (dashboard, meal-planner, grocery-list, analytics, ai-coach, settings).
- public/css/app-theme.css — overlay loaded after style.css on app pages.
- public/styles.css — DELETED 2026-07-06 (legacy/orphaned, circular custom-property aliases).

Check before editing any styling: `grep -n "stylesheet" public/<page>.html` and confirm which file(s) the page actually loads. Never assume.

## Brand — checks
- **Voice: warm, calm, direct — no emojis, no banned words.**
  Check: `grep -inE "level.?up|game.?changer|transform|clean eating" <changed files>` must return nothing, and the diff must contain no emoji.
- **Green #3d8b5e — only via its token.**
  Check: if `git diff` shows `#3d8b5e` outside public/css/tokens.css, replace with `var(--color-green)`.
- **Fraunces (headings), Inter (body) — both self-hosted.**
- **CTA pattern: "Start Planning Free" or "Free at mealzy.org".**
- **No side-stripe border-left accents.**
  Check: `grep -n "border-left" <changed files>` — a decorative hit gets removed.

## Design system (full detail: /public/CLAUDE.md)
- **Tokens only — public/css/tokens.css is the single source of truth.**
  Check: `git diff -- public/ | grep -oE "#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)"` — every value must be a defined token.
- **public/js/theme-init.js must be the FIRST script in every page's `<head>`.**
  Check: `grep -n "<script" public/<page>.html | head -1` must point at js/theme-init.js.
- **Bump the cache version in public/sw.js (`const CACHE = 'mealzy-vN'`, line 1) on every commit touching HTML/CSS/JS under public/.**
  Check: if the diff has visual changes but not sw.js, it's not done. Skipping this is the #1 cause of "the fix didn't work" confusion.
- **Screenshot verification mandatory before any visual fix is done.**
  Check: light-mode AND dark-mode screenshot of the changed page. Never trust a success report alone.

## Agents (full detail: /.agents/skills/CLAUDE.md)
Agent status and routing live there, not duplicated here — it has drifted from docs before. Before assuming any agent is paused, check every job in `.github/workflows/*agents*.yml` carries `if: false`. Every agent run spends Anthropic tokens — never trigger one unless I explicitly ask.

## Skills to read before design/UI work
.claude/skills/mealzy-design.md, .claude/skills/impeccable/SKILL.md, .claude/skills/ui-ux-pro-max/SKILL.md, .claude/skills/ui-audit/SKILL.md
Check each exists and is non-empty (`wc -c <file>`) before relying on it.

## File access
Project files at C:\Users\emili\Documents\mealzy\ — always use the full path. Always read before editing. Never assume file contents.

## How to work with me
- Lead with the answer or verdict, then the reasoning. No preamble, no flattery.
- **Verify before asserting.** Read the file before claiming what's in it. Say what you checked versus assumed. My docs have drifted from reality before.
- Only reference file paths you've actually seen in this repo.
- Disagree plainly. Call bad code bad — I won't defend this codebase.
- Flag your own mistakes without being asked.
- Code review is yours by default.
- Don't comment on my marketing or my avoidance patterns in coding sessions.
- Address me as Emil in every reply. If you stop doing that, it's my signal the session ran too long and I should start fresh.

## Operating rules — every task, no exceptions
Never-list: never delete/overwrite existing work without confirming first; never spend money without stating cost and getting my yes; never send anything external (emails, posts, publishing) — stop at a draft; never store secrets in plain text.

1. PLAN FIRST — list steps and what could go wrong before doing anything.
2. OPTIONS, NOT ANSWERS — on real decisions, 2-3 options with a one-line trade-off each, plus your pick and why.
3. VERIFY AS YOU GO — check each step worked before starting the next.
4. FRESH-EYES REVIEW — high-stakes work (customer-facing, spends money, hard to reverse) gets reviewed in a separate fresh chat before final.
5. NAME YOUR ASSUMPTIONS — flag anything guessed with "Assumption:".
6. DONE MEANS PROVEN — show the check that proves it, don't just assert finished.
7. STOP AND ASK — unsure about wording, money, or anything a customer sees: surface options, don't improvise.
8. READ BEFORE YOU WRITE — re-read the current version of a doc/record before updating it.

## Repo conventions — UNVERIFIED, fill these in
Not confirmed — don't trust until replaced.
- Dev server: `npm run ???`
- Tests: `???`
- DB migrations: `???`
- Deploy: `???`
- Entry point: `???`
- Env vars required: `???`