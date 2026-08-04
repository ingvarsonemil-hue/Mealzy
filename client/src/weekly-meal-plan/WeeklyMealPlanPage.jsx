import * as React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/marketing/PageHero';
import ClosingCtaBand from '@/marketing/ClosingCtaBand';
import RelatedLinks from '@/marketing/RelatedLinks';
import SampleTable from '@/marketing/SampleTable';
import DayCards from '@/marketing/DayCards';

/* PAGE COPY — copied verbatim from public/weekly-meal-plan.html.
 * Do not rewrite, reword, or "improve" any sentence here without sign-off. */

const DAYS = [
  { label: 'Monday', meals: [
    { name: 'Porridge with blueberries', kcal: '340 kcal' },
    { name: 'Chicken wrap', kcal: '490 kcal' },
    { name: 'Salmon with roasted veg', kcal: '580 kcal' }
  ] },
  { label: 'Tuesday', meals: [
    { name: 'Scrambled eggs on toast', kcal: '380 kcal' },
    { name: 'Lentil soup with bread', kcal: '460 kcal' },
    { name: 'Pasta arrabiata', kcal: '580 kcal' }
  ] },
  { label: 'Wednesday', meals: [
    { name: 'Banana smoothie with oats', kcal: '320 kcal' },
    { name: 'Tuna pasta salad', kcal: '440 kcal' },
    { name: 'Chicken stir-fry with rice', kcal: '590 kcal' }
  ] }
];

const FACTS = [
  { title: '7 breakfasts', body: 'Quick, nutritious starts. Matched to your morning calorie target.' },
  { title: '7 lunches', body: 'Practical, packable or quick-to-cook. Never boring.' },
  { title: '7 dinners', body: 'Balanced, satisfying meals. From 20 to 45 minutes to cook.' },
  { title: '1 grocery list', body: 'All ingredients, sorted by category, with estimated costs.' }
];

const ROWS = [
  { day: 'Mon', cells: [
    { main: <><strong>Porridge</strong> with blueberries and almond butter</>, sub: '340 kcal' },
    { main: <><strong>Chicken &amp; avocado wrap</strong></>, sub: '490 kcal' },
    { main: <><strong>Salmon with roasted potatoes &amp; greens</strong></>, sub: '580 kcal' }
  ] },
  { day: 'Tue', cells: [
    { main: <><strong>Scrambled eggs</strong> on sourdough toast</>, sub: '380 kcal' },
    { main: <><strong>Lentil &amp; spinach soup</strong> with crusty bread</>, sub: '460 kcal' },
    { main: <><strong>Pasta arrabiata</strong> with parmesan</>, sub: '580 kcal' }
  ] },
  { day: 'Wed', cells: [
    { main: <><strong>Banana smoothie</strong> with oats and protein powder</>, sub: '320 kcal' },
    { main: <><strong>Tuna pasta salad</strong> with cherry tomatoes</>, sub: '440 kcal' },
    { main: <><strong>Chicken stir-fry</strong> with rice and broccoli</>, sub: '590 kcal' }
  ] },
  { day: 'Thu', cells: [
    { main: <><strong>Greek yogurt</strong> with granola and honey</>, sub: '310 kcal' },
    { main: <><strong>Black bean &amp; sweet potato burrito bowl</strong></>, sub: '500 kcal' },
    { main: <><strong>Baked cod with roasted veg &amp; quinoa</strong></>, sub: '530 kcal' }
  ] },
  { day: 'Fri', cells: [
    { main: <><strong>Overnight oats</strong> with berries and chia</>, sub: '350 kcal' },
    { main: <><strong>Egg &amp; avocado salad wrap</strong></>, sub: '470 kcal' },
    { main: <><strong>Beef &amp; vegetable stir-fry</strong> with noodles</>, sub: '610 kcal' }
  ] },
  { day: 'Sat', cells: [
    { main: <><strong>Pancakes</strong> with fresh fruit and maple syrup</>, sub: '410 kcal' },
    { main: <><strong>Tomato soup</strong> with grilled cheese toast</>, sub: '450 kcal' },
    { main: <><strong>Roast chicken thighs</strong> with mashed potato &amp; greens</>, sub: '620 kcal' }
  ] },
  { day: 'Sun', cells: [
    { main: <><strong>Poached eggs</strong> on sourdough with spinach</>, sub: '360 kcal' },
    { main: <><strong>Chickpea &amp; roasted pepper salad</strong></>, sub: '420 kcal' },
    { main: <><strong>Salmon &amp; vegetable traybake</strong> with couscous</>, sub: '590 kcal' }
  ] }
];

