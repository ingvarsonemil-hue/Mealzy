/* Grocery-list API calls, used by grocery-list.html.
 * Endpoint contracts must match server.js exactly.
 * POST /api/generate-grocery-list  { profile, meals, weekStart?, day?, planId? } -> auth required
 *   -> { success, groceryList, planId? }
 *   groceryList = { weekStart, totalCost, budgetAmount, currency,
 *     categories: { produce,protein,dairy,grains,pantry,frozen,beverages,other: [] } }
 *   each item: { name, amount, cost, checked, day }
 * GET /api/grocery-list/:planId/days -> { success, days:[...] } | 404 { error:'not_found' }
 * GET /api/grocery-list/:planId/:day -> { success, groceryList } | 404 { error:'not_found' }
 *   NOTE: per-day split responses omit `budgetAmount` (only present on the
 *   full-week generation response) — this asymmetry is pre-existing and
 *   must be preserved, not "fixed" by inventing a value.
 */

const json = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

export async function generateGroceryList(payload) {
  const res = await fetch('/api/generate-grocery-list', json(payload));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to generate grocery list');
  return data;
}

export async function fetchGroceryDays(planId) {
  const res = await fetch(`/api/grocery-list/${encodeURIComponent(planId)}/days`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error('Failed to load grocery days');
  const data = await res.json();
  return data.days || [];
}

export async function fetchGroceryDay(planId, day) {
  const res = await fetch(`/api/grocery-list/${encodeURIComponent(planId)}/${encodeURIComponent(day)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.groceryList || null;
}
