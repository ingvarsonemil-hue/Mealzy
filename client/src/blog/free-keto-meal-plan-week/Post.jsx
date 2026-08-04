import * as React from 'react';
import BlogArticleShell from '@/blog/BlogArticleShell';
import BlogFaq from '@/blog/BlogFaq';
import BlogCta from '@/blog/BlogCta';
import MealDayCard from '@/blog/MealDayCard';
import ProteinList from '@/blog/ProteinList';
import GroceryCategory from '@/blog/GroceryCategory';

/* PAGE COPY — copied verbatim from public/blog/free-keto-meal-plan-week.html.
 * Do not rewrite, reword, or "improve" any sentence here without sign-off. */

const DAYS = [
  { day: 'Monday', total: 'Daily Total: 1,380 kcal, 11g net carbs', meals: [
    { label: 'Breakfast', text: 'Scrambled eggs with avocado and butter — 380 kcal, 3g net carbs' },
    { label: 'Lunch', text: 'Tuna lettuce wraps with mayo and cheese — 420 kcal, 2g net carbs' },
    { label: 'Dinner', text: 'Chicken thigh with roasted broccoli and garlic butter — 580 kcal, 6g net carbs' }
  ] },
  { day: 'Tuesday', total: 'Daily Total: 1,450 kcal, 9g net carbs', meals: [
    { label: 'Breakfast', text: 'Bacon and cheese omelette with spinach — 420 kcal, 4g net carbs' },
    { label: 'Lunch', text: 'Salmon with asparagus and lemon butter — 480 kcal, 3g net carbs' },
    { label: 'Dinner', text: 'Beef burger with cheddar, lettuce, and mayo — 550 kcal, 2g net carbs' }
  ] },
  { day: 'Wednesday', total: 'Daily Total: 1,420 kcal, 7g net carbs', meals: [
    { label: 'Breakfast', text: 'Smoked salmon and cream cheese with avocado — 380 kcal, 2g net carbs' },
    { label: 'Lunch', text: 'Chicken salad with mayo and celery — 420 kcal, 4g net carbs' },
    { label: 'Dinner', text: 'Ribeye steak with garlic butter and sautéed greens — 620 kcal, 1g net carbs' }
  ] },
  { day: 'Thursday', total: 'Daily Total: 1,380 kcal, 12g net carbs', meals: [
    { label: 'Breakfast', text: 'Eggs in butter with spinach and cheese — 390 kcal, 3g net carbs' },
    { label: 'Lunch', text: 'Tuna mayo salad with celery — 410 kcal, 3g net carbs' },
    { label: 'Dinner', text: 'Pork chops with Brussels sprouts and bacon — 580 kcal, 6g net carbs' }
  ] },
  { day: 'Friday', total: 'Daily Total: 1,390 kcal, 10g net carbs', meals: [
    { label: 'Breakfast', text: 'Steak and eggs with cheddar and avocado — 450 kcal, 2g net carbs' },
    { label: 'Lunch', text: 'Sardines with avocado and olive oil — 400 kcal, 3g net carbs' },
    { label: 'Dinner', text: 'Chicken thigh with cauliflower mash and butter — 540 kcal, 5g net carbs' }
  ] },
  { day: 'Saturday', total: 'Daily Total: 1,460 kcal, 10g net carbs', meals: [
    { label: 'Breakfast', text: 'Bacon wrapped in cheese with avocado — 420 kcal, 1g net carbs' },
    { label: 'Lunch', text: 'Crab salad with mayo and cucumber — 440 kcal, 2g net carbs' },
    { label: 'Dinner', text: 'Lamb chops with green beans and garlic butter — 600 kcal, 7g net carbs' }
  ] },
  { day: 'Sunday', total: 'Daily Total: 1,380 kcal, 9g net carbs', meals: [
    { label: 'Breakfast', text: 'Smoked mackerel with avocado and olive oil — 380 kcal, 3g net carbs' },
    { label: 'Lunch', text: 'Beef and broccoli with soy sauce and sesame oil — 450 kcal, 4g net carbs' },
    { label: 'Dinner', text: 'Pork belly with creamed spinach — 550 kcal, 2g net carbs' }
  ] }
];

