// Meal Planner: pending-recipe banner, Day/Week view toggle, Week View
// rendering, sharing, mobile sidebar, and the modal dismiss wiring. Second
// half of the inline <script> that used to live in meal-planner.html — see
// planner-page-init.js for the auth/generation half.
//
// DOM lookups against nav.html / modals.html (now component-loaded) are
// gated behind 'components:ready' at the bottom of this file.

// ── PENDING RECIPE (from Recipes panel → "Use in plan") ──────────────────
let _pendingRecipe = null;

function checkPendingRecipe() {
  const raw = localStorage.getItem('mealzy_pending_recipe');
  if (!raw) return;
  try {
    _pendingRecipe = JSON.parse(raw);
  } catch { return; } finally {
    localStorage.removeItem('mealzy_pending_recipe');
  }
  const banner = document.getElementById('pendingRecipeBanner');
  const nameEl = document.getElementById('pendingRecipeName');
  if (!banner || !nameEl) return;
  nameEl.textContent = _pendingRecipe.name || 'this recipe';
  banner.style.display = 'flex';
}

function addPendingRecipeToDay() {
  if (!_pendingRecipe) return;
  const meal = {
    type:          'dinner',
    name:          _pendingRecipe.name || 'Imported Recipe',
    description:   _pendingRecipe.servings ? `${_pendingRecipe.servings} servings` : '',
    calories:      _pendingRecipe.estimatedCalories  || 0,
    protein:       _pendingRecipe.estimatedProtein   || 0,
    carbs:         0,
    fat:           0,
    cookTime:      30,
    estimatedCost: 0,
    ingredients:   _pendingRecipe.ingredients  || [],
    instructions:  _pendingRecipe.instructions || [],
    completed:     false
  };
  const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
  if (!plans[currentDateStr]) plans[currentDateStr] = { meals: [] };
  if (!plans[currentDateStr].meals) plans[currentDateStr].meals = [];
  plans[currentDateStr].meals.push(meal);
  localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));
  _pendingRecipe = null;
  dismissPendingRecipe();
  window.PlannerRenderDayView();
  showToast(`"${meal.name}" added to today's plan`, 'success');
}

function dismissPendingRecipe() {
  _pendingRecipe = null;
  const banner = document.getElementById('pendingRecipeBanner');
  if (banner) banner.style.display = 'none';
}

function checkPlanLimitBanner() {
  const isPro = localStorage.getItem('mealzy_pro') === 'true';
  if (isPro) return;
  const count = parseInt(localStorage.getItem('mealzy_plan_count_month') || '0');
  const banner = document.getElementById('planLimitBanner');
  if (banner && count >= 2) banner.style.display = 'flex';
}

function copySharePlanLink() {
  const input = document.getElementById('sharePlanInput');
  if (!input) return;
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Plan link copied!', 'success');
  }).catch(() => {
    input.select();
    document.execCommand('copy');
    showToast('Link copied!', 'success');
  });
}

function showToast(msg, type = '') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// === VIEW TOGGLE ===
function setView(view) {
  currentView = view;
  document.getElementById('dayViewBtn').classList.toggle('active', view === 'day');
  document.getElementById('weekViewBtn').classList.toggle('active', view === 'week');
  document.getElementById('dayViewBtn').setAttribute('aria-selected', String(view === 'day'));
  document.getElementById('weekViewBtn').setAttribute('aria-selected', String(view === 'week'));
  document.getElementById('dateNavigator').style.display = view === 'day' ? 'flex' : 'none';
  document.getElementById('mealsContainer').style.display = view === 'day' ? 'block' : 'none';
  document.getElementById('weekViewContainer').style.display = view === 'week' ? 'block' : 'none';
  document.getElementById('totalsBar').style.display = view === 'day' ? 'grid' : 'none';
  if (view === 'week') renderWeekView();
}

// Storage for week meal data so popup can reference by index without JSON-in-HTML
let _weekMeals = {};

