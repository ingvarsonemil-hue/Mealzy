import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Check, X } from '@/components/icons';
import { money } from '@/components/showcase-plan';
import { track } from '@/lib/api';
import { cn } from '@/lib/utils';

/* The first-30-seconds flow. Three steps behind one modal:
 *   targets -> loading (1.5 s) -> reveal
 * Launched by the hero and mobile sticky CTAs instead of dropping a
 * first-time visitor onto an empty signup form. Every number shown is
 * derived from the selections by planPreview() below — nothing here is
 * a placeholder, and the same selections always produce the same plan. */

const BUDGETS = [40, 60, 80, 120];
const HOUSEHOLDS = [1, 2, 3, 4];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* `signup` is the value handed to the signup page so the choice survives
 * the jump; it matches the dietary values server.js already accepts. */
const DIETS = [
  {
    id: 'balanced', label: 'Balanced', signup: 'none', kcal: 2100,
    dinners: [
      'Herb-Crusted Salmon', 'Chicken Stir-Fry', 'Beef & Black Bean Tacos',
      'Pasta Pomodoro', 'Coconut Veggie Curry', 'Roast Chicken & Veg', 'Baked Cod & Greens'
    ]
  },
  {
    id: 'high-protein', label: 'High Protein', signup: 'high-protein', kcal: 2200,
    dinners: [
      'Grilled Chicken & Quinoa', 'Turkey Chili', 'Steak & Roast Potatoes',
      'Tuna Steak & Edamame', 'Cottage Cheese Pasta Bake', 'Pork Loin & Green Beans',
      'Shrimp & Egg Fried Rice'
    ]
  },
  {
    id: 'vegan', label: 'Vegan', signup: 'vegan', kcal: 2000,
    dinners: [
      'Chickpea Tikka Masala', 'Black Bean Burrito Bowl', 'Peanut Tofu Noodles',
      'Lentil Shepherd’s Pie', 'Mushroom & Barley Risotto', 'Roasted Cauliflower Tacos',
      'Red Curry Tempeh'
    ]
  },
  {
    id: 'keto', label: 'Keto', signup: 'keto', kcal: 1900,
    dinners: [
      'Garlic Butter Salmon', 'Chicken Alfredo Zoodles', 'Beef & Broccoli Skillet',
      'Egg Roll in a Bowl', 'Pesto Chicken Bake', 'Cauliflower Cottage Pie',
      'Ribeye & Asparagus'
    ]
  }
];

const LOADING_STEPS = [
  'Searching local ingredient pricing...',
  'Balancing macro ratios...',
  'Eliminating cross-recipe grocery waste...'
];

/* 500 ms per line, three lines — 1.5 s total. */
const STEP_MS = 500;

/* A planned week lands just under budget, the same 96.4% ratio the Showcase
 * sample uses ($57.84 of $60), so the two previews never contradict each other. */
const SPEND_RATIO = 0.964;

/* Fixed per-day weights (sum exactly 1) so the seven rows always add up to the
 * week total — no rounding drift between the table and the figure above it. */
const DAY_WEIGHTS = [0.15, 0.138, 0.145, 0.132, 0.15, 0.144, 0.141];

/**
 * Build the previewed week. Pure and deterministic.
 * The budget is the whole household's weekly grocery spend; household size
 * changes portions, not the total, so it only divides the per-person figure.
 */
export function planPreview({ budget, dietId, household }) {
  const diet = DIETS.find((d) => d.id === dietId) || DIETS[0];
  const spend = Math.round(budget * 100 * SPEND_RATIO);

  /* Distribute in whole cents, then settle the remainder on the last day so
   * the rows sum to `spend` exactly rather than approximately. */
  const head = DAY_WEIGHTS.slice(0, -1).map((w) => Math.round(spend * w));
  const cents = [...head, spend - head.reduce((n, c) => n + c, 0)];

  return {
    diet,
    spend,
    saved: budget * 100 - spend,
    perPersonDay: Math.round(spend / household / 7),
    days: DAYS.map((day, i) => ({ day, dinner: diet.dinners[i], cents: cents[i] }))
  };
}

/* ── Step 1 ──────────────────────────────────────────────────────────────── */

