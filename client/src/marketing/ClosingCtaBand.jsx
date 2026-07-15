import * as React from 'react';
import { Button } from '@/components/ui/button';

/* Forest CTA band closing out SEO/tool pages — mirrors legacy .close-band. */
export default function ClosingCtaBand({ title, lede, ctaLabel, ctaHref }) {
  return (
    <section aria-labelledby="cta-heading" className="mt-14 bg-forest py-16 text-center text-on-forest-strong sm:py-20">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <h2
          id="cta-heading"
          className="mx-auto max-w-[18ch] font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em] text-on-forest"
        >
          {title}
        </h2>
        <p className="mx-auto mb-8 mt-4 max-w-[50ch] text-[1.1rem] text-on-forest-body">{lede}</p>
        <Button href={ctaHref} size="lg">{ctaLabel}</Button>
      </div>
    </section>
  );
}
