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

  // Truthfulness rule: the reveal only ever shows a photo that the meal
  // generation itself attached to this exact meal (meal.image_url). There is
  // deliberately NO per-type stock fallback — a generic breakfast/lunch photo
  // next to a specific dish name makes the screen look fabricated. Meals with
  // no image_url render a polished no-photo card instead (see render()).
  function validMealImage(meal) {
    var url = meal && meal.image_url;
    return (typeof url === 'string' && /^https?:\/\//i.test(url)) ? url : null;
  }

  var MEAL_TYPES = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

  function mealTypeLabel(meal) {
    return (meal && MEAL_TYPES[meal.type]) || null;
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
      (validMealImage(m) ? withImage : withoutImage).push(m);
    }
    // Real photos first (strongest hero), no-photo cards after — never a
    // stand-in image for a meal that didn't come with one.
    return withImage.concat(withoutImage).slice(0, count).map(function (m) {
      return { name: m.name, type: mealTypeLabel(m), image: validMealImage(m) };
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

  // Set by show(); default {} keeps production behavior identical. Only the
  // internal preview page (plan-reveal-preview.html) passes anything here:
  //   { analytics: false }      -> track() becomes a no-op
  //   { disableNavigation: true } -> CTAs just dismiss, never navigate to a
  //                                  real page as if the fixture plan existed
  var revealOpts = {};

  function track(event) {
    if (revealOpts.analytics === false) return;
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
    revealOpts = {};
    document.body.classList.remove('plan-reveal-open');
  }

  function onKeydown(e) {
    if (e.key === 'Escape') dismiss();
  }

  function goToPlan() {
    track('plan_reveal_cta_view_plan');
    if (revealOpts.disableNavigation) { dismiss(); return; }
    if (/meal-planner\.html/.test(window.location.pathname)) { dismiss(); return; }
    window.location.href = 'meal-planner.html';
  }

  function goToGroceries() {
    track('plan_reveal_cta_view_groceries');
    if (revealOpts.disableNavigation) { dismiss(); return; }
    window.location.href = 'grocery-list.html';
  }

  function render(model, source) {
    document.body.setAttribute('data-plan-reveal-source', source || 'unknown');

    var previewHtml = model.preview.map(function (m, i) {
      var cls = 'plan-reveal-thumb' + (i === 0 ? ' plan-reveal-thumb-main' : '');
      if (m.image) {
        return (
          '<div class="' + cls + '">' +
            '<img src="' + esc(m.image) + '" alt="" loading="lazy">' +
            '<span class="plan-reveal-thumb-name">' + esc(m.name) + '</span>' +
          '</div>'
        );
      }
      // No photo for this meal — an intentional token-styled card, never a
      // generic food photo that doesn't depict this dish.
      var typeHtml = m.type
        ? '<span class="plan-reveal-thumb-type">' + esc(m.type) + '</span>'
        : '';
      return (
        '<div class="' + cls + ' plan-reveal-thumb-noimg">' +
          '<span class="plan-reveal-thumb-mark" aria-hidden="true"></span>' +
          typeHtml +
          '<span class="plan-reveal-thumb-title">' + esc(m.name) + '</span>' +
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
  function show(data, source, opts) {
    var model = buildRevealModel(data);
    if (!model) return false;
    if (shownPlanIds[model.planId]) return false;
    if (openEl) return false;
    shownPlanIds[model.planId] = true;
    revealOpts = opts || {};
    render(model, source);
    return true;
  }

  return { show: show, buildRevealModel: buildRevealModel, dismiss: dismiss };
})();
