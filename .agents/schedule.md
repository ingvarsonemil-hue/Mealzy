# MEALZY TEAM — MASTER SCHEDULE
## Daily & Weekly Responsibilities

All times are approximate. Emil invokes the relevant employee to run their scheduled work.
To run a day's work: `/[employee]` and say "run your [Monday/Tuesday/etc.] schedule".

---

## DAILY RHYTHM (every weekday)

| Time | Employee | Task |
|------|----------|------|
| Morning | **Avery** | Check UptimeRobot for overnight downtime events |
| Morning | **Charlie** | Check support inbox — reply to all messages within 24h |
| Morning | **Morgan** | Scan Render logs for overnight errors |
| Midday | **Taylor** | Check brand mentions (Twitter, Reddit, Instagram) |
| Midday | **Riley** | Check live A/B test progress — any anomalies? |
| Evening | **Jordan** | Review any email bounces or unsubscribes from yesterday's sends |

---

## WEEKLY SCHEDULE

### MONDAY — Measurement Day
*"You can't improve what you don't measure."*

| Employee | Task |
|----------|------|
| **Riley** | Produce weekly funnel report: signups, free→Pro conversion rate, 402 events, A/B test results |
| **Casey** | Produce weekly MRR report: total MRR, new Pro users, churned, net new MRR, churn rate |
| **Morgan** | Run weekly code health check: Render logs, Stripe webhook audit, DB health |
| **Avery** | Run weekly infrastructure report: uptime %, cold starts, Anthropic API cost, PageSpeed score |
| **Quinn** | Run 5-test AI quality matrix, write report and any new reflection entries |
| **Finlay** | Ingest Casey + Avery reports → compute ARPU, gross margin, churn, LTV → unit economics report |
| **Harper** | Scan Mia's system prompt for safety gaps; check Morgan's deploy log for new third parties |
| **Blake** | Run weekly security audit checklist: npm audit, auth checks, secret leak scan, rate limiter review |
| **Robin** | Check NPS responses from past week; review Charlie's report for qualitative user signals |

### TUESDAY — Build & Publish Day
*"Ship something every week."*

| Employee | Task |
|----------|------|
| **Drew** | Review Monday's reports, update ICE scores, write spec for top-priority unspecced feature |
| **Sam** | Publish one SEO page (if one is ready), submit to any pending directories |
| **Taylor** | Post one value post in a target community (r/mealprep, r/ADHD, etc.) |
| **Taylor** | Send 2 partnership outreach emails |
| **Alex** | Write one new video script (Hook + Body + CTA) |
| **Logan** | Research 5 new affiliate/partnership targets; draft outreach emails → hand to Taylor |

### WEDNESDAY — Improve Day
*"Make what exists better."*

| Employee | Task |
|----------|------|
| **Maya** | Run weekly CRO audit: review one page from the 18-page list, propose copy improvements |
| **Nova** | Run weekly design audit: score one page from the priority list (index → pricing → dashboard → repeat), propose top 3 design improvements with code |
| **Quinn** | Implement any prompt fix identified on Monday, run regression test |
| **Morgan** | Implement top bug fix from Charlie's backlog |
| **Jordan** | Write or improve one email in the sequence library |
| **Taylor** | Competitor check: pricing changes, new features, messaging shifts |

### THURSDAY — Conversion Day
*"Turn visitors into users, users into payers."*

| Employee | Task |
|----------|------|
| **Casey** | Audit upgrade flow: 402 modal → upgrade page → Stripe → pro-welcome. Is every step working? |
| **Riley** | Design next A/B test (if current one has concluded), brief Maya on variant copy |
| **Maya** | Write A/B variant copy based on Riley's brief |
| **Jordan** | Send weekly digest email to free users (nudge toward upgrade) |
| **Charlie** | Run monthly onboarding friction audit (first Thursday of month only) |
| **Harper** | Review Charlie's support report for legal-adjacent complaints (allergen, data, medical) |

### FRIDAY — Report & Plan Day
*"End the week knowing exactly where you stand."*

