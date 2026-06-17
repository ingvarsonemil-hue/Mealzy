# Mealzy Design Specification — 100/100

**Target:** Calm/Headspace-level design excellence  
**Current state:** 58/100 (post-critical-fixes: ~68/100)  
**Goal state:** 100/100 — Zero friction, premium, emotionally coherent  
**Timeline:** 6-8 weeks execution

---

## PART 1: DESIGN SYSTEM

### 1.1 Color System

**Primary Brand**
```css
--color-forest:      #1a3d2b;  /* Hero, nav, primary CTAs, brand accent */
--color-green:       #3d8b5e;  /* Buttons, links, active states */
--color-green-light: #4ade80;  /* Hover states, accents on dark */
--color-green-muted: #a8d5ba;  /* Disabled, secondary accents */
```

**Neutral Palette**
```css
--color-foreground:  #1a1a1a;  /* Body text on light */
--color-muted-fg:    #6b7280;  /* Secondary text, captions */
--color-cream:       #f8f5f0;  /* Card backgrounds, warm white */
--color-parchment:   #f2ede6;  /* Alternating sections, slightly deeper */
--color-muted-bg:    #faf8f6;  /* Subtle backgrounds */
--color-border:      #e5e0d8;  /* Dividers, card borders */
--color-hairline:    #ede8e0;  /* Subtle lines, 1px dividers */
```

**Semantic**
```css
--color-success:     #10b981;  /* Success messages, confirmations */
--color-warning:     #f59e0b;  /* Warnings, caution states */
--color-error:       #ef4444;  /* Errors, destructive actions */
--color-brick:       #c2410c;  /* Secondary CTA color (warm reddish) */
```

**Dark Mode**
```css
[data-theme="dark"] {
  --color-foreground:  #f5f1ed;
  --color-muted-fg:    #9ca3af;
  --color-cream:       #1f2937;
  --color-parchment:   #111827;
  --color-muted-bg:    #0f1419;
  --color-border:      #2d3748;
}
```

