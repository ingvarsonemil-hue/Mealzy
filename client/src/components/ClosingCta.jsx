import * as React from 'react';
import Reveal from '@/components/Reveal';
import { Button } from '@/components/ui/button';

export default function ClosingCta() {
  return (
    <section aria-labelledby="cta-heading" className="bg-forest py-16 text-on-forest sm:py-20">
      <Reveal className="mx-auto max-w-container px-4 text-center sm:px-5">
        <h2
          id="cta-heading"
          className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em] text-on-forest"
        >
          Stop planning meals by hand.
        </h2>
        <p className="mx-auto mt-4 max-w-prose text-lg leading-[1.65] text-on-forest-body">
          Mealzy builds the week, holds your budget, and writes the grocery list in under 1 minute.
          Free to start — no credit card.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button href="login.html?signup=1" size="lg">Build My Free Plan</Button>
          <Button href="pricing.html" variant="veil" size="lg">See pricing</Button>
        </div>
      </Reveal>
    </section>
  );
}
