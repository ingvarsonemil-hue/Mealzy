import { useState, useEffect, useRef } from 'react';
import { track } from '@/lib/api';
import PricingFaq from './PricingFaq';

/* ───────────────────────────────────────────────
   Mealzy Pricing Page — CTA routes to /login
   Drop into: client/src/pricing/PricingPage.jsx
   ─────────────────────────────────────────────── */

const getLoginUrl = (plan, billing = 'annual') => {
  const params = new URLSearchParams();
  params.set('plan', plan);
  if (plan !== 'free') params.set('billing', billing);
  return `/login?${params.toString()}`;
};

const plans = [
  {
    id: 'free',
    name: 'Free',
    description: '1 meal plan a day for your first 30 days. After that, get 1 new plan every week, forever. No credit card required.',
    monthlyPrice: 0,
    annualPrice: 0,
    cta: 'Build My Free Plan',
    ctaHref: '/onboarding.html', // free users go straight to the app
    ctaVariant: 'outline',
    popular: false,
    features: [
      { label: 'Weekly meal plans', value: 'Daily plans for 30 days' },
      { label: 'Grocery list with estimates', value: true },
      { label: 'Budget-based planning', value: true },
      { label: 'Dietary filters', value: '3 filters' },
      { label: 'Family sharing', value: false },
      { label: 'Nutrition breakdown', value: false },
      { label: 'Direct email access to the founder', value: false },
      { label: 'Grocery price tracking & cheaper swap suggestions', value: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Pro pays for itself in week one. Stop overpaying at checkout and keep your grocery budget under control.',
    monthlyPrice: 8,
    annualPrice: 62,
    cta: 'Upgrade to Pro',
    ctaHref: getLoginUrl('pro', 'annual'),
    ctaVariant: 'primary',
    popular: true,
    features: [
      { label: 'Weekly meal plans', value: 'Unlimited' },
      { label: 'Grocery list with estimates', value: true },
      { label: 'Budget-based planning', value: true },
      { label: 'Dietary filters', value: 'Unlimited' },
      { label: 'Family sharing', value: false },
      { label: 'Nutrition breakdown', value: true },
      { label: 'Direct email access to the founder', value: true },
      { label: 'Grocery price tracking & cheaper swap suggestions', value: true },
    ],
  },
  {
    id: 'family',
    name: 'Family',
    description: 'Feed 4+ people for under $6 a serving. Shared plans, dietary filters, and family-sized grocery lists.',
    monthlyPrice: 16,
    annualPrice: 128,
    cta: 'Upgrade to Family',
    ctaHref: getLoginUrl('family', 'annual'),
    ctaVariant: 'primary',
    popular: false,
    features: [
      { label: 'Weekly meal plans', value: 'Unlimited' },
      { label: 'Grocery list with estimates', value: true },
      { label: 'Budget-based planning', value: true },
      { label: 'Dietary filters', value: 'Unlimited' },
      { label: 'Family sharing', value: 'Up to 5 members' },
      { label: 'Nutrition breakdown', value: true },
      { label: 'Direct email access to the founder', value: true },
      { label: 'Grocery price tracking & cheaper swap suggestions', value: true },
    ],
  },
];

const featureRows = [
  { label: 'Weekly meal plans', key: 'Weekly meal plans' },
  { label: 'Grocery list with estimates', key: 'Grocery list with estimates' },
  { label: 'Budget-based planning', key: 'Budget-based planning' },
  { label: 'Dietary filters', key: 'Dietary filters' },
  { label: 'Family sharing', key: 'Family sharing' },
  { label: 'Nutrition breakdown', key: 'Nutrition breakdown' },
  { label: 'Direct email access to the founder', key: 'Direct email access to the founder' },
  { label: 'Grocery price tracking & cheaper swap suggestions', key: 'Grocery price tracking & cheaper swap suggestions' },
];

/* ── Inline SVG Icons ─────────────────────────── */

function IconCheck({ className, style }) {
  return (
    <svg className={className} style={style} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX({ className }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconArrowRight({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function IconShieldCheck({ className }) {
  return (
    <svg className={className} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 12 15 16 10" />
    </svg>
  );
}

/* ── Components ───────────────────────────────── */

function PriceDisplay({ plan, billing }) {
  const price = billing === 'annual' ? plan.annualPrice : plan.monthlyPrice;
  const period = billing === 'annual' ? '/year' : '/mo';
  const monthlyEquivalent = billing === 'annual' ? (plan.annualPrice / 12).toFixed(2) : null;
  const annualSavings = billing === 'annual' ? (plan.monthlyPrice * 12) - plan.annualPrice : null;

  if (price === 0) {
    return (
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold text-forest">$0</span>
        <span className="text-sm text-slate-500">for 30 days</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold text-forest">${price}</span>
        <span className="text-sm text-slate-500">{period}</span>
      </div>
      {billing === 'annual' && monthlyEquivalent && (
        <span className="text-xs text-emerald-700 font-medium mt-1">
          ${monthlyEquivalent}/mo · Save ${annualSavings}/year
        </span>
      )}
      {billing === 'monthly' && (
        <span className="text-xs text-forest/60 font-medium mt-1">
          Switch to annual and save ${(plan.monthlyPrice * 12) - plan.annualPrice}/year
        </span>
      )}
    </div>
  );
}

function FeatureValue({ value, label }) {
  if (value === true) {
    return (
      <>
        <IconCheck className="w-5 h-5" style={{ color: '#10B981', width: '20px', height: '20px' }} aria-hidden="true" />
        <span className="sr-only">{label} — included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <IconX className="w-5 h-5 text-slate-300" aria-hidden="true" />
        <span className="sr-only">{label} — not included</span>
      </>
    );
  }
  return <span className="text-sm text-slate-700 font-medium">{value}</span>;
}

function TableFeatureValue({ value, label, isFreePlan }) {
  if (value === false && isFreePlan) {
    return <span className="text-xs text-slate-400">Pro only: {label}</span>;
  }
  return <FeatureValue value={value} label={label} />;
}

function PricingCard({ plan, billing }) {
  const isPopular = plan.popular;

  return (
    <div
      className={`
        relative flex flex-col p-6 md:p-8
        transition-all duration-300 ease-out
        ${isPopular
          ? 'bg-cream md:scale-105 z-10'
          : 'rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-lg hover:-translate-y-1'
        }
      `}
      style={isPopular ? {
        borderRadius: '16px',
        border: '2px solid var(--color-green)',
        boxShadow: '0 25px 50px -12px rgba(5, 150, 105, 0.25)'
      } : undefined}
    >
      {isPopular && (
        <div className="mb-3">
          <span className="inline-flex items-center rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white shadow-sm">
            Most Popular
          </span>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-xl font-bold text-forest">{plan.name}</h3>
        <p className="text-sm text-slate-500 mt-1">{plan.description}</p>
      </div>

      <div className="mb-6">
        <PriceDisplay plan={plan} billing={billing} />
      </div>

      <a
        href={plan.ctaHref}
        data-track={`plan-cta-${plan.id}`}
        className={`
          inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold
          transition-colors duration-150
          ${plan.ctaVariant === 'primary'
            ? 'bg-forest text-white hover:bg-emerald-900'
            : 'bg-white text-forest border-2 border-forest hover:bg-cream'
          }
        `}
      >
        {plan.cta}
        <IconArrowRight className="w-4 h-4" />
      </a>
      {plan.id === 'pro' && (
        <p className="mt-2 text-center text-xs text-slate-400">1-click cancel. No questions asked.</p>
      )}

      <ul className="mt-6 space-y-3">
        {plan.features.map((f) => (
          <li key={f.label} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0">
              <FeatureValue value={f.value} label={f.label} />
            </span>
            <span className="text-sm text-slate-600">{f.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Pricing() {
  const [billing, setBilling] = useState('annual');
  const [showStickyCTA, setShowStickyCTA] = useState(false);

  const trackedView = useRef(false);
  useEffect(() => {
    if (trackedView.current) return;
    trackedView.current = true;
    track('pricing_viewed', {});
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const hero = document.getElementById('pricing-hero');
      const heroBottom = hero ? hero.offsetTop + hero.offsetHeight : 600;
      setShowStickyCTA(window.scrollY > heroBottom);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <main className="min-h-screen bg-parchment">
      {/* ── Hero ─────────────────────────────── */}
      <section id="pricing-hero" className="bg-forest text-on-forest py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
            Start eating better for less than a coffee per week
          </h1>
          <p className="mt-4 text-lg md:text-xl text-emerald-100 max-w-2xl mx-auto">
            Build your week around your budget — priced meals and a grocery list that matches it.
          </p>
        </div>
      </section>

      {/* ── Toggle + Cards ─────────────────── */}
      <section className="py-12 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex justify-center mb-12">
            <div className="inline-flex items-center bg-white rounded-full p-1 border border-slate-200 shadow-sm">
              <button
                onClick={() => setBilling('monthly')}
                data-track="billing-toggle-monthly"
                className={`
                  px-5 py-2 text-sm font-semibold rounded-full transition-colors
                  ${billing === 'monthly'
                    ? 'bg-forest text-white'
                    : 'text-slate-600 hover:text-forest'
                  }
                `}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling('annual')}
                data-track="billing-toggle-annual"
                className={`
                  px-5 py-2 text-sm font-semibold rounded-full transition-colors
                  ${billing === 'annual'
                    ? 'bg-forest text-white'
                    : 'text-slate-600 hover:text-forest'
                  }
                `}
              >
                Annual
              </button>
            </div>
          </div>

          <div className="grid gap-6 md:gap-8 md:grid-cols-3 items-start">
            {plans.map((plan) => (
              <PricingCard key={plan.id} plan={plan} billing={billing} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust Badges ───────────────────── */}
      <section className="pb-12 md:pb-16">
        <div className="mx-auto max-w-3xl px-4">
          <div className="flex flex-wrap justify-center items-center gap-6 text-xs text-forest/60">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              SSL Secured
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Stripe Payments
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Cancel Anytime
            </span>
          </div>
        </div>
      </section>

      {/* ── Feature Comparison ─────────────── */}
      <section className="py-12 md:py-16 bg-white">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-forest text-center mb-10">
            Compare all features
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <th className="text-sm font-semibold text-slate-500 uppercase tracking-wider" style={{ padding: '16px 24px' }}>Feature</th>
                  {plans.map((p) => (
                    <th key={p.id} className={`text-center text-sm font-bold ${p.popular ? 'text-emerald-700' : 'text-forest'}`} style={{ padding: '16px 24px' }}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {featureRows.map((row) => (
                  <tr key={row.key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td className="text-sm text-slate-700 font-medium" style={{ padding: '16px 24px' }}>{row.label}</td>
                    {plans.map((p) => {
                      const feat = p.features.find((f) => f.label === row.key);
                      return (
                        <td key={p.id} className="text-center" style={{ padding: '16px 24px' }}>
                          <div className="flex justify-center">
                            <TableFeatureValue value={feat?.value} label={row.label} isFreePlan={p.id === 'free'} />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────── */}
      <PricingFaq />

      {/* ── Closing CTA ────────────────────── */}
      <section className="py-16 md:py-24 bg-forest text-on-forest">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl md:text-4xl font-extrabold">Start saving today</h2>
          <p className="mt-3 text-emerald-100 text-lg max-w-xl mx-auto">
            Tell Mealzy what you can spend. Get a week of meals that fits.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={getLoginUrl('pro', 'annual')}
              data-track="closing-cta-primary"
              className="inline-flex items-center gap-2 rounded-xl bg-white text-forest px-7 py-3.5 text-sm font-bold hover:bg-cream transition-colors"
            >
              Upgrade to Pro
              <IconArrowRight className="w-4 h-4" />
            </a>
            <a
              href="/onboarding.html"
              data-track="closing-cta-secondary"
              className="inline-flex items-center gap-2 rounded-xl border-2 border-emerald-400 text-white px-7 py-3.5 text-sm font-bold hover:bg-emerald-800 transition-colors"
            >
              Build My Free Plan
            </a>
          </div>
          <p className="mt-4 text-xs text-emerald-200">No credit card required for Free. Cancel anytime.</p>
        </div>
      </section>

      {/* ── Sticky Mobile CTA ──────────────── */}
      {showStickyCTA && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-forest/10 p-4 md:hidden shadow-lg">
          <div className="flex items-center justify-between gap-4 max-w-md mx-auto">
            <div>
              <p className="text-sm font-bold text-forest">Pro — $5.17/mo</p>
              <p className="text-xs text-forest/60">Billed monthly, cancel anytime</p>
            </div>
            <a
              href={getLoginUrl('pro', 'annual')}
              data-track="sticky-cta-pro"
              className="px-5 py-2.5 bg-forest text-white rounded-lg text-sm font-bold whitespace-nowrap"
            >
              Upgrade to Pro
            </a>
          </div>
        </div>
      )}
    </main>
  );
}