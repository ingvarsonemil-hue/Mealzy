import { getCheckoutInfo, trackCheckoutClick } from './usePricingCheckout';

function IconArrowRight({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/* Shared paid-plan CTA (Pro/Family only) — Free plans render their own
 * static link inline, never gated: it doesn't touch Stripe or account state. */
export default function PlanCta({ plan, billing, accountState, stripeReady, className, ctaLabel }) {
  const btnClasses = className || `
    inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold
    transition-colors duration-150
    ${plan.ctaVariant === 'primary'
      ? 'bg-forest text-white hover:bg-emerald-900'
      : 'bg-white text-forest border-2 border-forest hover:bg-cream'
    }
  `;
  const label = ctaLabel || plan.cta;

  if (accountState === 'pro') {
    return (
      <a href="/settings.html" className={btnClasses}>
        Manage subscription
        <IconArrowRight className="w-4 h-4" />
      </a>
    );
  }

  if (accountState === 'pending' || accountState === 'error') {
    return (
      <button
        type="button"
        className={`${btnClasses} opacity-60 cursor-not-allowed`}
        disabled
        aria-disabled="true"
        title={accountState === 'error'
          ? "We couldn't verify your account — refresh the page to try again."
          : 'Checking your account…'}
      >
        {label}
      </button>
    );
  }

  const { href, ready } = getCheckoutInfo(plan.id, billing, stripeReady);
  if (!ready || !href) {
    return (
      <button
        type="button"
        className={`${btnClasses} opacity-60 cursor-not-allowed`}
        disabled
        aria-disabled="true"
        title="Checkout is temporarily unavailable — please try again shortly."
      >
        {label}
      </button>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={btnClasses}
      onClick={() => trackCheckoutClick(plan.id, billing)}
    >
      {label}
      <IconArrowRight className="w-4 h-4" />
    </a>
  );
}
