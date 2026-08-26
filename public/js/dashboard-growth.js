// Mealzy dashboard (3/4: achievement/share cards, PWA/welcome/re-engagement, print).

function trackEvent(event, data) {
  mealzyTrack(event, data);
}

function generateAchievementCard() {
  if (!profile) return;
  const xp = profile.xp || 0;
  const weekStreak = profile.weekStreak || 0;
  const earnedBadges = [];
  const firstName = (serverUser?.name || profile.name || 'Meal Planner').split(' ')[0];
  const levelObj = { level: 1, title: 'Planner', emoji: '⭐' };
  const nextObj = null;
  const pct = 100;

  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, 800);
  bg.addColorStop(0, '#162b1f');
  bg.addColorStop(1, '#0c1a12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 800, 800);

  // Radial glow from centre
  const glow = ctx.createRadialGradient(400, 300, 0, 400, 300, 420);
  glow.addColorStop(0, 'rgba(61,139,94,0.22)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 800, 800);

  // Top + bottom accent bars
  ctx.fillStyle = '#3d8b5e';
  ctx.fillRect(0, 0, 800, 5);
  ctx.fillRect(0, 795, 800, 5);

  // Wordmark
  ctx.font = '700 26px -apple-system,BlinkMacSystemFont,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#3d8b5e';
  ctx.fillText('Mealzy', 400, 68);

  // Thin separator
  ctx.strokeStyle = 'rgba(61,139,94,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(120, 88); ctx.lineTo(680, 88); ctx.stroke();

  // Level circle
  ctx.beginPath();
  ctx.arc(400, 200, 60, 0, Math.PI * 2);
  ctx.fillStyle = '#3d8b5e';
  ctx.fill();
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Level number inside circle
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(levelObj.level.toString(), 400, 200);

  // "LEVEL" label below circle
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#4ade80';
  ctx.font = '600 14px Inter, sans-serif';
  ctx.fillText('LEVEL', 400, 282);

  // Level title
  ctx.font = '900 52px -apple-system,BlinkMacSystemFont,sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(levelObj.title, 400, 325);

  // User name
  ctx.font = '400 22px -apple-system,BlinkMacSystemFont,sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(firstName, 400, 363);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(160, 395); ctx.lineTo(640, 395); ctx.stroke();

  // Stats: XP | Streak | Badges
  [
    { v: xp.toLocaleString(), l: 'XP' },
    { v: weekStreak + 'w',    l: 'STREAK' },
    { v: String(earnedBadges.length), l: 'BADGES' },
  ].forEach(function(s, i) {
    const x = 200 + i * 200;
    ctx.font = '800 38px -apple-system,BlinkMacSystemFont,sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(s.v, x, 462);
    ctx.font = '600 12px -apple-system,BlinkMacSystemFont,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.fillText(s.l, x, 484);
  });

  // XP progress bar
  if (nextObj) {
    const bx = 150, by = 520, bw = 500, bh = 10, br = 5;
    _rr(ctx, bx, by, bw, bh, br); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
    _rr(ctx, bx, by, Math.max(bh, bw * pct / 100), bh, br); ctx.fillStyle = '#3d8b5e'; ctx.fill();
    ctx.font = '400 13px -apple-system,BlinkMacSystemFont,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.fillText(xp + ' / ' + nextObj.xpNeeded + ' XP  ·  Level ' + nextObj.level + ' next', 400, 553);
  }

  // Badge circles row
  if (earnedBadges.length > 0) {
    const badgeColors = ['#4ade80', '#facc15', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c', '#34d399'];
    const badgeSize = 24;
    const totalBadges = earnedBadges.length;
    const startX = 400 - (totalBadges * (badgeSize * 2 + 8)) / 2 + badgeSize;
    earnedBadges.forEach(function(badge, i) {
      const bx = startX + i * (badgeSize * 2 + 8);
      const by = 620;
      ctx.beginPath();
      ctx.arc(bx, by, badgeSize, 0, Math.PI * 2);
      ctx.fillStyle = badgeColors[i % badgeColors.length];
      ctx.fill();
      ctx.fillStyle = '#1a3d2b';
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((i + 1).toString(), bx, by);
    });
    ctx.textBaseline = 'alphabetic';
  }

  // Tagline
  ctx.font = '400 15px -apple-system,BlinkMacSystemFont,sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.textAlign = 'center';
  ctx.fillText('AI-powered meal planning that fits your life and budget', 400, 672);

  // URL pill
  _rr(ctx, 287, 697, 226, 38, 19); ctx.fillStyle = 'rgba(61,139,94,0.2)'; ctx.fill();
  ctx.font = '700 16px -apple-system,BlinkMacSystemFont,sans-serif';
  ctx.fillStyle = '#3d8b5e';
  ctx.textAlign = 'center';
  ctx.fillText('mealzy.org', 400, 722);

  _showShareModal(canvas.toDataURL('image/png'), levelObj, xp, weekStreak);
}

function _rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function _showShareModal(dataUrl, levelObj, xp, weekStreak) {
  let modal = document.getElementById('shareCardModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'shareCardModal';
    modal.className = 'modal-overlay';
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  const tweet = encodeURIComponent(
    'I just reached ' + levelObj.title + ' on Mealzy ' + levelObj.emoji +
    '\n\n' + xp + ' XP · ' + weekStreak + '-week streak' +
    '\n\nAI meal planning that fits your budget → mealzy.org'
  );
  modal.innerHTML =
    '<div class="modal" style="max-width:480px;text-align:center;padding:1.75rem;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.1rem;">' +
        '<h2 style="font-size:1.05rem;font-weight:800;margin:0;">Your Achievement Card</h2>' +
        '<button onclick="document.getElementById(\'shareCardModal\').classList.remove(\'open\')" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--clr-muted-fg);line-height:1;">✕</button>' +
      '</div>' +
      '<img src="' + dataUrl + '" alt="Mealzy achievement card" width="480" height="300" loading="lazy" style="width:100%;height:auto;border-radius:0.75rem;margin-bottom:1.1rem;box-shadow:0 4px 20px rgba(26,61,43,0.18);" />' +
      '<div style="display:flex;gap:0.65rem;justify-content:center;flex-wrap:wrap;">' +
        '<a href="' + dataUrl + '" download="mealzy-achievement.png" class="btn btn-primary">Download</a>' +
        '<a href="https://x.com/intent/tweet?text=' + tweet + '" target="_blank" rel="noopener" class="btn btn-outline">Share on X</a>' +
      '</div>' +
      '<p style="font-size:0.72rem;color:var(--clr-muted-fg);margin-top:0.75rem;line-height:1.5;">Download the card first, then attach it to your post on X or Instagram.</p>' +
    '</div>';
  modal.classList.add('open');
}

// ── Loading animation ────────────────────────────────────────────────────
let _loadingTimer = null;
const LOADING_MSGS = [
  'Calculating your macros...',
  'Building your grocery list...',
  'Optimising for your budget...',
  'Selecting the best proteins...',
  'Balancing your daily nutrients...',
  'Almost ready — adding the final touches...'
];

function startLoadingAnimation() {
  let i = 0;
  const msgEl  = document.getElementById('loadingMsg');
  const barEl  = document.getElementById('loadingBar');
  if (!msgEl || !barEl) return;
  msgEl.textContent = LOADING_MSGS[0];
  barEl.style.width = '10%';
  _loadingTimer = setInterval(() => {
    i = Math.min(i + 1, LOADING_MSGS.length - 1);
    msgEl.style.opacity = '0';
    setTimeout(() => {
      msgEl.textContent = LOADING_MSGS[i];
      msgEl.style.opacity = '1';
    }, 150);
    barEl.style.width = Math.min(90, 10 + (i / (LOADING_MSGS.length - 1)) * 80) + '%';
  }, 2000);
}

function stopLoadingAnimation() {
  if (_loadingTimer) { clearInterval(_loadingTimer); _loadingTimer = null; }
  const barEl = document.getElementById('loadingBar');
  if (barEl) barEl.style.width = '100%';
}

// === PRO STATUS ===
// serverUser is the authoritative source (set from /api/auth/me — see
// dashboard-today.js init()). If the initial fetch failed and this runs
// before the 2s retry resolves, serverUser is still null — that's an
// UNKNOWN state, not "Free". checkProStatus() is called again with
// serverUser populated the moment the retry succeeds (see init()'s retry
// path), which replaces this neutral state with the real tier.
// renderPlanEntitlement()/resolveIsPro() (public/js/pro-status.js) are the
// shared implementation every authenticated page uses — this wrapper just
// keeps the existing call sites (dashboard-today.js, dashboard-panels.js)
// unchanged.
function checkProStatus() {
  renderPlanEntitlement(serverUser);
}

// === WELCOME MESSAGE (?new=true or mealzy_is_new_user flag) ===
function checkWelcomeMessage() {
  const params = new URLSearchParams(window.location.search);
  const isNew = params.get('new') === 'true' || localStorage.getItem('mealzy_is_new_user') === '1';
  if (isNew) {
    showToast(`Welcome to Mealzy, ${profile.name || 'there'}! Generate your first meal plan below.`, 'success');
    localStorage.removeItem('mealzy_is_new_user');
    const url = new URL(window.location.href);
    url.searchParams.delete('new');
    window.history.replaceState({}, '', url);
  }
}

// === WEEKLY RE-ENGAGEMENT (Sunday new-week nudge) ===
function checkWeeklyReengagement() {
  const now = new Date();
  const isSunday = now.getDay() === 0;
  if (!isSunday) return;
  const todayStr = now.toISOString().split('T')[0];
  const lastSeen = localStorage.getItem('mealzy_sunday_nudge_shown');
  if (lastSeen === todayStr) return; // already shown today
  localStorage.setItem('mealzy_sunday_nudge_shown', todayStr);

  // Check if they have a current plan already (skip nudge if plan generated today)
  const lastGenerated = localStorage.getItem('mealzy_last_generated_date');
  if (lastGenerated === todayStr) return;

  setTimeout(() => {
    showToast('🗓️ New week starting — your meal plan is waiting. Generate now and your grocery list will be ready before Monday!', 'success');
    // Also show a banner
    const banner = document.createElement('div');
    banner.id = 'sundayNudgeBanner';
    banner.style.cssText = 'margin-bottom:1.5rem;padding:1rem 1.25rem;border-radius:0.75rem;background:hsl(270,60%,96%);border:1px solid hsl(270,60%,80%);color:hsl(270,60%,25%);display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;';
    banner.innerHTML = `
      <div>
        <strong>🗓️ New week starting!</strong>
        <span style="font-size:0.88rem;"> Your meal plan is waiting — generate now and your grocery list will be ready before Monday.</span>
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center;white-space:nowrap;">
        <button onclick="generateMealPlan();document.getElementById('sundayNudgeBanner').remove();" style="background:hsl(270,60%,55%);color:white;border:none;padding:0.35rem 0.9rem;border-radius:0.5rem;font-weight:700;font-size:0.82rem;cursor:pointer;">Generate Now →</button>
        <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:hsl(270,60%,35%);font-size:1rem;line-height:1;">✕</button>
      </div>`;
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.prepend(banner);
  }, 1500);
}

function dismissSoftBanner() {
  // kept as no-op — banner removed, called from legacy code paths
}

// === REFERRAL BANNER ===
function showReferralBanner() {
  const lsUser = JSON.parse(localStorage.getItem('mealzy_user') || '{}');
  const email = lsUser.email || '';
  if (!email) return;
  const refCode = localStorage.getItem('mealzy_ref_code');
  const refParam = refCode || encodeURIComponent(email);
  const refLink = `${window.location.origin}/?ref=${refParam}`;
  const input = document.getElementById('referralLink');
  if (input) input.value = refLink;
  document.getElementById('referralBanner').style.display = '';
}

function copyReferralLink() {
  const input = document.getElementById('referralLink');
  if (!input) return;
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Referral link copied! 🎁', 'success');
    trackEvent('share_click', { type: 'referral_copy' });
  }).catch(() => {
    input.select();
    document.execCommand('copy');
    showToast('Link copied!', 'success');
  });
}

function shareWhatsApp() {
  const input = document.getElementById('referralLink');
  const link = input ? input.value : 'https://mealzy.org';
  const msg = encodeURIComponent(`I've been using Mealzy to plan my meals with AI — it's brilliant! Try it free: ${link}`);
  window.open(`https://wa.me/?text=${msg}`, '_blank');
  trackEvent('share_click', { type: 'whatsapp' });
}

function shareFacebook() {
  const input = document.getElementById('referralLink');
  const link = input ? input.value : 'https://mealzy.org';
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, '_blank');
  trackEvent('share_click', { type: 'facebook' });
}

