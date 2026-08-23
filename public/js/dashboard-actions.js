// Mealzy dashboard (2/4: recipe modal, generate/swap, paywall, toasts, recent plans).

function openRecipeModal(index) {
  const meal = todayMeals[index];
  document.getElementById('modalMealName').textContent = meal.name;
  document.getElementById('modalMealDesc').textContent = meal.description || '';
  document.getElementById('modalMacros').innerHTML = `
    <span class="macro-pill">${ICO.flame} ${meal.calories} kcal</span>
    <span class="macro-pill">${ICO.zap} ${meal.protein}g protein</span>
    <span class="macro-pill">${ICO.grain} ${meal.carbs}g carbs</span>
    <span class="macro-pill">${ICO.drop} ${meal.fat}g fat</span>
    ${meal.cookTime ? `<span class="macro-pill">${ICO.clock} ${escHtml(meal.cookTime)} min</span>` : ''}
  `;
  const ingList = meal.ingredients || [];
  const householdSize = getHouseholdSize();
  document.getElementById('modalIngredients').innerHTML = ingList.map(ing => {
    const scaledAmount = scaleAmount(ing.amount, householdSize);
    const scaledCost = scaleCost(ing.cost, householdSize);
    return `<li><span>${escHtml(ing.name)}</span><span class="text-muted">${escHtml(scaledAmount)}${scaledCost ? ` · ${getCurrencySymbol(profile.currency)}${scaledCost.toFixed(2)}` : ''}</span></li>`;
  }).join('');
  const instList = meal.instructions || [];
  document.getElementById('modalInstructions').innerHTML = instList.map(step =>
    `<li>${escHtml(step)}</li>`
  ).join('');
  document.getElementById('recipeModal').classList.add('open');
}

function closeModal() {
  document.getElementById('recipeModal').classList.remove('open');
}

