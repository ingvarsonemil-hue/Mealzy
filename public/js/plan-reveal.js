// "Your Week Is Ready" reveal — shown once, right after a successful
// AUTHENTICATED full-week generation (Dashboard or Meal Planner). Every
// number/meal/image it renders comes straight from the /api/generate-meal
// response already on the page; this file adds zero new calculation.
//
// Split in two on purpose: buildRevealModel() is pure (no DOM, no window),
// so it can run inside a plain Node VM in tests exactly like the shipped
// source — see tests/plan-reveal.test.js. render()/show() do the DOM work.
window.PlanReveal = (function () {
  'use strict';

  // Same per-meal-type stock fallbacks already shown on the dashboard today
  // (dashboard-today.js) when the AI didn't return a real image_url — reused
  // here so the reveal never shows a fabricated/generic marketing photo that
  // isn't also what the user sees inside the app itself.
  var MEAL_FALLBACK_IMAGES = {
    breakfast: 'https://images.unsplash.com/photo-1484723091739-30a097e8f929?w=400&q=80',
    lunch: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&q=80',
    dinner: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80',
    snack: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80'
  };

  function getMealImage(meal) {
    return (meal && meal.image_url) || MEAL_FALLBACK_IMAGES[meal && meal.type] || MEAL_FALLBACK_IMAGES.lunch;
  }

  // certified/estimated_with_unknowns/over_budget/not_enforced — see
  // budgetEngine.js BUDGET_STATUS. Anything else (including missing) fails
  // neutral: no caveat text, no implied certification either way.
  function budgetCaveat(status) {
    if (status === 'estimated_with_unknowns') return 'Some ingredient prices estimated';
    if (status === 'over_budget') return 'Slightly over your grocery budget';
    if (status === 'not_enforced') return 'Not budget-checked for this currency';
    return null;
  }

  function pickPreviewMeals(allMeals, count) {
    var seen = {};
    var withImage = [];
    var withoutImage = [];
    for (var i = 0; i < allMeals.length; i++) {
      var m = allMeals[i];
      var name = m && m.name;
      if (!name || seen[name]) continue;
      seen[name] = true;
      (m.image_url ? withImage : withoutImage).push(m);
    }
    return withImage.concat(withoutImage).slice(0, count).map(function (m) {
      return { name: m.name, image: getMealImage(m) };
    });
  }

  /** Pure. Returns null when the response doesn't qualify for a reveal —
   * never invents a substitute number in that case, the caller just skips
   * the reveal and existing toast/error behavior is unaffected. */
  function buildRevealModel(data) {
    if (!data || data.success !== true) return null;
    if (!data.planId) return null; // week-mode only saves (and returns) a planId when a session exists
    if (!Array.isArray(data.days) || data.days.length === 0) return null;

    var wt = data.weeklyTotals;
    if (!wt || typeof wt.avgCalories !== 'number' || typeof wt.avgProtein !== 'number' || typeof wt.totalCost !== 'number') return null;

    var allMeals = [];
    for (var i = 0; i < data.days.length; i++) {
      var meals = data.days[i] && data.days[i].meals;
      if (Array.isArray(meals)) allMeals = allMeals.concat(meals);
    }
    if (allMeals.length === 0) return null;

    return {
      planId: data.planId,
      weekStart: data.weekStart || null,
      days: data.days.length,
      totalMeals: allMeals.length,
      calories: Math.round(wt.avgCalories),
      protein: Math.round(wt.avgProtein),
      cost: wt.totalCost,
      budgetCaveat: budgetCaveat(wt.budgetStatus),
      preview: pickPreviewMeals(allMeals, 4)
    };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function track(event) {
    if (typeof window.mealzyTrack === 'function') {
      // source = which page triggered it. No plan/meal/macro/budget/user data.
      window.mealzyTrack(event, { source: document.body.getAttribute('data-plan-reveal-source') || 'unknown' });
    }
  }

  var shownPlanIds = {};
  var openEl = null;

  function dismiss() {
    if (!openEl) return;
    track('plan_reveal_dismissed');
    document.removeEventListener('keydown', onKeydown);
    openEl.remove();
    openEl = null;
    document.body.classList.remove('plan-reveal-open');
  }

  function onKeydown(e) {
    if (e.key === 'Escape') dismiss();
  }

  function goToPlan() {
    track('plan_reveal_cta_view_plan');
    if (/meal-planner\.html/.test(window.location.pathname)) { dismiss(); return; }
    window.location.href = 'meal-planner.html';
  }

  function goToGroceries() {
    track('plan_reveal_cta_view_groceries');
    window.location.href = 'grocery-list.html';
  }

  function render(model, source) {
    document.body.setAttribute('data-plan-reveal-source', source || 'unknown');

    var previewHtml = model.preview.map(function (m, i) {
      return (
        '<div class="plan-reveal-thumb' + (i === 0 ? ' plan-reveal-thumb-main' : '') + '">' +
          '<img src="' + esc(m.image) + '" alt="" loading="lazy">' +
          '<span class="plan-reveal-thumb-name">' + esc(m.name) + '</span>' +
        '</div>'
      );
    }).join('');

    var caveatHtml = model.budgetCaveat
      ? '<div class="plan-reveal-caveat">' + esc(model.budgetCaveat) + '</div>'
      : '';

    var el = document.createElement('div');
    el.className = 'plan-reveal-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Your week is ready');
    el.innerHTML =
      '<div class="plan-reveal-backdrop" data-action="dismiss"></div>' +
      '<div class="plan-reveal-card">' +
        '<button type="button" class="plan-reveal-close" data-action="dismiss" aria-label="Close">&times;</button>' +
        '<div class="plan-reveal-hero">' + previewHtml + '</div>' +
        '<div class="plan-reveal-body">' +
          '<p class="plan-reveal-eyebrow">Plan generated</p>' +
          '<h2 class="plan-reveal-headline">Your week is ready.</h2>' +
          '<div class="plan-reveal-stats">' +
            '<div class="plan-reveal-stat">' +
              '<span class="plan-reveal-stat-value">' + esc(model.calories.toLocaleString()) + '</span>' +
              '<span class="plan-reveal-stat-label">calories / day</span>' +
            '</div>' +
            '<div class="plan-reveal-stat">' +
              '<span class="plan-reveal-stat-value">' + esc(model.protein) + 'g</span>' +
              '<span class="plan-reveal-stat-label">protein / day</span>' +
            '</div>' +
            '<div class="plan-reveal-stat">' +
              '<span class="plan-reveal-stat-value">~$' + esc(model.cost.toFixed(0)) + '</span>' +
              '<span class="plan-reveal-stat-label">est. groceries</span>' +
            '</div>' +
          '</div>' +
          caveatHtml +
          '<p class="plan-reveal-summary">' + model.days + ' days &middot; ' + model.totalMeals + ' meals &middot; 1 grocery list</p>' +
          '<div class="plan-reveal-actions">' +
            '<button type="button" class="btn btn-primary plan-reveal-cta-primary" data-action="view-plan">View my meal plan</button>' +
            '<button type="button" class="plan-reveal-cta-secondary" data-action="view-groceries">View grocery list</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    el.addEventListener('click', function (e) {
      var action = e.target.closest('[data-action]');
      if (!action) return;
      var kind = action.getAttribute('data-action');
      if (kind === 'dismiss') dismiss();
      else if (kind === 'view-plan') goToPlan();
      else if (kind === 'view-groceries') goToGroceries();
    });

    document.body.appendChild(el);
    document.body.classList.add('plan-reveal-open');
    document.addEventListener('keydown', onKeydown);
    openEl = el;
    track('plan_reveal_viewed');
  }

  /** source: 'dashboard' | 'meal-planner'. Returns true if it actually
   * rendered. Never shows twice for the same generation (same planId), and
   * never stacks a second overlay while one is already open. */
  function show(data, source) {
    var model = buildRevealModel(data);
    if (!model) return false;
    if (shownPlanIds[model.planId]) return false;
    if (openEl) return false;
    shownPlanIds[model.planId] = true;
    render(model, source);
    return true;
  }

  return { show: show, buildRevealModel: buildRevealModel, dismiss: dismiss };
})();
