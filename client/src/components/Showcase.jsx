import * as React from 'react';
import Reveal from '@/components/Reveal';
import { Button } from '@/components/ui/button';
import { RangeSlider } from '@/components/ui/field';
import { Sunrise, Bowl, Cutlery, ChevronDown, Swap, Spinner } from '@/components/icons';
import GroceryList from '@/components/GroceryList';
import { cn } from '@/lib/utils';
import {
  planFor, range, dollars, photo, MIN_BUDGET, MAX_BUDGET, BUDGET_STEP,
  DIET_LABEL
} from '@/components/showcase-plan';

const COURSE_ICON = { Breakfast: Sunrise, Lunch: Bowl, Dinner: Cutlery };

const num = (n) => n.toLocaleString('en-US');

/* Turns "$1–$3" into "$2". Turns "$46–$57" into "$52".
 * If it's already a single number, leaves it alone. */
function singleEstimate(rangeStr) {
  if (!rangeStr || typeof rangeStr !== 'string') return rangeStr;
  const match = rangeStr.match(/\$?([\d.]+)\s*[-–—]\s*\$?([\d.]+)/);
  if (!match) return rangeStr;
  const avg = (parseFloat(match[1]) + parseFloat(match[2])) / 2;
  return `$${avg.toFixed(0)}`;
}

function Figure({ label, value, className }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">{label}</p>
      <p className={className}>{value}</p>
    </div>
  );
}

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

function MealRow({ meal, onSwap }) {
  const Icon = COURSE_ICON[meal.course];
  return (
    <li className="flex gap-3.5 py-3 first:pt-0 last:pb-0">
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
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">
          <Icon width="14" height="14" className="shrink-0" />
          {meal.course}
        </p>
        <p className="mt-1 text-[15px] font-medium leading-snug">{meal.name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge accent>Est. {singleEstimate(meal.cost)}</Badge>
          <Badge>{num(meal.kcal)} kcal</Badge>
          <button
            type="button"
            onClick={onSwap}
            aria-label={`Swap ${meal.name}`}
            className="inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded-full border border-green px-2.5 text-xs font-semibold text-green-deep transition-colors duration-200 hover:bg-green hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green motion-reduce:transition-none dark:text-green-light"
          >
            <Swap width="12" height="12" />
            Swap meal
          </button>
        </div>
      </div>
    </li>
  );
}

const cardClasses =
  'flex flex-col overflow-hidden rounded-md border border-border-warm bg-cream shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0';

function DayHeader({ day }) {
  return (
    <header className="bg-forest px-4 py-2.5 text-on-forest">
      <h3 className="font-display text-base font-bold italic">{day}</h3>
    </header>
  );
}

function DayCard({ day, onSwap }) {
  return (
    <li className={cardClasses}>
      <DayHeader day={day.day} />
      <ul role="list" className="divide-y divide-border-warm px-4 py-3.5">
        {day.meals.map((meal) => (
          <MealRow key={meal.course} meal={meal} onSwap={onSwap} />
        ))}
      </ul>
    </li>
  );
}

function MobileCta({ onStartPlan, ctaHref }) {
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
      <Button
        href={ctaHref}
        full
        size="lg"
        tabIndex={show ? undefined : -1}
        onClick={(e) => {
          if (!onStartPlan) return;
          e.preventDefault();
          onStartPlan();
        }}
      >
        Plan my week free
      </Button>
      <p className="mt-2 text-center text-[13px] text-muted-fg">30 seconds · No credit card</p>
    </div>
  );
}

function BudgetPanel({ plan, budget, onChange, pending }) {
  const spendEstimate = singleEstimate(range(plan.spend));
  const budgetLeft = `$${budget - parseFloat(spendEstimate.replace('$', ''))}`;

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
          <span id="showcase-budget-hint">Adjust your budget</span>
          <span>{dollars(MAX_BUDGET * 100)}</span>
        </div>
      </div>

      <div
        aria-live="polite"
        aria-busy={pending}
        className={cn(
          'grid gap-6 border-t border-border-warm pt-6 transition-opacity duration-200 motion-reduce:transition-none sm:grid-cols-3 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0',
          pending && 'opacity-50'
        )}
      >
        <Figure
          label="Est. total spend"
          value={spendEstimate}
          className="mt-2 font-display text-3xl font-bold italic tabular-nums"
        />
        <Figure
          label="Avg. daily calories"
          value={num(plan.kcalAvg)}
          className="mt-2 font-display text-3xl font-bold italic tabular-nums"
        />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">Budget left</p>
          <p className="mt-2 font-display text-[clamp(2.25rem,5vw,3rem)] font-black italic leading-none tabular-nums">
            {budgetLeft}
          </p>
        </div>
      </div>
    </div>
  );
}

