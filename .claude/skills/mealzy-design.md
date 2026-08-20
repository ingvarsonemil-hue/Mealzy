Mealzy Design Skill (Premium Tier)
Apply this whenever doing design work, UI audits, or reviewing changes on the Mealzy app. This is the single source of truth. There is no longer a separation between "marketing tokens" and "app tokens."

1. Unified Color System
Use CSS variables only. Never hardcode hex values. Never use a separate token family for the app versus the marketing site.
/* Brand */
--color-forest:      #1a3d2b;  /* Nav, hero bg, dark CTAs, brand accent */
--color-green:       #3d8b5e;  /* Primary buttons, links, active states */
--color-green-light: #4ade80;  /* Hover accents on dark backgrounds */
--color-green-muted: #a8d5ba;  /* Disabled states, secondary accents */

/* Neutrals */
--color-foreground:  #1a1a1a;  /* Body text */
--color-muted-fg:    #4b5563;  /* Secondary text, captions, labels (darkened for WCAG AA) */
--color-cream:       #f8f5f0;  /* Card backgrounds, warm white */
--color-parchment:   #f2ede6;  /* Alternating sections, subtle highlights */
--color-muted-bg:    #faf8f6;  /* Subtle page backgrounds */
--color-border:      #e5e0d8;  /* All 1px dividers, card borders */
--color-hairline:    #ede8e0;  /* Subtle lines inside tables/lists */

/* Semantic */
--color-success:     #10b981;  /* Under budget, positive deltas */
--color-warning:     #f59e0b;  /* Approaching budget limit */
--color-error:       #ef4444;   /* Over budget, errors */
--color-brick:       #c2410c;  /* Secondary CTA, required field asterisk, active nav links */
Dark mode — applied via [data-theme="dark"] on <html>:
--color-foreground:  #f5f1ed;
--color-muted-fg:    #9ca3af;
--color-cream:       #1f2937;  /* App cards */
--color-parchment:   #111827;  /* Alt sections */
--color-muted-bg:    #0f1419;  /* Page bg */
--color-border:      #2d3748;
--color-hairline:    #1f2937;
/* Green and brand tokens stay exactly the same */
2. Typography & Data Display
Fonts: Fraunces (headings/display) + Inter (body/UI). Load both or the design breaks.

Type Scale:

Role
Size (desktop)
Weight
Font
Line-height
Letter-spacing
H1 Hero	56–72px	900	Fraunces	1.05	-0.03em
H2	36–44px	700	Fraunces	1.1	-0.02em
H3	24–28px	700	Fraunces	1.15	-0.01em
H4	20px	700	Inter	1.2	—
Body lg	18px	400	Inter	1.65	—
Body md	17px	400	Inter	1.7	—
Body sm	15px	400	Inter	1.6	—
Caption	14px	400	Inter	1.5	—
Button	15px	600	Inter	1.2	—
Data md	24px	700	Inter	1.2	-0.01em

Mobile (max-width: 640px): H1 → 40px, H2 → 28px, H3 → 22px, body → 16px.

Rules:

H1 and H2 Fraunces headings are always italic — this is the brand warmth signal.
Body text: min 400 weight, min 1.6 line-height. Max line-length: 65 chars (~680px).
--color-muted-fg must only be used on text 14px or larger to maintain WCAG AA contrast.
Data & Financial Display Rules (Critical for $10k/mo feel):

All numerical data (costs, macros, budgets) MUST use font-variant-numeric: tabular-nums. Numbers must never wobble.
Currency symbols must be 75% the size of the number, aligned to the top.
Positive financial deltas use --color-success. Negative/over-budget deltas use --color-error.
Numbers must never snap. Budget depletions and macro counts must animate count-up using the standard easing curve.
3. Spacing, Radius & Elevation
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

/* Motion (Premium Standard) */
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
--duration-fast: 120ms;   /* Toggles, hovers */
--duration-med: 250ms;     /* Panels, accordions */
--duration-slow: 400ms;    /* Page transitions, modals */
4. Component Standards
Buttons:

Primary: background: var(--color-green), 12px/24px padding, --radius-md, weight 600.
Hover: 10% darker + var(--shadow-button). Transition: var(--duration-fast) var(--ease-standard).
Active: transform: scale(0.98).
Focus ring: outline: 2px solid var(--color-green); outline-offset: 2px.
Min height 44px. Min width 100px.
Inputs:

Border: 1px solid var(--color-border), --radius-md.
Padding: 12px 14px, height 44px min. Font-size: 16px (prevents iOS zoom).
Focus: border-color: var(--color-green) + box-shadow: 0 0 0 3px rgba(61,139,94,0.1).
Labels: 12px, weight 700, uppercase, letter-spacing 0.08em, color --color-muted-fg.
Cards:

background: var(--color-cream), border: 1px solid var(--color-border), --radius-lg.
Padding: 24px. Rest shadow: var(--shadow-card).
Hover: transform: translateY(-2px) + var(--shadow-lg). Transition: var(--duration-fast) var(--ease-standard).
Dark mode surfaces: Use borders, not shadows, to make them pop.
Data Lists & Tables (Meals & Groceries):

Row height: Min 44px (touch target).
Dividers: 1px solid var(--color-hairline). Never use heavy borders for internal rows.
Alignment: Item names left-aligned, quantities/costs right-aligned (preparing for decimal alignment with tabular-nums).
Progress Rings & Bars (Budget Tracking):

A circular ring using conic-gradient, brand green over a muted track color, paired with a Fraunces-italic number.
This is the single signature element for app pages. Do not add competing effects (stamps, monospace LCDs, textures) alongside it.
5. Anti-Patterns (What Bad Looks Like)
Dual Token Systems: Using --clr-* for the app and --color-* for marketing. Unacceptable. One system.
Hardcoded values: Any #3d8b5e or font-size: 20px outside the token system.
Snapping Numbers: Budgets or macros appearing instantly without a count-up animation.
Side-stripe accents: border-left: 4px solid green is a generic SaaS pattern; never do this.
Emojis in UI: No emojis in headings, buttons, labels, or navigation. Use SVG icons.
Black shadows: Shadows must use forest green base color, not rgba(0,0,0,...).
Generic SaaS look: Blue buttons, system fonts, tight spacing, flat cards.
Non-italic Fraunces headings: H1 and H2 must be italic.
Teal or black theme colors: Only forest green (#1a3d2b) for dark brand surfaces.
6. Pre-Ship Checklist (5 Questions)
Ask these before marking any UI change complete:

Is it unified? — App and marketing site use the exact same --color-* variables.
Is the data stable? — All numbers use tabular-nums and animate count-up. No wobble.
Does it work in dark mode? — Toggle [data-theme="dark"]. Every surface readable, no missing styles.
Does it work at 320px? — No horizontal scroll, no overflowing text, touch targets ≥ 44px.
Is motion premium? — Transitions use var(--ease-standard), not linear or default CSS easing.