// Pro: generates the full 7-day plan for the current week (1 credit = 1 week —
// same weekStart flow as meal-planner.html). Free/trial: generates a single
// day (today only — the 30-day trial allows exactly 1 plan per calendar day).
// Both refresh the "Today's Meal" widget from the result. Also used for
// regeneration: existing meals are passed as avoid_meals so a re-click
// doesn't just repeat itself.
async function generateMealPlan() {
  if (!profile) { window.location.href = 'onboarding.html'; return; }
  await refreshProfileFromServer();
  trackEvent('ab_cta_click', { variant: localStorage.getItem('mealzy_ab_cta') || 'A' });
  document.getElementById('loadingOverlay').classList.add('open');
  document.getElementById('generateBtn').disabled = true;
  startLoadingAnimation();
  try {
    const isPro = !!serverUser?.pro;
    const weekStart = getMondayStr(new Date());
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const existingPlans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
    const avoid_meals = Object.values(existingPlans).flatMap(p => (p && p.meals) ? p.meals.map(m => m.name) : []).filter(Boolean);

    const response = await fetch('/api/generate-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        isPro
          ? { profile, weekStart, avoid_meals }
          : { profile, date: today, timezone, avoid_meals }
      )
    });

    if (response.status === 402) {
      const data = await response.json();
      // free_limit_hit (and the more specific trial_already_generated_today /
      // weekly_free_plan_limit_hit events) are logged server-side, at the
      // point the limit is actually enforced — logging it again here on
      // receipt of the 402 double-counted every real limit hit.
      showUpgradePrompt(data.message || 'Your first free month has ended. Upgrade to keep generating.');
      return;
    }

    if (response.status === 409) {
      const data = await response.json();
      // Generation is blocked because today's plan already exists server-side —
      // load that plan instead of leaving the user with nothing to look at.
      if (data.existingPlan && data.existingPlan.plan && data.existingPlan.plan.meals) {
        const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
        const planDate = data.existingPlan.date || today;
        plans[planDate] = { meals: data.existingPlan.plan.meals, generatedAt: data.existingPlan.savedAt || new Date().toISOString() };
        localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));
        if (data.planId) {
          const groceryPlanIds = JSON.parse(localStorage.getItem('mealzy_grocery_plan_ids') || '{}');
          groceryPlanIds[getMondayStr(new Date())] = data.planId;
          localStorage.setItem('mealzy_grocery_plan_ids', JSON.stringify(groceryPlanIds));
        }
        todayMeals = (plans[today] && plans[today].meals) ? plans[today].meals.map(m => ({ ...m, completed: false })) : [];
        hasEverGeneratedPlan = true;
        updateDashboardEmptyState();
        renderMeals();
        showToast(data.message || "You already created a plan today. We've loaded it for you.", 'success');
        return;
      }
      showToast(data.message || "You already generated a plan today. Come back tomorrow for your next one.");
      return;
    }

    if (response.status === 403) {
      const data = await response.json();
      // Frontend verification state can go stale (e.g. verified in another tab
      // without reloading this one) — the backend is still authoritative, so
      // resync locally and flip the hero back to the verify-required state
      // instead of leaving the user at a dead-end error.
      if (data.error === 'email_not_verified') {
        if (serverUser) serverUser.email_verified = false;
        updateDashboardEmptyState();
      }
      showToast(data.message || 'Please verify your email to generate plans.', 'error');
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.success) {
      showToast(data.message || data.error || 'Generation failed. Please try again.', 'error');
      return;
    }

    const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
    if (isPro) {
      (data.days || []).forEach(d => {
        plans[d.date] = { meals: d.meals || [], generatedAt: new Date().toISOString() };
      });
    } else if (data.mealPlan) {
      plans[data.date || today] = { meals: data.mealPlan.meals || [], generatedAt: new Date().toISOString() };
    }
    localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));

    // The server already generated and saved a grocery list for this plan in the
    // background (see /api/generate-meal) — stash its id under the same key
    // groceries-sync.js reads, so "Shop Grocery List" opens the real list instead
    // of an empty one.
    if (data.planId) {
      const groceryPlanIds = JSON.parse(localStorage.getItem('mealzy_grocery_plan_ids') || '{}');
      groceryPlanIds[weekStart] = data.planId;
      localStorage.setItem('mealzy_grocery_plan_ids', JSON.stringify(groceryPlanIds));
    }

    todayMeals = (plans[today] && plans[today].meals) ? plans[today].meals.map(m => ({ ...m, completed: false })) : [];
    trackEvent('generate_plan', { weekStart });

    try {
      const xpRes = await fetch('/api/xp/award', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate_plan' }) });
      if (xpRes.ok) {
        const xpData = await xpRes.json();
        if (typeof xpData.streak === 'number') {
          profile.streak = xpData.streak;
          localStorage.setItem('mealzy_profile', JSON.stringify(profile));
          updateStreakBadge();
        }
      }
    } catch(e) { /* fail silently — badge just won't update reactively this time */ }

    // Track plan count for soft upgrade banner
    const planCount = parseInt(localStorage.getItem('mealzy_plan_count_month') || '0') + 1;
    localStorage.setItem('mealzy_plan_count_month', planCount);

    hasEverGeneratedPlan = true;
    updateDashboardEmptyState();
    saveToHistory(todayMeals);
    renderMeals();
    updateStats();
    renderRecentPlans();
    cloudSave();

    showToast('Meal plan generated!', 'success');

    // Growth triggers — only show to free users
    if (!isPro) {
      if (planCount === 1) showReferralBanner();
    }
  } catch (err) {
    showToast('Something went wrong — please try again.', 'error');
  } finally {
    stopLoadingAnimation();
    document.getElementById('loadingOverlay').classList.remove('open');
    document.getElementById('generateBtn').disabled = false;
  }
}

