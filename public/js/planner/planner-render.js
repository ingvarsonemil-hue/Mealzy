// Renders the day view: meal cards (or the empty state) into #mealsContainer,
// and the budget/calorie/macro totals into the stats bar.
window.PlannerRender = (function () {
  let mealCardTemplate = null;
  let emptyTemplate = null;

  async function getTemplate(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`PlannerRender: ${url} → ${res.status}`);
    return res.text();
  }

  function fillMealCard(template, meal, index) {
    const sym = getCurrencySymbol((meal.currency) || (window.PlannerState && window.PlannerState.profile?.currency) || 'USD');
    const typeLabel = (meal.type || '').charAt(0).toUpperCase() + (meal.type || '').slice(1);
    const ingredientsHtml = (meal.ingredients || [])
      .map(i => `<li>${escHtml(typeof i === 'string' ? i : (i.name || ''))}</li>`)
      .join('');
    const instructionsText = (meal.instructions || [])
      .map((step, i) => `${i + 1}. ${escHtml(step)}`)
      .join(' ');
    return template
      .replaceAll('__MEAL_ID__', String(index))
      .replaceAll('__TYPE__', escHtml(typeLabel))
      .replaceAll('__TITLE__', escHtml(meal.name || ''))
      .replaceAll('__DESC__', escHtml(meal.description || ''))
      .replaceAll('__COST__', sym + (meal.estimatedCost || 0).toFixed(2))
      .replaceAll('__CALORIES__', String(meal.calories || 0))
      .replaceAll('__PROTEIN__', String(meal.protein || 0))
      .replaceAll('__INGREDIENTS__', ingredientsHtml || '<li>No ingredients listed</li>')
      .replaceAll('__INSTRUCTIONS__', instructionsText || 'No instructions provided.')
      .replaceAll('__DONE_CARD_CLASS__', meal.completed ? ' is-done' : '')
      .replaceAll('__FAV_ACTIVE__', meal.favorite ? ' is-active' : '')
      .replaceAll('__DONE_ACTIVE__', meal.completed ? ' is-active' : '')
      .replaceAll('__FAV_PRESSED__', meal.favorite ? 'true' : 'false')
      .replaceAll('__DONE_PRESSED__', meal.completed ? 'true' : 'false');
  }

  async function renderDay(meals, profile) {
    const container = document.getElementById('mealsContainer');
    if (!container) return;

    if (!meals || meals.length === 0) {
      if (emptyTemplate === null) emptyTemplate = await getTemplate('/partials/planner/empty.html');
      container.innerHTML = emptyTemplate;
      renderStats([], profile);
      return;
    }

    if (mealCardTemplate === null) mealCardTemplate = await getTemplate('/partials/planner/meal-card.html');
    const cardsHtml = meals.map((meal, i) => fillMealCard(mealCardTemplate, meal, i)).join('');
    container.innerHTML = `<div class="grid-2">${cardsHtml}</div>`;
    renderStats(meals, profile);
  }

  function renderStats(meals, profile) {
    const sym = getCurrencySymbol(profile?.currency || 'USD');
    const totalCals = meals.reduce((s, m) => s + (m.calories || 0), 0);
    const totalProtein = meals.reduce((s, m) => s + (m.protein || 0), 0);
    const totalCarbs = meals.reduce((s, m) => s + (m.carbs || 0), 0);
    const totalCost = meals.reduce((s, m) => s + (m.estimatedCost || 0), 0);

    const calGoal = profile?.dailyCalories || 2000;
    const budgetGoal = (profile?.budget || 100) / 7;

    const budgetEl = document.getElementById('statsBudget');
    const calsEl = document.getElementById('statsCalories');
    const proteinEl = document.getElementById('totalProtein');
    const carbsEl = document.getElementById('totalCarbs');
    if (budgetEl) budgetEl.textContent = `${sym}${totalCost.toFixed(2)} / ${sym}${budgetGoal.toFixed(2)}`;
    if (calsEl) calsEl.textContent = `${totalCals} / ${calGoal}`;
    if (proteinEl) proteinEl.textContent = totalProtein + 'g';
    if (carbsEl) carbsEl.textContent = totalCarbs + 'g';
  }

  return { renderDay, renderStats };
})();
