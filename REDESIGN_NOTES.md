# Mealzy Redesign Notes — Editorial Cookbook Direction

## Chosen direction: Editorial Cookbook
Warm parchment tones + Playfair Display serif + real food photography + generous whitespace.
Think Kinfolk × Bon Appétit × a well-loved recipe notebook.

---

## Files changed / created
| File | What changed |
|---|---|
| `public/styles.css` | **New file.** Full editorial design system, 700+ lines. Includes compatibility aliases so existing `--clr-*` inline styles continue to work. Landing pages link here; app pages (`dashboard.html`, etc.) continue to use `style.css` unchanged. |
| `public/motion.js` | **New file.** ~55 lines. IntersectionObserver scroll reveals with stagger, hero parallax, nav scroll state, FAQ accordion. |
| `public/index.html` | **Redesigned.** Full-bleed hero photo, editorial 01/02/03 how-it-works, new recipe-card product showcase, editorial feature columns, founder pull quote, FAQ accordion, editorial footer. All JS preserved: interactive demo, email popup, exit intent, referral capture, mobile nav, service worker. |
| `public/pricing.html` | **Redesigned.** Editorial intro with drop cap, 3-tier menu cards with Chef's choice ribbon, editorial comparison table, FAQ accordion. All JS preserved: billing toggle, Stripe links, deciding popup, mobile nav. |
| `public/login.html` | **Redesigned.** Split-screen: food photo left / form right. Tab bar with underline slider. Bottom-border-only form inputs. All JS preserved: Google OAuth, handleSignIn/handleSignUp, password toggle, reset flow, session check, referral capture. |

---

## Design decisions

### Palette
- **Parchment (#FDF6EC / #F4EAD5)** — the base. Reads immediately as "food" and warmth. Not cream (too yellow), not white (too clinical).
- **Espresso (#1A1208)** — near-black with brown undertone. Avoids the cold sterility of `#000`. Used for body text, nav on dark sections, footer background.
- **Brick (#C84B31)** — primary accent. Earthy red-orange is one of the most appetite-stimulating colours in food photography. Replaces flat forest green on all CTAs, labels, and feature marks.
- **Sage (#4A7C59)** — supporting colour (grocery ✓ marks, eyebrow text) preserving the "healthy eating" association without dominating.
- **Hairline (#D9CDB8)** — warm grey for dividers instead of card box-shadows. Creates editorial newspaper-style separation.

### Typography
- **Playfair Display** (display serif) — optical contrast between thick and thin strokes. Used for all headings, pull quotes, recipe card titles, pricing card names, FAQ questions, and the logo (small-caps). Italic variant carries testimonials.
- **DM Sans** (humanist geometric sans) — clean pairing with Playfair. Used for body copy, labels, nav links, form fields, and small-caps utility labels.
- Modular scale (1.25 ratio) in CSS custom properties — no ad-hoc font sizes anywhere in the design system.

### Layout
- **Asymmetric editorial grid** for hero: panel anchored bottom-left over full-bleed photo.
- **Hairline dividers** between sections — no background-colour stripes that create generic SaaS zebra rhythm.
- **Section padding**: `clamp(4rem, 10vw, 8rem)` — proportional vertical rhythm at every breakpoint.
- **How it works**: large Playfair numerals (01 02 03) in `--parchment-deep` — almost invisible, purely textural.
- **Product showcase** (new section): 7-day recipe card + grocery list panel. Shows the actual product output.

### Photography
- **Hero**: Brooke Lark / Unsplash `photo-1504674900247-0877df9cc836` — overhead colourful meal spread. Served with `<picture>` WebP + JPEG srcset at 800w/1400w/1920w. `fetchpriority="high"`, no lazy-load.
- **Login split-screen**: Jay Wennington / Unsplash `photo-1414235077428-338989a2e8c0` — dramatically lit plated dish, portrait crop. `loading="lazy" decoding="async"`.

### Motion (motion.js)
- IntersectionObserver reveals at `threshold: 0.1`, `translateY(16px) → 0`, staggered 80ms via `data-stagger` parent attribute.
- Hero parallax at 0.15× scroll speed, disabled under `prefers-reduced-motion`.
- Fork SVG icon rotates 12° on CTA hover via CSS transition.
- FAQ accordion: `max-height` 0→600px with chevron rotation.
- All easing: `cubic-bezier(0.16, 1, 0.3, 1)` — expo-out curve, natural and unhurried.

### Login
- Split-screen: food photo left (hidden on mobile), parchment form right.
- Tab bar uses CSS `::after` `scaleX` underline slider instead of background pill.
- Inputs have bottom-border-only treatment — no rounded boxes.

### Pricing
- Menu-card layout with a "Chef's choice" brick ribbon, rotated −4°.
- Monthly/yearly toggle preserved with all Stripe link swapping.
- "Deciding" popup after 30s preserved.

---

## Compatibility strategy
`styles.css` defines both the editorial tokens (`--parchment`, `--brick`, etc.) **and** compatibility aliases that map the existing `--clr-*` variables used in inline styles throughout the HTML to the new palette. This means:
- Landing pages link to `styles.css` and get the full editorial design.
- All `var(--clr-primary)` etc. references in inline styles still resolve correctly via the aliases.
- App pages (`dashboard.html`, `settings.html`, etc.) are untouched and continue to use `style.css`.

---

## Tradeoffs
| Decision | Why |
|---|---|
| Separate `styles.css` vs overwriting `style.css` | `style.css` is shared by 18 app pages. Overwriting would break the dashboard, grocery list, AI coach, settings, etc. A separate file linked only by the three landing pages is safer and cleaner. |
| Kept Fraunces font reference removed | Landing pages use Playfair Display + DM Sans. App pages (using `style.css`) still use Fraunces + Inter — two type systems coexist. This is intentional: landing = editorial magazine, app = clean utility tool. |
| Fork icon on CTA | Adds subtle personality and food-coding to every primary CTA without being distracting. Rotates 12° on hover as a micro-interaction. |
| Founder note → pull quote | The raw founder-note card was functional but flat. A full-bleed espresso-background section with oversized Playfair italic gives the same content far more emotional weight. All copy preserved verbatim. |
