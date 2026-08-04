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
    cal:   `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  };

  // ── Auth helpers (JWT cookie — server is source of truth) ──
  async function cloudLoad(uid) { /* no-op */ }
  async function cloudSave() { /* no-op — data saved server-side */ }
  async function signOut() {
    try { await fetch('/api/auth/signout', { method: 'POST' }); } catch(e) {}
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

  const mealFallbacks = {
    breakfast: 'https://images.unsplash.com/photo-1484723091739-30a097e8f929?w=400&q=80',
    lunch: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&q=80',
    dinner: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80',
    snack: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80'
  };
  function getMealImage(meal) {
    return meal.image_url || mealFallbacks[meal.type] || mealFallbacks.lunch;
  }

  async function init() {
    try {
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) {
        const u = await meRes.json();
        localStorage.setItem('mealzy_user', JSON.stringify({ name: u.name, email: u.email }));
        if (u.pro) localStorage.setItem('mealzy_pro', 'true'); else localStorage.removeItem('mealzy_pro');
        if (u.profile) { const lp = JSON.parse(localStorage.getItem('mealzy_profile')||'{}'); localStorage.setItem('mealzy_profile', JSON.stringify({ ...u.profile, ...lp })); }
      } else { localStorage.removeItem('mealzy_user'); window.location.href = 'login.html'; return; }
    } catch(e) { if (!localStorage.getItem('mealzy_user')) { window.location.href = 'login.html'; return; } }
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

    setDateStr();
    loadMeals();
    checkPlanLimitBanner();
    checkPendingRecipe();
  }

  function setDateStr() {
    currentDateStr = currentDate.toISOString().split('T')[0];
    const today = new Date();
    const diff = Math.round((currentDate - today) / 86400000);

    let label = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (diff === 0) label = 'Today — ' + label;
    else if (diff === 1) label = 'Tomorrow — ' + label;
    else if (diff === -1) label = 'Yesterday — ' + label;

    document.getElementById('dateDisplay').textContent = label;
  }

  function changeDate(delta) {
    currentDate.setDate(currentDate.getDate() + delta);
    setDateStr();
    loadMeals();
  }

  function loadMeals() {
    const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
    currentMeals = (plans[currentDateStr] && plans[currentDateStr].meals) ? plans[currentDateStr].meals : [];
    renderMeals();
    updateTotals();
  }

  function renderMeals() {
    const container = document.getElementById('mealsContainer');
    if (!container.dataset.delegated) {
      container.dataset.delegated = '1';
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="swap-meal"]');
        if (!btn) return;
        swapMeal(Number(btn.dataset.idx), btn.dataset.type);
      });
    }
    if (!currentMeals || currentMeals.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${ICO.cal}</div>
          <h3>No meals planned for this day</h3>
          <p>Generate an AI meal plan or navigate to a different day.</p>
          <button class="btn btn-primary" onclick="generateMealPlan()" style="display:inline-flex;align-items:center;gap:0.4rem;">
            ${ICO.star} Generate AI Plan
          </button>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="grid-2">${currentMeals.map((meal, i) => {
      const typeLabel = meal.type.charAt(0).toUpperCase() + meal.type.slice(1);
      return `
      <div class="meal-card-v2 mcv2-${meal.type} meal-card-animated ${meal.completed ? 'completed' : ''}">
        <div class="mcv2-header">
          <span class="meal-type-badge ${meal.type}">${typeLabel}</span>
          <div class="mcv2-stats">
            <span class="mcv2-stat">${ICO.flame} ${meal.calories} kcal</span>
            <span class="mcv2-stat">${ICO.zap} ${meal.protein}g protein</span>
            ${meal.cookTime ? `<span class="mcv2-stat">${ICO.clock} ${meal.cookTime} min</span>` : ''}
          </div>
        </div>
        <div class="mcv2-name">${escHtml(meal.name)}</div>
        <p class="mcv2-desc">${escHtml(meal.description || '')}</p>
        <div class="mcv2-actions">
          <label class="mcv2-check">
            <input type="checkbox" ${meal.completed ? 'checked' : ''} onchange="toggleMealDone(${i}, this.checked)" aria-label="Mark ${escHtml(meal.name)} as done" />
            Mark done
          </label>
          <div class="mcv2-btns">
            <span class="mcv2-stat text-muted">${ICO.grain} ${meal.carbs}g &nbsp;${ICO.drop} ${meal.fat}g</span>
            <button class="btn btn-outline btn-sm" id="swapBtn${i}" data-action="swap-meal" data-idx="${i}" data-type="${escHtml(meal.type)}" style="font-size:0.78rem;padding:0.25rem 0.65rem;min-height:32px;">Swap</button>
          </div>
        </div>
        <div class="mcv2-expand">
          <button class="expand-btn" onclick="toggleSection('ingredients${i}', this)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
            Ingredients (${(meal.ingredients || []).length})
          </button>
          <div class="expandable" id="ingredients${i}" style="max-height:0;transition:max-height 0.3s ease;">
            <ul class="ingredients-list">
              ${(meal.ingredients || []).map(ing =>
                `<li><span>${escHtml(ing.name)}</span><span class="text-muted">${escHtml(ing.amount)}${ing.cost ? ` &middot; $${ing.cost.toFixed(2)}` : ''}</span></li>`
              ).join('')}
            </ul>
          </div>
          <button class="expand-btn" style="margin-top:0.35rem;" onclick="toggleSection('instructions${i}', this)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
            Instructions (${(meal.instructions || []).length} steps)
          </button>
          <div class="expandable" id="instructions${i}" style="max-height:0;transition:max-height 0.3s ease;">
            <ol class="instructions-list">
              ${(meal.instructions || []).map(step => `<li>${escHtml(step)}</li>`).join('')}
            </ol>
          </div>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  function toggleSection(id, btn) {
    const el = document.getElementById(id);
    if (!el) return;
    const isOpen = el.style.maxHeight !== '0px' && el.style.maxHeight !== '';
    if (isOpen) {
      el.style.maxHeight = '0';
      btn.innerHTML = btn.innerHTML.replace('&#9660;', '&#9654;');
    } else {
      el.style.maxHeight = el.scrollHeight + 'px';
      btn.innerHTML = btn.innerHTML.replace('&#9654;', '&#9660;');
    }
  }

  function toggleMealDone(index, checked) {
    currentMeals[index].completed = checked;
    const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
    if (plans[currentDateStr]) {
      plans[currentDateStr].meals = currentMeals;
      localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));
    }
    renderMeals();
    updateTotals();
  }

  function updateTotals() {
    const meals = currentMeals || [];
    const totalCals = meals.reduce((s, m) => s + (m.calories || 0), 0);
    const totalProtein = meals.reduce((s, m) => s + (m.protein || 0), 0);
    const totalCarbs = meals.reduce((s, m) => s + (m.carbs || 0), 0);
    const totalCost = meals.reduce((s, m) => s + (m.estimatedCost || 0), 0);
    const currency = profile?.currency || 'USD';
    const sym = getCurrencySymbol(currency);

    document.getElementById('totalCals').textContent = totalCals;
    document.getElementById('totalProtein').textContent = totalProtein + 'g';
    document.getElementById('totalCarbs').textContent = totalCarbs + 'g';
    document.getElementById('totalCost').textContent = sym + totalCost.toFixed(2);
  }

  /** Monday (YYYY-MM-DD) of the week containing the given Date. */
  function getMondayStr(date) {
    const d = new Date(date);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return monday.toISOString().split('T')[0];
  }

  // Generates a full 7-day plan (21 meals + snacks) for the week containing
  // currentDate — 1 generation credit unlocks the whole week. Populates
  // localStorage per-day so the existing Day View / Week View rendering
  // (which reads mealzy_meal_plans by date) works unchanged.
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

    const weekStart = getMondayStr(currentDate);
    const existingPlans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
    const avoidMeals = isRegenerate
      ? Object.values(existingPlans).flatMap(p => (p && p.meals) ? p.meals.map(m => m.name) : []).filter(Boolean)
      : [];

    try {
      const res = await fetch('/api/generate-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          weekStart,
          avoid_meals: avoidMeals
        })
      });

      const data = await res.json();

      if (res.status === 402 && data.error === 'free_limit_reached') {
        renderMeals(); // restore previous meals or empty state
        showLimitModal();
        return;
      }

      if (!res.ok || !data.success) {
        showErrorState(data.error || 'Generation failed. Please try again.');
        return;
      }

      const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
      (data.days || []).forEach(d => {
        plans[d.date] = { meals: d.meals || [], generatedAt: new Date().toISOString() };
      });
      localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));

      currentMeals = (plans[currentDateStr] && plans[currentDateStr].meals) ? plans[currentDateStr].meals : [];
      renderMeals();
      updateTotals();
      checkPlanLimitBanner();
      if (currentView === 'week') renderWeekView();
      document.getElementById('sharePlanPanel').style.display = 'block';
      generateShareLink(currentMeals);

      try {
        await fetch('/api/xp/award', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate_plan' }) });
      } catch(e) {}

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
