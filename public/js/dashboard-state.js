  // ── Icon strings (empty — icons removed) ─────────────────────────────────
  const ICO = {
    flame: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3C12 3 10 7 9 9.5C8 8 8 6 9 4C6.5 6.5 6 9 6 11.5C6 15.8 8.7 19 12 19C15.3 19 18 15.8 18 11.5C18 9 17.5 7.5 16 6C16.5 7.5 16.5 9 16 10.5C15 8.5 14.5 6.5 12 3Z"/></svg>`,
    zap:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3L6.5 13H12.5L10 21.5C13 18 17.5 13.5 18 10.5H12.5L14 3Z"/></svg>`,
    grain: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4V21"/><path d="M12 8.5C11 7.5 9.5 7 9 5.5C10.5 5.5 12 7 12 8.5Z"/><path d="M12 13C11 12 9.5 11.5 9 10C10.5 10 12 11.5 12 13Z"/><path d="M12 8.5C13 7.5 14.5 7 15 5.5C13.5 5.5 12 7 12 8.5Z"/><path d="M12 13C13 12 14.5 11.5 15 10C13.5 10 12 11.5 12 13Z"/></svg>`,
    drop:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L5.5 13C5.5 17 8.5 20.5 12 20.5C15.5 20.5 18.5 17 18.5 13L12 3.5Z"/></svg>`,
    clock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4.5C8 4.5 4.5 8 4.5 12C4.5 16 8 19.5 12 19.5C16 19.5 19.5 16 19.5 12C19.5 8 16 4.5 12 4.5Z"/><path d="M12 8V12.5L15.5 14.5"/></svg>`,
    thumbUp: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 22V11L12 3L13.5 3.5C14 3.7 14.5 4.3 14.5 5V9H20C20.8 9 21.5 9.7 21.5 10.5L20 18C19.8 19 19 19.5 18.2 19.5H7"/><path d="M7 11H3.5C3 11 2.5 11.5 2.5 12V21.5C2.5 22 3 22.5 3.5 22.5H7"/></svg>`,
    thumbDn: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2V13L12 21L10.5 20.5C10 20.3 9.5 19.7 9.5 19V15H4C3.2 15 2.5 14.3 2.5 13.5L4 6C4.2 5 5 4.5 5.8 4.5H17"/><path d="M17 13H20.5C21 13 21.5 12.5 21.5 12V2.5C21.5 2 21 1.5 20.5 1.5H17"/></svg>`,
    fire: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3C12 3 10 7 9 9.5C8 8 8 6 9 4C6.5 6.5 6 9 6 11.5C6 15.8 8.7 19 12 19C15.3 19 18 15.8 18 11.5C18 9 17.5 7.5 16 6C16.5 7.5 16.5 9 16 10.5C15 8.5 14.5 6.5 12 3Z"/></svg>`,
    medal: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="14" r="6.5"/><path d="M8.5 3.5L6 8H10L12 5L14 8H18L15.5 3.5C15 2.7 14.2 2.5 13.5 2.5H10.5C9.8 2.5 9 2.7 8.5 3.5Z"/></svg>`,
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

  let serverUser = null;
  let todayMeals = [];
  let waterCount = 0;
  const today = new Date().toISOString().split('T')[0];
  let calorieChart = null;

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
    await loadTodayData();
    renderRecentPlans();
    checkRetentionBanners();
    renderWaterGlasses();
    buildCalorieHistoryChart();
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

    document.getElementById('greeting').textContent = `${greeting}, ${profile.name || 'there'}!`;
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
    return monday.toISOString().split('T')[0];
  }

  async function loadTodayData() {
    const water = JSON.parse(localStorage.getItem('mealzy_water') || '{}');
    waterCount = water[today] || 0;

    let plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');

    if (!plans[today] || !plans[today].meals || plans[today].meals.length === 0) {
      // Nothing cached locally for today — pull the user's most recent saved
      // plan from the server (read-only, no credit spent) instead of leaving
      // the widget empty or auto-generating a new one.
      plans = await fetchActivePlanIfNeeded(plans);
    }

    if (plans[today] && plans[today].meals && plans[today].meals.length > 0) {
      todayMeals = plans[today].meals.map(m => ({ ...m, completed: false }));
    } else {
      todayMeals = [];
    }

    renderMeals();
    updateStats();
  }

  // Fetches the user's most recently saved plan (week or legacy single-day
  // format) and merges it into localStorage.mealzy_meal_plans. Never triggers
  // generation — GET /api/plans is read-only, so no credit is consumed.
  async function fetchActivePlanIfNeeded(plans) {
    try {
      const res = await fetch('/api/plans');
      if (!res.ok) return plans;
      const data = await res.json();
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

  function getSampleMeals() {
    return [
      {
        type: 'breakfast', name: 'Greek Yogurt Parfait', completed: false,
        description: 'Creamy Greek yogurt layered with fresh berries and crunchy granola',
        calories: 380, protein: 22, carbs: 42, fat: 8, cookTime: 5, estimatedCost: 3.50,
        ingredients: [
          { name: 'Greek yogurt', amount: '200g', cost: 1.80 },
          { name: 'Mixed berries', amount: '100g', cost: 1.20 },
          { name: 'Granola', amount: '50g', cost: 0.50 }
        ],
        instructions: [
          'Spoon Greek yogurt into a bowl or glass.',
          'Layer with fresh mixed berries.',
          'Top with granola and a drizzle of honey.',
          'Serve immediately and enjoy!'
        ]
      },
      {
        type: 'lunch', name: 'Grilled Chicken & Avocado Bowl', completed: false,
        description: 'Tender grilled chicken over brown rice with avocado and lime dressing',
        calories: 520, protein: 45, carbs: 38, fat: 16, cookTime: 20, estimatedCost: 6.50,
        ingredients: [
          { name: 'Chicken breast', amount: '180g', cost: 3.50 },
          { name: 'Brown rice', amount: '80g dry', cost: 0.40 },
          { name: 'Avocado', amount: '1/2', cost: 1.00 },
          { name: 'Cherry tomatoes', amount: '100g', cost: 0.80 },
          { name: 'Lime', amount: '1', cost: 0.30 }
        ],
        instructions: [
          'Cook rice according to package instructions.',
          'Season chicken with salt, pepper, garlic powder.',
          'Grill chicken 6-7 minutes per side until cooked through.',
          'Slice chicken and arrange over rice.',
          'Top with sliced avocado and tomatoes.',
          'Squeeze lime juice over everything and serve.'
        ]
      },
      {
        type: 'snack', name: 'Apple with Almond Butter', completed: false,
        description: 'Crisp apple slices paired with creamy almond butter for sustained energy',
        calories: 210, protein: 6, carbs: 28, fat: 10, cookTime: 2, estimatedCost: 1.80,
        ingredients: [
          { name: 'Apple', amount: '1 medium', cost: 0.80 },
          { name: 'Almond butter', amount: '2 tbsp', cost: 1.00 }
        ],
        instructions: [
          'Wash and slice the apple into wedges.',
          'Serve with almond butter for dipping.'
        ]
      },
      {
        type: 'dinner', name: 'Baked Salmon with Roasted Broccoli', completed: false,
        description: 'Herb-crusted salmon fillet with garlicky roasted broccoli and lemon',
        calories: 480, protein: 48, carbs: 18, fat: 22, cookTime: 30, estimatedCost: 9.00,
        ingredients: [
          { name: 'Salmon fillet', amount: '200g', cost: 5.50 },
          { name: 'Broccoli', amount: '200g', cost: 1.20 },
          { name: 'Olive oil', amount: '1 tbsp', cost: 0.30 },
          { name: 'Garlic', amount: '3 cloves', cost: 0.20 },
          { name: 'Lemon', amount: '1', cost: 0.40 },
          { name: 'Fresh dill', amount: '1 tbsp', cost: 0.40 }
        ],
        instructions: [
          'Preheat oven to 200°C (400°F).',
          'Toss broccoli with olive oil, minced garlic, salt and pepper.',
          'Roast broccoli for 15 minutes.',
          'Place salmon on a lined baking sheet, season with dill, salt, and lemon zest.',
          'Bake salmon alongside broccoli for 12-15 minutes.',
          'Serve with lemon wedges and enjoy!'
        ]
      }
    ];
  }
