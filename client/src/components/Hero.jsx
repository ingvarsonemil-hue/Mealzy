import { useCallback } from 'react';
import { track } from '@/lib/api';
import { prefersReducedMotion } from '@/lib/utils';
import { planFor, dollars, estimateDollars } from '@/components/showcase-plan';
import heroScreenshot from '@/assets/hero-screenshot.webp';

/* ───────────────────────────────────────────────
   Hero
   Right-side is a real screenshot of the logged-in meal planner
   (client/src/assets/hero-screenshot.webp) — actual product, not a
   reconstruction. The left-side stat boxes still come from the sample-plan
   math in showcase-plan.js, shared with the budget slider below.
   ─────────────────────────────────────────────── */

function IconArrowRight({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function IconCheck({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* The example figures below come from the exact same sample-plan math the
 * budget slider uses (client/src/components/showcase-plan.js), not a
 * separate hand-picked number — so the hero can never disagree with the
 * demo underneath it. */
const HERO_PLAN = planFor(60);
const HERO_PLANNED = estimateDollars(HERO_PLAN.spend);
const HERO_SAVED = HERO_PLAN.budget - HERO_PLANNED;

export default function Hero() {
  const goToShowcase = useCallback(() => {
    track('homepage_hero_cta_click', {});
    document.getElementById('showcase')?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start'
    });
  }, []);

  return (
    <section className="relative bg-parchment overflow-hidden">
      {/* Subtle background texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }} />

      <div className="relative mx-auto max-w-7xl xl:max-w-[84rem] px-4 py-16 md:py-24 lg:py-32">
        <div className="grid lg:grid-cols-[1fr_1.15fr] xl:grid-cols-[1fr_1.4fr] gap-12 lg:gap-10 xl:gap-12 items-center">
          {/* Left: Copy */}
          <div className="text-center lg:text-left">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-foreground tracking-tight leading-[1.1]">
              Stop overspending at the grocery store
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted-fg max-w-xl mx-auto lg:mx-0">
              Mealzy plans your week around your grocery budget, diet, preferences, and available cooking time — so you buy only what you need and stop throwing food away.
            </p>

            {/* Value prop boxes */}
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.08em] text-gray-500 text-center lg:text-left">
              Example week
            </p>
            <div className="mt-2 grid grid-cols-3 gap-3 max-w-md mx-auto lg:mx-0">
              <div className="rounded-xl bg-white border border-gray-200 p-3 text-center shadow-sm">
                <div className="text-2xl font-bold text-forest">{dollars(HERO_PLAN.budget * 100)}</div>
                <div className="text-xs text-gray-500 mt-1">Weekly budget</div>
              </div>
              <div className="rounded-xl bg-white border border-gray-200 p-3 text-center shadow-sm">
                <div className="text-2xl font-bold text-emerald-600">${HERO_PLANNED}</div>
                <div className="text-xs text-gray-500 mt-1">With Mealzy</div>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center shadow-sm">
                <div className="text-2xl font-bold text-emerald-700">${HERO_SAVED}</div>
                <div className="text-xs text-emerald-700 mt-1 font-medium">Left over</div>
              </div>
            </div>

            {/* CTA — starts the inline mini pre-onboarding in Showcase.jsx.
             * No email field here: nothing on the homepage consumes an email
             * before the visitor reaches the real signup handoff. */}
            <div className="mt-8 flex justify-center lg:justify-start">
              <button
                type="button"
                onClick={goToShowcase}
                className="inline-flex items-center justify-center gap-2 text-sm text-white whitespace-nowrap hover:-translate-y-px"
                style={{
                  padding: '14px 28px',
                  borderRadius: '8px',
                  background: 'var(--color-green)',
                  fontWeight: 700,
                  border: 'none',
                  transition: 'transform 0.1s ease, box-shadow 0.1s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-button)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
              >
                Build my example week
                <IconArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Trust badges */}
            <div className="mt-4 flex flex-wrap items-center justify-center lg:justify-start gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <IconCheck className="w-3.5 h-3.5 text-emerald-600" />
                No credit card
              </span>
              <span className="inline-flex items-center gap-1">
                <IconCheck className="w-3.5 h-3.5 text-emerald-600" />
                Cancel anytime
              </span>
            </div>
          </div>

          {/* Right: real product screenshot — a live meal plan from the
              logged-in app, not a reconstruction. Cropped tighter on mobile
              (top nav trimmed) so the meal cards and budget bar stay
              readable; full frame from md up. */}
          <div className="relative">
            {/* Decorative glow behind screenshot */}
            <div className="absolute -inset-4 bg-emerald-200/30 dark:bg-green/10 rounded-[2rem] blur-2xl" aria-hidden="true" />

            <div
              className="relative overflow-hidden bg-white"
              style={{
                borderRadius: '16px',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--color-border)'
              }}
            >
              <div className="relative w-full aspect-[1548/732] md:aspect-[1548/822] overflow-hidden">
                <img
                  src={heroScreenshot}
                  alt="Mealzy daily meal plan showing meal costs, calories, protein and daily budget tracking"
                  width={1548}
                  height={822}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover object-bottom md:object-top"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
