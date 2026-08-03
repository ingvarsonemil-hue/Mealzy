import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Check, X } from '@/components/icons';
import { stripeUrls } from '@/lib/stripe';
import { track } from '@/lib/api';
import { cn } from '@/lib/utils';

/* Plan copy is identical to the legacy pricing.html; only presentation moved
 * to React. `included: false` renders the crossed-out variant. */
const FREE_FEATURES = [
  { text: '3 meal plans per month' },
  { text: 'Automatic grocery list' },
  { text: 'Budget tracking' },
  { text: 'Calorie and macro targets' },
  { text: 'AI Coach — 10 messages/day' },
  { text: '11 languages' },
  { text: 'Unlimited plan generation', included: false },
  { text: 'Unlimited AI coach', included: false },
  { text: 'PDF export', included: false }
];

const PRO_FEATURES = [
  { text: <><strong>Unlimited</strong> meal plans</> },
  { text: 'Automatic grocery list' },
  { text: 'Budget tracking' },
  { text: 'Calorie and macro targets' },
  { text: <><strong>Unlimited</strong> AI Coach</> },
  { text: '11 languages' },
  { text: 'Priority generation — 2x faster' },
  { text: 'PDF meal plan export' },
  { text: 'Advanced macro splits per meal' },
  { text: 'Cancel anytime' }
];

const FAMILY_FEATURES = [
  { text: <strong>Everything in Pro</strong> },
  { text: <>Up to <strong>4 individual profiles</strong></> },
  { text: 'Separate calorie & macro goals per person' },
  { text: 'Allergen management per profile' },
  { text: 'Combined grocery list (one shop, everyone covered)' },
  { text: 'Unlimited meal plans for all profiles' },
  { text: 'Priority support' },
  { text: 'Cancel anytime' }
];

function FeatureList({ features }) {
  return (
    <ul role="list" className="mt-6 flex flex-col gap-2.5">
      {features.map((f, i) => {
        const off = f.included === false;
        return (
          <li key={i} className={cn('flex items-start gap-2.5 text-[15px] leading-normal', off && 'text-muted-fg')}>
            {off ? (
              <X width="15" height="15" className="mt-1 shrink-0 text-muted-fg" />
            ) : (
              <Check className="mt-1 shrink-0 text-green" />
            )}
            <span>{f.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function PlanCard({ name, tag, price, billed, cta, note, features, popular }) {
  return (
    <article
      aria-label={`${name} plan`}
      className={cn(
        'relative flex flex-col rounded-lg bg-cream p-6 shadow-card',
        popular ? 'border-2 border-green shadow-lg' : 'border border-border-warm'
      )}
    >
      {popular && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-green px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-white">
          Most popular
        </span>
      )}
      <h2 className="font-display text-2xl font-bold italic leading-tight tracking-[-0.01em]">{name}</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-muted-fg">{tag}</p>
      <p className="mt-5">
        <span className="font-display text-[2.6rem] font-bold italic leading-none tracking-[-0.02em]">{price}</span>
        <span className="text-[15px] text-muted-fg">/month</span>
      </p>
      <p className="mt-1 min-h-[1.4em] text-sm leading-normal text-muted-fg" aria-live="polite">{billed}</p>
      <div className="mt-5">{cta}</div>
      {note && <p className="mt-2.5 text-center text-sm leading-normal text-muted-fg" aria-live="polite">{note}</p>}
      <FeatureList features={features} />
    </article>
  );
}

export default function PlanCards({ mode }) {
  const yearly = mode === 'yearly';
  const trackClick = (plan) => track('upgrade_click', { source: 'pricing_page', plan });

  return (
    <div className="grid gap-6 pt-4 md:grid-cols-3 md:items-start">
      <PlanCard
        name="Free"
        tag="Try it. No credit card, no expiry."
        price="$0"
        billed=""
        features={FREE_FEATURES}
        cta={<Button href="login.html?signup=1" full>Start Planning Free</Button>}
      />
      <PlanCard
        name="Pro"
        tag="For people who plan every week."
        price={yearly ? '$5' : '$8'}
        billed={yearly ? 'Billed $62/year — save $34 vs monthly' : ''}
        popular
        features={PRO_FEATURES}
        note={yearly ? 'Best value — $62/year saves you $34 vs monthly.' : '$8/mo — cancel any time.'}
        cta={
          <Button
            href={yearly ? stripeUrls.annual : stripeUrls.monthly}
            target="_blank"
            rel="noopener"
            full
            data-testid="pro-cta"
            onClick={() => trackClick('pro')}
          >
            {yearly ? 'Start Pro Annual — 7 Days Free' : 'Start Pro — 7 Days Free'}
          </Button>
        }
      />
      <PlanCard
        name="Family"
        tag="For households that eat together."
        price={yearly ? '$11' : '$16'}
        billed={yearly ? 'Billed $130/year — save $62 vs monthly' : ''}
        features={FAMILY_FEATURES}
        note="Perfect for couples, parents, or anyone cooking for more than one person."
        cta={
          <Button
            href={yearly ? stripeUrls.familyAnnual : stripeUrls.familyMonthly}
            target="_blank"
            rel="noopener"
            full
            data-testid="family-cta"
            onClick={() => trackClick('family')}
          >
            {yearly ? 'Start Family Annual' : 'Start Family'}
          </Button>
        }
      />
    </div>
  );
}
