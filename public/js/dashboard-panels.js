// Mealzy dashboard (4/4: G-key, mobile sidebar, NPS, recipes panel, import-recipe,
// and the boot sequence that wires everything up once componentLoader.js signals
// 'components:ready').

// Swaps the whole dashboard between the first-time welcome hero (no plan
// ever generated — see hasEverGeneratedPlan in dashboard-today.js) and the
// normal today-schedule/budget-macro cards. A returning user with just no
// plan *today* still gets the normal cards — they already know how the
// product works, so they keep the compact "No plan for today" empty state
// inside dashboard/today-schedule instead.
function updateDashboardEmptyState() {
  const hero = document.getElementById('firstPlanHero');
  const todaySection = document.getElementById('todayScheduleSection');
  const budgetSection = document.getElementById('budgetMacroSection');
  if (!hero) return;
  hero.style.display = hasEverGeneratedPlan ? 'none' : '';
  if (todaySection) todaySection.style.display = hasEverGeneratedPlan ? '' : 'none';
  if (budgetSection) budgetSection.style.display = hasEverGeneratedPlan ? '' : 'none';

  // Unverified accounts must not see a "Plan my week" CTA that's guaranteed
  // to fail server-side (requireVerifiedEmail / the email_verified check in
  // /api/generate-meal). serverUser is missing only during the brief offline
  // fallback window in init() — fail open there, the backend still enforces it.
  const readyState = document.getElementById('firstPlanHeroReady');
  const verifyState = document.getElementById('firstPlanHeroVerify');
  if (readyState && verifyState) {
    const verified = !serverUser || !!serverUser.email_verified;
    readyState.style.display = verified ? '' : 'none';
    verifyState.style.display = verified ? 'none' : '';
  }
}

let _resendVerificationInFlight = false;

async function resendVerificationFromDashboard() {
  if (_resendVerificationInFlight) return;
  const btn = document.getElementById('resendVerificationBtn');
  const msg = document.getElementById('resendVerificationMsg');
  _resendVerificationInFlight = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  if (msg) { msg.textContent = ''; msg.style.color = ''; }
  try {
    const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      const text = data.message || 'Verification email sent — check your inbox.';
      if (msg) { msg.textContent = text; msg.style.color = 'var(--clr-success)'; }
      showToast(text, 'success');
    } else {
      const text = data.error === 'not_authenticated'
        ? 'Sign in first, then try again.'
        : (data.message || data.error || 'Something went wrong. Please try again.');
      if (msg) { msg.textContent = text; msg.style.color = 'var(--clr-destructive)'; }
      showToast(text, 'error');
    }
  } catch (e) {
    const text = 'Could not connect. Please check your connection and try again.';
    if (msg) { msg.textContent = text; msg.style.color = 'var(--clr-destructive)'; }
    showToast(text, 'error');
  } finally {
    _resendVerificationInFlight = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Resend verification email'; }
  }
}

function showGKeyTooltip() {
  const tooltip = document.getElementById('gKeyTooltip');
  if (!tooltip || localStorage.getItem('mealzy_g_key_shown')) return;
  tooltip.style.display = 'block';
  setTimeout(() => { tooltip.style.display = 'none'; localStorage.setItem('mealzy_g_key_shown', '1'); }, 4000);
}

