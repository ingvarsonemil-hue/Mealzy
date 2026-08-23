// Orchestrator for the meal-planner day view (header, empty state, meal
// cards, stats bar). Waits for componentLoader's 'components:ready' event so
// the partials it targets (#dateNavigator, #mealsContainer, #totalsBar) exist
// before touching the DOM. Owns the day-view state that planner-render.js and
// planner-events.js need; the legacy inline script in meal-planner.html
// (week view, generation, modals, sharing) reads/writes the same object via
// window.PlannerState so both stay in sync instead of drifting apart.
window.PlannerState = window.PlannerState || {
  currentDate: new Date(),
  currentDateStr: '',
  currentMeals: [],
  profile: null
};

// Local calendar date (YYYY-MM-DD), not toISOString() (UTC) — must match
// dashboard-today.js's/groceries-sync.js's toLocalDateStr(), which is how
// plans are keyed everywhere else. A plain function declaration in a
// non-module script is global, so planner-page-init.js and
// planner-week-view.js (loaded after this file — see meal-planner.html)
// reuse this same one instead of each doing their own UTC date math.
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

(function () {
  function setDateStr() {
    const state = window.PlannerState;
    state.currentDateStr = toLocalDateStr(state.currentDate);
    const today = new Date();
    const diff = Math.round((state.currentDate - today) / 86400000);

    let label = state.currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (diff === 0) label = 'Today — ' + label;
    else if (diff === 1) label = 'Tomorrow — ' + label;
    else if (diff === -1) label = 'Yesterday — ' + label;

    const el = document.getElementById('dateDisplay');
    if (el) el.textContent = label;
  }

  async function renderDayView() {
    const state = window.PlannerState;
    state.currentMeals = window.PlannerAPI.getDayMeals(state.currentDateStr);
    if (state.currentMeals.length === 0) {
      // Nothing cached locally for this day — check the server before
      // rendering empty (read-only, no credit spent; see planner-api.js).
      const serverMeals = await window.PlannerAPI.fetchServerPlanIfNeeded(state.currentDateStr);
      if (serverMeals) state.currentMeals = serverMeals;
    }
    await window.PlannerRender.renderDay(state.currentMeals, state.profile);
  }
  window.PlannerRenderDayView = renderDayView;

  function changeDate(delta) {
    const state = window.PlannerState;
    state.currentDate.setDate(state.currentDate.getDate() + delta);
    setDateStr();
    renderDayView();
  }
  window.changeDate = changeDate;

  // Re-syncs the date label + day-view render after currentDate is set
  // directly (e.g. jumping to a day from Week View).
  window.PlannerRefreshDate = async function () {
    setDateStr();
    await renderDayView();
  };

  document.addEventListener('components:ready', async () => {
    const state = window.PlannerState;
    if (!state.profile) {
      const profileData = localStorage.getItem('mealzy_profile');
      if (profileData) state.profile = JSON.parse(profileData);
    }
    const householdSelect = document.getElementById('householdSizeSelect');
    if (householdSelect) {
      householdSelect.value = String((state.profile && state.profile.householdSize) || getHouseholdSize());
    }
    setDateStr();
    await renderDayView();
    window.PlannerEvents && window.PlannerEvents.init();
  });
})();
