// Meal Planner data access. Plans live in localStorage.mealzy_meal_plans
// (keyed by YYYY-MM-DD), populated by POST /api/generate-meal. When that
// cache is empty for a date (cleared, stale, different device),
// fetchServerPlanIfNeeded falls back to GET /api/plans — the same read-only,
// no-credit-spent endpoint dashboard-today.js already uses to restore a plan
// that exists server-side but isn't cached locally.
window.PlannerAPI = (function () {
  function getDayMeals(dateStr) {
    const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
    return (plans[dateStr] && plans[dateStr].meals) ? plans[dateStr].meals : [];
  }

  function saveDayMeals(dateStr, meals) {
    const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
    if (!plans[dateStr]) plans[dateStr] = { meals: [] };
    plans[dateStr].meals = meals;
    localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));
  }

  async function fetchServerPlanIfNeeded(dateStr) {
    try {
      const res = await fetch('/api/plans');
      if (!res.ok) return null;
      const data = await res.json();
      const latest = (data.plans || [])[0];
      if (!latest) return null;

      const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
      if (latest.weekStart && Array.isArray(latest.days)) {
        latest.days.forEach(d => {
          if (d.date && d.meals) plans[d.date] = { meals: d.meals, generatedAt: latest.savedAt || new Date().toISOString() };
        });
      } else if (latest.date && latest.plan && latest.plan.meals) {
        plans[latest.date] = { meals: latest.plan.meals, generatedAt: latest.savedAt || new Date().toISOString() };
      }
      localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));
      return (plans[dateStr] && plans[dateStr].meals) ? plans[dateStr].meals : null;
    } catch (e) { return null; /* offline or no saved plan — leave as-is */ }
  }

  async function generatePlan(payload) {
    const res = await fetch('/api/generate-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  return { getDayMeals, saveDayMeals, fetchServerPlanIfNeeded, generatePlan };
})();
