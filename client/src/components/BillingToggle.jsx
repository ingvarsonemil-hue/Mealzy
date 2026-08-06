import * as React from 'react';
import { cn } from '@/lib/utils';

/* Pill-shaped monthly/annual switch, per the design skill's pricing notes.
 * Sits on forest surfaces (pricing page head, upgrade hero), so the active
 * segment lifts to cream and the track stays a translucent raise. */
export default function BillingToggle({
  mode,
  onChange,
  annualLabel,
  monthlyLabel = 'Monthly',
  /* Set when STRIPE_ANNUAL_URL isn't configured. The switch still renders —
   * hiding it entirely was what left the page with no toggle at all — but the
   * annual segment can't be selected, so nobody is shown a yearly price and
   * then sent to the monthly checkout link. */
  annualDisabled = false,
  className
}) {
  const seg = (active, disabled) =>
    cn(
      'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold leading-tight transition-colors duration-200',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-light',
      disabled
        ? 'cursor-not-allowed text-on-forest-muted opacity-60'
        : cn(
            'cursor-pointer',
            active ? 'bg-cream text-foreground shadow-sm' : 'bg-transparent text-on-forest-body hover:text-on-forest'
          )
    );
  return (
    <div
      role="group"
      aria-label="Billing period"
      className={cn('inline-flex rounded-full border border-forest-line bg-forest-raise p-1', className)}
    >
      <button
        type="button"
        aria-pressed={mode === 'monthly'}
        className={seg(mode === 'monthly', false)}
        onClick={() => onChange('monthly')}
      >
        {monthlyLabel}
      </button>
      <button
        type="button"
        aria-pressed={mode === 'yearly'}
        disabled={annualDisabled}
        title={annualDisabled ? 'Annual billing is not available right now.' : undefined}
        className={seg(mode === 'yearly', annualDisabled)}
        onClick={() => !annualDisabled && onChange('yearly')}
      >
        {annualLabel}
      </button>
    </div>
  );
}
