require('dotenv').config();
const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// POST /api/generate-meal — generate daily meal plan
app.post('/api/generate-meal', async (req, res) => {
  try {
    const { profile, date } = req.body;

    if (!profile) {
      return res.status(400).json({ error: 'Profile is required' });
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

    const dietaryInfo = dietaryPrefs.length > 0 ? `Dietary preferences: ${dietaryPrefs.join(', ')}.` : '';
    const allergyInfo = allergies.length > 0 ? `Allergies/restrictions: ${allergies.join(', ')}.` : '';

    const cuisines = ['Mediterranean','Asian','Mexican','Middle Eastern','Japanese','Indian','Thai','Italian','Greek','American','Korean','Vietnamese','Moroccan','Turkish','Spanish'];
    const proteins = ['chicken','salmon','tuna','beef','tofu','eggs','shrimp','turkey','lentils','chickpeas','pork','lamb','cod','tempeh','sardines'];
    const todayCuisine = cuisines[Math.floor(Math.random() * cuisines.length)];
    const tomorrowCuisine = cuisines[Math.floor(Math.random() * cuisines.length)];
    const todayProtein = proteins[Math.floor(Math.random() * proteins.length)];
    const randomSeed = Math.floor(Math.random() * 99999);

    const prompt = `You are a professional nutritionist and chef. Generate a UNIQUE daily meal plan for ${name} for ${date}.

MANDATORY THEME FOR TODAY: Primary cuisine = ${todayCuisine}, featured protein = ${todayProtein}. Random ID: ${randomSeed}.
You MUST use ${todayCuisine} cuisine as inspiration. Do NOT use generic salads or basic oatmeal. Be creative and specific.

User profile:
- Goal: ${goal}
- Daily calorie target: ${dailyCalories} kcal
- Macro targets: Protein ${dailyProtein}g, Carbs ${dailyCarbs}g, Fat ${dailyFat}g
- Cooking skill: ${cookingSkill}
- Max cooking time per meal: ${cookingTimeMinutes} minutes
- Weekly budget: ${currency} ${budget}
${dietaryInfo}
${allergyInfo}

Generate exactly 4 meals: breakfast, lunch, dinner, snack. Inspired by ${todayCuisine} cuisine using ${todayProtein}.

Respond ONLY with this JSON (keep ingredients to 4 max, instructions to 3 max, descriptions under 10 words):
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
      "imageKeyword": "breakfast bowl"
    }
  ],
  "totalCalories": 1950,
  "totalCost": 18.50,
  "nutritionNote": "Short note"
}`;

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: 'You are a professional nutritionist and chef. Always respond with valid JSON only, no markdown, no explanation. Keep instructions to max 3 steps each to stay within token limits.',
      messages: [{ role: 'user', content: prompt }]
    });

    let rawContent = completion.content[0].text.trim();
    console.log('AI response length:', rawContent.length, '| Last 100 chars:', rawContent.slice(-100));
    // Strip markdown code blocks if present
    rawContent = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    let mealPlan;

    try {
      mealPlan = JSON.parse(rawContent);
    } catch (parseError) {
      // Try to extract and fix truncated JSON
      let jsonStr = rawContent;
      const startIdx = jsonStr.indexOf('{');
      if (startIdx > 0) jsonStr = jsonStr.slice(startIdx);

      // Try to fix truncated JSON by finding last complete meal object
      try {
        // Find last complete closing brace for a meal
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

    res.json({ success: true, date, mealPlan });
  } catch (error) {
    console.error('Error generating meal plan:', error);
    res.status(500).json({
      error: 'Failed to generate meal plan',
      message: error.message,
      // Return a fallback meal plan so the app still works
      fallback: generateFallbackMealPlan(req.body.profile)
    });
  }
});

// POST /api/generate-grocery-list — generate grocery list from meal names
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
      allergies = []
    } = profile || {};

    const mealList = meals.map(m => `- ${m.name} (${m.type})`).join('\n');
    const allergyInfo = allergies.length > 0 ? `Avoid: ${allergies.join(', ')}.` : '';
    const prefInfo = dietaryPrefs.length > 0 ? `Dietary preferences: ${dietaryPrefs.join(', ')}.` : '';

    const prompt = `Generate a complete grocery list for the following weekly meals:

${mealList}

${prefInfo}
${allergyInfo}
Weekly budget: ${currency} ${budget}

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
    res.status(500).json({
      error: 'Failed to generate grocery list',
      message: error.message
    });
  }
});

// POST /api/ai-coach — AI nutritionist chat
app.post('/api/ai-coach', async (req, res) => {
  try {
    const { messages, profile } = req.body;

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
      age = 30
    } = profile || {};

    const systemPrompt = `You are Mia, a friendly, knowledgeable AI nutritionist and wellness coach for the Mealzy app. You are talking with ${name}.

User profile:
- Goal: ${goal}
- Daily calorie target: ${dailyCalories} kcal
- Macro targets: Protein ${macros.protein}g, Carbs ${macros.carbs}g, Fat ${macros.fat}g
- Weight: ${weight}kg, Height: ${height}cm, Age: ${age}
- Dietary preferences: ${dietaryPrefs.length > 0 ? dietaryPrefs.join(', ') : 'None specified'}
- Allergies: ${allergies.length > 0 ? allergies.join(', ') : 'None'}

