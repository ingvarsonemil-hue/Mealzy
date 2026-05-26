#!/usr/bin/env node
/**
 * Quinn's AI Quality Test Suite
 * Tests meal plan output for dietary compliance, calorie accuracy, and variety.
 *
 * Usage:
 *   1. Make sure the server is running: node server.js
 *   2. Run: node test-ai-quality.js
 *
 * No auth needed — uses PRO_TOKEN bypass so no free limit is hit.
 */

'use strict';
require('dotenv').config();

const BASE_URL = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const PRO_TOKEN = process.env.PRO_TOKEN;

if (!PRO_TOKEN) {
  console.error('[FATAL] PRO_TOKEN not set in .env — cannot run tests.');
  process.exit(1);
}

// ── Test profiles ─────────────────────────────────────────────────────────────

const TEST_PROFILES = [
  {
    name: 'Test 1 — Standard (baseline)',
    profile: {
      name: 'Quinn Test',
      goal: 'lose weight',
      daily_calories: 1800,
      daily_protein: 135,
      daily_carbs: 180,
      daily_fat: 60,
      budget_weekly: 80,
      currency: 'USD',
      cooking_time_minutes: 30,
      dietary_preferences: [],
      allergies: [],
      cooking_skill: 'intermediate',
      language: 'en'
    },
    checks: ['calories', 'variety', 'json']
  },
  {
    name: 'Test 2 — Vegan + tight budget',
    profile: {
      name: 'Quinn Test',
      goal: 'maintain weight',
      daily_calories: 2000,
      daily_protein: 80,
      daily_carbs: 260,
      daily_fat: 65,
      budget_weekly: 50,
      currency: 'USD',
      cooking_time_minutes: 40,
      dietary_preferences: ['vegan'],
      allergies: [],
      cooking_skill: 'beginner',
      language: 'en'
    },
    checks: ['calories', 'vegan', 'budget', 'json']
  },
  {
    name: 'Test 3 — Keto + high calorie (gain muscle)',
    profile: {
      name: 'Quinn Test',
      goal: 'gain muscle',
      daily_calories: 2800,
      daily_protein: 200,
      daily_carbs: 25,
      daily_fat: 180,
      budget_weekly: 120,
      currency: 'USD',
      cooking_time_minutes: 45,
      dietary_preferences: ['keto'],
      allergies: [],
      cooking_skill: 'intermediate',
      language: 'en'
    },
    checks: ['calories', 'keto', 'json']
  },
  {
    name: 'Test 4 — Gluten-free + vegetarian',
    profile: {
      name: 'Quinn Test',
      goal: 'lose weight',
      daily_calories: 1600,
      daily_protein: 100,
      daily_carbs: 160,
      daily_fat: 55,
      budget_weekly: 70,
      currency: 'USD',
      cooking_time_minutes: 30,
      dietary_preferences: ['vegetarian', 'gluten-free'],
      allergies: [],
      cooking_skill: 'beginner',
      language: 'en'
    },
    checks: ['calories', 'vegetarian', 'gluten_free', 'json']
  },
  {
    name: 'Test 5 — Keto + vegan (hardest combo)',
    profile: {
      name: 'Quinn Test',
      goal: 'lose weight',
      daily_calories: 1800,
      daily_protein: 100,
      daily_carbs: 20,
      daily_fat: 140,
      budget_weekly: 90,
      currency: 'USD',
      cooking_time_minutes: 40,
      dietary_preferences: ['keto', 'vegan'],
      allergies: [],
      cooking_skill: 'intermediate',
      language: 'en'
    },
    checks: ['calories', 'keto', 'vegan', 'json']
  }
];

// ── Violation checkers ────────────────────────────────────────────────────────

const ANIMAL_PRODUCTS = [
  'chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'fish', 'salmon', 'tuna',
  'shrimp', 'prawns', 'cod', 'sardine', 'anchovy', 'lobster', 'crab', 'scallop',
  'milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'egg', 'honey',
  'whey', 'gelatin', 'lard', 'bacon', 'ham', 'sausage', 'mince', 'meatball'
];

const GLUTEN_SOURCES = [
  'wheat', 'bread', 'pasta', 'flour', 'noodle', 'couscous', 'barley', 'rye',
  'soy sauce', 'malt', 'seitan', 'crouton', 'breadcrumb', 'wrap', 'tortilla',
  'pita', 'bagel', 'croissant', 'cracker', 'cereal', 'oat' // oats often cross-contaminated
];