**Usage Rules:**
- Primary green (`--color-green`) on white backgrounds only
- Forest (`--color-forest`) as dark backgrounds, hero sections, nav
- Cream/parchment for alternating card sections (stripe effect)
- Border color for all 1px dividers (never use #999 or hardcoded grays)
- Every color must come from CSS variables — no hardcoded hex codes

---

### 1.2 Typography System

**Font Loading**
```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,700;0,9..144,900;1,9..144,400;1,9..144,700;1,9..144,900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

**Font Variables**
```css
--font-display: 'Fraunces', Georgia, serif;     /* Headings, brand */
--font-body:    'Inter', system-ui, sans-serif; /* Body, UI */
```

**Type Scale — Desktop**

| Role | Size | Weight | Font | Line Height | Letter Spacing | Usage |
|------|------|--------|------|-------------|---|---|
| H1 (Hero) | 56–72px | 900 | Fraunces | 1.05 | -0.03em | Page headlines, hero text |
| H2 (Section) | 36–44px | 700 | Fraunces | 1.1 | -0.02em | Section titles |
| H3 (Card) | 24–28px | 700 | Fraunces | 1.15 | -0.01em | Card titles, subsections |
| H4 | 20px | 700 | Inter | 1.2 | — | Form labels (uppercase) |
| Body (lg) | 18px | 400 | Inter | 1.65 | — | Large body copy |
| Body (md) | 17px | 400 | Inter | 1.7 | — | Default body text |
| Body (sm) | 15px | 400 | Inter | 1.6 | — | Secondary text |
| Caption | 14px | 400 | Inter | 1.5 | — | Metadata, hints |
| Button | 15px | 600 | Inter | 1.2 | — | All buttons |
| Badge/Label | 12px | 600 | Inter | 0.08em | uppercase | Tags, badges |

**Type Scale — Mobile** (max-width: 640px)

| Role | Size | Change |
|------|------|--------|
| H1 (Hero) | 40px | -16px |
| H2 (Section) | 28px | -8px |
| H3 (Card) | 22px | -2px |
| Body (lg) | 16px | -2px |
| Body (md) | 16px | -1px |
| Rest | Same | — |

**Type Scale — Tablet** (640px–1024px)

| Role | Size |
|------|------|
| H1 | 56px (clamp: 48–64px) |
| H2 | 40px (clamp: 32–44px) |
| H3 | 24px |
| Body | 17px |

**Typography Rules:**
- H1 always italic when using Fraunces
- H2 always italic when using Fraunces (lifestyle/warm feeling)
- H3+ can be regular weight
- Body text never lighter than 400 weight
- All body text has min line-height of 1.6 (readability)
- Max line-length for body: 65 characters (680px width) — longer than this is harder to read
- All headings use letter-spacing from table above (not different values)

---

### 1.3 Spacing System

**Spacing Scale** (all CSS variables)
```css
--space-1:  4px;    /* Micro: icon padding, checkbox */
--space-2:  8px;    /* Compact: button padding, margins */
--space-3:  12px;   /* Small: internal spacing */
--space-4:  16px;   /* Standard: default margin/padding */
--space-6:  24px;   /* Comfortable: section internal spacing */
--space-8:  32px;   /* Generous: between major sections */
--space-10: 40px;   /* Large: hero spacing */
--space-12: 48px;   /* Extra large: section spacing */
--space-16: 64px;   /* Massive: top-level sections */
--space-20: 80px;   /* Section separators (padding-block) */
--space-24: 96px;   /* Full page sections (padding-block) */
```

**Section Spacing Rules:**
- Horizontal padding: `clamp(1rem, 5%, 1.25rem)` (responsive, max 20px sides on mobile)
- Vertical padding between sections: `clamp(3rem, 6vw, 5rem)` (responsive to viewport)
- Gap between grid items: `var(--space-6)` or `var(--space-8)` (never hardcode)
- Gap in lists/flex: `var(--space-4)` or `var(--space-6)` (consistent)

**Whitespace Philosophy:**
- Premium brands use *more* whitespace, not less
- Every section should have clear visual breathing room
- Don't crowd content — if it feels dense, add space

---

### 1.4 Border Radius

```css
--radius-sm: 6px;    /* Small interactive elements (checkboxes, small buttons) */
--radius-md: 12px;   /* Cards, moderate radius elements */
--radius-lg: 20px;   /* Large cards, modals, prominent elements */
--radius-xl: 32px;   /* Hero sections, large UI surfaces */
--radius-full: 999px; /* Badges, rounded pills */
```

**Usage:**
- Buttons: `--radius-md` (12px)
- Cards: `--radius-lg` (20px) on desktop, `--radius-md` (12px) on mobile for tighter look
- Form inputs: `--radius-md` (12px)
- Large hero sections: `--radius-xl` (32px)
- Badges/pills: `--radius-full` (999px)

---

### 1.5 Shadow System

```css
--shadow-sm:   0 2px 8px rgba(26, 61, 43, 0.06);
--shadow-md:   0 4px 16px rgba(26, 61, 43, 0.08);
--shadow-lg:   0 8px 32px rgba(26, 61, 43, 0.12);
--shadow-xl:   0 16px 48px rgba(26, 61, 43, 0.16);
--shadow-button: 0 4px 12px rgba(61, 139, 94, 0.25);    /* Only on buttons */
--shadow-card: 0 2px 12px rgba(26, 61, 43, 0.08);       /* Only on cards */
```

**Usage:**
- Hover on buttons: `var(--shadow-button)`
- Cards at rest: `var(--shadow-card)`
- Dropdowns/modals: `var(--shadow-lg)`
- Floating elements: `var(--shadow-xl)`
- Forms/inputs: `var(--shadow-sm)` on focus

**Rule:** All shadows use forest green color (not black), at 6-16% opacity — keeps warmth

---

### 1.6 Animation & Transitions

```css
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);   /* Default easing */
--ease-out:    cubic-bezier(0.16, 1, 0.3, 1);  /* Entrance animations */
--ease-edit:   cubic-bezier(0.16, 1, 0.3, 1);  /* Interactive feedback */
--duration-fast: 0.15s;   /* Micro-interactions (hover, focus) */
--duration-base: 0.3s;    /* Standard transitions */
--duration-slow: 0.5s;    /* Entrance animations, page transitions */
```

**Core Animations:**

| Animation | Duration | Easing | Usage |
|-----------|----------|--------|-------|
| Button hover | 0.15s | ease-out | Button color/shadow change |
| Focus ring | 0.15s | ease-out | Input focus state |
| Card entrance | 0.5s | ease-out | Cards sliding/fading in |
| Hover lift | 0.15s | ease-out | Cards lifting on hover (transform: translateY(-2px)) |
| Scroll reveal | 0.55s | ease-in-out | Elements fading in as user scrolls |
| Modal entrance | 0.3s | ease-out | Modals/drawers opening |
| Toggle switch | 0.2s | ease-in-out | Billing toggle, theme toggle |

**Rules:**
- All CSS transitions (not JS)
- Respect `prefers-reduced-motion: reduce` (no animations for accessibility)
- Animations should feel responsive (0.15s for feedback, 0.3-0.5s for entrance)
- No animation without purpose (only on interactive elements or reveal)
- Use `transform` and `opacity` for performance (GPU-accelerated)

---

## PART 2: COMPONENT SPECIFICATIONS

### 2.1 Buttons

**Primary Button**
```css
background: var(--color-green);
color: white;
padding: 12px 24px;  /* min 44px touch target height */
border-radius: var(--radius-md);
font-weight: 600;
font-size: 15px;
border: none;
cursor: pointer;
transition: background 0.15s var(--ease-out), 
            box-shadow 0.15s var(--ease-out);

