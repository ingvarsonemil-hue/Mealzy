import * as React from 'react';
import Reveal from '@/components/Reveal';
import { Button } from '@/components/ui/button';

export default function ClosingCta({ ctaHref = 'login.html?signup=1' }) {
  return (
    <section aria-labelledby="cta-heading" className="bg-forest py-16 text-on-forest sm:py-20">
      <Reveal className="mx-auto max-w-container px-4 text-center sm:px-5">
        <h2
          id="cta-heading"
          className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em] text-on-forest"
        >
          Start Saving Time and Money Today
        </h2>
        <p className="mx-auto mt-4 max-w-prose text-lg leading-[1.65] text-on-forest-body">
          Join thousands of people who plan smarter, shop faster, and stay under budget every week.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4">
          <Button href={ctaHref} size="lg" className="bg-white text-forest-deep hover:bg-gray-100">
            Generate My Free Week →
          </Button>
          <a
            href="pricing.html"
            className="inline-flex items-center rounded-full border border-on-forest-body/30 bg-transparent px-5 py-2 text-sm font-medium text-on-forest-body transition-colors hover:bg-on-forest-body/10 hover:text-on-forest"
          >
            View full pricing
          </a>
        </div>
        <p className="mt-4 text-sm text-on-forest-muted">
          ✓ No credit card required &nbsp;·&nbsp; ✓ Cancel anytime &nbsp;·&nbsp; ✓ 14-day money-back guarantee
        </p>
      </Reveal>
    </section>
  );
}