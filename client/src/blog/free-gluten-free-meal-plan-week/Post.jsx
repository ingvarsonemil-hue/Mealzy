import * as React from 'react';
import BlogArticleShell from '@/blog/BlogArticleShell';
import BlogFaq from '@/blog/BlogFaq';
import BlogCta from '@/blog/BlogCta';
import MealDayCard from '@/blog/MealDayCard';
import ProteinList from '@/blog/ProteinList';
import GroceryCategory from '@/blog/GroceryCategory';
import GfTag from '@/blog/GfTag';

/* PAGE COPY — copied verbatim from public/blog/free-gluten-free-meal-plan-week.html.
 * Do not rewrite, reword, or "improve" any sentence here without sign-off. */

const DAYS = [
  { day: 'Monday', total: 'Daily Total: 1,430 kcal', meals: [
    { label: 'Breakfast', text: <>Rice porridge with banana and honey <GfTag /> — 360 kcal</> },
    { label: 'Lunch', text: <>Quinoa and roasted vegetable bowl <GfTag /> — 490 kcal</> },
    { label: 'Dinner', text: <>Baked salmon with sweet potato and green beans <GfTag /> — 580 kcal</> }
  ] },
  { day: 'Tuesday', total: 'Daily Total: 1,500 kcal', meals: [
    { label: 'Breakfast', text: <>Scrambled eggs with gluten-free toast <GfTag /> — 380 kcal</> },
    { label: 'Lunch', text: <>Chicken and rice with roasted vegetables <GfTag /> — 520 kcal</> },
    { label: 'Dinner', text: <>Beef stir-fry with rice noodles and tamari <GfTag /> — 600 kcal</> }
  ] },
  { day: 'Wednesday', total: 'Daily Total: 1,350 kcal', meals: [
    { label: 'Breakfast', text: <>Smoothie with banana, berries, and almond milk <GfTag /> — 350 kcal</> },
    { label: 'Lunch', text: <>Tuna salad with rice cakes <GfTag /> — 420 kcal</> },
    { label: 'Dinner', text: <>Turkey meatballs with rice pasta and marinara <GfTag /> — 580 kcal</> }
  ] },
  { day: 'Thursday', total: 'Daily Total: 1,420 kcal', meals: [
    { label: 'Breakfast', text: <>Corn tortillas with scrambled eggs and salsa <GfTag /> — 390 kcal</> },
    { label: 'Lunch', text: <>Lentil and vegetable soup <GfTag /> — 480 kcal</> },
    { label: 'Dinner', text: <>Baked chicken breast with corn and green salad <GfTag /> — 550 kcal</> }
  ] },
  { day: 'Friday', total: 'Daily Total: 1,470 kcal', meals: [
    { label: 'Breakfast', text: <>Certified gluten-free oatmeal with berries and honey <GfTag /> — 370 kcal</> },
    { label: 'Lunch', text: <>Grilled fish with roasted potatoes <GfTag /> — 510 kcal</> },
    { label: 'Dinner', text: <>Chicken and quinoa stir-fry with vegetables <GfTag /> — 590 kcal</> }
  ] },
  { day: 'Saturday', total: 'Daily Total: 1,420 kcal', meals: [
    { label: 'Breakfast', text: <>Rice cakes with avocado and tomato <GfTag /> — 350 kcal</> },
    { label: 'Lunch', text: <>Chickpea salad with rice and vegetables <GfTag /> — 450 kcal</> },
    { label: 'Dinner', text: <>Baked salmon with sweet potato and broccoli <GfTag /> — 620 kcal</> }
  ] },
  { day: 'Sunday', total: 'Daily Total: 1,450 kcal', meals: [
    { label: 'Breakfast', text: <>Gluten-free pancakes with maple syrup <GfTag /> — 380 kcal</> },
    { label: 'Lunch', text: <>Beef and vegetable rice bowl <GfTag /> — 500 kcal</> },
    { label: 'Dinner', text: <>Tofu stir-fry with rice noodles and tamari <GfTag /> — 570 kcal</> }
  ] }
];

const PROTEINS = [
  { name: 'Chicken breast', meta: '~$0.80/serving (31g protein)' },
  { name: 'Salmon', meta: '~$1.80/serving (25g protein)' },
  { name: 'Eggs', meta: '~$0.30/egg (6g protein)' },
  { name: 'Tofu (certified GF)', meta: '~$0.60/serving (15g protein)' },
  { name: 'Lentils', meta: '~$0.35/serving (18g protein)' },
  { name: 'Chickpeas', meta: '~$0.40/serving (15g protein)' },
  { name: 'Canned tuna', meta: '~$0.50/serving (20g protein)' },
  { name: 'Turkey mince', meta: '~$1.00/serving (22g protein)' }
];

