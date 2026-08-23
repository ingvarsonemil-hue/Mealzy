// Dark mode
if (localStorage.getItem('mealzy_theme') === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark');
}

// -- Auth helpers (JWT cookie — server is source of truth) --
async function cloudLoad(uid) { /* no-op */ }
async function cloudSave() { /* no-op — data saved server-side */ }
async function signOut() {
  try { await fetch('/api/auth/signout', { method: 'POST' }); } catch(e) {}
  localStorage.clear(); window.location.href = 'login.html';
}
// -------------------------

let profile = null;
let groceryList = null;
let planId = null;
let availableDays = new Set();

let weekStart = '';
let weekDates = [];
let selectedDay = '';

// Fires at most once per page load, the first time a real (non-empty-state)
// grocery list is successfully shown — switching days, retries, and re-renders
// of the same list must never re-fire it. See selectDay().
let groceryListViewedFired = false;
function trackGroceryListViewedOnce() {
  if (groceryListViewedFired) return;
  groceryListViewedFired = true;
  if (typeof mealzyTrack === 'function') mealzyTrack('grocery_list_viewed', {});
}

const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DAY_ABBR  = { Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed', Thursday:'Thu', Friday:'Fri', Saturday:'Sat', Sunday:'Sun' };

// Local calendar date (YYYY-MM-DD) — NOT toISOString(), which is UTC and
// rolls back a day for positive-offset timezones during early local hours.
// Must match server.js's getLocalDateString(), which is how plans are keyed.
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return toLocalDateStr(d);
}

function getWeekDates(monday) {
  const [y, m, day] = monday.split('-').map(Number);
  const base = new Date(y, m - 1, day);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    dates.push({ date: toLocalDateStr(d), dayName: DAY_NAMES[i] });
  }
  return dates;
}

// -- Plan id + per-day list cache (keyed by weekStart, same scheme mealzy_meal_plans uses for dates) --
function loadPlanId() {
  const map = JSON.parse(localStorage.getItem('mealzy_grocery_plan_ids') || '{}');
  return map[weekStart] || null;
}

function savePlanId(id) {
  const map = JSON.parse(localStorage.getItem('mealzy_grocery_plan_ids') || '{}');
  map[weekStart] = id;
  localStorage.setItem('mealzy_grocery_plan_ids', JSON.stringify(map));
  planId = id;
}

function getCachedDayList(day) {
  const lists = JSON.parse(localStorage.getItem('mealzy_grocery_lists') || '{}');
  const weekLists = lists[weekStart];
  if (!weekLists || typeof weekLists !== 'object' || weekLists.categories) return null;
  return weekLists[day] || null;
}

function setCachedDayList(day, list) {
  const lists = JSON.parse(localStorage.getItem('mealzy_grocery_lists') || '{}');
  if (!lists[weekStart] || typeof lists[weekStart] !== 'object' || lists[weekStart].categories) {
    lists[weekStart] = {};
  }
  lists[weekStart][day] = list;
  localStorage.setItem('mealzy_grocery_lists', JSON.stringify(lists));
  cloudSave();
}

function dayHasList(day) {
  return availableDays.has(day) || !!getCachedDayList(day);
}

// Grocery list generation for a freshly-created plan runs fire-and-forget on
// the server (see /api/generate-meal), so it can still be in flight the
// moment the user lands here via "Shop Grocery List". Retry a few times
// before treating a real, just-created plan as if it had no list.
async function refreshAvailableDays(retriesLeft) {
  if (retriesLeft === undefined) retriesLeft = 3;
  availableDays = new Set();
  if (!planId) return;
  try {
    const res = await fetch(`/api/grocery-list/${planId}/days`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) availableDays = new Set(data.days || []);
      if (availableDays.size === 0 && retriesLeft > 0) {
        await new Promise(r => setTimeout(r, 1200));
        return refreshAvailableDays(retriesLeft - 1);
      }
    } else if (res.status === 404) {
      planId = null;
    }
  } catch (e) { /* offline — fall back to whatever is cached locally */ }
}