&:hover {
  background: #2d6e4a;  /* 10% darker */
  box-shadow: var(--shadow-button);
}

&:active {
  transform: scale(0.98);
}

&:focus {
  outline: 2px solid var(--color-green);
  outline-offset: 2px;
}

&:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Secondary Button (Outline)**
```css
background: transparent;
color: var(--color-green);
border: 2px solid var(--color-green);
padding: 10px 22px;  /* 2px less due to border */
border-radius: var(--radius-md);
font-weight: 600;
font-size: 15px;
cursor: pointer;
transition: all 0.15s var(--ease-out);

&:hover {
  background: rgba(61, 139, 94, 0.08);
}

&:focus {
  outline: 2px solid var(--color-green);
  outline-offset: 2px;
}
```

**Ghost Button** (text link style)
```css
background: none;
border: none;
color: var(--color-green);
text-decoration: none;
cursor: pointer;
padding: 0;
font-weight: 600;
transition: opacity 0.15s var(--ease-out);

&:hover {
  opacity: 0.8;
  text-decoration: underline;
}

&:focus {
  outline: 2px solid var(--color-green);
  outline-offset: 2px;
}
```

**Button Sizes**
- `btn-sm`: 12px padding-y, 16px padding-x, 13px font
- `btn-md`: 12px padding-y, 20px padding-x, 15px font (default)
- `btn-lg`: 14px padding-y, 28px padding-x, 16px font
- `btn-full`: width: 100%, padding: 12px

**Rules:**
- All buttons min 44px touch target (height + padding)
- Icon + text spacing: 8px gap
- Icon size: 18px for md/lg buttons, 14px for sm
- No button should be narrower than 100px (except icon-only)

---

### 2.2 Form Elements

**Input Fields**
```css
border: 1px solid var(--color-border);
border-radius: var(--radius-md);
padding: 12px 14px;
font-size: 16px;  /* Prevent zoom on iOS */
font-family: var(--font-body);
background: white;
color: var(--color-foreground);
transition: all 0.15s var(--ease-out);

&:hover {
  border-color: #d1ccc4;  /* Slightly darker border */
}

&:focus {
  outline: none;
  border-color: var(--color-green);
  box-shadow: 0 0 0 3px rgba(61, 139, 94, 0.1);
}

&::placeholder {
  color: var(--color-muted-fg);
}

&:disabled {
  background: var(--color-muted-bg);
  cursor: not-allowed;
  opacity: 0.6;
}
```

**Form Group Spacing**
- Label to input: 6px gap
- Input to next field: 16px gap
- Input height: 44px (minimum)
- Max width for input: 100% (but ideally constrain form to 400px max-width)

**Labels**
- Font size: 12px, weight 700, uppercase, letter-spacing 0.08em
- Color: `var(--color-muted-fg)`
- Required indicator: `*` in `var(--color-brick)` color

**Validation States**
```css
/* Error */
&.error {
  border-color: var(--color-error);
}

/* Success */
&.success {
  border-color: var(--color-success);
}

/* Disabled */
&:disabled {
  background: var(--color-muted-bg);
  opacity: 0.6;
}
```

**Password Toggle**
- Icon button (no background) next to password input
- Click toggles between eye-open and eye-closed icon
- Icon color: `var(--color-muted-fg)`

---

### 2.3 Cards

**Card Base**
```css
background: var(--color-cream);
border: 1px solid var(--color-border);
border-radius: var(--radius-lg);
padding: 24px;
box-shadow: var(--shadow-card);
transition: all 0.15s var(--ease-out);

&:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}
```