const FAQS = [
  { q: 'Is it expensive to eat gluten-free?', a: 'It can be if you buy specialty gluten-free products, which are overpriced. But rice, potatoes, lentils, chickpeas, and corn are naturally gluten-free and cheap. This plan stays under $60 per week by using whole foods instead of specialty products.' },
  { q: 'What grains are gluten-free?', a: 'Rice, quinoa, corn, buckwheat, millet, and certified gluten-free oats are safe. Always verify that oats are certified gluten-free because they can be cross-contaminated during harvest. Wheat, barley, and rye contain gluten.' },
  { q: 'What is the difference between gluten-free and coeliac-safe?', a: 'Gluten-free means no wheat, barley, or rye. Coeliac-safe means strict avoidance of cross-contamination (shared equipment, utensils, surfaces). People with coeliac disease should verify all ingredients independently and use dedicated cooking equipment.' },
  { q: 'Does Mealzy support gluten-free meal planning?', a: 'Yes — select gluten-free as your dietary preference and every generated meal is strictly gluten-free. No wheat, barley, rye, regular soy sauce, or regular pasta in any meal. Mealzy uses rice, quinoa, and tamari instead.' },
  { q: 'Can I combine gluten-free with other diets in Mealzy?', a: 'Yes — you can combine gluten-free with vegan, dairy-free, high-protein, or other dietary preferences. Mealzy enforces all constraints simultaneously, so you get a meal plan that respects every restriction.' }
];

