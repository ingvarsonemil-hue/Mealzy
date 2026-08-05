import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select, Label } from '@/components/ui/field';
import { Check, Shield } from '@/components/icons';
import { DIETS } from '@/components/showcase-plan';

const MIN_KCAL = 1200;
const MAX_KCAL = 4000;

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
 * Budget is asked once, on the showcase slider that re-plans the week in front
 * of the visitor. It is read here for the modal seed but not set here — a
 * second handle on the same number is a second chance to disagree with it. */
function PlannerForm({ onStartPlan, budget }) {
  const [cals, setCals] = React.useState('2000');
  const [dietId, setDietId] = React.useState(DIETS[0].id);

  /* The field accepts any keystroke while typing, so it is clamped here rather
   * than on change — a half-typed "20" must not snap to 1200 mid-entry. */
  const kcal = Math.min(Math.max(parseInt(cals, 10) || 2000, MIN_KCAL), MAX_KCAL);

  const build = () => onStartPlan && onStartPlan({ budget, dietId, kcal });

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
      <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
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
      <p className="mt-3 text-center text-sm text-muted-fg">
        No email. No sign-up. Your plan saves to your browser.
      </p>
    </div>
  );
}

export default function Hero({ onStartPlan, budget }) {
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
          <PlannerForm onStartPlan={onStartPlan} budget={budget} />
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
