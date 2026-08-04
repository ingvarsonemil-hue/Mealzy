import * as React from 'react';
import Reveal from '@/components/Reveal';
import { Button } from '@/components/ui/button';
import { Sunrise, Bowl, Cutlery } from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  planFor, range, dollars, BASE_BUDGET, MIN_BUDGET, MAX_BUDGET, BUDGET_STEP
} from '@/components/showcase-plan';

const COURSE_ICON = { Breakfast: Sunrise, Lunch: Bowl, Dinner: Cutlery };

const num = (n) => n.toLocaleString('en-US');

function Figure({ label, value, className }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">{label}</p>
      <p className={className}>{value}</p>
    </div>
  );
}

function MealCard({ meal }) {
  return (
    <li
      className="rounded-md border border-border-warm bg-cream p-4 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-green-deep dark:text-green-light">
        {meal.day}
      </p>
      <p className="mt-1.5 text-[17px] font-medium leading-snug">{meal.name}</p>
      <p className="mt-2 inline-flex items-baseline gap-1.5 rounded-full border border-border-warm bg-muted-bg px-2.5 py-1 text-[13px] font-medium tabular-nums text-muted-fg">
        <span>{num(meal.kcal)} kcal</span>
        <span aria-hidden="true">·</span>
        <span>Est. {meal.cost}</span>
      </p>
    </li>
  );
}

/* Floating bar for small screens, revealed once the hero has scrolled away and
 * pulled back before the footer so it never sits on top of it. */
function MobileCta({ onStartPlan }) {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    const hero = document.getElementById('hero');
    const footer = document.querySelector('footer');

    const sync = () => {
      const pastHero = hero
        ? hero.getBoundingClientRect().bottom <= 0
        : window.scrollY > window.innerHeight;
      const atFooter = footer ? footer.getBoundingClientRect().top <= window.innerHeight : false;
      setShow(pastHero && !atFooter);
    };

    sync();
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  return (
    <div
      inert={!show}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border-warm bg-cream px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-lg transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden dark:bg-[var(--clr-page-dark)]',
        show ? 'translate-y-0' : 'translate-y-full'
      )}
    >
      {/* Same as the hero CTA: opens the 3-step preview, href is the no-JS fallback. */}
      <Button
        href="login.html?signup=1"
        full
        size="lg"
        tabIndex={show ? undefined : -1}
        onClick={(e) => {
          if (!onStartPlan) return;
          e.preventDefault();
          onStartPlan();
        }}
      >
        Build My Free Plan
      </Button>
      <p className="mt-2 text-center text-[13px] text-muted-fg">Under 1 minute · No credit card</p>
    </div>
  );
}

