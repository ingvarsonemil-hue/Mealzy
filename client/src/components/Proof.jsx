import * as React from 'react';
import Reveal from '@/components/Reveal';

/* Stands in the slot a testimonial wall would occupy, but carries only figures
 * a visitor can verify without trusting us: the first two come straight from
 * the sample plan rendered above (showcase-plan.js, $60 budget), the third from
 * the free tier. No attributed quotes until there are real ones to publish. */
const PROOF = [
  {
    figure: '$57.84',
    title: 'A full week, priced line by line',
    body: '21 meals in the plan above, $2.16 under a $60 cap. Move the budget slider and the receipt still adds up to the number on the card.'
  },
  {
    figure: '30 s',
    title: 'From targets to a shopping list',
    body: 'Calories and budget in, seven days of breakfast, lunch and dinner out, with the grocery list already sorted by aisle.'
  },
  {
    figure: '$0',
    title: 'Three plans a month, no card',
    body: 'The free tier is the real product, not a preview. You only pay if you want more than three plans a month.'
  }
];

export default function Proof() {
  return (
    <section aria-labelledby="proof-heading" className="bg-parchment py-16 sm:py-20">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <Reveal className="mx-auto mb-10 max-w-prose text-center">
          <span className="mb-4 inline-block rounded-full border border-border-warm bg-cream px-4 py-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">
            Early access
          </span>
          <h2
            id="proof-heading"
            className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]"
          >
            Numbers you can check yourself.
          </h2>
          <p className="mt-4 text-[17px] leading-[1.7] text-muted-fg">
            Mealzy is new, so there is no wall of reviews here yet. Instead, here is what the
            product does — every figure comes from the sample plan on this page or from the pricing.
          </p>
        </Reveal>

        <ul role="list" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PROOF.map((p, i) => (
            <Reveal
              as="li"
              key={p.title}
              delay={60 + i * 60}
              className="rounded-lg border border-border-warm bg-cream p-6 shadow-card"
            >
              <p className="font-display text-[clamp(2.25rem,5vw,3rem)] font-black italic leading-none tabular-nums text-green dark:text-green-light">
                {p.figure}
              </p>
              <h3 className="mt-4 font-display text-xl font-bold leading-[1.2] tracking-[-0.01em]">
                {p.title}
              </h3>
              <p className="mt-3 text-[15px] leading-[1.6] text-muted-fg">{p.body}</p>
            </Reveal>
          ))}
        </ul>

        <Reveal delay={240} as="p" className="mt-8 text-center text-sm text-muted-fg">
          Figures from the sample plan and the current pricing, not from customer testimonials.
          We will publish those once early users have run a few weeks.
        </Reveal>
      </div>
    </section>
  );
}