**Pricing Card** (premium highlight)
```css
border: 2px solid var(--color-green);
background: white;
padding: 28px;

/* "Most popular" badge */
&.popular::before {
  content: 'Most popular';
  position: absolute;
  top: -12px;
  left: 20px;
  background: var(--color-green);
  color: white;
  padding: 4px 16px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 700;
}
```

---

### 2.4 Navigation

**Fixed Nav Bar**
```css
position: fixed;
top: 0;
width: 100%;
z-index: 100;
background: rgba(255, 255, 255, 0.95);
backdrop-filter: blur(8px);
border-bottom: 1px solid var(--color-border);
padding: 12px 20px;

&.scrolled {
  background: rgba(255, 255, 255, 0.98);
  box-shadow: var(--shadow-sm);
}
```

**Nav Links**
- Font: 15px, weight 500, color `var(--color-foreground)`
- Hover: opacity 0.7, no underline
- Active: color `var(--color-brick)`, weight 700
- Spacing: 24px gap between links

**Mobile Menu**
- Hamburger icon: 24×24px, top-right corner
- Menu overlay: `position: fixed, inset: 0, background: rgba(0,0,0,0.5), z-index: 99`
- Menu panel: slides from right, `width: 100%, max-width: 320px`
- Links: full-width, 16px padding, 48px min-height touch targets

---

## PART 3: PAGE-SPECIFIC SPECIFICATIONS

### 3.1 Homepage (index.html)

**Current Issues → Fixes:**

| Issue | Current | Target | Priority |
|-------|---------|--------|----------|
| Hero section spacing | Adequate | Increase padding-bottom to 80px (clamp) | High |
| Demo form styling | Functional | Design with consistent form system | High |
| Demo result cards | Plain | Add proper card styling + animations | High |
| Section spacing | Varies | Use `clamp(3rem, 6vw, 5rem)` everywhere | High |
| Testimonials section | Weak | Strengthen with real photos/names | Medium |
| FAQ styling | Adequate | Ensure consistent accordion animations | Medium |
| Footer spacing | Cramped | Add more whitespace, increase padding | Medium |

**New Requirements:**

1. **Hero Layout** (80vh minimum, visual balance)
   - Left: copy + CTA (with emoji/icons for trust signals)
   - Right: demo form card
   - Mobile: stack vertically, form goes below copy
   - Background: gradient overlay (radial gradients at corners for depth)

2. **Trust Strip** (below hero)
   - 4 items: "3 free/month", "No credit card", "30 seconds", "Free forever"
   - Each with checkmark icon, small font, centered
   - Background: slight color difference from body
   - Mobile: 2×2 grid

3. **Demo Section**
   - Loading state: skeleton cards with shimmer animation
   - Progress copy: "Calculating macros..." → "Building week..." → "Writing list..."
   - Result: proper meal plan card layout with day groupings
   - CTA after result: "Get the full week free"

4. **Showcase Section**
   - Two-column grid: meal plan table (left) + grocery list (right)
   - Table responsive: horizontal scroll on mobile (not stacked)
   - Grocery list: 3 categories (Produce, Protein, Pantry), styled checkboxes

5. **Features Grid** (3×2 grid on desktop, 1 column mobile)
   - Each feature card has icon + heading + description
   - Icon: 48px circle background in light green, icon centered
   - Spacing: consistent 24px gaps

6. **Founder Section**
   - Pullquote (large italic text in white on dark)
   - Attribution: italics + smaller font
   - Background: dark forest color
   - Padding: generous (80px top/bottom)

7. **FAQ Accordion**
   - Each item: button (no styling), body hidden, smooth max-height transition
   - Open state: background color change, chevron rotates 180°
   - Animation: 0.35s cubic-bezier ease

8. **Email Popup**
   - Triggers after 12 seconds (exit intent if user leaves)
   - Overlay: modal with backdrop blur
   - Card: brand colors (forest header, cream body)
   - Input + button with proper spacing
   - Close button (× in top right)

**Mobile Breakpoints:**
- `max-width: 640px`: Stack hero, 2×2 grid for trust strip, 1-column features
- `640px–1024px`: 2-column features, table scrollable
- `1024px+`: Full layout

---

### 3.2 Pricing Page (pricing.html)

**Current Issues → Fixes:**