function copyShareMessage() {
  const input = document.getElementById('referralLink');
  const link = input ? input.value : 'https://mealzy.org';
  const msg = `I've been using Mealzy to plan my meals with AI — it's brilliant! Try it free: ${link}`;
  navigator.clipboard.writeText(msg).then(() => {
    showToast('Message copied!', 'success');
    trackEvent('share_click', { type: 'copy_message' });
  }).catch(() => showToast('Could not copy', 'error'));
}

// === TOP BAR OVERFLOW MENU ===
function toggleTopBarMenu(e) {
  e.stopPropagation();
  const panel = document.getElementById('topBarMenuPanel');
  const btn = document.getElementById('topBarMenuBtn');
  const isOpen = panel.style.display === 'block';
  panel.style.display = isOpen ? 'none' : 'block';
  btn.setAttribute('aria-expanded', String(!isOpen));
}
function closeTopBarMenu() {
  document.getElementById('topBarMenuPanel').style.display = 'none';
  document.getElementById('topBarMenuBtn').setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', (e) => {
  const panel = document.getElementById('topBarMenuPanel');
  if (panel && panel.style.display === 'block' && !panel.contains(e.target) && e.target.id !== 'topBarMenuBtn') {
    closeTopBarMenu();
  }
});

// === GENERATE SHARE CARD (Canvas API) ===
function generateShareCard() {
  trackEvent('share_click', { type: 'share_card' });
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#1a4731');
  grad.addColorStop(1, '#2e7d4f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Decorative circle
  ctx.beginPath();
  ctx.arc(canvas.width - 80, 120, 320, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();

  // Logo
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 68px Arial, sans-serif';
  ctx.fillText('🥗 Mealzy', 80, 130);

  // Tagline
  ctx.font = '400 34px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('My AI meal plan — powered by mealzy.org', 80, 190);

  // Meals
  if (todayMeals && todayMeals.length > 0) {
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText("TODAY'S MEALS", 80, 290);
    const icons = ['🌅','☀️','🍎','🌙'];
    todayMeals.slice(0, 4).forEach((meal, i) => {
      ctx.font = 'bold 40px Arial, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${icons[i] || '🍽️'}  ${meal.name}`, 80, 370 + i * 130);
      ctx.font = '400 26px Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(`   ${meal.calories} kcal · ${meal.protein}g protein`, 80, 415 + i * 130);
    });
  } else {
    ctx.font = 'bold 56px Arial, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('Eating healthy,', 80, 420);
    ctx.fillText('effortlessly. ✨', 80, 500);
  }

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(80, canvas.height - 195, canvas.width - 160, 1);

  // CTA
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('Try it free → mealzy.org', 80, canvas.height - 130);
  ctx.font = '400 24px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('Powered by Mealzy · AI Meal Planning', 80, canvas.height - 80);

  // Download
  const a = document.createElement('a');
  a.download = 'mealzy-meal-plan.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
  showToast('Share card downloaded! Share it anywhere 📲', 'success');
}

// === PRINT / PDF EXPORT (Pro only) ===
function printMealPlan() {
  const isPro = !!serverUser?.pro;
  if (!isPro) {
    trackEvent('pdf_export_blocked', { source: 'print_btn' });
    // Show upgrade prompt with PDF-specific messaging
    const lsUser = JSON.parse(localStorage.getItem('mealzy_user') || '{}');
    const prefillEmail = (lsUser.email || '').replace(/"/g, '&quot;');
    const existing = document.getElementById('upgradePrompt');
    if (existing) { existing.remove(); }
    const prompt = document.createElement('div');
    prompt.id = 'upgradePrompt';
    prompt.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(26,61,43,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1.5rem;';
    prompt.innerHTML = `
      <div style="background:#fff;border-radius:1.25rem;padding:2rem;max-width:420px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(26,61,43,0.25);position:relative;">
        <button onclick="document.getElementById('upgradePrompt').remove()" style="position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.3rem;cursor:pointer;color:#999;">✕</button>

        <h2 style="font-size:1.25rem;font-weight:800;margin-bottom:0.5rem;color:#111;">PDF Export is a Pro feature</h2>
        <p style="color:#555;font-size:0.88rem;margin-bottom:1rem;line-height:1.6;">Upgrade to Pro to download your meal plan and grocery list as a clean PDF you can print or share.</p>
        <div style="background:#f0fdf4;border-radius:0.75rem;padding:0.75rem;margin-bottom:1rem;font-size:0.82rem;color:#166534;text-align:left;">
          Download meal plan as PDF<br>
          Grocery list as PDF<br>
          Unlimited meal plans<br>
          Unlimited AI coaching
        </div>
        <input type="email" id="upgradeEmailPdf" value="${prefillEmail}" placeholder="Your email" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:0.5rem;padding:0.65rem 0.75rem;font-size:0.88rem;margin-bottom:0.75rem;font-family:inherit;" />
        <a href="${window.STRIPE_MONTHLY || 'https://buy.stripe.com/28E28r1Q73q0e6neQRffy00'}" onclick="(function(){const e=document.getElementById('upgradeEmailPdf');if(e&&e.value)fetch('/api/email-leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e.value.trim(),source:'pdf_upgrade'})}).catch(()=>{});trackEvent('upgrade_click',{source:'pdf_btn'});document.getElementById('upgradePrompt').remove();})()" target="_blank" style="display:block;background:#2e7d4f;color:white;padding:0.9rem;border-radius:0.75rem;font-weight:700;text-decoration:none;margin-bottom:0.5rem;font-size:0.95rem;">Upgrade to Pro — $8/month →</a>
        <a href="upgrade.html" style="font-size:0.82rem;color:#666;text-decoration:underline;">Learn more about Pro</a>
      </div>`;
    document.body.appendChild(prompt);
    prompt.addEventListener('click', e => { if (e.target === prompt) prompt.remove(); });
    return;
  }
  // Pro user — print immediately
  trackEvent('pdf_export', { source: 'print_btn' });
  window.print();
}

// === G KEY SHORTCUT ===
