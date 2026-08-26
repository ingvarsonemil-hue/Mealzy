// Mealzy dashboard (1/4: today's meals, profile/auth, stats). See dashboard-panels.js for the boot sequence —
// everything here runs as global function declarations, not called until 'components:ready' fires.

// ── Icon strings (empty — icons removed) ─────────────────────────────────
const ICO = {
  flame: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3C12 3 10 7 9 9.5C8 8 8 6 9 4C6.5 6.5 6 9 6 11.5C6 15.8 8.7 19 12 19C15.3 19 18 15.8 18 11.5C18 9 17.5 7.5 16 6C16.5 7.5 16.5 9 16 10.5C15 8.5 14.5 6.5 12 3Z"/></svg>`,
  zap:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3L6.5 13H12.5L10 21.5C13 18 17.5 13.5 18 10.5H12.5L14 3Z"/></svg>`,
  grain: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4V21"/><path d="M12 8.5C11 7.5 9.5 7 9 5.5C10.5 5.5 12 7 12 8.5Z"/><path d="M12 13C11 12 9.5 11.5 9 10C10.5 10 12 11.5 12 13Z"/><path d="M12 8.5C13 7.5 14.5 7 15 5.5C13.5 5.5 12 7 12 8.5Z"/><path d="M12 13C13 12 14.5 11.5 15 10C13.5 10 12 11.5 12 13Z"/></svg>`,
  drop:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L5.5 13C5.5 17 8.5 20.5 12 20.5C15.5 20.5 18.5 17 18.5 13L12 3.5Z"/></svg>`,
  clock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4.5C8 4.5 4.5 8 4.5 12C4.5 16 8 19.5 12 19.5C16 19.5 19.5 16 19.5 12C19.5 8 16 4.5 12 4.5Z"/><path d="M12 8V12.5L15.5 14.5"/></svg>`,
  fire: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3C12 3 10 7 9 9.5C8 8 8 6 9 4C6.5 6.5 6 9 6 11.5C6 15.8 8.7 19 12 19C15.3 19 18 15.8 18 11.5C18 9 17.5 7.5 16 6C16.5 7.5 16.5 9 16 10.5C15 8.5 14.5 6.5 12 3Z"/></svg>`,
  medal: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="14" r="6.5"/><path d="M8.5 3.5L6 8H10L12 5L14 8H18L15.5 3.5C15 2.7 14.2 2.5 13.5 2.5H10.5C9.8 2.5 9 2.7 8.5 3.5Z"/></svg>`,
  starOutline: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L14.9 9.4L21.4 10.4L16.7 15L17.8 21.5L12 18.4L6.2 21.5L7.3 15L2.6 10.4L9.1 9.4L12 3.5Z"/></svg>`,
  starFilled: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L14.9 9.4L21.4 10.4L16.7 15L17.8 21.5L12 18.4L6.2 21.5L7.3 15L2.6 10.4L9.1 9.4L12 3.5Z"/></svg>`,
};

// Dark mode
if (localStorage.getItem('mealzy_theme') === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark');
}

// ── Cloud sync (server-side SQLite is source of truth) ──
async function cloudSave() {
  const plan = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
  try {
    const res = await fetch('/api/plans/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan })
    });
    if (res.ok) {
      console.log('cloudSave: plan saved successfully');
    } else {
      console.error('cloudSave: server returned', res.status);
    }
  } catch (err) {
    console.error('cloudSave: failed to save plan —', err.message);
  }
}
async function signOut() {
  try { await fetch('/api/auth/signout', { method: 'POST' }); } catch(e) {}
  localStorage.clear();
  window.location.href = 'login.html';
}
// ─────────────────────────

let profile = null;

// Always pulls the server's copy of the profile before meal generation so a stale localStorage
// "mealzy_profile" can never cause a false allergy_violation. Falls back to the cache if offline.
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

let serverUser = null;
let todayMeals = [];
// Local date (YYYY-MM-DD), not toISOString() (UTC) — must match server.js's getLocalDateString().
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const today = toLocalDateStr(new Date());
let favoriteKeys = new Set();