function renderWeekView() {
  const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
  const totalDaysWithMeals = Object.values(plans).filter(p => p && p.meals && p.meals.length > 0).length;
  const container = document.getElementById('weekViewContainer');
  if (!container.dataset.delegated) {
    container.dataset.delegated = '1';
    container.addEventListener('click', (e) => {
      const popupBtn = e.target.closest('[data-action="show-meal-popup"]');
      if (popupBtn) {
        showWeekMealPopup(e, popupBtn.dataset.date, Number(popupBtn.dataset.idx));
        return;
      }
      const genBtn = e.target.closest('[data-action="generate-day"]');
      if (genBtn) {
        switchToDayAndGenerate(genBtn.dataset.date);
        return;
      }
      const dayCol = e.target.closest('[data-action="switch-day"]');
      if (dayCol) {
        switchToDay(dayCol.dataset.date);
      }
    });
  }
  const todayStr = new Date().toISOString().split('T')[0];
  const goalCals = profile?.dailyCalories || 2000;
  const days = [];
  const ref = new Date(currentDate);
  const dow = ref.getDay();
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - ((dow + 6) % 7));

  _weekMeals = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const sym = getCurrencySymbol(profile?.currency || 'USD');

  const cols = days.map((d, idx) => {
    const dateStr = d.toISOString().split('T')[0];
    const plan = plans[dateStr];
    const meals = plan && plan.meals ? plan.meals : [];
    const isToday = dateStr === todayStr;
    _weekMeals[dateStr] = meals;

    const totalCals = meals.reduce((s, m) => s + (m.calories || 0), 0);
    const calPct = goalCals > 0 ? Math.min(100, Math.round((totalCals / goalCals) * 100)) : 0;
    const withinRange = calPct >= 90 && calPct <= 110;
    const barColor = meals.length === 0 ? 'var(--clr-border)' : withinRange ? '#22c55e' : '#f59e0b';
    const calBar = meals.length > 0 ? `
      <div style="margin-top:auto;padding-top:0.5rem;">
        <div style="font-size:0.68rem;color:var(--clr-muted-fg);text-align:center;margin-bottom:0.2rem;">${totalCals} kcal</div>
        <div style="height:4px;background:var(--clr-border);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${calPct}%;background:${barColor};border-radius:2px;transition:width 0.3s;"></div>
        </div>
      </div>` : '';

    const mealChips = meals.map((m, mi) =>
      `<span class="week-meal-chip ${m.type}" title="${escHtml(m.name)}"
        data-action="show-meal-popup" data-date="${dateStr}" data-idx="${mi}"
        style="cursor:pointer;">${escHtml(m.name)}</span>`
    ).join('');

    const generateBtn = meals.length === 0
      ? `<button class="week-generate-btn" data-action="generate-day" data-date="${dateStr}">+ Generate</button>`
      : '';

    return `
      <div class="week-day-col${isToday ? ' today' : ''}" data-action="switch-day" data-date="${dateStr}"
        style="display:flex;flex-direction:column;min-height:120px;">
        <div class="week-day-label">${dayNames[idx]}</div>
        <div class="week-day-date">${d.getDate()}</div>
        ${mealChips}
        ${generateBtn}
        ${calBar}
      </div>`;
  });

  container.innerHTML = `<div class="week-grid">${cols.join('')}</div>`;
}

