  // Auth guard
  (async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('mealzy_user', JSON.stringify({ name: data.name, email: data.email }));
        if (data.pro) localStorage.setItem('mealzy_pro', 'true');
        // Pre-fill first name only — data.name holds the full name
        if (data.name) {
          const firstName = data.name.trim().split(/\s+/)[0];
          const nameInput = document.getElementById('inputName');
          if (nameInput && !nameInput.value) nameInput.value = firstName;
          userData.name = firstName;
        }
      } else {
        localStorage.removeItem('mealzy_user');
        window.location.href = 'login.html?signup=1';
      }
    } catch(e) {
      if (!localStorage.getItem('mealzy_user')) window.location.href = 'login.html?signup=1';
    }
  })();

  function showStepError(msg) {
    const el = document.getElementById('stepError');
    el.textContent = msg;
    el.classList.add('show');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function hideStepError() {
    document.getElementById('stepError').classList.remove('show');
  }

  let currentStep = 1;
  const totalSteps = 7;

  const userData = {
    name: '',
    goal: '',
    dietaryPrefs: [],
    allergies: [],
    budget: 100,
    currency: 'USD',
    // Sensible defaults — user can refine in Settings
    sex: '',
    sexRefine: '',
    dateOfBirth: '',
    heightCm: null,
    weightKg: null,
    activityLevel: '',
    heightUnit: 'cm',
    weightUnit: 'kg',
    cookingSkill: 'intermediate',
    cookingTimeMinutes: 30,
    preferred_cuisine: '',
    language: 'en',
    dailyCalories: 2000,
    macros: { protein: 150, carbs: 200, fat: 67 }
  };

  function showStep(step) {
    document.querySelectorAll('.step-content').forEach(el => el.classList.add('hidden'));
    document.getElementById('step' + step).classList.remove('hidden');
    document.getElementById('btnBack').style.visibility = step > 1 ? 'visible' : 'hidden';
    document.getElementById('btnSkip').style.display = step < totalSteps ? 'inline-block' : 'none';
    document.getElementById('btnSkipDob').classList.toggle('hidden', step !== 3);
    const skipNote = document.getElementById('skipNote');
    if (skipNote) skipNote.style.display = step < totalSteps ? 'block' : 'none';
    const nextBtn = document.getElementById('btnNext');
    nextBtn.innerHTML = step === totalSteps
      ? `Create My Plan`
      : `Continue <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
    document.getElementById('obProgressFill').style.width = ((step / totalSteps) * 100) + '%';
    document.getElementById('stepProgress').setAttribute('aria-valuenow', step);
    document.getElementById('stepProgress').setAttribute('aria-label', 'Onboarding step ' + step + ' of ' + totalSteps);
  }

  function nextStep() {
    if (!validateStep(currentStep)) return;
    if (currentStep < totalSteps) {
      currentStep++;
      showStep(currentStep);
    } else {
      finishOnboarding();
    }
  }

  function prevStep() {
    hideStepError();
    if (currentStep > 1) { currentStep--; showStep(currentStep); }
  }

  function skipStep() {
    hideStepError();
    if (currentStep === 1) {
      const nameInput = document.getElementById('inputName');
      if (!nameInput.value.trim()) { nameInput.focus(); return; }
    }
    if (currentStep < totalSteps) { currentStep++; showStep(currentStep); }
  }

  function skipDob() {
    userData.dateOfBirth = '';
    hideStepError();
    if (currentStep < totalSteps) { currentStep++; showStep(currentStep); }
  }

  function validateStep(step) {
    hideStepError();
    if (step === 1) {
      userData.name = document.getElementById('inputName').value.trim();
      if (!userData.name) { showStepError('Please enter your name.'); return false; }
      if (!userData.goal) { showStepError('Please pick a goal to continue.'); return false; }
    }
    if (step === 2) {
      if (!userData.sex) { showStepError('Please select an option to continue.'); return false; }
      if (userData.sex === 'other' && !userData.sexRefine) { showStepError('Please choose how we should estimate your targets.'); return false; }
    }
    if (step === 3) {
      const m = document.getElementById('dobMonth').value;
      const d = document.getElementById('dobDay').value;
      const y = document.getElementById('dobYear').value;
      if (!m || !d || !y) { showStepError('Please enter your birthdate.'); return false; }
      userData.dateOfBirth = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }
    if (step === 4) {
      if (userData.heightUnit === 'cm') {
        const cm = parseFloat(document.getElementById('heightCm').value);
        if (!cm || cm < 100 || cm > 250) { showStepError('Please enter a valid height.'); return false; }
        userData.heightCm = cm;
      } else {
        const ft = parseFloat(document.getElementById('heightFt').value);
        const inch = parseFloat(document.getElementById('heightIn').value) || 0;
        if (!ft) { showStepError('Please enter a valid height.'); return false; }
        userData.heightCm = Math.round((ft * 12 + inch) * 2.54);
      }
    }
    if (step === 5) {
      const w = parseFloat(document.getElementById('weightInput').value);
      if (!w || w <= 0) { showStepError('Please enter a valid weight.'); return false; }
      userData.weightKg = userData.weightUnit === 'kg' ? w : Math.round(w * 0.453592 * 10) / 10;
    }
    if (step === 6) {
      if (!userData.activityLevel) { showStepError('Please select your activity level.'); return false; }
    }
    if (step === 7) {
      userData.budget = Math.min(Math.max(parseFloat(document.getElementById('inputBudget').value) || 100, 20), 1000);
      userData.currency = document.getElementById('selectCurrency').value;
      updateChipsData();
    }
    return true;
  }

  function selectGoal(el) {
    document.querySelectorAll('.goal-card').forEach(c => {
      c.classList.remove('selected');
      const inp = c.querySelector('input[type="radio"]');
      if (inp) inp.setAttribute('aria-checked', 'false');
    });
    el.classList.add('selected');
    const inp = el.querySelector('input[type="radio"]');
    if (inp) inp.setAttribute('aria-checked', 'true');
    userData.goal = el.dataset.goal;
    hideStepError();
  }

  function selectSex(el) {
    document.querySelectorAll('.sex-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    userData.sex = el.dataset.sex;
    const refineRow = document.getElementById('sexRefineRow');
    if (userData.sex === 'other') {
      refineRow.classList.remove('hidden');
    } else {
      refineRow.classList.add('hidden');
      userData.sexRefine = '';
    }
    hideStepError();
  }

  const ACTIVITY_MULTIPLIERS = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, extra: 1.9 };

  function setHeightUnit(unit) {
    userData.heightUnit = unit;
    document.querySelectorAll('#step4 .chip').forEach(c => c.classList.toggle('active', c.dataset.unit === unit));
    document.getElementById('heightCmRow').classList.toggle('hidden', unit !== 'cm');
    document.getElementById('heightFtInRow').classList.toggle('hidden', unit !== 'ftin');
  }

  function setWeightUnit(unit) {
    userData.weightUnit = unit;
    document.querySelectorAll('#step5 .chip').forEach(c => c.classList.toggle('active', c.dataset.unit === unit));
    document.getElementById('weightLabel').textContent = unit === 'kg' ? 'Weight (kg)' : 'Weight (lbs)';
    document.getElementById('weightInput').placeholder = unit === 'kg' ? '70' : '155';
  }

  function selectActivity(el) {
    document.querySelectorAll('#step6 .goal-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    userData.activityLevel = el.dataset.activity;
    hideStepError();
  }

  function selectSexRefine(el) {
    document.querySelectorAll('[data-refine]').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    el.setAttribute('aria-pressed', 'true');
    userData.sexRefine = el.dataset.refine;
    hideStepError();
  }

  function populateDobDropdowns() {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthSel = document.getElementById('dobMonth');
    months.forEach((m, i) => monthSel.appendChild(new Option(m, i + 1)));
    const daySel = document.getElementById('dobDay');
    for (let d = 1; d <= 31; d++) daySel.appendChild(new Option(d, d));
    const yearSel = document.getElementById('dobYear');
    const thisYear = new Date().getFullYear();
    yearSel.appendChild(new Option('Year', ''));
    for (let y = thisYear - 13; y >= thisYear - 100; y--) yearSel.appendChild(new Option(y, y));

    const today = new Date();
    monthSel.value = today.getMonth() + 1;
    daySel.value = today.getDate();
  }
  populateDobDropdowns();

  document.querySelectorAll('.goal-card').forEach(card => {
    card.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        selectGoal(card);
        card.querySelector('input[type="radio"]').checked = true;
      }
    });
  });

  function toggleChip(el) {
    el.classList.toggle('active');
    el.setAttribute('aria-pressed', el.classList.contains('active') ? 'true' : 'false');
    updateChipsData();
  }

  function updateChipsData() {
  const selected = Array.from(document.querySelectorAll('#dietChips .chip.active')).map(c => c.dataset.pref);
  // gluten_free / dairy_free must ALSO land in dietaryPrefs (hyphenated) so they match
  // server.js DIET_RULES['gluten-free'] / ['dairy-free'] — those have explicit banned-ingredient
  // lists (wheat, barley, soy sauce / milk, whey, casein). Without this they only ever hit the
  // generic allergyBlock warning and lose the detailed enforcement.
  const dietRuleChips = { gluten_free: 'gluten-free', dairy_free: 'dairy-free' };
  // nut_free / fish_free have no DIET_RULES entry server-side — allergy-only is correct for these.
  const allergyOnlyPrefs = ['nut_free', 'fish_free'];

  userData.dietaryPrefs = selected
    .filter(p => !allergyOnlyPrefs.includes(p) && !dietRuleChips[p])
    .concat(Object.keys(dietRuleChips).filter(p => selected.includes(p)).map(p => dietRuleChips[p]));

  userData.allergies = selected
    .filter(p => allergyOnlyPrefs.includes(p) || dietRuleChips[p])
    .map(p => p.replace('_free', '').replace('no_', ''));

  // Also merge "no_pork" etc
  if (selected.includes('no_pork')) userData.allergies.push('pork');
}

  function calcNutrition() {
    // Sensible defaults based on goal
    const caloriesByGoal = {
      lose_weight: 1700,
      build_muscle: 2500,
      gain_weight: 2800,
      maintain_weight: 2000,
      eat_healthier: 2000,
      improve_energy: 2000
    };
    const calories = caloriesByGoal[userData.goal] || 2000;
    const protein  = Math.round(calories * 0.30 / 4);
    const carbs    = Math.round(calories * 0.40 / 4);
    const fat      = Math.round(calories * 0.30 / 9);
    userData.dailyCalories = calories;
    userData.macros = { protein, carbs, fat };
    return { calories, protein, carbs, fat };
  }

  async function finishOnboarding() {
    const btn = document.getElementById('btnNext');
    btn.disabled = true;
    btn.textContent = 'Setting up...';

    calcNutrition();
    updateChipsData();

    const profile = {
      ...userData,
      createdAt: new Date().toISOString(),
      streak: 1,
      weekStreak: 0,
      xp: 0,
      level: 1,
      lastActiveDate: new Date().toISOString().split('T')[0]
    };

    localStorage.setItem('mealzy_profile', JSON.stringify(profile));
    localStorage.setItem('mealzy_is_new_user', '1');

    // Save profile to server
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile })
      });
    } catch(e) { /* localStorage fallback */ }

    // Award onboarding XP on the server
    try {
      await fetch('/api/xp/award', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'onboarding' })
      });
    } catch(e) {}

    // Redirect to dashboard with autoGenerate flag
    window.location.href = 'dashboard.html?autoGenerate=1';
  }
