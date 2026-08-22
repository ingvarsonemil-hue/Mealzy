import * as React from 'react';
import Reveal from '@/components/Reveal';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

/* Five questions, matched one-for-one by the FAQPage JSON-LD in
 * client/index.html — change one and change the other. These are the questions
 * that decide whether someone starts, in the order they get asked: what it
 * does, whether it fits me, what it costs me to find out, what happens when the
 * free tier runs out, and whether the numbers can be believed. */
const FAQS = [
  {
    q: 'How does budget-based planning work?',
    a: 'You set a weekly grocery budget and the week is built to fit inside it. Every ingredient is priced as the plan is assembled, so the seven days you get back already add up to less than your cap — the budget is a constraint the plan is built against, not a total you are handed afterwards and left to check.'
  },
  {
    q: 'What diets are supported?',
    a: 'Balanced, high protein, vegan and keto, alongside allergies and any ingredients you want kept out entirely. Your choice applies to every meal in the week rather than filtering a fixed plan afterwards, so a vegan week is planned vegan from the start.'
  },
  {
    q: 'Can I use Mealzy without signing up?',
    a: 'No — but the sample week above lets you try it instantly. A free account (no credit card) walks you through a few quick steps to build your personalized plan.'
  },
  {
    q: 'What happens after my first 30 days?',
    a: 'Nothing is taken away. Free gives you one new meal plan a day for your first 30 days, then one new plan every week after that, for free, for as long as you use Mealzy. Every plan you already made stays in your account.',
    plans: [
      { name: 'Pro', price: '$8/month or $62/year' },
      { name: 'Family', price: '$16/month or $128/year' }
    ],
    /* The link is separate from the answer text so the string above stays
      * identical to the FAQPage JSON-LD in client/index.html. */
    href: '/pricing.html',
    linkText: 'See the full pricing page'
  },
  {
    q: 'How accurate are the grocery price estimates?',
    a: 'They are estimates, not quotes. Every line is priced from typical supermarket rates and shown as a range, because groceries vary by store, city and week. Pantry staples are counted at the share the week actually uses rather than as a full pack, and quantities scale with your budget, so a bigger week buys more food rather than the same food at a higher price.'
  }
];

export default function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        <Reveal className="mb-10 text-center">
          <h2
            id="faq-heading"
            className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]"
          >
            Common questions.
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <div
            role="region"
            aria-label="Frequently Asked Questions"
            className="mx-auto max-w-3xl rounded-lg border border-border-warm bg-cream px-6 shadow-card sm:px-8"
          >
            {/* Every answer starts closed, so the section arrives as five even
              * rows and the first question carries no more weight than the
              * rest — opening one is the reader's choice, not the default. */}
            <Accordion type="single" collapsible>
              {FAQS.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i + 1}`}>
                  <AccordionTrigger>{f.q}</AccordionTrigger>
                  <AccordionContent>
                    {f.a}
                    {f.plans && (
                      <ul role="list" className="mt-2 flex flex-col gap-1">
                        {f.plans.map((p) => (
                          <li key={p.name}>
                            <strong className="font-semibold text-foreground">{p.name}:</strong> {p.price}
                          </li>
                        ))}
                      </ul>
                    )}
                    {f.href && (
                      <>
                        {' '}
                        <a
                          href={f.href}
                          className="font-semibold text-green-deep no-underline hover:underline dark:text-green-light"
                        >
                          {f.linkText}
                        </a>
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
