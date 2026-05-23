Run the free Mealzy weekly content pipeline. No Pletor credits needed. Text and image posts only. Follow every step in order. Do not skip steps. Do not ask for confirmation between steps — run the full loop automatically.

Five days. Three platforms. 15 posts scheduled in one run.

---

## PLATFORM RULES — read before posting

**LinkedIn:** Never put the URL in the post text. LinkedIn's algorithm buries posts with external links. Remove all URLs from captions. After each LinkedIn post is published, post the URL (https://mealzy.org) as the first comment.

**Facebook:** Same rule. Never put the URL in the post text. Facebook suppresses external links in captions. Post the URL as the first comment after publishing.

**Instagram:** Links in captions are not clickable. Write "link in bio" instead of the URL. The bio on the Mealzy Instagram account must be set to https://mealzy.org.

---

## STEP 1 — Get connected accounts

Call blotato_list_accounts to get the accountId for each platform.

You need the accountId for:
- LinkedIn (platform: "linkedin")
- Facebook (platform: "facebook") — also note the pageId from subaccounts
- Instagram (platform: "instagram")

Save these IDs. You will use them in every post below.

---

## STEP 2 — Calculate this week's dates

Calculate the upcoming dates for each posting day. Use 7pm local time (19:00) and format as ISO 8601 (e.g. 2026-05-26T19:00:00).

- Tuesday = [calculate date]
- Wednesday = [calculate date]
- Thursday = [calculate date]
- Saturday = [calculate date]
- Sunday = [calculate date]

---

## STEP 3 — Score every post before scheduling

Before calling blotato_create_post for any post, score it against this rubric. Maximum 100 points.

**Scoring rubric (text + image posts):**

| Dimension | Points | What to check |
|---|---|---|
| Hook | 25 | Does the first line stop a thumb mid-scroll? Is it specific, not vague? |
| Clarity | 20 | Is the value of Mealzy obvious within 3 seconds of reading? |
| Platform fit | 20 | No URL in LinkedIn/Facebook caption. "Link in bio" on Instagram. Tone matches platform. |
| Engagement trigger | 20 | Does it invite a comment, save, or share? Question posts get full marks automatically. |
| Call to action | 15 | Is there a clear next step (try it, comment, check bio)? |

**Rules:**
- Score must be 80 or above to post
- If under 80, identify the lowest dimension, rewrite just that part, re-score
- Maximum 3 rewrites per post
- After 3 rewrites, post the highest-scoring version anyway
- Show the score next to each post in the Step 4 report

---

## STEP 4 — Schedule all 15 posts

Call blotato_create_post once for each post below. 15 calls total. Every post gets an image.

Image URLs:
- Tuesday (tip): https://mealzy.org/card-tip.svg
- Wednesday (screenshot): https://mealzy.org/card-stat.svg
- Thursday (question): https://mealzy.org/card-question.svg
- Saturday (stat): https://mealzy.org/card-stat.svg
- Sunday (CTA): https://mealzy.org/card-cta.svg

---

### TUESDAY — Tip Post

**LinkedIn** — call blotato_create_post with:
- platform: "linkedin"
- scheduledTime: Tuesday 19:00
- mediaUrls: ["https://mealzy.org/card-tip.svg"]
- text:
"A simple rule that saves most people 45 minutes a week on meal planning:

Plan around 3 proteins, not 7 meals.

Pick chicken, eggs, and lentils (or whatever fits your goals). Build the week around those. Your grocery list shrinks, your decision fatigue drops, and you stop throwing away food on Friday.

Mealzy does this automatically — free to try, no credit card needed.

#nutrition #productivity #mealprep"

→ After posting: add first comment: "Try it free at https://mealzy.org"

---

**Facebook** — call blotato_create_post with:
- platform: "facebook"
- pageId: [from subaccounts]
- scheduledTime: Tuesday 19:00
- mediaUrls: ["https://mealzy.org/card-tip.svg"]
- text:
"Meal planning tip that actually saves time: plan around 3 proteins, not 7 separate meals. Pick your proteins for the week, build around those, and your grocery list basically writes itself. Mealzy does this for you automatically — completely free, no credit card needed.

#mealplanning #mealprep"

→ After posting: add first comment: "Try it free at https://mealzy.org"

---

**Instagram** — call blotato_create_post with:
- platform: "instagram"
- scheduledTime: Tuesday 19:00
- mediaUrls: ["https://mealzy.org/card-tip.svg"]
- text:
"Meal planning hack: pick 3 proteins, build everything else around them. Less waste, shorter grocery list, done faster. Mealzy does this automatically in 30 seconds — link in bio to try it free.

#mealprep #mealplanning #healthyeating #grocerytips #mealzy #nutrition #budgetmeals #cleaneating #fitnessfood #macros"

---

### WEDNESDAY — Screenshot Post

**LinkedIn** — call blotato_create_post with:
- platform: "linkedin"
- scheduledTime: Wednesday 19:00
- mediaUrls: ["https://mealzy.org/card-stat.svg"]
- text:
"This is what a full week of meals looks like when AI plans it for you. Macros hit. Grocery list included. Budget respected. Generated in under 30 seconds. Free, no credit card needed.

#productivity #nutrition #aitools"

→ After posting: add first comment: "Try it free at https://mealzy.org"

---

**Facebook** — call blotato_create_post with:
- platform: "facebook"
- pageId: [from subaccounts]
- scheduledTime: Wednesday 19:00
- mediaUrls: ["https://mealzy.org/card-stat.svg"]
- text:
"This is what Mealzy generates for you — a full week of meals, the grocery list, and all the macros. All in 30 seconds. Completely free, no credit card.