| Issue | Current | Target | Priority |
|-------|---------|--------|----------|
| Theme color | Black (#1A1208) | Forest green ✅ | Done |
| Pricing cards | $12/mo shown | Consistent across all pages ✅ | Done |
| Nav labels | "Features/Reviews" | "How it works/Our story" ✅ | Done |
| "Chef's choice" label | Confusing | Change to "Most popular" | High |
| Annual toggle | Shows by default | Hide when not available | Medium |
| Comparison table | Below fold | Move immediately after cards | High |
| Mobile table | Shrunk text | Use card-based comparison on mobile | High |

**New Requirements:**

1. **Hero Section**
   - Heading: "Mealzy pricing — free plan included, no credit card needed"
   - Subheading: "Start free — 3 meal plans per month, no credit card required"
   - Billing toggle: Monthly/Annual with savings badge
   - Animation: slide up on load

2. **Pricing Cards** (3 cards, middle is highlighted)
   - Free: $0, feature list with checkmarks/crosses
   - Pro: $12/mo (or $5/mo annual), "Most popular" badge, green border, features
   - Family: $16/mo (or $11/mo annual), feature list
   - Mobile: full-width stacking, cards slightly smaller
   - Card animations: staggered entrance (0.5s each, 120ms delay between)

3. **Billing Toggle**
   - Design: pill-shaped toggle with dot
   - Default: Monthly
   - Savings display: "save $82" or "save 57%" (percentage is better)
   - Animation: dot slides smoothly (0.2s)

4. **Comparison Table**
   - Positioned right after cards (not far below)
   - Desktop: 4 columns (Feature, Free, Pro, Family)
   - Mobile: 2 columns (Feature, Pro) — scroll horizontally for other plans
   - Rows alternate background color (subtle)
   - Pro column: bold text, color highlight

5. **FAQ Section** (within pricing context)
   - 4 questions: "Can I cancel?", "What if free limit runs out?", "Is data safe?", "Do you store plans?"
   - Accordion style with chevron animation
   - Answers clear and reassuring

6. **Guarantee Section**
   - "7-day free trial on Pro. No credit card to start."
   - Card styling: background color, centered, padding
   - Small text: "Cancel any time. No questions."

7. **Exit Intent Popup** (30 seconds after arrival)
   - "Still deciding?" heading
   - Copy: "Try Pro free for 7 days — no credit card required"
   - Button: "Start 7-Day Free Trial →" ✅ (fixed dead link)
   - Close button: × in top right
   - Positioning: bottom-right, 20px from edges

---

### 3.3 Login Page (login.html)

**Current Issues → Fixes:**

| Issue | Current | Target | Priority |
|-------|---------|--------|----------|
| Brand presence | Minimal | Add logo, brand color, tagline | Critical |
| Photo | Restaurant dish | Product screenshot or brand color overlay | Critical |
| Privacy link | /privacy.html | /privacy-policy.html ✅ | Done |
| Reset time | "15 minutes" | "1 hour" ✅ | Done |
| No visual hierarchy | Cramped | Add spacing, breathing room | High |
| Mobile layout | 2-column | Single column, full-screen form | High |
| Form fields | 16px font | Maintain for iOS zoom prevention | Medium |

**New Requirements:**

1. **Layout**
   - Desktop: Split screen (left: 50%, right: 50%)
   - Left panel: Brand colors (forest green background), logo, tagline, illustration or product screenshot
   - Right panel: Form in centered container
   - Mobile: Single column, form stacked, left panel hidden

2. **Left Panel (Desktop)**
   - Background: forest green (`var(--color-forest)`)
   - Content centered, white text
   - Logo: Fraunces, italic, bold, 32px, white
   - Tagline: "Full week of meals in 30 seconds", 18px, white, opacity 0.8
   - Visual: Either:
     a) Product screenshot (meal plan grid on phone mockup)
     b) Illustration (abstract meal/food imagery)
     c) Brand color gradient with subtle pattern
   - Padding: 40px top/bottom, 30px sides

3. **Right Panel (Form)**
   - Max-width: 380px
   - Centered vertically and horizontally on desktop
   - Padding: 40px on desktop, 20px on mobile
   - Background: white on desktop, inherit on mobile

4. **Form Styling**
   - Input fields: use form system (44px height, border, focus ring)
   - Labels: 12px, uppercase, weight 700
   - Tab switching: underline style (no background)
   - Google button: brand colors (blue Google colors), white text, 48px height
   - Divider: "or" centered with lines on sides

5. **Password Reset Flow**
   - Step 1: Email input, "Send Reset Link" button
   - Step 2 (success): "Check your inbox — reset link expires in 1 hour"
   - Button state: disabled while loading, "Please wait…" text
   - Back button: "← Back to Sign In"

