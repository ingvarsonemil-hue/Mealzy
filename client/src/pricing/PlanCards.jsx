import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Check, X } from '@/components/icons';
import { stripeUrls, PLAN_PRICING, planDisplay } from '@/lib/stripe';
import { track } from '@/lib/api';
import { cn } from '@/lib/utils';

/* Plan copy is kept in sync with the legacy public/pricing.html; only
 * presentation moved to React. Free lists what Free actually includes and
 * stops there — no crossed-out Pro features padding it out. */
const FREE_FEATURES = [
  { text: 'AI Meal Plans — 3 per month' },
  { text: 'Automatic grocery list' },
  { text: 'Budget tracking' },
  { text: 'Calorie & Macro Targets' },
  { text: 'AI Coach — 10 messages/day' }
];

const PRO_FEATURES = [
  { text: <><strong>Unlimited</strong> AI Meal Plans</> },
  { text: 'Automatic grocery list' },
  { text: 'Budget tracking' },
  { text: 'Calorie & Macro Targets' },
  { text: <>Mia — AI Nutrition Coach, <strong>unlimited</strong></> },
  { text: 'Priority queue — plans generate first' },
  { text: 'PDF meal plan export' },
  { text: 'Advanced macro splits per meal' },
  { text: 'Cancel anytime' }
];

const FAMILY_FEATURES = [
  { text: <strong>Everything in Pro</strong> },
  { text: <>Up to <strong>4 individual profiles</strong></> },
  { text: 'Separate Calorie & Macro Targets per person' },
  { text: 'Allergen management per profile' },
  { text: 'Combined grocery list (one shop, everyone covered)' },
  { text: 'Unlimited AI Meal Plans for all profiles' },
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

function PlanCard({ name, tag, price, period = '/month', billed, cta, note, features, popular }) {
  return (
    <article
      aria-label={`${name} plan`}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-lg bg-cream shadow-card',
        popular ? 'border-2 border-green shadow-lg' : 'border border-border-warm'
      )}
    >
      {/* Badge is part of the card's own top edge — never floats between cards. */}
      {popular && (
        <div className="bg-green px-6 py-2 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-white">Most popular</span>
        </div>
      )}
      <div className="flex flex-col p-6">
      <h2 className="font-display text-2xl font-bold italic leading-tight tracking-[-0.01em]">{name}</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-muted-fg">{tag}</p>
      <p className="mt-5">
        <span className="font-display text-[2.6rem] font-bold italic leading-none tracking-[-0.02em]">{price}</span>
        <span className="text-[15px] text-muted-fg">{period}</span>
      </p>
      <p className="mt-1 min-h-[1.4em] text-sm leading-normal text-muted-fg" aria-live="polite">{billed}</p>
      <div className="mt-5">{cta}</div>
      {note && <p className="mt-2.5 text-center text-sm leading-normal text-muted-fg" aria-live="polite">{note}</p>}
      <FeatureList features={features} />
      </div>
    </article>
  );
}

/* If the dedicated Family Stripe link isn't configured, the CTA must not fall
 * back to Pro's checkout link — that would charge the Pro price for a plan
 * marketed at a different price. Route to support instead. */
const FAMILY_FALLBACK_HREF = 'mailto:support@mealzy.org?subject=Family%20Plan';

export default function PlanCards({ mode }) {
  const yearly = mode === 'yearly';
  const pro = planDisplay('pro', mode);
  const family = planDisplay('family', mode);
  const familyReady = yearly ? stripeUrls.familyAnnualReady : stripeUrls.familyMonthlyReady;
  const familyHref = familyReady ? (yearly ? stripeUrls.familyAnnual : stripeUrls.familyMonthly) : FAMILY_FALLBACK_HREF;
  const trackClick = (plan) => track('upgrade_click', { source: 'pricing_page', plan });

  return (
    <div className="grid gap-6 pt-4 md:grid-cols-3 md:items-start">
      <PlanCard
        name="Free"
        tag="Try it. No credit card, no expiry."
        price="$0"
        billed=""
        features={FREE_FEATURES}
        note="Plans generate in about 30 seconds on the standard queue."
        cta={<Button href="login.html?signup=1" full>Plan My Week Free</Button>}
      />
      <PlanCard
        name="Pro"
        tag="For people who plan every week."
        price={pro.price}
        period={pro.period}
        billed={pro.billed}
        popular
        features={PRO_FEATURES}
        /* The button already carries "$0 due today", so the note states only
         * what happens after the trial ends. */
        note={
          yearly
            ? `Then $${PLAN_PRICING.pro.annualTotal}/yr — cancel anytime.`
            : `Then $${PLAN_PRICING.pro.monthly}/mo — cancel anytime.`
        }
        cta={
          <Button
            href={yearly ? stripeUrls.annual : stripeUrls.monthly}
            target="_blank"
            rel="noopener"
            full
            data-testid="pro-cta"
            onClick={() => trackClick('pro')}
          >
            Start 7-day free trial — $0 due today
          </Button>
        }
      />
      <PlanCard
        name="Family"
        tag="For households that eat together."
        price={family.price}
        period={family.period}
        billed={family.billed}
        features={FAMILY_FEATURES}
        /* The 7-day trial runs on Pro, not on Family, so this says how to get
         * the trial rather than claiming Family itself starts free. */
        note="Try Pro free for 7 days, then upgrade to Family anytime. Cancel anytime."
        cta={
          <Button
            href={familyHref}
            target={familyReady ? '_blank' : undefined}
            rel={familyReady ? 'noopener' : undefined}
            full
            data-testid="family-cta"
            onClick={() => trackClick('family')}
          >
            Start Family Plan
          </Button>
        }
      />
    </div>
  );
}
