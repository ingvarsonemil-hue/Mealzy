'use strict';

const mealConstraints = require('../mealConstraints');

const SLOT_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_ALTERNATIVES = 2;
const MAX_ALTERNATIVES = 3;

function sanitise(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function capList(arr, maxItems, maxLen) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, maxItems)
    .filter(x => typeof x === 'string')
    .map(x => sanitise(x, maxLen));
}

/** Strips markdown fences / leading garbage and parses a JSON ARRAY response
 * (mirrors server.js's parseJsonResponse, which does the same for a single
 * JSON object — kept as a small separate helper here since the shape being
 * located differs, '[' vs '{'). */
function parseJsonArrayResponse(text) {
  let s = text.trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = s.indexOf('[');
  if (start > 0) s = s.slice(start);
  const parsed = JSON.parse(s);
  if (!Array.isArray(parsed)) throw new Error('not_an_array');
  return parsed;
}

/** Tiny, best-effort Unsplash keyword lookup — mirrors server.js's
 * attachMealImages exactly (same env var, same query shape, same
 * swallow-on-failure behavior). Not part of the dietary/allergy constraint
 * logic the task called out for reuse, so it's fine as a small local copy
 * rather than plumbing the original (which is a closure nested inside
 * /api/generate-meal and not separately callable). */
async function attachMealImages(meals) {
  if (!process.env.UNSPLASH_ACCESS_KEY || !meals) return;
  await Promise.all(meals.map(async (meal) => {
    try {
      const q = encodeURIComponent((meal.imageKeyword || meal.name) + ' dish plated food photography');
      const imgRes = await fetch(`https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape`, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } });
      const imgData = await imgRes.json();
      if (imgData.results?.[0]) meal.image_url = imgData.results[0].urls.small;
    } catch (e) { /* keep default */ }
  }));
}

function slotKeyFor(date, slot) { return `${date}:${slot}`; }