// ── Abandonment paywall — two-stage modal ────────────────────────────────
function showUpgradePrompt(message) {
  trackEvent('upgrade_prompt_shown', { source: 'limit' });
  const existing = document.getElementById('upgradePrompt');
  if (existing) existing.remove();
  const lsUser = JSON.parse(localStorage.getItem('mealzy_user') || '{}');
  const prefillEmail = (lsUser.email || '').replace(/"/g, '&quot;');
  const prompt = document.createElement('div');
  prompt.id = 'upgradePrompt';
  prompt.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(26,61,43,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1.5rem;';
  prompt.innerHTML = `
    <div id="upgradeCard" style="background:var(--clr-card);border-radius:1.25rem;padding:2rem;max-width:420px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(26,61,43,0.25);position:relative;">
      <!-- Primary offer -->
      <div id="upgradeStage1">

        <h2 style="font-size:1.3rem;font-weight:800;margin-bottom:0.5rem;color:var(--clr-foreground);">You've hit your free limit</h2>
        <p style="color:var(--clr-foreground);font-size:0.88rem;margin-bottom:1rem;line-height:1.6;">Upgrade to Pro for <strong>unlimited meal plans</strong>, full recipes, and AI coaching — all for just <strong>$8/month</strong>. Your grocery list is waiting.</p>
        <div style="background:var(--clr-surface);border-radius:0.75rem;padding:0.75rem;margin-bottom:1rem;font-size:0.82rem;color:var(--clr-brand);text-align:left;">
          Unlimited AI meal plans<br>
          Full recipes with steps & ingredients<br>
          Advanced macros & nutrition tracking<br>
          Priority AI coaching
        </div>
        <input type="email" id="upgradeEmail" value="${prefillEmail}" placeholder="Your email" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:0.5rem;padding:0.65rem 0.75rem;font-size:0.88rem;margin-bottom:0.75rem;font-family:inherit;" />
        <a href="${window.STRIPE_MONTHLY || 'https://buy.stripe.com/28E28r1Q73q0e6neQRffy00'}" onclick="captureUpgradeEmail()" target="_blank" style="display:block;background:var(--clr-brand);color:white;padding:0.9rem;border-radius:0.75rem;font-weight:700;text-decoration:none;margin-bottom:0.5rem;font-size:0.95rem;">Upgrade to Pro — $8/month →</a>
        <div style="display:flex;justify-content:center;gap:1rem;margin-top:0.25rem;">
          <a href="upgrade.html" style="font-size:0.8rem;color:#666;text-decoration:underline;">See all Pro features</a>
          <button onclick="showAbandonmentOffer()" style="background:none;border:none;color:#999;font-size:0.82rem;cursor:pointer;text-decoration:underline;">No thanks</button>
        </div>
      </div>
      <!-- Abandonment offer (shown after "No thanks") -->
      <div id="upgradeStage2" style="display:none;">
        <div style="background:#fff7ed;border-radius:50%;width:52px;height:52px;display:flex;align-items:center;justify-content:center;margin:0 auto 0.75rem;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L4.5 13.5H12L11 22L19.5 10.5H12L13 2Z"/></svg></div>
        <div style="background:var(--clr-destructive, #dc2626);color:#fff;font-size:0.72rem;font-weight:800;letter-spacing:0.08em;padding:0.2rem 0.7rem;border-radius:2rem;display:inline-block;margin-bottom:0.6rem;">LIMITED OFFER</div>
        <h2 style="font-size:1.25rem;font-weight:900;margin-bottom:0.4rem;color:var(--clr-foreground);">Wait — 50% off, just for you</h2>
        <p style="color:var(--clr-foreground);font-size:0.88rem;margin-bottom:1rem;line-height:1.6;">Get your <strong>first month of Pro for $4</strong>, then $8/month. Cancel any time.</p>
        <a href="${window.STRIPE_DISCOUNT || window.STRIPE_MONTHLY || 'https://buy.stripe.com/28E28r1Q73q0e6neQRffy00'}" onclick="captureUpgradeEmail();trackEvent('abandonment_offer_click',{})" target="_blank" style="display:block;background:var(--clr-destructive, #dc2626);color:white;padding:0.9rem;border-radius:0.75rem;font-weight:700;text-decoration:none;margin-bottom:0.5rem;font-size:0.95rem;">Get Pro for $4 this month →</a>
        <button onclick="closeUpgradeAndShowBanner()" style="background:none;border:none;color:#999;font-size:0.82rem;cursor:pointer;text-decoration:underline;">I'll stay on free</button>
      </div>
    </div>`;
  document.body.appendChild(prompt);
}

function showAbandonmentOffer() {
  trackEvent('abandonment_offer_shown', {});
  document.getElementById('upgradeStage1').style.display = 'none';
  document.getElementById('upgradeStage2').style.display = '';
}

function closeUpgradeAndShowBanner() {
  const p = document.getElementById('upgradePrompt');
  if (p) p.remove();
  // Before showing the banner, try to capture their email with a reminder offer
  if (!localStorage.getItem('mealzy_abandon_email_shown')) {
    showAbandonEmailCapture();
  } else {
    showZeroPlansBanner();
  }
}

function showAbandonEmailCapture() {
  localStorage.setItem('mealzy_abandon_email_shown', '1');
  const lsUser = JSON.parse(localStorage.getItem('mealzy_user') || '{}');
  // If they already have an email on record, skip this step
  if (lsUser.email) {
    // Still capture it with discount flag but skip the modal
    fetch('/api/email-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: lsUser.email, source: 'abandonment', discount: true })
    }).catch(() => {});
    showZeroPlansBanner();
    return;
  }
  const overlay = document.createElement('div');
  overlay.id = 'abandonEmailOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(26,61,43,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1.5rem;';
  overlay.innerHTML = `
    <div style="background:var(--clr-card);border-radius:1.25rem;padding:2rem;max-width:380px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(26,61,43,0.25);">
      <div style="font-size:2rem;margin-bottom:0.5rem;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg></div>
      <h3 style="font-size:1.1rem;font-weight:800;margin-bottom:0.4rem;color:#111;">One last thing</h3>
      <p style="color:#555;font-size:0.85rem;margin-bottom:1rem;line-height:1.6;">
        Enter your email and we'll remind you when your free plans reset next month —
        and let you know about exclusive subscriber offers.
      </p>
      <input type="email" id="abandonEmail" placeholder="your@email.com"
        style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:0.5rem;padding:0.65rem 0.75rem;font-size:0.88rem;margin-bottom:0.75rem;font-family:inherit;" />
      <button onclick="submitAbandonEmail()" style="width:100%;background:#2e7d4f;color:white;border:none;padding:0.85rem;border-radius:0.75rem;font-weight:700;font-size:0.95rem;cursor:pointer;margin-bottom:0.5rem;">
        Remind me when plans reset →
      </button>
      <button onclick="document.getElementById('abandonEmailOverlay').remove();showZeroPlansBanner();"
        style="background:none;border:none;color:#999;font-size:0.82rem;cursor:pointer;text-decoration:underline;">
        No thanks
      </button>
    </div>`;
  document.body.appendChild(overlay);
}

async function submitAbandonEmail() {
  const emailEl = document.getElementById('abandonEmail');
  const email = emailEl ? emailEl.value.trim() : '';
  if (!email || !email.includes('@')) {
    emailEl.style.border = '1.5px solid #dc2626';
    emailEl.focus();
    return;
  }
  try {
    await fetch('/api/email-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'abandonment', discount: true })
    });
  } catch (e) {}
  trackEvent('abandon_email_captured', { source: 'abandon_flow' });
  const overlay = document.getElementById('abandonEmailOverlay');
  if (overlay) {
    overlay.querySelector('div').innerHTML = `

      <h3 style="font-size:1.1rem;font-weight:800;color:#111;">You're on the list!</h3>
      <p style="color:#555;font-size:0.85rem;margin-top:0.5rem;">We'll be in touch with exclusive offers. Your free plans reset in 30 days.</p>`;
    setTimeout(() => { overlay.remove(); showZeroPlansBanner(); }, 2500);
  }
}