async function loadFavorites() {
  try {
    const res = await fetch('/api/favorites');
    if (res.ok) {
      const data = await res.json();
      favoriteKeys = new Set((data.favorites || []).map(f => f.mealKey));
    }
  } catch (e) { /* offline — favorites stay empty */ }
}

async function toggleFavorite(index) {
  const meal = todayMeals[index];
  if (!meal || !meal.name) return;
  const key = meal.name.trim().toLowerCase();
  const isFav = favoriteKeys.has(key);
  try {
    if (isFav) {
      const res = await fetch('/api/favorites/' + encodeURIComponent(key), { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      favoriteKeys.delete(key);
      showToast('Removed from favorites', 'success');
    } else {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal })
      });
      if (!res.ok) throw new Error('save failed');
      favoriteKeys.add(key);
      showToast('Added to favorites', 'success');
    }
  } catch (e) {
    showToast('Could not update favorites', 'error');
  }
  renderMeals();
}

async function init() {
  // Auth: server session is source of truth
  try {
    const meRes = await fetch('/api/auth/me');
    if (meRes.ok) {
      serverUser = await meRes.json();
      // Freshen localStorage cache from server
      localStorage.setItem('mealzy_user', JSON.stringify({ name: serverUser.name, email: serverUser.email }));
      if (serverUser.ref_code) localStorage.setItem('mealzy_ref_code', serverUser.ref_code);
      if (serverUser.pro) localStorage.setItem('mealzy_pro', 'true');
      else localStorage.removeItem('mealzy_pro');
      if (serverUser.profile) {
        // Server profile wins for synced fields (xp, level, streak); local-only fields (water, etc.) fill in gaps
        const localProfile = JSON.parse(localStorage.getItem('mealzy_profile') || '{}');
        const merged = { ...localProfile, ...serverUser.profile, name: serverUser.name };
        localStorage.setItem('mealzy_profile', JSON.stringify(merged));
      }
    } else {
      // Server says not authenticated — log out
      localStorage.removeItem('mealzy_user');
      window.location.href = 'login.html';
      return;
    }
  } catch(e) {
    // Server unreachable — fall back to localStorage cache
    const lsUser = localStorage.getItem('mealzy_user');
    if (!lsUser) { window.location.href = 'login.html'; return; }
    // Retry once after 2s — if it succeeds, refresh name + pro status
    setTimeout(async () => {
      try {
        const retryRes = await fetch('/api/auth/me');
        if (retryRes.ok) {
          serverUser = await retryRes.json();
          updateUserUI();
          checkProStatus();
        }
      } catch(_) { /* still offline — leave fallback as-is */ }
    }, 2000);
  }

  const profileData = localStorage.getItem('mealzy_profile');
  if (!profileData) { window.location.href = 'onboarding.html'; return; }
  profile = JSON.parse(profileData);

  updateUserUI();
  initAbTest();
  updateGreeting();
  renderMealsSkeleton();
  await loadTodayData();
  renderRecentPlans();
  checkRetentionBanners();
  initPwaBanner();
  applyNavTranslations();
  checkProStatus();
  checkWelcomeMessage();
  checkWeeklyReengagement();
  showGKeyTooltip();

  // Auto-generate from onboarding (Phase 4 — value in 15 seconds)
  const autoParams = new URLSearchParams(window.location.search);
  if (autoParams.get('autoGenerate') === '1') {
    window.history.replaceState({}, '', 'dashboard.html'); // clean the URL
    setTimeout(() => generateMealPlan(), 800); // slight delay so page renders first
  }
}

function updateUserUI() {
  const displayName = serverUser?.name || profile.name || 'User';
  const initial = displayName[0].toUpperCase();
  document.getElementById('userAvatar').textContent = initial;
  document.getElementById('mobileUserAvatar').textContent = initial;
  document.getElementById('userName').textContent = displayName;
  document.getElementById('mobileUserName').textContent = displayName;
  updateStreakBadge();
}