Your personality:
- Warm, encouraging, and science-based
- Give practical, actionable advice
- Use emojis sparingly but naturally
- Keep responses concise but complete (2-4 paragraphs max)
- Never give medical diagnoses or replace professional medical advice
- Always tailor advice to the user's specific goals and profile

Topics you can help with:
- Meal planning and recipe suggestions
- Nutrition science and macros
- Weight management strategies
- Cooking tips and techniques
- Grocery shopping and budget tips
- Motivation and habit building
- Reading nutrition labels
- Healthy swaps and substitutions`;

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: systemPrompt,
      messages: messages.slice(-20) // Keep last 20 messages for context
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
    res.status(500).json({
      error: 'Failed to get AI response',
      message: error.message
    });
  }
});

// Fallback meal plan generator when API is unavailable
function generateFallbackMealPlan(profile) {
  const calories = profile?.dailyCalories || 2000;
  return {
    meals: [
      {
        type: 'breakfast',
        name: 'Greek Yogurt Parfait',
        description: 'Creamy Greek yogurt layered with fresh berries and granola',
        calories: Math.round(calories * 0.25),
        protein: 20,
        carbs: 35,
        fat: 8,
        cookTime: 5,
        servings: 1,
        estimatedCost: 3.50,
        ingredients: [
          { name: 'Greek yogurt', amount: '200g', cost: 1.80 },
          { name: 'Mixed berries', amount: '100g', cost: 1.20 },
          { name: 'Granola', amount: '50g', cost: 0.50 }
        ],
        instructions: [
          'Spoon yogurt into a bowl or glass.',
          'Layer with fresh mixed berries.',
          'Top with granola and serve immediately.'
        ]
      },
      {
        type: 'lunch',
        name: 'Grilled Chicken Salad',
        description: 'Tender grilled chicken over crisp greens with avocado and lemon dressing',
        calories: Math.round(calories * 0.30),
        protein: 40,
        carbs: 20,
        fat: 18,
        cookTime: 20,
        servings: 1,
        estimatedCost: 6.00,
        ingredients: [
          { name: 'Chicken breast', amount: '150g', cost: 3.00 },
          { name: 'Mixed salad greens', amount: '100g', cost: 1.20 },
          { name: 'Avocado', amount: '1/2', cost: 1.00 },
          { name: 'Cherry tomatoes', amount: '100g', cost: 0.80 }
        ],
        instructions: [
          'Season chicken breast with salt, pepper, and olive oil.',
          'Grill or pan-fry chicken for 6-7 minutes per side.',
          'Let rest 5 minutes, then slice.',
          'Arrange greens, tomatoes, and avocado in a bowl.',
          'Top with sliced chicken and drizzle with lemon juice.'
        ]
      },
      {
        type: 'snack',
        name: 'Apple with Almond Butter',
        description: 'Crisp apple slices with creamy almond butter for a balanced snack',
        calories: Math.round(calories * 0.10),
        protein: 5,
        carbs: 25,
        fat: 8,
        cookTime: 2,
        servings: 1,
        estimatedCost: 2.00,
        ingredients: [
          { name: 'Apple', amount: '1 medium', cost: 0.80 },
          { name: 'Almond butter', amount: '2 tbsp', cost: 1.20 }
        ],
        instructions: [
          'Wash and slice the apple.',
          'Serve with almond butter for dipping.'
        ]
      },
      {
        type: 'dinner',
        name: 'Salmon with Roasted Vegetables',
        description: 'Pan-seared salmon fillet with colorful roasted seasonal vegetables',
        calories: Math.round(calories * 0.35),
        protein: 45,
        carbs: 30,
        fat: 20,
        cookTime: 30,
        servings: 1,
        estimatedCost: 9.00,
        ingredients: [
          { name: 'Salmon fillet', amount: '200g', cost: 5.00 },
          { name: 'Broccoli', amount: '150g', cost: 1.20 },
          { name: 'Bell pepper', amount: '1', cost: 1.00 },
          { name: 'Olive oil', amount: '1 tbsp', cost: 0.30 },
          { name: 'Garlic', amount: '2 cloves', cost: 0.20 },
          { name: 'Lemon', amount: '1/2', cost: 0.30 }
        ],
        instructions: [
          'Preheat oven to 200°C (400°F).',
          'Toss vegetables with olive oil, garlic, salt and pepper.',
          'Roast vegetables for 20 minutes until tender.',
          'Season salmon with salt, pepper, and lemon zest.',
          'Heat oil in pan, cook salmon 4 minutes per side.',
          'Serve salmon over roasted vegetables with lemon wedge.'
        ]
      }
    ],
    totalCalories: calories,
    totalCost: 20.50,
    nutritionNote: 'This balanced meal plan supports your health goals with lean proteins, complex carbs, and healthy fats.'
  };
}

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Mealzy running on http://localhost:${PORT}`));
