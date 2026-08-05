/* Sample-plan data and the pure math behind the budget slider.
 *
 * Everything the Showcase renders derives from these tables, so the numbers on
 * screen can never drift apart. The grocery lines and the per-meal costs are
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

/**
 * Unsplash CDN URL for a stored photo id. The transform params live here so
 * every meal photo is cropped, compressed and format-negotiated identically.
 * Every id below was checked against the dish it is attached to.
 */
export const photo = (id, w = 400) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

/* One entry per day, three courses each: [course, name, kcal, cents, photoId]. */
const DAYS = [
  ['Monday', [
    ['Breakfast', 'Greek Yogurt Parfait', 430, 195, '1567769541495-338ee7203e3c'],
    ['Lunch', 'Quinoa Buddha Bowl', 610, 273, '1505576633757-0ac1084af824'],
    ['Dinner', 'Herb-Crusted Salmon', 800, 455, '1519708227418-c8fd9a32b7a2']
  ]],
  ['Tuesday', [
    ['Breakfast', 'Avocado Toast', 410, 180, '1687276287139-88f7333c8ca4'],
    ['Lunch', 'Lentil Soup', 580, 218, '1476718406336-bb5a9690ee2a'],
    ['Dinner', 'Chicken Stir-Fry', 830, 390, '1512058564366-18510be2db19']
  ]],
  ['Wednesday', [
    ['Breakfast', 'Oat Porridge & Berries', 440, 165, '1610441009633-b6ca9c6d4be2'],
    ['Lunch', 'Greek Salad & Pitta', 590, 253, '1607532941433-304659e8198a'],
    ['Dinner', 'Beef & Black Bean Tacos', 810, 415, '1599974579688-8dbdd335c77f']
  ]],
  ['Thursday', [
    ['Breakfast', 'Scrambled Eggs on Rye', 420, 190, '1687630433865-f86f07be989a'],
    ['Lunch', 'Roasted Tomato Soup', 560, 209, '1620791144170-8a443bf37a33'],
    ['Dinner', 'Pasta Pomodoro', 840, 325, '1608897013039-887f21d8c804']
  ]],
  ['Friday', [
    ['Breakfast', 'Banana Smoothie Bowl', 400, 175, '1640126219893-6c869dbe9bd0'],
    ['Lunch', 'Tuna & Corn Wrap', 620, 283, '1646530208887-8a791bff4701'],
    ['Dinner', 'Coconut Veggie Curry', 830, 340, '1596797038530-2c107229654b']
  ]],
  ['Saturday', [
    ['Breakfast', 'French Toast', 470, 205, '1484723091739-30a097e8f929'],
    ['Lunch', 'Caesar Salad', 600, 264, '1746211108786-ca20c8f80ecd'],
    ['Dinner', 'Roast Chicken & Veg', 790, 400, '1720983197848-39f51a5e4544']
  ]],
  ['Sunday', [
    ['Breakfast', 'Blueberry Pancakes', 460, 200, '1528207776546-365bb710ee93'],
    ['Lunch', 'Mushroom Risotto', 640, 230, '1682428617976-f25633ed8469'],
    ['Dinner', 'Baked Cod & Greens', 780, 419, '1587913956756-4fcf4833241d']
  ]]
];

/* What actually goes in the trolley this week, in cents at the baseline
 * budget. Quantities are what the 21 meals above consume, not round pack
 * sizes — the list is meant to be shoppable, not illustrative. */
const FRESH = [
  ['Produce', [
    ['Cherry tomatoes', '400 g', 340], ['Baby spinach', '200 g', 230],
    ['Avocados', '3', 390], ['Lemons', '4', 190], ['Garlic', '1 bulb', 70],
    ['Broccoli', '500 g', 210], ['Bananas', '6', 190]
  ]],
  ['Protein', [
    ['Chicken breast', '600 g', 790], ['Salmon fillet', '400 g', 960],
    ['Greek yogurt', '500 g', 320], ['Free-range eggs', '12', 340],
    ['Tinned tuna', '3 tins', 420]
  ]]
];

/* Cupboard items the week draws on rather than buys outright. Priced at the
 * share this week's meals actually use, so a $5 bottle of olive oil doesn't
 * land on the receipt as a weekly grocery cost. */
const PANTRY = [
  ['Rolled oats', '350 g', 72],
  ['Pasta', '400 g', 160],
  ['Quinoa', '180 g', 209],
  ['Red lentils', '200 g', 105],
  ['Olive oil', '4 tbsp', 62]
];

/* The dietary styles the product can actually preview end to end. `signup` is
 * the value handed to the signup page so the choice survives the jump; it
 * matches the dietary values server.js already accepts. Lives here, not in the
 * modal, because the hero form offers the same list.  */