// profile.streak is the real daily streak (consecutive days generating a plan,
// tracked server-side in /api/xp/award) — distinct from the unused profile.weekStreak field.
function updateStreakBadge() {
  const badge = document.getElementById('streakBadge');
  if (!badge) return;
  const streak = profile?.streak || 0;
  if (streak > 0) {
    badge.textContent = `${streak} day${streak === 1 ? '' : 's'} streak`;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

function updateGreeting() {
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';

  const firstName = (profile.name || '').trim().split(' ')[0];
  document.getElementById('greeting').textContent = firstName ? `${greeting}, ${firstName}!` : `${greeting}!`;
  const streakBadge = document.getElementById('streakBadge');
  if (streakBadge) streakBadge.textContent = `${profile.streak || 1} day streak`;
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('greetingSub').textContent = dateStr;
  document.getElementById('macroDate').textContent = dateStr;
  const mealDateSub = document.getElementById('mealDateSub');
  if (mealDateSub) mealDateSub.textContent = dateStr;
}

/** Monday (YYYY-MM-DD) of the week containing the given Date — matches meal-planner.html. */
function getMondayStr(date) {
  const d = new Date(date);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toLocalDateStr(monday);
}

// True until the user's first-ever plan generation; see updateDashboardEmptyState in dashboard-panels.js.
let hasEverGeneratedPlan = false;

async function loadTodayData() {
  let plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
  const history = JSON.parse(localStorage.getItem('mealzy_history') || '[]');
  hasEverGeneratedPlan = history.length > 0 || Object.keys(plans).length > 0;

  if (!plans[today] || !plans[today].meals || plans[today].meals.length === 0) {
    // Nothing cached locally for today — pull the most recent saved plan (read-only, no credit spent).
    plans = await fetchActivePlanIfNeeded(plans);
  }

  if (plans[today] && plans[today].meals && plans[today].meals.length > 0) {
    // Preserve each meal's saved completed flag — this is a reload/navigation, not a fresh
    // generation, so a previously checked-off meal must not silently re-appear as unchecked.
    todayMeals = plans[today].meals.map(m => ({ ...m, completed: !!m.completed }));
  } else {
    todayMeals = [];
  }

  await loadFavorites();
  renderMeals();
  updateStats();
  updateDashboardEmptyState();
}

// Fetches the user's most recently saved plan (week or legacy single-day format) and merges it into
// localStorage.mealzy_meal_plans. Never triggers generation — GET /api/plans is read-only.
async function fetchActivePlanIfNeeded(plans) {
  try {
    const res = await fetch('/api/plans');
    if (!res.ok) return plans;
    const data = await res.json();
    if ((data.plans || []).length > 0) hasEverGeneratedPlan = true;
    const latest = (data.plans || [])[0];
    if (!latest) return plans;

    if (latest.weekStart && Array.isArray(latest.days)) {
      latest.days.forEach(d => {
        if (d.date && d.meals) plans[d.date] = { meals: d.meals, generatedAt: latest.savedAt || new Date().toISOString() };
      });
    } else if (latest.date && latest.plan && latest.plan.meals) {
      plans[latest.date] = { meals: latest.plan.meals, generatedAt: latest.savedAt || new Date().toISOString() };
    }

    localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));
  } catch (e) { /* offline or no saved plan — leave as-is */ }
  return plans;
}

// getSampleMeals() lives in dashboard-sample-meals.js (loaded before this file).

function renderMealsSkeleton() {
  const container = document.getElementById('mealsContainer');
  if (!container) return;
  const card = `
    <div class="meal-card-v2" aria-hidden="true">
      <div class="skeleton" style="height:24px;width:70%;margin-bottom:0.75rem;"></div>
      <div class="skeleton" style="height:16px;width:90%;margin-bottom:0.5rem;"></div>
      <div class="skeleton" style="height:8px;width:50%;"></div>
    </div>`;
  container.innerHTML = `<div class="grid-2" role="list" aria-busy="true" aria-label="Loading today's meals">${card}${card}</div>`;
}

