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
