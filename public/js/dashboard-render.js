  function renderMeals() {
    const container = document.getElementById('mealsContainer');
    if (!todayMeals || todayMeals.length === 0) {
      container.innerHTML = '';
      document.getElementById('emptyState').style.display = 'block';
      return;
    }
    document.getElementById('emptyState').style.display = 'none';

    const mealFallbacks = {
      breakfast: 'https://images.unsplash.com/photo-1484723091739-30a097e8f929?w=400&q=80',
      lunch: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&q=80',
      dinner: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80',
      snack: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80'
    };

    function getMealImageByType(meal) {
      return meal.image_url || mealFallbacks[meal.type] || mealFallbacks.lunch;
    }

    const ratings = JSON.parse(localStorage.getItem('mealzy_ratings') || '{}');

    const dayCompleteKey = 'mealzy_day_complete_' + today;
    const mealOrder = ['breakfast', 'lunch', 'snack', 'dinner'];
    todayMeals.sort((a, b) => mealOrder.indexOf(a.type) - mealOrder.indexOf(b.type));
    container.innerHTML = `<div class="grid-2" role="list">${todayMeals.map((meal, i) => {
      const r = ratings[meal.name] || 0;
      const typeLabel = meal.type.charAt(0).toUpperCase() + meal.type.slice(1);
      return `
      <div class="meal-card-v2 mcv2-${meal.type} ${meal.completed ? 'completed' : ''}" id="mealCard${i}" role="listitem">
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
            Mark as done
          </label>
          <div class="mcv2-btns">
            <button class="btn btn-outline btn-sm" onclick="openRecipeModal(${i})">Recipe</button>
            <button class="btn btn-outline btn-sm" id="swapBtn${i}" onclick="swapMeal(${i})" aria-label="Swap meal">Swap</button>
          </div>
        </div>
        <div class="mcv2-rate">
          <span class="mcv2-rate-lbl">Rate:</span>
          <button onclick="rateMeal(${i}, 1)" style="background:${r===1?'hsl(152,52%,92%)':'var(--clr-muted-bg)'};border:1px solid ${r===1?'hsl(152,52%,70%)':'var(--clr-border)'};border-radius:0.5rem;padding:0.3rem 0.55rem;cursor:pointer;display:inline-flex;align-items:center;color:${r===1?'var(--clr-primary)':'var(--clr-muted-fg)'};" title="Like — more like this" aria-label="Like this meal">${ICO.thumbUp}</button>
          <button onclick="rateMeal(${i}, -1)" style="background:${r===-1?'hsl(0,72%,95%)':'var(--clr-muted-bg)'};border:1px solid ${r===-1?'hsl(0,72%,80%)':'var(--clr-border)'};border-radius:0.5rem;padding:0.3rem 0.55rem;cursor:pointer;display:inline-flex;align-items:center;color:${r===-1?'var(--clr-destructive)':'var(--clr-muted-fg)'};" title="Dislike — avoid next time" aria-label="Dislike this meal">${ICO.thumbDn}</button>
          ${r===1?'<span style="font-size:0.78rem;color:var(--clr-primary);">More like this</span>':''}
          ${r===-1?'<span style="font-size:0.78rem;color:var(--clr-destructive);">Will be avoided</span>':''}
        </div>
      </div>`;
    }).join('')}</div>`;

    if (!localStorage.getItem(dayCompleteKey)) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin-top:1rem;text-align:center;';
      wrap.innerHTML = '<button id="markDayCompleteBtn" class="btn btn-outline" onclick="markDayComplete(this)">Mark day complete</button>';
      container.appendChild(wrap);
    }
  }

  function markDayComplete(btn) {
    const dayKey = 'mealzy_day_complete_' + today;
    if (localStorage.getItem(dayKey)) return;
    localStorage.setItem(dayKey, '1');
    btn.disabled = true;
    btn.textContent = 'Day complete!';
    showToast('Day complete!', 'success');
  }

  function updateStats() {
    const noPlan = !todayMeals || todayMeals.length === 0;
    const ringsGrid = document.querySelector('.rings-grid-v2');
    let macroEmpty = document.getElementById('macroEmptyState');
    if (noPlan) {
      if (ringsGrid) ringsGrid.style.display = 'none';
      if (!macroEmpty) {
        macroEmpty = document.createElement('p');
        macroEmpty.id = 'macroEmptyState';
        macroEmpty.style.cssText = 'text-align:center;color:var(--clr-muted-fg);font-size:0.88rem;padding:1.25rem 0;margin:0;';
        macroEmpty.textContent = "Generate today's plan to see your macros.";
        if (ringsGrid) ringsGrid.parentNode.insertBefore(macroEmpty, ringsGrid.nextSibling);
      }
      if (macroEmpty) macroEmpty.style.display = '';
    } else {
      if (ringsGrid) ringsGrid.style.display = '';
      if (macroEmpty) macroEmpty.style.display = 'none';
    }

    const completedMeals = todayMeals.filter(m => m.completed);
    const totalCals = completedMeals.reduce((s, m) => s + (m.calories || 0), 0);
    const totalProtein = completedMeals.reduce((s, m) => s + (m.protein || 0), 0);
    const totalCarbs = completedMeals.reduce((s, m) => s + (m.carbs || 0), 0);
    const totalFat = completedMeals.reduce((s, m) => s + (m.fat || 0), 0);

    const goalCals = profile?.dailyCalories || 2000;
    const goalProtein = profile?.macros?.protein || 150;
    const goalCarbs = profile?.macros?.carbs || 200;
    const goalFat = profile?.macros?.fat || 67;

    document.getElementById('statCalories').textContent = totalCals;
    document.getElementById('statCaloriesSub').textContent = `of ${goalCals} kcal goal`;
    document.getElementById('caloriesProgress').style.width = Math.min(100, (totalCals / goalCals) * 100) + '%';

    document.getElementById('statProtein').textContent = totalProtein + 'g';
    document.getElementById('statProteinSub').textContent = `of ${goalProtein}g goal`;
    document.getElementById('proteinProgress').style.width = Math.min(100, (totalProtein / goalProtein) * 100) + '%';

    document.getElementById('statMealsDone').textContent = `${completedMeals.length}/${todayMeals.length}`;

    const waterGoal = calcWaterGoal(profile);
    document.getElementById('statWaterSub').textContent = `of ${waterGoal} glasses (8oz each)`;

    // Update rings
    updateRing('ringProtein', totalProtein, goalProtein, totalProtein + 'g');
    document.getElementById('ringProteinVal').textContent = totalProtein + 'g';
    document.getElementById('ringProteinPct').textContent = Math.round((totalProtein / goalProtein) * 100) + '%';
    document.getElementById('ringProteinTarget').textContent = `Goal: ${goalProtein}g`;

    updateRing('ringCarbs', totalCarbs, goalCarbs, totalCarbs + 'g');
    document.getElementById('ringCarbsVal').textContent = totalCarbs + 'g';
    document.getElementById('ringCarbsPct').textContent = Math.round((totalCarbs / goalCarbs) * 100) + '%';
    document.getElementById('ringCarbsTarget').textContent = `Goal: ${goalCarbs}g`;

    updateRing('ringFat', totalFat, goalFat, totalFat + 'g');
    document.getElementById('ringFatVal').textContent = totalFat + 'g';
    document.getElementById('ringFatPct').textContent = Math.round((totalFat / goalFat) * 100) + '%';
    document.getElementById('ringFatTarget').textContent = `Goal: ${goalFat}g`;

    // Save nutrition log
    const logs = JSON.parse(localStorage.getItem('mealzy_nutrition_logs') || '{}');
    logs[today] = { calories: totalCals, protein: totalProtein, carbs: totalCarbs, fat: totalFat, goalCals };
    localStorage.setItem('mealzy_nutrition_logs', JSON.stringify(logs));
  }

  function updateRing(id, value, goal, label) {
    const circumference = 2 * Math.PI * 40; // 251.2
    const pct = Math.min(1, value / goal);
    const offset = circumference - (pct * circumference);
    const el = document.getElementById(id);
    if (el) el.style.strokeDashoffset = offset;
  }

  // Water target per National Academy of Medicine Dietary Reference Intake (via Harvard T.H. Chan
  // School of Public Health, Nutrition Source: nutritionsource.hsph.harvard.edu/water/).
  // Formula: weight_kg × 32.5 ml (midpoint of 30–35 ml/kg range) ÷ 236.588 ml per 8 oz cup.
  // Sex-based floors: ≥9 cups (women) / ≥13 cups (men) per NAM guidance.
  // Fallback (no weight/sex): 11 cups (average of 13 male / 9 female NAM DRI).
  function calcWaterGoal(p) {
    const weight = p?.weight;
    const gender = (p?.gender || '').toLowerCase();
    let cups;
    if (weight) {
      cups = (weight * 32.5) / 236.588;
      const floor = gender === 'female' ? 9 : gender === 'male' ? 13 : 0;
      if (floor) cups = Math.max(cups, floor);
    } else {
      cups = 11;
    }
    return Math.round(cups);
  }

  function renderWaterGlasses() {
    const waterGoal = calcWaterGoal(profile);
    const container = document.getElementById('waterGlasses');
    const hasWeight = !!(profile?.weight);
    const note = hasWeight
      ? 'Based on National Academy of Medicine guidelines, adjusted for your body weight'
      : 'Add your weight in Settings for a personalized target';
    container.innerHTML =
      `<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.3rem;">` +
      `<button onclick="removeWater()" aria-label="Remove a glass" style="width:26px;height:26px;border-radius:50%;border:1px solid var(--clr-border);background:var(--clr-muted-bg);color:var(--clr-foreground);font-size:1rem;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;font-family:inherit;">−</button>` +
      `<button onclick="addWater()" aria-label="Add a glass" style="width:26px;height:26px;border-radius:50%;border:1px solid var(--clr-primary);background:var(--clr-primary);color:var(--clr-on-primary);font-size:1rem;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;font-family:inherit;">+</button>` +
      `</div>` +
      `<span style="font-size:0.78rem;color:var(--clr-muted-fg);">${note} · ` +
      `<a href="https://nutritionsource.hsph.harvard.edu/water/" target="_blank" rel="noopener" ` +
      `style="color:var(--clr-primary);text-decoration:none;">Harvard T.H. Chan</a></span>`;
    const statWater = document.getElementById('statWater');
    if (statWater) statWater.textContent = waterCount;
  }

  function addWater() {
    waterCount += 1;
    const water = JSON.parse(localStorage.getItem('mealzy_water') || '{}');
    water[today] = waterCount;
    localStorage.setItem('mealzy_water', JSON.stringify(water));
    renderWaterGlasses();
    updateStats();
  }

  function removeWater() {
    if (waterCount <= 0) return;
    waterCount -= 1;
    const water = JSON.parse(localStorage.getItem('mealzy_water') || '{}');
    water[today] = waterCount;
    localStorage.setItem('mealzy_water', JSON.stringify(water));
    renderWaterGlasses();
    updateStats();
  }

  function toggleWater(index) {
    waterCount = index + 1 <= waterCount ? index : index + 1;
    const water = JSON.parse(localStorage.getItem('mealzy_water') || '{}');
    water[today] = waterCount;
    localStorage.setItem('mealzy_water', JSON.stringify(water));
    renderWaterGlasses();
    updateStats();
  }

  function toggleMealDone(index, checked) {
    todayMeals[index].completed = checked;
    const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
    if (plans[today]) {
      plans[today].meals = todayMeals;
      localStorage.setItem('mealzy_meal_plans', JSON.stringify(plans));
    }
    renderMeals();
    updateStats();
    if (checked) showToast(`${todayMeals[index].name} marked as done`, 'success');
  }

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
    document.getElementById('modalIngredients').innerHTML = ingList.map(ing =>
      `<li><span>${escHtml(ing.name)}</span><span class="text-muted">${escHtml(ing.amount)}${ing.cost ? ` · ${getCurrencySymbol(profile.currency)}${ing.cost.toFixed(2)}` : ''}</span></li>`
    ).join('');
    const instList = meal.instructions || [];
    document.getElementById('modalInstructions').innerHTML = instList.map(step =>
      `<li>${escHtml(step)}</li>`
    ).join('');
    document.getElementById('recipeModal').classList.add('open');
  }

  function closeModal() {
    document.getElementById('recipeModal').classList.remove('open');
  }
