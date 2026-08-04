/* Sample-plan data and the pure math behind the budget slider.
 *
 * Everything the Showcase renders derives from these tables, so the numbers on
 * screen can never drift apart. The grocery lines and the meal-course costs are
 * anchored to the same total at the $60 default.
 *
 * The model is exact to the cent internally, but real grocery prices are not,
 * so every figure presented as a claim is rendered through range() rather than
 * money(). Only the budget the visitor typed themselves is shown exactly.
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

/* [day, name, kcal, cents]. */
const COURSES = [
  ['Breakfast', [
    ['Mon', 'Greek Yogurt Parfait', 430, 195],
    ['Tue', 'Avocado Toast', 410, 180],
    ['Wed', 'Oat Porridge & Berries', 440, 165],
    ['Thu', 'Scrambled Eggs on Rye', 420, 190],
    ['Fri', 'Banana Smoothie Bowl', 400, 175],
    ['Sat', 'French Toast', 470, 205],
    ['Sun', 'Blueberry Pancakes', 460, 200]
  ]],
  ['Lunch', [
    ['Mon', 'Quinoa Buddha Bowl', 610, 273],
    ['Tue', 'Lentil Soup', 580, 218],
    ['Wed', 'Greek Salad & Pitta', 590, 253],
    ['Thu', 'Roasted Tomato Soup', 560, 209],
    ['Fri', 'Tuna & Corn Wrap', 620, 283],
    ['Sat', 'Caesar Salad', 600, 264],
    ['Sun', 'Mushroom Risotto', 640, 230]
  ]],
  ['Dinner', [
    ['Mon', 'Herb-Crusted Salmon', 800, 455],
    ['Tue', 'Chicken Stir-Fry', 830, 390],
    ['Wed', 'Beef & Black Bean Tacos', 810, 415],
    ['Thu', 'Pasta Pomodoro', 840, 325],
    ['Fri', 'Coconut Veggie Curry', 830, 340],
    ['Sat', 'Roast Chicken & Veg', 790, 400],
    ['Sun', 'Baked Cod & Greens', 780, 419]
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

/* Whole dollars, no cents — used for the budget the visitor set themselves. */
export const dollars = (cents) => `$${Math.round(cents / 100)}`;

/**
 * A price band around a modelled figure, in whole dollars: `$52–$64`.
 * Groceries vary by store, city and week, so every figure the page presents as
 * a claim goes through here instead of quoting a cent-exact total we cannot
 * stand behind. The band always spans at least one dollar so tiny figures
 * still read as a range.
 */
export function range(cents, spread = 0.1) {
  const low = Math.floor((cents * (1 - spread)) / 100);
  const high = Math.max(Math.ceil((cents * (1 + spread)) / 100), low + 1);
  return `$${low}–$${high}`;
}

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
    meals.map(([day, name, kcal, cents]) => ({
      day,
      name,
      kcal: Math.round((kcal * kcalRatio) / 5) * 5,
      cost: range(Math.round(cents * costRatio))
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

  return {
    budget,
    courses,
    groceries,
    spend,
    saved: budget * 100 - spend,
    kcalTarget
  };
}
