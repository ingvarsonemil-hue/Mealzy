import * as React from 'react';
import BillingToggle from '@/components/BillingToggle';
import AbandonOffer from './AbandonOffer';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/Header';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Sun, Moon, CircleCheck, HelpCircle, Lock } from '@/components/icons';
import CompareCell from '@/components/CompareCell';
import { stripeUrls } from '@/lib/stripe';
import { track } from '@/lib/api';
import { cn } from '@/lib/utils';

const FEATURES = [
  { label: 'Unlimited AI meal plans', desc: 'Generate as many times as you want. Every week, every diet change, every goal shift.' },
  { label: 'PDF export — download & print', desc: 'Export your full meal plan and grocery list as a clean PDF. Print it, share it, save it.' },
  { label: 'Unlimited AI coaching with Mia', desc: 'Ask anything, any time. Recipe help, macro questions, what to do with leftovers.' },
  { label: 'Priority generation — 2x faster', desc: 'Pro requests jump the queue. Your plan is ready in about 15 seconds.' },
  { label: 'Advanced macros per meal', desc: 'See protein, carbs, and fat broken down for every individual meal — not just daily totals.' },
  { label: 'Cancel any time, instantly', desc: 'One click in your billing portal. No emails, no questions. Pro access continues until period end.' }
];

const OBJECTIONS = [
  { q: "What if I don't like it?", a: "Cancel in one click from your billing portal. You keep Pro until your period ends. We've made it as easy to cancel as it is to sign up." },
  { q: 'Is my card safe?', a: 'All payments go through Stripe — the same processor used by Amazon and Google. We never see your card number.' },
  { q: 'Will the price go up?', a: 'Not for you — current subscribers lock in today’s price. We may raise prices for new users as we grow.' }
];

const COMPARISON = [
  ['Meal plans/month', '3', 'Unlimited', 'Unlimited'],
  ['AI Coach messages/day', '10', 'Unlimited', 'Unlimited'],
  ['PDF export', false, true, true],
  ['Individual profiles', '1', '1', 'Up to 4'],
  ['Combined grocery list', false, false, true],
  ['Priority support', false, 'Email', 'Priority']
];

const FAQS = [
  { q: 'What happens to my data if I cancel?', a: 'Your account stays. Your meal history stays. You just go back to 3 free plans per month. Nothing is deleted. You can re-upgrade any time.' },
  { q: 'Is there a contract or minimum commitment?', a: 'No. Cancel any time from your billing portal — one click, no questions asked. You keep Pro access until the end of your current billing period.' },
  { q: 'Do you store my payment details?', a: 'No. Payments go through Stripe — the same processor used by Amazon and Google. We never see your card number, expiry date, or CVV.' }
];

/* Cream panel sitting on the forest-drenched page. */
function Panel({ children, className }) {
  return <div className={cn('rounded-lg bg-cream p-6 text-foreground shadow-xl', className)}>{children}</div>;
}

