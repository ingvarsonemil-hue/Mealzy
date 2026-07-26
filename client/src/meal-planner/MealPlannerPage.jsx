import * as React from 'react';
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { fetchMe } from '@/lib/auth';
import { generateMeal, sharePlan, awardXp } from '@/lib/mealPlan';
import { getCurrencySymbol } from '@/lib/currency';
import { Printer, Refresh, Bolt, Star, NavRecipes } from '@/components/icons';
import DayMealsSection from './DayMealsSection';
import WeekView from './WeekView';
import SharePanel from './SharePanel';
import LimitModal from './LimitModal';
import ToastContainer, { useToasts } from './Toast';
import { readPlans, writePlans, toISODate, formatDateLabel, shouldShowPlanLimitBanner } from './storage';

export default function MealPlannerPage() {
  const [auth, setAuth] = React.useState({ status: 'loading', user: null, profile: null });
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [mealPlans, setMealPlans] = React.useState(() => readPlans());
  const [view, setView] = React.useState('day');
  const [generatingDate, setGeneratingDate] = React.useState(null);
  const [mealsError, setMealsError] = React.useState(null);
  const [swappingIndex, setSwappingIndex] = React.useState(null);
  const [flashIndex, setFlashIndex] = React.useState(null);
  const [shareState, setShareState] = React.useState(null);
  const [limitModalOpen, setLimitModalOpen] = React.useState(false);
  const [bannerVisible, setBannerVisible] = React.useState(false);
  const [pendingRecipe, setPendingRecipe] = React.useState(null);
  const [disclaimerDismissed, setDisclaimerDismissed] = React.useState(
    () => localStorage.getItem('mealzy_disclaimer_dismissed') === '1'
  );
  const { toasts, showToast } = useToasts();

  const currentDateStr = React.useMemo(() => toISODate(currentDate), [currentDate]);
  const currentMeals = mealPlans[currentDateStr]?.meals || [];
  const dateLabel = React.useMemo(() => formatDateLabel(currentDate), [currentDate]);
  const currencySymbol = getCurrencySymbol(auth.profile?.currency || 'USD');

  const persistPlans = React.useCallback((next) => {
    setMealPlans(next);
    writePlans(next);
  }, []);

  /* ── Auth + profile bootstrap (mirrors legacy init()) ───────────────── */
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      let user = null;
      try {
        user = await fetchMe();
      } catch (err) {
        if (err.status !== undefined || !localStorage.getItem('mealzy_user')) {
          window.location.href = '/login.html';
          return;
        }
      }
      if (cancelled) return;

      if (user) {
        try {
          localStorage.setItem('mealzy_user', JSON.stringify({ name: user.name, email: user.email }));
          if (user.pro) localStorage.setItem('mealzy_pro', 'true');
          else localStorage.removeItem('mealzy_pro');
          if (user.profile) {
            const lp = JSON.parse(localStorage.getItem('mealzy_profile') || '{}');
            localStorage.setItem('mealzy_profile', JSON.stringify({ ...user.profile, ...lp }));
          }
        } catch { /* private mode / storage full */ }
      }

      const profileData = localStorage.getItem('mealzy_profile');
      if (!profileData) { window.location.href = '/onboarding.html'; return; }
      let profile;
      try { profile = JSON.parse(profileData); } catch { window.location.href = '/onboarding.html'; return; }

      setAuth({ status: 'ready', user, profile });
      setBannerVisible(shouldShowPlanLimitBanner());

      const raw = localStorage.getItem('mealzy_pending_recipe');
      if (raw) {
        localStorage.removeItem('mealzy_pending_recipe');
        try { setPendingRecipe(JSON.parse(raw)); } catch { /* ignore malformed */ }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Day navigation ──────────────────────────────────────────────── */
  const changeDate = (delta) => {
    setCurrentDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + delta);
      return next;
    });
    setMealsError(null);
  };

  const switchToDay = (dateStr) => {
    setCurrentDate(new Date(dateStr + 'T12:00:00'));
    setView('day');
    setMealsError(null);
  };

  /* ── Generate / regenerate ───────────────────────────────────────── */
  const generateMealPlan = async (targetDateStr, isRegenerate) => {
    if (!auth.profile) return;
    setGeneratingDate(targetDateStr);
    setMealsError(null);
    const existing = mealPlans[targetDateStr]?.meals || [];
    const avoidMeals = isRegenerate ? existing.map((m) => m.name).filter(Boolean) : [];

    try {
      const { ok, status, data } = await generateMeal({ profile: auth.profile, date: targetDateStr, avoid_meals: avoidMeals });

      if (status === 402 && data.error === 'free_limit_reached') {
        setLimitModalOpen(true);
        return;
      }
      if (!ok || !data.success) {
        setMealsError(data.error || 'Generation failed. Please try again.');
        return;
      }

      const meals = data.mealPlan?.meals || [];
      persistPlans({ ...mealPlans, [targetDateStr]: { meals, generatedAt: new Date().toISOString() } });
      setBannerVisible(shouldShowPlanLimitBanner());
      setShareState({ status: 'loading' });
      generateShareLink(meals, targetDateStr);
      awardXp('generate_plan').catch(() => {});
    } catch {
      setMealsError('Connection lost. Check your internet and try again.');
    } finally {
      setGeneratingDate(null);
    }
  };

  const switchToDayAndGenerate = (dateStr) => {
    setCurrentDate(new Date(dateStr + 'T12:00:00'));
    setView('day');
    setMealsError(null);
    generateMealPlan(dateStr, false);
  };

  /* ── Share panel ──────────────────────────────────────────────────── */
  const generateShareLink = async (meals, dateStr) => {
    if (!meals || meals.length === 0) { setShareState(null); return; }
    try {
      const { ok, data } = await sharePlan({ plan: { meals, date: dateStr } });
      if (!ok) throw new Error('share failed');
      // Server only ever returns `shareUrl` (never `url`) — build the copy
      // link from shareId as before, and use shareUrl for the social hrefs,
      // which previously read the non-existent `data.url` and so never populated.
      const { shareUrl, shareId } = data;
      const linkValue = window.location.origin + '/plan.html?id=' + (shareId || '');
      const text = encodeURIComponent('Check out my AI meal plan — built with Mealzy, free: ');
      setShareState({
        status: 'ready',
        linkValue,
        twitterHref: shareUrl ? `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(shareUrl)}` : null,
        whatsappHref: shareUrl ? `https://wa.me/?text=${text}${encodeURIComponent(shareUrl)}` : null
      });
    } catch {
      setShareState(null);
    }
  };

  const copySharePlanLink = async (inputEl) => {
    if (!shareState?.linkValue) return;
    try {
      await navigator.clipboard.writeText(shareState.linkValue);
      showToast('Plan link copied!', 'success');
    } catch {
      if (inputEl) {
        inputEl.select();
        try { document.execCommand('copy'); } catch { /* unsupported */ }
      }
      showToast('Link copied!', 'success');
    }
  };

  /* ── Meal actions ─────────────────────────────────────────────────── */
  const toggleMealDone = (index, checked) => {
    const meals = currentMeals.map((m, i) => (i === index ? { ...m, completed: checked } : m));
    persistPlans({ ...mealPlans, [currentDateStr]: { ...mealPlans[currentDateStr], meals } });
  };

  const swapMeal = async (index, type) => {
    setSwappingIndex(index);
    try {
      const { ok, data } = await generateMeal({ profile: auth.profile, date: currentDateStr, swap_meal_type: type });
      if (!ok || !data.success) { showToast('Could not swap meal. Try again.', 'error'); return; }
      const meals = currentMeals.map((m, i) => (i === index ? data.meal : m));
      persistPlans({ ...mealPlans, [currentDateStr]: { ...mealPlans[currentDateStr], meals } });
      setFlashIndex(index);
      setTimeout(() => setFlashIndex(null), 600);
    } catch {
      showToast('Could not swap meal. Check your connection.', 'error');
    } finally {
      setSwappingIndex(null);
    }
  };

  /* ── Pending recipe banner (from Recipes → "Use in plan") ────────── */
  const addPendingRecipeToDay = () => {
    if (!pendingRecipe) return;
    const meal = {
      type: 'dinner',
      name: pendingRecipe.name || 'Imported Recipe',
      description: pendingRecipe.servings ? `${pendingRecipe.servings} servings` : '',
      calories: pendingRecipe.estimatedCalories || 0,
      protein: pendingRecipe.estimatedProtein || 0,
      carbs: 0,
      fat: 0,
      cookTime: 30,
      estimatedCost: 0,
      ingredients: pendingRecipe.ingredients || [],
      instructions: pendingRecipe.instructions || [],
      completed: false
    };
    const meals = [...currentMeals, meal];
    persistPlans({ ...mealPlans, [currentDateStr]: { ...mealPlans[currentDateStr], meals } });
    setPendingRecipe(null);
    showToast(`"${meal.name}" added to today's plan`, 'success');
  };

  const dismissDisclaimer = () => {
    localStorage.setItem('mealzy_disclaimer_dismissed', '1');
    setDisclaimerDismissed(true);
  };

  /* ── Totals ───────────────────────────────────────────────────────── */
  const totals = React.useMemo(() => {
    const meals = currentMeals || [];
    return {
      calories: meals.reduce((s, m) => s + (m.calories || 0), 0),
      protein: meals.reduce((s, m) => s + (m.protein || 0), 0),
      carbs: meals.reduce((s, m) => s + (m.carbs || 0), 0),
      cost: meals.reduce((s, m) => s + (m.estimatedCost || 0), 0)
    };
  }, [currentMeals]);

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-clr-canvas">
        <span
          aria-hidden="true"
          className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-clr-border border-t-green motion-reduce:animate-none"
        />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  return (
    <AppShell active="planner" user={auth.user}>
      <a href="#meal-planner-heading" className="skip-link">Skip to main content</a>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="meal-planner-heading" tabIndex={-1} className="font-display text-[1.8rem] font-bold italic tracking-[-0.03em] text-foreground">
            Meal Planner
          </h1>
          <p className="mt-1 text-[0.9rem] text-muted-fg">Plan and manage your meals day by day</p>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex w-fit overflow-hidden rounded-sm border-[1.5px] border-clr-border">
          <button
            type="button"
            onClick={() => setView('day')}
            className={'px-5 py-[0.45rem] text-[0.88rem] font-semibold ' + (view === 'day' ? 'bg-green text-white' : 'bg-transparent text-muted-fg')}
          >
            Day View
          </button>
          <button
            type="button"
            onClick={() => setView('week')}
            className={'px-5 py-[0.45rem] text-[0.88rem] font-semibold ' + (view === 'week' ? 'bg-green text-white' : 'bg-transparent text-muted-fg')}
          >
            Week View
          </button>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          title="Print meal plan"
          className="flex min-h-[40px] cursor-pointer items-center gap-[0.4rem] rounded-md border border-clr-border bg-clr-surface px-4 py-2 text-sm font-semibold text-foreground hover:border-green hover:text-green"
        >
          <Printer /> Print
        </button>
      </div>

      {view === 'day' && (
        <div className="mb-6 flex flex-wrap items-center gap-[0.35rem]">
          <button type="button" onClick={() => changeDate(-1)} aria-label="Previous day" className="min-h-[44px] cursor-pointer rounded-md border border-clr-border bg-clr-surface px-4 text-sm font-semibold text-foreground hover:border-green hover:text-green">
            ← Prev
          </button>
          <div className="min-w-[140px] flex-shrink-0 text-center font-display text-[1.15rem] font-bold italic tracking-[-0.02em] text-foreground">
            {dateLabel}
          </div>
          <button type="button" onClick={() => changeDate(1)} aria-label="Next day" className="min-h-[44px] cursor-pointer rounded-md border border-clr-border bg-clr-surface px-4 text-sm font-semibold text-foreground hover:border-green hover:text-green">
            Next →
          </button>
          <Button onClick={() => generateMealPlan(currentDateStr, false)} disabled={generatingDate === currentDateStr} className="inline-flex items-center gap-[0.4rem]">
            <Star width="14" height="14" /> Generate AI Plan
          </Button>
          <button
            type="button"
            onClick={() => generateMealPlan(currentDateStr, true)}
            disabled={generatingDate === currentDateStr}
            title="Generate a completely different plan"
            className="flex min-h-[44px] cursor-pointer items-center gap-[0.4rem] rounded-md border border-clr-border bg-clr-surface px-4 text-sm font-semibold text-foreground hover:border-green hover:text-green disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Refresh />
          </button>
        </div>
      )}

      {bannerVisible && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[hsl(32,88%,75%)] bg-[hsl(32,88%,96%)] p-[0.75rem_1.25rem] text-[0.88rem] text-[hsl(25,60%,30%)] dark:border-[hsl(32,50%,30%)] dark:bg-[hsl(32,30%,10%)] dark:text-[hsl(32,25%,70%)]">
          <span className="flex items-center gap-[0.4rem]">
            <Bolt width="14" height="14" />
            <strong>1 free plan left this month</strong> — upgrade for unlimited plans &amp; the full grocery list.
          </span>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <a
              href="/upgrade.html"
              onClick={() => { try { localStorage.setItem('mealzy_upgrade_source', 'plan_limit_banner'); } catch { /* ignore */ } }}
              className="rounded-md bg-green px-[0.9rem] py-[0.35rem] text-[0.82rem] font-bold text-white no-underline"
            >
              Upgrade to Pro →
            </a>
            <button type="button" onClick={() => setBannerVisible(false)} aria-label="Dismiss" className="cursor-pointer border-none bg-transparent text-[1rem] leading-none text-[hsl(32,60%,40%)]">
              ×
            </button>
          </div>
        </div>
      )}

      {pendingRecipe && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[hsl(152,52%,70%)] bg-[hsl(152,52%,94%)] p-[0.75rem_1.25rem] text-[0.88rem] text-[hsl(152,52%,18%)] dark:border-[hsl(152,40%,28%)] dark:bg-[hsl(152,30%,10%)] dark:text-[hsl(152,40%,75%)]">
          <span className="flex items-center gap-2">
            <NavRecipes width="14" height="14" />
            Use <strong>{pendingRecipe.name || 'this recipe'}</strong> in today's plan?
          </span>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <button type="button" onClick={addPendingRecipeToDay} className="cursor-pointer rounded-md border-none bg-green px-[0.9rem] py-[0.35rem] text-[0.82rem] font-bold text-white">
              Yes, add it
            </button>
            <button type="button" onClick={() => setPendingRecipe(null)} aria-label="Dismiss" className="cursor-pointer border-none bg-transparent text-[1rem] leading-none text-[hsl(152,52%,30%)]">
              ×
            </button>
          </div>
        </div>
      )}

      {!disclaimerDismissed && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-green/30 bg-green/[0.06] p-[0.75rem_1rem] text-sm leading-relaxed text-foreground">
          <span>
            Meal suggestions are generated by AI and are for general guidance only. They are not medical or nutritional advice. Consult a
            healthcare professional before making significant dietary changes.
          </span>
          <button type="button" onClick={dismissDisclaimer} aria-label="Dismiss" className="shrink-0 cursor-pointer border-none bg-transparent p-0 text-[1.1rem] leading-none text-muted-fg">
            ×
          </button>
        </div>
      )}

      {view === 'day' && (
        <>
          <DayMealsSection
            meals={currentMeals}
            generating={generatingDate === currentDateStr}
            error={mealsError}
            swappingIndex={swappingIndex}
            flashIndex={flashIndex}
            onGenerate={() => generateMealPlan(currentDateStr, false)}
            onToggleDone={toggleMealDone}
            onSwap={swapMeal}
          />
          <SharePanel shareState={shareState} onCopy={copySharePlanLink} />
        </>
      )}

      {view === 'week' && (
        <WeekView
          currentDate={currentDate}
          mealPlans={mealPlans}
          goalCalories={auth.profile?.dailyCalories || 2000}
          onSwitchDay={switchToDay}
          onSwitchDayAndGenerate={switchToDayAndGenerate}
        />
      )}

      {view === 'day' && (
        <div className="sticky bottom-0 z-10 mt-6 grid grid-cols-2 gap-y-2 rounded-t-lg bg-forest p-[0.9rem_1.5rem] shadow-[0_-4px_24px_rgba(26,61,43,0.25)] sm:grid-cols-4 sm:gap-y-0">
          {[
            { label: 'Calories', value: totals.calories, accent: true },
            { label: 'Protein', value: totals.protein + 'g' },
            { label: 'Carbs', value: totals.carbs + 'g' },
            { label: 'Est. Cost', value: currencySymbol + totals.cost.toFixed(2) }
          ].map((item, i) => (
            <div
              key={item.label}
              className={
                'px-2 text-center ' +
                (i % 2 === 1 ? 'border-l border-forest-line ' : '') +
                (i > 0 ? 'sm:border-l sm:border-forest-line' : '')
              }
            >
              <div className={'font-display text-[1.2rem] font-black leading-none tracking-[-0.02em] ' + (item.accent ? 'text-green-light' : 'text-on-forest')}>
                {item.value}
              </div>
              <div className="mt-[0.2rem] text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-on-forest-muted">{item.label}</div>
            </div>
          ))}
        </div>
      )}

      <LimitModal open={limitModalOpen} onOpenChange={setLimitModalOpen} />
      <ToastContainer toasts={toasts} />
    </AppShell>
  );
}
