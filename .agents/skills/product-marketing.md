---
name: product-marketing
role: Product Marketing & Team Context Reference
trigger: "Use when writing marketing copy that needs product facts (value prop, pricing, competitive positioning, key stats) or when any employee needs the master team/product context. Invoke with /product-marketing."
---

# Mealzy — Product & Team Context
## The master context file. Every employee reads this first.

---

## What Mealzy Is

Mealzy is a free AI meal planner at mealzy.org. It generates a full week of personalized meals in 30 seconds — hits your exact calorie and macro targets, stays within your grocery budget, and builds the grocery list automatically. Free to start. No credit card needed.

Built by a 16-year-old. Live on Render. Real users signing up today.

---

## The Problem We Solve

People want to eat well but meal planning is:
- Time-consuming (2 hours every Sunday)
- Mentally draining (what do I even make?)
- Expensive when done wrong ($120 at the shop with nothing to cook)
- Complicated when tracking macros or following a diet

Mealzy solves all four problems in 30 seconds.

---

## Target Audience

**Primary:** Adults 18-35 who want to eat healthier but don't have time or energy to plan meals manually.

**Strongest segments:**
- People tracking calories/macros (weight loss, muscle gain)
- People on a tight grocery budget ($50-100/week)
- People with ADHD who struggle with meal decision-making
- Busy professionals who lose Sunday afternoons to meal prep planning
- Fitness beginners who don't know where to start with nutrition

**Demographics:** Primarily female 25-34 on TikTok/Instagram. Male 20-30 on Reddit/YouTube. Budget-conscious students. Parents planning family meals.

---

## Core Value Proposition

"Build your whole week of meals in 30 seconds — hits your macros, stays in budget, grocery list included. Free."

---

## Key Stats to Use in Marketing

- Plan generation: ~30 seconds
- Time saved vs manual planning: ~2 hours/week
- Grocery savings: ~$60/month (vs unplanned shopping)
- Plans are personalized to: calorie targets, macros, dietary restrictions, budget
- Free plan includes: 3 meal plans/month
- Pro is: $8/month or $62/year

---

## Competitive Positioning

| Competitor | Their weakness | Mealzy's edge |
|------------|---------------|---------------|
| PlateJoy ($69/year) | Expensive, generic | Free to start, AI-personalized |
| MyFitnessPal | Tracks food, doesn't plan meals | Plans meals automatically |
| Yummly | Recipe discovery, not planning | Full week built automatically |
| Spreadsheets | Tedious, no AI | 30 seconds vs 2 hours |
| Hiring a nutritionist | $100+/session | Free forever |

---

## Product Tiers

```
Free: 3 plans/month, no grocery export, no PDF, no AI coach
Pro ($8/month or $62/year): Unlimited plans, grocery export, PDF, AI coach, priority
Family ($16/month or $130/year): Everything in Pro, 4 profiles, shared grocery list
```

Stripe monthly link (live): `https://buy.stripe.com/28E28r1Q73q0e6neQRffy00`
Annual, Family, Discounted links: pending creation in Stripe Dashboard

---

## Tech Stack

- Backend: Node.js + Express (server.js)
- Database: Turso/libSQL (db.js) — hosted cloud database, not a local file
- Auth: JWT in httpOnly cookies
- Payments: Stripe subscriptions + webhook
- AI: Anthropic Claude claude-haiku-4-5-20251001 (meal generation + AI coach named Mia)
- Hosting: Render free tier (cold starts after inactivity; database persistence is handled by Turso, unaffected by Render's ephemeral filesystem)
- Frontend: Vanilla HTML/CSS/JS — 18 pages in /public/
- Logger: Winston (structured JSON in production, pretty-print locally)

---

## Brand Voice (summary — full version in brand-voice.md)

**Is:** Warm, calm, direct, honest, specific. Friend who knows nutrition.
**Is not:** Pushy, preachy, bro-y, wellness-influencer, diet-culture-coded.

Key rules:
- No emojis anywhere
- Specific numbers always (30 seconds, $60/month, 7 meals)
- Max 1 exclamation point per piece, usually zero
- No banned phrases: level up, game-changer, transform your life, clean eating, guilt-free

---

## Revenue Goal

$10,000/month = 1,250 Pro subscribers at $8/month.
At 3% free-to-paid conversion = 42,000 free users needed.
At 5% conversion = 25,000 free users needed.

Current priority: increase conversion rate, not just traffic.

---

## Infrastructure Thresholds

| MRR | Action |
|-----|--------|
| $50 | Upgrade Render free → Starter ($7/month) — eliminates cold start |
| $500 | claude-sonnet viable for complex dietary combos |
| $1,000 | Consider paid acquisition channels |

---

## The Full Team (17 employees)

### Marketing Team
| Employee | Role | Invoke |
|----------|------|--------|
| Alex | Script Writer & Video Producer | /alex |
| Maya | Copywriter & Landing Page Expert | /maya |
| Jordan | Email & Retention Specialist | /jordan |
| Sam | SEO & Content Strategist | /sam |
| Riley | Growth & Conversion Engineer | /riley |
| Casey | Pricing & Monetization Strategist | /casey |
| Taylor | Launch & Brand Strategist | /taylor |

### Product & Engineering Team
| Employee | Role | Invoke |
|----------|------|--------|
| Quinn | AI & Prompt Engineer | /quinn |
| Morgan | Full-Stack Engineer | /morgan |
| Drew | Product Manager | /drew |
| Charlie | Customer Support & Onboarding | /charlie |
| Avery | DevOps & Infrastructure | /avery |

### Business Operations Team
| Employee | Role | Invoke |
|----------|------|--------|
| Harper | Legal & Compliance Officer | /harper |
| Finlay | Finance & Unit Economics Modeler | /finlay |
| Logan | Affiliate & B2B Partnerships Manager | /logan |
| Robin | User Research & Qualitative Analyst | /robin |
| Matteo | Internationalisation & Localisation Engineer | /matteo |

Each employee has a full instruction file in `.agents/skills/[name].md`.
Each employee has a memory file in `.agents/memory/[name].md` — read at the start of every session.
Every employee follows the Reflexion protocol in `.agents/reflexion.md`.
