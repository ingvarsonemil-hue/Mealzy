require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── File paths for persistent data ──
const LEADS_FILE = path.join(__dirname, 'leads.json');
const ANALYTICS_FILE = path.join(__dirname, 'analytics.json');

function appendJsonLine(filePath, obj) {
  try {
    fs.appendFileSync(filePath, JSON.stringify(obj) + '\n', 'utf8');
  } catch(e) { /* fail silently */ }
}

function readJsonLines(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch(e) { return null; } })
      .filter(Boolean);
  } catch(e) { return []; }
}

// ── Simple in-memory usage tracker (resets on server restart) ──
// Key: IP address  Value: { count, month }
const usageTracker = new Map();
const FREE_PLAN_LIMIT = 3;

// Referral bonus: key = referrer email, value = extra free plans earned
const referralBonus = new Map();

function getUsage(ip) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const record = usageTracker.get(ip);
  if (!record || record.month !== monthKey) {
    return { count: 0, month: monthKey };
  }
  return record;
}

function incrementUsage(ip) {
  const usage = getUsage(ip);
  usage.count += 1;
  usageTracker.set(ip, usage);
  return usage;
}

function getEffectiveLimit(email) {
  const bonus = email ? (referralBonus.get(email) || 0) : 0;
  return FREE_PLAN_LIMIT + bonus;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// Serve Supabase public config to the browser (anon key is safe to expose)
app.get('/supabase-config.js', (req, res) => {
  res.type('js').send(
    `window.SUPABASE_URL=${JSON.stringify(process.env.SUPABASE_URL||'')};` +
    `window.SUPABASE_KEY=${JSON.stringify(process.env.SUPABASE_ANON_KEY||'')};`
  );
});

// POST /api/track — lightweight analytics event tracking
app.post('/api/track', (req, res) => {
  const { event, data } = req.body;
  if (!event) return res.status(400).json({ error: 'event required' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  appendJsonLine(ANALYTICS_FILE, {
    event,
    data: data || {},
    ip: ip.slice(-8), // partial IP for privacy
    ts: new Date().toISOString()
  });
  res.json({ ok: true });
});

// GET /api/analytics — return aggregated stats (PRO_TOKEN protected)
app.get('/api/analytics', (req, res) => {
  const token = req.headers['x-pro-token'] || req.query.token;
  if (token !== process.env.PRO_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const events = readJsonLines(ANALYTICS_FILE);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisMonth = events.filter(e => new Date(e.ts) >= monthStart);

  const count = (arr, type) => arr.filter(e => e.event === type).length;

  const dayCounts = {};
  events.forEach(e => {
    const day = new Date(e.ts).getDay();
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  });
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const mostActiveDay = dayNames[Object.entries(dayCounts).sort((a,b) => b[1]-a[1])[0]?.[0]] || 'N/A';

  res.json({
    total_events: events.length,
    this_month: {
      signups: count(thisMonth, 'signup'),
      plans_generated: count(thisMonth, 'generate_plan'),
      free_limit_hits: count(thisMonth, 'free_limit_hit'),
      upgrade_clicks: count(thisMonth, 'upgrade_click'),
      share_clicks: count(thisMonth, 'share_click'),
      page_views: count(thisMonth, 'page_view'),
    },
    all_time: {
      signups: count(events, 'signup'),
      plans_generated: count(events, 'generate_plan'),
      free_limit_hits: count(events, 'free_limit_hit'),
      upgrade_clicks: count(events, 'upgrade_click'),
    },
    most_active_day: mostActiveDay,
    total_leads: readJsonLines(LEADS_FILE).length,
  });
});

// POST /api/referral — credit a referrer when a referred user signs up
app.post('/api/referral', (req, res) => {
  const { referrer_email, new_user_email } = req.body;
  if (!referrer_email) return res.status(400).json({ error: 'referrer_email required' });
  const current = referralBonus.get(referrer_email) || 0;
  referralBonus.set(referrer_email, current + 1);
  appendJsonLine(ANALYTICS_FILE, {
    event: 'referral_signup',
    data: { referrer: referrer_email, new_user: new_user_email },
    ts: new Date().toISOString()
  });
  res.json({ ok: true, bonus_plans: current + 1 });
});

// GET /api/referral-status — check referral bonus for an email
app.get('/api/referral-status', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  const bonus = referralBonus.get(email) || 0;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const usage = getUsage(ip);
  const effectiveLimit = getEffectiveLimit(email);
  res.json({ bonus_plans: bonus, effective_limit: effectiveLimit, used: usage.count });
});

// POST /api/generate-meal — generate daily meal plan or swap a single meal
app.post('/api/generate-meal', async (req, res) => {
  try {
    const { profile, date, swap_meal_type, plan_token, user_email, avoid_meals } = req.body;

    if (!profile) {
      return res.status(400).json({ error: 'Profile is required' });
    }

    // ── Freemium gate (skip for swaps and pro users) ──
    // is_pro is sent by the client when mealzy_pro is set in localStorage (set after Stripe payment)
    const isPro = plan_token === process.env.PRO_TOKEN || req.body.is_pro === true;
    if (!swap_meal_type && !isPro) {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      const usage = getUsage(ip);
      const effectiveLimit = getEffectiveLimit(user_email || '');
      if (usage.count >= effectiveLimit) {
        appendJsonLine(ANALYTICS_FILE, { event: 'free_limit_hit', data: {}, ts: new Date().toISOString() });
        return res.status(402).json({
          error: 'free_limit_reached',
          message: `You've used all ${effectiveLimit} free plans this month.`,
          upgrade_url: '/pricing.html',
          resets_in: 'Start of next month',
          used: usage.count,
          limit: effectiveLimit
        });
      }
      incrementUsage(ip);
      appendJsonLine(ANALYTICS_FILE, { event: 'generate_plan', data: { plan_num: usage.count + 1 }, ts: new Date().toISOString() });
    } else if (!swap_meal_type && isPro) {
      appendJsonLine(ANALYTICS_FILE, { event: 'generate_plan', data: { pro: true }, ts: new Date().toISOString() });
    }

    const name = profile.name || 'User';
    const goal = profile.fitness_goal || profile.goal || 'eat healthier';
    const dietaryPrefs = profile.dietary_preferences || profile.dietaryPrefs || [];
    const allergies = profile.allergies || [];
    const cookingSkill = profile.cooking_skill || profile.cookingSkill || 'intermediate';
    const dailyCalories = profile.daily_calories || profile.dailyCalories || 2000;
    const dailyProtein = profile.daily_protein || (profile.macros && profile.macros.protein) || 150;
    const dailyCarbs = profile.daily_carbs || (profile.macros && profile.macros.carbs) || 200;
    const dailyFat = profile.daily_fat || (profile.macros && profile.macros.fat) || 65;
    const budget = profile.budget_weekly || profile.budget || 100;
    const currency = profile.currency || 'USD';
    const cookingTimeMinutes = profile.cooking_time_minutes || profile.cookingTimeMinutes || 30;
    const language = profile.language || 'en';
    const languageNames = { en:'English', sv:'Swedish', no:'Norwegian', da:'Danish', de:'German', fr:'French', es:'Spanish', it:'Italian', pt:'Portuguese', nl:'Dutch', ja:'Japanese', fi:'Finnish', pl:'Polish', tr:'Turkish', ko:'Korean', zh:'Chinese', ar:'Arabic', hi:'Hindi', ru:'Russian' };
    const languageName = languageNames[language] || 'English';
    const dailyBudget = (budget / 7).toFixed(2);
    const perMealBudget = (budget / 7 / 4).toFixed(2);

    const dietaryInfo = dietaryPrefs.length > 0 ? `Dietary preferences: ${dietaryPrefs.join(', ')}.` : '';
    const allergyInfo = allergies.length > 0 ? `Allergies/restrictions: ${allergies.join(', ')}.` : '';
    const avoidInfo = avoid_meals && avoid_meals.length > 0 ? `The user previously disliked these meals — do NOT suggest them: ${avoid_meals.join(', ')}.` : '';

    const cuisineGroups = {
      mediterranean: ['Greek','Italian','Spanish','Moroccan','Turkish','Lebanese','Tunisian'],
      asian: ['Japanese','Chinese','Korean','Vietnamese','Thai','Filipino','Malaysian','Indonesian'],
      indian: ['North Indian','South Indian','Bengali','Punjabi','Goan'],
      middleeastern: ['Lebanese','Persian','Israeli','Egyptian','Jordanian'],
      american: ['American','Tex-Mex','Southern BBQ','New England','Californian'],
      mexican: ['Mexican','Oaxacan','Yucatecan','Street Food Mexican'],
      scandinavian: ['Swedish','Norwegian','Danish','Finnish'],
      african: ['Ethiopian','West African','South African','Moroccan'],
      european: ['French','German','British','Polish','Portuguese'],
      latin: ['Brazilian','Argentinian','Peruvian','Colombian']
    };
    const proteins = ['chicken','salmon','tuna','beef','tofu','eggs','shrimp','turkey','lentils','chickpeas','pork','lamb','cod','tempeh','sardines','halloumi','duck','venison'];

    const preferredCuisine = profile.preferred_cuisine || null;
    let todayCuisine;
    if (preferredCuisine && cuisineGroups[preferredCuisine.toLowerCase().replace(/\s/g,'')]) {
      const group = cuisineGroups[preferredCuisine.toLowerCase().replace(/\s/g,'')];
      todayCuisine = group[Math.floor(Math.random() * group.length)];
    } else if (preferredCuisine) {
      todayCuisine = preferredCuisine;
    } else {
      const allCuisines = Object.values(cuisineGroups).flat();
      todayCuisine = allCuisines[Math.floor(Math.random() * allCuisines.length)];
    }
    const todayProtein = proteins[Math.floor(Math.random() * proteins.length)];
    const randomSeed = Math.floor(Math.random() * 99999);

    // === SINGLE MEAL SWAP ===
    if (swap_meal_type) {
      const mealCalories = {
        breakfast: Math.round(dailyCalories * 0.25),
        lunch: Math.round(dailyCalories * 0.35),
        dinner: Math.round(dailyCalories * 0.30),
        snack: Math.round(dailyCalories * 0.10)
      };
      const targetCals = mealCalories[swap_meal_type] || Math.round(dailyCalories * 0.25);

      const swapPrompt = `Generate ONE practical home-cooked ${swap_meal_type} meal for ${name}.

Cuisine: ${todayCuisine}, protein: ${todayProtein}. Seed: ${randomSeed}.
Calories: ~${targetCals} kcal. Skill: ${cookingSkill}. Max time: ${cookingTimeMinutes} min.
Budget: max ${currency} ${perMealBudget} for this meal. Use common supermarket ingredients.
${dietaryInfo}
${allergyInfo}
${avoidInfo}
LANGUAGE: All meal name, description, and ingredient names must be in ${languageName}.

Respond ONLY with this JSON (no markdown):
{
  "type": "${swap_meal_type}",
  "name": "Meal Name",
  "description": "Short description under 10 words",
  "calories": ${targetCals},
  "protein": 25,
  "carbs": 35,
  "fat": 12,
  "cookTime": 20,
  "servings": 1,
  "estimatedCost": 5.00,
  "ingredients": [
    { "name": "ingredient", "amount": "1 cup", "cost": 1.20 }
  ],
  "instructions": ["Step 1", "Step 2", "Step 3"],
  "imageKeyword": "food keyword for image search"
}`;

      const completion = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: 'You are a professional nutritionist and chef. Always respond with valid JSON only, no markdown, no explanation.',
        messages: [{ role: 'user', content: swapPrompt }]
      });

      let rawContent = completion.content[0].text.trim();
      rawContent = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      const jsonStart = rawContent.indexOf('{');
      if (jsonStart > 0) rawContent = rawContent.slice(jsonStart);
      const meal = JSON.parse(rawContent);

      if (process.env.UNSPLASH_ACCESS_KEY) {
        try {
          const query = encodeURIComponent((meal.imageKeyword || meal.name) + ' dish plated food photography');
          const imgRes = await fetch(`https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape`, {
            headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }
          });
          const imgData = await imgRes.json();
          if (imgData.results && imgData.results[0]) {
            meal.image_url = imgData.results[0].urls.small;
          }
        } catch (e) { /* keep default */ }
      }

      return res.json({ success: true, meal });
    }

    // === FULL DAILY MEAL PLAN ===
    const prompt = `Generate a practical, delicious daily meal plan for ${name} on ${date}.

Cuisine style: ${todayCuisine}. Featured protein: ${todayProtein}. Variety seed: ${randomSeed}.
Use real, everyday ingredients available at a regular supermarket — nothing exotic or hard to find. Meals should be satisfying and realistic for a home cook.

User profile:
- Goal: ${goal}
- Daily calorie target: ${dailyCalories} kcal (Protein ${dailyProtein}g, Carbs ${dailyCarbs}g, Fat ${dailyFat}g)
- Cooking skill: ${cookingSkill}
- Max time per meal: ${cookingTimeMinutes} min
- STRICT DAILY BUDGET: ${currency} ${dailyBudget} total for all meals. Each meal max ${currency} ${perMealBudget}. estimatedCost values MUST be realistic and the sum across all 4 meals MUST NOT exceed ${currency} ${dailyBudget}.
${dietaryInfo}
${allergyInfo}
${avoidInfo}

LANGUAGE: Write ALL meal names, descriptions, and ingredient names in ${languageName}. JSON keys stay in English.

Generate exactly 4 meals: breakfast, lunch, dinner, snack.

Respond ONLY with this JSON (keep ingredients to ${isPro ? '6' : '4'} max, instructions to ${isPro ? '5' : '3'} max, descriptions under ${isPro ? '15' : '10'} words):
{
  "meals": [
    {
      "type": "breakfast",
      "name": "Meal Name",
      "description": "Short description",
      "calories": 450,
      "protein": 25,
      "carbs": 45,
      "fat": 15,
      "cookTime": 15,
      "servings": 1,
      "estimatedCost": 4.50,
      "ingredients": [
        { "name": "ingredient", "amount": "1 cup", "cost": 1.20 }
      ],
      "instructions": ["Step 1", "Step 2", "Step 3"],
      "imageKeyword": "simple english food keyword for image search e.g. scrambled eggs"
    }
  ],
  "totalCalories": 1950,
  "totalCost": 18.50,
  "nutritionNote": "Short note"
}`;

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: isPro ? 6000 : 4000,
      system: isPro
        ? 'You are a professional nutritionist and chef. Always respond with valid JSON only, no markdown, no explanation. Pro users get detailed, restaurant-quality instructions — up to 5 steps per meal with precise techniques.'
        : 'You are a professional nutritionist and chef. Always respond with valid JSON only, no markdown, no explanation. Keep instructions to max 3 steps each to stay within token limits.',
      messages: [{ role: 'user', content: prompt }]
    });

    let rawContent = completion.content[0].text.trim();
    console.log('AI response length:', rawContent.length, '| Last 100 chars:', rawContent.slice(-100));
    rawContent = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    let mealPlan;

    try {
      mealPlan = JSON.parse(rawContent);
    } catch (parseError) {
      let jsonStr = rawContent;
      const startIdx = jsonStr.indexOf('{');
      if (startIdx > 0) jsonStr = jsonStr.slice(startIdx);
      try {
        const lastComplete = jsonStr.lastIndexOf(',"imageKeyword"');
        if (lastComplete > 0) {
          const endOfMeal = jsonStr.indexOf('}', lastComplete) + 1;
          jsonStr = jsonStr.slice(0, endOfMeal) + '],"totalCalories":2000,"totalCost":20,"nutritionNote":"Balanced meal plan"}';
        }
        mealPlan = JSON.parse(jsonStr);
      } catch (e) {
        throw new Error('Failed to parse meal plan JSON');
      }
    }

    if (process.env.UNSPLASH_ACCESS_KEY && mealPlan.meals) {
      await Promise.all(mealPlan.meals.map(async (meal) => {
        try {
          const query = encodeURIComponent((meal.imageKeyword || meal.name) + ' dish plated food photography');
          const imgRes = await fetch(`https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape`, {
            headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }
          });
          const imgData = await imgRes.json();
          if (imgData.results && imgData.results[0]) {
            meal.image_url = imgData.results[0].urls.small;
          }
        } catch (e) { /* keep default image if fetch fails */ }
      }));
    }

    res.json({ success: true, date, mealPlan });
  } catch (error) {
    console.error('Error generating meal plan:', error);
    res.status(500).json({
      error: 'Failed to generate meal plan',
      message: error.message,
      fallback: generateFallbackMealPlan(req.body.profile)
    });
  }
});

