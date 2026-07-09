# Mealzy Design Skill

Apply this whenever doing design work, UI audits, or reviewing changes on the Mealzy app.

---

## 1. Color Tokens

Use CSS variables only. Never hardcode hex values.

```css
/* Brand */
--color-forest:      #1a3d2b;  /* Nav, hero bg, dark CTAs, brand accent */
--color-green:       #3d8b5e;  /* Buttons, links, active states */
--color-green-light: #4ade80;  /* Hover accents on dark backgrounds */
--color-green-muted: #a8d5ba;  /* Disabled states, secondary accents */

/* Neutrals */
--color-foreground:  #1a1a1a;  /* Body text on light */
--color-muted-fg:    #6b7280;  /* Secondary text, captions, labels */
--color-cream:       #f8f5f0;  /* Card backgrounds, warm white */
--color-parchment:   #f2ede6;  /* Alternating sections */
--color-muted-bg:    #faf8f6;  /* Subtle page backgrounds */
--color-border:      #e5e0d8;  /* All 1px dividers, card borders */
--color-hairline:    #ede8e0;  /* Subtle lines */

/* Semantic */
--color-success:     #10b981;
--color-warning:     #f59e0b;
--color-error:       #ef4444;
--color-brick:       #c2410c;  /* Secondary CTA, required field asterisk */
```

**Dark mode** — applied via `[data-theme="dark"]` on `<html>`:
```css
--color-foreground:  #f5f1ed;
--color-muted-fg:    #9ca3af;
--color-cream:       #1f2937;
--color-parchment:   #111827;
--color-muted-bg:    #0f1419;
--color-border:      #2d3748;
/* Green tokens stay the same */
```

