/* Meal-plan API calls shared by dashboard.html and meal-planner.html.
 * Endpoint contracts must match server.js exactly — do not change shapes.
 * POST /api/generate-meal  { profile, date, swap_meal_type?, plan_token?, user_email?, avoid_meals?, is_pro? }
 *   -> swap: { success, meal }
 *   -> full: { success, date, mealPlan: { meals:[4], totalCalories, totalCost, nutritionNote } }
 *   -> 402 { error:'free_limit_reached', message, upgrade_url, resets_in, used, limit }
 *   -> 400 { error:'allergy_violation', retry:true, allergen, message }
 *   -> 500 { error, fallback }
 *   NOTE: server re-derives Pro tier from the session; `is_pro` sent by the
 *   client is informational only, never trusted server-side.
 * POST /api/plans/save     { plan, date? } -> { success:true } | { error }
 *   (auth required; plural route — the historical hotfix for the
 *   singular /api/plan/save 404 bug. Never change this path.)
 * POST /api/plans/share    { plan, date?, title? } -> { success, shareId, shareUrl }
 *   NOTE: response key is `shareUrl`, never `url`.
 * POST /api/xp/award       { action } -> { success, xp, level, levelUp, xpEarned, streak, streakIncremented }
 *   action must be one of: generate_plan, swap_meal, complete_day, onboarding
 */

const json = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

export async function generateMeal(payload) {
  const res = await fetch('/api/generate-meal', json(payload));
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function savePlan({ plan, date }) {
  const res = await fetch('/api/plans/save', json(date ? { plan, date } : { plan }));
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export async function sharePlan({ plan, date, title }) {
  const res = await fetch('/api/plans/share', json({ plan, date, title }));
  const data = await res.json();
  return { ok: res.ok, data };
}

export async function awardXp(action) {
  const res = await fetch('/api/xp/award', json({ action }));
  if (!res.ok) return null;
  return res.json();
}
