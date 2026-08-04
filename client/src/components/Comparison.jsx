import * as React from 'react';
import Reveal from '@/components/Reveal';
import { Check, X } from '@/components/icons';

/* The five differences that actually change what you do on a Sunday. Wording
 * stays inside what the product provably does: prices are deterministic (the
 * same plan always costs the same), not live store feeds. */
const ROWS = [
  {
    feature: 'Deterministic grocery pricing',
    mealzy: 'Every line priced from a fixed table. The same plan costs the same every time.',
    other: 'Totals guessed on the spot, and different on every retry.'
  },
  {
    feature: 'Budget cap enforcement',
    mealzy: 'The week is built to your cap, and re-plans itself the moment you move it.',
    other: 'You add it up by hand, then ask again and hope.'
  },
  {
    feature: 'Grocery list sorted by aisle',
    mealzy: 'Produce, protein, pantry — ready to shop from as-is.',
    other: 'One block of raw text you reformat yourself.'
  },
  {
    feature: '1-click recipe swaps',
    mealzy: 'Swap a meal; calories, macros and cost rebalance around it.',
    other: 'One change and the whole prompt has to be rewritten.'
  },
  {
    feature: 'Saved dietary preferences',
    mealzy: 'Allergies and dislikes saved once, applied to every plan after.',
    other: 'Retyped every session, gone the next.'
  }
];

/* One verdict cell. `good` picks the mark and the surface; the visually hidden
 * label carries the column name so each cell still reads on its own when the
 * grid collapses to a single column on small screens. */
function Verdict({ good, label, children }) {
  const Mark = good ? Check : X;
  return (
    <div
      className={
        good
          ? 'flex gap-3 rounded-md bg-green/[0.07] p-4 md:rounded-none md:bg-transparent md:p-0'
          : 'flex gap-3 rounded-md bg-muted-bg p-4 md:rounded-none md:bg-transparent md:p-0'
      }
    >
      <span
        aria-hidden="true"
        className={
          good
            ? 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green text-white'
            : 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-warm text-muted-fg'
        }
      >
        <Mark width="12" height="12" />
      </span>
      <p className="min-w-0 text-[15px] leading-[1.6]">
        <span className="mb-0.5 block text-xs font-bold uppercase tracking-[0.08em] text-muted-fg md:sr-only">
          {label}
        </span>
        <span className={good ? 'text-foreground' : 'text-muted-fg'}>{children}</span>
      </p>
    </div>
  );
}

export default function Comparison() {
  return (
    <section id="comparison" aria-labelledby="comparison-heading" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <Reveal className="mx-auto mb-10 max-w-prose text-center">
          <span className="mb-4 inline-block rounded-full bg-green px-4 py-1 text-xs font-bold uppercase tracking-[0.08em] text-white">
            Side by side
          </span>
          <h2
            id="comparison-heading"
            className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]"
          >
            Why not just ask ChatGPT?
          </h2>
          <p className="mt-4 text-[17px] leading-[1.7] text-muted-fg">
            You can. It writes a nice list. Then you price it, total it, and re-do the whole thing
            when one meal doesn't work. Mealzy is built to finish the job.
          </p>
        </Reveal>

        <Reveal
          delay={60}
          className="overflow-hidden rounded-lg border border-border-warm bg-cream shadow-card"
        >
          {/* Column headers exist only once the grid is side-by-side; below md
           * each cell carries its own label instead. */}
          <div
            aria-hidden="true"
            className="hidden border-b border-border-warm md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div className="px-6 py-4" />
            <div className="border-l border-border-warm bg-green/[0.07] px-6 py-4 font-display text-lg font-bold italic">
              Mealzy
            </div>
            <div className="border-l border-border-warm px-6 py-4 font-display text-lg font-bold italic text-muted-fg">
              ChatGPT / generic AI
            </div>
          </div>

          <ul role="list" className="divide-y divide-border-warm">
            {ROWS.map((row) => (
              <li
                key={row.feature}
                className="grid gap-3 p-4 sm:p-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-0 md:p-0"
              >
                <h3 className="text-base font-semibold leading-snug md:px-6 md:py-5">
                  {row.feature}
                </h3>
                <div className="md:border-l md:border-border-warm md:bg-green/[0.07] md:px-6 md:py-5">
                  <Verdict good label="Mealzy">{row.mealzy}</Verdict>
                </div>
                <div className="md:border-l md:border-border-warm md:px-6 md:py-5">
                  <Verdict good={false} label="ChatGPT / generic AI">{row.other}</Verdict>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
