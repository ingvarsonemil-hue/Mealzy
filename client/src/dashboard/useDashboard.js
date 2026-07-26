import * as React from 'react';
import { fetchMe } from '@/lib/auth';
import { track } from '@/lib/api';
import { generateMeal, savePlan, awardXp } from '@/lib/mealPlan';
import { getSampleMeals } from './sampleMeals';
import { readJSON, writeJSON, todayStr, calcWaterGoal, getGreeting } from './dashboardUtils';
import useToasts from './useToasts';

const TODAY = todayStr();

/* Core dashboard data/behavior, ported from the <script> block of
 * public/dashboard.html (init(), generateMealPlan(), swapMeal(), stats,
 * water, banners, PWA prompt, A/B test, streak badge, retention nudges). */
export default function useDashboard() {
  const { toasts, showToast } = useToasts();

  const [status, setStatus] = React.useState('loading'); // loading | ready | redirecting
  const [serverUser, setServerUser] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [todayMeals, setTodayMeals] = React.useState([]);
  const [waterCount, setWaterCount] = React.useState(0);
  const [ratings, setRatings] = React.useState({});
  const [dayComplete, setDayComplete] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [swappingIndex, setSwappingIndex] = React.useState(null);
  const [recentPlans, setRecentPlans] = React.useState([]);
  const [abVariant, setAbVariant] = React.useState('A');
  const [streakLive, setStreakLive] = React.useState(false); // see streak-badge quirk note below
  const [view, setView] = React.useState('dashboard'); // 'dashboard' | 'recipes'
  const [recipeModalIndex, setRecipeModalIndex] = React.useState(null);
  const [retentionBanner, setRetentionBanner] = React.useState(null); // { text }
  const [referralBanner, setReferralBanner] = React.useState(false);
  const [sundayNudgeBanner, setSundayNudgeBanner] = React.useState(false);
  const [gKeyTooltip, setGKeyTooltip] = React.useState(false);
  const [pwaBanner, setPwaBanner] = React.useState({ visible: false });
  const deferredPromptRef = React.useRef(null);
  const [referralLink, setReferralLink] = React.useState('');

  const isPro = !!serverUser?.pro;

  const lsUser = React.useCallback(() => readJSON('mealzy_user', {}), []);

  /* ── Stats (derived) ─────────────────────────────────────────────────── */
  const completedMeals = todayMeals.filter((m) => m.completed);
  const totalCals = completedMeals.reduce((s, m) => s + (m.calories || 0), 0);
  const totalProtein = completedMeals.reduce((s, m) => s + (m.protein || 0), 0);
  const totalCarbs = completedMeals.reduce((s, m) => s + (m.carbs || 0), 0);
  const totalFat = completedMeals.reduce((s, m) => s + (m.fat || 0), 0);
  const goalCals = profile?.dailyCalories || 2000;
  const goalProtein = profile?.macros?.protein || 150;
  const goalCarbs = profile?.macros?.carbs || 200;
  const goalFat = profile?.macros?.fat || 67;
  const waterGoal = calcWaterGoal(profile);
  const streak = profile?.streak || 0;

  /* Persist today's nutrition log whenever the completed-meal totals change
   * (ported from updateStats()'s trailing localStorage write). */
  React.useEffect(() => {
    if (!profile) return;
    const logs = readJSON('mealzy_nutrition_logs', {});
    logs[TODAY] = { calories: totalCals, protein: totalProtein, carbs: totalCarbs, fat: totalFat, goalCals };
    writeJSON('mealzy_nutrition_logs', logs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCals, totalProtein, totalCarbs, totalFat, goalCals, profile]);

  /* ── Init ─────────────────────────────────────────────────────────────── */
  const bootRan = React.useRef(false);
  React.useEffect(() => {
    if (bootRan.current) return; // StrictMode double-invokes effects in dev
    bootRan.current = true;

    (async () => {
      let user = null;
      try {
        user = await fetchMe();
        setServerUser(user);
        writeJSON('mealzy_user', { name: user.name, email: user.email });
        if (user.ref_code) localStorage.setItem('mealzy_ref_code', user.ref_code);
        if (user.pro) localStorage.setItem('mealzy_pro', 'true');
        else localStorage.removeItem('mealzy_pro');
        if (user.profile) {
          const localProfile = readJSON('mealzy_profile', {});
          const merged = { ...localProfile, ...user.profile, name: user.name };
          writeJSON('mealzy_profile', merged);
        }
      } catch (err) {
        if (err.status) {
          // Server says not authenticated
          localStorage.removeItem('mealzy_user');
          setStatus('redirecting');
          window.location.href = '/login.html';
          return;
        }
        // Server unreachable — fall back to localStorage cache, retry once
        const cached = localStorage.getItem('mealzy_user');
        if (!cached) {
          setStatus('redirecting');
          window.location.href = '/login.html';
          return;
        }
        setTimeout(async () => {
          try {
            const retryUser = await fetchMe();
            setServerUser(retryUser);
          } catch { /* still offline — leave fallback as-is */ }
        }, 2000);
      }

      const profileData = localStorage.getItem('mealzy_profile');
      if (!profileData) {
        setStatus('redirecting');
        window.location.href = '/onboarding.html';
        return;
      }
      const parsedProfile = JSON.parse(profileData);
      setProfile(parsedProfile);

      // A/B test — generate button label
      let variant = localStorage.getItem('mealzy_ab_cta');
      if (!variant) {
        variant = Math.random() < 0.5 ? 'A' : 'B';
        localStorage.setItem('mealzy_ab_cta', variant);
      }
      setAbVariant(variant);
      track('ab_cta_impression', { variant });

      // Today's meals + water
      const plans = readJSON('mealzy_meal_plans', {});
      const water = readJSON('mealzy_water', {});
      setWaterCount(water[TODAY] || 0);
      if (plans[TODAY]?.meals?.length > 0) {
        setTodayMeals(plans[TODAY].meals.map((m) => ({ ...m, completed: false })));
      }
      setDayComplete(!!localStorage.getItem('mealzy_day_complete_' + TODAY));
      setRatings(readJSON('mealzy_ratings', {}));

      // Recent plans
      const history = readJSON('mealzy_history', []);
      setRecentPlans(history.slice(0, 3));

      // Retention banners
      const now = new Date();
      const day = now.getDay();
      const hour = now.getHours();
      const lastGen = localStorage.getItem('mealzy_last_generation');
      const daysSinceLast = lastGen ? (Date.now() - new Date(lastGen).getTime()) / 86400000 : Infinity;
      if (day === 0 && hour >= 17) {
        setRetentionBanner({ text: 'Sunday evening — a great time to plan your meals for the week ahead.' });
      } else if (daysSinceLast >= 7 && isFinite(daysSinceLast)) {
        setRetentionBanner({ text: `Welcome back! It's been ${Math.floor(daysSinceLast)} days since your last meal plan. Generate a fresh one?` });
      }

      // PWA banner
      if (!localStorage.getItem('mealzy_pwa_dismissed')) {
        window.addEventListener('beforeinstallprompt', (e) => {
          e.preventDefault();
          deferredPromptRef.current = e;
          setPwaBanner({ visible: true });
        });
      }

      // Welcome message (?new=true or mealzy_is_new_user)
      const params = new URLSearchParams(window.location.search);
      const isNew = params.get('new') === 'true' || localStorage.getItem('mealzy_is_new_user') === '1';
      if (isNew) {
        showToast(`Welcome to Mealzy, ${parsedProfile.name || 'there'}! Generate your first meal plan below.`, 'success');
        localStorage.removeItem('mealzy_is_new_user');
        const url = new URL(window.location.href);
        url.searchParams.delete('new');
        window.history.replaceState({}, '', url);
      }

      // Weekly re-engagement (Sunday nudge) — preserves the legacy check
      // against `mealzy_last_generated_date`, a key nothing ever writes
      // (the real key is `mealzy_last_generation`); that means this guard
      // is always a no-op in production, same as today.
      if (now.getDay() === 0) {
        const todayIso = now.toISOString().split('T')[0];
        const lastSeen = localStorage.getItem('mealzy_sunday_nudge_shown');
        if (lastSeen !== todayIso) {
          localStorage.setItem('mealzy_sunday_nudge_shown', todayIso);
          const lastGenerated = localStorage.getItem('mealzy_last_generated_date');
          if (lastGenerated !== todayIso) {
            setTimeout(() => {
              showToast('New week starting — your meal plan is waiting. Generate now and your grocery list will be ready before Monday!', 'success');
              setSundayNudgeBanner(true);
            }, 1500);
          }
        }
      }

      // G-key tooltip (first visit only)
      if (!localStorage.getItem('mealzy_g_key_shown')) {
        setGKeyTooltip(true);
        setTimeout(() => {
          setGKeyTooltip(false);
          localStorage.setItem('mealzy_g_key_shown', '1');
        }, 4000);
      }

      setStatus('ready');

      // Auto-generate from onboarding (?autoGenerate=1)
      if (params.get('autoGenerate') === '1') {
        window.history.replaceState({}, '', '/dashboard.html');
        setTimeout(() => generateMealPlanRef.current?.(), 800);
      }
    })();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (window.location.hash === '#recipes') setView('recipes');
  }, []);

  /* ── Generate plan ────────────────────────────────────────────────────── */
  const generateMealPlanRef = React.useRef(null);
  const upgradeFlowRef = React.useRef(null);

  const generateMealPlan = React.useCallback(async () => {
    if (!profile) { window.location.href = '/onboarding.html'; return; }
    track('ab_cta_click', { variant: localStorage.getItem('mealzy_ab_cta') || 'A' });
    setGenerating(true);
    try {
      const ratingsData = readJSON('mealzy_ratings', {});
      const avoid_meals = Object.entries(ratingsData).filter(([, v]) => v === -1).map(([k]) => k);
      const user_email = lsUser().email || '';
      const { status: httpStatus, data } = await generateMeal({
        profile, date: TODAY, avoid_meals, user_email, is_pro: isPro
      });

      if (httpStatus === 402) {
        track('free_limit_hit', {});
        upgradeFlowRef.current?.openLimitPrompt(data.message || 'You have used all 3 free plans this month.');
        return;
      }

      let newMeals = null;
      if (data.success && data.mealPlan) {
        newMeals = data.mealPlan.meals.map((m) => ({ ...m, completed: false }));
      } else if (data.fallback) {
        newMeals = data.fallback.meals.map((m) => ({ ...m, completed: false }));
        showToast('Using offline meal suggestions', 'success');
      }
      if (!newMeals) throw new Error('generation_failed');

      setTodayMeals(newMeals);
      const plans = readJSON('mealzy_meal_plans', {});
      plans[TODAY] = { meals: newMeals, generatedAt: new Date().toISOString() };
      writeJSON('mealzy_meal_plans', plans);
      track('generate_plan', {});

      try {
        const xpData = await awardXp('generate_plan');
        if (xpData && typeof xpData.streak === 'number') {
          setProfile((p) => {
            const updated = { ...p, streak: xpData.streak };
            writeJSON('mealzy_profile', updated);
            return updated;
          });
          setStreakLive(true);
        }
      } catch { /* badge just won't update reactively this time */ }

      const planCount = parseInt(localStorage.getItem('mealzy_plan_count_month') || '0', 10) + 1;
      localStorage.setItem('mealzy_plan_count_month', String(planCount));

      // Save to history
      const history = readJSON('mealzy_history', []);
      history.unshift({ date: TODAY, meals: newMeals, generatedAt: new Date().toISOString() });
      if (history.length > 10) history.length = 10;
      writeJSON('mealzy_history', history);
      localStorage.setItem('mealzy_last_generation', new Date().toISOString());
      setRecentPlans(history.slice(0, 3));

      // Cloud sync — full localStorage plan map
      savePlan({ plan: plans }).catch(() => {});
      // Fire-and-forget single-day save (historical dual-write, see task contract)
      savePlan({ plan: data.mealPlan, date: TODAY }).catch(() => {});

      showToast('Meal plan generated!', 'success');

      if (!isPro && planCount === 1) {
        const email = lsUser().email;
        if (email) {
          const refCode = localStorage.getItem('mealzy_ref_code');
          const refParam = refCode || encodeURIComponent(email);
          setReferralLink(`${window.location.origin}/?ref=${refParam}`);
          setReferralBanner(true);
        }
      }
    } catch (err) {
      showToast('Something went wrong — please try again.', 'error');
    } finally {
      setGenerating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, isPro]);

  generateMealPlanRef.current = generateMealPlan;

  /* G-key shortcut */
  React.useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.key === 'g' || e.key === 'G') &&
          document.activeElement.tagName !== 'INPUT' &&
          document.activeElement.tagName !== 'TEXTAREA') {
        generateMealPlanRef.current?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  /* ── Meal actions ─────────────────────────────────────────────────────── */
  const toggleMealDone = (index, checked) => {
    setTodayMeals((meals) => {
      const next = meals.map((m, i) => (i === index ? { ...m, completed: checked } : m));
      const plans = readJSON('mealzy_meal_plans', {});
      if (plans[TODAY]) {
        plans[TODAY].meals = next;
        writeJSON('mealzy_meal_plans', plans);
      }
      return next;
    });
    if (checked) showToast(`${todayMeals[index].name} marked as done`, 'success');
  };

  const markDayComplete = () => {
    const key = 'mealzy_day_complete_' + TODAY;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    setDayComplete(true);
    showToast('Day complete!', 'success');
  };

  const rateMeal = (index, rating) => {
    const meal = todayMeals[index];
    if (!meal) return;
    const next = { ...ratings, [meal.name]: rating };
    setRatings(next);
    writeJSON('mealzy_ratings', next);
    showToast(rating === 1 ? 'Liked! More like this next time' : 'Got it — will avoid next time', 'success');
  };

  const swapMeal = async (index) => {
    const meal = todayMeals[index];
    if (!meal) return;
    setSwappingIndex(index);
    try {
      const { data } = await generateMeal({ profile, date: TODAY, swap_meal_type: meal.type, is_pro: isPro });
      let newMeal = null;
      if (data.success && data.meal) {
        newMeal = { ...data.meal, completed: false };
      } else if (data.success && data.mealPlan?.meals) {
        const found = data.mealPlan.meals.find((m) => m.type === meal.type);
        if (found) newMeal = { ...found, completed: false };
      }
      if (!newMeal) {
        const sample = getSampleMeals().find((m) => m.type === meal.type);
        newMeal = sample ? { ...sample, completed: false } : null;
      }
      if (newMeal) {
        setTodayMeals((meals) => {
          const next = meals.map((m, i) => (i === index ? newMeal : m));
          const plans = readJSON('mealzy_meal_plans', {});
          if (plans[TODAY]) {
            plans[TODAY].meals = next;
            writeJSON('mealzy_meal_plans', plans);
          }
          return next;
        });
        showToast('Meal swapped!', 'success');
      } else {
        showToast('Could not swap meal — try again', 'error');
      }
    } catch {
      showToast('Server offline — swap unavailable', 'error');
    } finally {
      setSwappingIndex(null);
    }
  };

  const loadRecentPlan = (index) => {
    const history = readJSON('mealzy_history', []);
    const entry = history[index];
    if (!entry) return;
    const meals = entry.meals.map((m) => ({ ...m, completed: false }));
    setTodayMeals(meals);
    const plans = readJSON('mealzy_meal_plans', {});
    plans[TODAY] = { meals, generatedAt: new Date().toISOString() };
    writeJSON('mealzy_meal_plans', plans);
    showToast('Plan loaded!', 'success');
  };

  /* ── Water ────────────────────────────────────────────────────────────── */
  const addWater = () => {
    setWaterCount((c) => {
      const next = c + 1;
      const water = readJSON('mealzy_water', {});
      water[TODAY] = next;
      writeJSON('mealzy_water', water);
      return next;
    });
  };
  const removeWater = () => {
    setWaterCount((c) => {
      if (c <= 0) return c;
      const next = c - 1;
      const water = readJSON('mealzy_water', {});
      water[TODAY] = next;
      writeJSON('mealzy_water', water);
      return next;
    });
  };

  /* ── PWA install ──────────────────────────────────────────────────────── */
  const installPwa = async () => {
    const deferred = deferredPromptRef.current;
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') localStorage.setItem('mealzy_pwa_dismissed', '1');
    deferredPromptRef.current = null;
    setPwaBanner({ visible: false });
  };
  const dismissPwaBanner = () => {
    localStorage.setItem('mealzy_pwa_dismissed', '1');
    setPwaBanner({ visible: false });
  };

  /* Streak badge text: legacy runs updateStreakBadge() (proper pluralization
   * + hide-if-zero) during updateUserUI(), then unconditionally overwrites
   * the same textContent from updateGreeting() with a non-pluralized
   * `${streak || 1} day streak` — display stays whatever updateStreakBadge
   * set. Net result on first paint: always singular "day", hidden if the
   * streak is 0. A later XP-award response calls updateStreakBadge() again
   * with nothing to clobber it, so it becomes correctly pluralized after the
   * user's first successful generate. Preserved intentionally — see report. */
  const streakBadgeText = streakLive
    ? `${streak} day${streak === 1 ? '' : 's'} streak`
    : `${streak || 1} day streak`;

  return {
    status, serverUser, profile, isPro,
    today: TODAY,
    greeting: getGreeting(new Date().getHours()),
    dateStr: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    todayMeals, dayComplete, markDayComplete,
    toggleMealDone, rateMeal, ratings, swapMeal, swappingIndex,
    generating, generateMealPlan,
    stats: { totalCals, totalProtein, totalCarbs, totalFat, goalCals, goalProtein, goalCarbs, goalFat },
    waterCount, waterGoal, addWater, removeWater,
    streak, streakVisible: streak > 0, streakBadgeText,
    abVariant,
    recentPlans, loadRecentPlan,
    view, setView,
    recipeModalIndex, setRecipeModalIndex,
    retentionBanner, dismissRetentionBanner: () => setRetentionBanner(null),
    referralBanner, referralLink, dismissReferralBanner: () => setReferralBanner(false),
    sundayNudgeBanner, dismissSundayNudgeBanner: () => setSundayNudgeBanner(false),
    gKeyTooltip,
    pwaBanner, installPwa, dismissPwaBanner,
    toasts, showToast,
    upgradeFlowRef,
    lsUserEmail: lsUser().email || ''
  };
}
