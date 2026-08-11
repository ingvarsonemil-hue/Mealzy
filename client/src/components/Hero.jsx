import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select, Label } from '@/components/ui/field';
import { Check, Shield } from '@/components/icons';
import { DIETS, MIN_BUDGET, MAX_BUDGET } from '@/components/showcase-plan';

const MIN_KCAL = 1200;
const MAX_KCAL = 4000;

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

const TRUST_ITEMS = [
  { icon: Check, label: '3 free plans/month' },
  { icon: Check, label: 'No credit card' },
  { icon: Check, label: '2-minute setup' },
  { icon: Shield, label: 'Nothing to install' }
];

/* The planner form itself, sitting in the hero rather than beside it: the
 * first thing a visitor sees is the questions, already answerable. The values
 * feed straight into the interactive preview below the button, so nothing has
 * to be re-entered.
 *
 * All three targets are asked here, budget included — a visitor who never
 * scrolls to the showcase slider should still be able to state the number the
 * whole product is built around. It is not a second copy of that number: the
 * field and the slider are two handles on one piece of page state, so moving
 * either moves the other and they cannot drift apart. */
function PlannerForm({ onStartPlan, budget, onBudgetChange, dietId, onDietChange }) {
  const [cals, setCals] = React.useState('2000');
  const [budgetText, setBudgetText] = React.useState(() => String(budget));

  /* The slider is the other handle on this number; when it moves, the field
   * follows it. */
  React.useEffect(() => setBudgetText(String(budget)), [budget]);

  /* Both number fields accept any keystroke while typing and are clamped here
   * rather than on change — a half-typed "20" must not snap to 1200, and a
   * half-typed "2" on its way to "200" must not snap the slider to $20. */
  const kcal = clamp(parseInt(cals, 10) || 2000, MIN_KCAL, MAX_KCAL);
  const dollars = clamp(parseInt(budgetText, 10) || budget, MIN_BUDGET, MAX_BUDGET);

  /* Only in-range keystrokes are pushed to the page, so the week below re-plans
   * as the number is typed without lurching through the clamp on the way. */
  const onBudgetInput = (value) => {
    setBudgetText(value);
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n >= MIN_BUDGET && n <= MAX_BUDGET && n !== budget) {
      onBudgetChange && onBudgetChange(n);
    }
  };

  /* Leaving the field settles it: whatever is in the box becomes a budget we
   * actually model, and the box is rewritten to say so. */
  const commitBudget = () => {
    setBudgetText(String(dollars));
    if (dollars !== budget && onBudgetChange) onBudgetChange(dollars);
  };

  const build = () => onStartPlan && onStartPlan({ budget: dollars, dietId, kcal });

  return (
    <div
      role="group"
      aria-label="Plan your week"
      /* text-foreground is load-bearing: the card sits inside the hero's
       * text-on-forest scope, so anything that doesn't set its own colour
       * would inherit white onto cream. */
      className="rounded-lg border border-border-warm bg-cream p-6 text-foreground shadow-xl sm:p-8"
    >
      {/* The three questions and the CTA are one form on one surface. They used
        * to sit on an inset panel of their own, but muted-bg on cream measures
        * 1.02:1 — no visible fill difference — so that panel read as a stray
        * border boxing the fields off from the button that submits them. The
        * contrast that matters is the card against the forest hero behind it,
        * and that is already the strongest edge on the page. */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        <div>
          <Label htmlFor="heroCals">Daily calorie target</Label>
          <Input
            id="heroCals"
            type="number"
            inputMode="numeric"
            min={MIN_KCAL}
            max={MAX_KCAL}
            step="50"
            placeholder="2000"
            value={cals}
            onChange={(e) => setCals(e.target.value)}
            aria-describedby="heroCalsHint"
          />
          <p id="heroCalsHint" className="mt-2 text-[13px] leading-[1.5] text-muted-fg">
            Anything from {MIN_KCAL.toLocaleString('en-US')} to {MAX_KCAL.toLocaleString('en-US')} kcal.
          </p>
        </div>

        <div>
          <Label htmlFor="heroBudget">Weekly budget ($)</Label>
          {/* The dollar sign sits in the field rather than only in the label, so
            * the number reads as money at a glance. pl-7 clears it; it is inert
            * so a tap anywhere on the field still lands in the input. */}
          <span className="relative block">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-muted-fg"
            >
              $
            </span>
            <Input
              id="heroBudget"
              type="number"
              inputMode="numeric"
              min={MIN_BUDGET}
              max={MAX_BUDGET}
              step="5"
              placeholder="60"
              value={budgetText}
              onChange={(e) => onBudgetInput(e.target.value)}
              onBlur={commitBudget}
              aria-describedby="heroBudgetHint"
              className="pl-7"
            />
          </span>
          <p id="heroBudgetHint" className="mt-2 text-[13px] leading-[1.5] text-muted-fg">
            ${MIN_BUDGET} to ${MAX_BUDGET} — the week is planned to fit inside it.
          </p>
        </div>

        <div className="sm:col-span-2 lg:col-span-1">
          <Label htmlFor="heroDiet">Dietary style</Label>
          <Select id="heroDiet" value={dietId} onChange={(e) => onDietChange && onDietChange(e.target.value)}>
            {DIETS.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </Select>
          <p className="mt-2 text-[13px] leading-[1.5] text-muted-fg">
            Every meal in the week respects it.
          </p>
        </div>
      </div>

      {/* The only action this page offers. It opens the interactive preview
        * seeded with the three answers above; the href is the no-JS fallback.
        * A second button here used to run a separate live sample, which meant
        * two demos quoting two sets of numbers — there is now one. */}
      <Button
        href="login.html?signup=1"
        full
        size="lg"
        className="mt-5 text-lg font-bold"
        onClick={(e) => {
          if (!onStartPlan) return;
          e.preventDefault();
          build();
        }}
      >
        Build My Free Plan
      </Button>
      {/* What it costs, said at the point of commitment rather than left for the
        * pricing page to reveal. A visitor who suspects a paywall behind the
        * button is answered before they press it. */}
      <p className="mt-3 text-center text-sm font-semibold text-foreground">
        Free for 3 plans/month. Pro from $8/mo.
      </p>
      <p className="mt-1.5 text-center text-sm text-muted-fg">
        Free account. No credit card required. Generate your personalized 7-day plan in seconds.
      </p>
    </div>
  );
}

export default function Hero({ onStartPlan, budget, onBudgetChange, dietId, onDietChange }) {
  return (
    <section id="hero" aria-labelledby="hero-heading" className="relative bg-forest text-on-forest">
      {/* Radial depth in the hero background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 480px at 18% 12%, rgb(var(--rgb-green-light) / 0.10), transparent 60%), radial-gradient(700px 420px at 88% 78%, rgb(var(--rgb-green-light) / 0.06), transparent 55%)'
        }}
      />
      <div className="relative mx-auto max-w-container px-4 pb-16 pt-28 sm:px-5 lg:pb-20 lg:pt-32">
        {/* Deliberately compact: the form below is the page, and the headline
          * only has to say what the form is for. */}
        <div className="max-w-3xl">
          <h1
            id="hero-heading"
            className="font-display font-black italic leading-[1.05] tracking-[-0.03em] text-on-forest [font-size:clamp(1.75rem,2.4vw+0.9rem,2.75rem)]"
          >
            Plan your week of meals inside your grocery budget.
          </h1>
          <p className="mt-3 text-[17px] leading-[1.55] text-on-forest-body">
            Set your targets. Get seven days of meals and the list to shop them.
          </p>
          {/* The one time claim the whole site is held to. Every other mention
            * of how long this takes is a restatement of this sentence. */}
          <p className="mt-2 text-[17px] font-semibold leading-[1.55] text-on-forest-strong">
            2-minute setup. 30 seconds every week after.
          </p>
        </div>

        <div className="mt-8">
          <PlannerForm
            onStartPlan={onStartPlan}
            budget={budget}
            onBudgetChange={onBudgetChange}
            dietId={dietId}
            onDietChange={onDietChange}
          />
        </div>
      </div>

      {/* Trust strip */}
      <div className="relative border-t border-forest-line bg-forest-deep/60">
        <div className="mx-auto grid max-w-container grid-cols-2 gap-x-6 gap-y-3 px-4 py-4 sm:px-5 md:flex md:items-center md:justify-between">
          {TRUST_ITEMS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-sm text-on-forest-muted">
              <Icon className="text-green-light" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
