# Mealzy /public — Frontend Checks

Scope: every file under /public (18 HTML pages, css/, js/, sw.js). These are the frontend rules from the root CLAUDE.md restated as procedures. Run every applicable check before reporting a change as done — no check requires judgment, only execution.

## Before editing any file
1. Read the file in full first. If the session was compacted since your last read, read it again.
2. After editing, run `wc -l <file>`. If over 500 lines, stop and propose a split before continuing.

## Colors and tokens
- Single source of truth: public/css/tokens.css. Pages must use tokens, not raw values.
- Check after any style change: run `git diff -- public/ | grep -oE "#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)"`. Every value listed must be defined as a `--color-*` or `--clr-*` token inside public/css/tokens.css. Any value not defined there: replace it with the matching token, or flag it if no token fits.
- Brand green is #3d8b5e — reference it only via `--color-green`. If the diff shows `#3d8b5e` in any file other than tokens.css, replace it with the token.

## Dark mode
- public/js/theme-init.js must be the FIRST script in every page's `<head>`.
  Check on every page you touch: `grep -n "<script" public/<page>.html | head -1` must point at js/theme-init.js. If any script loads before it, move theme-init.js above it.
- Check after any visual change: take a light-mode and a dark-mode screenshot of the changed page. Both must render with no unreadable text and no unchanged-when-it-should-change colors. If any element looks wrong in either mode, the cause is almost always a raw color value instead of a token — run the token check above.

## Service worker cache
- public/sw.js line 1: `const CACHE = 'mealzy-vN'`.
- Check on every visual deploy: if the commit touches any HTML/CSS/JS under public/, the same commit must bump N by exactly 1. If sw.js is not in the diff alongside a visual change, the change is not done.

## Copy
- Banned words check on any copy change: `grep -inE "level.?up|game.?changer|transform|clean eating" <changed files>` must return nothing.
- Emoji check: the diff must contain no emoji characters.
- CTA check: any call-to-action must be exactly "Start Planning Free" or "Free at mealzy.org". If it differs, change it to match or flag why it can't.
- Headings use Fraunces. If the diff sets a font-family on an h1–h6 or heading class that is not Fraunces, revert it.

## Done means all checks pass
A frontend change is finished only when every item below is true:
1. `wc -l` under 500 for every edited file (or a split was proposed).
2. Token check returned no undefined color values.
3. theme-init.js is the first script in the head of every touched page.
4. sw.js cache version bumped in the same commit (visual changes only).
5. Banned-word and emoji greps returned nothing (copy changes only).
6. Light-mode and dark-mode screenshots taken and checked (visual changes only).
OPERATING RULES — follow these on every task, no exceptions.

Never-list (hard rules):
- Never delete or overwrite existing work without confirming with me first.
- Never spend money (API calls, ads, purchases, paid tools) without stating
  the cost and getting my explicit yes.
- Never send anything to the outside world (emails, posts, messages,
  publishing) — always stop at a draft I can review.
- Never store passwords, API keys, or secrets in plain text anywhere.

Working discipline:
1. PLAN FIRST — on any multi-step task, list the steps and what could go
   wrong BEFORE doing anything.
2. OPTIONS, NOT ANSWERS — on real decisions, give me 2–3 options with a
   one-line trade-off each, and your pick with the reason.
3. VERIFY AS YOU GO — after each step, check it actually worked before
   starting the next. Never hand me a batch of unchecked work.
4. FRESH-EYES REVIEW — anything high-stakes (customer-facing, spends
   money, hard to reverse) gets reviewed in a separate fresh chat before
   it's final.
5. NAME YOUR ASSUMPTIONS — anything you guessed, flag with "Assumption:"
   so I can correct it before it compounds.
6. DONE MEANS PROVEN — don't tell me something is finished; show me the
   check that proves it.
7. STOP AND ASK — when unsure about wording, money, or anything a
   customer will see: surface the options, don't improvise.
8. READ BEFORE YOU WRITE — before updating any document or record,
   re-read its current version first. One source of truth per fact.