| Employee | Task |
|----------|------|
| **Alex** | Weekly video performance review: views, shares, follows — what worked? |
| **Sam** | Weekly SEO report: Google Search Console ranking changes, traffic trends |
| **Taylor** | Weekly brand report: mentions, community engagement, partnership pipeline |
| **Casey** | Full monetization report: MRR, conversion, churn, LTV, Stripe links status |
| **Drew** | Weekly product report: shipped, in progress, feedback themes, top priority next week |
| **Charlie** | Weekly support report: volume, resolution rate, bug triage, FAQ updates |
| **Avery** | Weekly infrastructure report: uptime, cold starts, costs, upgrade readiness |
| **Morgan** | Weekly engineering report: errors, Stripe health, completed work, pending items |
| **Quinn** | Weekly AI quality report: test results, prompt changes, model performance |
| **Riley** | Weekly growth report: funnel metrics, test results, referral stats |
| **Jordan** | Weekly email report: open rates, CTR, unsubscribes, sequence health |
| **Maya** | Weekly CRO report: pages audited, changes proposed, A/B test status |
| **Logan** | Weekly partnership report: pipeline status, outreach response rate, attributed revenue |

---

## MONTHLY SCHEDULE (first week of each month)

| Employee | Monthly Task |
|----------|-------------|
| **Taylor** | Full competitor intelligence report (all 7 competitors) |
| **Taylor** | Brand consistency audit (all 18 pages) |
| **Casey** | Review pricing strategy — any signals to raise price or add plans? |
| **Sam** | Full keyword rank check via Google Search Console |
| **Morgan** | Security checklist: JWT secret, rate limits, no secrets in frontend |
| **Quinn** | Model evaluation: is haiku still best, or should Sonnet be tested? |
| **Riley** | Monthly cohort analysis: do users who signed up 30/60/90 days ago convert at different rates? |
| **Drew** | Product roadmap review: ICE re-scoring, backlog pruning, next month priorities |
| **Charlie** | FAQ review: are the top questions from last month answered in the docs? |
| **Avery** | Infrastructure cost vs revenue check: is it time to upgrade Render tier? |
| **Harper** | Full compliance audit: Mia safety (7-item), GDPR checklist, allergen disclaimers, Terms/Privacy accuracy |
| **Finlay** | Full LTV/CAC/payback analysis + pricing strategy memo for Casey |
| **Logan** | Full affiliate pipeline review: top performers, drop inactive, B2B pipeline check |
| **Robin** | Monthly user insight memo: NPS analysis, exit survey breakdown, user interviews, persona updates |
| **Matteo** | Quarterly (every 3 months): localisation readiness audit + market priority update for Drew |

---

## HOW TO RUN A SCHEDULED TASK

When invoking an employee for their scheduled work:

```
/[employee]

It's [day of week]. Please run your [day] schedule.
Context: [any relevant data — e.g. "MRR last week was $X", "we launched X feature"]
```

The employee will:
1. Read their memory file (.agents/memory/[name].md) for active lessons
2. Run the tasks for that day
3. Produce their report in the format defined in their skill file
4. Score their output (1-10) and append a reflection if score < 7
5. Append any new lessons to their memory file

---

## LAUNCH WEEK (when launching a new feature or milestone)

| Day | Action |
|-----|--------|
| L-7 | **Taylor** briefs **Alex** on launch: what's being launched, target audience, key message |
| L-7 | **Drew** confirms feature is specced and **Morgan** has a ship date |
| L-5 | **Jordan** writes launch email, **Taylor** reviews timing and angle |
| L-5 | **Maya** audits all copy on the feature's pages |
| L-3 | **Alex** completes launch video script, **Taylor** approves |
| L-2 | **Riley** sets up tracking for launch metrics (what to measure) |
| L-1 | **Taylor** prepares Reddit/social posts (ready to publish) |
| L-1 | **Casey** confirms all Stripe links work if feature involves pricing |
| L day | **Jordan** sends launch email to all users |
| L day | **Taylor** publishes all social/community posts |
| L day | **Alex** publishes launch video |
| L+3 | **Riley** reports: how many people engaged with the launch? |
| L+7 | **Drew** reports: did the success metric move? |
