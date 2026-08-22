import { useState } from 'react';

/* ───────────────────────────────────────────────
   Why Mealzy — Competitor Comparison Section
   Drop into homepage (e.g., below FeaturesGrid)
   Zero dependencies — inline SVGs only.
   ─────────────────────────────────────────────── */

const comparisons = [
  {
    category: 'Primary focus',
    mealzy: 'Budget-first: plans built around your grocery budget',
    others: 'Recipe-first: browse a fixed library of healthy dinners',
  },
  {
    category: 'Grocery cost visibility',
    mealzy: 'Upfront price estimates for every ingredient and the full week',
    others: 'No upfront cost estimates; prices only appear at checkout in select stores',
  },
  {
    category: 'Free plan',
    mealzy: '1 meal plan a day for your first 30 days, no credit card',
    others: 'Limited recipe access; key features like nutrition info require Pro',
  },
  {
    category: 'Platform',
    mealzy: 'Full-featured web app that works on phone, tablet, and desktop',
    others: 'Mobile-first app with a very basic web experience',
  },
  {
    category: 'Shopping list',
    mealzy: 'One list for the whole week, priced and ready to shop',
    others: 'List resets every time you swap a meal',
  },
];

function IconCheck({ className }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconMinus({ className }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconArrowRight({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export default function WhyMealzy() {
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? comparisons : comparisons.slice(0, 4);

  return (
    <section className="py-16 md:py-24 bg-cream">
      <div className="mx-auto max-w-5xl px-4">
        {/* Header */}
        <div className="text-center mb-12 md:mb-16">
          <span className="inline-block rounded-full bg-green/10 border border-green/30 px-3 py-1 text-xs font-semibold text-green-deep dark:text-green-light uppercase tracking-wider mb-4">
            Why Mealzy
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">
            Most meal planners start with recipes. Mealzy starts with your budget.
          </h2>
          <p className="mt-4 text-lg text-muted-fg max-w-2xl mx-auto">
            Recipes get picked once the week already fits your budget — as one plan built around
            your calories, diet and preferences, not a pile of recipes you have to make fit yourself.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="overflow-hidden rounded-2xl border border-border-warm shadow-sm">
          {/* Desktop header */}
          <div className="hidden md:grid grid-cols-[1.2fr_1fr_1fr] bg-cream border-b border-border-warm">
            <div className="px-6 py-4 text-sm font-semibold text-muted-fg uppercase tracking-wider">
              Feature
            </div>
            <div className="px-6 py-4 text-sm font-bold text-foreground text-center bg-green/10">
              Mealzy
            </div>
            <div className="px-6 py-4 text-sm font-semibold text-muted-fg text-center">
              Most recipe apps
            </div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border-warm">
            {visibleRows.map((row, i) => (
              <div
                key={i}
                className="grid md:grid-cols-[1.2fr_1fr_1fr] items-start bg-parchment hover:bg-cream/30 transition-colors"
              >
                {/* Category label */}
                <div className="px-5 py-4 md:px-6 md:py-5">
                  <span className="text-sm font-semibold text-foreground">{row.category}</span>
                </div>

                {/* Mealzy */}
                <div className="px-5 pb-4 md:px-6 md:py-5 bg-green/5 md:bg-green/10">
                  <div className="flex items-start gap-3">
                    <IconCheck className="w-5 h-5 text-green shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground leading-relaxed">{row.mealzy}</span>
                  </div>
                </div>

                {/* Others */}
                <div className="px-5 pb-4 md:px-6 md:py-5">
                  <div className="flex items-start gap-3">
                    <IconMinus className="w-5 h-5 text-muted-fg shrink-0 mt-0.5" />
                    <span className="text-sm text-muted-fg leading-relaxed">{row.others}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile "Show more" toggle */}
        {comparisons.length > 4 && (
          <div className="md:hidden mt-4 text-center">
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-sm font-semibold text-green-deep hover:text-foreground underline underline-offset-2 dark:text-green-light"
            >
              {showAll
                ? 'Show less'
                : `Show ${comparisons.length - 4} more comparison${comparisons.length - 4 === 1 ? '' : 's'}`}
            </button>
          </div>
        )}

        {/* Trust note */}
        <p className="mt-4 text-xs text-muted-fg text-center max-w-xl mx-auto">
          Comparison based on publicly available features as of August 2026.
          Competitor offerings may change.
        </p>

        {/* CTA */}
        <div className="mt-12 text-center">
          <a
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-xl bg-forest text-white px-7 py-3.5 text-sm font-bold hover:bg-green-900 transition-colors"
          >
            See Mealzy pricing
            <IconArrowRight className="w-4 h-4" />
          </a>
          <p className="mt-3 text-xs text-muted-fg">
            Free — one plan a day for your first 30 days. No credit card required.
          </p>
        </div>
      </div>
    </section>
  );
}