const PROTEINS = [
  { name: 'Eggs', meta: '~$0.30/egg (6g protein, 0g carbs)' },
  { name: 'Chicken thighs', meta: '~$0.60/serving (25g protein, 0g carbs)' },
  { name: 'Salmon', meta: '~$1.80/serving (25g protein, 0g carbs)' },
  { name: 'Beef mince', meta: '~$0.80/serving (20g protein, 0g carbs)' },
  { name: 'Tuna (canned)', meta: '~$0.50/serving (20g protein, 0g carbs)' },
  { name: 'Pork chops', meta: '~$1.00/serving (26g protein, 0g carbs)' },
  { name: 'Cheddar cheese', meta: '~$0.40/serving (7g protein, 0.4g carbs)' }
];

const FAQS = [
  { q: 'Is it hard to get enough protein on keto?', a: "No — eggs, meat, fish, and dairy cover it easily. Hitting 80–120g protein per day on keto is entirely achievable with chicken thighs, salmon, beef, and eggs. Protein is satiating and doesn't spike blood sugar." },
  { q: 'How much does a week of keto meals cost?', a: '$50–80 depending on location and whether you buy organic or grass-fed. This plan is designed to stay under $70 per week using budget-friendly proteins like eggs, chicken thighs, and canned tuna.' },
  { q: 'What are net carbs?', a: "Net carbs = total carbohydrates minus fiber. You subtract fiber because your body doesn't digest it, so it doesn't raise blood sugar. This is why low-carb vegetables like broccoli are keto-friendly despite containing carbs." },
  { q: 'Does Mealzy support keto meal planning?', a: 'Yes — select keto as your dietary preference and every generated meal respects strict carb limits. Mealzy enforces under 25g net carbs per day and generates budget-friendly, calorie-accurate plans.' },
  { q: 'What if I miss carbs when starting keto?', a: "Keto adaptation takes 2–3 weeks. You'll feel tired initially (the 'keto flu'), but energy returns once your body burns fat efficiently. Tips: drink water, electrolyte salt, eat enough fat, and give it 3 weeks before deciding." }
];

