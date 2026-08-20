// SVG icons for grocery categories — no emoji in rendered HTML
const categoryConfig = {
  produce: {
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
    label: 'Produce &amp; Vegetables'
  },
  protein: {
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.4 13.7A6.5 6.5 0 1 0 6.28 6.6c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c4 0 8.4-1.8 11.4-4.3"/><path d="m18.5 6 2.19 4.5a6.48 6.48 0 0 1-2.29 7.2C15.4 20.2 11 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5"/><circle cx="12.5" cy="8.5" r="2.5"/></svg>`,
    label: 'Meat, Fish &amp; Protein'
  },
  dairy: {
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2C8 2 4 8 4 14a8 8 0 0 0 16 0c0-6-4-12-8-12"/></svg>`,
    label: 'Dairy &amp; Eggs'
  },
  grains: {
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 22 16 8"/><path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z"/><path d="M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"/><path d="M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"/><path d="M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"/></svg>`,
    label: 'Bread, Grains &amp; Pasta'
  },
  pantry: {
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2v5.632c0 .424-.272.795-.653.982A6 6 0 0 0 6 14c.006 4 3 7 5 8"/><path d="M10 5H8a2 2 0 0 0 0 4h.68"/><path d="M14 2v5.632c0 .424.272.795.652.982A6 6 0 0 1 18 14c0 4-3 7-5 8"/><path d="M14 5h2a2 2 0 0 1 0 4h-.68"/><path d="M18 22H6"/><path d="M9 2h6"/></svg>`,
    label: 'Pantry &amp; Condiments'
  },
  frozen: {
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/></svg>`,
    label: 'Frozen Foods'
  },
  beverages: {
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8"/><path d="M5 8h14"/><path d="M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0"/><path d="m12 8 1-6h2"/></svg>`,
    label: 'Beverages'
  },
  other: {
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/></svg>`,
    label: 'Other Items'
  }
};

const emptyCartSVG = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`;
const starSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const pencilSVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;

// Assigns a stable client-side id to any item missing one (sample data,
// manually-added items) so cost editing and checkbox sync can address it —
// server-generated items already carry a real id from groundAndStampGroceryItems.
let localIdSeq = 0;
function ensureItemIds() {
  if (!groceryList || !groceryList.categories) return;
  for (const items of Object.values(groceryList.categories)) {
    for (const item of items || []) {
      if (!item.id) item.id = `local_${Date.now()}_${localIdSeq++}`;
    }
  }
}

function renderDaySwitcher() {
  const wrap = document.getElementById('daySwitcher');
  const todayStr = toLocalDateStr(new Date());
  wrap.innerHTML = weekDates.map(({ date, dayName }) => {
    const hasList = dayHasList(dayName);
    const isActive = dayName === selectedDay;
    const isToday = date === todayStr;
    const dateLabel = new Date(`${date}T00:00:00`).getDate();
    return `<button type="button" class="day-tab${isActive ? ' active' : ''}${isToday ? ' today' : ''}${hasList ? '' : ' empty'}" role="tab" aria-selected="${isActive}" onclick="selectDay('${dayName}')" title="${hasList ? '' : 'No grocery list yet for this day'}">
      <span>${DAY_ABBR[dayName]}</span>
      <span class="day-tab-date">${dateLabel}</span>
    </button>`;
  }).join('');
}

function updateProgressForEmpty() {
  document.getElementById('groceryProgressCard').style.display = 'none';
}

function renderEmpty() {
  document.getElementById('groceryContainer').innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">${emptyCartSVG}</div>
      <h3>Your grocery list is empty</h3>
      <p>Generate a meal plan first and your shopping list will appear here.</p>
      <a href="meal-planner.html" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:0.4rem;">
        ${starSVG} Generate My Week
      </a>
    </div>`;
  updateProgressForEmpty();
}

function renderGroceryList() {
  if (!groceryList || !groceryList.categories) { renderEmpty(); return; }
  ensureItemIds();

  const container = document.getElementById('groceryContainer');
  const currency = profile?.currency || 'USD';
  const sym = getCurrencySymbol(currency);
  const householdSize = getHouseholdSize();

  let html = '';
  for (const [catKey, config] of Object.entries(categoryConfig)) {
    const items = (groceryList.categories[catKey] || []);
    if (items.length === 0) continue;
    html += `
      <div class="category-group category-group-animated">
        <h3 class="category-header">
          <span style="display:flex;align-items:center;">${config.icon}</span>
          <span>${config.label}</span>
          <span class="badge badge-muted" style="margin-left:auto;">${items.length}</span>
        </h3>
        <div>
          ${items.map((item) => {
            const scaledAmount = scaleAmount(item.amount, householdSize);
            const baseCost = item.actualCost ?? item.estimatedCost ?? item.cost;
            const scaledCost = scaleCost(baseCost, householdSize);
            return `
            <div class="grocery-item ${item.checked ? 'checked' : ''}" id="item-${item.id}">
              <input type="checkbox" ${item.checked ? 'checked' : ''} aria-checked="${item.checked ? 'true' : 'false'}" onchange="toggleItem('${catKey}', '${item.id}', this.checked)" />
              <span class="grocery-item-name">${escHtml(item.name)}</span>
              <span class="grocery-item-qty">${escHtml(scaledAmount || '')}</span>
              <span class="grocery-item-cost-wrap" id="cost-wrap-${item.id}">
                ${typeof scaledCost === 'number' ? `<span class="grocery-item-cost">${sym}${scaledCost.toFixed(2)}</span>` : ''}
                <button type="button" class="grocery-item-edit-btn" onclick="startEditCost(event, '${catKey}', '${item.id}')" aria-label="Edit actual cost for ${escHtml(item.name)}" title="Edit cost">${pencilSVG}</button>
              </span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  container.innerHTML = html || `<div class="empty-state"><div class="empty-state-icon">${emptyCartSVG}</div><h3>All categories are empty</h3></div>`;

  // Cap animations for categories with >8 items
  document.querySelectorAll('.category-group-animated').forEach(group => {
    const itemCount = group.querySelectorAll('.grocery-item').length;
    if (itemCount > 8) {
      group.classList.add('no-animate');
    }
  });
}

// Swaps the cost cell for a numeric input with an Emerald-600 focus ring.
function startEditCost(event, category, itemId) {
  event.stopPropagation();
  const item = (groceryList?.categories?.[category] || []).find(i => i.id === itemId);
  const wrap = document.getElementById(`cost-wrap-${itemId}`);
  if (!item || !wrap) return;

  const rawValue = item.actualCost ?? item.estimatedCost ?? item.cost ?? 0;
  wrap.innerHTML = `<input type="number" class="grocery-cost-input" id="cost-input-${itemId}" step="0.01" min="0" max="10000" value="${Number(rawValue).toFixed(2)}" aria-label="Actual cost for ${escHtml(item.name)}" />`;
  const input = document.getElementById(`cost-input-${itemId}`);
  input.focus();
  input.select();
  let cancelled = false;
  input.addEventListener('blur', () => { if (!cancelled) commitCostEdit(category, itemId); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelled = true; renderCostCell(category, itemId); }
  });
}

function commitCostEdit(category, itemId) {
  const input = document.getElementById(`cost-input-${itemId}`);
  const item = (groceryList?.categories?.[category] || []).find(i => i.id === itemId);
  if (!input || !item) return;

  const raw = input.value.trim();
  const n = raw === '' ? NaN : Number(raw);
  const actualCost = (Number.isFinite(n) && n >= 0) ? Math.round(n * 100) / 100 : null;
  item.actualCost = actualCost;

  renderCostCell(category, itemId);
  updateProgress();
  saveLists();
  syncItemToServer(category, itemId, { actualCost });
}

function renderCostCell(category, itemId) {
  const item = (groceryList?.categories?.[category] || []).find(i => i.id === itemId);
  const wrap = document.getElementById(`cost-wrap-${itemId}`);
  if (!item || !wrap) return;

  const sym = getCurrencySymbol(profile?.currency || 'USD');
  const householdSize = getHouseholdSize();
  const baseCost = item.actualCost ?? item.estimatedCost ?? item.cost;
  const scaledCost = scaleCost(baseCost, householdSize);
  wrap.innerHTML = `
    ${typeof scaledCost === 'number' ? `<span class="grocery-item-cost">${sym}${scaledCost.toFixed(2)}</span>` : ''}
    <button type="button" class="grocery-item-edit-btn" onclick="startEditCost(event, '${category}', '${itemId}')" aria-label="Edit actual cost for ${escHtml(item.name)}" title="Edit cost">${pencilSVG}</button>
  `;
}

function toggleItem(category, itemId, checked) {
  if (!groceryList || !groceryList.categories[category]) return;
  const item = groceryList.categories[category].find(i => i.id === itemId);
  if (!item) return;

  // Optimistic: update state + DOM instantly, then fire the PATCH in the
  // background without awaiting it. Checking an item marks it acquired —
  // it does not change the Remaining budget (that reflects planned spend).
  item.checked = checked;

  const itemEl = document.getElementById(`item-${itemId}`);
  if (itemEl) {
    itemEl.classList.toggle('checked', checked);
    const nameEl = itemEl.querySelector('.grocery-item-name');
    if (nameEl) nameEl.style.textDecoration = checked ? 'line-through' : '';
  }

  updateProgress();
  saveLists();
  syncItemToServer(category, itemId, { checked });
}

function updateProgress() {
  if (!groceryList || !groceryList.categories) return;

  document.getElementById('groceryProgressCard').style.display = '';
  const householdSize = getHouseholdSize();
  let total = 0, checked = 0, totalCost = 0, projectedCost = 0;
  for (const items of Object.values(groceryList.categories)) {
    for (const item of items) {
      total++;
      if (item.cost) totalCost += scaleCost(item.cost, householdSize);
      if (item.checked) checked++;
      const plannedCost = item.actualCost ?? item.estimatedCost ?? item.cost;
      if (typeof plannedCost === 'number') projectedCost += scaleCost(plannedCost, householdSize);
    }
  }

  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  document.getElementById('progressText').textContent = `${checked} of ${total} items checked`;
  document.getElementById('progressPct').textContent = `${pct}%`;
  document.getElementById('progressFill').style.width = pct + '%';

  const budget = profile?.budget || 100;
  const currency = profile?.currency || 'USD';
  const sym = getCurrencySymbol(currency);

  document.getElementById('totalCostDisplay').textContent = `${sym}${totalCost.toFixed(2)}`;
  document.getElementById('budgetDisplay').textContent = `${sym}${totalCost.toFixed(2)} / ${sym}${budget}`;
  const budgetPct = Math.min(100, (totalCost / budget) * 100);
  document.getElementById('budgetFill').style.width = budgetPct + '%';

  const remaining = budget - projectedCost;
  const remainingEl = document.getElementById('remainingDisplay');
  remainingEl.textContent = `${sym}${remaining.toFixed(2)}`;
  remainingEl.style.color = remaining < 0 ? 'var(--clr-error)' : 'var(--color-green)';
}

function addManualItem() {
  const input = document.getElementById('manualItemInput');
  const name = input.value.trim();
  if (!name) return;
  if (!groceryList) {
    groceryList = { weekStart, categories: { produce:[], protein:[], dairy:[], grains:[], pantry:[], frozen:[], beverages:[], other:[] }, generatedAt: new Date().toISOString() };
  }
  if (!groceryList.categories.other) groceryList.categories.other = [];
  groceryList.categories.other.push({ name, amount: '', checked: false });
  saveLists();
  availableDays.add(selectedDay);
  renderDaySwitcher();
  renderGroceryList();
  updateProgress();
  input.value = '';
  showToast(`"${name}" added to list`);
}

function clearAll() {
  if (!confirm('Clear all checked items?')) return;
  if (groceryList && groceryList.categories) {
    for (const items of Object.values(groceryList.categories)) {
      items.forEach(item => item.checked = false);
    }
    saveLists();
    renderGroceryList();
    updateProgress();
    showToast('Cleared all checkmarks');
  }
}

function showToast(msg, type = '') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

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

// === PDF EXPORT (Pro only) ===
function printGroceryList() {
  const isPro = localStorage.getItem('mealzy_pro') === 'true';
  if (!isPro) {
    mealzyTrack('upgrade_click', { source: 'grocery_pdf_btn' });
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1.5rem;';
    overlay.innerHTML = `
      <div style="background:var(--clr-card,#fff);border-radius:1.25rem;padding:2rem;max-width:400px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(26,61,43,0.25);">
        <button onclick="this.closest('[style]').remove()" style="float:right;background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--clr-muted-fg,#999);">&times;</button>
        <div style="width:48px;height:48px;background:var(--clr-primary-light);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 0.75rem;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="hsl(152,50%,35%)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        </div>
        <h3 style="font-family:var(--font-display);font-size:1.1rem;font-weight:700;margin-bottom:0.4rem;">Download grocery list as PDF</h3>
        <p style="color:var(--clr-muted-fg,#555);font-size:0.85rem;margin-bottom:1.25rem;line-height:1.6;">Print your grocery list or save it to your phone. Pro feature — upgrade to unlock.</p>
        <a href="upgrade.html" style="display:block;background:var(--clr-primary);color:white;padding:0.85rem;border-radius:var(--radius-md);font-weight:700;text-decoration:none;margin-bottom:0.5rem;font-size:0.92rem;">Upgrade to Pro &#8594;</a>
        <a href="upgrade.html" style="font-size:0.82rem;color:var(--clr-muted-fg,#888);text-decoration:underline;">See all plans</a>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    return;
  }
  mealzyTrack('pdf_export', { source: 'grocery_list' });
  window.print();
}

// Instacart affiliate tracking
function trackInstacart() {
  try {
    if (typeof gtag !== 'undefined') {
      gtag('event', 'instacart_click', {
        event_category: 'affiliate',
        event_label: 'grocery_list'
      });
    }
  } catch(e) {}
}

// Hide banner for non US/CA users (Instacart only operates there)
(function() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const isUSCA = tz.startsWith('America/') || tz.startsWith('US/') || tz.startsWith('Canada/');
    if (!isUSCA) {
      const banner = document.getElementById('instacartBanner');
      if (banner) banner.classList.add('hidden');
    }
  } catch(e) {}
})();

// Fix 2: lock sidebar active state to current page, prevent scroll-based changes
(function() {
  var correctActive = document.querySelector('.sidebar-nav a[href="grocery-list.html"]');
  if (!correctActive) return;
  var observer = new MutationObserver(function() {
    document.querySelectorAll('.sidebar .sidebar-nav a').forEach(function(a) {
      if (a !== correctActive) a.classList.remove('active');
    });
    correctActive.classList.add('active');
  });
  document.querySelectorAll('.sidebar .sidebar-nav a').forEach(function(a) {
    observer.observe(a, { attributes: true, attributeFilter: ['class'] });
  });
})();

init();
