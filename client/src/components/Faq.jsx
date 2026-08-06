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
    a: 'Yes. The sample week on this page re-plans itself as you move the budget, and the preview builds a full week from your own targets without an email address. A free account is what saves your plans and generates new ones — it takes about two minutes and asks for no card.'
  },
  {
    q: 'What happens after 3 free plans?',
    a: 'Nothing is taken away. Free covers 3 meal plans a month; once they are used the plans you already made stay in your account, and the count resets at the start of the next month. Pro is $8 a month or $62 a year and removes the limit, and Family is $16 a month or $130 a year and adds up to 4 profiles.',
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
            {/* The first answer is open on arrival. Fully collapsed, the section
              * reads as a heading over five thin rows with no answer in sight —
              * it looks unpopulated rather than tidy, and how the budget works
              * is the thing the whole page is about. The rest stay closed. */}
            <Accordion type="single" collapsible defaultValue="faq-1">
              {FAQS.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i + 1}`}>
                  <AccordionTrigger>{f.q}</AccordionTrigger>
                  <AccordionContent>
                    {f.a}
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