#mealplanning #mealprep"

→ After posting: add first comment: "Try it free at https://mealzy.org"

---

**Instagram** — call blotato_create_post with:
- platform: "instagram"
- scheduledTime: Wednesday 19:00
- mediaUrls: ["https://mealzy.org/card-stat.svg"]
- text:
"Full week of meals, grocery list, macros — 30 seconds. Free. Link in bio.

#mealplan #mealprep #mealplanning #grocerylist #macros #healthyeating #mealzy #aitools #weeklymeals #budgetmeals"

---

### THURSDAY — Question Post

**LinkedIn** — call blotato_create_post with:
- platform: "linkedin"
- scheduledTime: Thursday 19:00
- mediaUrls: ["https://mealzy.org/card-question.svg"]
- text:
"Quick question for anyone who meal preps or tracks nutrition:

How long does planning your meals for the week actually take you?

I've seen everything from 10 minutes to 3 hours depending on how people do it. Curious where most people land.

#nutrition #health #productivity"

→ After posting: add first comment: "If it takes more than 5 minutes, try https://mealzy.org — it does it in 30 seconds, free."

---

**Facebook** — call blotato_create_post with:
- platform: "facebook"
- pageId: [from subaccounts]
- scheduledTime: Thursday 19:00
- mediaUrls: ["https://mealzy.org/card-question.svg"]
- text:
"Honest question — how long does it take you to plan meals for the week? Drop your answer in the comments, I'm genuinely curious how different people handle it.

#mealplanning #mealprep"

→ After posting: add first comment: "If it takes more than a few minutes, try https://mealzy.org — free and takes 30 seconds."

---

**Instagram** — call blotato_create_post with:
- platform: "instagram"
- scheduledTime: Thursday 19:00
- mediaUrls: ["https://mealzy.org/card-question.svg"]
- text:
"How long does your weekly meal planning actually take? Comment below. If it's more than 5 minutes, check the link in bio.

#mealplanning #mealprep #healthyeating #mealzy #nutrition #weeklymeals #grocerytips #fitlife #cleaneating #macros"

---

### SATURDAY — Stat Post

**LinkedIn** — call blotato_create_post with:
- platform: "linkedin"
- scheduledTime: Saturday 19:00
- mediaUrls: ["https://mealzy.org/card-stat.svg"]
- text:
"The average person makes over 200 food decisions a day. Most of them are low-stakes — but meal planning is one decision that compounds. Get it right once on Sunday and you remove 21 smaller decisions for the rest of the week.

That's the actual value of meal planning. Not nutrition. Decision removal.

#productivity #health #nutrition"

→ After posting: add first comment: "Mealzy removes all of them in 30 seconds — free at https://mealzy.org"

---

**Facebook** — call blotato_create_post with:
- platform: "facebook"
- pageId: [from subaccounts]
- scheduledTime: Saturday 19:00
- mediaUrls: ["https://mealzy.org/card-stat.svg"]
- text:
"Did you know the average person makes over 200 food decisions a day? Meal planning once a week removes at least 21 of them. It's one of the highest-ROI habits you can build.

#mealplanning #healthyeating"

→ After posting: add first comment: "Mealzy does it in 30 seconds, completely free — https://mealzy.org"

---

**Instagram** — call blotato_create_post with:
- platform: "instagram"
- scheduledTime: Saturday 19:00
- mediaUrls: ["https://mealzy.org/card-stat.svg"]
- text:
"200+ food decisions per day. Meal planning removes 21 of them. Takes 30 seconds with the app in our bio.

#mealplanning #nutrition #mealprep #healthyeating #mealzy #aitools #macros #grocerytips #fitlife #weeklymeals"

---

### SUNDAY — CTA Post

**LinkedIn** — call blotato_create_post with:
- platform: "linkedin"
- scheduledTime: Sunday 19:00
- mediaUrls: ["https://mealzy.org/card-cta.svg"]
- text:
"If you're planning meals manually this Sunday, try this instead: enter your calorie goal and budget, and let it build the week for you. Takes 30 seconds. Free. No credit card. No account required to try it.

If it saves you time, great. If not, you've lost 30 seconds.

#productivity #health #mealprep"

→ After posting: add first comment: "https://mealzy.org"

---

**Facebook** — call blotato_create_post with:
- platform: "facebook"
- pageId: [from subaccounts]
- scheduledTime: Sunday 19:00
- mediaUrls: ["https://mealzy.org/card-cta.svg"]
- text:
"Sunday meal planning reminder: you don't have to do this by hand anymore. Mealzy builds your full week in 30 seconds — meals, macros, grocery list. Completely free.

#mealplanning #mealprep"

→ After posting: add first comment: "Try it here — https://mealzy.org"

---

**Instagram** — call blotato_create_post with:
- platform: "instagram"
- scheduledTime: Sunday 19:00
- mediaUrls: ["https://mealzy.org/card-cta.svg"]
- text:
"Sunday reminder: stop planning meals by hand. 30 seconds and your whole week is sorted. Link in bio — it's free.

#mealplanning #mealprep #sundayreset #mealzy #healthyeating #grocerylist #macros #weeklymeals #mealplanner #aitools"

---

## STEP 5 — Report back

When all 15 blotato_create_post calls are confirmed, report a table like this:

| Day | Platform | Score | Rewrites | Posted |
|---|---|---|---|---|
| Tuesday | LinkedIn | 88 | 0 | ✅ |
| Tuesday | Facebook | 76→83 | 1 | ✅ |
| ... | ... | ... | ... | ... |

Then list any posts that failed and why.

Then stop. Done until next week.
