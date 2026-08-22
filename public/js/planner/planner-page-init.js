// Meal Planner page bootstrap: auth/profile state, day-view generation,
// custom meal modal, and the free-plan limit modal. Moved out of an inline
// <script> in meal-planner.html so that file could be split into
// data-component partials (see planner-week-view.js for the rest).
//
// DOM lookups that target nav.html / banners.html / modals.html (all now
// component-loaded, async) are gated behind 'components:ready' via init();
// everything else (function declarations, the PlannerState bridge) is safe
// to run immediately since it doesn't touch the DOM.

// Dark mode
if (localStorage.getItem('mealzy_theme') === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark');
}

// SVG icon constants — no emoji in rendered HTML
const ICO = {
  flame: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3C12 3 10 7 9 9.5C8 8 8 6 9 4C6.5 6.5 6 9 6 11.5C6 15.8 8.7 19 12 19C15.3 19 18 15.8 18 11.5C18 9 17.5 7.5 16 6C16.5 7.5 16.5 9 16 10.5C15 8.5 14.5 6.5 12 3Z"/></svg>`,
  zap:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3L6.5 13H12.5L10 21.5C13 18 17.5 13.5 18 10.5H12.5L14 3Z"/></svg>`,
  grain: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4V21"/><path d="M12 8.5C11 7.5 9.5 7 9 5.5C10.5 5.5 12 7 12 8.5Z"/><path d="M12 13C11 12 9.5 11.5 9 10C10.5 10 12 11.5 12 13Z"/><path d="M12 8.5C13 7.5 14.5 7 15 5.5C13.5 5.5 12 7 12 8.5Z"/><path d="M12 13C13 12 14.5 11.5 15 10C13.5 10 12 11.5 12 13Z"/></svg>`,
  drop:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L5.5 13C5.5 17 8.5 20.5 12 20.5C15.5 20.5 18.5 17 18.5 13L12 3.5Z"/></svg>`,
  clock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4.5C8 4.5 4.5 8 4.5 12C4.5 16 8 19.5 12 19.5C16 19.5 19.5 16 19.5 12C19.5 8 16 4.5 12 4.5Z"/><path d="M12 8V12.5L15.5 14.5"/></svg>`,
  star:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  starFilled: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  cal:   `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
};

// ── Auth helpers (JWT cookie — server is source of truth) ──
async function cloudLoad(uid) { /* no-op */ }
async function cloudSave() { /* no-op — data saved server-side */ }
async function signOut() {
  try { await fetch('/api/auth/signout', { method: 'POST' }); } catch(e) { console.error('[Auth] Signout error:', e); }
  localStorage.clear(); window.location.href = 'login.html';
}
// ─────────────────────────

let profile = null;

// Always pulls the server's copy of the profile before meal generation so a
// stale localStorage "mealzy_profile" (e.g. old allergy settings) can never
// cause a false allergy_violation. Falls back to the cached profile if the
// request fails (offline, etc).
async function refreshProfileFromServer() {
  try {
    const res = await fetch('/api/profile');
    if (res.ok) {
      const data = await res.json();
      if (data.profile) {
        profile = data.profile;
        localStorage.setItem('mealzy_profile', JSON.stringify(profile));
      }
    }
  } catch (e) { /* offline — fall back to cached profile */ }
}

let currentDate = new Date();
let currentDateStr = '';
let currentMeals = [];
let currentView = 'day';
let _customMealIndex = null;

// Bridges this script's day-view state to the deferred planner/*.js modules
// — same underlying variables via closures, so both sides stay in sync
// without a second source of truth.
window.PlannerState = {
  get profile() { return profile; }, set profile(v) { profile = v; },
  get currentDate() { return currentDate; }, set currentDate(v) { currentDate = v; },
  get currentDateStr() { return currentDateStr; }, set currentDateStr(v) { currentDateStr = v; },
  get currentMeals() { return currentMeals; }, set currentMeals(v) { currentMeals = v; }
};

function openCustomMealModal(index, type) {
  _customMealIndex = (index === undefined || index === null) ? null : index;
  document.getElementById('customMealForm').reset();
  document.getElementById('customMealType').value = type || 'lunch';
  document.getElementById('customMealModal').classList.add('open');
  document.getElementById('customMealName').focus();
}

function closeCustomMealModal() {
  document.getElementById('customMealModal').classList.remove('open');
}

function saveCustomMeal(e) {
  e.preventDefault();
  const name = document.getElementById('customMealName').value.trim().slice(0, 120);
  if (!name) return;

  const meal = {
    type:          document.getElementById('customMealType').value,
    name,
    description:   document.getElementById('customMealDesc').value.trim().slice(0, 500),
    calories:      Math.max(0, Number(document.getElementById('customMealCalories').value) || 0),
    protein:       Math.max(0, Number(document.getElementById('customMealProtein').value) || 0),
    carbs:         Math.max(0, Number(document.getElementById('customMealCarbs').value) || 0),
    fat:           Math.max(0, Number(document.getElementById('customMealFat').value) || 0),
    cookTime:      Math.max(0, Number(document.getElementById('customMealCookTime').value) || 0),
    estimatedCost: Math.max(0, Number(document.getElementById('customMealCost').value) || 0),
    ingredients: [],
    instructions: [],
    completed: false
  };

  if (_customMealIndex === null) {
    currentMeals.push(meal);
  } else {
    currentMeals[_customMealIndex] = meal;
  }

  const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
  if (!plans[currentDateStr]) plans[currentDateStr] = { meals: [] };
  plans[currentDateStr].meals = currentMeals;
  localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));

  closeCustomMealModal();
  window.PlannerRenderDayView();
  showToast('Custom meal saved', 'success');
}

async function init() {
  try {
    const meRes = await fetch('/api/auth/me');
    if (meRes.ok) {
      const u = await meRes.json();
      localStorage.setItem('mealzy_user', JSON.stringify({ name: u.name, email: u.email }));
      if (u.pro) localStorage.setItem('mealzy_pro', 'true'); else localStorage.removeItem('mealzy_pro');
      if (u.profile) { const lp = JSON.parse(localStorage.getItem('mealzy_profile')||'{}'); localStorage.setItem('mealzy_profile', JSON.stringify({ ...u.profile, ...lp })); }
    } else { localStorage.removeItem('mealzy_user'); window.location.href = 'login.html?signup=1'; return; }
  } catch(e) { if (!localStorage.getItem('mealzy_user')) { window.location.href = 'login.html?signup=1'; return; } }
  const profileData = localStorage.getItem('mealzy_profile');
  if (!profileData) { window.location.href = 'onboarding.html'; return; }
  profile = JSON.parse(profileData);

  const initial = (profile.name || 'U')[0].toUpperCase();
  const avatarEl = document.getElementById('userAvatar');
  if (avatarEl) avatarEl.textContent = initial;
  document.getElementById('mobileUserAvatar').textContent = initial;
  document.getElementById('userName').textContent = profile.name || 'User';
  document.getElementById('mobileUserName').textContent = profile.name || 'User';
  applyNavTranslations();
  checkPlanLimitBanner();
  checkPendingRecipe();

  // Auto-generate right after onboarding (value in 15 seconds). Components
  // are already loaded by the time init() runs (it's gated on
  // 'components:ready' below), so this can fire the timeout directly instead
  // of waiting on a second 'components:ready' event that will never come.
  const autoParams = new URLSearchParams(window.location.search);
  if (autoParams.get('autoGenerate') === '1') {
    window.history.replaceState({}, '', 'meal-planner.html');
    setTimeout(async () => { await generateMealPlan(); showCompletionBanner(); }, 800);
  }
}
document.addEventListener('components:ready', init, { once: true });

function showCompletionBanner() {
  const banner = document.getElementById('completionBanner');
  if (banner) banner.classList.remove('hidden');
}

function dismissCompletionBanner() {
  const banner = document.getElementById('completionBanner');
  if (banner) banner.classList.add('hidden');
}

function setHouseholdSize(value) {
  let size = parseInt(value, 10);
  if (!Number.isInteger(size) || size < 1 || size > 8) size = 1;
  localStorage.setItem('mealzy_household_size', String(size));
  if (profile) {
    profile.householdSize = size;
    localStorage.setItem('mealzy_profile', JSON.stringify(profile));
    fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile })
    }).catch(() => {});
  }
  window.PlannerRenderDayView();
}

/** Monday (YYYY-MM-DD) of the week containing the given Date. */
function getMondayStr(date) {
  const d = new Date(date);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return monday.toISOString().split('T')[0];
}

// Pro: generates a full 7-day plan (21 meals + snacks) for the week containing
// currentDate — 1 generation credit unlocks the whole week.
// Free/trial: generates a single day (today only — the 30-day trial allows
// exactly 1 plan per calendar day). Both populate localStorage per-day so the
// existing Day View / Week View rendering (which reads mealzy_meal_plans by
// date) works unchanged.
async function generateMealPlan(isRegenerate) {
  if (!profile) return;
  await refreshProfileFromServer();

  // Show skeleton cards while generating
  const container = document.getElementById('mealsContainer');
  const skeletonCard = `
  <div class="skeleton-card">
    <div class="skeleton sk-badge"></div>
    <div class="skeleton sk-title"></div>
    <div class="skeleton sk-desc"></div>
    <div class="skeleton sk-desc2"></div>
    <div class="sk-stats">
      <div class="skeleton sk-stat"></div>
      <div class="skeleton sk-stat"></div>
      <div class="skeleton sk-stat"></div>
    </div>
  </div>`;
  container.innerHTML = `<div class="grid-2">${skeletonCard.repeat(4)}</div>`;

  const btn = document.getElementById('generateBtn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

  const isPro = localStorage.getItem('mealzy_pro') === 'true';
  const weekStart = getMondayStr(currentDate);
  const existingPlans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
  const avoidMeals = isRegenerate
    ? Object.values(existingPlans).flatMap(p => (p && p.meals) ? p.meals.map(m => m.name) : []).filter(Boolean)
    : [];
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  try {
    const res = await fetch('/api/generate-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        isPro
          ? { profile, weekStart, avoid_meals: avoidMeals }
          : { profile, date: currentDateStr, timezone, avoid_meals: avoidMeals }
      )
    });

    const data = await res.json();

    if (res.status === 402 && data.error === 'free_limit_reached') {
      window.PlannerRenderDayView(); // restore previous meals or empty state
      showLimitModal();
      return;
    }

    if (res.status === 409 && data.error === 'already_generated_today') {
      showAlreadyGeneratedTodayState(data.message);
      return;
    }

    if (!res.ok || !data.success) {
      showErrorState(data.message || data.error || 'Generation failed. Please try again.');
      return;
    }

    const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
    if (isPro) {
      (data.days || []).forEach(d => {
        plans[d.date] = { meals: d.meals || [], generatedAt: new Date().toISOString() };
      });
    } else if (data.mealPlan) {
      plans[data.date || currentDateStr] = { meals: data.mealPlan.meals || [], generatedAt: new Date().toISOString() };
    }
    localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));

    // The server already generated and saved a grocery list for this plan in the
    // background (see /api/generate-meal) — stash its id under the same key
    // groceries-sync.js reads, so "Shop Grocery List" opens the real list instead
    // of an empty one.
    if (data.planId) {
      const groceryPlanIds = JSON.parse(localStorage.getItem('mealzy_grocery_plan_ids') || '{}');
      groceryPlanIds[weekStart] = data.planId;
      localStorage.setItem('mealzy_grocery_plan_ids', JSON.stringify(groceryPlanIds));
    }

    currentMeals = (plans[currentDateStr] && plans[currentDateStr].meals) ? plans[currentDateStr].meals : [];
    window.PlannerRenderDayView();
    checkPlanLimitBanner();
    if (isPro && currentView === 'week') renderWeekView();
    document.getElementById('sharePlanPanel').style.display = 'block';
    generateShareLink(currentMeals);

    try {
      await fetch('/api/xp/award', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate_plan' }) });
    } catch(e) { console.error('[XP] Award error:', e); }

  } catch(err) {
    showErrorState('Connection lost. Check your internet and try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
  }
}

function regenerateMealPlan() {
  generateMealPlan(true);
}

function showErrorState(message) {
  const container = document.getElementById('mealsContainer');
  container.innerHTML = `
  <div class="error-state">
    <div class="error-state-icon">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    </div>
    <h3>Something went wrong</h3>
    <p>${message}</p>
    <button class="btn btn-primary" onclick="generateMealPlan()">Try again</button>
  </div>`;
}

// Distinct from showErrorState — this isn't a failure, it's the free trial's
// 1-plan-per-day rule. No "Try again" button since retrying won't help until
// the next calendar day.
function showAlreadyGeneratedTodayState(message) {
  const container = document.getElementById('mealsContainer');
  container.innerHTML = `
  <div class="error-state">
    <div class="error-state-icon">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    </div>
    <h3>Today's plan is ready</h3>
    <p>${message || "You already generated a plan today. Come back tomorrow for your next one."}</p>
    <a class="btn btn-primary" href="/pricing.html">Upgrade for unlimited plans</a>
  </div>`;
}

let _limitModalTrigger = null;

function showLimitModal() {
  _limitModalTrigger = document.activeElement;
  const modal = document.getElementById('limitModal');
  modal.classList.add('open');
  const focusable = modal.querySelectorAll('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])');
  if (focusable[0]) focusable[0].focus();
}

function closeLimitModal() {
  document.getElementById('limitModal').classList.remove('open');
  if (_limitModalTrigger) { _limitModalTrigger.focus(); _limitModalTrigger = null; }
}

async function generateShareLink(meals) {
  const panel = document.getElementById('sharePlanPanel');
  const input = document.getElementById('sharePlanInput');
  if (!panel || !input || !meals || meals.length === 0) return;
  panel.style.display = '';
  input.value = 'Generating link…';
  try {
    const res = await fetch('/api/plans/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: { meals, date: currentDateStr } })
    });
    if (!res.ok) throw new Error('share failed');
    const data = await res.json();
    if (data.url) {
      input.value = data.url;
      const encoded = encodeURIComponent(data.url);
      const text = encodeURIComponent('Check out my AI meal plan — built with Mealzy, free: ');
      const tw = document.getElementById('shareTwitterBtn');
      const wa = document.getElementById('shareWhatsAppBtn');
      if (tw) tw.href = `https://twitter.com/intent/tweet?text=${text}&url=${encoded}`;
      if (wa) wa.href = `https://wa.me/?text=${text}${encoded}`;
    } else {
      input.value = window.location.origin + '/plan.html?id=' + (data.shareId || '');
    }
  } catch(e) {
    panel.style.display = 'none';
  }
}
