import * as React from 'react';
import Reveal from '@/components/Reveal';
import { planFor, range, BASE_BUDGET } from '@/components/showcase-plan';

/* Figures a visitor can check against the sample plan rendered above rather
 * than take on trust. The first is derived from that same plan, so the two can
 * never drift apart; the third comes from the pricing. */
const PROOF = [
  {
    figure: range(planFor(BASE_BUDGET).spend),
    title: 'A full week, priced line by line',
    body: `21 meals, estimated against a $${BASE_BUDGET} cap. Move the budget slider and the grocery list re-prices with it.`
  },
  {
    figure: '30 sec',
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
          <h2
            id="proof-heading"
            className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]"
          >
            Numbers you can check yourself.
          </h2>
          <p className="mt-4 text-[17px] leading-[1.7] text-muted-fg">
            Every figure below comes from the sample plan on this page or from the pricing, so you
            can check each one against what you just saw.
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
          Grocery prices vary by store and city, so every total is an estimated range rather than
          a quote.
        </Reveal>
      </div>
    </section>
  );
}
