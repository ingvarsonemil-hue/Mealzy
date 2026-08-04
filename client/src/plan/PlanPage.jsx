import * as React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { getSharedPlan } from '@/lib/api';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TYPE_ORDER = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };

function ShareRow({ shareUrl }) {
  const [copied, setCopied] = React.useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', shareUrl);
    }
  };

  const text = encodeURIComponent('Check out my AI meal plan — built with Mealzy, free: ');
  const twitterHref = `https://x.com/intent/tweet?text=${text}&url=${encodeURIComponent(shareUrl)}`;
  const whatsappHref = `https://wa.me/?text=${text}${encodeURIComponent(shareUrl)}`;

  const shareBtnClass =
    'inline-flex h-10 cursor-pointer items-center rounded-md border border-border-warm bg-cream px-4 text-sm font-semibold text-foreground no-underline transition-colors duration-200 hover:border-green hover:text-green';

  return (
    <div className="mt-8 flex flex-wrap justify-center gap-3">
      <button onClick={copyLink} aria-label="Copy plan link to clipboard" className={shareBtnClass}>
        {copied ? 'Copied!' : 'Copy link'}
      </button>
      <a href={twitterHref} target="_blank" rel="noopener noreferrer" aria-label="Share on X (opens in new tab)" className={shareBtnClass}>
        Share on X
      </a>
      <a href={whatsappHref} target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp (opens in new tab)" className={shareBtnClass}>
        Share on WhatsApp
      </a>
    </div>
  );
}

export default function PlanPage() {
  const [state, setState] = React.useState({ status: 'loading', plan: null, error: null });
  const shareId = React.useMemo(() => new URLSearchParams(window.location.search).get('id'), []);

  React.useEffect(() => {
    if (!shareId) {
      setState({ status: 'error', plan: null, error: 'No plan ID provided. Check your link and try again.' });
      return;
    }
    getSharedPlan(shareId)
      .then((plan) => setState({ status: 'success', plan, error: null }))
      .catch(() => setState({ status: 'error', plan: null, error: 'This link may have expired or been removed.' }));
  }, [shareId]);

  React.useEffect(() => {
    if (!shareId) return;
    const canonicalUrl = `https://mealzy.org/plan.html?id=${shareId}`;
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    if (canonicalEl) canonicalEl.href = canonicalUrl;
  }, [shareId]);

  const meals = state.plan?.plan?.meals || state.plan?.meals || [];
  const date = state.plan?.date || state.plan?.plan?.date || '';
  const title = state.plan?.title || (date ? `Meal plan — ${date}` : 'Shared Meal Plan');

  React.useEffect(() => {
    if (state.status !== 'success') return;
    document.title = (state.plan.ownerName ? state.plan.ownerName + "'s Meal Plan" : title) + ' — Mealzy';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const stats = React.useMemo(() => {
    let totalCal = 0, totalCost = 0, totalProtein = 0;
    meals.forEach((m) => {
      totalCal += m.calories || 0;
      totalCost += m.estimatedCost || 0;
      totalProtein += m.protein || 0;
    });
    return [
      { num: Math.round(totalCal).toLocaleString(), label: 'kcal' },
      { num: Math.round(totalProtein) + 'g', label: 'protein' },
      { num: '$' + totalCost.toFixed(2), label: 'est. cost' },
      { num: meals.length, label: 'meals' }
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.plan]);

  const daysToShow = React.useMemo(() => {
    const byDay = {};
    meals.forEach((m) => {
      const day = m.day || 'Today';
      (byDay[day] = byDay[day] || []).push(m);
    });
    const ordered = DAY_ORDER.filter((d) => byDay[d]).concat(Object.keys(byDay).filter((d) => !DAY_ORDER.includes(d)));
    return ordered.map((day) => {
      const dayMeals = [...byDay[day]].sort((a, b) => (TYPE_ORDER[a.type] ?? 5) - (TYPE_ORDER[b.type] ?? 5));
      const dayCost = dayMeals.reduce((s, m) => s + (m.estimatedCost || 0), 0);
      return { day, dayMeals, dayCost };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.plan]);

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main">
        <div className="mx-auto max-w-prose px-4 pb-20 pt-28 sm:px-5 sm:pt-32">

          {state.status === 'loading' && (
            <div aria-live="polite" role="status" aria-label="Loading your meal plan" className="py-16 text-center text-muted-fg">
              <span
                aria-hidden="true"
                className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-border-warm border-t-green motion-reduce:animate-none"
              />
              <p className="mt-4">Loading meal plan...</p>
            </div>
          )}

          {state.status === 'error' && (
            <div role="alert" className="py-16 text-center">
              <h2 className="font-display text-2xl font-bold italic">Plan not found</h2>
              <p className="mx-auto mt-2 mb-6 text-muted-fg">{state.error}</p>
              <a href="/" className="text-green">Back to Mealzy</a>
            </div>
          )}

          {state.status === 'success' && (
            <div>
              <div className="mb-8 text-center">
                <div className="inline-flex rounded-full bg-green/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-green-deep dark:text-green-light">
                  Shared Meal Plan
                </div>
                <h1 className="mt-3 font-display text-[clamp(1.7rem,4vw,2.3rem)] font-black italic tracking-[-0.02em]">
                  {title}
                </h1>
                <div className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-4">
                  {stats.map((s) => (
                    <div key={s.label}>
                      <div className="font-display text-2xl font-bold italic text-green-deep dark:text-green-light">{s.num}</div>
                      <div className="text-xs uppercase tracking-[0.06em] text-muted-fg">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {daysToShow.map(({ day, dayMeals, dayCost }) => (
                  <div key={day} className="overflow-hidden rounded-lg border border-border-warm bg-cream">
                    <header className="flex items-center justify-between border-b border-border-warm px-5 py-3">
                      <span className="font-display font-bold italic">{day}</span>
                      <span className="text-sm text-muted-fg">~${dayCost.toFixed(2)}</span>
                    </header>
                    <div className="divide-y divide-hairline">
                      {dayMeals.map((m, i) => (
                        <div key={i} className="flex items-start gap-4 px-5 py-4">
                          <span className="mt-0.5 w-16 shrink-0 text-xs font-bold uppercase tracking-[0.06em] text-muted-fg">{m.type}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[15px] font-semibold">{m.name}</div>
                            {m.description && <div className="mt-0.5 text-sm text-muted-fg">{m.description}</div>}
                            <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted-fg">
                              <span>{m.calories || 0} kcal</span>
                              {m.protein ? <span>{m.protein}g protein</span> : null}
                              {m.cookTime ? <span>{m.cookTime} min</span> : null}
                            </div>
                          </div>
                          {m.estimatedCost ? (
                            <span className="shrink-0 text-sm font-semibold text-green-deep dark:text-green-light">${m.estimatedCost.toFixed(2)}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <ShareRow shareUrl={window.location.href} />

              <div className="mt-10 rounded-lg bg-forest px-8 py-9 text-center text-on-forest-strong">
                <h2 className="font-display text-2xl font-black italic text-on-forest">Generate your own free plan.</h2>
                <p className="mx-auto mb-5 mt-2 max-w-[44ch] text-[0.92rem] text-on-forest-body">
                  Tell Mealzy your calorie goal, budget, and dietary preferences. It builds your full week of meals and writes the grocery list — in under 1 minute. Free, no credit card.
                </p>
                <Button href="login.html?signup=1" size="lg">Plan My Week Free</Button>
                <p className="mt-3.5 text-[0.78rem] text-on-forest-muted">
                  Made with <a href="https://mealzy.org" className="font-bold text-on-forest">Mealzy</a> — free AI meal planner
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
