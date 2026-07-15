import * as React from 'react';
import { Button } from '@/components/ui/button';

/* Centered forest hero band used by meal-plan-generator, budget-meal-plan,
 * weekly-meal-plan, and support.html — mirrors legacy .page-head. */
export default function PageHero({ title, lede, ctaLabel, ctaHref, fine }) {
  return (
    <header className="bg-gradient-to-b from-forest to-forest-deep pb-11 pt-28 text-center text-on-forest sm:pb-16 sm:pt-36">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <h1 className="font-display text-[clamp(2.3rem,4.6vw,3.4rem)] font-black italic leading-[1.05] tracking-[-0.02em] text-on-forest">
          {title}
        </h1>
        {lede && (
          <p className="mx-auto mt-4 max-w-[44ch] text-[1.08rem] leading-[1.6] text-on-forest-body">
            {lede}
          </p>
        )}
        {ctaLabel && (
          <Button href={ctaHref} size="lg" className="mt-2">
            {ctaLabel}
          </Button>
        )}
        {fine && <p className="mt-3.5 text-[0.8rem] text-on-forest-muted">{fine}</p>}
      </div>
    </header>
  );
}
