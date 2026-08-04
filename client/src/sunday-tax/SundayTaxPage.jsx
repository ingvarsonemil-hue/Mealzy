import * as React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ClosingCtaBand from '@/marketing/ClosingCtaBand';
import { Button } from '@/components/ui/button';
import { Check, X } from '@/components/icons';

/* PAGE COPY — copied verbatim from public/sunday-tax.html.
 * Do not rewrite, reword, or "improve" any sentence here without sign-off. */

const MOCKUP_DAYS = [
  { day: 'Mon', name: 'Chicken rice bowl', meta: '480 kcal · 38g protein', cost: '$3.20', opacity: 1 },
  { day: 'Tue', name: 'Pasta with tomato and tuna', meta: '510 kcal · 34g protein', cost: '$2.80', opacity: 1 },
  { day: 'Wed', name: 'Lentil soup with bread', meta: '440 kcal · 22g protein', cost: '$2.10', opacity: 1 },
  { day: 'Thu', name: 'Stir-fried beef and vegetables', meta: '520 kcal · 41g protein', cost: '$3.80', opacity: 0.55 },
  { day: 'Fri', name: 'Salmon with roasted potatoes', meta: '490 kcal · 36g protein', cost: '$4.20', opacity: 0.3 }
];

const TRUST_ITEMS = [
  'Full week in 30 seconds',
  'Hits your exact calorie targets',
  'Stays within your grocery budget',
  'Free — no credit card'
];

const HOW_IT_WORKS = [
  { title: 'Tell Mealzy about you', body: "Your calorie goal, weekly grocery budget, dietary preferences, and anything you can't eat. Takes about 2 minutes, once." },
  { title: 'Get your week in 30 seconds', body: "Mealzy builds 7 days of meals balanced to your exact targets and budget. Don't like a meal — swap it in one click." },
  { title: 'Shop the list, cook, done', body: 'The grocery list is already sorted by category with estimated costs. Tick things off as you shop. That\'s the whole system.' }
];

const BEFORE = [
  '60–90 minutes every Sunday opening tabs, writing lists, checking what\'s in the fridge',
  'Buying too much at the supermarket — things that don\'t go together, half of it going bad',
  '7pm, fridge open, no idea what to make because there was never a real plan',
  'Missing calorie and protein targets most days because tracking everything manually is exhausting'
];

const AFTER = [
  '30 seconds on Sunday. The whole week is planned before you\'ve finished your coffee',
  'One grocery run with a list that already has everything and nothing extra',
  'You know what\'s for dinner every night of the week. There\'s a plan. It\'s already in your fridge.',
  'Hitting your targets consistently because the plan exists before the week starts, not during it'
];