export default function Post() {
  return (
    <BlogArticleShell title="Free 7-Day Keto Meal Plan With Grocery List" meta="Published June 16, 2026 · 10 min read">
      <p>The hardest part of keto isn't giving up carbs — it's planning meals that stay under 20g net carbs without eating boring chicken and broccoli every day. This 7-day plan solves that. Every day has breakfast, lunch, and dinner with net carb counts and calorie totals. At the bottom: a full grocery list. And if you want a plan customized to your exact calorie goal and carb limit, Mealzy generates one in under 1 minute — free.</p>

      <h2>Your Free 7-Day Keto Meal Plan</h2>
      {DAYS.map((d) => (
        <MealDayCard key={d.day} day={d.day} meals={d.meals} total={d.total} />
      ))}
      <p><strong>Weekly Average: 1,408 kcal and 9.7g net carbs per day.</strong> All meals stay well under the 20g keto threshold, putting you safely in ketosis. Adjust portions up or down to hit your target calories — the carb counts won't change meaningfully.</p>

      <h2>Keto-Friendly Protein Sources That Work</h2>
      <p>Keto is a high-fat, moderate-protein diet. These proteins are staples because they're nutrient-dense, satiating, and keto-compatible. No hidden carbs here.</p>
      <ProteinList items={PROTEINS} />
      <p>This meal plan uses eggs, chicken, beef, pork, and fish as primary protein sources. Combined with fat (butter, olive oil, avocado, cheese), you're hitting 100–130g protein per day easily. The cost? Under $70 per week for all 21 meals. That's about $3.30 per meal.</p>

      <h2>Weekly Grocery List</h2>
      <p>Everything you need to make this plan, grouped by section so you can navigate the store efficiently.</p>

      <GroceryCategory heading="Meat & Seafood" items={[
        'Chicken thighs (3 lbs) — $5.50',
        'Salmon fillet (1.5 lbs) — $9.00',
        'Ground beef (2 lbs) — $8.00',
        'Pork chops (4 chops) — $6.00',
        'Ribeye steak (10 oz) — $8.50',
        'Bacon (1 pack) — $4.50',
        'Canned tuna (3 cans) — $3.00',
        'Sardines (2 cans) — $3.50',
        'Smoked salmon (4 oz) — $4.00',
        'Lamb chops (8 oz) — $5.50',
        'Pork belly (8 oz) — $4.50',
        'Smoked mackerel (8 oz) — $3.50'
      ]} />
      <GroceryCategory heading="Dairy & Eggs" items={[
        'Eggs (2 dozen) — $5.00',
        'Cheddar cheese (1 block) — $3.50',
        'Cream cheese (8 oz) — $2.50',
        'Butter (1 lb) — $3.50',
        'Sour cream (small) — $2.00'
      ]} />
      <GroceryCategory heading="Vegetables (Low-Carb Only)" items={[
        'Broccoli (2 heads) — $3.00',
        'Spinach (1 bag) — $2.50',
        'Avocados (4) — $4.00',
        'Brussels sprouts (1 lb) — $3.00',
        'Asparagus (1 bunch) — $2.50',
        'Green beans (1 lb) — $2.50',
        'Lettuce (2 heads) — $2.00',
        'Celery (1 bunch) — $1.50',
        'Cucumbers (2) — $1.50',
        'Cauliflower (1 head) — $2.50'
      ]} />
      <GroceryCategory heading="Pantry & Oils" items={[
        'Olive oil (if needed) — $6.00',
        'Mayo (large jar) — $3.50',
        'Soy sauce — $2.00',
        'Sesame oil — $3.50',
        'Lemon juice — $1.50',
        'Garlic — $1.00'
      ]} />
      <p><strong>Estimated Total Cost: $68.50</strong> (assumes you have salt, pepper, and basic spices at home).</p>

      <h2>How to Customize This Plan for Your Calorie Goal</h2>
      <p>This plan averages 1,408 kcal per day. Keto is a satiation diet — you'll likely eat less naturally — but if you need to adjust, it's simple: add or reduce portion sizes.</p>
      <p><strong>If you need 1,200 kcal per day:</strong> Reduce meat portions by about 15%. Skip the extra cheese on a few days. A 15% reduction gets you to roughly 1,196 kcal. Carb counts stay the same.</p>
      <p><strong>If you need 1,600 kcal per day:</strong> Add extra fat (oil, butter, mayo) to existing meals. Increase meat portions slightly. Add a keto snack like cheese or almonds. Most of your extra calories will come from fat, which won't affect net carbs.</p>
      <p><strong>If you need 2,000+ kcal per day:</strong> Add fatty cuts (salmon, pork belly), extra oil, and full-fat dairy. Snack on nuts, cheese, and macadamia nuts liberally. Keto meals are naturally calorie-dense, so hitting high targets is easy.</p>
      <p>But here's the thing: if custom tailoring feels overwhelming, that's exactly what Mealzy does for you. Enter your exact calorie goal, dietary preference (keto), weekly budget, and any foods you dislike — Mealzy generates a fully customized week in under 1 minute. You get a plan that fits your body, your budget, and your taste. Free to try, no credit card needed.</p>

      <h2>Tips for Sticking to a Keto Meal Plan</h2>
      <p><strong>1. Buy fattier cuts of meat on purpose.</strong> Chicken thighs instead of breasts. Salmon instead of cod. Ground beef instead of lean. Fat is where the flavor lives on keto, and it keeps you full longer. Don't eat "diet chicken" — that's not keto.</p>
      <p><strong>2. Keep eggs and canned fish on hand.</strong> When you're tired or don't have time to cook, scrambled eggs take 3 minutes and deliver 30g protein. Canned tuna is ready to eat. These are your safety net — they keep you on track without effort.</p>
      <p><strong>3. Accept the first two weeks will feel hard.</strong> Keto flu is real. Headaches, fatigue, cravings — they fade by week three once your body adapts. Drink water, eat enough salt, and power through. The payoff is appetite control and steady energy.</p>
      <p><strong>4. Use Mealzy's swap feature if you dislike a meal.</strong> The plan is a guide, not a cage. If you hate cauliflower mash, swap it for zucchini or butter. The regenerated plan maintains your carb and calorie targets.</p>

      <h2>Frequently Asked Questions</h2>
      <BlogFaq items={FAQS} />

      <BlogCta
        lead="This plan is a starting point."
        body="For a plan built around your exact calorie goal, carb limit, and food preferences — Mealzy generates it in under 1 minute. Free to try, no credit card, no sign up needed for the demo."
      />

      <p>Keto doesn't have to be boring. You just need a plan. This one works — it's tested, budget-friendly, keeps carbs low, and uses ingredients you can find in any regular grocery store. Print it, follow it, or use it as a template for your own ideas. And when you're ready for a fully customized plan, Mealzy will generate one for you in under 1 minute.</p>
    </BlogArticleShell>
  );
}