function showWeekMealPopup(event, dateStr, idx) {
  const meal = (_weekMeals[dateStr] || [])[idx];
  if (!meal) return;
  const popup = document.getElementById('weekMealPopup');
  const sym = getCurrencySymbol(profile?.currency || 'USD');
  document.getElementById('weekPopupType').textContent = meal.type.charAt(0).toUpperCase() + meal.type.slice(1);
  document.getElementById('weekPopupName').textContent = meal.name;
  document.getElementById('weekPopupMeta').innerHTML = [
    meal.calories ? `${meal.calories} kcal` : null,
    meal.protein  ? `${meal.protein}g protein` : null,
    meal.estimatedCost ? `~${sym}${meal.estimatedCost.toFixed(2)}` : null,
    meal.cookTime ? `${meal.cookTime} min` : null,
  ].filter(Boolean).map(s => `<span>${s}</span>`).join('');

  popup.style.display = 'block';
  // Position near the click, keeping inside viewport
  const vw = window.innerWidth, vh = window.innerHeight;
  let x = event.clientX + 8, y = event.clientY + 8;
  popup.style.left = x + 'px';
  popup.style.top  = y + 'px';
  popup.style.right = 'auto';
  // Clamp after render
  requestAnimationFrame(() => {
    const r = popup.getBoundingClientRect();
    if (r.right > vw - 8)  popup.style.left = Math.max(8, vw - r.width - 8) + 'px';
    if (r.bottom > vh - 8) popup.style.top  = Math.max(8, event.clientY - r.height - 8) + 'px';
  });
}

function closeWeekMealPopup() {
  document.getElementById('weekMealPopup').style.display = 'none';
}

function switchToDay(dateStr) {
  currentDate = new Date(dateStr + 'T12:00:00');
  setView('day');
  window.PlannerRefreshDate();
}

function switchToDayAndGenerate(dateStr) {
  currentDate = new Date(dateStr + 'T12:00:00');
  setView('day');
  window.PlannerRefreshDate().then(() => generateMealPlan());
}

function dismissDisclaimer() {
  localStorage.setItem('mealzy_disclaimer_dismissed', '1');
  const el = document.getElementById('healthDisclaimer');
  if (el) el.style.display = 'none';
}

// Close week meal popup on outside click
document.addEventListener('click', (e) => {
  const popup = document.getElementById('weekMealPopup');
  if (popup && popup.style.display !== 'none' && !popup.contains(e.target)) {
    popup.style.display = 'none';
  }
});

// Mobile menu
function openMobileSidebar() {
  const overlay = document.getElementById('mobileSidebarOverlay');
  const btn = document.getElementById('mobileMenuBtn');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  btn.setAttribute('aria-expanded', 'true');
  const focusable = overlay.querySelector('.sidebar').querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])');
  if (focusable[0]) focusable[0].focus();
}
function closeMobileSidebar() {
  const overlay = document.getElementById('mobileSidebarOverlay');
  const btn = document.getElementById('mobileMenuBtn');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.focus();
}

// Everything below targets DOM that now lives in component-loaded partials
// (nav.html, banners.html, modals.html) — wait for componentLoader's
// 'components:ready' before wiring it up.
document.addEventListener('components:ready', () => {
  // Hide disclaimer immediately if already dismissed
  if (localStorage.getItem('mealzy_disclaimer_dismissed') === '1') {
    const el = document.getElementById('healthDisclaimer');
    if (el) el.style.display = 'none';
  }

  document.getElementById('mobileMenuBtn').addEventListener('click', openMobileSidebar);
  document.getElementById('mobileSidebarOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('mobileSidebarOverlay')) closeMobileSidebar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('mobileSidebarOverlay').classList.contains('open')) closeMobileSidebar();
  });
  document.getElementById('mobileSidebarOverlay').addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const overlay = document.getElementById('mobileSidebarOverlay');
    if (!overlay.classList.contains('open')) return;
    const focusable = overlay.querySelector('.sidebar').querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Close limit modal on backdrop click
  document.getElementById('limitModal').addEventListener('click', function(e) {
    if (e.target === this) closeLimitModal();
  });

  // Focus trap and Escape key for limit modal
  document.getElementById('limitModal').addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeLimitModal(); return; }
    if (e.key !== 'Tab') return;
    const focusable = this.querySelectorAll('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Close custom meal modal on backdrop click or Escape
  document.getElementById('customMealModal').addEventListener('click', function(e) {
    if (e.target === this) closeCustomMealModal();
  });
  document.getElementById('customMealModal').addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeCustomMealModal();
  });
}, { once: true });
