// Shared Pro/Free entitlement rendering + gating — single source of truth so
// every authenticated page (Dashboard, Meal Planner, Settings, AI Coach,
// Grocery List, Analytics) converges on the same rule: a resolved
// /api/auth/me response is authoritative; while unresolved (initial fetch
// still pending, or it failed and a retry hasn't resolved yet), entitlement
// is UNKNOWN — render neutral, never guess Free or Pro from localStorage.
//
// Each page keeps its own `serverUser` variable (set from that page's own
// /api/auth/me fetch in its own init() — kept per-page since each page's
// init() already needs the full response for other things like name/profile,
// and a 2s retry-on-failure, matching this same pattern). Call
// renderPlanEntitlement(serverUser) once resolved (and again after any retry)
// to update the sidebar; call resolveIsPro(serverUser) for feature gates.

function renderPlanEntitlement(serverUser) {
  const proBadge = document.getElementById('proBadge');
  const planLabel = document.getElementById('planLabel');
  const mobilePlanLabel = document.getElementById('mobilePlanLabel');
  if (proBadge) proBadge.style.display = serverUser?.pro ? 'inline-block' : 'none';
  if (!serverUser) {
    if (planLabel) planLabel.textContent = 'Checking plan…';
    if (mobilePlanLabel) mobilePlanLabel.textContent = 'Checking plan…';
    return;
  }
  const isPro = !!serverUser.pro;
  if (planLabel) planLabel.textContent = isPro ? 'Pro Plan' : 'Free Plan';
  if (mobilePlanLabel) mobilePlanLabel.textContent = isPro ? 'Pro Plan' : 'Free Plan';
}

// Resolved serverUser always wins; localStorage.mealzy_pro is consulted only
// while serverUser is still unresolved (offline, or mid-retry) — a real
// action isn't blocked outright while offline, but a resolved server answer
// can never be overruled by a stale cache.
function resolveIsPro(serverUser) {
  return serverUser ? !!serverUser.pro : localStorage.getItem('mealzy_pro') === 'true';
}
