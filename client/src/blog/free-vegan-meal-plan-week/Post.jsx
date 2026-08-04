import * as React from 'react';
import BlogArticleShell from '@/blog/BlogArticleShell';
import BlogFaq from '@/blog/BlogFaq';
import BlogCta from '@/blog/BlogCta';
import MealDayCard from '@/blog/MealDayCard';
import ProteinList from '@/blog/ProteinList';
import GroceryCategory from '@/blog/GroceryCategory';

/* PAGE COPY — copied verbatim from public/blog/free-vegan-meal-plan-week.html.
 * Do not rewrite, reword, or "improve" any sentence here without sign-off. */

const DAYS = [
  { day: 'Monday', total: 'Daily Total: 1,550 kcal', meals: [
    { label: 'Breakfast', text: 'Overnight oats with banana and almond butter — 380 kcal' },
    { label: 'Lunch', text: 'Chickpea and spinach wrap with hummus — 520 kcal' },
    { label: 'Dinner', text: 'Lentil dal with basmati rice — 650 kcal' }
  ] },
  { day: 'Tuesday', total: 'Daily Total: 1,520 kcal', meals: [
    { label: 'Breakfast', text: 'Smoothie bowl with granola and mixed berries — 420 kcal' },
    { label: 'Lunch', text: 'Black bean tacos with avocado and salsa — 480 kcal' },
    { label: 'Dinner', text: 'Tofu stir-fry with broccoli and rice noodles — 620 kcal' }
  ] },
  { day: 'Wednesday', total: 'Daily Total: 1,510 kcal', meals: [
    { label: 'Breakfast', text: 'Avocado toast on wholemeal bread with tomato — 410 kcal' },
    { label: 'Lunch', text: 'Lentil and vegetable soup with whole grain bread — 490 kcal' },
    { label: 'Dinner', text: 'Chickpea curry with coconut milk and brown rice — 610 kcal' }
  ] },
  { day: 'Thursday', total: 'Daily Total: 1,540 kcal', meals: [
    { label: 'Breakfast', text: 'Tofu scramble with mushrooms and wholemeal toast — 390 kcal' },
    { label: 'Lunch', text: 'Hummus and veggie wrap with cucumber and bell pepper — 510 kcal' },
    { label: 'Dinner', text: 'Black bean chili with kidney beans and brown rice — 640 kcal' }
  ] },
  { day: 'Friday', total: 'Daily Total: 1,530 kcal', meals: [
    { label: 'Breakfast', text: 'Chia pudding with coconut milk and fresh berries — 400 kcal' },
    { label: 'Lunch', text: 'Falafel wrap with tahini sauce and mixed greens — 530 kcal' },
    { label: 'Dinner', text: 'Tempeh stir-fry with broccoli, carrots, and quinoa — 600 kcal' }
  ] },
  { day: 'Saturday', total: 'Daily Total: 1,540 kcal', meals: [
    { label: 'Breakfast', text: 'Vegan pancakes with maple syrup and berries — 420 kcal' },
    { label: 'Lunch', text: 'Buddha bowl with tofu, kale, sweet potato, and tahini dressing — 500 kcal' },
    { label: 'Dinner', text: 'Lentil and vegetable pasta with marinara sauce — 620 kcal' }
  ] },
  { day: 'Sunday', total: 'Daily Total: 1,540 kcal', meals: [
    { label: 'Breakfast', text: 'Granola with coconut yogurt and fresh fruit — 430 kcal' },
    { label: 'Lunch', text: 'Chickpea salad wrap with beet hummus — 510 kcal' },
    { label: 'Dinner', text: 'Black bean and sweet potato stew with greens — 600 kcal' }
  ] }
];

const PROTEINS = [
  { name: 'Lentils', meta: '~$0.40/serving (18g protein)' },
  { name: 'Chickpeas', meta: '~$0.45/serving (15g protein)' },
  { name: 'Black beans', meta: '~$0.35/serving (15g protein)' },
  { name: 'Tofu', meta: '~$0.80/serving (20g protein)' },
  { name: 'Tempeh', meta: '~$1.20/serving (19g protein)' },
  { name: 'Edamame', meta: '~$0.90/serving (11g protein)' },
  { name: 'Hemp seeds', meta: '~$0.60/serving (9g protein)' }
];