// POST /api/generate-grocery-list
app.post('/api/generate-grocery-list', async (req, res) => {
  try {
    const { profile, meals, weekStart } = req.body;

    if (!meals || meals.length === 0) {
      return res.status(400).json({ error: 'Meals array is required' });
    }

    const {
      budget = 100,
      currency = 'USD',
      dietaryPrefs = [],
      allergies = [],
      language: groceryLang = 'en'
    } = profile || {};
    const groceryLangNames = { en:'English', sv:'Swedish', no:'Norwegian', da:'Danish', de:'German', fr:'French', es:'Spanish', it:'Italian', pt:'Portuguese', nl:'Dutch', ja:'Japanese', fi:'Finnish', pl:'Polish', tr:'Turkish', ko:'Korean', zh:'Chinese', ar:'Arabic', hi:'Hindi', ru:'Russian' };
    const groceryLangName = groceryLangNames[groceryLang] || 'English';

    const mealList = meals.map(m => `- ${m.name} (${m.type})`).join('\n');
    const allergyInfo = allergies.length > 0 ? `Avoid: ${allergies.join(', ')}.` : '';
    const prefInfo = dietaryPrefs.length > 0 ? `Dietary preferences: ${dietaryPrefs.join(', ')}.` : '';

    const prompt = `Generate a complete grocery list for the following weekly meals:

${mealList}

${prefInfo}
${allergyInfo}
Weekly budget: ${currency} ${budget}. Keep total cost at or under this amount.
Write all ingredient names in ${groceryLangName}. JSON keys stay in English.

Consolidate duplicate ingredients. Group by category.

Respond ONLY with valid JSON:
{
  "weekStart": "${weekStart}",
  "totalCost": 85.50,
  "budgetAmount": ${budget},
  "currency": "${currency}",
  "categories": {
    "produce": [
      { "name": "Spinach", "amount": "200g", "cost": 2.50, "checked": false }
    ],
    "protein": [],
    "dairy": [],
    "grains": [],
    "pantry": [],
    "frozen": [],
    "beverages": [],
    "other": []
  }
}`;

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: 'You are a professional nutritionist. Always respond with valid JSON only.',
      messages: [{ role: 'user', content: prompt }]
    });

    const rawContent = completion.content[0].text.trim();
    let groceryList;

    try {
      groceryList = JSON.parse(rawContent);
    } catch (parseError) {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        groceryList = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse grocery list JSON');
      }
    }

    res.json({ success: true, groceryList });
  } catch (error) {
    console.error('Error generating grocery list:', error);
    res.status(500).json({ error: 'Failed to generate grocery list', message: error.message });
  }
});

