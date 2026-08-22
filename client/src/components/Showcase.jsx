import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Sunrise, Bowl, Cutlery, ChevronDown } from '@/components/icons';
import GroceryList from '@/components/GroceryList';
import { cn, prefersReducedMotion } from '@/lib/utils';
import { track } from '@/lib/api';
import {
  planFor, dollars, singleEstimate,
  BASE_BUDGET, DIET_OPTIONS, COOK_TIME_OPTIONS
} from '@/components/showcase-plan';
import { StepProgress, BudgetStep, DietStep, TimeStep, BuildingStep } from '@/components/ShowcaseSteps';

/* The homepage pre-onboarding: three questions (budget, diet, cooking time),
 * a brief "building" transition, then a result that (a) states the visitor's
 * own answers back to them and (b) shows a clearly-labeled static example
 * week scaled to their budget — never implying the example itself was
 * filtered by diet or time, since the sample data can't honestly do that.
 * See client/src/components/showcase-plan.js for why. */

const TOTAL_STEPS = 3;
const COURSE_ICON = { Breakfast: Sunrise, Lunch: Bowl, Dinner: Cutlery };
const num = (n) => n.toLocaleString('en-US');

/* No food photography here on purpose — the homepage Showcase example is a
 * planner, not a recipe gallery. Each row is the same four facts a real
 * Mealzy plan gives you: day, meal type, meal name, and its price/calories —
 * the planning UI is the visual, not a stock photo. Price leads as the
 * prominent secondary value; calories stay small — more metadata isn't what
 * the freed-up space (from removing photos) is for. */
function MealRow({ meal }) {
  const Icon = COURSE_ICON[meal.course];
  return (
    <li className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green/10 text-green-deep dark:text-green-light">
        <Icon width="20" height="20" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">{meal.course}</p>
        <p className="mt-0.5 text-lg font-semibold leading-snug">{meal.name}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-lg font-bold tabular-nums text-green-deep dark:text-green-light">
          Est. {singleEstimate(meal.cost)}
        </span>
        <span className="text-xs tabular-nums text-muted-fg">{num(meal.kcal)} kcal</span>
      </div>
    </li>
  );
}

/* Sum of the same per-meal estimates the rows above render — the total can
 * never disagree with what's on screen because it's derived from it. */
function dayTotal(day) {
  return day.meals.reduce((sum, meal) => sum + parseFloat(singleEstimate(meal.cost).replace('$', '')), 0);
}

const cardClasses =
  'flex flex-col overflow-hidden rounded-lg border border-border-warm bg-cream shadow-sm';

function DayCard({ day }) {
  return (
    <li className={cardClasses}>
      <header className="bg-forest px-5 py-3.5 text-on-forest">
        <h4 className="font-display text-xl font-bold italic uppercase tracking-[0.02em]">{day.day}</h4>
      </header>
      <ul role="list" className="divide-y divide-border-warm px-5 py-1">
        {day.meals.map((meal) => (
          <MealRow key={meal.course} meal={meal} />
        ))}
      </ul>
      <p className="border-t border-border-warm px-5 py-3 text-sm font-bold text-foreground">
        {day.day} planned · <span className="tabular-nums">${dayTotal(day).toFixed(0)}</span>
      </p>
    </li>
  );
}

/* The visitor's own answers, restated as three substantial blocks rather than
 * a line of small text — this is the thing that should read as "the star" of
 * the completed state, not the static example underneath it. Real diet
 * labels range from "Vegan" to "Mediterranean" to "No preference" — long
 * values step down a size and wrap onto two lines instead of overflowing the
 * card, rather than shrinking every value to fit the longest one. */
function ConstraintCard({ value, label }) {
  const long = value.length > 9;
  return (
    <div className="rounded-lg border border-green/30 bg-cream px-2 py-4 text-center shadow-sm">
      <p
        className={cn(
          'break-words font-display font-bold italic leading-tight',
          long ? 'text-base sm:text-lg' : 'text-xl tabular-nums sm:text-2xl'
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-fg">{label}</p>
    </div>
  );
}

function MobileCta({ phase, claimHref, onScrollUp }) {
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

  const done = phase === 'result';

  return (
    <div
      inert={!show}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border-warm bg-cream px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-lg transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden dark:bg-[var(--clr-page-dark)]',
        show ? 'translate-y-0' : 'translate-y-full'
      )}
    >
      <Button
        href={done ? claimHref : undefined}
        full
        size="lg"
        tabIndex={show ? undefined : -1}
        onClick={done ? () => track('homepage_demo_cta_clicked', {}) : onScrollUp}
      >
        {done ? 'Build my real week' : 'Plan my week free'}
      </Button>
      <p className="mt-2 text-center text-[13px] text-muted-fg">30 seconds · No credit card</p>
    </div>
  );
}