export default function WeeklyMealPlanPage() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main">
        <PageHero
          title="Your free 7-day meal plan — built around your actual goals."
          lede="Stop reinventing your meals every week. Set your calorie goal, your budget, and your dietary preferences once. Mealzy generates a full 7-day plan with breakfast, lunch, dinner, and snacks — plus a sorted grocery list — in about 30 seconds. Free."
          ctaLabel="Plan My Week Free"
          ctaHref="login.html?signup=1"
          fine="3 plans/month free. No credit card. No catch."
        />

        <div className="mx-auto max-w-container px-4 pt-10 sm:px-5">
          <DayCards days={DAYS} caption="Sample from a real Mealzy plan · 2,000 kcal/day · $70/week" />
        </div>

        <div className="mx-auto max-w-prose px-4 py-16 sm:px-5">
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            {FACTS.map((f) => (
              <div key={f.title} className="border-t border-border-warm pt-4">
                <h3 className="text-base font-bold">{f.title}</h3>
                <p className="mt-1 text-[0.85rem] text-muted-fg">{f.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto max-w-container px-4 sm:px-5">
          <div className="mx-auto max-w-[820px] rounded-lg border border-border-warm bg-cream p-6 shadow-card sm:p-8">
            <h2 className="font-display text-xl font-bold italic text-foreground">Sample weekly plan preview</h2>
            <p className="mt-1 mb-5 text-sm text-muted-fg">From a real Mealzy plan: 2,000 kcal/day · $70/week · no restrictions.</p>
            <SampleTable
              caption="Sample 7-day meal plan: 2,000 kcal/day, $70/week, no dietary restrictions"
              columns={['Day', 'Breakfast', 'Lunch', 'Dinner']}
              rows={ROWS}
            />
          </div>
        </div>

        <div className="mx-auto max-w-prose px-4 py-16 sm:px-5">
          <div className="article-prose">
            <h2>Why weekly meal planning actually works</h2>
            <p>Research consistently shows that people who plan their meals in advance consume fewer calories, spend less on food, and waste less grocery shopping. The mechanism is simple: when you don't plan, you make food decisions when you're hungry — which is the worst time to make decisions. When you've already decided what you're eating for the week, you shop with a list, cook with purpose, and don't stand in front of the fridge at 7pm wondering what to eat.</p>
            <p>The problem is that planning properly takes time. Most people spend 30–60 minutes per week figuring out meals, checking what's in the fridge, writing a grocery list, and making sure the numbers roughly add up. Mealzy compresses that into 30 seconds.</p>

            <h2>What makes a good weekly meal plan?</h2>
            <p>A well-designed weekly meal plan has five properties:</p>
            <ul>
              <li><strong>Calorie balance.</strong> It hits your daily calorie target consistently — not 1,200 one day and 2,800 the next.</li>
              <li><strong>Macro distribution.</strong> Enough protein to maintain or build muscle (typically 0.8–1.2g per pound of bodyweight). Carbs and fat distributed sensibly.</li>
              <li><strong>Budget adherence.</strong> Every meal fits within your weekly grocery budget. Ingredients overlap across meals to reduce waste and cost.</li>
              <li><strong>Practical cooking times.</strong> Meals should match your actual schedule. If you have 20 minutes on a Tuesday night, the plan shouldn't include a 2-hour braise.</li>
              <li><strong>Variety.</strong> Different proteins, different cuisines, different textures — otherwise you stop following the plan by Wednesday.</li>
            </ul>
            <p>Mealzy generates plans that satisfy all five properties. You can set your calorie target, budget, max cooking time, preferred cuisines, and dietary restrictions. The AI balances all of these simultaneously — which is why it works better than manually copying a plan from a website that wasn't designed for you.</p>

            <h2>How to get the most from your weekly plan</h2>
            <ul>
              <li><strong>Generate on Sunday morning.</strong> Shop Sunday afternoon. You start the week with everything you need.</li>
              <li><strong>Batch cook the parts that save the most time.</strong> Rice, roasted vegetables, hard-boiled eggs, and cooked grains last 4–5 days in the fridge. Cook them once and use throughout the week.</li>
              <li><strong>Use the swap button.</strong> Don't like one meal? Mealzy can swap any individual meal without regenerating the whole plan — keeping the rest of your week intact.</li>
              <li><strong>Check the grocery list before you shop.</strong> The list is sorted by category and shows estimated costs. Adjust quantities based on your household size.</li>
            </ul>
          </div>

          <RelatedLinks
            links={[
              { href: 'meal-plan-generator.html', label: 'AI Meal Plan Generator' },
              { href: 'budget-meal-plan.html', label: 'Budget Meal Plan ($50/week)' },
              { href: 'pricing.html', label: 'Pricing' }
            ]}
          />
        </div>

        <ClosingCtaBand
          title="Get your free weekly meal plan."
          lede="Enter your calorie goal, budget, and dietary preferences once. Mealzy builds the week in 30 seconds — balanced, practical, and grocery-list ready."
          ctaLabel="Plan My Week Free"
          ctaHref="login.html?signup=1"
        />
      </main>
      <Footer />
    </>
  );
}
