import * as React from 'react';
import Reveal from '@/components/Reveal';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

/* Three questions, matched one-for-one by the FAQPage JSON-LD in
 * client/index.html — change one and change the other. */
const FAQS = [
  {
    q: 'What does Mealzy cost?',
    a: 'Pro is $8 a month or $62 a year, and Family is $16 a month or $130 a year. Both remove the monthly plan limit. See the pricing page for what each tier includes.'
  },
  {
    q: "Can I swap a meal I don't want?",
    a: 'Yes. Swap any meal in one click and the week rebuilds around it — the grocery list and the budget total update with it, so you never end up over your cap.'
  },
  {
    q: 'How accurate are the grocery estimates?',
    a: 'They are estimates, not quotes. Every line is priced from typical supermarket rates and shown as a range, because groceries vary by store, city and week. Pantry staples are counted at the share the week actually uses rather than as a full pack.'
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
            <Accordion type="single" collapsible>
              {FAQS.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i + 1}`}>
                  <AccordionTrigger>{f.q}</AccordionTrigger>
                  <AccordionContent>{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