/* One day by default — enough to prove Mealzy plans a whole week without the
 * static example outweighing the visitor's own answers above it. */
const PREVIEW_DAYS = 1;
const MEALS_PER_DAY = 3;

export default function Showcase() {
  const [phase, setPhase] = React.useState('budget');
  const [budget, setBudget] = React.useState(BASE_BUDGET);
  const [diet, setDiet] = React.useState('');
  const [cookingTime, setCookingTime] = React.useState(30);
  const [fullWeek, setFullWeek] = React.useState(false);

  const startedRef = React.useRef(false);
  const markStarted = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    track('homepage_demo_started', {});
  };

  const resultTrackedRef = React.useRef(false);
  React.useEffect(() => {
    if (phase !== 'result' || resultTrackedRef.current) return;
    resultTrackedRef.current = true;
    track('homepage_demo_completed', {});
    track('homepage_demo_result_viewed', {});
  }, [phase]);

  const goDiet = () => { markStarted(); track('homepage_demo_step_completed', { step: 1 }); setPhase('diet'); };
  const goTime = () => { track('homepage_demo_step_completed', { step: 2 }); setPhase('time'); };
  const goBuilding = () => { track('homepage_demo_step_completed', { step: 3 }); setPhase('building'); };

  const dietLabel = DIET_OPTIONS.find((o) => o.value === diet)?.label || 'No preference';
  /* Every option is a real cap the generation prompt enforces — including 60
   * — so all three read the same way, not "flexible" for the largest one. */
  const timeLabel = `≤${cookingTime} min cooking`;
  const timeValue = `≤${cookingTime} min`;

  const checks = React.useMemo(() => [
    `${dollars(budget * 100)} budget set`,
    `${dietLabel} diet set`,
    `${cookingTime} min cooking time set`,
    'Ready to build your real plan'
  ], [budget, dietLabel, cookingTime]);

  const plan = React.useMemo(() => planFor(budget), [budget]);
  const shown = plan.days.slice(0, PREVIEW_DAYS);
  const rest = plan.days.slice(PREVIEW_DAYS);
  const restMealsCount = rest.length * MEALS_PER_DAY;

  const claimHref = React.useMemo(() => {
    const params = new URLSearchParams({ signup: '1', budget: String(budget), cookingTime: String(cookingTime) });
    if (diet) params.set('dietary', diet);
    return `login.html?${params}`;
  }, [budget, diet, cookingTime]);

  const scrollUp = () => {
    document.getElementById('showcase')?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start'
    });
  };

  const toggleFullWeek = () => {
    const next = !fullWeek;
    setFullWeek(next);
    if (next) track('homepage_demo_week_expanded', {});
  };

  return (
    <section id="showcase" aria-labelledby="showcase-heading" className="bg-parchment py-16 sm:py-20">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <div className="mx-auto mb-10 max-w-prose text-center">
          <h2
            id="showcase-heading"
            className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]"
          >
            Start building your week.
          </h2>
          <p className="mt-4 text-[17px] leading-[1.7] text-muted-fg">
            Set your budget, diet and cooking time. Mealzy handles the planning.
          </p>
        </div>

        {phase !== 'result' && phase !== 'building' && <StepProgress step={{ budget: 1, diet: 2, time: 3 }[phase]} total={TOTAL_STEPS} />}

        {phase === 'budget' && <BudgetStep budget={budget} onChange={setBudget} onContinue={goDiet} />}
        {phase === 'diet' && (
          <DietStep diet={diet} onSelect={setDiet} onContinue={goTime} options={DIET_OPTIONS} />
        )}
        {phase === 'time' && (
          <TimeStep cookingTime={cookingTime} onSelect={setCookingTime} onContinue={goBuilding} options={COOK_TIME_OPTIONS} />
        )}
        {phase === 'building' && <BuildingStep checks={checks} onDone={() => setPhase('result')} />}

        {phase === 'result' && (
          <>
            {/* Personalized handoff: the star of the completed state. This is
             * the only content on the page built from the visitor's own
             * answers, and it carries the primary CTA — the static example
             * below is boxed separately and exists only as supporting proof. */}
            <div className="mx-auto max-w-xl rounded-lg border border-green/40 bg-cream p-6 text-center shadow-card sm:p-8">
              <h3 className="font-display text-2xl font-bold italic leading-[1.15] sm:text-3xl">Your setup is ready.</h3>
              <p className="mt-2 text-[15px] leading-[1.6] text-muted-fg">
                We'll use these when we build your real Mealzy plan.
              </p>

              <div className="mx-auto mt-6 grid max-w-lg grid-cols-3 gap-1.5 sm:gap-3">
                <ConstraintCard value={`${dollars(budget * 100)}/week`} label="Budget" />
                <ConstraintCard value={dietLabel} label="Diet" />
                <ConstraintCard value={timeValue} label="Cooking time" />
              </div>

              <Button
                href={claimHref}
                full
                size="lg"
                className="mt-7"
                onClick={() => track('homepage_demo_cta_clicked', {})}
              >
                Build my real week
              </Button>
              <button
                type="button"
                onClick={() => { setFullWeek(false); setPhase('budget'); }}
                className="mx-auto mt-3 flex min-h-[44px] cursor-pointer items-center justify-center px-2 text-sm text-muted-fg underline underline-offset-2 hover:text-foreground"
              >
                Change my answers
              </button>
            </div>

            {/* Everything below is the static demonstration, boxed and
             * relabeled so it can never read as "your" personalized week —
             * see showcase-plan.js for why the sample data can't honestly be
             * filtered by the diet/time the visitor just picked. One day is
             * shown by default so this stays supporting evidence rather than
             * outweighing the setup above it. */}
            <div className="mx-auto mt-14 max-w-3xl">
              <div className="mx-auto flex max-w-prose flex-col items-center text-center">
                <span className="h-px w-12 bg-border-warm" aria-hidden="true" />
                <h3 className="mt-5 font-display text-[clamp(1.5rem,2vw+0.9rem,2rem)] font-bold italic leading-[1.15]">
                  See what a Mealzy week looks like
                </h3>
                <span className="mt-3 inline-flex items-center rounded-full border border-border-warm bg-cream px-3 py-1 text-xs font-bold uppercase tracking-[0.06em] text-muted-fg">
                  Example plan — not generated from your selections
                </span>
              </div>

              <div className="mt-6 rounded-2xl border border-dashed border-border-warm bg-muted-bg p-4 sm:p-6 lg:p-8">
                <p className="mx-auto max-w-prose text-center text-[15px] leading-[1.6] text-muted-fg">
                  One day from a sample week at your {dollars(budget * 100)} budget. Your real week — filtered
                  by the diet and cooking time you just chose — is built after you continue.
                </p>

                <ul role="list" className="mx-auto mt-6 max-w-md">
                  {shown.map((day) => (
                    <DayCard key={day.day} day={day} />
                  ))}
                </ul>

                <div id="showcase-rest-of-week">
                  {fullWeek && (
                    <ul role="list" className="mx-auto mt-4 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {rest.map((day) => (
                        <DayCard key={day.day} day={day} />
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-6 text-center">
                  <Button
                    variant="quiet"
                    onClick={toggleFullWeek}
                    aria-expanded={fullWeek}
                    aria-controls="showcase-rest-of-week"
                    className="border border-border-warm bg-cream hover:bg-muted-bg"
                  >
                    {fullWeek ? 'Show fewer meals' : `+ ${restMealsCount} more meals planned in a full week`}
                    <ChevronDown
                      width="16"
                      height="16"
                      aria-hidden="true"
                      className={cn('transition-transform duration-200 motion-reduce:transition-none', fullWeek && 'rotate-180')}
                    />
                  </Button>
                </div>

                <p className="mx-auto mt-4 max-w-prose text-center text-[15px] leading-[1.6] text-muted-fg">
                  21 meals become one grocery list. Mealzy turns the whole week into one organized shopping list.
                </p>

                <GroceryList plan={plan} ctaHref={claimHref} />
              </div>
            </div>
          </>
        )}
      </div>

      <MobileCta phase={phase} claimHref={claimHref} onScrollUp={scrollUp} />
    </section>
  );
}