document.addEventListener('keydown', (e) => {
  if ((e.key === 'g' || e.key === 'G') &&
      document.activeElement.tagName !== 'INPUT' &&
      document.activeElement.tagName !== 'TEXTAREA') {
    generateMealPlan();
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

// === A/B TEST: CTA BUTTON LABEL ===
function initAbTest() {
  let variant = localStorage.getItem('mealzy_ab_cta');
  if (!variant) {
    variant = Math.random() < 0.5 ? 'A' : 'B';
    localStorage.setItem('mealzy_ab_cta', variant);
  }
  if (variant === 'B') {
    const label = document.getElementById('generateBtnLabel');
    if (label) label.textContent = 'Build My Meal Plan';
  }
  trackEvent('ab_cta_impression', { variant });
}

// === NPS PROMPT ===
async function checkNpsPrompt() {
  const snoozedUntil = localStorage.getItem('mealzy_nps_snoozed');
  if (snoozedUntil && Date.now() < Number(snoozedUntil)) return;

  try {
    const res = await fetch('/api/nps/check');
    if (!res.ok) return;
    const data = await res.json();
    if (data.show) setTimeout(showNpsModal, 5000);
  } catch (e) {}
}

function showNpsModal() {
  document.getElementById('npsModal').classList.add('open');
}

function closeNpsModal(snooze) {
  document.getElementById('npsModal').classList.remove('open');
  if (snooze) {
    const threeDays = Date.now() + 3 * 24 * 60 * 60 * 1000;
    localStorage.setItem('mealzy_nps_snoozed', String(threeDays));
  }
}

let _npsScore = null;

function selectNpsScore(btn) {
  document.querySelectorAll('.nps-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  _npsScore = Number(btn.dataset.score);
  document.getElementById('npsSubmitBtn').disabled = false;
}

async function submitNps() {
  if (_npsScore === null) return;
  const comment = document.getElementById('npsComment').value.trim();
  try {
    await fetch('/api/nps/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: _npsScore, comment })
    });
  } catch (e) {}
  closeNpsModal(false);
}

// ── RECIPES PANEL ─────────────────────────────────────────────────────────
function showRecipesPanel(e) {
  if (e) e.preventDefault();
  document.getElementById('dashboardContent').style.display = 'none';
  document.getElementById('recipesPanel').style.display = '';
  document.querySelectorAll('.sidebar-nav a').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.recipes-nav-item').forEach(el => el.classList.add('active'));
  loadRecipes();
}

let _recipesCache = [];

async function loadRecipes() {
  const grid = document.getElementById('recipesGrid');
  if (!grid.dataset.delegated) {
    grid.dataset.delegated = '1';
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'use-recipe') {
        useRecipeInPlan(Number(btn.dataset.idx));
      } else if (btn.dataset.action === 'delete-recipe') {
        deleteRecipe(btn.dataset.id);
      }
    });
  }
  grid.innerHTML = '<p style="color:var(--clr-muted-fg);padding:1rem;">Loading...</p>';
  try {
    const res  = await fetch('/api/recipes');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load');
    _recipesCache = data.recipes || [];
    if (!_recipesCache.length) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <h3>${window.t('no_recipes_title')}</h3>
          <p>${window.t('no_recipes_desc')}</p>
          <button class="btn btn-primary" onclick="openImportRecipeModal()">${window.t('import_recipe')}</button>
        </div>`;
    } else {
      grid.innerHTML = _recipesCache.map((r, idx) => `
        <div class="card card-sm" style="display:flex;flex-direction:column;">
          <div style="font-weight:700;margin-bottom:0.35rem;">${escHtml(r.name || 'Untitled Recipe')}</div>
          <div style="font-size:0.82rem;color:var(--clr-muted-fg);line-height:1.6;">
            ${r.servings ? r.servings + ' servings' : ''}${r.estimatedCalories ? ' · ' + r.estimatedCalories + ' kcal' : ''}${r.estimatedProtein ? ' · ' + r.estimatedProtein + 'g protein' : ''}
          </div>
          ${r.ingredients && r.ingredients.length ? `<div style="font-size:0.78rem;color:var(--clr-muted-fg);margin-top:0.5rem;">${r.ingredients.length} ingredients</div>` : ''}
          <div style="display:flex;gap:0.5rem;margin-top:0.85rem;">
            <button class="btn btn-outline btn-sm" style="flex:1;font-size:0.8rem;" data-action="use-recipe" data-idx="${idx}">${window.t('use_in_plan')}</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--clr-destructive);font-size:0.8rem;" data-action="delete-recipe" data-id="${escHtml(r.id)}">${window.t('btn_delete')}</button>
          </div>
        </div>`).join('');
    }
  } catch(err) {
    grid.innerHTML = `<p style="color:var(--clr-destructive);padding:1rem;">${escHtml(err.message)}</p>`;
  }
}

function useRecipeInPlan(idx) {
  const recipe = _recipesCache[idx];
  if (!recipe) return;
  localStorage.setItem('mealzy_pending_recipe', JSON.stringify(recipe));
  window.location.href = 'meal-planner.html';
}

async function deleteRecipe(id) {
  if (!confirm('Delete this recipe?')) return;
  try {
    const res = await fetch('/api/recipes/' + id, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Delete failed');
    }
    loadRecipes();
  } catch(err) {
    showToast(err.message || 'Failed to delete recipe. Please try again.', 'error');
  }
}

// ── IMPORT RECIPE ─────────────────────────────────────────────────────────
let _irBase64 = null;
let _irMime   = 'image/jpeg';

const IR_STEPS = ['irStepGate','irStepUpload','irStepExtracting','irStepReview','irStepSuccess'];

function irShowStep(step) {
  IR_STEPS.forEach(s => document.getElementById(s).style.display = 'none');
  document.getElementById(step).style.display = '';
}

function openImportRecipeModal() {
  _irBase64 = null;
  const isPro = !!serverUser?.pro;
  document.getElementById('importRecipeModal').classList.add('open');
  irShowStep(isPro ? 'irStepUpload' : 'irStepGate');
}

function closeImportRecipeModal() {
  document.getElementById('importRecipeModal').classList.remove('open');
  irReset();
}

function irReset() {
  _irBase64 = null;
  document.getElementById('irFileInput').value = '';
  document.getElementById('irPreview').style.display = 'none';
  document.getElementById('irUploadError').style.display = 'none';
  document.getElementById('irSaveError').style.display = 'none';
  const isPro = !!serverUser?.pro;
  if (isPro) irShowStep('irStepUpload');
}

function irHandleFile(input) {
  const file = input.files[0];
  if (!file) return;
  _irMime = file.type || 'image/jpeg';
  const reader = new FileReader();
  reader.onload = e => {
    _irBase64 = e.target.result.split(',')[1]; // strip data URL prefix
    document.getElementById('irPreviewImg').src = e.target.result;
    document.getElementById('irPreview').style.display = '';
  };
  reader.readAsDataURL(file);
}

async function irExtract() {
  if (!_irBase64) return;
  irShowStep('irStepExtracting');
  try {
    const res = await fetch('/api/recipes/import-photo', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ imageData: _irBase64, mimeType: _irMime })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Extraction failed');
    irPopulateForm(data.recipe);
    irShowStep('irStepReview');
  } catch(err) {
    irShowStep('irStepUpload');
    const el = document.getElementById('irUploadError');
    el.textContent = err.message;
    el.style.display = '';
  }
}

function irPopulateForm(r) {
  document.getElementById('irName').value      = r.name       || '';
  document.getElementById('irServings').value  = r.servings   || 2;
  document.getElementById('irCalories').value  = r.estimatedCalories || '';
  document.getElementById('irProtein').value   = r.estimatedProtein  || '';
  document.getElementById('irIngredients').value = (r.ingredients || [])
    .map(i => i.amount ? `${i.amount} ${i.name}` : i.name).join('\n');
  document.getElementById('irInstructions').value = (r.instructions || []).join('\n');
}

async function irSave() {
  const btn = document.getElementById('irSaveBtn');
  const errEl = document.getElementById('irSaveError');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const ingredientsRaw = document.getElementById('irIngredients').value.trim().split('\n').filter(Boolean);
  const instructionsRaw = document.getElementById('irInstructions').value.trim().split('\n').filter(Boolean);

  const recipe = {
    name:               document.getElementById('irName').value.trim(),
    servings:           Number(document.getElementById('irServings').value) || 2,
    estimatedCalories:  Number(document.getElementById('irCalories').value) || 0,
    estimatedProtein:   Number(document.getElementById('irProtein').value)  || 0,
    ingredients:        ingredientsRaw.map(line => ({ name: line, amount: '' })),
    instructions:       instructionsRaw,
  };

  if (!recipe.name) {
    errEl.textContent = 'Recipe name is required.';
    errEl.style.display = '';
    btn.disabled = false;
    btn.textContent = 'Save to Library →';
    return;
  }

  try {
    const res = await fetch('/api/recipes/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ recipe })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Save failed');
    document.getElementById('irSuccessName').textContent = `"${recipe.name}" saved!`;
    irShowStep('irStepSuccess');
  } catch(err) {
    errEl.textContent = err.message;
    errEl.style.display = '';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save to Library →';
  }
}

// ── Boot: everything below touches DOM that lives inside async-loaded
// partials, so it waits for componentLoader.js's 'components:ready' event
// (fired once every [data-component] placeholder, including nested ones,
// has been injected) instead of running immediately after script parse.
document.addEventListener('components:ready', function onComponentsReady() {
  document.removeEventListener('components:ready', onComponentsReady);

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

  // Close recipe modal on overlay click
  document.getElementById('recipeModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('recipeModal')) closeModal();
  });

  // Sidebar "Recipes" links on other app pages point here via #recipes
  if (window.location.hash === '#recipes') setTimeout(() => showRecipesPanel(), 0);

  init();
  checkNpsPrompt();
});

// Register service worker for PWA offline support — no partial DOM dependency
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
