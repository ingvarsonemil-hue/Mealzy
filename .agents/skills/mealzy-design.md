# Mealzy Design Brief
## Read this before touching any UI file.

---

## The Vibe

Mealzy is a **forest-green editorial app**. It feels like a premium health publication that also happens to be software. Not a SaaS dashboard. Not a food delivery app. Not a generic Bootstrap project.

The two modes are distinct personalities:
- **Light mode**: forest green on clean white. Breathing room. Like a well-designed cookbook.
- **Dark mode**: deep black-green. Rich, not flat. Like a high-end app at night — the green glows rather than disappears.

If a design choice would look at home in a generic React admin template, it's wrong for Mealzy.

---

## Color Tokens (source of truth)

```
--clr-brand:        #3d8b5e   /* primary green — buttons, accents, active states */
--clr-brand-dark:   #1a3d2b   /* dark hero sections, sidebar */
--clr-page-dark:    #1a2e22   /* dark mode page background */
--clr-surface:      #ffffff   /* light mode card/panel backgrounds */
--clr-foreground:   /* dark on light, light on dark — use the token, never hardcode */
```

Never hardcode colors that have tokens. Always check `styles.css` for legacy overrides using `--brick`, `--parchment`, `--espresso` — these are dead tokens that break things. Neutralize them per-page when found.

---

## Typography

- **Headings**: Fraunces — serif, editorial weight. Use it for personality. Page titles, section headers, Mia's name, feature names.
- **Body**: Inter — clean, readable. Everything else.
- Self-hosted via `@fontsource`. Never load from Google Fonts CDN.

Fraunces is what makes Mealzy feel premium. If a heading is in Inter, it's probably wrong.

---

## What Good Looks Like

**Cards and surfaces:**
- Light: white background, `box-shadow: 0 1px 4px rgba(0,0,0,0.07)` — subtle lift, not dramatic
- Dark: `rgba(255,255,255,0.05)` to `rgba(255,255,255,0.08)` over the page background — visible but not glowing
- Border radius: 12px–16px on cards, 8px on inputs and chips
- Never flat colored cards with no depth in light mode

**Spacing:**
- Generous. If it feels tight, add more padding.
- Section gaps: 48px–64px. Card padding: 24px–32px.
- The app should breathe. Cramped = wrong.

**Buttons:**
- Primary: `background: #3d8b5e`, white text, `border-radius: 8px`, subtle hover darkening
- Never gray primary buttons. Never flat with no hover state.

**Inputs:**
- Light: white bg, `border: 1.5px solid rgba(0,0,0,0.12)`, focus border `#3d8b5e`
- Dark: `rgba(255,255,255,0.06)` bg, `border: 1.5px solid rgba(255,255,255,0.12)`

**The sidebar:**
- Background: `#1a3d2b` always (both modes)
- Active item: `background: rgba(255,255,255,0.12)`, white text
- Inactive: `rgba(255,255,255,0.6)` text

---

## What Bad Looks Like

Reject any design that has:
- Flat gray cards in light mode with no shadow or depth
- Hardcoded `#000000` or `#ffffff` backgrounds in dark mode instead of the green-black palette
- Generic blue focus rings (override with green)
- Inputs that look like browser defaults
- Body text in Fraunces (it's for headings only)
- Emojis in UI (anywhere — buttons, labels, placeholders)
- "Online" indicator or status chips with no contrast in dark mode
- Suggestion chips that are invisible in dark mode
- Chat bubbles that blend into the page background
- Near-black `#111111` used as dark page background — always use `#1a2e22`

---

## Page-Specific Notes

**ai-coach.html:**
- Chat area background: `var(--clr-surface)` light / `#1a2e22` dark
- Mia's bubble: white with subtle shadow in light / `rgba(255,255,255,0.07)` in dark
- Suggestion chips: green border in light, `rgba(255,255,255,0.18)` border in dark
- Input bar should feel integrated, not floating

**meal-planner.html:**
- Meal cards: white surface, green accent on hover
- Sticky totals bar: `#3d8b5e` background, white text
- Date navigator: inline row, never stacking

**dashboard.html:**
- Stat cards: white, subtle shadow, green accent numbers
- Empty states: friendly, not gray and lifeless

**grocery-list.html:**
- Category headers: Fraunces, medium weight
- Checked items: strikethrough + reduced opacity, not hidden

**settings.html:**
- Section dividers: clean, not heavy
- Toggle switches: green when active

---

## The Editorial Standard

Before shipping any UI change, ask:
1. Does this look like it belongs in a premium health app or a generic SaaS?
2. Is the green being used intentionally, or is it just slapped on?
3. Does dark mode use the green-black palette, or is it just "everything turned gray"?
4. Is there enough breathing room?
5. Would a user trust this app with their health goals based on how it looks?

If any answer is "no" or "not sure" — fix it before committing.