// POST /api/email-leads — capture email, write to leads.json
app.post('/api/email-leads', (req, res) => {
  try {
    const { email, source = 'unknown', name = '' } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const lead = { email: email.toLowerCase().trim(), source, name, ts: new Date().toISOString() };
    appendJsonLine(LEADS_FILE, lead);
    res.json({ success: true });
  } catch (err) {
    console.error('Email lead error:', err);
    res.json({ success: true }); // fail silently to client
  }
});

// POST /api/ai-coach — AI nutritionist chat
app.post('/api/ai-coach', async (req, res) => {
  try {
    const { messages, profile, is_pro } = req.body;
    const isCoachPro = is_pro === true;

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const {
      name = 'User',
      goal = 'eat healthier',
      dailyCalories = 2000,
      macros = { protein: 150, carbs: 200, fat: 67 },
      dietaryPrefs = [],
      allergies = [],
      weight = 70,
      height = 170,
      age = 30,
      currency = 'USD',
      preferred_cuisine = '',
      language: coachLang = 'en'
    } = profile || {};
    const coachLangNames = { en:'English', sv:'Swedish', no:'Norwegian', da:'Danish', de:'German', fr:'French', es:'Spanish', it:'Italian', pt:'Portuguese', nl:'Dutch', ja:'Japanese', fi:'Finnish', pl:'Polish', tr:'Turkish', ko:'Korean', zh:'Chinese', ar:'Arabic', hi:'Hindi', ru:'Russian' };
    const coachLangName = coachLangNames[coachLang] || 'English';

    const currencyToCountry = {
      USD: 'United States', GBP: 'United Kingdom', EUR: 'Europe',
      SEK: 'Sweden', NOK: 'Norway', DKK: 'Denmark',
      CAD: 'Canada', AUD: 'Australia', NZD: 'New Zealand',
      CHF: 'Switzerland', JPY: 'Japan', CNY: 'China',
      KRW: 'South Korea', INR: 'India', BRL: 'Brazil',
      MXN: 'Mexico', ARS: 'Argentina', ZAR: 'South Africa',
      AED: 'United Arab Emirates', SAR: 'Saudi Arabia',
      SGD: 'Singapore', HKD: 'Hong Kong', PLN: 'Poland',
      CZK: 'Czech Republic', HUF: 'Hungary', TRY: 'Turkey',
      THB: 'Thailand', MYR: 'Malaysia', IDR: 'Indonesia', PHP: 'Philippines'
    };
    const userCountry = currencyToCountry[currency] || 'their country';

    const systemPrompt = `You are Mia, a friendly, knowledgeable AI nutritionist and wellness coach for the Mealzy app. You are talking with ${name}.

User profile:
- Goal: ${goal}
- Daily calorie target: ${dailyCalories} kcal
- Macro targets: Protein ${macros.protein}g, Carbs ${macros.carbs}g, Fat ${macros.fat}g
- Weight: ${weight}kg, Height: ${height}cm, Age: ${age}
- Dietary preferences: ${dietaryPrefs.length > 0 ? dietaryPrefs.join(', ') : 'None specified'}
- Allergies: ${allergies.length > 0 ? allergies.join(', ') : 'None'}
- Country / region: ${userCountry} (currency: ${currency})
- Preferred cuisine: ${preferred_cuisine || 'No preference'}

Your personality:
- Warm, encouraging, and science-based
- Give practical, actionable advice
- No emojis — plain text only
- Keep responses ${isCoachPro ? 'thorough but focused: up to 3 paragraphs, no hard word limit' : 'concise and focused: 1-2 short paragraphs max, never more than 120 words'}
- Never give medical diagnoses or replace professional medical advice
- Always tailor advice to the user's specific goals and profile
- Always respond in ${coachLangName}`;

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: isCoachPro ? 600 : 300,
      system: systemPrompt,
      messages: messages.slice(-10)
    });

    const reply = completion.content[0].text;

    res.json({
      success: true,
      message: {
        role: 'assistant',
        content: reply,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error in AI coach:', error);
    res.status(500).json({ error: 'Failed to get AI response', message: error.message });
  }
});

function generateFallbackMealPlan(profile) {
  const calories = profile?.dailyCalories || 2000;
  return {
    meals: [
      {
        type: 'breakfast', name: 'Greek Yogurt Parfait',
        description: 'Creamy Greek yogurt layered with fresh berries and granola',
        calories: Math.round(calories * 0.25), protein: 20, carbs: 35, fat: 8,
        cookTime: 5, servings: 1, estimatedCost: 3.50,
        ingredients: [
          { name: 'Greek yogurt', amount: '200g', cost: 1.80 },
          { name: 'Mixed berries', amount: '100g', cost: 1.20 },
          { name: 'Granola', amount: '50g', cost: 0.50 }
        ],
        instructions: ['Spoon yogurt into a bowl.', 'Layer with fresh berries.', 'Top with granola and serve.']
      },
      {
        type: 'lunch', name: 'Grilled Chicken Salad',
        description: 'Tender grilled chicken over crisp greens with avocado',
        calories: Math.round(calories * 0.30), protein: 40, carbs: 20, fat: 18,
        cookTime: 20, servings: 1, estimatedCost: 6.00,
        ingredients: [
          { name: 'Chicken breast', amount: '150g', cost: 3.00 },
          { name: 'Mixed salad greens', amount: '100g', cost: 1.20 },
          { name: 'Avocado', amount: '1/2', cost: 1.00 },
          { name: 'Cherry tomatoes', amount: '100g', cost: 0.80 }
        ],
        instructions: ['Season and grill chicken 6-7 min per side.', 'Let rest 5 min, then slice.', 'Arrange over greens and top with avocado and lemon juice.']
      },
      {
        type: 'snack', name: 'Apple with Almond Butter',
        description: 'Crisp apple slices with creamy almond butter',
        calories: Math.round(calories * 0.10), protein: 5, carbs: 25, fat: 8,
        cookTime: 2, servings: 1, estimatedCost: 2.00,
        ingredients: [
          { name: 'Apple', amount: '1 medium', cost: 0.80 },
          { name: 'Almond butter', amount: '2 tbsp', cost: 1.20 }
        ],
        instructions: ['Wash and slice the apple.', 'Serve with almond butter for dipping.']
      },
      {
        type: 'dinner', name: 'Salmon with Roasted Vegetables',
        description: 'Pan-seared salmon with colorful roasted seasonal vegetables',
        calories: Math.round(calories * 0.35), protein: 45, carbs: 30, fat: 20,
        cookTime: 30, servings: 1, estimatedCost: 9.00,
        ingredients: [
          { name: 'Salmon fillet', amount: '200g', cost: 5.00 },
          { name: 'Broccoli', amount: '150g', cost: 1.20 },
          { name: 'Bell pepper', amount: '1', cost: 1.00 },
          { name: 'Olive oil', amount: '1 tbsp', cost: 0.30 }
        ],
        instructions: ['Roast veg at 200°C for 20 min.', 'Cook salmon 4 min per side.', 'Serve with lemon wedge.']
      }
    ],
    totalCalories: calories,
    totalCost: 20.50,
    nutritionNote: 'Balanced meal plan with lean proteins, complex carbs, and healthy fats.'
  };
}

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Mealzy running on http://localhost:${PORT}`));
