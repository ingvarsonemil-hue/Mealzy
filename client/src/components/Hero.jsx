import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select, Label } from '@/components/ui/field';
import { Check, Shield, ArrowDown } from '@/components/icons';
import { scrollToHash } from '@/lib/utils';

const DIETS = [
  { value: 'none', label: 'No restriction' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten-free', label: 'Gluten-free' },
  { value: 'dairy-free', label: 'Dairy-free' },
  { value: 'high-protein', label: 'High protein' }
];

const TRUST_ITEMS = [
  { icon: Check, label: '3 free plans/month' },
  { icon: Check, label: 'No credit card' },
  { icon: Check, label: 'Takes 30 seconds' },
  { icon: Shield, label: 'Used in 10 countries' }
];

/* The interactive planner tool. Same inputs, same clamps, same endpoint
 * payload as the original landing.js — visual styling only. */
function PlannerCard({ onGenerate, generating }) {
  const [cals, setCals] = React.useState('2000');
  const [budget, setBudget] = React.useState('60');
  const [diet, setDiet] = React.useState('none');

  const submit = () => {
    onGenerate({
      calorieGoal: parseInt(cals, 10) || 2000,
      budget: parseFloat(budget) || 60,
      dietary: diet
    });
  };

  return (
    <div
      role="group"
      aria-label="Generate a sample plan"
      className="w-full rounded-lg border border-border-warm bg-cream p-6 shadow-lg sm:p-7"
    >
      <p className="mb-5 font-display text-xl font-bold italic text-foreground">
        Try it now — no account needed.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="demoCals">Daily calories</Label>
          <Input
            id="demoCals" type="number" min="1200" max="4000" step="50" placeholder="2000"
            value={cals} onChange={(e) => setCals(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="demoBudget">Weekly budget ($)</Label>
          <Input
            id="demoBudget" type="number" min="20" max="500" step="5" placeholder="60"
            value={budget} onChange={(e) => setBudget(e.target.value)}
          />
        </div>
      </div>
      <div className="mb-5">
        <Label htmlFor="demoDiet">Dietary preference</Label>
        <Select id="demoDiet" value={diet} onChange={(e) => setDiet(e.target.value)}>
          {DIETS.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </Select>
      </div>
      <Button id="demoBtn" full size="lg" onClick={submit} disabled={generating} aria-busy={generating}>
        {generating && (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
          />
        )}
        {generating ? 'Generating...' : 'Generate Sample Plan'}
      </Button>
      <p className="mt-3 text-center text-sm text-muted-fg">No email. No sign-up. Just the plan.</p>
    </div>
  );
}

export default function Hero({ onGenerate, generating }) {
  return (
    <section id="hero" aria-labelledby="hero-heading" className="relative bg-forest text-on-forest">
      {/* Radial depth in the hero background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 480px at 18% 12%, rgba(74,222,128,0.10), transparent 60%), radial-gradient(700px 420px at 88% 78%, rgba(74,222,128,0.06), transparent 55%)'
        }}
      />
      <div className="relative mx-auto grid max-w-container items-center gap-12 px-4 pb-16 pt-32 sm:px-5 lg:min-h-[80vh] lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:pb-20">
        <div>
          <h1
            id="hero-heading"
            className="font-display font-black italic leading-[1.05] tracking-[-0.03em] text-on-forest [font-size:clamp(2.5rem,4.6vw+1rem,4.25rem)]"
          >
            Eat better. Spend less.
          </h1>
          <p className="mt-6 max-w-prose text-lg leading-[1.65] text-on-forest-body">
            Your grocery budget turned into a full week of personalized meals in 30 seconds.
            No endless prompts, no math.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button href="login.html?signup=1" size="lg">Plan My Week Free</Button>
            <Button
              href="#how-it-works" variant="quiet" className="text-on-forest-body hover:text-on-forest"
              onClick={(e) => scrollToHash(e, '#how-it-works')}
            >
              See how it works <ArrowDown />
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-on-forest-muted">
            <span>3 simple questions</span>
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-on-forest-faint" />
            <span>No credit card required</span>
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-on-forest-faint" />
            <span>Instant meal plan</span>
          </div>
          <div aria-hidden="true" className="mt-10 hidden max-w-md grid-cols-7 gap-1 lg:grid">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span
                key={d}
                className="rounded-sm border border-forest-line py-1.5 text-center font-display text-xs italic text-on-forest-muted"
              >
                {d}
              </span>
            ))}
          </div>
        </div>

        <PlannerCard onGenerate={onGenerate} generating={generating} />
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
