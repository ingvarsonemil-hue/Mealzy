import { useState } from 'react';

/* ───────────────────────────────────────────────
   Pricing FAQ — extracted from PricingPage.jsx to
   keep that file under the repo's 500-line cap.
   Self-contained: owns its own open/close state,
   copy, and icon since nothing else references them.
   ─────────────────────────────────────────────── */

const faqs = [
  {
    q: 'What counts as one plan?',
    a: 'One plan is a complete 7-day meal schedule with a matched grocery list and price estimate. Free users get one plan a day for their first 30 days. After that, you get one new plan every week for free — upgrade to Pro or Family any time for unlimited plans.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. You can cancel your subscription at any time from your account settings. You will keep access until the end of your current billing period.',
  },
  {
    q: 'Is there a free trial?',
    a: 'There\'s no separate free trial for Pro or Family. Paid subscriptions are billed when you subscribe. You can use Mealzy\'s free plan first — one plan a day for 30 days, then one new plan a week, for as long as you like.',
  },
  {
    q: 'How accurate are price estimates?',
    a: 'Estimates are based on aggregated regional grocery data and update weekly. They are typically within 10–15% of your actual receipt, but local prices and seasonal fluctuations can vary.',
  },
];

function IconChevronDown({ className }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function PricingFaq() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <section className="py-12 md:py-16 bg-white">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="text-2xl md:text-3xl font-bold text-forest text-center mb-10">Pricing questions</h2>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="border border-slate-200 rounded-xl">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left bg-white hover:bg-cream/50 transition-colors"
                aria-expanded={openFaq === i}
              >
                <span className="font-semibold text-forest text-sm md:text-base">{faq.q}</span>
                <IconChevronDown className={`w-5 h-5 text-slate-400 shrink-0 ml-4 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && (
                <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">{faq.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