function renderMeals() {
  const container = document.getElementById('mealsContainer');
  if (!container) return;
  if (!todayMeals || todayMeals.length === 0) {
    container.innerHTML = '';
    document.getElementById('emptyState').style.display = 'block';
    return;
  }
  document.getElementById('emptyState').style.display = 'none';

  const mealFallbacks = {
    breakfast: 'https://images.unsplash.com/photo-1484723091739-30a097e8f929?w=400&q=80',
    lunch: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&q=80',
    dinner: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80',
    snack: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80'
  };

  function getMealImageByType(meal) {
    return meal.image_url || mealFallbacks[meal.type] || mealFallbacks.lunch;
  }

  const mealOrder = ['breakfast', 'lunch', 'snack', 'dinner'];
  todayMeals.sort((a, b) => mealOrder.indexOf(a.type) - mealOrder.indexOf(b.type));
  container.innerHTML = `<div class="grid-2" role="list">${todayMeals.map((meal, i) => {
    const typeLabel = meal.type.charAt(0).toUpperCase() + meal.type.slice(1);
    const isFav = favoriteKeys.has((meal.name || '').trim().toLowerCase());
    return `
    <div class="meal-card-v2 mcv2-${meal.type} ${meal.completed ? 'completed' : ''}" id="mealCard${i}" role="listitem">
      <div class="mcv2-header">
        <span class="meal-type-badge ${meal.type}">${typeLabel}</span>
        <div class="mcv2-stats">
          <span class="mcv2-stat">${ICO.flame} ${meal.calories} kcal</span>
          <span class="mcv2-stat">${ICO.zap} ${meal.protein}g protein</span>
          ${meal.cookTime ? `<span class="mcv2-stat">${ICO.clock} ${meal.cookTime} min</span>` : ''}
        </div>
        <button type="button" onclick="toggleFavorite(${i})" aria-pressed="${isFav}" aria-label="${isFav ? 'Remove ' + escHtml(meal.name) + ' from favorites' : 'Add ' + escHtml(meal.name) + ' to favorites'}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}" style="background:none;border:none;padding:0.15rem;margin-left:0.4rem;cursor:pointer;display:inline-flex;align-items:center;color:${isFav ? 'var(--clr-primary)' : 'var(--clr-muted-fg)'};">${isFav ? ICO.starFilled : ICO.starOutline}</button>
      </div>
      <div class="mcv2-name">${escHtml(meal.name)}</div>
      <p class="mcv2-desc">${escHtml(meal.description || '')}</p>
      <div class="mcv2-actions">
        <label class="mcv2-check">
          <input type="checkbox" ${meal.completed ? 'checked' : ''} onchange="toggleMealDone(${i}, this.checked)" aria-label="Mark ${escHtml(meal.name)} as done">
          Done
        </label>
        <div class="mcv2-btns">
          <button class="btn btn-outline btn-sm" onclick="openRecipeModal(${i})">Recipe</button>
          <button class="btn btn-outline btn-sm" id="swapBtn${i}" onclick="swapMeal(${i})" aria-label="Swap meal">Swap</button>
        </div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function updateStats() {
  const completedMeals = todayMeals.filter(m => m.completed);
  const hasCompleted = completedMeals.length > 0;

  const totalCals = completedMeals.reduce((s, m) => s + (m.calories || 0), 0);
  const totalProtein = completedMeals.reduce((s, m) => s + (m.protein || 0), 0);
  const totalCarbs = completedMeals.reduce((s, m) => s + (m.carbs || 0), 0);
  const totalFat = completedMeals.reduce((s, m) => s + (m.fat || 0), 0);

  const goalCals = profile?.dailyCalories || 2000;
  const goalProtein = profile?.macros?.protein || 150;
  const goalCarbs = profile?.macros?.carbs || 200;
  const goalFat = profile?.macros?.fat || 67;

  const ringsGrid = document.querySelector('.rings-grid-v2');
  const macroEmpty = document.getElementById('macroEmptyState');
  if (ringsGrid) ringsGrid.style.display = hasCompleted ? '' : 'none';
  if (macroEmpty) {
    macroEmpty.style.display = hasCompleted ? 'none' : '';
    const targetsEl = document.getElementById('macroEmptyTargets');
    if (targetsEl) targetsEl.textContent = `${goalProtein}g protein · ${goalCarbs}g carbs · ${goalFat}g fat`;
  }

  const statCards = document.getElementById('statCards');
  const statCardsEmpty = document.getElementById('statCardsEmpty');
  if (statCards) statCards.style.display = hasCompleted ? '' : 'none';
  if (statCardsEmpty) {
    statCardsEmpty.style.display = hasCompleted ? 'none' : '';
    const goalsEl = document.getElementById('statCardsEmptyGoals');
    if (goalsEl) goalsEl.textContent = `Goals: ~${goalCals} kcal · ${goalProtein}g protein · ${goalCarbs}g carbs · ${goalFat}g fat`;
  }

  const statCalories = document.getElementById('statCalories');
  if (!statCalories) return; // stat card markup not present on this layout pass
  statCalories.textContent = totalCals;
  document.getElementById('statCaloriesSub').textContent = `of ${goalCals} kcal goal`;
  document.getElementById('caloriesProgress').style.width = Math.min(100, (totalCals / goalCals) * 100) + '%';

  document.getElementById('statProtein').textContent = totalProtein + 'g';
  document.getElementById('statProteinSub').textContent = `of ${goalProtein}g goal`;
  document.getElementById('proteinProgress').style.width = Math.min(100, (totalProtein / goalProtein) * 100) + '%';

  document.getElementById('statMealsDone').textContent = `${completedMeals.length}/${todayMeals.length}`;

  // Update rings
  updateRing('ringProtein', totalProtein, goalProtein, totalProtein + 'g');
  document.getElementById('ringProteinVal').textContent = totalProtein + 'g';
  document.getElementById('ringProteinPct').textContent = Math.round((totalProtein / goalProtein) * 100) + '%';
  document.getElementById('ringProteinTarget').textContent = `Goal: ${goalProtein}g`;

  updateRing('ringCarbs', totalCarbs, goalCarbs, totalCarbs + 'g');
  document.getElementById('ringCarbsVal').textContent = totalCarbs + 'g';
  document.getElementById('ringCarbsPct').textContent = Math.round((totalCarbs / goalCarbs) * 100) + '%';
  document.getElementById('ringCarbsTarget').textContent = `Goal: ${goalCarbs}g`;

  updateRing('ringFat', totalFat, goalFat, totalFat + 'g');
  document.getElementById('ringFatVal').textContent = totalFat + 'g';
  document.getElementById('ringFatPct').textContent = Math.round((totalFat / goalFat) * 100) + '%';
  document.getElementById('ringFatTarget').textContent = `Goal: ${goalFat}g`;

  // Save nutrition log
  const logs = JSON.parse(localStorage.getItem('mealzy_nutrition_logs') || '{}');
  logs[today] = { calories: totalCals, protein: totalProtein, carbs: totalCarbs, fat: totalFat, goalCals };
  localStorage.setItem('mealzy_nutrition_logs', JSON.stringify(logs));
}

function updateRing(id, value, goal, label) {
  const circumference = 2 * Math.PI * 40; // 251.2
  const pct = Math.min(1, value / goal);
  const offset = circumference - (pct * circumference);
  const el = document.getElementById(id);
  if (el) el.style.strokeDashoffset = offset;
}

function toggleMealDone(index, checked) {
  todayMeals[index].completed = checked;
  const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
  if (plans[today]) {
    plans[today].meals = todayMeals;
    localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));
  }
  renderMeals();
  updateStats();
  if (checked) showToast(`${todayMeals[index].name} marked as done`, 'success');
}