function BudgetPanel({ plan, budget, onChange }) {
  const fill = ((budget - MIN_BUDGET) / (MAX_BUDGET - MIN_BUDGET)) * 100;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-12">
      <div>
        <label
          htmlFor="showcase-budget"
          className="text-xs font-bold uppercase tracking-[0.08em] text-muted-fg"
        >
          Weekly budget
        </label>
        <p className="mt-1 font-display text-[clamp(2.5rem,5vw,3.5rem)] font-black italic leading-none tabular-nums">
          {dollars(budget * 100)}
        </p>
        <input
          id="showcase-budget"
          type="range"
          min={MIN_BUDGET}
          max={MAX_BUDGET}
          step={BUDGET_STEP}
          value={budget}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-describedby="showcase-budget-hint"
          style={{
            background: `linear-gradient(to right, var(--color-green) ${fill}%, var(--color-border) ${fill}%)`
          }}
          className="mt-5 h-2 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-green [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-cream [&::-moz-range-thumb]:bg-green [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-cream [&::-webkit-slider-thumb]:bg-green [&::-webkit-slider-thumb]:shadow-button"
        />
        <div className="mt-2 flex justify-between text-[13px] tabular-nums text-muted-fg">
          <span>{dollars(MIN_BUDGET * 100)}</span>
          <span id="showcase-budget-hint">Drag to re-plan the week</span>
          <span>{dollars(MAX_BUDGET * 100)}</span>
        </div>
      </div>

      <div
        aria-live="polite"
        className="grid gap-6 border-t border-border-warm pt-6 sm:grid-cols-3 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0"
      >
        <Figure
          label="Estimated spend"
          value={range(plan.spend)}
          className="mt-2 font-display text-3xl font-bold italic tabular-nums"
        />
        <Figure
          label="Daily calories"
          value={num(plan.kcalTarget)}
          className="mt-2 font-display text-3xl font-bold italic tabular-nums"
        />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">Left in budget</p>
          <p className="mt-2 font-display text-[clamp(2.25rem,5vw,3rem)] font-black italic leading-none tabular-nums text-green dark:text-green-light">
            {range(plan.saved)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Showcase({ onStartPlan }) {
  const [budget, setBudget] = React.useState(BASE_BUDGET);
  const plan = React.useMemo(() => planFor(budget), [budget]);

  return (
    <section id="features" aria-labelledby="showcase-heading" className="bg-parchment py-16 sm:py-20">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <Reveal className="mx-auto mb-10 max-w-prose text-center">
          <span className="mb-4 inline-block rounded-full bg-green px-4 py-1 text-xs font-bold uppercase tracking-[0.08em] text-white">
            Product preview
          </span>
          <h2
            id="showcase-heading"
            className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]"
          >
            Your week, planned and ready to shop.
          </h2>
          <p className="mt-4 text-[17px] leading-[1.7] text-muted-fg">
            Set your budget and watch the whole week re-plan itself — every meal counted, every
            ingredient priced.
          </p>
        </Reveal>

        {/* The slider drives every number below it. */}
        <Reveal className="rounded-lg border border-green/40 bg-cream p-6 shadow-card sm:p-8">
          <BudgetPanel plan={plan} budget={budget} onChange={setBudget} />
        </Reveal>

        {plan.courses.map(([course, meals], i) => {
          const Icon = COURSE_ICON[course];
          return (
            <Reveal key={course} delay={60 + i * 40} className="mt-8">
              <h3 className="flex items-center gap-2.5 font-display text-xl font-bold italic">
                <Icon className="shrink-0 text-green dark:text-green-light" />
                {course}
              </h3>
              <ul
                role="list"
                className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              >
                {meals.map((meal) => (
                  <MealCard key={`${course}-${meal.day}`} meal={meal} />
                ))}
              </ul>
            </Reveal>
          );
        })}

        <Reveal delay={100} className="mt-8 min-w-0 rounded-lg border border-border-warm bg-cream p-6 shadow-card">
          <h3 className="font-display text-2xl font-bold leading-[1.15] tracking-[-0.01em]">The grocery list</h3>
          <div className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
            {plan.groceries.map(([aisle, items]) => (
              <div key={aisle} className="min-w-0">
                <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.08em] text-green-deep dark:text-green-light">{aisle}</p>
                {items.map(([item, cents]) => (
                  <div key={item} className="flex items-baseline py-1 text-[15px]">
                    <span>{item}</span>
                    <span className="receipt-dots" aria-hidden="true" />
                    <span className="font-medium tabular-nums">{range(cents)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-baseline justify-between border-t border-border-warm pt-4 text-base font-bold">
            <span>Week total</span>
            <span className="tabular-nums">Est. {range(plan.spend)}</span>
          </div>
        </Reveal>

        {/* Replaces the Mealzy-vs-ChatGPT table that used to sit below this
         * section: one line of positioning instead of a five-row teardown. */}
        <Reveal delay={160} as="p" className="mx-auto mt-10 max-w-prose text-center text-[17px] leading-[1.7]">
          Unlike generic recipe sites, every plan balances to your budget target before you shop.
        </Reveal>

        <Reveal delay={200} as="p" className="mt-6 text-center text-sm text-muted-fg">
          Sample plan, built in under 1 minute. Prices are estimates and scale with the
          budget you set.
        </Reveal>
      </div>

      <MobileCta onStartPlan={onStartPlan} />
    </section>
  );
}
