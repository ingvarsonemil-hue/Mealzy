import * as React from 'react';
import { X } from '@/components/icons';
import { buttonVariants } from '@/components/ui/button';
import { stripeUrls } from '@/lib/stripe';
import { cn } from '@/lib/utils';

/* Abandonment offer — same contract as the legacy upgrade.html inline script:
 * appears in-flow after 45s if the main CTA hasn't been clicked, takes focus,
 * closes on Escape (returning focus to the CTA), and checks out at the
 * discount link (fallback: monthly). */
export default function AbandonOffer({ clickedRef, onCheckout }) {
  const [visible, setVisible] = React.useState(false);
  const boxRef = React.useRef(null);

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (!clickedRef.current) setVisible(true);
    }, 45000);
    return () => clearTimeout(t);
  }, [clickedRef]);

  React.useEffect(() => {
    if (!visible) return;
    boxRef.current?.querySelector('a[href]')?.focus();
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const close = () => {
    setVisible(false);
    document.querySelector('[data-testid="upgrade-cta"]')?.focus();
  };

  if (!visible) return null;

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-labelledby="abandon-offer-title"
      className="relative mt-8 rounded-lg border border-forest-line bg-forest-raise p-6 text-center text-on-forest-body"
    >
      <button
        onClick={close}
        aria-label="Close offer"
        className="absolute right-2 top-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-on-forest-muted transition-colors duration-150 hover:text-on-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-green-light"
      >
        <X width="16" height="16" />
      </button>
      <span className="rounded-full bg-green px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-white">
        First month offer
      </span>
      <p id="abandon-offer-title" className="mt-3 text-base font-bold text-on-forest">
        Get your first month for $4
      </p>
      <p className="mx-auto mt-1.5 mb-4 max-w-[40ch] text-sm leading-relaxed">
        Still not sure? Try Pro at half price this month. No commitment beyond that.
      </p>
      <a
        href={stripeUrls.discount}
        data-testid="abandon-offer-cta"
        className={cn(buttonVariants({ variant: 'primary', size: 'md' }))}
        onClick={onCheckout}
      >
        Get first month for $4
      </a>
    </div>
  );
}