export default function Post() {
  return (
    <BlogArticleShell title="Free 7-Day Gluten-Free Meal Plan With Grocery List" meta="Published June 16, 2026 · 11 min read">
      <p>The hardest part of eating gluten-free isn't avoiding gluten — it's knowing which everyday foods hide it, and building meals that are filling, varied, and actually enjoyable. This 7-day plan solves that. Every day has breakfast, lunch, and dinner with clear gluten-free labels. All meals use whole foods (rice, quinoa, potatoes, corn) instead of expensive specialty products. At the bottom: a full grocery list with no hidden gluten sources. And if you want a plan customized to your exact calorie goal, allergies, and preferences, Mealzy generates one in 30 seconds — free.</p>

      <h2>Your Free 7-Day Gluten-Free Meal Plan</h2>
      {DAYS.map((d) => (
        <MealDayCard key={d.day} day={d.day} meals={d.meals} total={d.total} />
      ))}
      <p><strong>Weekly Average: 1,420 kcal per day.</strong> Every meal is certified gluten-free or made from naturally gluten-free ingredients. No hidden gluten sources, no guesswork. Adjust portions up or down to hit your target calories.</p>

      <h2>Gluten-Free Protein Sources That Work</h2>
      <p>These proteins are naturally gluten-free and budget-friendly. All are safe for coeliac disease (verify sourcing for cross-contamination if needed).</p>
      <ProteinList items={PROTEINS} />
      <p>This meal plan uses chicken, salmon, eggs, tofu, lentils, and chickpeas as primary protein sources. Combined with whole grains (rice, quinoa), you're hitting 70–100g protein per day. The cost? Under $60 per week for all 21 meals.</p>

      <h2>Gluten-Free Ingredients to Avoid</h2>
      <p>Gluten hides in surprising places. These are the most common culprits. If you have coeliac disease, verify every product independently — cross-contamination during manufacture is possible even for certified gluten-free products.</p>
      <p><strong>Common hidden gluten sources:</strong> Regular soy sauce (use tamari instead, which is made from rice and chickpeas), wheat flour (use rice flour or cornstarch), regular oats (use certified gluten-free oats), regular pasta (use rice pasta or corn pasta), barley and rye grains, malt vinegar (use apple cider vinegar), some stock cubes and gravies, regular breadcrumbs, modified food starch (verify the source), beer, seitan (it's pure gluten), and some spice blends with anti-caking agents.</p>
      <p><strong>Cross-contamination risks:</strong> Shared toasters, cutting boards, cooking utensils, and cooking oil used for fried gluten-containing foods. If someone in your household is not gluten-free, designate separate cooking equipment and surfaces for safety.</p>

      <h2>Weekly Grocery List</h2>
      <p>Everything you need to make this plan, with no hidden gluten sources. All ingredients are naturally gluten-free or certified.</p>

      <GroceryCategory heading="Proteins" items={[
        'Chicken breast (4 lbs) — $8.00',
        'Salmon fillet (2 lbs) — $12.00',
        'Ground beef (1.5 lbs) — $6.00',
        'Turkey mince (1.5 lbs) — $6.00',
        'Tofu (2 blocks, certified GF) — $4.00',
        'Eggs (2 dozen) — $5.00',
        'Canned tuna (2 cans) — $2.50'
      ]} />
      <GroceryCategory heading="Grains & Starches" items={[
        'White rice (2 lbs) — $2.00',
        'Quinoa (1 lb) — $4.00',
        'Rice pasta (1 box) — $2.50',
        'Rice noodles (1 box) — $2.00',
        'Gluten-free bread (1 loaf) — $3.50',
        'Corn tortillas (1 pack) — $2.50',
        'Rice cakes (1 box) — $3.00',
        'Certified GF oats (1 lb) — $4.00',
        'Gluten-free pancake mix — $3.50',
        'Potatoes (3 lbs) — $2.00',
        'Sweet potatoes (2 lbs) — $2.50'
      ]} />
      <GroceryCategory heading="Vegetables" items={[
        'Broccoli (2 heads) — $3.00',
        'Green beans (1.5 lbs) — $3.00',
        'Carrots (2 lbs) — $1.50',
        'Onions (2 lbs) — $1.50',
        'Bell peppers (4) — $4.00',
        'Corn (fresh or frozen) — $2.50',
        'Salad greens (2 bags) — $3.50',
        'Tomatoes (2 lbs) — $2.50',
        'Avocados (2) — $2.00',
        'Cucumber (1) — $0.75',
        'Garlic (1 bulb) — $0.50'
      ]} />
      <GroceryCategory heading="Pantry & Oils" items={[
        'Olive oil (if needed) — $6.00',
        'Tamari (gluten-free soy sauce) — $3.00',
        'Rice vinegar — $2.00',
        'Marinara sauce (GF verified) — $2.50',
        'Honey — $4.00',
        'Almond milk — $2.50'
      ]} />
      <p><strong>Estimated Total Cost: $59.50</strong> (assumes you have salt, pepper, and basic spices at home).</p>

      <h2>How to Customize This Plan for Your Calorie Goal</h2>
      <p>This plan averages 1,420 kcal per day. Adjust portion sizes to hit your target. The meals remain gluten-free no matter what.</p>
      <p><strong>If you need 1,200 kcal per day:</strong> Reduce grain portions (rice, quinoa) by 15%. Use less oil for cooking. A 15% reduction gets you to roughly 1,207 kcal without affecting meal quality.</p>
      <p><strong>If you need 1,600 kcal per day:</strong> Increase protein portions and add a gluten-free snack (rice cakes with honey, fruit, or gluten-free crackers). Most of your extra calories can come from fruit or whole grains.</p>
      <p><strong>If you need 2,000+ kcal per day:</strong> Add gluten-free snacks like nuts, dried fruit, gluten-free granola, and extra servings of grains and protein. Most whole foods are naturally gluten-free, so hitting high calorie targets is straightforward.</p>
      <p>But here's the thing: if custom tailoring feels overwhelming, that's exactly what Mealzy does for you. Enter your exact calorie goal, dietary preference (gluten-free), and any other allergies or restrictions — Mealzy generates a fully customized week in 30 seconds. You get a plan that fits your body, your budget, and your diet. Free to try, no credit card needed.</p>

      <h2>Tips for Sticking to a Gluten-Free Meal Plan</h2>
      <p><strong>1. Read labels obsessively at first, then only when trying new products.</strong> After a month, you'll know which brands are safe. Build your own mental inventory of trusted gluten-free products. Check unfamiliar items, but don't overthink it once you have a routine.</p>
      <p><strong>2. Keep rice, potatoes, and canned lentils as your foundation.</strong> These are naturally gluten-free, cheap, and filling. Rice + lentils covers half your meals. When in doubt, build around these two.</p>
      <p><strong>3. Don't buy expensive gluten-free substitutes unless you really need them.</strong> Gluten-free bread costs 3x as much as regular. Gluten-free pasta costs 2x as much. Skip specialty products and stick to whole foods (rice, quinoa, potatoes, corn). Your wallet and your health will thank you.</p>
      <p><strong>4. Use Mealzy's swap feature if you dislike a meal.</strong> The plan is a guide, not a cage. If you hate quinoa, swap it for rice. The regenerated plan maintains your calorie target.</p>

      <h2>Frequently Asked Questions</h2>
      <BlogFaq items={FAQS} />

      <BlogCta
        lead="This plan is a starting point."
        body="For a plan built around your exact calorie goal, allergies, and food preferences — Mealzy generates it in 30 seconds. Free to try, no credit card, no sign up needed for the demo."
      />

      <p>Gluten-free eating doesn't have to be complicated. You just need a plan. This one works — it's tested, budget-friendly, uses whole foods, and avoids all the hidden gluten sources that trip people up. Print it, follow it, or use it as a template for your own ideas. And when you're ready for a fully customized plan that respects your exact calorie goal and allergies, Mealzy will generate one for you in 30 seconds.</p>
    </BlogArticleShell>
  );
}
