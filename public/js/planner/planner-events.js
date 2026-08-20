// Event delegation for meal-card actions (swap / delete / favorite / done /
// expand details) inside #mealsContainer.
window.PlannerEvents = (function () {
  let bound = false;

  async function handleSwap(index) {
    const state = window.PlannerState;
    const meal = state.currentMeals[index];
    if (!meal) return;
    const card = document.querySelector(`.meal-card[data-meal-id="${index}"]`);
    const swapBtn = card && card.querySelector('[data-action="swap"]');
    if (swapBtn) { swapBtn.disabled = true; swapBtn.textContent = 'Swapping...'; }
    if (typeof window.refreshProfileFromServer === 'function') await window.refreshProfileFromServer();

    try {
      const { ok, data } = await window.PlannerAPI.generatePlan({
        profile: state.profile,
        date: state.currentDateStr,
        swap_meal_type: meal.type
      });
      if (!ok || !data.success) {
        showToast('Could not swap meal. Try again.', 'error');
        return;
      }
      state.currentMeals[index] = data.meal;
      window.PlannerAPI.saveDayMeals(state.currentDateStr, state.currentMeals);
      await window.PlannerRender.renderDay(state.currentMeals, state.profile);
    } catch (e) {
      showToast('Could not swap meal. Check your connection.', 'error');
      if (swapBtn) { swapBtn.disabled = false; swapBtn.textContent = 'Swap'; }
    }
  }

  async function handleDelete(index) {
    const state = window.PlannerState;
    if (!state.currentMeals[index]) return;
    state.currentMeals.splice(index, 1);
    window.PlannerAPI.saveDayMeals(state.currentDateStr, state.currentMeals);
    await window.PlannerRender.renderDay(state.currentMeals, state.profile);
    showToast('Meal removed', 'success');
  }

  function handleFavorite(index, btn) {
    const state = window.PlannerState;
    const meal = state.currentMeals[index];
    if (!meal) return;
    meal.favorite = !meal.favorite;
    window.PlannerAPI.saveDayMeals(state.currentDateStr, state.currentMeals);
    btn.classList.toggle('is-active', !!meal.favorite);
    btn.setAttribute('aria-pressed', String(!!meal.favorite));
  }

  function handleDone(index, btn, card) {
    const state = window.PlannerState;
    const meal = state.currentMeals[index];
    if (!meal) return;
    meal.completed = !meal.completed;
    window.PlannerAPI.saveDayMeals(state.currentDateStr, state.currentMeals);
    btn.classList.toggle('is-active', !!meal.completed);
    btn.setAttribute('aria-pressed', String(!!meal.completed));
    card.classList.toggle('is-done', !!meal.completed);
  }

  function handleToggleDetails(card) {
    const details = card.querySelector('.meal-card__details');
    if (details) details.hidden = !details.hidden;
  }

  function init() {
    const container = document.getElementById('mealsContainer');
    if (!container || bound) return;
    bound = true;
    container.addEventListener('click', (e) => {
      const card = e.target.closest('.meal-card');
      if (!card) return;
      const index = Number(card.dataset.mealId);

      if (e.target.closest('[data-action="swap"]')) { handleSwap(index); return; }
      if (e.target.closest('[data-action="delete"]')) { handleDelete(index); return; }

      const favBtn = e.target.closest('[data-action="favorite"]');
      if (favBtn) { handleFavorite(index, favBtn); return; }

      const doneBtn = e.target.closest('[data-action="done"]');
      if (doneBtn) { handleDone(index, doneBtn, card); return; }

      if (e.target.closest('[data-action="toggle-details"]')) handleToggleDetails(card);
    });
  }

  return { init };
})();
