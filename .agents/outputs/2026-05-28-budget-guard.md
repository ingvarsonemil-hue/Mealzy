# budget-guard — 2026-05-28 (Thursday)

# BUDGET GUARD — Thursday, 2026-05-28

## Thursday Task Assessment

Checking my SCHEDULE section for Thursday tasks:

> **Wednesday (weekly):**
> - Implement one budget prompt fix if failures found on Monday
> - Re-run failing tests to confirm fix works
> - Brief Morgan on any server.js changes needed

Thursday is not explicitly listed in my schedule. However, since this is my first run (memory shows "No memory yet — first run"), I need to establish baseline compliance before the Friday report.

Given today is Thursday and I have no Monday test results to reference, I'll run the budget compliance audit now to establish baseline data for Friday's report.

---

## BUDGET COMPLIANCE BASELINE AUDIT — 2026-05-28

### Live Data Analysis

From TEAM.md, I have one real test plan to analyze:

**Test profile:** standard profile, $80/week budget, 2000kcal

```
weeklyBudget    = $80
dailyBudget     = $80 / 7 = $11.43
perMealBudget   = $80 / 7 / 4 = $2.86
```

**Actual plan returned:**
- Total reported: $11.43/day
- breakfast: $2.15 (75% of ceiling ✓)
- lunch: $2.60 (91% of ceiling ✓)
- dinner: $2.85 (100% of ceiling ⚠️)
- snack: $0.83 (29% of ceiling ✓)

**Sum check:** $2.15 + $2.60 + $2.85 + $0.83 = **$8.43**

### CRITICAL FINDING: Math Mismatch Detected

| Field | Reported | Calculated |
|-------|----------|------------|
| totalCost (daily) | $11.43 | $8.43 |
| Discrepancy | — | **$3.00 overstated** |

The `totalCost` field ($11.43) does NOT match the sum of individual `estimatedCost` fields ($8.43). This is a **$3.00 discrepancy** — well outside the ±$1 tolerance.

**Root cause hypothesis:** The model may be fabricating the `totalCost` summary field independently rather than summing the meal costs. Alternatively, the $11.43 figure is the `dailyBudget` ceiling being echoed back rather than actual calculated cost.

---

## BUDGET INTEGRITY CHECK — Current Plan

### Hard Limit Compliance

| Rule | Status | Notes |
|------|--------|-------|
| totalCost ≤ weeklyBudget | ✓ PASS | $11.43/day × 7 = $80.01 (at ceiling) |
| Sum matches totalCost (±$1) | ✗ FAIL | $8.43 sum vs $11.43 reported = $3.00 gap |
| No meal > perMealBudget × 1.20 | ✓ PASS | Max meal $2.85, ceiling $3.43 (120% of $2.86) |

### Soft Rule Compliance

| Rule | Status | Notes |
|------|--------|-------|
| Meals 10-15% under ceiling | ⚠️ MARGINAL | Dinner at 100% of ceiling — no buffer |
| 3+ meals within 5% of ceiling | ✓ PASS | Only 1 meal (dinner) is tight |
| Premium proteins in tight budgets | ✓ PASS | No premium proteins present |

---

## IDENTIFIED FAILURE: totalCost Fabrication

**Severity:** High — this is a known failure mode from my skill file

**Evidence:** 
- Model reported totalCost: $11.43
- Actual sum of estimatedCost fields: $8.43
- Gap: $3.00 (35% inflation)

**Impact:** 
- Users see inflated daily cost, may think plans are more expensive than they are
- If model inflates in the opposite direction (sums higher than reported total), users get budget-busting plans that *appear* compliant
- Breaks trust metric — budget is #2 reason users choose Mealzy

---

## RECOMMENDED PROMPT FIX

**Current state (assumed):** The prompt instructs the model to include `totalCost` but doesn't enforce arithmetic integrity.

**Proposed addition to meal plan generation prompt in server.js:**

```
COST CALCULATION RULES (mandatory):
1. Calculate each meal's estimatedCost individually based on ingredients
2. The totalCost field MUST equal the exact arithmetic sum of all estimatedCost fields
3. Before outputting, verify: breakfast + lunch + dinner + snack = totalCost
4. If the sum exceeds ${currency} ${dailyBudget}, reduce portion sizes or substitute cheaper ingredients until it fits
5. Never echo back the budget ceiling as totalCost — report actual calculated cost
```

**Placement:** This block should appear BEFORE cuisine/protein instructions, immediately after the budget ceiling statement.

**server.js line reference needed:** Request Morgan to identify the exact line where the meal plan prompt is constructed so I can verify placement.

---

## HANDOFF TO MORGAN

**Subject: Budget math integrity fix needed in server.js**

Morgan,

Found a totalCost fabrication issue in today's audit. The model is reporting $11.43 daily total but meal costs sum to $8.43 — a $3.00 gap.

**Request:**
1. Locate the meal plan generation prompt in server.js
2. Add the COST CALCULATION RULES block (above) immediately after the budget ceiling statement
3. Confirm the prompt position — budget constraints must appear before cuisine/protein seed instructions

I'll re-test after deployment to confirm the fix works.

— Budget Guard

---

## HANDOFF TO QUINN

**Subject: Cost math discrepancy in test plan**

Quinn,

Cross-referencing with your quality matrix — if you're seeing totalCost fields that look correct but individual meal costs don't add up, that's the same bug I found today.

**Finding:** $3.00 gap between reported total ($11.43) and actual sum ($8.43) in the live test plan from TEAM.md.

May affect your quality scores if you're using totalCost for nutrition-per-dollar calculations.

— Budget Guard

---

## FRIDAY REPORT PREVIEW (partial — will complete Friday)

```
BUDGET COMPLIANCE REPORT — Week of 2026-05-26

TEST RESULTS:
- $40/week tight:        PENDING — Monday test
- $60/week vegetarian:   PENDING — Monday test
- $80/week gluten-free:  PENDING — Monday test
- $100/week standard:    PENDING — Monday test
- $150/week keto:        PENDING — Monday test

Pass rate: [TBD — first run, no Monday baseline]

BASELINE AUDIT (live data from TEAM.md):
- $80/week standard:     FAIL — totalCost/sum mismatch ($3.00 gap)

MATH INTEGRITY:
- estimatedCost sum vs totalCost mismatches: 1 found (live test plan)

PROMPT CHANGES MADE:
- None yet — proposed fix pending Morgan deployment

NEXT WEEK PRIORITY:
- Run full 5-scenario test matrix Monday
- Verify totalCost sum fix after Morgan deploys
```

---

## MEMORY UPDATE

- **2026-05-28 (first run):** Baseline audit found totalCost fabrication — model reports $11.43 but meal sum is $8.43 ($3.00 gap, 35% inflation)
- **Root cause:** Model likely echoing budget ceiling or generating summary independently of meal costs
- **Fix proposed:** Add COST CALCULATION RULES block to prompt requiring arithmetic verification before output
- **Handoff:** Briefed Morgan for server.js change, notified Quinn of quality matrix impact
- **Next action:** Full 5-scenario test matrix Monday 2026-06-02, re-test $80/week scenario after prompt fix deployed