const HIGH_CARB_FOODS = [
  'bread', 'pasta', 'rice', 'potato', 'sugar', 'honey', 'flour', 'oat',
  'cereal', 'corn', 'tortilla', 'wrap', 'noodle', 'cracker', 'fruit juice',
  'banana', 'mango', 'grape', 'apple', 'orange', 'lentil', 'bean', 'chickpea',
  'pea', 'sweet potato', 'quinoa', 'couscous', 'bulgur'
];

// Check ingredient names only (not descriptions) to reduce false positives
function ingredientNames(meal) {
  if (!Array.isArray(meal.ingredients)) return JSON.stringify(meal).toLowerCase();
  return meal.ingredients.map(i => (i.name || '').toLowerCase()).join(' ');
}

function checkVegan(meals) {
  // Exclude plant-based items that sound like animal products
  const VEGAN_SAFE = ['coconut milk', 'coconut cream', 'oat milk', 'soy milk', 'almond milk',
    'coconut butter', 'nut butter', 'peanut butter', 'almond butter', 'cashew butter',
    'macadamia butter', 'sunflower butter', 'tahini butter', 'coconut oil',
    'vegan cream', 'cashew cream', 'oat cream', 'coconut yoghurt', 'coconut yogurt',
    'oat cream', 'soy cream'];
  const violations = [];
  for (const meal of meals) {
    const raw = JSON.stringify(meal).toLowerCase();
    // Remove known-safe vegan items from the text before checking
    let text = raw;
    VEGAN_SAFE.forEach(safe => { text = text.split(safe).join(''); });
    for (const ingredient of ANIMAL_PRODUCTS) {
      // Use word boundary check to avoid partial matches (e.g. 'cream' in 'ice cream vs coconut cream')
      if (new RegExp(`\\b${ingredient}\\b`).test(text)) {
        violations.push(`${meal.name}: contains "${ingredient}"`);
      }
    }
  }
  return violations;
}

function checkGlutenFree(meals) {
  // Skip keto-friendly "cauliflower X" or "zucchini X" substitutes
  const GF_SAFE = ['cauliflower rice', 'zucchini noodle', 'zucchini pasta', 'shirataki noodle',
    'rice noodle', 'rice bread', 'gluten-free oat', 'gf oat', 'certified gluten-free'];
  const violations = [];
  for (const meal of meals) {
    const raw = JSON.stringify(meal).toLowerCase();
    let text = raw;
    GF_SAFE.forEach(safe => { text = text.split(safe).join(''); });
    for (const ingredient of GLUTEN_SOURCES) {
      // Only check ingredient names and meal names, not every description word
      const mealName = meal.name?.toLowerCase() || '';
      const ingredients = ingredientNames(meal);
      const combined = mealName + ' ' + ingredients;
      if (new RegExp(`\\b${ingredient}\\b`).test(combined)) {
        violations.push(`${meal.name}: ingredient/name contains "${ingredient}"`);
      }
    }
  }
  return violations;
}

function checkVegetarian(meals) {
  const meatOnly = ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'fish',
    'salmon', 'tuna', 'shrimp', 'prawn', 'cod', 'sardine', 'bacon', 'ham',
    'sausage', 'meatball', 'anchovy', 'lobster', 'crab', 'venison'];
  const violations = [];
  for (const meal of meals) {
    const mealName = meal.name?.toLowerCase() || '';
    const ingredients = ingredientNames(meal);
    const combined = mealName + ' ' + ingredients;
    for (const ingredient of meatOnly) {
      if (new RegExp(`\\b${ingredient}\\b`).test(combined)) {
        violations.push(`${meal.name}: contains "${ingredient}"`);
      }
    }
  }
  return violations;
}

function checkKeto(meals) {
  // Items that SOUND high-carb but are keto-friendly
  const KETO_SAFE = ['cauliflower rice', 'zucchini noodle', 'zucchini pasta',
    'shirataki noodle', 'hearts of palm pasta', 'konjac noodle'];
  const violations = [];
  let totalCarbs = 0;
  for (const meal of meals) {
    totalCarbs += (meal.carbs || 0);
    const rawIngredients = ingredientNames(meal);
    let ingredients = rawIngredients;
    KETO_SAFE.forEach(safe => { ingredients = ingredients.split(safe).join(''); });
    for (const food of HIGH_CARB_FOODS) {
      if (new RegExp(`\\b${food}\\b`).test(ingredients)) {
        violations.push(`${meal.name}: ingredient "${food}" — high carb`);
      }
    }
  }
  if (totalCarbs > 30) { // slightly relaxed to 30g to account for rounding
    violations.push(`Total daily carbs = ${totalCarbs}g — exceeds keto limit of 30g`);
  }
  return violations;
}

