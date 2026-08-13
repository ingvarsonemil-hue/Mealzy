import * as React from 'react';
import Reveal from '@/components/Reveal';

const STEPS = [
  {
    title: 'Tell Mealzy about you',
    body: "Calories, weekly budget, diet, and anything you can't eat. A 3-minute setup, once — it remembers."
  },
  {
    title: 'Get your week in 30 seconds',
    body: "Targets use the Mifflin-St Jeor formula dietitians use. Every recipe is matched to your budget, so nothing gets suggested that pushes you over. Swap any meal in one click."
  },
  {
    title: 'Shop from the list, cook, repeat',
    body: "Sorted by category, priced per item. Tick things off as you shop. That's it."
  }
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <Reveal className="mb-12 text-center">
          <h2
            id="how-heading"
            className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]"
          >
            Three steps. One week planned.
          </h2>
          {/* Same sentence as the hero, word for word — the two places a
            * visitor meets the time claim must not quote different numbers. */}
          <p className="mt-4 text-[17px] leading-[1.7] text-muted-fg">
            3-minute setup. 30 seconds every week after. Every swap stays inside your budget.
          </p>
        </Reveal>
        <div className="mx-auto max-w-3xl">
          {STEPS.map((step, i) => (
            <Reveal
              key={step.title}
              delay={i * 80}
              className="flex gap-6 border-b border-hairline py-8 first:pt-0 last:border-b-0 sm:gap-10"
            >
              <span
                aria-hidden="true"
                className="w-14 shrink-0 select-none font-display text-[clamp(2.5rem,4vw,3.5rem)] font-black italic leading-none text-green-deep dark:text-green-light sm:w-20"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="font-display text-2xl font-bold leading-[1.15] tracking-[-0.01em]">{step.title}</h3>
                <p className="mt-2 max-w-prose text-[17px] leading-[1.7] text-muted-fg">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
