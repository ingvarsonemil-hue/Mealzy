import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select, Label, RangeSlider } from '@/components/ui/field';
import { Check, Shield } from '@/components/icons';
import { DIETS, dollars, MIN_BUDGET, MAX_BUDGET, BUDGET_STEP } from '@/components/showcase-plan';

const MIN_KCAL = 1200;
const MAX_KCAL = 4000;

const TRUST_ITEMS = [
  { icon: Check, label: '3 free plans/month' },
  { icon: Check, label: 'No credit card' },
  { icon: Check, label: 'Under 1 minute' },
  { icon: Shield, label: 'Nothing to install' }
];

/* The planner form itself, sitting in the hero rather than beside it: the
 * first thing a visitor sees is the three questions, already answerable.
 * The same values drive both actions below it — the modal preview and the
 * live sample generator — so nothing has to be re-entered. */
function PlannerForm({ onGenerate, generating, onStartPlan, budget, onBudgetChange }) {
  const [cals, setCals] = React.useState('2000');
  const [dietId, setDietId] = React.useState(DIETS[0].id);

  const diet = DIETS.find((d) => d.id === dietId) || DIETS[0];

  /* The field accepts any keystroke while typing, so it is clamped here rather
   * than on change — a half-typed "20" must not snap to 1200 mid-entry. */
  const kcal = Math.min(Math.max(parseInt(cals, 10) || 2000, MIN_KCAL), MAX_KCAL);

  const build = () => onStartPlan && onStartPlan({ budget, dietId, kcal });

  const generate = () =>
    onGenerate({ calorieGoal: kcal, budget, dietary: diet.signup });

  return (
    <div
      role="group"
      aria-label="Plan your week"
      /* text-foreground is load-bearing: the card sits inside the hero's
       * text-on-forest scope, so anything that doesn't set its own colour
       * would inherit white onto cream. */
      className="rounded-lg border border-border-warm bg-cream p-6 text-foreground shadow-xl sm:p-8"
    >
      {/* The three questions sit on their own inset panel so they read as one
        * thing to fill in, with the CTA directly beneath it inside the same
        * card — a form, rather than three controls sharing a background. */}
      <div className="grid gap-6 rounded-md border border-border-warm bg-muted-bg p-5 lg:grid-cols-[1.3fr_1fr_1fr] lg:gap-8 sm:p-6">
        <div>
          <Label htmlFor="heroBudget" className="mb-0">Weekly grocery budget</Label>
          <p className="font-display text-[clamp(2.25rem,4vw,3rem)] font-black italic leading-none tabular-nums">
            {dollars(budget * 100)}
          </p>
          <RangeSlider
            id="heroBudget"
            min={MIN_BUDGET}
            max={MAX_BUDGET}
            step={BUDGET_STEP}
            value={budget}
            onChange={(e) => onBudgetChange(Number(e.target.value))}
            aria-describedby="heroBudgetHint"
            className="mt-4"
          />
          <div className="mt-2 flex justify-between text-[13px] tabular-nums text-muted-fg">
            <span>{dollars(MIN_BUDGET * 100)}</span>
            <span id="heroBudgetHint">Drag to set your cap</span>
            <span>{dollars(MAX_BUDGET * 100)}</span>
          </div>
        </div>

        <div>
          <Label htmlFor="heroDiet">Dietary style</Label>
          <Select id="heroDiet" value={dietId} onChange={(e) => setDietId(e.target.value)}>
            {DIETS.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </Select>
          <p className="mt-2 text-[13px] leading-[1.5] text-muted-fg">
            Every meal in the week respects it.
          </p>
        </div>

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
      </div>

      {/* The one action this page is for. The href is the no-JS fallback. */}
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
      <p className="mt-3 text-center text-sm text-muted-fg">
        No email. No sign-up. Your plan saves to your browser.
      </p>

      {/* Secondary: writes a real plan with the AI rather than the modelled
        * preview, so it stays available but never competes with the CTA. */}
      <div className="mt-5 border-t border-border-warm pt-5 text-center">
        <Button
          id="demoBtn"
          variant="quiet"
          size="sm"
          className="text-muted-fg hover:bg-muted-bg hover:text-foreground"
          onClick={generate}
          disabled={generating}
          aria-busy={generating}
        >
          {generating && (
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-muted-fg/40 border-t-muted-fg motion-reduce:animate-none"
            />
          )}
          {generating ? 'Generating...' : 'Or generate one live sample day'}
        </Button>
      </div>
    </div>
  );
}

export default function Hero({ onGenerate, generating, onStartPlan, budget, onBudgetChange }) {
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
            Set your three targets. Get seven days of meals and the list to shop them.
          </p>
        </div>

        <div className="mt-8">
          <PlannerForm
            onGenerate={onGenerate}
            generating={generating}
            onStartPlan={onStartPlan}
            budget={budget}
            onBudgetChange={onBudgetChange}
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
