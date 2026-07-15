/* Backend calls — endpoint contracts must match server.js exactly.
 * POST /api/demo-meal          { calorieGoal, budget, dietary } -> { success, plan }
 * POST /api/track              { event, data }
 * POST /api/email-leads        { email, source }
 * GET  /api/referral-capture?ref=EMAIL
 * GET  /api/ref-lookup?code=ref_XXX -> { found, email }
 * GET  /api/shared-plan/:shareId -> { success, plan, views }
 */

export function track(event, data) {
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, data: data || {} })
  }).catch(() => {});
}

export async function generateDemoMeal({ calorieGoal, budget, dietary }) {
  const res = await fetch('/api/demo-meal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ calorieGoal, budget, dietary })
  });
  if (res.status === 429) {
    const err = new Error("You've used today's 3 free demos. Create a free account for unlimited access — it's free.");
    err.rateLimited = true;
    throw err;
  }
  const data = await res.json();
  if (!data.success || !data.plan || !data.plan.meals) {
    throw new Error(data.error || 'Generation failed');
  }
  return data.plan;
}

/* meal-plan-generator.html's standalone demo tool. Kept separate from
 * generateDemoMeal() above (used by the homepage hero) so this page's 402
 * "redirect to upgrade" handling can't change homepage behavior. */
export async function generateDemoMealForTool({ calorieGoal, budget, dietary }) {
  const res = await fetch('/api/demo-meal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ calorieGoal, budget, dietary })
  });
  if (res.status === 429) {
    const err = new Error("You've used today's 3 free previews. Create a free account for unlimited plans.");
    err.rateLimited = true;
    throw err;
  }
  if (res.status === 402) {
    const err = new Error('Upgrade required');
    err.paymentRequired = true;
    throw err;
  }
  const data = await res.json();
  if (!data.success || !data.plan || !data.plan.meals) {
    throw new Error('Generation failed');
  }
  return data.plan;
}

export async function getSharedPlan(shareId) {
  const res = await fetch(`/api/shared-plan/${encodeURIComponent(shareId)}`);
  if (!res.ok) throw new Error('Plan not found');
  const data = await res.json();
  if (!data.success) throw new Error('Plan not found');
  return data.plan;
}

export function submitEmailLead(email) {
  fetch('/api/email-leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, source: 'popup' })
  }).catch(() => {});
}

/* Visitor landed with ?ref= — same logic as the old landing.js. */
export function captureReferral() {
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (!ref) return;
  if (ref.indexOf('@') !== -1) {
    localStorage.setItem('mealzy_pending_ref', ref);
    fetch('/api/referral-capture?ref=' + encodeURIComponent(ref)).catch(() => {});
  } else if (ref.indexOf('ref_') === 0) {
    fetch('/api/ref-lookup?code=' + encodeURIComponent(ref))
      .then((r) => r.json())
      .then((d) => {
        if (d.found && d.email) {
          localStorage.setItem('mealzy_pending_ref', d.email);
          fetch('/api/referral-capture?ref=' + encodeURIComponent(d.email)).catch(() => {});
        }
      })
      .catch(() => {});
  }
}
