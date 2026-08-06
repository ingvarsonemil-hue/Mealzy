import * as React from 'react';
import BillingToggle from '@/components/BillingToggle';
import Footer from '@/components/Footer';
import AbandonOffer from './AbandonOffer';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/Header';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Sun, Moon, Check, HelpCircle, Lock, Bowl, Cutlery } from '@/components/icons';
import { stripeUrls, PLAN_PRICING, planDisplay } from '@/lib/stripe';
import { track } from '@/lib/api';
import { cn } from '@/lib/utils';

/* Three scannable groups rather than one flat list — each names the axis the
 * upgrade moves on, so the page reads at a glance. */
const BENEFIT_GROUPS = [
  {
    title: 'More plans',
    Icon: Bowl,
    items: [
      { label: 'Unlimited AI Meal Plans', desc: 'Generate as many times as you want. Every week, every diet change, every goal shift.' },
      { label: 'Priority queue — plans generate first', desc: 'Free plans run on the standard queue at about 30 seconds. Pro requests are processed ahead of them.' }
    ]
  },
  {
    title: 'More insight',
    Icon: Cutlery,
    items: [
      { label: 'PDF export — download & print', desc: 'Export your full meal plan and grocery list as a clean PDF. Print it, share it, save it.' },
      { label: 'Advanced Calorie & Macro Targets per meal', desc: 'See protein, carbs, and fat broken down for every individual meal — not just daily totals.' }
    ]
  },
  {
    title: 'More support',
    Icon: HelpCircle,
    items: [
      { label: 'Unlimited Mia — AI Nutrition Coach', desc: 'Ask anything, any time. Recipe help, macro questions, what to do with leftovers.' },
      { label: '1-click cancellation', desc: 'One click in your account settings. No emails, no questions. Pro access continues until period end.' }
    ]
  }
];

const OBJECTIONS = [
  { q: "What if I don't like it?", a: "Cancel in one click from your billing portal. You keep Pro until your period ends. We've made it as easy to cancel as it is to sign up." },
  { q: 'Is my card safe?', a: 'All payments go through Stripe — the same processor used by Amazon and Google. We never see your card number.' },
  { q: 'Will the price go up?', a: 'Not for you — current subscribers lock in today’s price. We may raise prices for new users as we grow.' }
];

const FAQS = [
  { q: 'What happens to my data if I cancel?', a: 'Your account stays. Your meal history stays. You just go back to 3 free plans per month. Nothing is deleted. You can re-upgrade any time.' },
  { q: 'Is there a contract or minimum commitment?', a: 'No. Cancel any time from your account settings — one click, no questions asked. You keep Pro access until the end of your current billing period.' },
  { q: 'Do you store my payment details?', a: 'No. Payments go through Stripe — the same processor used by Amazon and Google. We never see your card number, expiry date, or CVV.' }
];

/* Cream panel sitting on the forest-drenched page. */
function Panel({ children, className }) {
  return <div className={cn('rounded-lg bg-cream p-6 text-foreground shadow-xl', className)}>{children}</div>;
}

export default function UpgradePage() {
  const [theme, toggleTheme] = useTheme();
  /* Annual is the page default (best value). Assume it is sellable for the
   * first paint so the server-rendered markup and the first client render
   * agree, then correct from the Stripe config: without STRIPE_ANNUAL_URL the
   * annual segment is disabled and the page falls back to monthly, instead of
   * showing a yearly price and checking out at the monthly link. */
  const [annualAvailable, setAnnualAvailable] = React.useState(true);
  const [mode, setMode] = React.useState('yearly');
  React.useEffect(() => {
    const ready = stripeUrls.annualReady;
    setAnnualAvailable(ready);
    if (!ready) setMode('monthly');
  }, []);
  const clickedRef = React.useRef(false);
  const yearly = mode === 'yearly';
  const pro = planDisplay('pro', mode);

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
            <Button href="/" variant="quiet" size="sm" className="whitespace-nowrap text-on-forest-body hover:text-on-forest">
              Stay on Free Plan
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
          <div className="mt-7 flex justify-center">
            <BillingToggle
              mode={mode}
              onChange={setMode}
              annualDisabled={!annualAvailable}
              annualLabel={
                <>
                  Annual
                  <span className="rounded-full bg-green px-2 py-0.5 text-xs font-bold text-white">
                    Save {PLAN_PRICING.pro.savePct}%
                  </span>
                </>
              }
            />
          </div>
        </header>

        {/* Decision card — badge is part of the card's own top edge, not a
            pill floating in the body above the price. */}
        <Panel className="mt-8 overflow-hidden border-2 border-green p-0">
          <div className="bg-green px-6 py-2 text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-white">Most popular</span>
          </div>
          <div className="p-8">
          <p className="text-center">
            <span className="font-display text-5xl font-bold italic leading-none tracking-[-0.02em]">{pro.price}</span>
            <span className="text-base text-muted-fg">{pro.period}</span>
          </p>
          <p className="mt-1.5 min-h-[1.3em] text-center text-sm text-muted-fg" aria-live="polite">
            {pro.billed}
          </p>

          <div className="mt-6 flex flex-col gap-3.5">
            {BENEFIT_GROUPS.map(({ title, Icon, items }) => (
              <section key={title} aria-label={title} className="rounded-md border border-border-warm p-4">
                <div className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-parchment text-green">
                    <Icon width="18" height="18" />
                  </span>
                  <h2 className="text-xs font-bold uppercase tracking-[0.11em] text-muted-fg">{title}</h2>
                </div>
                <ul role="list" className="mt-3 flex flex-col gap-2.5">
                  {items.map((f) => (
                    <li key={f.label} className="flex items-start gap-2.5">
                      <Check className="mt-1 shrink-0 text-green" />
                      <div>
                        <p className="text-[15px] leading-snug">{f.label}</p>
                        <p className="mt-0.5 text-sm leading-normal text-muted-fg">{f.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-2.5">
            <Button
              href={yearly ? stripeUrls.annual : stripeUrls.monthly}
              target="_blank"
              rel="noopener"
              size="lg"
              full
              data-testid="upgrade-cta"
              onClick={() => onCtaClick()}
            >
              Start Pro 7-Day Free Trial
            </Button>
            <Button href="/" variant="quiet" full data-testid="stay-free">
              Not ready? Keep your free plan
            </Button>
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[13px] leading-normal text-muted-fg">
            <Lock className="shrink-0" />
            $0 due today. Cancel before day 7 and you owe nothing.
          </p>
          <p className="mt-4 text-center text-sm text-muted-fg">
            Cooking for a household?{' '}
            <a href="/pricing.html" className="font-semibold text-green-deep no-underline hover:underline dark:text-green-light">
              Check Family plan
            </a>
          </p>
          </div>
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
          <p className="text-[13px] leading-normal">
            Questions?{' '}
            <a href="mailto:support@mealzy.org" className="text-on-forest-body underline hover:text-on-forest">support@mealzy.org</a>
            {' '}— usually replied to within 24 hours.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
