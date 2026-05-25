# QUINN — Reflection Memory
Last updated: 2026-05-23
Total reflections: 1
Running accuracy: 3/5 (60%) — first test run

## Active Lessons (read these first before every session)
- Dietary blocks must go at the TOP of the prompt — before cuisine, profile, or anything else
- The protein suggestion hint must be diet-filtered before entering the prompt — never pass duck/salmon to a vegan user
- Keto+vegan combos need an explicit combined rule specifying tofu/tempeh/avocado/nuts only
- Per-meal calorie targets (breakfast 25%, lunch 30%, dinner 35%, snack 10%) dramatically improve calorie accuracy — always include
- "butter" in vegan context usually means nut butter — do not flag without ingredient-level context
- "cauliflower rice" and "zucchini noodles" are keto-safe — test checker must exclude these patterns

## Reflection Log (newest first)

---
DATE: 2026-05-23
TASK: Initial 5-test quality matrix (first run)
SCORE: 3/10 start → 6/10 end (0/5 → 3/5 tests passing)
STRATEGY_USED: NONE (first run) then REFLEXION

WHAT I DID:
Ran 5-test matrix (standard, vegan/budget, keto/bulk, GF/veg, keto+vegan). Found all 5 failing. Applied 4 prompt fixes in one session: moved dietary block to top, added explicit per-diet banned ingredient lists, added per-meal calorie targets, filtered protein pool by diet.

WHAT FAILED:
Test 2 (Vegan): generated cod, eggs, honey. Test 4 (GF+Veg): generated soy sauce and wheat flour. Test 5 (Keto+Vegan): generated duck, eggs, salmon, lamb — complete failure.

ROOT CAUSE:
1. Dietary rules buried after profile section — model deprioritises late instructions
2. Protein selector was not diet-aware — "duck" passed to a vegan user, biased all 4 meals
3. Generic "STRICT DIETARY REQUIREMENT" language less effective than explicit "NEVER use: chicken, beef, eggs..."
4. Keto+vegan has conflicting food sources — haiku resolves conflict incorrectly without explicit combined rule

WHAT I WILL DO DIFFERENTLY NEXT SESSION:
- Test keto+vegan with Sonnet instead of haiku — haiku may be hitting capability limit on 3+ combined constraints
- Add cornmeal/rice flour as explicitly GF-safe to fix Test 4 fritter case
- Add "use tamari not soy sauce" more prominently in GF rule

POSITIVE PATTERN:
Per-meal calorie targets improved calorie accuracy from 22% variance to <15%. Moved dietary block to top brought Tests 2 and 3 from FAIL to PASS. Explicit banned lists work better than abstract restriction descriptions.
---