function showZeroPlansBanner() {
  const existing = document.getElementById('zeroPlansBanner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'zeroPlansBanner';
  banner.style.cssText = 'position:sticky;top:0;z-index:200;background:#dc2626;color:#fff;text-align:center;padding:0.6rem 1rem;font-size:0.88rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:0.75rem;';
  banner.innerHTML = `<span>You have 0 free plans left this month.</span><a href="upgrade.html" onclick="trackEvent('upgrade_click',{source:'zero_plans_banner'})" style="background:rgba(255,255,255,0.25);color:#fff;padding:0.2rem 0.75rem;border-radius:2rem;font-weight:700;text-decoration:none;white-space:nowrap;">See Pro — 7 days free →</a><button onclick="this.parentElement.remove()" style="background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:1.1rem;line-height:1;margin-left:0.25rem;">✕</button>`;
  document.querySelector('.main-content').prepend(banner);
}

function captureUpgradeEmail() {
  const emailEl = document.getElementById('upgradeEmail');
  const email = emailEl ? emailEl.value.trim() : '';
  if (email) {
    fetch('/api/email-leads', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, source:'upgrade_prompt' }) }).catch(()=>{});
  }
  trackEvent('upgrade_click', { source: 'stripe_button' });
  // Both Stripe buttons in this modal are Pro, billed monthly (the discount
  // offer is $4 for the first month, then $8/month — still monthly billing).
  // Reliable send since these links can be followed before a plain fetch resolves.
  if (typeof mealzyTrackReliable === 'function') {
    mealzyTrackReliable('checkout_started', { tier: 'pro', billing: 'monthly' });
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

// === PLAN HISTORY ===
function saveToHistory(meals) {
  const history = JSON.parse(localStorage.getItem('mealzy_history') || '[]');
  history.unshift({ date: today, meals, generatedAt: new Date().toISOString() });
  if (history.length > 10) history.length = 10;
  localStorage.setItem('mealzy_history', JSON.stringify(history));
  localStorage.setItem('mealzy_last_generation', new Date().toISOString());
  renderRecentPlans();
}

function renderRecentPlans() {
  const history = JSON.parse(localStorage.getItem('mealzy_history') || '[]');
  const card = document.getElementById('recentPlansCard');
  const list = document.getElementById('recentPlansList');
  if (!card || !list) return;
  const recent = history.slice(0, 3);
  if (!recent.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  list.innerHTML = recent.map((entry, i) => {
    const d = new Date(entry.generatedAt);
    const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const meals = entry.meals || [];
    const mealCount = meals.length;
    const totalCals = meals.reduce((s, m) => s + (m.calories || 0), 0);
    return `<div class="recent-plan" style="${i < recent.length - 1 ? 'border-bottom:1px solid var(--clr-border);' : ''}">
      <div>
        <strong>${label}</strong>
        <span class="text-muted text-sm">${mealCount} meal${mealCount === 1 ? '' : 's'}${totalCals ? ` · ~${totalCals} kcal` : ''}</span>
      </div>
      <a href="#" class="recent-plan-link" onclick="loadRecentPlan(${i});return false;">Load plan →</a>
    </div>`;
  }).join('');
}

function loadRecentPlan(index) {
  const history = JSON.parse(localStorage.getItem('mealzy_history') || '[]');
  const entry = history[index];
  if (!entry) return;
  todayMeals = entry.meals.map(m => ({ ...m, completed: false }));
  const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
  plans[today] = { meals: todayMeals, generatedAt: new Date().toISOString() };
  localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));
  renderMeals();
  updateStats();
  showToast('Plan loaded!', 'success');
}

