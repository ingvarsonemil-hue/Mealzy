import * as React from 'react';
import Reveal from '@/components/Reveal';

const STEPS = [
  {
    title: 'Tell Mealzy about you',
    body: "Your calorie goal, weekly grocery budget, dietary preferences, and anything you can't eat. Takes about 2 minutes and it remembers everything."
  },
  {
    title: 'Get your week in 30 seconds',
    body: "Mealzy builds 7 days of meals balanced to your exact targets and budget. Don't like something — swap it in one click."
  },
  {
    title: 'Shop from the list, cook, repeat',
    body: "The grocery list is already sorted by category with estimated costs. Tick things off as you shop. That's the whole system."
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
            Three steps. Under 2 minutes.
          </h2>
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
                className="w-14 shrink-0 select-none font-display text-[clamp(2.5rem,4vw,3.5rem)] font-black italic leading-none text-green-muted sm:w-20"
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
