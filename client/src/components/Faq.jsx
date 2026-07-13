import * as React from 'react';
import Reveal from '@/components/Reveal';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

const FAQS = [
  {
    q: 'Is it actually free?',
    a: 'Yes. The free plan gives you 3 meal plans per month, the grocery list, calorie and macro tracking, and 10 AI coach messages per day. No credit card required. Pro removes the limits — see the pricing page for current plans.'
  },
  {
    q: 'How does the budget work?',
    a: "You set a weekly grocery budget in onboarding. Mealzy builds every meal plan to stay within it. The AI calculates per-meal costs and won't suggest meals that push you over."
  },
  {
    q: 'Can it handle dietary restrictions?',
    a: 'Yes. Vegetarian, vegan, gluten-free, keto, paleo, dairy-free, nut-free, and more. Set your preferences and allergies in onboarding and they apply to every generated plan.'
  },
  {
    q: 'How accurate are the calorie calculations?',
    a: 'We estimate your daily calorie target based on your goal. You can adjust it anytime in settings.'
  },
  {
    q: 'What languages does Mealzy support?',
    a: 'English, Swedish, Norwegian, Danish, German, French, Spanish, Italian, Portuguese, Dutch, and Japanese. The meal names, ingredient lists, AI coach responses, and app interface all switch to your chosen language.'
  },
  {
    q: 'Does Mealzy work in Europe and Sweden?',
    a: "Yes. Mealzy works in 11 languages including Swedish, Norwegian, German, and French. Grocery budget estimates use local pricing. Emil, Mealzy's founder, is based in Sweden."
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