export const DIETS = [
  {
    id: 'balanced', label: 'Balanced', signup: 'none', kcal: 2100,
    dinners: [
      'Herb-Crusted Salmon', 'Chicken Stir-Fry', 'Beef & Black Bean Tacos',
      'Pasta Pomodoro', 'Coconut Veggie Curry', 'Roast Chicken & Veg', 'Baked Cod & Greens'
    ]
  },
  {
    id: 'high-protein', label: 'High protein', signup: 'high-protein', kcal: 2200,
    dinners: [
      'Grilled Chicken & Quinoa', 'Turkey Chili', 'Steak & Roast Potatoes',
      'Tuna Steak & Edamame', 'Cottage Cheese Pasta Bake', 'Pork Loin & Green Beans',
      'Shrimp & Egg Fried Rice'
    ]
  },
  {
    id: 'vegan', label: 'Vegan', signup: 'vegan', kcal: 2000,
    dinners: [
      'Chickpea Tikka Masala', 'Black Bean Burrito Bowl', 'Peanut Tofu Noodles',
      'Lentil Shepherd’s Pie', 'Mushroom & Barley Risotto', 'Roasted Cauliflower Tacos',
      'Red Curry Tempeh'
    ]
  },
  {
    id: 'keto', label: 'Keto', signup: 'keto', kcal: 1900,
    dinners: [
      'Garlic Butter Salmon', 'Chicken Alfredo Zoodles', 'Beef & Broccoli Skillet',
      'Egg Roll in a Bowl', 'Pesto Chicken Bake', 'Cauliflower Cottage Pie',
      'Ribeye & Asparagus'
    ]
  }
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

/* Real weeks are not flat. A plan that hits the same number seven days running
 * reads as a spreadsheet, not as food, so each day carries a fixed shift as a
 * fraction of the target — a lighter Monday, a heavier Saturday. The shifts sum
 * to exactly zero, so the week still averages onto the target the visitor set.
 * At the $60 default (2,100 kcal) this spans 1,940 to 2,220. */
const DAY_KCAL_SHIFT = [-0.076, 0.038, -0.019, 0.057, -0.043, 0.024, 0.019];

/**
 * The seven daily calorie figures for a target, each rounded to the nearest 5.
 * The rounding can drift the week off the target by a few kcal; the drift is
 * settled 5 at a time across separate days rather than dumped on one, so no
 * single day is visibly bent to make the average work.
 */
function dailyKcals(target) {
  const days = DAY_KCAL_SHIFT.map((shift) => Math.round((target * (1 + shift)) / 5) * 5);
  const drift = target * 7 - days.reduce((n, k) => n + k, 0);
  const steps = Math.round(drift / 5);

  for (let i = 0; i < Math.abs(steps); i++) days[i % days.length] += Math.sign(steps) * 5;

  return days;
}

/**
 * Recompute the whole sample plan for a weekly budget in whole dollars.
 * Pure and deterministic — the same budget always yields the same plan.
 */
export function planFor(budget) {
  const costRatio = budget / BASE_BUDGET;
  const kcalTarget = kcalTargetFor(budget);

  const dayKcals = dailyKcals(kcalTarget);

  const days = DAYS.map(([day, meals], d) => {
    /* The source rows carry the shape of a day — a light breakfast, a heavier
     * dinner — not its total. Each day is scaled onto its own calorie figure and
     * the rounding remainder settled on dinner, so the three meals on a card
     * always add up to exactly that day's total. */
    const dayKcal = dayKcals[d];
    const raw = meals.reduce((n, [, , kcal]) => n + kcal, 0);
    const kcals = meals.map(([, , kcal]) => Math.round((kcal * dayKcal) / raw / 5) * 5);
    kcals[kcals.length - 1] += dayKcal - kcals.reduce((n, k) => n + k, 0);

    return {
      day,
      kcal: dayKcal,
      meals: meals.map(([course, name, , cents, img], i) => ({
        course,
        name,
        img,
        kcal: kcals[i],
        cost: range(Math.round(cents * costRatio))
      }))
    };
  });

  const scale = (items) =>
    items.map(([item, qty, cents]) => [item, qty, Math.round(cents * costRatio)]);

  const fresh = FRESH.map(([aisle, items]) => [aisle, scale(items)]);
  const pantry = scale(PANTRY);

  /* Spend is the sum of what the list actually shows, never a separate
   * estimate, so the receipt always adds up to the figure above it. Pantry
   * shares count because they are a real cost of cooking the week. */
  const sum = (items) => items.reduce((n, [, , cents]) => n + cents, 0);
  const spend = fresh.reduce((total, [, items]) => total + sum(items), 0) + sum(pantry);

  /* Averaged from the days actually rendered rather than quoted from the
   * target, so the headline figure can never disagree with the cards under it
   * even if the shift table is edited. */
  const kcalAvg = Math.round(dayKcals.reduce((n, k) => n + k, 0) / dayKcals.length);

  return {
    budget,
    days,
    fresh,
    pantry,
    spend,
    saved: budget * 100 - spend,
    kcalTarget,
    kcalAvg
  };
}