export default function SundayTaxPage() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main">
        {/* HERO */}
        <section aria-labelledby="hero-heading" className="relative bg-forest text-on-forest">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(900px 480px at 18% 12%, rgba(74,222,128,0.10), transparent 60%), radial-gradient(700px 420px at 88% 78%, rgba(74,222,128,0.06), transparent 55%)'
            }}
          />
          <div className="relative mx-auto grid max-w-container items-center gap-12 px-4 pb-16 pt-32 sm:px-5 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:pb-20">
            <div>
              <h1
                id="hero-heading"
                className="font-display font-black italic leading-[1.05] tracking-[-0.03em] text-on-forest [font-size:clamp(2.5rem,4.6vw+1rem,4.25rem)]"
              >
                Stop spending 2 hours every Sunday on meal planning.
              </h1>
              <p className="mt-6 max-w-prose text-lg leading-[1.65] text-on-forest-body">
                Tell Mealzy your goals and your weekly grocery budget. It builds the whole week — meals, macros, grocery list — in about 30 seconds. Then you shop, cook, and repeat. That's the whole system.
              </p>
              <div className="mt-8">
                <Button href="login.html?signup=1" size="lg">Plan My Week Free</Button>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-on-forest-muted">
                <span>Free to start</span>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-on-forest-faint" />
                <span>No credit card</span>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-on-forest-faint" />
                <span>No catch</span>
              </div>
            </div>

            <div aria-label="Example weekly plan" className="overflow-hidden rounded-lg border border-forest-line bg-forest-raise shadow-lg">
              <div className="border-b border-forest-line px-5 py-4">
                <p className="font-display text-lg font-bold italic text-on-forest">This week's plan</p>
                <p className="mt-0.5 text-sm text-on-forest-muted">1,800 kcal/day · generated in 28 seconds</p>
              </div>
              {MOCKUP_DAYS.map((d) => (
                <div key={d.day} className="border-b border-forest-line px-5 py-3 last:border-b-0" style={{ opacity: d.opacity }}>
                  <p className="mb-1 font-display text-[0.8rem] font-bold italic text-on-forest-muted">{d.day}</p>
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="min-w-0 truncate text-[15px] font-medium text-on-forest-strong">{d.name}</p>
                    <p className="shrink-0 text-right text-sm text-on-forest-muted">
                      {d.meta} · <span className="font-semibold text-green-light">{d.cost}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative border-t border-forest-line bg-forest-deep/60">
            <div className="mx-auto grid max-w-container grid-cols-2 gap-x-6 gap-y-3 px-4 py-4 sm:px-5 md:flex md:items-center md:justify-between">
              {TRUST_ITEMS.map((label) => (
                <div key={label} className="flex items-center gap-2 text-sm text-on-forest-muted">
                  <Check className="text-green-light" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section aria-labelledby="how-heading" className="py-16 sm:py-20">
          <div className="mx-auto max-w-container px-4 sm:px-5">
            <div className="mb-10 text-center">
              <h2 id="how-heading" className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]">
                Three steps. Under 2 minutes total.
              </h2>
              <p className="mt-3 text-muted-fg">No spreadsheets. No recipe hunting. No calculating calories by hand.</p>
            </div>
            <div className="mx-auto flex max-w-prose flex-col gap-8">
              {HOW_IT_WORKS.map((s, i) => (
                <div key={s.title} className="flex gap-5">
                  <span aria-hidden="true" className="font-display text-3xl font-black italic text-green-muted">{i + 1}</span>
                  <div>
                    <h3 className="text-lg font-bold">{s.title}</h3>
                    <p className="mt-1 text-muted-fg">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BEFORE / AFTER */}
        <section aria-labelledby="ba-heading" className="bg-parchment py-16 sm:py-20">
          <div className="mx-auto max-w-container px-4 sm:px-5">
            <div className="mb-10 text-center">
              <h2 id="ba-heading" className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]">
                What changes when you stop planning by hand.
              </h2>
            </div>
            <div className="grid gap-8 rounded-lg bg-forest p-7 text-on-forest-strong sm:grid-cols-2 sm:p-12">
              <div>
                <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.07em] text-on-forest-muted">Before Mealzy</h3>
                {BEFORE.map((item) => (
                  <div key={item} className="mb-3.5 flex items-start gap-2.5 text-[0.9rem] leading-[1.55] text-on-forest-body">
                    <X className="mt-0.5 shrink-0" width="14" height="14" strokeWidth="2.5" />
                    <p>{item}</p>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.07em] text-on-forest-muted">After Mealzy</h3>
                {AFTER.map((item) => (
                  <div key={item} className="mb-3.5 flex items-start gap-2.5 text-[0.9rem] leading-[1.55] text-on-forest-body">
                    <Check className="mt-0.5 shrink-0 text-green-light" width="14" height="14" strokeWidth="2.5" />
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <ClosingCtaBand
          title="Your Sunday just got 90 minutes back."
          lede="Mealzy builds the week, hits your macros, and writes the grocery list in about 30 seconds. Free to start — no credit card."
          ctaLabel="Plan My Week Free"
          ctaHref="login.html?signup=1"
        />
      </main>
      <Footer />
    </>
  );
}
