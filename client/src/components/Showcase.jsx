import * as React from 'react';
import Reveal from '@/components/Reveal';
import { Button } from '@/components/ui/button';
import { RangeSlider } from '@/components/ui/field';
import { Sunrise, Bowl, Cutlery, Phone } from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  planFor, range, dollars, photo, BASE_BUDGET, MIN_BUDGET, MAX_BUDGET, BUDGET_STEP
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

/* Calories and cost read as two separate chips rather than one run-on line, so
 * the week can be scanned down either column. */
function Badge({ children, accent }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums',
        accent
          ? 'border-green/40 bg-green/10 text-green-deep dark:text-green-light'
          : 'border-border-warm bg-muted-bg text-muted-fg'
      )}
    >
      {children}
    </span>
  );
}

function MealRow({ meal }) {
  const Icon = COURSE_ICON[meal.course];
  return (
    <li className="flex gap-3.5 py-3 first:pt-0 last:pb-0">
      {/* Decorative: the dish is named in the text beside it, so an alt here
        * would only repeat what a screen reader has already read out. */}
      <img
        src={photo(meal.img)}
        srcSet={`${photo(meal.img)} 1x, ${photo(meal.img, 800)} 2x`}
        alt=""
        width="96"
        height="67"
        loading="lazy"
        decoding="async"
        className="h-[67px] w-24 shrink-0 rounded-sm bg-muted-bg object-cover"
      />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">
          <Icon width="14" height="14" className="shrink-0" />
          {meal.course}
        </p>
        <p className="mt-1 text-[15px] font-medium leading-snug">{meal.name}</p>
        <p className="mt-2 flex flex-wrap gap-1.5">
          <Badge>{num(meal.kcal)} kcal</Badge>
          <Badge accent>Est. {meal.cost}</Badge>
        </p>
      </div>
    </li>
  );
}

function DayCard({ day }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-md border border-border-warm bg-cream shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <header className="flex items-baseline justify-between gap-3 bg-forest px-4 py-2.5 text-on-forest">
        <h4 className="font-display text-base font-bold italic">{day.day}</h4>
        <span className="text-xs tabular-nums text-on-forest-muted">{num(day.kcal)} kcal</span>
      </header>
      <ul role="list" className="divide-y divide-border-warm px-4 py-3.5">
        {day.meals.map((meal) => (
          <MealRow key={meal.course} meal={meal} />
        ))}
      </ul>
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
        <RangeSlider
          id="showcase-budget"
          min={MIN_BUDGET}
          max={MAX_BUDGET}
          step={BUDGET_STEP}
          value={budget}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-describedby="showcase-budget-hint"
          className="mt-5"
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

/* One shoppable line: name, the amount this week needs, and the estimated cost. */
function GroceryLine({ item, qty, cents }) {
  return (
    <div className="flex items-baseline py-1 text-[15px]">
      <span className="shrink-0">
        {item} <span className="text-muted-fg">{qty}</span>
      </span>
      <span className="receipt-dots" aria-hidden="true" />
      <span className="shrink-0 font-medium tabular-nums">{range(cents)}</span>
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

        <Reveal delay={60} as="ul" role="list" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {plan.days.map((day) => (
            <DayCard key={day.day} day={day} />
          ))}
        </Reveal>

        <Reveal delay={100} className="mt-8 min-w-0 rounded-lg border border-border-warm bg-cream p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-2xl font-bold leading-[1.15] tracking-[-0.01em]">The grocery list</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green/40 bg-green/10 px-3 py-1 text-[13px] font-semibold text-green-deep dark:text-green-light">
              <Phone />
              Works on your phone
            </span>
          </div>
          <p className="mt-2 text-[15px] leading-[1.6] text-muted-fg">
            Tick items off in the aisle — the list opens in any browser, nothing to install.
          </p>

          <div className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
            {plan.fresh.map(([aisle, items]) => (
              <div key={aisle} className="min-w-0">
                <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.08em] text-green-deep dark:text-green-light">{aisle}</p>
                {items.map(([item, qty, cents]) => (
                  <GroceryLine key={item} item={item} qty={qty} cents={cents} />
                ))}
              </div>
            ))}

            {/* Kept apart from the shop-this-week aisles: these are cupboard
              * items the plan draws on, priced at the share it uses rather
              * than as a full pack you have to buy again. */}
            <div className="min-w-0">
              <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">
                Pantry staples
              </p>
              {plan.pantry.map(([item, qty, cents]) => (
                <GroceryLine key={item} item={item} qty={qty} cents={cents} />
              ))}
              <p className="mt-2 text-[13px] leading-[1.5] text-muted-fg">
                Priced at what the week uses, not a full pack — most of these are already in your
                cupboard.
              </p>
            </div>
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
