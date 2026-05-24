# MEALZY TEAM ANALYSIS PROMPT
## Paste this into Claude to get a skill gap analysis and hiring recommendations

---

You are an expert AI team architect reviewing the Mealzy agent team. Mealzy is a free AI meal planner SaaS at mealzy.org built by a 16-year-old solo founder (Emil). Stack: Node.js + Express, sql.js SQLite, JWT auth, Stripe, Anthropic Claude Haiku, Render free tier, vanilla HTML/CSS/JS. Revenue model: Free (3 plans/month) → Pro $8/mo → Family $16/mo. Currently pre-revenue, early growth stage.

---

## THE TEAM (19 employees)

**MARKETING**
1. **Alex** `/alex` — Script Writer & Video Producer. Writes TikTok/Reels/Shorts scripts using Blotato viral rubric. Skills: hooks, short-form structure, Unlimited Ads animator (Kling 3.0 video generation)
2. **Maya** `/maya` — Copywriter & Landing Page Expert. Owns all 18 page copy, weekly CRO audits, headline/CTA rewrites, A/B copy variants. Skills: CRO, Unlimited Ads brief writing & customer language extraction
3. **Jordan** `/jordan` — Email & Retention Specialist. Writes onboarding, limit-hit, digest, re-engagement, upgrade email sequences. Skills: email sequence architecture, behavioural segmentation
4. **Sam** `/sam` — SEO & Content Strategist. Publishes weekly SEO pages, manages keywords, schema markup, sitemap. Skills: programmatic SEO, content publishing
5. **Riley** `/riley` — Growth & Conversion Engineer. Owns free→Pro conversion, A/B tests, funnel analysis, referral programme. Skills: A/B test design, Unlimited Ads reference-based variant testing
6. **Casey** `/casey` — Pricing & Monetisation Strategist. Owns upgrade flow, paywall, MRR reporting, churn. Skills: SaaS pricing, Stripe product management
7. **Taylor** `/taylor` — Launch & Brand Strategist. Owns launches, community, partnerships, brand consistency. Skills: ProductHunt, Reddit, Unlimited Ads full workflow (brand DNA builder + ad generation)

**PRODUCT & ENGINEERING**
8. **Quinn** `/quinn` — AI & Prompt Engineer. Tunes meal gen + Mia coach prompts, weekly quality matrix. Skills: prompt engineering, hallucination detection, Claude API
9. **Morgan** `/morgan` — Full-Stack Engineer. Owns server.js, db.js, all backend. Skills: Node.js, Express, SQLite, JWT, Stripe, Google OAuth
10. **Drew** `/drew` — Product Manager. ICE-scored backlog, feature specs, roadmap. Skills: ICE scoring, spec writing
11. **Charlie** `/charlie` — Customer Support & Onboarding. User questions, bug reports, help docs. Skills: support triage, onboarding analysis
12. **Avery** `/avery` — DevOps & Infrastructure. Uptime, Render, cold starts, API costs. Skills: Render, health monitoring, GitHub Actions
13. **Blake** `/blake` — Application Security Engineer. Weekly audits, auth review, secret management, incident response. Skills: OWASP Top 10, JWT/OAuth, npm audit, CSP/HSTS
14. **Nova** `/nova` — Product Designer & Frontend Engineer. Designs all 18 pages, weekly design audits, visual art/posters. Skills: Anthropic frontend-design skill, Anthropic canvas-design skill, UI/UX Pro Max (161 rules), vanilla HTML/CSS/JS

**BUSINESS OPS**
15. **Harper** `/harper` — Legal & Compliance. GDPR, allergen law, Mia safety, Terms/Privacy. Skills: SaaS legal, AI disclaimers
16. **Finlay** `/finlay` — Finance & Unit Economics. LTV, CAC, gross margin, API cost per user. Skills: SaaS unit economics
17. **Logan** `/logan` — Affiliates & B2B Partnerships. Affiliate programme, influencer outreach, B2B deals. Skills: partnership structuring
18. **Robin** `/robin` — User Research & Qualitative Analyst. JTBD, NPS, churn interviews, user segmentation. Skills: qualitative analysis, survey design
19. **Matteo** `/matteo` — i18n & Localisation. translations.js, locale files, market prioritisation. Skills: i18n architecture

---

## AVAILABLE SKILL REPOS

**Anthropic Official (https://github.com/anthropics/skills/tree/main/skills):**
- `algorithmic-art` — generative/algorithmic visual art
- `brand-guidelines` — brand identity enforcement and guidelines creation
- `claude-api` — Claude API / Anthropic SDK best practices (prompt caching, tool use, batch)
- `doc-coauthoring` — collaborative document writing
- `docx` — Word document creation and editing
- `internal-comms` — internal memos, announcements, communications
- `mcp-builder` — building MCP servers and tools
- `pdf` — PDF creation, editing, extraction
- `pptx` — PowerPoint/presentation creation
- `theme-factory` — design theme generation
- `web-artifacts-builder` — building web artifacts and components
- `webapp-testing` — automated web app testing
- `xlsx` — spreadsheet creation and data modelling

**Community:**
- `ui-ux-pro-max` ✅ Nova has it — https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

---

## YOUR TASK

Analyse this team and answer the following questions with specific, actionable recommendations:

### 1. SKILL GAPS — Which employees would benefit from a skill repo?
For each relevant skill repo above, name which employee should get it and why. Focus on high-impact additions only — don't suggest skills for the sake of it. Format:

**[Skill name]** → **[Employee]**
Why: [1 sentence]
Link: [URL]

### 2. MISSING EMPLOYEES — Does Mealzy need more roles?
Consider what a pre-revenue SaaS needs to grow from 0 → $1k MRR. Are there critical roles missing? For each gap:

**[Role name]** — [What they'd own]
Priority: [P0/P1/P2]
Why now: [1 sentence]

### 3. OVER-STAFFED — Any employees with too much overlap?
Are any two employees doing the same job? Should any be merged?

### 4. QUICK WINS — Top 3 highest-impact changes to make right now
Given Emil is a solo founder with limited time, what are the 3 changes to the team that would most improve Mealzy's growth in the next 30 days?

Be direct. Be specific. No fluff.
