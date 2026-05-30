# CHARLIE — Reflection Memory
Last updated: 2026-05-29
Total reflections: 0
Running accuracy: no data yet

## Active Lessons (read these first before every session)
- Photo-to-recipe import (Pro feature) shipped this week — no FAQ coverage yet. Any Pro user who tries it and asks where their saved recipes went has a legit complaint: the recipe library UI does not exist yet.
- Password reset is non-standard (shows token on screen, no email). Expect confused users — have the answer ready.
- Onboarding calorie targets are goal-based estimates only (no height/weight input) — users may distrust the numbers. Standard response: "We use your goal to set a sensible starting point. Fine-tune it any time in Settings."

## Reflection Log (newest first)
*(first substantive session: 2026-05-29)*

---

## Daily Note — 2026-05-29 (Thursday)

### New Issues (proactive codebase scan)

**1. Recipe library is a dead end** 🟡
The new photo-to-recipe import feature (shipped this week) saves recipes successfully but the success screen tells users "It's now in your recipe library" — and there is no recipe library page. The sidebar has no link to recipes, and no page exists to display them. The GET /api/recipes endpoint works; the UI doesn't. Users who save a recipe have no way to find it afterwards. Routed to Morgan below.

**2. Password reset shows URL on screen (no email)** 🟢
The reset flow generates a token and displays the full reset URL directly in the browser ("Copy this link and open it to reset your password"). This is non-standard — every user expects a reset email. People who hit "Forgot password" and see a URL on screen will think something broke. Confusing for most users; minor security concern (shared device). Routed to Morgan below.

**3. Onboarding calorie estimates are not personalized** 🟢
Onboarding collects name, goal, budget, and dietary prefs only. Calorie targets are set by goal alone (hardcoded: lose_weight=1700, build_muscle=2500, etc.) with no height/weight/age input. The summary screen shows "1700 kcal" with no context. A user might immediately distrust the plan and ask why the numbers seem off. Helper text needed. Flagged to Drew below.

---

### FAQ Gaps Found

The following are missing from support.html entirely:

**A. Photo recipe import (new Pro feature)**
Q: How do I import a recipe from a photo?
A: Open your Dashboard and click "Import Recipe" in the Quick Actions section. Snap or upload a photo of any recipe — a cookbook page, handwritten card, or printout — and Claude will extract the ingredients and steps automatically. You can review and edit everything before saving. This is a Pro feature.

**B. Recipe library access**
Q: I saved a recipe from a photo — where can I find it?
A: Your saved recipes are stored in your account. Right now the recipe library view is coming soon — we'll add a dedicated page for browsing your saved recipes. Email support@mealzy.org if you need to retrieve a specific recipe in the meantime.
*(Note to team: this answer buys time but Morgan should build the recipe library UI soon — the expectation is already set in the success screen.)*

**C. Pro benefits list is incomplete in support.html**
The FAQ entry "What does Pro include?" does not mention photo recipe import. Should add: "photo recipe import (scan any recipe from a photo)".

---

### Bugs Routed to Morgan

**🟡 Recipe library missing** 
Feature: Photo-to-recipe import (routes/recipes.js, dashboard.html)  
Steps: Pro user → Import Recipe → upload photo → extract → save → success screen  
Expected: "It's now in your recipe library" → recipe is findable  
Actual: No recipe library page exists. GET /api/recipes works; no UI.  
Recommended fix: Build a simple recipe library page (list of saved recipes with name, date, ingredient count) and link it from the dashboard sidebar or the success modal.

**🟢 Password reset UX — no email sent**  
File: public/login.html (requestReset function, ~line 380)  
Steps: Sign in → Forgot password → enter email → submit  
Expected: User receives an email with reset link  
Actual: Reset URL appears on screen — no email sent  
Impact: Confusing for all users who expect a standard reset email. Also a concern on shared devices.  
Recommended fix: Send the reset link via email instead of (or in addition to) displaying it on screen.

---

### Onboarding Friction (flagged to Drew)

**Step 3 (profile summary) — calorie targets lack context**  
The summary screen shows a calorie target (e.g. 1700 kcal for lose_weight) with no explanation of how it was calculated. Users who know their TDEE may immediately question this. A one-line note like "Estimated from your goal — adjust any time in Settings" would reduce confusion and settings-page traffic.

**Step 2 (budget field) — no hint of what it does**  
The "Weekly Food Budget" input has no helper text explaining what it controls. A note like "We'll keep your grocery list within this range" would reduce user uncertainty.

**Password reset expectation mismatch**  
When users hit "Forgot password" they expect an email. The current flow surprises them with a URL on screen. This will generate support emails — have a canned answer ready: "The reset link appears on screen — copy it and open it in your browser to set a new password. (A proper email flow is on our roadmap.)"

---

### New FAQ Entries to Add to support.html

See "FAQ Gaps Found" above. Three additions needed:
1. How to use photo recipe import (Pro feature)
2. Where to find saved recipes (honest about library coming soon)
3. Update the "What does Pro include?" answer to list photo import