const PREVIEW_DAYS = 3;

export default function Showcase({ onStartPlan, budget, planBudget, onBudgetChange, ctaHref = 'login.html?signup=1' }) {
  const plan = React.useMemo(() => planFor(planBudget), [planBudget]);
  const pending = budget !== planBudget;
  const [fullWeek, setFullWeek] = React.useState(false);

  const swapMeal = () => onStartPlan && onStartPlan({ budget });

  const shown = plan.days.slice(0, PREVIEW_DAYS);
  const rest = plan.days.slice(PREVIEW_DAYS);

  return (
    <section id="features" aria-labelledby="showcase-heading" className="bg-parchment py-16 sm:py-20">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <Reveal className="mx-auto mb-10 max-w-prose text-center">
          <h2
            id="showcase-heading"
            className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]"
          >
            Your week, built around you.
          </h2>
          <p className="mt-4 text-[17px] leading-[1.7] text-muted-fg">
            Mealzy combines your grocery budget, calorie target, and dietary preference into one
            weekly plan — not seven meals picked independently. Move the slider to see it adjust.
          </p>
        </Reveal>

        <Reveal className="mx-auto mb-6 flex max-w-prose flex-wrap items-center justify-center gap-2 text-center">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">
            This example week:
          </span>
          <Badge accent>{dollars(budget * 100)} budget</Badge>
          <Badge accent>{num(plan.kcalTarget)} kcal/day</Badge>
          <Badge accent>{DIET_LABEL} diet</Badge>
        </Reveal>

        <Reveal className="rounded-lg border border-green/40 bg-cream p-6 shadow-card sm:p-8">
          <BudgetPanel plan={plan} budget={budget} onChange={onBudgetChange} pending={pending} />
        </Reveal>

        <div aria-hidden="true" className="mt-4 flex h-6 items-center justify-center">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-green/40 bg-green/10 px-3 py-1 text-[13px] font-semibold text-green-deep transition-opacity duration-200 motion-reduce:transition-none dark:text-green-light',
              pending ? 'opacity-100' : 'opacity-0'
            )}
          >
            <Spinner />
            Re-planning your week
          </span>
        </div>

        <div
          aria-busy={pending}
          className={cn(
            'min-h-[600px] transition-opacity duration-200 motion-reduce:transition-none',
            pending && 'opacity-60'
          )}
        >
          <Reveal delay={60} className="mt-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">
              Example week at this budget
            </p>
            <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((day) => (
                <DayCard key={day.day} day={day} onSwap={swapMeal} />
              ))}
            </ul>

            <div id="showcase-rest-of-week">
              {fullWeek && (
                <ul role="list" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((day) => (
                    <DayCard key={day.day} day={day} onSwap={swapMeal} />
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6 text-center">
              <Button
                variant="quiet"
                onClick={() => setFullWeek((open) => !open)}
                aria-expanded={fullWeek}
                aria-controls="showcase-rest-of-week"
                className="border border-border-warm bg-cream hover:bg-muted-bg"
              >
                {fullWeek ? 'Show fewer days' : 'Show Thursday–Sunday'}
                <ChevronDown
                  width="16"
                  height="16"
                  aria-hidden="true"
                  className={cn('transition-transform duration-200 motion-reduce:transition-none', fullWeek && 'rotate-180')}
                />
              </Button>
            </div>
          </Reveal>

          <GroceryList plan={plan} ctaHref={ctaHref} />
        </div>

        <Reveal delay={160} as="p" className="mx-auto mt-10 max-w-prose text-center text-[17px] leading-[1.7]">
          Not a pile of recipes. A week that fits together — budget, calories, and diet, all
          balanced before you shop.
        </Reveal>
      </div>

      <MobileCta onStartPlan={onStartPlan} ctaHref={ctaHref} />
    </section>
  );
}