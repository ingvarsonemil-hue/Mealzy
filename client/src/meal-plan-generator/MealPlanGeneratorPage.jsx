import * as React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/marketing/PageHero';
import ClosingCtaBand from '@/marketing/ClosingCtaBand';
import RelatedLinks from '@/marketing/RelatedLinks';
import { Button } from '@/components/ui/button';
import { Input, Select, Label } from '@/components/ui/field';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { generateDemoMealForTool } from '@/lib/api';
import { prefersReducedMotion } from '@/lib/utils';

/* PAGE COPY — copied verbatim from public/meal-plan-generator.html.
 * Do not rewrite, reword, or "improve" any sentence here without sign-off. */

const DIETS = [
  { value: '', label: 'Any diet', disabled: true },
  { value: 'none', label: 'No restriction' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten-free', label: 'Gluten-free' },
  { value: 'keto', label: 'Keto' }
];

const FACTS = [
  { title: 'Hits your exact macros', body: 'Set your daily calorie, protein, carb, and fat targets. Every meal plan is built to match them precisely.' },
  { title: 'Respects your budget', body: 'Set a weekly grocery budget and Mealzy never exceeds it. Every plan includes estimated costs per meal.' },
  { title: 'Grocery list included', body: 'Every ingredient, sorted by supermarket category, with estimated costs. One list for the whole week.' },
  { title: 'Any diet, any restriction', body: 'Vegetarian, vegan, gluten-free, keto, paleo, dairy-free, nut-free, and more. Set once, applied to every plan.' },
  { title: '11 languages', body: 'Plans generated in English, Swedish, French, German, Spanish, Italian, Portuguese, Dutch, Norwegian, Danish, or Japanese.' },
  { title: 'Ready in 30 seconds', body: 'Type your preferences once. The full plan — 4 meals per day, 7 days — is ready in about 30 seconds.' }
];

const FAQS = [
  {
    q: 'How is this different from ChatGPT?',
    a: 'ChatGPT gives you a plan you then have to format yourself. Mealzy generates a structured, usable plan with calorie counts, per-meal costs, and a sorted grocery list — automatically, every time. It also remembers your goals and generates a new tailored plan every week without you having to re-explain your preferences.'
  },
  {
    q: 'Do I need to sign up to use it?',
    a: "You can preview a sample Mon–Fri plan above without an account. To generate a full 7-day plan personalised to your goals, you need a free account (takes about 2 minutes to set up)."
  },
  {
    q: 'Can I export the plan as a PDF?',
    a: 'PDF export is available on the Pro plan ($8/month). You can download your full meal plan and grocery list as a clean, print-ready PDF.'
  }
];

function SamplePlannerPanel() {
  const [cals, setCals] = React.useState('2000');
  const [budget, setBudget] = React.useState('65');
  const [diet, setDiet] = React.useState('');
  const [state, setState] = React.useState({ status: 'idle', plan: null, error: null });
  const resultRef = React.useRef(null);

  React.useEffect(() => {
    if (state.status === 'success' && resultRef.current) {
      requestAnimationFrame(() => {
        resultRef.current.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      });
    }
  }, [state.status]);

  const runDemo = async () => {
    setState({ status: 'loading', plan: null, error: null });
    try {
      const plan = await generateDemoMealForTool({
        calorieGoal: parseInt(cals, 10) || 2000,
        budget: parseFloat(budget) || 65,
        dietary: diet
      });
      setState({ status: 'success', plan, error: null });
    } catch (err) {
      if (err.paymentRequired) {
        window.location.href = '/upgrade.html';
        return;
      }
      setState({
        status: 'error',
        plan: null,
        error: err.rateLimited ? err.message : 'Something went wrong. Please try again.'
      });
    }
  };

  const byDay = React.useMemo(() => {
    const map = {};
    const order = [];
    (state.plan?.meals || []).forEach((m) => {
      if (!map[m.day]) { map[m.day] = []; order.push(m.day); }
      map[m.day].push(m);
    });
    return order.map((day) => [day, map[day]]);
  }, [state.plan]);

  return (
    <div className="mx-auto mt-10 max-w-[820px] rounded-lg border border-border-warm bg-cream p-6 shadow-card sm:p-8">
      <h2 className="font-display text-xl font-bold italic text-foreground">Try it now — no account needed</h2>
      <p className="mt-1 text-sm text-muted-fg">Generate a sample Mon–Fri plan with your actual calorie goal and budget.</p>

      <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div>
          <Label htmlFor="dCals">Daily calories</Label>
          <Input id="dCals" type="number" min="1200" max="4000" step="50" value={cals} onChange={(e) => setCals(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="dBudget">Weekly budget ($)</Label>
          <Input id="dBudget" type="number" min="20" max="500" step="5" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="dDiet">Diet</Label>
          <Select id="dDiet" value={diet} onChange={(e) => setDiet(e.target.value)}>
            {DIETS.map((d) => (
              <option key={d.value} value={d.value} disabled={d.disabled}>{d.label}</option>
            ))}
          </Select>
        </div>
      </div>

      <Button
        id="demoBtn" full size="lg" className="mt-4" onClick={runDemo}
        disabled={state.status === 'loading'} aria-busy={state.status === 'loading'}
      >
        {state.status === 'loading' && (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
          />
        )}
        {state.status === 'loading' ? 'Generating...' : 'Generate Sample Plan'}
      </Button>

      {state.status === 'error' && (
        <div role="alert" aria-live="polite" className="mt-4 rounded-md border border-error/30 bg-error/5 px-4 py-3 text-[15px] text-brick">
          {state.error}
        </div>
      )}

      {state.status === 'success' && state.plan && (
        <div ref={resultRef} aria-live="polite" className="mt-6">
          <div className="overflow-hidden rounded-md border border-border-warm bg-parchment">
            <div className="border-b border-border-warm px-5 py-4">
              <p className="font-display text-lg font-bold italic">Sample Plan — Mon to Fri</p>
              <p className="mt-0.5 text-sm text-muted-fg">{cals} kcal · ${budget}/week</p>
            </div>
            <div className="px-5 py-1">
              {byDay.map(([day, meals]) => (
                <div key={day} className="border-b border-hairline py-3.5 last:border-b-0">
                  <p className="mb-1.5 font-display text-[0.95rem] font-bold italic text-green">{day}</p>
                  {meals.map((m, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-4 py-1">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-medium">{m.name}</p>
                        <p className="text-xs uppercase tracking-[0.06em] text-muted-fg">{m.type}</p>
                      </div>
                      <p className="shrink-0 text-right text-sm text-muted-fg">
                        {m.calories} kcal &middot; <span className="font-semibold text-green-deep dark:text-green-light">${(m.estimatedCost || 0).toFixed(2)}</span>
                      </p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 text-center">
            <Button href="login.html?signup=1" size="lg">Start Planning Free</Button>
            <p className="mt-2 text-[0.78rem] text-muted-fg">The full week includes all 7 days, breakfast, snacks, and a full grocery list.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MealPlanGeneratorPage() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main">
        <PageHero
          title="Build your full week of meals in 30 seconds."
          lede="Tell Mealzy your calorie goal, weekly budget, and any dietary preferences. It generates a balanced, practical meal plan and a sorted grocery list — completely free. No credit card, no catch."
          ctaLabel="Start Planning Free"
          ctaHref="login.html?signup=1"
          fine="Free to start. 3 plans/month at no cost. No credit card."
        />

        <div className="mx-auto max-w-[820px] px-4 sm:px-5">
          <SamplePlannerPanel />
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

          <div className="article-prose mt-10">
            <h2>What is an AI meal plan generator?</h2>
            <p>An AI meal plan generator uses artificial intelligence to create a personalised weekly meal plan based on your specific goals, dietary preferences, and budget. Unlike generic meal plans you find in magazines, an AI generator adapts to your exact calorie target, macros, allergies, and cooking skill level.</p>
            <p>Mealzy is an AI meal plan generator that takes about 30 seconds to produce a full 7-day plan with breakfast, lunch, dinner, and a snack for each day — plus a complete grocery list with estimated costs.</p>

            <h2>How does the Mealzy meal plan generator work?</h2>
            <p>Mealzy uses Claude AI (by Anthropic) to generate meal plans. Here's the process:</p>
            <ul>
              <li>You enter your daily calorie goal, weekly grocery budget, cooking skill, and any dietary restrictions or allergies.</li>
              <li>Mealzy sends this to Claude with a detailed prompt that includes macro targets, budget constraints, and dietary requirements.</li>
              <li>Claude generates a 7-day meal plan that respects all your constraints — typically in under 30 seconds.</li>
              <li>Mealzy formats the output into a readable plan with a sorted grocery list, calorie counts, and per-meal costs.</li>
            </ul>
            <p>The result is practical, home-cooked meals using ingredients you can find in any regular supermarket.</p>

            <h2>Is the Mealzy meal plan generator free?</h2>
            <p>Yes. The free plan gives you 3 complete meal plan generations per month, the automatic grocery list, calorie and macro tracking, and 10 AI coach messages per day. No credit card is required to sign up.</p>
            <p>If you generate meal plans every week (4+ per month), the Pro plan at $8/month gives you unlimited generations, PDF export, unlimited AI coaching, and advanced macro breakdowns per meal.</p>

            <h2>What diets does the meal plan generator support?</h2>
            <p>Mealzy supports all major dietary preferences and restrictions, including:</p>
            <ul>
              <li>Vegetarian and vegan</li>
              <li>Gluten-free and coeliac-safe</li>
              <li>Dairy-free</li>
              <li>Keto and low-carb</li>
              <li>Paleo</li>
              <li>Nut-free</li>
              <li>Halal</li>
              <li>Custom allergies (e.g. shellfish, eggs, soy)</li>
            </ul>
            <p>You can also specify a preferred cuisine style — Mediterranean, Asian, Indian, Mexican, Scandinavian, and more — and Mealzy will lean into that style while respecting all your other constraints.</p>

            <h2>How accurate are the calorie counts?</h2>
            <p>Mealzy uses the Mifflin-St Jeor equation with your age, weight, height, and activity level to calculate your daily calorie target. Meal plans are generated to hit that target within about 50 kcal per day. Individual meal calorie estimates are approximate — like any home cooking, the actual amount varies based on your exact ingredients and portion sizes.</p>
          </div>

          <h2 className="mt-10 font-display text-[1.35rem] font-bold italic text-foreground">Common questions</h2>
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
              { href: 'weekly-meal-plan.html', label: 'Free Weekly Meal Plan' },
              { href: 'budget-meal-plan.html', label: 'Budget Meal Plan ($50/week)' },
              { href: 'pricing.html', label: 'Pricing' }
            ]}
          />
        </div>

        <ClosingCtaBand
          title="Your week, planned in 30 seconds."
          lede="Set your goals once. Mealzy builds every week from there — meals, macros, and the grocery list."
          ctaLabel="Start Planning Free"
          ctaHref="login.html?signup=1"
        />
      </main>
      <Footer />
    </>
  );
}
