import * as React from 'react';
import { cn } from '@/lib/utils';

/* Pill-shaped monthly/annual switch, per the design skill's pricing notes.
 * Sits on forest surfaces (pricing page head, upgrade hero), so the active
 * segment lifts to cream and the track stays a translucent raise. */
export default function BillingToggle({ mode, onChange, annualLabel, monthlyLabel = 'Monthly', className }) {
  const seg = (active) =>
    cn(
      'inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold leading-tight transition-colors duration-200',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-light',
      active ? 'bg-cream text-foreground shadow-sm' : 'bg-transparent text-on-forest-body hover:text-on-forest'
    );
  return (
    <div
      role="group"
      aria-label="Billing period"
      className={cn('inline-flex rounded-full border border-forest-line bg-forest-raise p-1', className)}
    >
      <button type="button" aria-pressed={mode === 'monthly'} className={seg(mode === 'monthly')} onClick={() => onChange('monthly')}>
        {monthlyLabel}
      </button>
      <button type="button" aria-pressed={mode === 'yearly'} className={seg(mode === 'yearly')} onClick={() => onChange('yearly')}>
        {annualLabel}
      </button>
    </div>
  );
}
