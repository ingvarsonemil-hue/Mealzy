import { useState, useEffect } from 'react';
import { stripeUrls, PLAN_PRICING } from '@/lib/stripe';

/* ───────────────────────────────────────────────
   Mealzy Paywall — shown when free limit reached
   Drop into: client/src/paywall/PaywallPage.jsx

   Checkout links come from window.STRIPE_* (injected by
   /stripe-config.js from server env vars — see client/src/lib/stripe.js).
   If an annual link isn't configured server-side, the CTA falls back to
   /pricing.html instead of silently checking out at the wrong price.
   ─────────────────────────────────────────────── */

function buildPaywallPlans({ annualReady, familyReady }) {
  return [
    {
      id: 'pro',
      name: 'Pro',
      description: 'Unlimited meal plans, price tracking, and pantry sync.',
      price: PLAN_PRICING.pro.annualTotal,
      period: '/year',
      monthlyEq: `$${(PLAN_PRICING.pro.annualTotal / 12).toFixed(2)}/mo`,
      cta: 'Upgrade to Pro — 14 Days Free',
      link: annualReady ? stripeUrls.annual : '/pricing.html',
      popular: true,
      features: [
        'Unlimited meal plans',
        'Grocery list with estimates',
        'Budget-based planning',
        'Unlimited dietary filters',
        'Nutrition breakdown',
        'Priority support',
        'Price history & trends',
      ],
    },
    {
      id: 'family',
      name: 'Family',
      description: 'Feed 4+ people for under $6 a serving. Up to 5 members.',
      price: PLAN_PRICING.family.annualTotal,
      period: '/year',
      monthlyEq: `$${(PLAN_PRICING.family.annualTotal / 12).toFixed(2)}/mo`,
      cta: 'Upgrade to Family — 14 Days Free',
      link: familyReady ? stripeUrls.familyAnnual : '/pricing.html',
      popular: false,
      features: [
        'Everything in Pro',
        'Up to 5 family members',
        'Shared plans & grocery lists',
        'Family-sized portions',
        'Unlimited meal plans',
        'Priority support',
        'Price history & trends',
      ],
    },
  ];
}

function IconCheck({ className }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconLock({ className }) {
  return (
    <svg className={className} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconArrowRight({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export default function PaywallPage() {
  const [selectedPlan, setSelectedPlan] = useState('pro');
  /* Pro defaults to "ready" on first paint because stripeUrls.annual has a
     safe non-null fallback (monthly link). Family has no safe fallback —
     stripeUrls.familyAnnual is null until configured — so it defaults to
     not-ready to avoid a null href before the effect below runs. */
  const [readiness, setReadiness] = useState({ annualReady: true, familyReady: false });

  useEffect(() => {
    setReadiness({
      annualReady: stripeUrls.annualReady,
      familyReady: stripeUrls.familyAnnualReady,
    });
  }, []);

  const paywallPlans = buildPaywallPlans(readiness);

  return (
    <main className="min-h-screen bg-parchment">
      <section className="bg-forest text-on-forest py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-800 mb-6">
            <IconLock className="w-8 h-8 text-green-200" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Your first free month is up
          </h1>
          <p className="mt-4 text-lg text-green-100 max-w-xl mx-auto">
            Upgrade to keep generating meal plans. Try Pro or Family free for 14 days — no charge until the trial ends.
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-4xl px-4">
          <div className="grid gap-6 md:grid-cols-2 items-stretch">
            {paywallPlans.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`
                    relative flex flex-col rounded-2xl border p-6 md:p-8 cursor-pointer
                    transition-all duration-200
                    ${isSelected
                      ? 'border-green-600 bg-cream shadow-xl ring-2 ring-forest ring-offset-2'
                      : 'border-gray-200 bg-white shadow-sm hover:shadow-md'
                    }
                  `}
                >
                  {plan.popular && (
                    <div className="mb-3">
                      <span className="inline-flex items-center rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white shadow-sm">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-forest">{plan.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-forest">${plan.price}</span>
                      <span className="text-sm text-gray-500">{plan.period}</span>
                    </div>
                    <span className="text-xs text-green-700 font-medium mt-1 block">
                      {plan.monthlyEq} · 14-day free trial
                    </span>
                  </div>

                  <a
                    href={plan.link}
                    className={`
                      inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold
                      transition-colors duration-150
                      ${isSelected
                        ? 'bg-forest text-white hover:bg-green-900'
                        : 'bg-white text-forest border-2 border-forest hover:bg-cream'
                      }
                    `}
                  >
                    {plan.cta}
                    <IconArrowRight className="w-4 h-4" />
                  </a>

                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <IconCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="mt-10 text-center">
            <p className="text-sm text-gray-500">
              Cancel anytime. No questions asked refund within 14 days.{' '}
              <a href="mailto:support@mealzy.org" className="text-green-700 underline hover:text-forest">
                Contact support
              </a>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}