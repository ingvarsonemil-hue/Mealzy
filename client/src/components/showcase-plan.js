/* Sample-plan data and the pure math behind the budget slider.
 *
 * Everything the Showcase renders derives from these tables, so the numbers on
 * screen can never drift apart. Two anchors hold the model together at the
 * $60 default: the grocery lines sum to exactly $57.84, and the meal-course
 * costs sum to exactly $57.84 as well.
 *
 * Cost scales linearly with the budget (a bigger basket buys more and better
 * ingredients). Calories scale far more gently — cheap calories are easy, so
 * tripling the budget must not triple the plate. */

export const BASE_BUDGET = 60;
export const MIN_BUDGET = 40;
export const MAX_BUDGET = 120;
export const BUDGET_STEP = 5;

/* Daily calorie target at the baseline budget. */
const BASE_KCAL_TARGET = 2100;

/* Macro targets in grams at BASE_KCAL_TARGET, in bar order. */
const MACRO_TARGETS = [
  { key: 'protein', label: 'Protein', grams: 150, color: 'var(--clr-warning)' },
  { key: 'carbs', label: 'Carbs', grams: 220, color: 'var(--clr-info)' },
  { key: 'fat', label: 'Fat', grams: 70, color: 'var(--clr-accent)' }
];

/* [day, name, kcal, cents, [protein, carb, fat] as % of calories].
 * Splits are percentages of energy, so grams stay consistent at any scale. */
const COURSES = [
  ['Breakfast', [
    ['Mon', 'Greek Yogurt Parfait', 430, 195, [30, 47, 23]],
    ['Tue', 'Avocado Toast', 410, 180, [15, 46, 39]],
    ['Wed', 'Oat Porridge & Berries', 440, 165, [19, 57, 24]],
    ['Thu', 'Scrambled Eggs on Rye', 420, 190, [29, 33, 38]],
    ['Fri', 'Banana Smoothie Bowl', 400, 175, [19, 62, 19]],
    ['Sat', 'French Toast', 470, 205, [22, 50, 28]],
    ['Sun', 'Blueberry Pancakes', 460, 200, [18, 57, 25]]
  ]],
  ['Lunch', [
    ['Mon', 'Quinoa Buddha Bowl', 610, 273, [24, 52, 24]],
    ['Tue', 'Lentil Soup', 580, 218, [29, 52, 19]],
    ['Wed', 'Greek Salad & Pitta', 590, 253, [22, 43, 35]],
    ['Thu', 'Roasted Tomato Soup', 560, 209, [16, 55, 29]],
    ['Fri', 'Tuna & Corn Wrap', 620, 283, [36, 42, 22]],
    ['Sat', 'Caesar Salad', 600, 264, [34, 24, 42]],
    ['Sun', 'Mushroom Risotto', 640, 230, [16, 59, 25]]
  ]],
  ['Dinner', [
    ['Mon', 'Herb-Crusted Salmon', 800, 455, [39, 24, 37]],
    ['Tue', 'Chicken Stir-Fry', 830, 390, [42, 34, 24]],
    ['Wed', 'Beef & Black Bean Tacos', 810, 415, [34, 38, 28]],
    ['Thu', 'Pasta Pomodoro', 840, 325, [19, 62, 19]],
    ['Fri', 'Coconut Veggie Curry', 830, 340, [16, 48, 36]],
    ['Sat', 'Roast Chicken & Veg', 790, 400, [44, 23, 33]],
    ['Sun', 'Baked Cod & Greens', 780, 419, [49, 23, 28]]
  ]]
];

/* Grocery lines in cents at the baseline budget. This list — not the sum of
 * the course costs — is the single source of truth for the week's spend, so
 * the receipt total and the budget card can never disagree by a rounding cent. */
const GROCERIES = [
  ['Produce', [
    ['Cherry tomatoes', 340], ['Baby spinach 200 g', 230], ['Avocados ×3', 390],
    ['Lemons ×4', 190], ['Garlic bulb', 70], ['Broccoli 500 g', 210], ['Bananas ×6', 190]
  ]],
  ['Protein', [
    ['Chicken breast 600 g', 790], ['Salmon fillet 400 g', 960],
    ['Greek yogurt 500 g', 320], ['Free-range eggs ×12', 340], ['Tinned tuna ×3', 420]
  ]],
  ['Pantry', [
    ['Quinoa 250 g', 290], ['Red lentils 400 g', 210],
    ['Pasta 400 g', 160], ['Olive oil 500 ml', 520], ['Rolled oats 750 g', 154]
  ]]
];

export const money = (cents) => `$${(cents / 100).toFixed(2)}`;

/* Daily calorie target: +12 kcal per extra dollar, so $40 → 1,860 and
 * $60 → 2,100 exactly. */
const kcalTargetFor = (budget) => 1860 + (budget - MIN_BUDGET) * 12;

/**
 * Recompute the whole sample plan for a weekly budget in whole dollars.
 * Pure and deterministic — the same budget always yields the same plan.
 */
export function planFor(budget) {
  const costRatio = budget / BASE_BUDGET;
  const kcalTarget = kcalTargetFor(budget);
  const kcalRatio = kcalTarget / BASE_KCAL_TARGET;

  const courses = COURSES.map(([course, meals]) => [
    course,
    meals.map(([day, name, kcal, cents, split]) => ({
      day,
      name,
      kcal: Math.round((kcal * kcalRatio) / 5) * 5,
      cost: money(Math.round(cents * costRatio)),
      split
    }))
  ]);

  const groceries = GROCERIES.map(([aisle, items]) => [
    aisle,
    items.map(([item, cents]) => [item, Math.round(cents * costRatio)])
  ]);

  /* Spend is the sum of what the list actually shows, never a separate
   * estimate, so the receipt always adds up to the figure above it. */
  const spend = groceries.reduce(
    (total, [, items]) => total + items.reduce((n, [, cents]) => n + cents, 0),
    0
  );

  /* Daily averages across all 21 courses, converted from energy to grams. */
  const perGram = { protein: 4, carbs: 4, fat: 9 };
  const totals = { protein: 0, carbs: 0, fat: 0 };
  for (const [, meals] of courses) {
    for (const { kcal, split } of meals) {
      totals.protein += (kcal * split[0]) / 100 / perGram.protein;
      totals.carbs += (kcal * split[1]) / 100 / perGram.carbs;
      totals.fat += (kcal * split[2]) / 100 / perGram.fat;
    }
  }

  const macros = MACRO_TARGETS.map(({ key, label, grams, color }) => {
    const target = Math.round((grams * kcalRatio) / 5) * 5;
    const value = Math.round(totals[key] / 7);
    return { label, value, target, pct: Math.min(100, Math.round((value / target) * 100)), color };
  });

  const dailyKcal =
    courses.reduce((n, [, meals]) => n + meals.reduce((s, m) => s + m.kcal, 0), 0) / 7;

  return {
    budget,
    courses,
    groceries,
    spend,
    saved: budget * 100 - spend,
    kcalTarget,
    dailyKcal: Math.round(dailyKcal),
    macros
  };
}