module.exports = function registerMealSwapRoutes(app, {
  requireSession, requireVerifiedEmail, generateLimiter, db,
  callAnthropicWithSpendCap, calculateMealCost, normalizeSpelling,
}) {
  // ── Shared: fetch plan (ownership-scoped), validate date/slot are in it ────
  async function loadPlanSlot(req, res) {
    const { planId } = req.params;
    const date = sanitise(req.body?.date, 20);
    const slot = sanitise(req.body?.slot, 20);

    if (!planId || !DATE_RE.test(date) || !SLOT_TYPES.includes(slot)) {
      res.status(400).json({ error: 'invalid_request', message: 'planId, a YYYY-MM-DD date, and a valid slot are required.' });
      return null;
    }

    const plan = await db.getPlanById(planId, req.session.userId);
    if (!plan || !Array.isArray(plan.days)) {
      res.status(404).json({ error: 'plan_not_found' });
      return null;
    }
    const dayIndex = plan.days.findIndex(d => d && d.date === date);
    if (dayIndex === -1) {
      res.status(400).json({ error: 'day_not_found', message: 'That date is not part of this plan.' });
      return null;
    }
    const day = plan.days[dayIndex];
    const mealIndex = Array.isArray(day.meals) ? day.meals.findIndex(m => m && m.type === slot) : -1;
    if (mealIndex === -1) {
      res.status(400).json({ error: 'meal_not_found', message: 'That slot is not part of this day.' });
      return null;
    }

    const slotKey = slotKeyFor(date, slot);
    const alreadySwapped = Array.isArray(plan.swappedSlots) && plan.swappedSlots.includes(slotKey);
    return { plan, planId, date, slot, dayIndex, day, mealIndex, slotKey, alreadySwapped };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PART 1 — POST /api/plans/:planId/swap-alternatives
  // Pro-only, read/generate-only: nothing is persisted here.
  // ═══════════════════════════════════════════════════════════════════════
  app.post(
    '/api/plans/:planId/swap-alternatives',
    generateLimiter,
    requireSession,
    requireVerifiedEmail,
    async (req, res) => {
      try {
        // Fresh DB lookup — never trust the JWT payload for Pro status.
        const user = await db.getUserById(req.session.userId);
        if (!user) return res.status(401).json({ error: 'user_not_found' });
        if (!user.pro) {
          return res.status(402).json({
            error: 'pro_required',
            message: 'Meal swaps are a Pro feature. Upgrade to swap meals.',
            upgrade_url: '/pricing.html',
          });
        }

        const slotInfo = await loadPlanSlot(req, res);
        if (!slotInfo) return; // response already sent
        const { day, slot, date, slotKey, alreadySwapped } = slotInfo;

        if (alreadySwapped) {
          return res.status(409).json({ error: 'slot_already_swapped', message: 'This slot already used its swap this week.' });
        }

        const profile = req.body?.profile;
        if (!profile || typeof profile !== 'object') {
          return res.status(400).json({ error: 'profile_required' });
        }

        // ── Same normalizedSettings-precedence-over-request-body-profile
        // pattern as /api/generate-meal (see server.js's "Profile field
        // extraction" block, which this mirrors for the fields swap needs).
        const normalizedSettings = await db.getProfileSettings(req.session.userId);
        const name = sanitise(profile.name || 'User', 100);
        const dietaryPrefs = Array.isArray(normalizedSettings?.dietaryRestrictions)
          ? normalizedSettings.dietaryRestrictions
          : (Array.isArray(profile.dietary_preferences || profile.dietaryPrefs) ? (profile.dietary_preferences || profile.dietaryPrefs) : []);
        const allergies = Array.isArray(normalizedSettings?.allergies)
          ? capList(normalizedSettings.allergies, 20, 40)
          : capList(profile.allergies, 20, 40);
        const cookingSkill = normalizedSettings?.cookingSkill
          || sanitise(profile.cooking_skill || profile.cookingSkill || 'intermediate', 50);
        const dailyCalories = Math.min(4000, Math.max(1200, Number(profile.daily_calories || profile.dailyCalories || 2000)));
        let budget = Number(normalizedSettings?.weeklyBudget ?? (profile.budget_weekly || profile.budget) ?? 100);
        if (Number.isNaN(budget)) budget = 100;
        budget = Math.min(10000, Math.max(1, budget));
        const currency = normalizedSettings?.currency || sanitise(profile.currency || 'USD', 10);
        const cookingTimeMinutes = Number(normalizedSettings?.cookingTimeMinutes ?? (profile.cooking_time_minutes || profile.cookingTimeMinutes) ?? 30);
        const language = sanitise(profile.language || 'en', 10);
        const languageNames = { en:'English',sv:'Swedish',no:'Norwegian',da:'Danish',de:'German',fr:'French',es:'Spanish',it:'Italian',pt:'Portuguese',nl:'Dutch',ja:'Japanese',fi:'Finnish',pl:'Polish',tr:'Turkish',ko:'Korean',zh:'Chinese',ar:'Arabic',hi:'Hindi',ru:'Russian' };
        const languageName = languageNames[language] || 'English';
        const priceTierMultiplier = profile.price_tier === 'budget' ? 0.8 : profile.price_tier === 'premium' ? 1.3 : 1.0;
        const perMealBudget = (budget / 7 / 4 * priceTierMultiplier).toFixed(2);
        const preferredCuisine = (normalizedSettings?.preferredCuisine ?? sanitise(profile.preferred_cuisine, 60)) || null;

        // Avoid the meal currently in this slot (that's exactly what the
        // person is trying to replace) plus the same disliked/avoid-list
        // inputs generate-meal uses.
        const clientAvoidList = capList(req.body?.avoid_meals, 30, 80);
        const dislikedMeals = await db.getUserDislikedMeals(req.session.userId);
        const currentMealName = day.meals[slotInfo.mealIndex]?.name;
        const avoidList = Array.from(new Set([
          ...(currentMealName ? [currentMealName] : []),
          ...clientAvoidList,
          ...dislikedMeals,
        ])).slice(0, 60);

        const { dietaryBlock, allergyBlock, avoidBlock, isVegan, isKeto } =
          mealConstraints.buildDietaryBlocks({ dietaryPrefs, allergies, avoidList });
        const eligibleProteins = mealConstraints.buildEligibleProteins({ dietaryPrefs, isVegan, isKeto });

        const mealCaloriesPct = { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 };
        const targetCals = Math.round(dailyCalories * (mealCaloriesPct[slot] || 0.25));

        const count = MAX_ALTERNATIVES; // ask for 3; accept down to MIN_ALTERNATIVES below
        const varieties = [];
        let excludeCuisine = null;
        for (let i = 0; i < count; i++) {
          const v = mealConstraints.pickVariety({ preferredCuisine, excludeCuisine, eligibleProteins });
          varieties.push(v);
          excludeCuisine = v.todayCuisine; // next pick avoids repeating this one
        }

        const oneSchema = mealConstraints.buildMealSchema({ mealType: slot, isPro: true });
        const varietyLines = varieties.map((v, i) =>
          `Alternative ${i + 1}: cuisine ${v.todayCuisine}, featured protein ${v.todayProtein}, variety seed ${v.randomSeed}.`
        ).join('\n');

        const prompt = `${dietaryBlock}${allergyBlock}Generate ${count} DISTINCT, practical home-cooked ${slot} meal alternatives for ${name} — genuinely different from each other (different cuisines/main ingredients/cooking methods), not variations on the same dish.

${varietyLines}
Target: ~${targetCals} kcal each. Cooking skill: ${cookingSkill}. Max time: ${cookingTimeMinutes} min.
Budget: max ${currency} ${perMealBudget} per meal. Use common supermarket ingredients only.

${avoidBlock}

LANGUAGE: All meal name, description, and ingredient names MUST be in ${languageName}. JSON keys stay in English.${languageName === 'English' ? ' Use American English spelling (e.g. "pita" not "pitta", "yogurt" not "yoghurt").' : ''}

${mealConstraints.INGREDIENT_UNIT_RULE}

Respond ONLY with valid JSON — an array of exactly ${count} meal objects, no markdown, no extra text — where each element matches this exact schema:
[${oneSchema}, ...]`;

        let completion;
        try {
          completion = await callAnthropicWithSpendCap({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 900 * count,
            system: [{ type: 'text', text: 'You are a professional nutritionist and chef. Always respond with valid JSON only, no markdown fences, no explanation. Never include ingredients that violate dietary restrictions or allergies.', cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: prompt }],
          });
        } catch (err) {
          if (err.spendCapReached) {
            return res.status(503).json({
              error: 'service_temporarily_unavailable',
              message: 'AI features are temporarily paused due to high demand. Please try again later.',
            });
          }
          throw err;
        }

        let rawAlternatives;
        try {
          rawAlternatives = parseJsonArrayResponse(completion.content[0].text);
        } catch (err) {
          console.error('[swap-alternatives] parse failure', err.message);
          return res.status(502).json({ error: 'generation_failed', message: 'Could not generate alternatives. Please try again.' });
        }

        if (!Array.isArray(rawAlternatives) || rawAlternatives.length < MIN_ALTERNATIVES) {
          return res.status(502).json({ error: 'generation_failed', message: 'Could not generate enough alternatives. Please try again.' });
        }

        const alternatives = [];
        for (const raw of rawAlternatives.slice(0, MAX_ALTERNATIVES)) {
          if (!raw || typeof raw !== 'object') continue;
          const meal = { ...raw, type: slot }; // never trust the model's own "type" — force it
          if (languageName === 'English') {
            meal.name = normalizeSpelling(meal.name);
            meal.description = normalizeSpelling(meal.description);
          }
          const priced = await calculateMealCost(meal.ingredients);
          meal.cost = priced.totalUSD;
          meal.costConfidence = priced.allVerified ? 'verified' : 'estimated';
          meal.unknownEstimatedCostUSD = priced.unknownEstimatedCostUSD;
          meal.unknownIngredientCount = priced.unknownIngredientCount;
          alternatives.push(meal);
        }
        if (alternatives.length < MIN_ALTERNATIVES) {
          return res.status(502).json({ error: 'generation_failed', message: 'Could not generate enough valid alternatives. Please try again.' });
        }

        await attachMealImages(alternatives);
        await db.logEvent('meal_swap_alternatives_generated', { userId: req.session.userId, planId: slotInfo.planId, date, slot, count: alternatives.length }, '');

        res.json({ success: true, date, slot, alternatives });
      } catch (err) {
        console.error('[swap-alternatives]', err.message);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════
  // PART 2 — POST /api/plans/:planId/swap-commit
  // Pro-only. Atomically checks-and-marks the slot swapped AND writes the
  // chosen meal's content in one DB statement — see db.commitMealSwap.
  // ═══════════════════════════════════════════════════════════════════════
  app.post(
    '/api/plans/:planId/swap-commit',
    requireSession,
    async (req, res) => {
      try {
        const user = await db.getUserById(req.session.userId);
        if (!user) return res.status(401).json({ error: 'user_not_found' });
        if (!user.pro) {
          return res.status(402).json({
            error: 'pro_required',
            message: 'Meal swaps are a Pro feature. Upgrade to swap meals.',
            upgrade_url: '/pricing.html',
          });
        }

        const slotInfo = await loadPlanSlot(req, res);
        if (!slotInfo) return; // response already sent
        const { plan, planId, date, slot, dayIndex, day, mealIndex, slotKey, alreadySwapped } = slotInfo;

        if (alreadySwapped) {
          return res.status(409).json({ error: 'slot_already_swapped', message: 'This slot already used its swap this week.' });
        }

        const rawMeal = req.body?.meal;
        if (!rawMeal || typeof rawMeal !== 'object' || !Array.isArray(rawMeal.ingredients)) {
          return res.status(400).json({ error: 'invalid_meal', message: 'A meal object with ingredients is required.' });
        }

        // Re-price server-side rather than trusting whatever cost the client
        // echoes back — the meal's other fields came from our own
        // swap-alternatives response, but cost integrity matters for the
        // budget UI, so it's cheap insurance (no Anthropic call).
        const priced = await calculateMealCost(rawMeal.ingredients);
        const newMeal = {
          type: slot,
          name: sanitise(rawMeal.name, 150),
          description: sanitise(rawMeal.description, 300),
          calories: Number(rawMeal.calories) || 0,
          protein: Number(rawMeal.protein) || 0,
          carbs: Number(rawMeal.carbs) || 0,
          fat: Number(rawMeal.fat) || 0,
          cookTime: Number(rawMeal.cookTime) || 0,
          servings: 1,
          ingredients: rawMeal.ingredients.slice(0, 30),
          instructions: Array.isArray(rawMeal.instructions) ? rawMeal.instructions.slice(0, 20).map(s => sanitise(s, 300)) : [],
          imageKeyword: sanitise(rawMeal.imageKeyword, 80),
          image_url: typeof rawMeal.image_url === 'string' ? sanitise(rawMeal.image_url, 500) : undefined,
          cost: priced.totalUSD,
          costConfidence: priced.allVerified ? 'verified' : 'estimated',
          unknownEstimatedCostUSD: priced.unknownEstimatedCostUSD,
          unknownIngredientCount: priced.unknownIngredientCount,
        };

        // Recompute this day's own totals from its OTHER (unchanged) meals +
        // the new meal, so the day never shows stale aggregates after a swap.
        // NOTE (scope, flagged in the report): weeklyTotals (including the
        // purchasePlan grocery-cost aggregation) is NOT recomputed here — that
        // spans ingredient-level repricing across the whole week and is out
        // of scope for a single-slot swap; it will drift until the next full
        // regeneration.
        const otherMeals = day.meals.filter((_, i) => i !== mealIndex);
        const allMealsForTotals = [...otherMeals, newMeal];
        const newDay = {
          ...day,
          meals: day.meals.map((m, i) => (i === mealIndex ? newMeal : m)),
          totalCalories: allMealsForTotals.reduce((s, m) => s + (Number(m.calories) || 0), 0),
          totalProtein: allMealsForTotals.reduce((s, m) => s + (Number(m.protein) || 0), 0),
          totalCarbs: allMealsForTotals.reduce((s, m) => s + (Number(m.carbs) || 0), 0),
          totalFat: allMealsForTotals.reduce((s, m) => s + (Number(m.fat) || 0), 0),
          totalCost: allMealsForTotals.reduce((s, m) => s + (Number(m.cost) || 0), 0),
        };

        const result = await db.commitMealSwap({ planId, userId: req.session.userId, dayIndex, newDay, slotKey });
        if (result.outcome === 'already_swapped') {
          return res.status(409).json({ error: 'slot_already_swapped', message: 'This slot already used its swap this week.' });
        }

        await db.logEvent('meal_swap_committed', { userId: req.session.userId, planId, date, slot }, '');
        res.json({ success: true, date, slot, day: result.day });
      } catch (err) {
        console.error('[swap-commit]', err.message);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
    }
  );
};