function checkRetentionBanners() {
  const banner = document.getElementById('retentionBanner');
  const bannerText = document.getElementById('retentionBannerText');
  if (!banner || !bannerText) return;
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const lastGen = localStorage.getItem('mealzy_last_generation');
  const daysSinceLast = lastGen ? (Date.now() - new Date(lastGen).getTime()) / 86400000 : Infinity;

  if (day === 0 && hour >= 17) {
    bannerText.textContent = 'Sunday evening — a great time to plan your meals for the week ahead.';
    banner.style.display = 'flex';
  } else if (daysSinceLast >= 7 && isFinite(daysSinceLast)) {
    const daysFloor = Math.floor(daysSinceLast);
    const weeksSince = Math.floor(daysFloor / 7);
    const timeLabel = weeksSince >= 1 ? `${weeksSince} week${weeksSince === 1 ? '' : 's'}` : `${daysFloor} days`;
    bannerText.textContent = `Your last plan was ${timeLabel} ago. Ready for a fresh week?`;
    banner.style.display = 'flex';
  }
}

// === SHARE PLAN ===
async function sharePlan() {
  const text = "I'm eating healthy with Mealzy! Check out my meal plan at mealzy.org";
  if (navigator.share) {
    try {
      await navigator.share({ title: 'My Mealzy Meal Plan', text, url: 'https://mealzy.org' });
      showToast('Shared!', 'success');
    } catch (e) {
      if (e.name !== 'AbortError') fallbackCopy(text);
    }
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Link copied!', 'success');
  }).catch(() => {
    showToast('Could not copy — please copy manually', 'error');
  });
}

