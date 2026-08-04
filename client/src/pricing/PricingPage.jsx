import * as React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Reveal from '@/components/Reveal';
import BillingToggle from '@/components/BillingToggle';
import PlanCards from './PlanCards';
import DecidingPopup from './DecidingPopup';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import CompareCell from '@/components/CompareCell';
import { stripeUrls } from '@/lib/stripe';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: 'index.html#how-it-works', label: 'How it works' },
  { href: 'index.html#our-story', label: 'Our story' },
  { href: 'pricing.html', label: 'Pricing' },
  { href: 'index.html#faq', label: 'FAQ' }
];

const COMPARISON = [
  ['AI meal plans', '3/month', 'Unlimited', 'Unlimited'],
  ['AI coach messages', '10/day', 'Unlimited', 'Unlimited'],
  ['Auto grocery lists', true, true, true],
  ['Analytics dashboard', 'Basic', 'Advanced', 'Advanced'],
  ['Profiles', '1', '1', 'Up to 4'],
  ['Priority support', false, 'Email', 'Priority']
];

const FAQS = [
  {
    q: 'Can I cancel at any time?',
    a: 'Yes — cancel in one click from your Stripe billing portal. You keep Pro access until the end of your current billing period. No penalties, no fine print.'
  },
  {
    q: 'What happens to my free plan when it runs out?',
    a: 'Your 3 free generations reset automatically every 30 days. You never lose access to plans you have already generated.'
  },
  {
    q: 'Is my data safe?',
    a: 'Yes. Passwords are hashed with bcrypt and never stored in plain text. All traffic is served over HTTPS. We do not sell your data to third parties. Payments are handled entirely by Stripe — we never see your card number.'
  },
  {
    q: 'Do you store my meal plans?',
    a: "Your meal plans and profile preferences are stored securely on our servers, tied to your account. You can access them from any device as long as you're signed in. We do not sell your data."
  }
];

export default function PricingPage() {
  const [mode, setMode] = React.useState('monthly');
  /* Without a configured annual Stripe link, a "yearly" click would silently
   * check out at the monthly URL (the known wrong-URL bug) — hide the toggle. */
  const annualAvailable = stripeUrls.annualReady;

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header links={NAV_LINKS} activeHref="pricing.html" />
      <main id="main">
        {/* Page head — forest drench, toggle lives with the headline */}
        <header className="bg-forest pb-28 pt-32 text-center text-on-forest sm:pb-32">
          <div className="mx-auto max-w-container px-4 sm:px-5">
            <h1 className="font-display text-[clamp(2.5rem,4vw+1rem,4rem)] font-black italic leading-[1.05] tracking-[-0.03em] text-on-forest">
              Simple pricing. Start free.
            </h1>
            <p className="mx-auto mt-4 max-w-prose text-lg leading-[1.65] text-on-forest-body">
              3 meal plans a month, free forever. No credit card required.
            </p>
            {annualAvailable && (
              <BillingToggle mode={mode} onChange={setMode} annualLabel="Annual — Save 35%" className="mt-8" />
            )}
          </div>
        </header>

        {/* Plans — pulled up over the forest edge */}
        <section aria-label="Plans" className="pb-16 sm:pb-20">
          <div className="mx-auto -mt-20 max-w-container px-4 sm:px-5">
            <PlanCards mode={mode} />
            <Reveal className="mx-auto mt-12 max-w-2xl text-center">
              <h3 className="font-display text-2xl font-bold italic tracking-[-0.01em]">
                7-day free trial on Pro. No credit card to start.
              </h3>
              <p className="mt-3 text-[17px] leading-[1.7] text-muted-fg">
                Try Pro free for 7 days. If you don&rsquo;t love it, you won&rsquo;t be charged.
                Cancel any time — no questions, one click.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Comparison — immediately after the cards, per the design skill */}
        <section aria-labelledby="compare-heading" className="bg-parchment py-16 sm:py-20">
          <div className="mx-auto max-w-container px-4 sm:px-5">
            <Reveal className="mb-10 text-center">
              <h2 id="compare-heading" className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]">
                Compare plans.
              </h2>
            </Reveal>
            <Reveal className="mx-auto max-w-3xl overflow-x-auto rounded-lg border border-border-warm bg-cream shadow-card">
              <table className="w-full min-w-[520px] border-collapse" aria-label="Feature comparison">
                <thead>
                  <tr className="border-b border-border-warm">
                    <th scope="col" className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">Feature</th>
                    <th scope="col" className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">Free</th>
                    <th scope="col" className="bg-green/5 px-4 py-3.5 text-center text-xs font-bold uppercase tracking-[0.08em] text-green-deep dark:text-green-light">Pro</th>
                    <th scope="col" className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">Family</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map(([feature, free, pro, family], i) => (
                    <tr key={feature} className={cn(i < COMPARISON.length - 1 && 'border-b border-hairline')}>
                      <td className="px-4 py-3.5 text-[15px] font-medium">{feature}</td>
                      <CompareCell value={free} className="px-4 py-3.5" />
                      <CompareCell value={pro} pro className="px-4 py-3.5" />
                      <CompareCell value={family} className="px-4 py-3.5" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-heading" className="py-16 sm:py-20">
          <div className="mx-auto max-w-container px-4 sm:px-5">
            <Reveal className="mb-10 text-center">
              <h2 id="faq-heading" className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]">
                Common questions.
              </h2>
            </Reveal>
            <Reveal delay={80}>
              <div role="region" aria-label="Frequently Asked Questions" className="mx-auto max-w-3xl rounded-lg border border-border-warm bg-cream px-6 shadow-card sm:px-8">
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
            <Reveal className="mx-auto mt-8 max-w-3xl text-sm leading-[1.7] text-muted-fg">
              <p>
                Still not sure?{' '}
                <a href="upgrade.html" className="font-semibold text-green-deep no-underline hover:underline dark:text-green-light">
                  See a full breakdown of what Pro unlocks
                </a>
                <br />
                Questions?{' '}
                <a href="mailto:support@mealzy.org" className="text-green-deep underline dark:text-green-light">support@mealzy.org</a>
                {' '}— usually replied to within 24 hours.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Closing CTA */}
        <section aria-labelledby="cta-heading" className="bg-forest py-16 text-on-forest sm:py-20">
          <Reveal className="mx-auto max-w-container px-4 text-center sm:px-5">
            <h2 id="cta-heading" className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em] text-on-forest">
              Stop planning meals by hand.
            </h2>
            <p className="mx-auto mt-4 max-w-prose text-lg leading-[1.65] text-on-forest-body">
              Mealzy builds the full week in 30 seconds. Free to start — no credit card.
            </p>
            <div className="mt-8">
              <Button href="login.html?signup=1" size="lg">Plan My Week Free</Button>
            </div>
          </Reveal>
        </section>
      </main>
      <DecidingPopup />
      <Footer />
    </>
  );
}
