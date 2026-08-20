// Meal Planner data access. There is no GET endpoint for a day's plan — plans
// live in localStorage.mealzy_meal_plans (keyed by YYYY-MM-DD), populated by
// POST /api/generate-meal. This module wraps that existing contract; it does
// not introduce a server round-trip that doesn't exist.
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

  async function generatePlan(payload) {
    const res = await fetch('/api/generate-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  return { getDayMeals, saveDayMeals, generatePlan };
})();
