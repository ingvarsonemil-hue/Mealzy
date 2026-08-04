import * as React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/marketing/PageHero';
import ClosingCtaBand from '@/marketing/ClosingCtaBand';
import RelatedLinks from '@/marketing/RelatedLinks';
import SampleTable from '@/marketing/SampleTable';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

/* PAGE COPY — copied verbatim from public/budget-meal-plan.html.
 * Do not rewrite, reword, or "improve" any sentence here without sign-off. */

const ROWS = [
  { day: 'Mon', cells: [
    { main: 'Porridge with banana and honey', sub: '330 kcal · $0.65' },
    { main: 'Lentil soup with crusty bread', sub: '480 kcal · $1.20' },
    { main: 'Pasta with tomato, garlic, and spinach', sub: '620 kcal · $1.80' }
  ], total: '~$3.20' },
  { day: 'Tue', cells: [
    { main: 'Scrambled eggs on toast', sub: '360 kcal · $0.85' },
    { main: 'Tuna pasta salad', sub: '450 kcal · $1.35' },
    { main: 'Chicken thighs with roasted veg', sub: '580 kcal · $2.10' }
  ], total: '~$5.00' },
  { day: 'Wed', cells: [
    { main: 'Banana smoothie with oats', sub: '310 kcal · $0.60' },
    { main: 'Bean and rice bowl', sub: '490 kcal · $0.95' },
    { main: 'Stir-fried tofu with noodles', sub: '550 kcal · $1.60' }
  ], total: '~$3.60' },
  { day: 'Thu', cells: [
    { main: 'Peanut butter toast with sliced banana', sub: '340 kcal · $0.70' },
    { main: 'Egg fried rice with frozen peas', sub: '470 kcal · $0.90' },
    { main: 'Black bean and sweet potato chili', sub: '560 kcal · $1.80' }
  ], total: '~$4.10' },
  { day: 'Fri', cells: [
    { main: 'Overnight oats with frozen berries', sub: '320 kcal · $0.75' },
    { main: 'Chickpea and cucumber flatbread', sub: '440 kcal · $1.10' },
    { main: 'Spaghetti with lentil bolognese', sub: '610 kcal · $1.95' }
  ], total: '~$4.50' },
  { day: 'Sat', cells: [
    { main: 'Pancakes with honey and banana', sub: '390 kcal · $0.95' },
    { main: 'Tomato and lentil soup (batch leftovers)', sub: '380 kcal · $0.60' },
    { main: 'Roast chicken thighs with mashed potato', sub: '620 kcal · $2.90' }
  ], total: '~$5.20' },
  { day: 'Sun', cells: [
    { main: 'Poached eggs on toast', sub: '350 kcal · $0.85' },
    { main: 'Bean and rice bowl with salsa', sub: '460 kcal · $1.00' },
    { main: 'Pasta with garlic, olive oil, and tuna', sub: '580 kcal · $1.55' }
  ], total: '~$3.80' }
];

const FAQS = [
  {
    q: 'Is $50/week realistic for one person?',
    a: 'Yes — $50/week for one person is very achievable if you cook at home and plan your meals. The key is anchoring your plan on cheap protein sources (eggs, lentils, canned fish, chicken thighs) and minimising processed or pre-prepared food. Mealzy can generate a $50 plan around any calorie target or dietary preference.'
  },
  {
    q: 'Can I set a different budget?',
    a: 'Yes. Mealzy accepts any weekly budget from $20 to $500. Set your budget in your profile and every generated plan stays within that amount. The grocery list shows the total estimated cost so you know before you shop.'
  },
  {
    q: 'Does it work for couples or families?',
    a: 'Yes. Set your budget to cover the household (e.g. $100/week for two people) and Mealzy scales the ingredient amounts accordingly. The Family plan supports up to 4 individual profiles each with separate calorie goals and dietary requirements — with a single combined grocery list for one shop.'
  }
];