async function selectDay(day) {
  selectedDay = day;
  renderDaySwitcher();

  const cached = getCachedDayList(day);
  if (cached) {
    groceryList = cached;
    renderGroceryList();
    updateProgress();
    trackGroceryListViewedOnce();
    return;
  }

  if (!availableDays.has(day) || !planId) {
    groceryList = null;
    renderEmpty();
    return;
  }

  try {
    const res = await fetch(`/api/grocery-list/${planId}/${encodeURIComponent(day)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.groceryList) {
        groceryList = data.groceryList;
        setCachedDayList(day, groceryList);
        renderGroceryList();
        updateProgress();
        trackGroceryListViewedOnce();
        return;
      }
    }
  } catch (e) { /* fall through to empty state */ }
  groceryList = null;
  renderEmpty();
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
  document.getElementById('userAvatar').textContent = initial;
  document.getElementById('mobileUserAvatar').textContent = initial;
  document.getElementById('userName').textContent = profile.name || 'User';
  document.getElementById('mobileUserName').textContent = profile.name || 'User';
  applyNavTranslations();

  if (localStorage.getItem('mealzy_pro') !== 'true') {
    document.getElementById('proNudgeBanner').style.display = 'flex';
  }

  weekStart = getMondayOfWeek(new Date());
  weekDates = getWeekDates(weekStart);
  const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  document.getElementById('weekLabel').textContent = `Week of ${fmt(weekDates[0].date)} – ${fmt(weekDates[6].date)}`;

  planId = loadPlanId();
  await refreshAvailableDays();

  const todayStr = toLocalDateStr(new Date());
  const todayEntry = weekDates.find(d => d.date === todayStr);
  selectedDay = todayEntry ? todayEntry.dayName : weekDates[0].dayName;

  renderDaySwitcher();
  selectDay(selectedDay);
}

// Fire-and-forget PATCH — the caller has already updated the DOM and local
// state optimistically, so this never blocks the UI thread and a failure
// just gets logged (item stays checked/edited locally either way).
// onSuccess (optional) only runs once the server has confirmed the write —
// used so activation tracking never counts a persistence attempt that failed.
function syncItemToServer(category, itemId, updates, onSuccess) {
  if (!planId || !selectedDay) return;
  fetch(`/api/grocery-list/${planId}/${encodeURIComponent(selectedDay)}/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  }).then(res => {
    if (!res.ok) { console.error('[grocery-list] item sync rejected:', res.status); return; }
    if (onSuccess) onSuccess();
  }).catch(err => console.error('[grocery-list] item sync failed:', err));
}

function saveLists() {
  if (!groceryList) return;
  setCachedDayList(selectedDay, groceryList);
}

async function generateGroceryList() {
  const dayEntry = weekDates.find(d => d.dayName === selectedDay);
  const dateStr = dayEntry ? dayEntry.date : toLocalDateStr(new Date());
  const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
  const dayMeals = (plans[dateStr] && plans[dateStr].meals) ? plans[dateStr].meals : [];

  if (dayMeals.length === 0) {
    groceryList = getSampleGroceryList();
    saveLists();
    availableDays.add(selectedDay);
    renderDaySwitcher();
    renderGroceryList();
    updateProgress();
    showToast('Sample grocery list generated!', 'success');
    return;
  }

  document.getElementById('loadingOverlay').classList.add('open');
  document.getElementById('generateBtn').disabled = true;
  try {
    const response = await fetch('/api/generate-grocery-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, meals: dayMeals, weekStart, day: selectedDay, planId })
    });
    const data = await response.json();
    if (data.success && data.groceryList) {
      groceryList = data.groceryList;
      if (data.planId) savePlanId(data.planId);
      saveLists();
      availableDays.add(selectedDay);
      renderDaySwitcher();
      renderGroceryList();
      updateProgress();
      showToast('Grocery list generated!', 'success');
    }
  } catch (err) {
    groceryList = getSampleGroceryList();
    saveLists();
    availableDays.add(selectedDay);
    renderDaySwitcher();
    renderGroceryList();
    updateProgress();
    showToast('Using sample list — check server connection', 'error');
  } finally {
    document.getElementById('loadingOverlay').classList.remove('open');
    document.getElementById('generateBtn').disabled = false;
  }
}

function getSampleGroceryList() {
  return {
    weekStart,
    totalCost: 72.50,
    budgetAmount: profile?.budget || 100,
    currency: profile?.currency || 'USD',
    categories: {
      produce: [
        { name: 'Mixed berries', amount: '400g', cost: 4.80, checked: false },
        { name: 'Cherry tomatoes', amount: '400g', cost: 3.20, checked: false },
        { name: 'Broccoli', amount: '800g', cost: 4.80, checked: false },
        { name: 'Bell peppers', amount: '4', cost: 4.00, checked: false },
        { name: 'Spinach', amount: '200g', cost: 2.50, checked: false },
        { name: 'Avocados', amount: '4', cost: 6.00, checked: false },
        { name: 'Lemons', amount: '4', cost: 1.60, checked: false },
        { name: 'Apples', amount: '6', cost: 4.80, checked: false },
        { name: 'Garlic', amount: '1 head', cost: 0.80, checked: false }
      ],
      protein: [
        { name: 'Chicken breast', amount: '1.2kg', cost: 12.00, checked: false },
        { name: 'Salmon fillets', amount: '800g', cost: 18.00, checked: false },
        { name: 'Eggs', amount: '12', cost: 3.60, checked: false }
      ],
      dairy: [
        { name: 'Greek yogurt', amount: '800g', cost: 5.40, checked: false },
        { name: 'Almond milk', amount: '1L', cost: 2.80, checked: false }
      ],
      grains: [
        { name: 'Brown rice', amount: '500g', cost: 2.50, checked: false },
        { name: 'Granola', amount: '400g', cost: 4.00, checked: false },
        { name: 'Whole grain bread', amount: '1 loaf', cost: 3.50, checked: false }
      ],
      pantry: [
        { name: 'Olive oil', amount: '500ml', cost: 5.50, checked: false },
        { name: 'Almond butter', amount: '300g', cost: 6.00, checked: false },
        { name: 'Honey', amount: '300g', cost: 3.50, checked: false }
      ],
      frozen: [],
      beverages: [],
      other: []
    }
  };
}