// === MEAL SWAP ===
async function swapMeal(index) {
  const meal = todayMeals[index];
  const btn = document.getElementById(`swapBtn${index}`);
  const card = document.getElementById(`mealCard${index}`);
  if (!btn || !card) return;

  btn.disabled = true;
  btn.textContent = '… Swapping';
  card.style.opacity = '0.6';
  await refreshProfileFromServer();

  try {
    const response = await fetch('/api/generate-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, date: today, swap_meal_type: meal.type, is_pro: !!serverUser?.pro })
    });
    const data = await response.json();
    let newMeal = null;

    if (data.success && data.meal) {
      newMeal = { ...data.meal, completed: false };
    } else if (data.success && data.mealPlan && data.mealPlan.meals) {
      newMeal = data.mealPlan.meals.find(m => m.type === meal.type);
      if (newMeal) newMeal = { ...newMeal, completed: false };
    }

    if (!newMeal) {
      // Fallback: pick a different sample meal of same type
      const samples = getSampleMeals().filter(m => m.type === meal.type);
      newMeal = samples[0] ? { ...samples[0], completed: false } : null;
    }

    if (newMeal) {
      todayMeals[index] = newMeal;
      const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
      if (plans[today]) {
        plans[today].meals = todayMeals;
        localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));
      }
      renderMeals();
      updateStats();
      showToast('Meal swapped!', 'success');
    } else {
      showToast('Could not swap meal — try again', 'error');
      btn.disabled = false;
      btn.textContent = '↺ Swap';
      card.style.opacity = '';
    }
  } catch (err) {
    showToast('Server offline — swap unavailable', 'error');
    btn.disabled = false;
    btn.textContent = '↺ Swap';
    card.style.opacity = '';
  }
}

// === PWA INSTALL BANNER ===
let deferredPrompt = null;
function initPwaBanner() {
  if (localStorage.getItem('mealzy_pwa_dismissed')) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('pwaBanner').classList.add('show');
  });
  document.getElementById('pwaInstallBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem('mealzy_pwa_dismissed', '1');
    }
    deferredPrompt = null;
    document.getElementById('pwaBanner').classList.remove('show');
  });
}
function dismissPwaBanner() {
  localStorage.setItem('mealzy_pwa_dismissed', '1');
  document.getElementById('pwaBanner').classList.remove('show');
}

// === TRACK EVENT ===