export default function UpgradePage() {
  const [theme, toggleTheme] = useTheme();
  /* Legacy contract: no configured annual link -> monthly only, toggle hidden.
   * When annual exists the page defaults to yearly (best value). */
  const annualAvailable = stripeUrls.annualReady;
  const [mode, setMode] = React.useState(annualAvailable ? 'yearly' : 'monthly');
  const clickedRef = React.useRef(false);
  const yearly = mode === 'yearly';

  const onCtaClick = (source) => {
    clickedRef.current = true;
    track('upgrade_click', { source: source || 'upgrade_page', billing: mode });
  };

  return (
    <div className="min-h-screen bg-forest bg-[linear-gradient(175deg,var(--color-forest)_55%,var(--color-forest-deep)_100%)] text-on-forest">
      <a href="#main" className="skip-link">Skip to main content</a>

      <nav aria-label="Main navigation" className="bg-forest/95">
        <div className="mx-auto flex h-16 max-w-container items-center justify-between px-4 sm:px-5">
          <a href="/" aria-label="Mealzy home" className="font-display text-2xl font-black italic text-on-forest no-underline">Mealzy</a>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-on-forest-body transition-colors duration-200 hover:bg-forest-raise hover:text-on-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-light"
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
            <Button href="/dashboard.html" variant="quiet" size="sm" className="text-on-forest-body hover:text-on-forest">
              Back to dashboard
            </Button>
          </div>
        </div>
      </nav>

      <main id="main" className="mx-auto max-w-[580px] px-5 pb-12 pt-8 sm:pt-10">
        <header className="text-center">
          <h1 className="font-display text-[clamp(1.9rem,4vw,2.6rem)] font-black italic leading-[1.12] tracking-[-0.02em] text-on-forest">
            Unlock the full Mealzy experience.
          </h1>
          <p className="mx-auto mt-3 max-w-[44ch] text-[17px] leading-[1.65] text-on-forest-body">
            You&rsquo;ve seen how fast it works. Pro removes all limits — and adds features that make it
            genuinely better every week.
          </p>
          {annualAvailable && (
            <div className="mt-7 flex justify-center">
              <BillingToggle
                mode={mode}
                onChange={setMode}
                annualLabel={
                  <>
                    Yearly
                    <span className="rounded-full bg-green px-2 py-0.5 text-xs font-bold text-white">
                      Save 35%
                    </span>
                  </>
                }
              />
            </div>
          )}
        </header>

        {/* Decision card */}
        <Panel className="mt-8 p-8">
          <p className="text-center">
            <span className="rounded-full bg-green px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-white">Most popular</span>
          </p>
          <p className="mt-4 text-center">
            <span className="font-display text-5xl font-bold italic leading-none tracking-[-0.02em]">{yearly ? '$5' : '$8'}</span>
            <span className="text-base text-muted-fg">/month</span>
          </p>
          <p className="mt-1.5 min-h-[1.3em] text-center text-sm text-muted-fg" aria-live="polite">
            {yearly ? 'Billed $62/year — saves $34' : ''}
          </p>

          <ul role="list" className="mt-6 flex flex-col gap-4">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-start gap-2.5">
                <CircleCheck className="mt-0.5 shrink-0 text-green" />
                <div>
                  <p className="text-[15px] font-semibold leading-snug">{f.label}</p>
                  <p className="mt-0.5 text-sm leading-normal text-muted-fg">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>

          <Button
            href={yearly ? stripeUrls.annual : stripeUrls.monthly}
            target="_blank"
            rel="noopener"
            size="lg"
            full
            className="mt-7"
            data-testid="upgrade-cta"
            onClick={() => onCtaClick()}
          >
            {yearly ? 'Start Pro Annual — 7 Days Free' : 'Start Pro — 7 Days Free'}
          </Button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[13px] leading-normal text-muted-fg">
            <Lock className="shrink-0" />
            7-day free trial. No charge for 7 days. Cancel before then and you owe nothing.
          </p>
        </Panel>

        {/* Objections */}
        <div className="mt-8 flex flex-col gap-3">
          {OBJECTIONS.map((o) => (
            <div key={o.q} className="flex items-start gap-2.5 rounded-md border border-forest-line bg-forest-raise px-4 py-3.5 text-[15px] leading-relaxed text-on-forest-body">
              <HelpCircle className="mt-1 shrink-0 text-green-light" />
              <p><strong className="text-on-forest">{o.q}</strong> {o.a}</p>
            </div>
          ))}
        </div>

        {/* Comparison */}
        <Panel className="mt-10">
          <h2 className="font-display text-xl font-bold italic tracking-[-0.01em]">Compare plans</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse" aria-label="Feature comparison">
              <thead>
                <tr className="border-b border-border-warm">
                  <th scope="col" className="px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">Feature</th>
                  <th scope="col" className="px-3 py-3 text-center text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">Free</th>
                  <th scope="col" className="bg-green/5 px-3 py-3 text-center text-xs font-bold uppercase tracking-[0.08em] text-green-deep dark:text-green-light">Pro</th>
                  <th scope="col" className="px-3 py-3 text-center text-xs font-bold uppercase tracking-[0.08em] text-muted-fg">Family</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([feature, free, pro, family], i) => (
                  <tr key={feature} className={cn(i < COMPARISON.length - 1 && 'border-b border-hairline')}>
                    <td className="px-3 py-3 text-[15px] font-medium">{feature}</td>
                    <CompareCell value={free} />
                    <CompareCell value={pro} pro />
                    <CompareCell value={family} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* FAQ */}
        <Panel className="mt-8">
          <h2 className="font-display text-xl font-bold italic tracking-[-0.01em]">Common questions</h2>
          <Accordion type="single" collapsible className="mt-1">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i + 1}`}>
                <AccordionTrigger className="text-[15px]">{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Panel>

        <AbandonOffer clickedRef={clickedRef} onCheckout={() => onCtaClick('abandon_offer')} />

        <div className="mt-10 text-center text-sm text-on-forest-muted">
          <a href="dashboard.html" className="text-on-forest-body no-underline hover:text-on-forest">Stay on free plan</a>
          <p className="mt-3 text-[13px] leading-normal">
            Questions?{' '}
            <a href="mailto:support@mealzy.org" className="text-on-forest-body underline hover:text-on-forest">support@mealzy.org</a>
            {' '}— usually replied to within 24 hours.
          </p>
        </div>
      </main>
    </div>
  );
}
