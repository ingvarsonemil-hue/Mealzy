# Mealzy — Revenue Model & Traffic Calculator

## Target: $10,000 MRR

---

## Subscriber Math

### Pure plan scenarios to hit $10k/month

| Plan      | Price   | Subscribers needed |
|-----------|---------|-------------------|
| Pro only  | $8/mo   | 1,250             |
| Family only | $16/mo | 625             |

### Mixed scenarios

| Scenario | Pro subs × $8 | Family subs × $16 | MRR     | Gap to $10k |
|----------|--------------|-------------------|---------|-------------|
| A        | 800 × $8 = $6,400 | 225 × $16 = $3,600 | **$10,000** | ✅ |
| B        | 500 × $8 = $4,000 | 375 × $16 = $6,000 | **$10,000** | ✅ |
| Realistic blend (70/30) | 875 × $8 = $7,000 | 187 × $16 = $3,000 | **$10,000** | ✅ |

*Note: Task spec Mixed A (800 Pro + 150 Family = $8,800) and Mixed B (500 Pro + 312 Family = $8,992) don't reach $10k — corrected above.*

---

## Traffic Required

### Assumptions
- Visitor → Signup: what % of unique visitors create a free account
- Free → Paid: what % of free accounts upgrade to Pro/Family
- Revenue per paid user: blended $9.60/month (80% Pro at $8, 20% Family at $16)

### To reach $10k MRR you need: **1,042 paying users** (at $9.60 blended ARPU)

| Scenario    | Visitor→Signup | Free→Paid | Free users needed | Monthly visitors needed |
|-------------|---------------|-----------|-------------------|------------------------|
| Conservative | 2%           | 3%        | 34,733            | **1,736,667**          |
| Realistic    | 4%           | 6%        | 17,367            | **434,167**            |
| Aggressive   | 7%           | 12%       | 8,683             | **124,043**            |

### Key insight: The bottleneck is free→paid, not traffic
- At 2% free→paid, even 500k monthly visitors only = ~$3,840 MRR
- Getting free→paid from 3% → 6% cuts required traffic in HALF
- The PDF export feature + abandonment paywall directly attacks this metric

---

## Churn Impact

Assuming 5% monthly churn (industry average for SaaS):
- At 1,042 paying users: lose ~52/month, need to acquire 52+ net new each month to stay flat
- At 3% churn (with habit-forming product): need only 31 net new/month
- **Building the weekly re-engagement loop is worth more than any ad spend**

---

## Fastest Path to $10k MRR (90-day plan)

### Month 1: Get to $500 MRR
- Ship PDF export (biggest free→paid lever)
- Ship /upgrade.html with real testimonials
- Launch on Product Hunt + Reddit r/nutrition, r/MealPrepSunday
- Target: 50 paying users

### Month 2: Get to $2,500 MRR
- Influencer partnerships (food/fitness micro-influencers, 10k–100k followers)
- Referral program live (give referrers 1 bonus plan per referred signup)
- Weekly re-engagement emails
- Target: 260 paying users

### Month 3: Get to $10k MRR
- At this point: ~1,042 paying users
- Requires ~17,000 free signups total at 6% conversion
- Requires ~425,000 total visitors at 4% signup rate
- Viral coefficient from referrals needs to be > 0.3 (each user brings 0.3 more)

---

## Current Status (May 2026)
- Free plan: 3 plans/month
- Pro: $8/month (unlimited plans, PDF export, AI coach)
- Annual Pro: $62/year ($5.17/month — saves 35% vs monthly)
- Family: $16/month (coming soon — waitlist)
- Referral: 1 bonus plan per referred signup (in-memory, not persisted — fix this)

## Critical Metric to Watch Weekly
**Free → Paid conversion rate.** Everything else is a lever to move this number.
At 3%: $10k requires 1.7M visitors/month (not achievable organically)
At 12%: $10k requires 124k visitors/month (achievable with good SEO + virality)
