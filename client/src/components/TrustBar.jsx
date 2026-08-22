import * as React from 'react';
import Reveal from '@/components/Reveal';

/* Three claims about the plan itself — no invented stats (no "12,000 price
 * points" style numbers). Each line here is something the app actually does,
 * checkable by using it. */
const ITEMS = [
  {
    title: "Every meal priced before it's added",
    body: 'Nothing enters your plan without a cost estimate attached. The budget check happens while the plan is built, not after.'
  },
  {
    title: 'Calorie targets via Mifflin-St Jeor',
    body: 'A standard energy-needs formula, applied to the height, weight and activity level you enter. Nutrition values are estimates, not medical advice.'
  },
  {
    title: 'Prices are estimates, not quotes',
    body: 'Grocery costs use typical supermarket rates. Your local prices may vary — that’s why plans leave a margin under your budget, not right at it.'
  }
];

export default function TrustBar() {
  return (
    <section aria-labelledby="trust-heading" className="bg-parchment py-16 sm:py-20">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <Reveal className="mx-auto mb-10 max-w-prose text-center">
          <h2
            id="trust-heading"
            className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]"
          >
            How the numbers work.
          </h2>
        </Reveal>
        <div className="grid gap-8 sm:grid-cols-3">
          {ITEMS.map((item, i) => (
            <Reveal key={item.title} delay={i * 100}>
              <h3 className="font-display text-lg font-bold leading-[1.2]">{item.title}</h3>
              <p className="mt-2 text-[15px] leading-[1.6] text-muted-fg">{item.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
