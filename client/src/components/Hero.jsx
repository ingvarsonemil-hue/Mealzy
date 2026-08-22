import { useCallback } from 'react';
import { track } from '@/lib/api';
import { prefersReducedMotion } from '@/lib/utils';
import { planFor, dollars, estimateDollars, singleEstimate } from '@/components/showcase-plan';

/* ───────────────────────────────────────────────
   Hero
   Right-side preview is real sample-plan data (see showcase-plan.js),
   not a screenshot — there is no hero-screenshot asset to show.
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
const PREVIEW_DAY = HERO_PLAN.days[0];
const HERO_PLANNED = estimateDollars(HERO_PLAN.spend);
const HERO_SAVED = HERO_PLAN.budget - HERO_PLANNED;

/* Same day the mini preview shows, totalled from the same per-meal estimates
 * it renders — never a separate figure that could drift from the rows above
 * it. */
const PREVIEW_DAY_TOTAL = PREVIEW_DAY.meals.reduce(
  (sum, meal) => sum + parseFloat(singleEstimate(meal.cost).replace('$', '')),
  0
);

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

      <div className="relative mx-auto max-w-7xl px-4 py-16 md:py-24 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
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

          {/* Right: sample-plan preview — hidden below md (768px): a scaled-down
              preview this dense is illegible on phones. */}
          <div className="relative hidden md:block">
            {/* Decorative glow behind screenshot */}
            <div className="absolute -inset-4 bg-emerald-200/30 rounded-[2rem] blur-2xl" />

            {/* Screenshot container with browser chrome */}
            <div
              className="relative overflow-hidden bg-white"
              style={{
                borderRadius: '16px',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--color-border)'
              }}
            >
              {/* Browser top bar */}
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="max-w-xs mx-auto rounded-md bg-white border border-gray-200 px-3 py-1 text-xs text-gray-500 text-center truncate">
                    app.mealzy.org/plan
                  </div>
                </div>
              </div>

              {/* Monday's plan from the $60 sample week — same data the
                  budget slider below builds from, not a screenshot and not
                  a food photo: a planner, because that's what Mealzy is. */}
              <div className="p-4 sm:p-5">
                <p className="text-sm font-bold uppercase tracking-[0.08em] text-gray-500">{PREVIEW_DAY.day}</p>
                <ul className="mt-2 divide-y divide-gray-100">
                  {PREVIEW_DAY.meals.map((meal) => (
                    <li key={meal.course} className="flex items-baseline justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-gray-500">{meal.course}</p>
                        <p className="mt-0.5 truncate text-base font-semibold text-gray-900">{meal.name}</p>
                      </div>
                      <span className="shrink-0 text-base font-bold text-emerald-700">{singleEstimate(meal.cost)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 border-t border-gray-100 pt-3 text-sm font-bold text-forest">
                  {PREVIEW_DAY.day} planned · ${PREVIEW_DAY_TOTAL.toFixed(0)}
                </p>
              </div>
            </div>

            {/* Floating badge */}
            <div
              className="absolute -bottom-4 -left-4 md:-left-8 flex items-center gap-3"
              style={{
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.5)',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                padding: '16px'
              }}
            >
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <IconCheck className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <div className="text-sm font-bold text-forest">${HERO_SAVED} under budget</div>
                <div className="text-xs text-gray-500">example week</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
