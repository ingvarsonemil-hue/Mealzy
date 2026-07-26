/* localStorage + date helpers for the meal-planner page. Key names mirror
 * the legacy public/meal-planner.html contract exactly — do not rename them,
 * other authenticated pages (dashboard, grocery-list) read the same keys. */

export function readPlans() {
  try {
    return JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
  } catch {
    return {};
  }
}

export function writePlans(plans) {
  localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));
}

export function toISODate(date) {
  return date.toISOString().split('T')[0];
}

/* "Today — Monday, July 15, 2026" / "Tomorrow — ..." / "Yesterday — ..." */
export function formatDateLabel(date) {
  const today = new Date();
  const diff = Math.round((date - today) / 86400000);
  const label = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  if (diff === 0) return 'Today — ' + label;
  if (diff === 1) return 'Tomorrow — ' + label;
  if (diff === -1) return 'Yesterday — ' + label;
  return label;
}

/* Monday of the week containing `date`, used to build the 7-day week grid. */
export function mondayOf(date) {
  const d = new Date(date);
  const dow = d.getDay();
  d.setDate(d.getDate() - ((dow + 6) % 7));
  return d;
}

export function shouldShowPlanLimitBanner() {
  if (localStorage.getItem('mealzy_pro') === 'true') return false;
  const count = parseInt(localStorage.getItem('mealzy_plan_count_month') || '0', 10);
  return count >= 2;
}