**When to use each:**
- `--color-green` → buttons, links, active states — on white/cream backgrounds only
- `--color-forest` → nav, hero sections, dark panel backgrounds
- `--color-cream` / `--color-parchment` → card backgrounds, alternating sections
- `--color-border` → all 1px dividers (never use #999 or hardcoded grays)
- `--color-brick` → secondary CTAs, required field markers

**App-page tokens** — dashboard.html, meal-planner.html, grocery-list.html, analytics.html, ai-coach.html, and settings.html use a separate `--clr-*` family defined in `style.css`, not the `--color-*` family above (that one is for marketing/funnel pages only). The app-page tokens are: `--clr-brand` (`#3d8b5e` light mode, buttons/ring/accent text), `--clr-brand-dark` (`#4a9d6c` dark mode, same role), `--clr-background` (`#FAF7F1` light mode page bg), `--clr-page-dark` (`#1a2e22` dark mode page bg), and `--clr-border` (`#EAE4D8` light mode, `#2A3A30` dark mode). Before editing any app page, confirm which family it actually loads by checking its `<link>` tags for `style.css` vs. `tokens.css`/`landing.css`.

---

## 2. Typography

**Fonts:** Fraunces (headings/display) + Inter (body/UI). Load both or the design breaks.

```css
--font-display: 'Fraunces', Georgia, serif;
--font-body:    'Inter', system-ui, sans-serif;
```

**Type scale:**

| Role     | Size (desktop) | Weight | Font      | Line-height | Letter-spacing |
|----------|---------------|--------|-----------|-------------|----------------|
| H1 Hero  | 56–72px       | 900    | Fraunces  | 1.05        | -0.03em        |
| H2       | 36–44px       | 700    | Fraunces  | 1.1         | -0.02em        |
| H3       | 24–28px       | 700    | Fraunces  | 1.15        | -0.01em        |
| H4       | 20px          | 700    | Inter     | 1.2         | —              |
| Body lg  | 18px          | 400    | Inter     | 1.65        | —              |
| Body md  | 17px          | 400    | Inter     | 1.7         | —              |
| Body sm  | 15px          | 400    | Inter     | 1.6         | —              |
| Caption  | 14px          | 400    | Inter     | 1.5         | —              |
| Button   | 15px          | 600    | Inter     | 1.2         | —              |
| Badge    | 12px          | 600    | Inter     | —           | 0.08em + uppercase |

**Mobile** (max-width: 640px): H1 → 40px, H2 → 28px, H3 → 22px, body → 16px.

**Rules:**
- H1 and H2 Fraunces headings are always italic — this is the brand warmth signal
- H3+ can be non-italic
- Body text: min 400 weight, min 1.6 line-height
- Max line-length for body copy: 65 chars (~680px) — constrain containers
- Never use hardcoded `font-size` values — use the scale

---

## 3. Spacing & Radius

```css
/* Spacing */
--space-1: 4px;  --space-2: 8px;  --space-3: 12px;  --space-4: 16px;
--space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px;
--space-16: 64px; --space-20: 80px; --space-24: 96px;

/* Border radius */
--radius-sm: 6px;    /* Checkboxes, small elements */
--radius-md: 12px;   /* Buttons, inputs, small cards */
--radius-lg: 20px;   /* Cards, modals */
--radius-xl: 32px;   /* Hero sections, large surfaces */
--radius-full: 999px; /* Badges, pills */
```

**Shadows** (forest green base — never black):
```css
--shadow-sm:     0 2px 8px rgba(26, 61, 43, 0.06);
--shadow-md:     0 4px 16px rgba(26, 61, 43, 0.08);
--shadow-lg:     0 8px 32px rgba(26, 61, 43, 0.12);
--shadow-button: 0 4px 12px rgba(61, 139, 94, 0.25);
--shadow-card:   0 2px 12px rgba(26, 61, 43, 0.08);
```

---

## 4. What Good Looks Like

**Buttons:**
- Primary: `background: var(--color-green)`, 12px/24px padding, `--radius-md`, weight 600
- On hover: 10% darker (`#2d6e4a`) + `var(--shadow-button)`
- On active: `transform: scale(0.98)`
- Focus ring: `outline: 2px solid var(--color-green); outline-offset: 2px`
- Min height 44px (touch target). Min width 100px.
- Icon + text gap: 8px

**Inputs:**
- Border: `1px solid var(--color-border)`, `--radius-md`
- Padding: 12px 14px, height 44px min
- Font-size: 16px (prevents iOS zoom)
- Focus: `border-color: var(--color-green)` + `box-shadow: 0 0 0 3px rgba(61,139,94,0.1)`
- Labels: 12px, weight 700, uppercase, letter-spacing 0.08em, color `--color-muted-fg`

**Cards:**
- `background: var(--color-cream)`, `border: 1px solid var(--color-border)`, `--radius-lg`
- Padding: 24px
- Rest shadow: `var(--shadow-card)`
- Hover: `transform: translateY(-2px)` + `var(--shadow-lg)`, 0.15s ease-out

**Dark mode surfaces:**
- Cards: use border instead of shadow to make them pop on dark bg
- Shadows: reduce opacity to 0.06
- Green brand tokens stay unchanged

**Section spacing:**
- Horizontal padding: `clamp(1rem, 5%, 1.25rem)`
- Vertical between sections: `clamp(3rem, 6vw, 5rem)`
- Premium feel = more whitespace. If it feels dense, add space.

---

## 5. Anti-Patterns (What Bad Looks Like)

- **Hardcoded hex colors** — any `#3d8b5e` in HTML/CSS directly is wrong; must use `var(--color-green)`
- **Hardcoded font sizes** — no `font-size: 20px` outside the token system
- **Side-stripe accents on cards** — `border-left: 4px solid green` is a generic SaaS pattern; never do this
- **Emojis in UI** — no emojis in headings, buttons, labels, or navigation
- **Black shadows** — shadows must use forest green base color, not `rgba(0,0,0,...)`
- **Generic SaaS look** — blue buttons, system fonts, tight spacing, flat cards
- **H1/H2 in Inter instead of Fraunces** — kills the premium editorial feel immediately
- **Non-italic Fraunces headings** — H1 and H2 must be italic; if they're not, the warmth is gone
- **Body text below 400 weight** — 300 weight looks cheap on Inter
- **Inconsistent border-radius** — mixing 8px, 10px, 16px; use only the token scale
- **Nav with active state in green** — active nav links use `--color-brick` (warm red), not green
- **Teal or black theme colors** — only forest green (#1a3d2b) for dark brand surfaces

---

## 6. Page-Specific Notes

**Homepage (index.html):**
- Hero: 80vh min, left copy + right demo form card, radial gradient depth in bg
- Trust strip below hero: 4 items with checkmark icons, 2×2 on mobile
- Demo loading: skeleton shimmer → progress copy ("Calculating macros..." → "Building your week..." → "Writing your list...") → staggered card reveal
- Features grid: 3×2 desktop, 1-column mobile, 48px icon circles in light green

**Pricing (pricing.html):**
- Middle card highlighted: `border: 2px solid var(--color-green)`, "Most popular" pill badge (not "Chef's choice")
- Billing toggle: pill-shaped, monthly default, savings shown as percentage
- Comparison table: immediately after cards, not far below
- Mobile table: 2-column (Feature + Pro) with horizontal scroll for others

**Login (login.html):**
- Desktop: split 50/50 — left panel `background: var(--color-forest)` with logo + tagline, right panel is the form
- Mobile: single column, left panel hidden, form full-width
- Tab switching (Sign in / Register): underline style, not background tabs
- Google button: Google brand colors, white text, 48px height
- Error messages: inline below field, 14px, `--color-brick`

**Upgrade (upgrade.html):**
- Billing toggle defaults to Yearly ($5/mo annual)
- Upgrade card: `border: 2px solid var(--color-green)`, large green price, 6 feature items with checkmarks
- Testimonials must be labeled "Example feedback from early users" — not presented as verified reviews
- Abandonment offer popup: triggers at 45s, red/warning background, "Limited Offer" badge

**Authenticated pages (dashboard, meal-planner, grocery-list, etc.):**
- Dark mode must work — test `[data-theme="dark"]` on every authenticated page
- Use same card/button/input system — no one-off styles
- Empty states: 64px icon circle + heading (20px/700) + muted copy + primary CTA
- Error states: centered, max-width 400px, icon + heading + copy + retry CTA

---

## 7. Pre-Ship Checklist (5 Questions)

Ask these before marking any UI change complete:

1. **Does it use CSS variables?** — No hardcoded hex, no hardcoded pixel sizes outside the scale.
2. **Does it feel like the same product?** — Screenshot next to homepage. Same fonts, radius, spacing rhythm.
3. **Does it work in dark mode?** — Toggle `[data-theme="dark"]`. Every surface readable, no missing styles.
4. **Does it work at 320px?** — No horizontal scroll, no overflowing text, touch targets ≥ 44px.
5. **Are interactive elements accessible?** — Tab to it, focus ring visible, semantic HTML (`<button>`, `<label>`, ARIA where needed).

**Bonus gate for any new component:** Does it respect `prefers-reduced-motion`? All transitions should be wrapped or suppressed.
