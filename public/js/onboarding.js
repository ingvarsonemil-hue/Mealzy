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
      userData.name = document.getElementById('inputName').value.trim();
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
      const dobStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dobDate = new Date(dobStr + 'T00:00:00');
      if (Number.isNaN(dobDate.getTime())) { showStepError('Please enter a valid birthdate.'); return false; }
      const now = new Date();
      let age = now.getFullYear() - dobDate.getFullYear();
      const hadBirthdayThisYear = (now.getMonth() > dobDate.getMonth()) ||
        (now.getMonth() === dobDate.getMonth() && now.getDate() >= dobDate.getDate());
      if (!hadBirthdayThisYear) age--;
      if (age < 13 || age > 120) { showStepError('Please enter a valid birthdate (ages 13+).'); return false; }
      userData.dateOfBirth = dobStr;
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
      const bounds = budgetBoundsFor(document.getElementById('selectCurrency').value);
      userData.budget = Math.min(Math.max(parseFloat(document.getElementById('inputBudget').value) || bounds.def, bounds.min), bounds.max);
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
    monthSel.appendChild(new Option('Month', ''));
    months.forEach((m, i) => monthSel.appendChild(new Option(m, i + 1)));
    const daySel = document.getElementById('dobDay');
    daySel.appendChild(new Option('Day', ''));
    for (let d = 1; d <= 31; d++) daySel.appendChild(new Option(d, d));
    const yearSel = document.getElementById('dobYear');
    const thisYear = new Date().getFullYear();
    yearSel.appendChild(new Option('Year', ''));
    for (let y = thisYear - 13; y >= thisYear - 100; y--) yearSel.appendChild(new Option(y, y));
  }
  populateDobDropdowns();

  // Currencies whose common unit is worth far less than $1 (JPY, IDR, etc.) —
  // a "100" budget default in those units is not a plausible weekly grocery
  // spend and gets fed straight into the AI prompt as a literal budget figure.
  const LOW_VALUE_CURRENCIES = ['JPY', 'IDR', 'KRW', 'HUF'];
  function budgetBoundsFor(currency) {
    return LOW_VALUE_CURRENCIES.includes(currency)
      ? { min: 2000, max: 100000, def: 10000 }
      : { min: 20, max: 1000, def: 100 };
  }

  let budgetTouched = false;
  function initBudgetCurrency() {
    const budgetInput = document.getElementById('inputBudget');
    const currencySelect = document.getElementById('selectCurrency');
    budgetInput.addEventListener('input', () => { budgetTouched = true; });
    currencySelect.addEventListener('change', () => {
      const bounds = budgetBoundsFor(currencySelect.value);
      budgetInput.min = bounds.min;
      budgetInput.max = bounds.max;
      if (!budgetTouched) {
        budgetInput.value = bounds.def;
        budgetInput.placeholder = String(bounds.def);
      }
    });
  }
  initBudgetCurrency();

  // Region -> currency, read from the browser's own locale rather than IP
  // lookup. Countries sharing the euro map to EUR explicitly since their
  // region codes don't share a pattern to detect.
  const REGION_CURRENCY = {
    JP: 'JPY', KR: 'KRW', ID: 'IDR', HU: 'HUF',
    GB: 'GBP', CA: 'CAD', AU: 'AUD', US: 'USD',
    SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF',
    CN: 'CNY', IN: 'INR', BR: 'BRL', MX: 'MXN', AR: 'ARS', ZA: 'ZAR',
    AE: 'AED', SA: 'SAR', SG: 'SGD', HK: 'HKD', PL: 'PLN', CZ: 'CZK',
    TR: 'TRY', TH: 'THB', MY: 'MYR', PH: 'PHP', NZ: 'NZD'
  };
  const EU_REGIONS = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'IE', 'PT', 'FI', 'GR', 'LU', 'SK', 'SI', 'EE', 'LV', 'LT', 'CY', 'MT'];
  // Timezone fallback for locales like "en" with no region subtag.
  const TZ_CURRENCY = [
    [/^Asia\/Tokyo/, 'JPY'], [/^Asia\/Seoul/, 'KRW'], [/^Asia\/Jakarta/, 'IDR'],
    [/^Europe\/Budapest/, 'HUF'], [/^Europe\/London/, 'GBP'], [/^Europe\//, 'EUR']
  ];
  function detectCurrencyFromLocale() {
    try {
      const region = (navigator.language || '').split('-')[1];
      if (region) {
        const code = region.toUpperCase();
        if (REGION_CURRENCY[code]) return REGION_CURRENCY[code];
        if (EU_REGIONS.includes(code)) return 'EUR';
      }
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const match = TZ_CURRENCY.find(([re]) => re.test(tz));
      return match ? match[1] : null;
    } catch (e) {
      return null;
    }
  }

  // Only auto-detect when there's no explicit signal already: a budget
  // handed off from the homepage demo is always a dollar figure (the hero
  // slider is USD-only), so it implies USD rather than the visitor's locale.
  function initCurrencyAutoDetect(hasBudgetParam) {
    if (hasBudgetParam) return;
    const currencySelect = document.getElementById('selectCurrency');
    const detected = detectCurrencyFromLocale();
    if (!detected || detected === currencySelect.value) return;
    const hasOption = Array.from(currencySelect.options).some(o => o.value === detected);
    if (!hasOption) return;
    currencySelect.value = detected;
    const budgetInput = document.getElementById('inputBudget');
    const bounds = budgetBoundsFor(detected);
    budgetInput.min = bounds.min;
    budgetInput.max = bounds.max;
    if (!budgetTouched) {
      budgetInput.value = bounds.def;
      budgetInput.placeholder = String(bounds.def);
    }
    userData.currency = detected;
  }

  // Pre-fill from the homepage demo's handoff (?budget=&diet=/&dietary=), set
  // on login.html by InteractiveOnboarding.jsx and forwarded here by login.js.
  // Untrusted input: the diet value is only accepted if it matches a real chip.
  function prefillFromQueryParams() {
    const qs = new URLSearchParams(window.location.search);
    const budgetParam = parseFloat(qs.get('budget'));
    const hasBudgetParam = Number.isFinite(budgetParam) && budgetParam > 0;
    if (hasBudgetParam) {
      const clamped = Math.min(Math.max(Math.round(budgetParam), 20), 1000);
      document.getElementById('inputBudget').value = clamped;
      budgetTouched = true;
    }
    initCurrencyAutoDetect(hasBudgetParam);
    const dietParam = qs.get('diet') || qs.get('dietary');
    if (dietParam) {
      const chip = Array.from(document.querySelectorAll('#dietChips .chip'))
        .find(c => c.dataset.pref === dietParam);
      if (chip && !chip.classList.contains('active')) toggleChip(chip);
    }
  }
  prefillFromQueryParams();

  showStep(currentStep);

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
    // Age from DOB. If DOB was skipped ("Prefer not to say"), fall back to 30 —
    // matches the existing default already used elsewhere in this codebase
    // (server.js AI coach profile destructure uses the same age:30 fallback).
    let age = 30;
    if (userData.dateOfBirth) {
      const dob = new Date(userData.dateOfBirth + 'T00:00:00');
      const now = new Date();
      age = now.getFullYear() - dob.getFullYear();
      const hadBirthdayThisYear = (now.getMonth() > dob.getMonth()) ||
        (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
      if (!hadBirthdayThisYear) age--;
    }

    // Mifflin-St Jeor sex term: +5 male, -161 female. -78 (the midpoint) is used
    // for "prefer not to say", or "Other" without a specific refine choice —
    // this is a disclosed estimate, not a guess, consistent with the sexRefine
    // UI built on step 2.
    let sexOffset = -78;
    if (userData.sex === 'male') sexOffset = 5;
    else if (userData.sex === 'female') sexOffset = -161;
    else if (userData.sex === 'other') {
      if (userData.sexRefine === 'male') sexOffset = 5;
      else if (userData.sexRefine === 'female') sexOffset = -161;
      // else stays -78 (split the difference)
    }
    // userData.sex === 'unspecified' also falls through to -78

    const weightKg = userData.weightKg || 70;
    const heightCm = userData.heightCm || 170;

    const bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + sexOffset;

    const multiplier = ACTIVITY_MULTIPLIERS[userData.activityLevel] || 1.55;
    const tdee = bmr * multiplier;

    const goalAdjustment = {
      lose_weight: -500,
      build_muscle: 300,
      gain_weight: 500,
      maintain_weight: 0,
      eat_healthier: 0,
      improve_energy: 0
    };
    let calories = Math.round(tdee + (goalAdjustment[userData.goal] || 0));
    calories = Math.min(4000, Math.max(1200, calories)); // same safety clamp used server-side

    const protein = Math.round(calories * 0.30 / 4);
    const carbs   = Math.round(calories * 0.40 / 4);
    const fat     = Math.round(calories * 0.30 / 9);
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

    // Redirect straight to the meal planner with autoGenerate flag
    window.location.href = 'meal-planner.html?autoGenerate=1';
  }
