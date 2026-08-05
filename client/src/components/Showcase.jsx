import * as React from 'react';
import Reveal from '@/components/Reveal';
import { Button } from '@/components/ui/button';
import { RangeSlider } from '@/components/ui/field';
import { Sunrise, Bowl, Cutlery, ChevronDown, Swap } from '@/components/icons';
import GroceryList from '@/components/GroceryList';
import { cn } from '@/lib/utils';
import {
  planFor, range, dollars, photo, MIN_BUDGET, MAX_BUDGET, BUDGET_STEP
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

function MealRow({ meal, onSwap }) {
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
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">
          <Icon width="14" height="14" className="shrink-0" />
          {meal.course}
        </p>
        <p className="mt-1 text-[15px] font-medium leading-snug">{meal.name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge>{num(meal.kcal)} kcal</Badge>
          <Badge accent>Est. {meal.cost}</Badge>
          {/* The page claims any meal can be swapped in one click; this is that
            * claim made touchable. It opens the same preview modal the hero CTA
            * does, seeded with the budget already on screen — the swap itself
            * belongs to the real planner, behind it. The dish name is in the
            * accessible name because there are 9 of these on the page. */}
          <button
            type="button"
            onClick={onSwap}
            aria-label={`Swap ${meal.name}`}
            /* Green edge and green label, where the two badges beside it are
              * warm-bordered and muted: this is the only thing in the row you
              * can press, and a border-border-warm chip sits at 1.26:1 against
              * the card — under the 3:1 WCAG 1.4.11 asks of a control boundary. */
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

/* The day header carries the day and nothing else. The calorie figure that used
 * to sit here repeated on all seven cards and invited the reader to audit the
 * arithmetic; the week's average is stated once, above. */
function DayHeader({ day }) {
  return (
    <header className="bg-forest px-4 py-2.5 text-on-forest">
      <h4 className="font-display text-base font-bold italic">{day}</h4>
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

/* The back half of the week: the same three meals per day without the
 * photography. Three days of images are enough to show what a plan looks
 * like — seven only cost the visitor bandwidth to scroll past. */
function CompactDayCard({ day }) {
  return (
    <li className={cardClasses}>
      <DayHeader day={day.day} />
      <ul role="list" className="divide-y divide-border-warm px-4 py-2">
        {day.meals.map((meal) => (
          <li key={meal.course} className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-fg">
                {meal.course}
              </span>
              <span className="text-[15px] font-medium leading-snug">{meal.name}</span>
            </span>
            <span className="shrink-0 text-[13px] font-medium tabular-nums text-muted-fg">
              {num(meal.kcal)} kcal
            </span>
          </li>
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
      <p className="mt-2 text-center text-[13px] text-muted-fg">30 seconds · No credit card</p>
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
        {/* Stated once for the whole week. Individual days run above and below
          * it — a real week is not seven identical totals — so this is the
          * figure the plan is built to average onto. */}
        <Figure
          label="Avg. daily calories"
          value={num(plan.kcalAvg)}
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

/* Mon–Wed carry the photography; Thu–Sun render as collapsed summary rows. */
const PREVIEW_DAYS = 3;

export default function Showcase({ onStartPlan, budget, onBudgetChange }) {
  const plan = React.useMemo(() => planFor(budget), [budget]);
  /* Open by default: the claim is a full seven-day plan, so all seven days are
   * on screen without asking. The toggle stays so the page can be collapsed
   * back down to the three photographed days. */
  const [fullWeek, setFullWeek] = React.useState(true);

  /* Seeded with the budget the visitor has already set here, so the modal opens
   * on their week rather than on the default one. */
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
            Your week, planned and ready to shop.
          </h2>
          <p className="mt-4 text-[17px] leading-[1.7] text-muted-fg">
            Set your budget and watch the whole week re-plan itself — every meal counted, every
            ingredient priced.
          </p>
        </Reveal>

        {/* The slider drives every number below it, and it is the same budget
          * the hero form is set to — one value, two places to move it. */}
        <Reveal className="rounded-lg border border-green/40 bg-cream p-6 shadow-card sm:p-8">
          <BudgetPanel plan={plan} budget={budget} onChange={onBudgetChange} />
        </Reveal>

        <Reveal delay={60} className="mt-8">
          <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((day) => (
              <DayCard key={day.day} day={day} onSwap={swapMeal} />
            ))}
          </ul>

          <div className="mt-6 text-center">
            <Button
              variant="quiet"
              onClick={() => setFullWeek((open) => !open)}
              aria-expanded={fullWeek}
              aria-controls="showcase-rest-of-week"
              className="border border-border-warm bg-cream hover:bg-muted-bg"
            >
              {fullWeek ? 'Show fewer days' : 'Show full week'}
              <ChevronDown
                width="16"
                height="16"
                aria-hidden="true"
                className={cn('transition-transform duration-200 motion-reduce:transition-none', fullWeek && 'rotate-180')}
              />
            </Button>
          </div>

          <div id="showcase-rest-of-week">
            {fullWeek && (
              <ul role="list" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {rest.map((day) => (
                  <CompactDayCard key={day.day} day={day} />
                ))}
              </ul>
            )}
          </div>
        </Reveal>

        <GroceryList plan={plan} />

        {/* Replaces the Mealzy-vs-ChatGPT table that used to sit below this
         * section: one line of positioning instead of a five-row teardown. */}
        <Reveal delay={160} as="p" className="mx-auto mt-10 max-w-prose text-center text-[17px] leading-[1.7]">
          Unlike generic recipe sites, every plan balances to your budget target before you shop.
        </Reveal>

        <Reveal delay={200} as="p" className="mt-6 text-center text-sm text-muted-fg">
          Sample 7-day plan generated from preferences. Prices are estimates and scale with the
          budget you set.
        </Reveal>
      </div>

      <MobileCta onStartPlan={onStartPlan} />
    </section>
  );
}
