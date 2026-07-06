# public/ — Frontend & Design Rules

- Styling uses `--clr-*` CSS tokens exclusively (single source of truth: `css/tokens.css`) — never hardcoded hex/rgba values.
- No side-stripe `border-left` accents.
- `js/theme-init.js` must be the first script in every page `<head>` (dark mode flashes otherwise).
- Before writing any design or UI change, read: `.claude/skills/mealzy-design.md`, `.claude/skills/stop-slop/SKILL.md`, `.claude/skills/ui-ux-pro-max/SKILL.md`.
- HTML structure bugs often masquerade as CSS bugs — e.g. a mismatched closing tag pulling sections outside `<main>`. Inspect the DOM before reaching for CSS fixes.