6. **Validation**
   - Error messages: inline below field, color brick, 14px
   - Success messages: green color, checkmark icon
   - Real-time validation (after blur, not on type)

7. **Mobile Specific**
   - Single column layout
   - Form takes full width (minus padding)
   - Touch targets: min 48px
   - Input font: 16px (prevents iOS zoom)
   - Logo: 24px instead of 32px

---

### 3.4 Upgrade Page (upgrade.html)

**Current Issues → Fixes:**

| Issue | Current | Target | Priority |
|-------|---------|--------|----------|
| Theme color | Teal (#4a8a6f) | Forest green ✅ | Done |
| Price when no annual | $8/mo | $12/mo ✅ | Done |
| Testimonials | Fabricated | Labeled as examples ✅ | Done |
| Dead CTA | "$4 offer" link | → Stripe ✅ | Done |
| No nav | Empty | Add minimal nav or back link ✅ | Done |
| Loading on page | None | Better visual hierarchy needed | Medium |
| Mobile spacing | Cramped | Use spacing scale | Medium |

**New Requirements:**

1. **Hero Section**
   - Eyebrow: "Mealzy Pro"
   - Heading: "Unlock the full Mealzy experience" (italic, large)
   - Copy: Brief value prop (1-2 sentences)
   - Animation: fade-in-up on load

2. **Billing Toggle**
   - Default: Yearly (shows $5/mo annual)
   - Animation: 0.2s dot slide + 0.3s price animation

3. **Upgrade Card**
   - Border: 2px green
   - Heading: "Pro"
   - Price: Large, green color
   - Features: 6 items, checkmark icon + bold label + description
   - CTA: Primary button, "Start Pro Annual — 7 Days Free →"
   - Guarantee: "7-day free trial. No charge for 7 days. Cancel before then and you owe nothing."

4. **Objection Handling** (3 questions)
   - Icons: question mark icon in green
   - Each section: bold question + answer paragraph
   - Spacing: 16px between items

5. **Testimonials Section** (Labeled as examples)
   - Label: "Example feedback from early users" at top
   - 3 cards: quote + author attribution
   - Cards: subtle background color, left border accent (green), italic quote

6. **Comparison Table**
   - Show Free vs Pro vs Family
   - Mobile: horizontal scroll if too wide
   - Pro column: bold text highlight

7. **FAQ**
   - 3 key questions about cancellation, data, pricing
   - `<details>` element with smooth animation
   - Open state: light background change

8. **Abandonment Offer** (45 seconds)
   - Red/warning background
   - "Limited Offer" badge
   - "Get your first month for $4"
   - Button links to discount Stripe URL ✅

---

## PART 4: CROSS-PAGE REQUIREMENTS

### 4.1 Dark Mode

**Scope:** All public-facing pages must support dark mode

**Implementation:**
- Store preference: `localStorage.getItem('mealzy_theme')`
- Toggle: Available in footer or header
- System preference: Detect `prefers-color-scheme` on first visit
- Apply: `<html data-theme="dark">` and use CSS vars

**Color Adjustments:**
```css
[data-theme="dark"] {
  --color-foreground:  #f5f1ed;      /* Light text */
  --color-cream:       #1f2937;      /* Dark card bg */
  --color-border:      #2d3748;      /* Darker border */
  --color-muted-bg:    #0f1419;      /* Almost black bg */
  /* Green stays the same for brand consistency */
}
```

**Card styling in dark:**
- Cards should pop (white on dark), use border instead of shadow
- Shadows: less intense (reduce opacity to 0.06)
- Borders: slightly brighter than in light mode

---

### 4.2 Responsive Design

**Breakpoints:**
```css
--bp-mobile: 320px;   /* min */
--bp-sm: 480px;       /* phone landscape */
--bp-md: 640px;       /* tablet portrait */
--bp-lg: 1024px;      /* tablet landscape / desktop */
--bp-xl: 1280px;      /* large desktop */
```

**Mobile-First Approach:**
- Base styles: mobile (single column, full width)
- `@media (min-width: 640px)`: Tablet styles
- `@media (min-width: 1024px)`: Desktop styles

**Container Widths:**
```css
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 clamp(1rem, 5%, 1.25rem);
}
```

**Grid Spacing on Mobile:**
- 1 column for cards
- 16px gap between items
- Full-width cards with 20px sides padding

---

### 4.3 Loading States

**Demo Generation (30 seconds)**

1. **Skeleton Loading** (first 2 seconds)
   - Show gray placeholder cards with shimmer animation
   - 5 day cards stacked
   - Each card has lines for meal names + macros

2. **Progress Copy** (entire duration)
   - Cycle through 3 messages:
     - "Calculating your macros..."
     - "Building your week..."
     - "Writing your list..."
   - Each 10 seconds, fade transition
   - Progress indicator (subtle green progress bar, 0-100%)

3. **Result Reveal** (when ready)
   - Skeleton fades out
   - Real meal plan fades in with staggered animations
   - Day groups slide in left-to-right
   - Copy below: "This is just 5 days... get the full week free"

**Button Loading State**
- Text → "Please wait…"
- Button disabled
- Optional: small spinner icon (right-aligned)

---

### 4.4 Error States

**API Errors**

```
[Error Icon] 
Heading: "Something went wrong"
Copy: "Specific error message here"
[CTA: "Try again" or "Contact support"]
```

**Design:**
- Icon: 48px circle, light red background, error color icon
- Heading: 18px, weight 700
- Copy: 15px, color muted
- CTA: Secondary button
- Layout: Centered, max-width 400px

**Examples:**
- "You've used today's 3 free demos. [Create a free account]"
- "Something went wrong. [Try again]"
- "Can't reach the server. [Contact support]"

---

### 4.5 Empty States

**No Results / No Data**

```
[Illustration or Icon]
Heading: "Nothing here yet"
Copy: "Description of what would show up"
[CTA: Primary action]
```

**Design:**
- Icon: 64px, light background circle
- Heading: 20px, weight 700
- Copy: 15px, color muted, centered
- CTA: Primary button below
- Container: centered, padding 40px

---

### 4.6 Accessibility (WCAG AAA)

**Requirements:**

1. **Color Contrast**
   - Text on background: min 7:1 ratio (AAA)
   - Large text (18px+): min 4.5:1 ratio
   - Test with: contrastchecker.com

2. **Focus States**
   - All interactive elements: visible focus ring (2px, green)
   - Outline-offset: 2px (ring around element, not on top)
   - Tab order: logical (left-to-right, top-to-bottom)

3. **Semantic HTML**
   - Use `<button>` for buttons (not `<div>`)
   - Use `<a>` for links (not `<button>`)
   - Use `<h1>`, `<h2>`, etc. (logical hierarchy, not for styling)
   - Use `<label for="id">` with form fields
   - Use `<nav>`, `<main>`, `<footer>` landmarks

4. **ARIA**
   - `aria-label` on icon buttons
   - `aria-expanded` on toggle buttons
   - `aria-hidden` on decorative icons
   - `role="alert"` on error messages
   - `aria-live="polite"` on dynamic content

5. **Keyboard Navigation**
   - All CTAs reachable by Tab key
   - Links and buttons: Tab focus, Enter to activate
   - Modals: focus trap (Tab loops within modal)
   - Escape key: closes modals/menus

6. **Screen Reader Text**
   - Visible text: descriptive ("Sign in to your account" not "Click here")
   - Skip link: "Skip to main content" (hidden, visible on focus)
   - Form errors: associated with field via `aria-describedby`

---

### 4.7 Performance & Perceived Performance

**Metrics to Hit:**
- Lighthouse: 90+ on all pages
- First Contentful Paint (FCP): < 1.5s
- Largest Contentful Paint (LCP): < 2.5s
- Cumulative Layout Shift (CLS): < 0.1

**Optimizations:**

1. **Images**
   - Use WebP with JPEG fallback
   - Responsive images: `srcset` for different sizes
   - Lazy load below-fold images
   - Optimize: compress before upload (TinyPNG, ImageOptim)

2. **Fonts**
   - Load only weights used (400, 600, 700, 900 for Fraunces/Inter)
   - `font-display: swap` (show fallback while loading)
   - Preconnect to Google Fonts

3. **CSS/JS**
   - Critical CSS inlined in `<head>`
   - Defer non-critical scripts (motion.js, analytics)
   - Minify CSS and JS in production
   - Remove unused CSS

4. **Perceived Performance**
   - Skeleton loading during data fetch
   - Progress indicators (loading copy, progress bar)
   - Optimistic UI updates (button disabled while submitting)
   - Instant visual feedback (button color change on click)

---

## PART 5: 18-PAGE AUDIT CHECKLIST

Apply these requirements to **all 18 pages** in `/public/`:

1. index.html ✅
2. pricing.html ✅
3. login.html ✅
4. upgrade.html ✅
5. dashboard.html (authenticated)
6. onboarding.html (authenticated)
7. meal-planner.html (authenticated)
8. meal-plan-generator.html
9. grocery-list.html
10. analytics.html
11. plan.html
12. settings.html
13. pro-welcome.html
14. reset-password.html
15. privacy-policy.html
16. terms.html
17. support.html
18. ai-coach.html (or other authenticated pages)

**Checklist for each page:**

- [ ] Meta tags: og:image, og:title, og:description, canonical
- [ ] Meta theme-color: `#1a3d2b` (consistent across all)
- [ ] Fonts: Fraunces + Inter loaded (font-display: swap)
- [ ] Typography: Use type scale variables (not hardcoded sizes)
- [ ] Colors: All from CSS variables (no hardcoded hex)
- [ ] Spacing: Use spacing scale (`--space-*` variables)
- [ ] Buttons: Use button system (no custom styling)
- [ ] Forms: Use form system (consistent inputs, labels, validation)
- [ ] Cards: Use card system (consistent styling)
- [ ] Dark mode: Works correctly (test with prefers-color-scheme)
- [ ] Mobile: Responsive at 320px, 640px, 1024px breakpoints
- [ ] Accessibility: Focus rings visible, semantic HTML, ARIA where needed
- [ ] Performance: Lazy load images, minimize CSS/JS
- [ ] Error states: Designed and styled (not raw error text)
- [ ] Empty states: Designed and styled
- [ ] Loading states: Skeleton or progress indicator
- [ ] Animations: Smooth, respect prefers-reduced-motion
- [ ] Links: All working (no dead # hrefs)
- [ ] Copy: No typos, consistent terminology

---

## PART 6: IMPLEMENTATION ROADMAP

### Week 1–2: Design System & Revenue-Critical
- [ ] Create `/public/css/tokens.css` with all variables
- [ ] Import tokens.css on all 4 main pages
- [ ] Refactor buttons to button system
- [ ] Refactor forms to form system
- [ ] Login page: Add branding (logo, tagline, color overlay)
- [ ] Homepage: Implement demo loading states with copy
- [ ] Mobile type scale: Audit and implement

### Week 3–4: Cards, Components & Polish
- [ ] Refactor all cards to card system
- [ ] Design system: Complete typography, spacing, shadows
- [ ] Homepage: Feature cards, showcase section polish
- [ ] Pricing page: Card animations, comparison table
- [ ] Upgrade page: Objection handling, testimonials section
- [ ] Dark mode: Test and refine on all 4 pages

### Week 5–6: Loading, Error, Empty States
- [ ] Design loading state components
- [ ] Design error state components
- [ ] Design empty state components
- [ ] Implement on homepage demo
- [ ] Implement on forms (login, upgrade)
- [ ] Implement on authenticated pages

### Week 7–8: 18-Page Audit & Polish
- [ ] Audit all 18 pages against checklist
- [ ] Fix consistency issues across pages
- [ ] Test responsive design (320px → 1280px)
- [ ] Test dark mode on all pages
- [ ] Accessibility audit (WCAG AAA)
- [ ] Performance optimization (Lighthouse 90+)
- [ ] Final review and polish

---

## PART 7: FINAL QUALITY GATES

**Before shipping 100/100 design:**

- [ ] **Visual coherence**: Take a screenshot of each page. Do they all feel like the same product?
- [ ] **Copy consistency**: Same terms used everywhere (Sign in vs Sign In vs sign in — pick one)
- [ ] **Mobile test**: Phone at 320px, 480px, 640px — no horizontal scroll, readable text
- [ ] **Dark mode**: All pages work in dark mode, colors readable, no missing styles
- [ ] **Accessibility**: Tab through every page, try screen reader, test keyboard navigation
- [ ] **Performance**: Run Lighthouse, score 90+ on all pages, LCP < 2.5s
- [ ] **No dead links**: Test every link, every button, every form
- [ ] **No typos**: Copy review pass, check all headings, CTAs, error messages
- [ ] **Brand consistency**: Color, typography, spacing, buttons all follow system
- [ ] **Cross-browser test**: Chrome, Safari, Firefox on desktop and mobile

---

**This specification is your roadmap to 100/100. Each section is a checklist you can mark off as you implement.**

**Estimated total effort: 6-8 weeks** (or 2-3 weeks with a designer working with you)

---

*Generated: June 2026*  
*Target: Mealzy Premium Design Excellence*
