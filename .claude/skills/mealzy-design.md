# Mealzy Design Brief
## Read this before touching any UI file.

---

## The Vibe

Mealzy is a **calm, budget-honest editorial app**. It should feel like a well-kept 
ledger, not a wellness app and not a generic SaaS dashboard. The audience is 
budget-conscious — cost is never hidden or softened, it's shown plainly and calmly.

- **Light mode**: forest green on warm cream. Quiet, unhurried, like a well-designed 
  notebook — not stark white, not clinical.
- **Dark mode**: deep green-black. Rich, not flat.

If a design choice would look at home in a generic React admin template, or in a soft 
lifestyle/wellness app, it's wrong for Mealzy.

---

## Color Tokens (source of truth)

Never hardcode colors that have tokens. `styles.css` (not `style.css`) is a legacy file 
with dead tokens (`--brick`, `--parchment`, `--espresso`) — if found in it, neutralize 
per page. Confirm which stylesheet a page actually loads before editing.

---

## Typography

- **Headings**: Fraunces, **italic**, weight 500–600. This is a change from the old 
  system — italic is what gives it personality, non-italic Fraunces reads generic.
- **Body**: Inter — clean, readable. Everything else.
- Self-hosted via `@fontsource`. Never load from Google Fonts CDN in production.

---

## What Good Looks Like

**The one signature element — the progress ring:**
- A circular ring (conic-gradient, brand green over a muted track color) paired with a 
  Fraunces-italic number, used for anything showing progress toward a budget or goal 
  (weekly grocery total vs. budget, calorie progress, etc.)
- This is the single "new" personality touch. Don't add competing signature elements 
  (no stamps, no LCD/mono-font treatments, no heavy textures) — one signature, kept quiet.

**Lists (meals, grocery items, etc.):**
- Plain rows separated by hairline dividers (`--clr-border-light` / `--clr-border-dark`). 
  Not boxed cards. Boxing every row reads cluttered — reserve card surfaces for genuinely 
  distinct panels (the budget hero, stat summaries), not repeating list items.

**Cards and surfaces (used sparingly, not for lists):**
- Light: white background, `box-shadow: 0 1px 4px rgba(0,0,0,0.07)`
- Dark: `rgba(255,255,255,0.05)` over the page background
- Border radius: 12px–16px on cards, 8–9px on buttons and inputs

**Spacing:**
- Generous, unchanged from before. Section gaps 48–64px, card padding 24–32px. 
  Cramped = wrong.

**Buttons:**
- Primary: `background: var(--clr-brand)`, white text, `border-radius: 9px`, subtle 
  hover darkening. No shadow/pressed-key effects, no gradients.
- Never gray primary buttons.

**Inputs:**
- Light: white bg, `border: 1.5px solid rgba(0,0,0,0.12)`, focus border in brand green
- Dark: `rgba(255,255,255,0.06)` bg, `border: 1.5px solid rgba(255,255,255,0.12)`

**The sidebar:**
- Background: `#1a3d2b` always (both modes) — unchanged from before
- Active item: `background: rgba(255,255,255,0.12)`, white text
- Inactive: `rgba(255,255,255,0.6)` text

---

## What Bad Looks Like

- Flat gray cards with no shadow or depth
- Pure white (`#ffffff`) as the light-mode page background — must be `#FAF7F1`
- Non-italic Fraunces on headings
- Boxed/bordered cards on every list row
- Monospace or "digital/LCD" type treatments anywhere
- Any texture, scanline, stamp, or badge-pill effect — the ring is the one signature, 
  don't add more
- Hardcoded `#000000` or `#ffffff` backgrounds in dark mode instead of the green-black 
  palette
- Generic blue focus rings or default browser button styling showing through 
  (always confirm a background/color rule actually applies — check every mode, 
  don't assume a CSS selector matched)
- Emojis anywhere in the UI, including email templates
- Near-black `#111111` used as dark page background — always `#1a2e22`

---

## The Editorial Standard

Before shipping any UI change, ask:
1. Does this look calm and budget-honest, or does it look like a soft wellness app?
2. Is the green doing a job (brand, status, accent) or just decorating?
3. Does dark mode use the green-black palette, or is it "everything turned gray"?
4. Is there one clear signature (the ring) or have competing effects crept in?
5. Would a budget-conscious user trust this app with their grocery money based on 
   how it looks?

If any answer is "no" or "not sure" — fix it before committing.
