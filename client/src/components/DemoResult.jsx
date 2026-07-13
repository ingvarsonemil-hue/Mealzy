import * as React from 'react';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/api';
import { prefersReducedMotion } from '@/lib/utils';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* Renders the /api/demo-meal result. Groups meals by day in fixed order,
 * exactly like the original renderDemoPlan(). */
export default function DemoResult({ demo }) {
  const sectionRef = React.useRef(null);

  React.useEffect(() => {
    if (demo.status === 'success' && sectionRef.current) {
      requestAnimationFrame(() => {
        sectionRef.current.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      });
    }
  }, [demo.status, demo.plan]);

  const byDay = React.useMemo(() => {
    const map = {};
    if (demo.plan?.meals) {
      demo.plan.meals.forEach((m) => { (map[m.day] = map[m.day] || []).push(m); });
    }
    return map;
  }, [demo.plan]);

  return (
    <section id="demo" ref={sectionRef} aria-label="Sample meal plan result" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-container px-4 sm:px-5">
        {demo.status === 'error' && (
          <div
            role="alert"
            className="mx-auto mb-10 max-w-xl rounded-md border border-error/30 bg-error/5 px-5 py-4 text-center text-[15px] text-brick"
          >
            {demo.error}
          </div>
        )}

        {demo.status === 'success' && demo.plan ? (
          <div aria-live="polite" className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <div className="rounded-lg border border-border-warm bg-cream shadow-card">
              <div className="border-b border-border-warm px-6 py-5">
                <p className="font-display text-xl font-bold italic">Your sample week</p>
                <p className="mt-1 text-sm text-muted-fg">
                  {demo.cals} kcal/day · ${demo.budget}/week budget
                </p>
              </div>
              <div className="px-6 py-2">
                {DAY_ORDER.map((day) => {
                  const meals = byDay[day];
                  if (!meals?.length) return null;
                  return (
                    <div key={day} className="border-b border-hairline py-4 last:border-b-0">
                      <p className="mb-2 font-display text-base font-bold italic text-green">{day}</p>
                      {meals.map((m, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-4 py-1.5">
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-semibold">{m.name}</p>
                            <p className="text-xs uppercase tracking-[0.08em] text-muted-fg">{m.type}</p>
                          </div>
                          <p className="shrink-0 text-right text-sm text-muted-fg">
                            {m.calories} kcal · {m.protein}g protein
                            <br />
                            <span className="font-semibold text-green-deep dark:text-green-light">~${(m.estimatedCost || 0).toFixed(2)}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:sticky lg:top-24">
              <h2 className="font-display text-[clamp(1.75rem,2.4vw+0.5rem,2.5rem)] font-bold italic leading-[1.1] tracking-[-0.02em]">
                This is the free sample.
              </h2>
              <p className="mt-4 text-[17px] leading-[1.7] text-muted-fg">
                The full Mealzy plan adds the sorted grocery list with estimated costs, swaps,
                and your saved preferences — every week, in your language.
              </p>
              <Button
                href="login.html?signup=1" size="lg" className="mt-6"
                onClick={() => track('demo_to_signup_click', {})}
              >
                Start Planning Free
              </Button>
              <p className="mt-3 text-sm text-muted-fg">No credit card. No catch. Resets every 30 days.</p>
            </div>
          </div>
        ) : demo.status === 'error' && demo.rateLimited ? null : (
          <div className="mx-auto max-w-prose text-center">
            <h2 className="font-display text-[clamp(1.75rem,2.4vw+0.5rem,2.5rem)] font-bold italic leading-[1.1] tracking-[-0.02em]">
              Generate a real sample plan — no account needed.
            </h2>
            <p className="mt-4 text-[17px] leading-[1.7] text-muted-fg">
              Enter your goals above and see what Mealzy actually builds. No email. No sign-up. Just the plan.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