function checkCalories(meals, targetCalories) {
  const total = meals.reduce((sum, m) => sum + (m.calories || 0), 0);
  const variance = Math.abs(total - targetCalories);
  const pct = (variance / targetCalories * 100).toFixed(1);
  if (variance > targetCalories * 0.15) {
    return [`Total calories ${total} vs target ${targetCalories} — ${pct}% off (>15% tolerance)`];
  }
  return [];
}

function checkVariety(meals) {
  const proteins = meals.map(m => {
    const text = JSON.stringify(m).toLowerCase();
    for (const p of ['chicken', 'beef', 'tofu', 'eggs', 'salmon', 'tuna', 'lentil',
      'chickpea', 'tempeh', 'shrimp', 'turkey', 'pork', 'lamb']) {
      if (text.includes(p)) return p;
    }
    return 'unknown';
  });
  const counts = {};
  proteins.forEach(p => counts[p] = (counts[p] || 0) + 1);
  const violations = [];
  for (const [protein, count] of Object.entries(counts)) {
    if (count >= 3 && protein !== 'unknown') {
      violations.push(`"${protein}" appears ${count} times in one day — no variety`);
    }
  }
  return violations;
}

// ── Test runner ───────────────────────────────────────────────────────────────

async function runTest(test) {
  const today = new Date().toISOString().split('T')[0];

  let response;
  try {
    response = await fetch(`${BASE_URL}/api/generate-meal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: test.profile,
        date: today,
        plan_token: PRO_TOKEN
      })
    });
  } catch (err) {
    return { name: test.name, score: 0, error: `Server unreachable: ${err.message}`, violations: [], passed: false };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { name: test.name, score: 0, error: 'Response is not valid JSON', violations: [], passed: false };
  }

  // API returns { success, date, mealPlan: { meals: [...] } }
  const meals = data.meals || data.mealPlan?.meals;
  if (!meals || !Array.isArray(meals)) {
    return { name: test.name, score: 0, error: `No meals in response: ${JSON.stringify(data).slice(0, 200)}`, violations: [], passed: false };
  }
  const violations = [];

  if (test.checks.includes('vegan'))       violations.push(...checkVegan(meals).map(v => `[VEGAN] ${v}`));
  if (test.checks.includes('vegetarian'))  violations.push(...checkVegetarian(meals).map(v => `[VEGETARIAN] ${v}`));
  if (test.checks.includes('gluten_free')) violations.push(...checkGlutenFree(meals).map(v => `[GLUTEN-FREE] ${v}`));
  if (test.checks.includes('keto'))        violations.push(...checkKeto(meals).map(v => `[KETO] ${v}`));
  if (test.checks.includes('calories'))    violations.push(...checkCalories(meals, test.profile.daily_calories).map(v => `[CALORIES] ${v}`));
  if (test.checks.includes('variety'))     violations.push(...checkVariety(meals).map(v => `[VARIETY] ${v}`));

  // Score: start at 10, -2 per violation, min 0
  const score = Math.max(0, 10 - violations.length * 2);
  const passed = violations.length === 0;

  return { name: test.name, score, violations, passed, meals: meals.map(m => m.name) };
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('QUINN — AI QUALITY TEST SUITE');
  console.log(`Date: ${new Date().toLocaleDateString()}`);
  console.log(`Server: ${BASE_URL}`);
  console.log('='.repeat(60) + '\n');

  let totalPassed = 0;
  const results = [];

  for (const test of TEST_PROFILES) {
    process.stdout.write(`Running: ${test.name} ... `);
    const result = await runTest(test);
    results.push(result);

    if (result.error) {
      console.log(`ERROR`);
      console.log(`  Error: ${result.error}`);
    } else if (result.passed) {
      console.log(`PASS (${result.score}/10)`);
      totalPassed++;
    } else {
      console.log(`FAIL (${result.score}/10)`);
      result.violations.forEach(v => console.log(`  ✗ ${v}`));
    }

    if (result.meals) {
      console.log(`  Meals: ${result.meals.join(' | ')}`);
    }
    console.log();

    // Small delay between tests to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('='.repeat(60));
  console.log(`RESULT: ${totalPassed}/${TEST_PROFILES.length} tests passed`);
  console.log('='.repeat(60));

  if (totalPassed < TEST_PROFILES.length) {
    console.log('\nFailed tests need reflection entries in .agents/memory/quinn.md');
    console.log('For each failure, write: what failed, root cause, and what prompt change to try.\n');
    process.exit(1);
  } else {
    console.log('\nAll tests passed. Log a positive entry in .agents/memory/quinn.md.\n');
  }
}

main().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
