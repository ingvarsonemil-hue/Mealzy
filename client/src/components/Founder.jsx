import * as React from 'react';
import Reveal from '@/components/Reveal';

const STATS = [
  { num: '10', label: 'Countries' },
  { num: '30 s', label: 'To plan a week' },
  { num: 'Free', label: 'To start' }
];

export default function Founder() {
  return (
    <section id="our-story" aria-label="Our story" className="scroll-mt-20 bg-forest py-16 text-on-forest sm:py-20">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <Reveal className="mx-auto max-w-3xl">
          <blockquote className="font-display text-[clamp(1.5rem,2.4vw+0.6rem,2.25rem)] font-bold italic leading-[1.25] tracking-[-0.02em] text-on-forest-strong">
            "I built Mealzy because meal planning was eating my Sundays. No spreadsheet. No guessing.
            Just a plan that works."
          </blockquote>
          <div className="mt-8 flex items-center gap-4">
            <div
              aria-hidden="true"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-green font-display text-xl font-black italic text-white"
            >
              E
            </div>
            <div>
              <div className="text-base font-semibold">Emil Ingvarson</div>
              <div className="text-sm text-on-forest-muted">Founder · Uppsala, Sweden</div>
            </div>
          </div>
          <div className="mt-10 grid grid-cols-3 gap-6 border-t border-forest-line pt-8">
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="font-display text-[clamp(1.75rem,3vw,2.5rem)] font-black italic leading-none text-green-light">
                  {s.num}
                </div>
                <div className="mt-2 text-sm text-on-forest-muted">{s.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