const FAQS = [
  { q: 'Is it hard to get enough protein on a vegan meal plan?', a: "No — lentils, tofu, tempeh, and chickpeas cover it easily with planning. Hitting 50–80g protein per day on a vegan diet is entirely achievable and doesn't require obscure ingredients or expensive supplements." },
  { q: 'How much does a week of vegan meals cost?', a: '$40–70 depending on location and whether you buy organic. This plan is designed to stay under $60 per week using budget-friendly proteins like lentils, beans, and tofu.' },
  { q: 'Can I meal prep this plan on a Sunday?', a: 'Yes — cook grains and legumes in bulk and store in the fridge for up to 5 days. Batch cooking rice, lentils, and chickpeas on Sunday takes about 45 minutes and covers breakfast and lunch for most of the week.' },
  { q: 'Does Mealzy support vegan meal planning?', a: 'Yes — select vegan as your dietary preference and every generated meal is strictly vegan. No animal products in any form. Mealzy enforces this constraint and still generates budget-friendly, calorie-accurate plans.' },
  { q: "What if I don't like one of the meals in my plan?", a: "Use Mealzy's swap feature — tap any meal to replace it while keeping the rest of the week intact. The plan re-optimizes to maintain your calorie target and budget." }
];

export default function Post() {
  return (
    <BlogArticleShell title="Free Vegan Meal Plan for the Week — 7 Days + Grocery List" meta="Published June 16, 2026 · 10 min read">
      <p>The hardest part of eating vegan isn't the diet — it's planning meals that hit your protein targets without spending a fortune or eating the same three things on rotation. This 7-day plan solves that. Every day has breakfast, lunch, and dinner with calorie totals and vegan protein sources called out. At the bottom: a full grocery list you can take straight to the store. And if you want a plan customized to your exact calorie goal and budget, Mealzy generates one in under 1 minute — free.</p>

      <h2>Your Free 7-Day Vegan Meal Plan</h2>
      {DAYS.map((d) => (
        <MealDayCard key={d.day} day={d.day} meals={d.meals} total={d.total} />
      ))}
      <p><strong>Weekly Average: 1,533 kcal per day.</strong> This plan is flexible — adjust portions up or down to hit your target. If you need 1,800 kcal per day instead of 1,550, add a snack or larger portions. If you need 1,200, reduce portion sizes slightly.</p>

      <h2>Vegan Protein Sources That Actually Work</h2>
      <p>The myth about vegan protein is that it's hard to hit daily targets. It's not — when you plan properly. Here are the budget-friendly vegan proteins that make this plan possible.</p>
      <ProteinList items={PROTEINS} />
      <p>This meal plan uses lentils, chickpeas, black beans, and tofu as primary protein sources. Combined with grains (rice, quinoa, pasta), you're hitting 50–80g protein per day easily. The cost? Under $60 per week for all 21 meals. That's about $2.85 per meal.</p>

      <h2>Weekly Grocery List</h2>
      <p>Everything you need to make this plan, grouped by section so you can navigate the store efficiently.</p>

      <GroceryCategory heading="Produce" items={[
        'Spinach (1 bag) — $2.50',
        'Bell peppers (3) — $2.25',
        'Broccoli (2 heads) — $3.50',
        'Carrots (1 lb) — $0.79',
        'Mushrooms (8 oz) — $2.00',
        'Tomatoes (2 lbs) — $2.50',
        'Avocado (3) — $3.50',
        'Bananas (2 bunches) — $2.00',
        'Berries (2 pints mixed) — $5.00',
        'Onions (2 lbs) — $1.50',
        'Garlic (1 bulb) — $0.50',
        'Potatoes (2 lbs) — $1.50',
        'Sweet potatoes (2 lbs) — $2.00',
        'Cucumber (1) — $0.75',
        'Kale (1 bunch) — $2.50'
      ]} />
      <GroceryCategory heading="Protein & Legumes" items={[
        'Canned lentils (2 cans) — $2.00',
        'Canned chickpeas (3 cans) — $2.25',
        'Canned black beans (2 cans) — $1.50',
        'Firm tofu (2 blocks) — $4.00',
        'Tempeh (1 package) — $3.00',
        'Frozen edamame (1 bag) — $2.50'
      ]} />
      <GroceryCategory heading="Grains & Starches" items={[
        'Brown rice (1 lb) — $2.00',
        'Basmati rice (1 lb) — $1.50',
        'Quinoa (1 lb) — $4.00',
        'Rice noodles (1 box) — $2.50',
        'Pasta (1 box) — $1.25',
        'Whole grain bread (1 loaf) — $3.00',
        'Tortillas (1 pack) — $2.50'
      ]} />
      <GroceryCategory heading="Pantry Essentials" items={[
        'Olive oil (if needed) — $6.00',
        'Coconut milk (2 cans) — $3.00',
        'Vegetable broth (1 carton) — $2.00',
        'Tahini — $5.00',
        'Peanut butter — $3.50',
        'Almond butter (if needed) — $5.00',
        'Hummus (2 containers) — $4.50',
        'Canned tomato sauce (2 cans) — $2.00',
        'Beet hummus (optional) — $4.00'
      ]} />
      <GroceryCategory heading="Other Essentials" items={[
        'Rolled oats (1 lb) — $2.50',
        'Chia seeds (small bag) — $3.50',
        'Granola (1 box) — $4.00',
        'Coconut yogurt (2 cartons) — $4.50',
        'Hemp seeds (small bag) — $4.00',
        'Maple syrup (if needed) — $5.00',
        'Spices: cumin, turmeric, paprika — $5.00'
      ]} />
      <p><strong>Estimated Total Cost: $58.19</strong> (assumes you have oil, salt, pepper, and basic spices at home).</p>

      <h2>How to Customize This Plan for Your Calorie Goal</h2>
      <p>This plan averages 1,533 kcal per day. If you need more or fewer calories, the math is simple. The easiest adjustments are portion sizes and snacks.</p>
      <p><strong>If you need 1,200 kcal per day:</strong> Reduce lunch and dinner portions by about 10–15%. Cut oil used for cooking slightly. Skip or reduce snacks. A 10% reduction across the board gets you to roughly 1,380 kcal — close enough for maintenance in most cases.</p>
      <p><strong>If you need 1,800 kcal per day:</strong> Add a 200-300 kcal snack (e.g., fruit with nut butter, granola and yogurt, or hummus and veggies). Increase portion sizes of grains slightly or add an extra meal component like toast or pasta.</p>
      <p><strong>If you need 2,000+ kcal per day:</strong> Add 2–3 snacks across the day and increase main meal portions. Add nuts, seeds, or nut butters liberally — they're calorie-dense and vegan.</p>
      <p>But here's the thing: if custom tailoring feels overwhelming, that's exactly what Mealzy does for you. Enter your exact calorie goal, dietary preference (vegan), weekly budget, and any foods you dislike — Mealzy generates a fully customized week in under 1 minute. You get a plan that fits your body, your budget, and your taste. Free to try, no credit card needed.</p>

      <h2>Tips for Sticking to a Vegan Meal Plan</h2>
      <p><strong>1. Batch cook one grain and one protein on Sunday.</strong> Spend 45 minutes cooking rice + lentils in bulk. This covers breakfast and lunch for 4–5 days. Portion into containers, refrigerate, and you've eliminated the "what's for lunch" decision for half the week.</p>
      <p><strong>2. Keep frozen edamame and canned beans as emergency protein.</strong> Life happens. Meetings run late. Workouts skip. When you don't have time to cook, frozen edamame takes 5 minutes and delivers 11g protein. Canned beans are shelf-stable and ready in seconds. They're not fancy, but they keep you on track.</p>
      <p><strong>3. Don't skip breakfast — vegan breakfasts are fast.</strong> Overnight oats go in the fridge the night before. Smoothie bowls take 3 minutes. Avocado toast takes 5. Breakfast isn't the bottleneck — skipping it is. You get hungry, make bad decisions, derail the whole day.</p>
      <p><strong>4. Use Mealzy's swap feature if you dislike a meal.</strong> The plan is a guide, not a prison. If you hate a meal, swap it. The regenerated plan maintains your calorie target and budget. No guilt, no wasted ingredients.</p>

      <h2>Frequently Asked Questions</h2>
      <BlogFaq items={FAQS} />

      <BlogCta
        lead="This plan is a starting point."
        body="For a plan built around your exact calorie goal, grocery budget, and food preferences — Mealzy generates it in under 1 minute. Free to try, no credit card, no sign up needed for the demo."
      />

      <p>Eating vegan doesn't have to be hard. You just need a plan. This one works — it's tested, budget-friendly, hits protein targets, and uses ingredients you can find in any regular grocery store. Print it, follow it, or use it as a template for your own ideas. And when you're ready for a fully customized plan, Mealzy will generate one for you in under 1 minute.</p>
    </BlogArticleShell>
  );
}
