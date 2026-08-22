import * as React from 'react';
import { Button } from '@/components/ui/button';
import { RangeSlider } from '@/components/ui/field';
import { Check } from '@/components/icons';
import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/lib/utils';
import { dollars, MIN_BUDGET, MAX_BUDGET, BUDGET_STEP } from '@/components/showcase-plan';

/* The four screens of the homepage mini pre-onboarding: one decision each,
 * a shared progress indicator, and the brief "Building your week" transition
 * between the last answer and the result. Split out of Showcase.jsx to keep
 * that file under the 500-line limit — this half owns only the questions,
 * Showcase.jsx owns the result. */

export function StepProgress({ step, total }) {
  return (
    <div className="mx-auto mb-6 flex max-w-sm items-center gap-2" role="status" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn(
            'h-1.5 flex-1 rounded-full transition-colors duration-200 motion-reduce:transition-none',
            i < step ? 'bg-green' : 'bg-border-warm'
          )}
        />
      ))}
      <span className="ml-1 shrink-0 text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">
        {step} of {total}
      </span>
    </div>
  );
}

function QuestionCard({ question, hint, children }) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-green/40 bg-cream p-6 text-center shadow-card sm:p-8">
      <h3 className="font-display text-[clamp(1.5rem,2vw+0.9rem,2rem)] font-bold italic leading-[1.15] tracking-[-0.01em]">
        {question}
      </h3>
      {hint && <p className="mt-2 text-[15px] leading-[1.6] text-muted-fg">{hint}</p>}
      <div className="mt-7">{children}</div>
    </div>
  );
}

/* Selected state is more than a color swap — filled background, inverted
 * text, a shadow, and an explicit checkmark — so it reads clearly even for
 * visitors who can't distinguish the green from the border. */
function Choice({ selected, children, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'flex min-h-[52px] cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 py-3 text-[15px] font-semibold transition-[background-color,border-color,color] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green motion-reduce:transition-none',
        selected
          ? 'border-green bg-green text-white shadow-button'
          : 'border-border-warm bg-muted-bg text-foreground hover:border-green'
      )}
      {...props}
    >
      {selected && <Check width="16" height="16" className="shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function BudgetStep({ budget, onChange, onContinue }) {
  return (
    <QuestionCard
      question="What do you want to spend on groceries this week?"
      hint="Mealzy will build the week around this number."
    >
      <p className="font-display text-[clamp(2.75rem,7vw,4rem)] font-black italic leading-none tabular-nums">
        {dollars(budget * 100)}
      </p>
      <label htmlFor="mini-budget" className="sr-only">Weekly grocery budget</label>
      <RangeSlider
        id="mini-budget"
        min={MIN_BUDGET}
        max={MAX_BUDGET}
        step={BUDGET_STEP}
        value={budget}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby="mini-budget-hint"
        className="mt-6"
      />
      <div className="mt-2 flex justify-between text-[13px] tabular-nums text-muted-fg">
        <span>{dollars(MIN_BUDGET * 100)}</span>
        <span id="mini-budget-hint">Drag to adjust</span>
        <span>{dollars(MAX_BUDGET * 100)}</span>
      </div>
      <Button full size="lg" className="mt-7" onClick={onContinue}>
        Continue
      </Button>
    </QuestionCard>
  );
}

export function DietStep({ diet, onSelect, onContinue, options }) {
  return (
    <QuestionCard question="How do you like to eat?">
      {/* Two columns at every width: 10 real diet options divide evenly into
       * five rows of two, so there's never an orphaned last item the way the
       * old 2/3-column responsive grid left one on wider screens. */}
      <div role="radiogroup" aria-label="Diet" className="grid grid-cols-2 gap-2.5">
        {options.map((opt) => (
          <Choice
            key={opt.value || 'none'}
            role="radio"
            aria-checked={diet === opt.value}
            selected={diet === opt.value}
            onClick={() => onSelect(opt.value)}
          >
            {opt.label}
          </Choice>
        ))}
      </div>
      <Button full size="lg" className="mt-7" onClick={onContinue}>
        Continue
      </Button>
    </QuestionCard>
  );
}

export function TimeStep({ cookingTime, onSelect, onContinue, options }) {
  return (
    <QuestionCard
      question="How much time do you want to spend cooking?"
      hint="We'll keep your meals inside that limit."
    >
      <div role="radiogroup" aria-label="Cooking time" className="grid gap-2.5 sm:grid-cols-3">
        {options.map((opt) => (
          <Choice
            key={opt.value}
            role="radio"
            aria-checked={cookingTime === opt.value}
            selected={cookingTime === opt.value}
            onClick={() => onSelect(opt.value)}
          >
            {opt.label}
          </Choice>
        ))}
      </div>
      <Button full size="lg" className="mt-7" onClick={onContinue}>
        See my basics
      </Button>
    </QuestionCard>
  );
}

/* "Setting up your week" — a brief, honest transition, not a fake AI-thinking
 * screen. Every row is a real, selected constraint; nothing here claims a
 * percentage or a step that didn't happen. ~1.1s with motion, near-instant
 * with prefers-reduced-motion. */
export function BuildingStep({ checks, onDone }) {
  const [shown, setShown] = React.useState(prefersReducedMotion() ? checks.length : 0);

  React.useEffect(() => {
    if (prefersReducedMotion()) {
      const t = setTimeout(onDone, 350);
      return () => clearTimeout(t);
    }
    const STEP_MS = 280;
    const timers = checks.map((_, i) => setTimeout(() => setShown(i + 1), STEP_MS * (i + 1)));
    const done = setTimeout(onDone, STEP_MS * (checks.length + 1));
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-lg rounded-lg border border-green/40 bg-cream p-6 text-center shadow-card sm:p-8">
      <h3 className="font-display text-[clamp(1.5rem,2vw+0.9rem,2rem)] font-bold italic leading-[1.15]">
        Setting up your week...
      </h3>
      <ul role="status" aria-live="polite" className="mt-6 grid gap-3 text-left">
        {checks.map((label, i) => {
          const done = i < shown;
          return (
            <li
              key={label}
              className={cn(
                'flex items-center gap-3 text-[15px] transition-opacity duration-300 motion-reduce:transition-none',
                done ? 'text-foreground' : 'text-muted-fg opacity-40'
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="text-green dark:text-green-light" />
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