function Choice({ selected, children, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'min-h-[44px] cursor-pointer rounded-md border px-3 py-2 text-[15px] font-semibold transition-[background-color,border-color,color] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green motion-reduce:transition-none',
        selected
          ? 'border-green bg-green text-white shadow-button'
          : 'border-border-warm bg-muted-bg text-foreground hover:border-green'
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <fieldset className="mt-6 first:mt-0">
      <legend className="text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">
        {label}
      </legend>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
      {hint && <p className="mt-2 text-[13px] text-muted-fg">{hint}</p>}
    </fieldset>
  );
}

function TargetsStep({ budget, setBudget, dietId, setDietId, household, setHousehold, onSubmit }) {
  return (
    <>
      <Field label="Weekly grocery budget">
        {BUDGETS.map((b) => (
          <Choice key={b} selected={b === budget} onClick={() => setBudget(b)}>
            ${b}
          </Choice>
        ))}
      </Field>

      <Field label="Dietary style">
        {DIETS.map((d) => (
          <Choice key={d.id} selected={d.id === dietId} onClick={() => setDietId(d.id)}>
            {d.label}
          </Choice>
        ))}
      </Field>

      <Field label="Household size" hint="Portions scale to the number of people eating.">
        {HOUSEHOLDS.map((n) => (
          <Choice key={n} selected={n === household} onClick={() => setHousehold(n)}>
            {n} {n === 1 ? 'person' : 'people'}
          </Choice>
        ))}
      </Field>

      <Button full size="lg" className="mt-7" onClick={onSubmit}>
        Build My Week
      </Button>
      <p className="mt-3 text-center text-[13px] text-muted-fg">
        No account needed to see the plan.
      </p>
    </>
  );
}

/* ── Step 2 ──────────────────────────────────────────────────────────────── */

