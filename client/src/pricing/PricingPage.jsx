import * as React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Reveal from '@/components/Reveal';
import BillingToggle from '@/components/BillingToggle';
import PlanCards from './PlanCards';
import DecidingPopup from './DecidingPopup';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Lock } from '@/components/icons';
import { stripeUrls } from '@/lib/stripe';

const NAV_LINKS = [
  { href: 'index.html#how-it-works', label: 'How it works' },
  { href: 'pricing.html', label: 'Pricing' },
  { href: 'index.html#faq', label: 'FAQ' }
];

const FAQS = [
  {
    q: 'How does the 7-day free trial work?',
    a: 'You get 7 full days of Pro with $0 due today. If you cancel before day 7 you are never charged. If you stay, billing starts on day 8 at the price you picked — $8 a month or $62 a year.'
  },
  {
    q: 'Can I switch or cancel my plan anytime?',
    a: 'Yes. Cancel in one click from your account settings — no email, no questions. You can also move between monthly and annual, or between Pro and Family, at any time. Access continues until the end of the period you have already paid for.'
  },
  {
    q: 'What payment methods are supported?',
    a: 'All major credit and debit cards, plus Apple Pay and Google Pay where your device supports them. Card details go straight to Stripe — we never see or store your card number.',
    badge: 'Secure payment via Stripe'
  },
  {
    q: 'What happens when my 3 free monthly plans run out?',
    a: 'Nothing is lost. Every plan you have already generated stays in your account, and your grocery lists stay with them. Your 3 free generations reset automatically every 30 days. Upgrade to Pro whenever you want them sooner.'
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
              3 meal plans a month, free forever. No credit card required. Paid plans are $8 or $16
              a month — the full figures are below.
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
                7-day free trial on Pro. $0 due today.
              </h3>
              <p className="mt-3 text-[17px] leading-[1.7] text-muted-fg">
                Try Pro free for 7 days. Cancel before day 7 and you are never charged.
                Cancel anytime — 1-click in account settings.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Billing FAQ — the cards carry the feature detail, so no table here */}
        <section id="faq" aria-labelledby="faq-heading" className="bg-parchment py-16 sm:py-20">
          <div className="mx-auto max-w-container px-4 sm:px-5">
            <Reveal className="mb-10 text-center">
              <h2 id="faq-heading" className="font-display text-[clamp(1.75rem,2.6vw+0.6rem,2.75rem)] font-bold italic leading-[1.1] tracking-[-0.02em]">
                Billing questions.
              </h2>
            </Reveal>
            <Reveal delay={80}>
              <div role="region" aria-label="Billing questions" className="mx-auto max-w-3xl rounded-lg border border-border-warm bg-cream px-6 shadow-card sm:px-8">
                <Accordion type="single" collapsible>
                  {FAQS.map((f, i) => (
                    <AccordionItem key={i} value={`faq-${i + 1}`}>
                      <AccordionTrigger>{f.q}</AccordionTrigger>
                      <AccordionContent>
                        {f.a}
                        {f.badge && (
                          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border-warm bg-parchment px-3 py-1.5 text-sm font-semibold text-muted-fg">
                            <Lock width="14" height="14" className="shrink-0 text-green" />
                            {f.badge}
                          </span>
                        )}
                      </AccordionContent>
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
              Mealzy builds the full week in about 30 seconds. Free to start — no credit card.
            </p>
            <div className="mt-8">
              <Button href="login.html?signup=1" size="lg">Plan My Week Free</Button>
            </div>
            <p className="mt-4 text-sm leading-[1.6] text-on-forest-muted">
              Cancel anytime — 1-click in account settings.
            </p>
          </Reveal>
        </section>
      </main>
      <DecidingPopup />
      <Footer />
    </>
  );
}