export default function BudgetMealPlanPage() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main">
        <PageHero
          title="Eat well for $50 a week. Here's exactly how."
          lede="The average UK household spends £65/week on food. The average American spends $160. Both numbers are completely avoidable. This page shows you how to eat well on $50/week — and how to generate a personalised $50 plan for free, built around your actual goals."
          ctaLabel="Plan My Week Free"
          ctaHref="login.html?signup=1&budget=50"
          fine="Free. No credit card. Your plan stays under $50."
        />

        <div className="mx-auto max-w-container px-4 sm:px-5">
          <div className="mx-auto mt-10 max-w-[820px] rounded-lg border border-border-warm bg-cream p-6 shadow-card sm:p-8">
            <h2 className="font-display text-xl font-bold italic text-foreground">Sample $50/week plan</h2>
            <p className="mt-1 mb-5 text-sm text-muted-fg">
              A real sample output from Mealzy at ~2,000 kcal/day. Your personalised plan will reflect your actual calorie goal, budget, and dietary preferences.
            </p>
            <SampleTable
              caption="Sample $50/week meal plan (AI-generated, approximately 2000 kcal/day)"
              columns={['Day', 'Breakfast', 'Lunch', 'Dinner', 'Cost']}
              rows={ROWS}
              showTotal
            />
          </div>
        </div>

        <div className="mx-auto max-w-prose px-4 py-16 sm:px-5">
          <div className="article-prose">
            <h2>How to eat well on $50 a week</h2>
            <p>The $50/week grocery budget is achievable for most people who are cooking at home — but it requires a plan. The biggest enemy of budget cooking is impulse decisions: buying what looks good at the shop without knowing what you'll actually use it for.</p>
            <p>Here's what makes the difference:</p>
            <ul>
              <li><strong>Plan before you shop.</strong> Know exactly what you're eating each day before you leave the house. A 30-minute meal plan on Sunday saves £20–£30 in wasted food and impulse buying during the week.</li>
              <li><strong>Anchor your week on cheap proteins.</strong> Eggs, lentils, canned tuna, canned chickpeas, chicken thighs (not breasts), and tofu are the cheapest protein sources per gram. Build meals around them.</li>
              <li><strong>Batch cook twice a week.</strong> Cook a large pot of lentil soup or pasta sauce on Sunday and Wednesday. One cook, three meals.</li>
              <li><strong>Buy store-brand basics.</strong> Oats, rice, pasta, lentils, canned tomatoes, and canned beans — always buy store brand. The quality is identical; the price is 40% less.</li>
              <li><strong>Avoid pre-cut, pre-washed, and pre-marinated.</strong> A whole chicken costs a third of a pack of pre-cut pieces. A head of broccoli costs 30% less than pre-cut florets.</li>
              <li><strong>Use your freezer.</strong> Bread, bananas turning brown, leftover rice — freeze them. Reduces waste, extends the $50 further.</li>
            </ul>

            <h2>The cheapest healthy meals, ranked by cost per serving</h2>
            <p>Based on average UK/US supermarket prices, here are the cheapest nutritious meals you can make:</p>
            <ul>
              <li>Porridge with banana — ~$0.40/serving, 330 kcal, 8g protein</li>
              <li>Lentil soup — ~$0.60/serving, 380 kcal, 18g protein</li>
              <li>Egg fried rice — ~$0.70/serving, 440 kcal, 14g protein</li>
              <li>Bean and tomato stew — ~$0.75/serving, 360 kcal, 16g protein</li>
              <li>Pasta with garlic and canned tomatoes — ~$0.80/serving, 520 kcal, 12g protein</li>
              <li>Tuna pasta salad — ~$1.10/serving, 420 kcal, 30g protein</li>
              <li>Scrambled eggs on toast — ~$0.90/serving, 380 kcal, 22g protein</li>
              <li>Chicken thighs with roasted veg — ~$2.00/serving, 550 kcal, 38g protein</li>
            </ul>

            <h2>Why manual planning still wastes money</h2>
            <p>Even with the best intentions, manually planning a week of meals takes 30–60 minutes — and most people make mistakes. You forget to account for shared ingredients across meals, you underestimate how much things cost, and you don't check what's already in your fridge.</p>
            <p>Mealzy solves all three problems. You enter your weekly budget (like $50) and it generates a plan that stays within that number — accounting for ingredient overlap across meals, consolidating shared items in the grocery list, and telling you exactly what to buy and how much it costs before you step into the shop.</p>
          </div>

          <h2 className="mt-10 font-display text-[1.35rem] font-bold italic text-foreground">Common questions about budget meal planning</h2>
          <div className="mt-4 rounded-lg border border-border-warm bg-cream px-6 shadow-card sm:px-8">
            <Accordion type="single" collapsible>
              {FAQS.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i + 1}`}>
                  <AccordionTrigger>{f.q}</AccordionTrigger>
                  <AccordionContent>{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <RelatedLinks
            links={[
              { href: 'meal-plan-generator.html', label: 'AI Meal Plan Generator' },
              { href: 'weekly-meal-plan.html', label: 'Free Weekly Meal Plan' },
              { href: 'pricing.html', label: 'Pricing' }
            ]}
          />
        </div>

        <ClosingCtaBand
          title="Generate your $50 meal plan — free."
          lede="Tell Mealzy your weekly budget and calorie goal. It builds 7 days of budget-friendly meals and a sorted grocery list in 30 seconds."
          ctaLabel="Plan My Week Free"
          ctaHref="login.html?signup=1&budget=50"
        />
      </main>
      <Footer />
    </>
  );
}