function LoadingStep({ phase }) {
  return (
    <div className="py-6">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted-bg">
        <div
          className="h-full rounded-full bg-green transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${((phase + 1) / LOADING_STEPS.length) * 100}%` }}
        />
      </div>

      <ul role="status" aria-live="polite" className="mt-6 grid gap-3">
        {LOADING_STEPS.map((label, i) => {
          const done = i < phase;
          const active = i === phase;
          return (
            <li
              key={label}
              className={cn(
                'flex items-center gap-3 text-[15px] transition-opacity duration-300 motion-reduce:transition-none',
                active ? 'font-medium text-foreground' : done ? 'text-muted-fg' : 'text-muted-fg opacity-45'
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="text-green dark:text-green-light" />
                ) : active ? (
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-green/30 border-t-green motion-reduce:animate-none"
                  />
                ) : (
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-border-warm" />
                )}
              </span>
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Step 3 ──────────────────────────────────────────────────────────────── */

function Stat({ label, value, accent }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">{label}</p>
      <p
        className={cn(
          'mt-1.5 font-display text-2xl font-bold italic tabular-nums',
          accent && 'text-green dark:text-green-light'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function RevealStep({ plan, household, onClaim, onBack }) {
  const people = household === 1 ? '1 person' : `${household} people`;
  return (
    <>
      <div className="grid grid-cols-3 gap-4 rounded-md border border-border-warm bg-muted-bg p-4">
        <Stat label="Week spend" value={money(plan.spend)} />
        <Stat label="Per person / day" value={money(plan.perPersonDay)} />
        <Stat label="Under budget" value={`+${money(plan.saved)}`} accent />
      </div>

      <h3 className="mt-6 font-display text-lg font-bold italic">Your 7 days</h3>
      <ul role="list" className="mt-3 divide-y divide-border-warm border-y border-border-warm">
        {plan.days.map(({ day, dinner, cents }) => (
          <li key={day} className="flex items-baseline gap-3 py-2.5 text-[15px]">
            <span className="w-9 shrink-0 text-xs font-bold uppercase tracking-[0.08em] text-green-deep dark:text-green-light">
              {day}
            </span>
            <span className="min-w-0 flex-1 truncate">{dinner}</span>
            <span className="shrink-0 font-medium tabular-nums">{money(cents)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[13px] text-muted-fg">
        Each day covers all three meals for {people}, at about {plan.diet.kcal.toLocaleString('en-US')} kcal
        each. Dinners shown; breakfasts and lunches are planned too.
      </p>

      <Button full size="lg" className="mt-6" onClick={onClaim}>
        Claim This Exact Plan (Free Signup)
      </Button>
      <p className="mt-3 text-center text-[13px] text-muted-fg">
        3 free plans a month &middot; No credit card
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mx-auto mt-4 block cursor-pointer text-sm text-muted-fg underline underline-offset-2 hover:text-foreground"
      >
        Change my targets
      </button>
    </>
  );
}

/* ── Shell ───────────────────────────────────────────────────────────────── */

const TITLES = {
  targets: 'Three questions. One week of meals.',
  loading: 'Planning your week...',
  reveal: 'Here is your week.'
};

export default function InteractiveOnboarding({ open, onOpenChange }) {
  const [step, setStep] = React.useState('targets');
  const [phase, setPhase] = React.useState(0);
  const [budget, setBudget] = React.useState(60);
  const [dietId, setDietId] = React.useState('balanced');
  const [household, setHousehold] = React.useState(2);

  const plan = React.useMemo(
    () => planPreview({ budget, dietId, household }),
    [budget, dietId, household]
  );

  /* Drives step 2: one line every 500 ms, then straight into the reveal. */
  React.useEffect(() => {
    if (step !== 'loading') return undefined;
    setPhase(0);
    const timers = [
      setTimeout(() => setPhase(1), STEP_MS),
      setTimeout(() => setPhase(2), STEP_MS * 2),
      setTimeout(() => setStep('reveal'), STEP_MS * 3)
    ];
    return () => timers.forEach(clearTimeout);
  }, [step]);

  const generate = () => {
    setStep('loading');
    track('onboarding_targets_set', { budget, diet: dietId, household });
  };

  const claim = () => {
    track('onboarding_claim', { budget, diet: dietId, household });
    const params = new URLSearchParams({
      signup: '1',
      budget: String(budget),
      dietary: plan.diet.signup,
      household: String(household)
    });
    window.location.href = `login.html?${params}`;
  };

  const change = (next) => {
    if (!next) setStep('targets'); // a reopened modal starts clean
    onOpenChange(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60 data-[state=open]:animate-fade-in motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby="onboarding-desc"
          className="fixed left-1/2 top-1/2 z-[70] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border-warm bg-cream text-foreground shadow-xl outline-none data-[state=open]:animate-fade-in motion-reduce:animate-none"
        >
          <div className="sticky top-0 z-10 border-b border-forest-line bg-forest px-6 py-5 text-on-forest sm:px-7">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-on-forest-muted">
              Step {step === 'targets' ? 1 : step === 'loading' ? 2 : 3} of 3
            </p>
            <Dialog.Title className="mt-1.5 pr-8 font-display text-xl font-bold italic leading-[1.2] text-on-forest sm:text-2xl">
              {TITLES[step]}
            </Dialog.Title>
            <Dialog.Description id="onboarding-desc" className="mt-1.5 text-sm text-on-forest-body">
              {step === 'reveal'
                ? `A ${money(plan.spend)} week for ${household === 1 ? '1 person' : `${household} people`}, ${plan.diet.label.toLowerCase()}.`
                : 'A real preview built from your budget, your diet, and your household. Takes about 30 seconds.'}
            </Dialog.Description>
            <Dialog.Close
              aria-label="Close"
              className="absolute right-4 top-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-on-forest-muted transition-colors duration-200 hover:bg-forest-raise hover:text-on-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-light motion-reduce:transition-none"
            >
              <X />
            </Dialog.Close>
          </div>

          <div className="px-6 py-6 sm:px-7">
            {step === 'targets' && (
              <TargetsStep
                budget={budget} setBudget={setBudget}
                dietId={dietId} setDietId={setDietId}
                household={household} setHousehold={setHousehold}
                onSubmit={generate}
              />
            )}
            {step === 'loading' && <LoadingStep phase={phase} />}
            {step === 'reveal' && (
              <RevealStep
                plan={plan}
                household={household}
                onClaim={claim}
                onBack={() => setStep('targets')}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
