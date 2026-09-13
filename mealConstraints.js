'use strict';

/**
 * Dietary/allergy constraint text, cuisine/protein variety picking, and the
 * meal JSON schema used in every Anthropic meal-generation prompt (full-day,
 * full-week, single-meal swap, and mobile swap-alternatives). Extracted
 * verbatim from /api/generate-meal (server.js) so every caller builds these
 * blocks identically instead of drifting across copies — see server.js's
 * generate-meal route and routes/mealSwap.js for the two call sites.
 */

const DIET_RULES = {
  vegan:       'VEGAN — zero animal products. NEVER use: meat, fish, seafood, chicken, beef, pork, lamb, turkey, duck, eggs, milk, cheese, butter, cream, yoghurt, honey, ghee, lard, whey, gelatin. Use ONLY: vegetables, fruits, legumes, grains, nuts, seeds, plant-based oils, tofu, tempeh, seitan (if not GF), coconut milk, oat milk, soy milk, almond milk.',
  vegetarian:  'VEGETARIAN — no meat or fish. NEVER use: chicken, beef, pork, lamb, turkey, duck, fish, salmon, tuna, shrimp, prawns, cod, sardines, anchovies, bacon, ham, sausage. Eggs and dairy are allowed.',
  'gluten-free':'GLUTEN-FREE — no gluten. NEVER use: wheat, white flour, bread, sourdough, toast, wrap, pita, tortilla, pasta, noodles, couscous, barley, rye, seitan, soy sauce (use tamari), malt, crackers, croutons, breadcrumbs, regular oats. ALLOWED: rice, quinoa, potatoes, corn, certified GF oats, rice noodles, tamari.',
  keto:        'KETO — max 25g total net carbs per day across all 4 meals. NEVER use: bread, pasta, rice, potatoes, corn, tortillas, wraps, noodles, couscous, sugar, honey, fruit juice, bananas, grapes, mangoes, apples, oranges, lentils, chickpeas, beans, peas, sweet potatoes, quinoa. ALLOWED: meat, fish, eggs, cheese, cream, butter, avocado, leafy greens, cauliflower, broccoli, zucchini, nuts, seeds, olive oil.',
  halal:       'HALAL — no pork or alcohol. NEVER use: pork, bacon, ham, lard, gelatin (unless halal-certified), alcohol, wine, beer in cooking.',
  'dairy-free':'DAIRY-FREE — no dairy. NEVER use: milk, cheese, butter, cream, yoghurt, ghee, whey, casein. Use: plant-based alternatives like coconut milk, oat milk, soy milk, vegan butter.',
};

/** Builds the dietaryBlock/allergyBlock/avoidBlock prompt fragments plus the
 * isVegan/isKeto flags (needed by buildEligibleProteins) from already-resolved
 * (normalizedSettings-precedence-applied) dietaryPrefs/allergies/avoidList
 * arrays. Pure — no session/db access, so both /api/generate-meal and the
 * mobile swap-alternatives endpoint call it with their own resolved inputs. */
function buildDietaryBlocks({ dietaryPrefs = [], allergies = [], avoidList = [] }) {
  const isVegan = dietaryPrefs.map(p => p.toLowerCase()).includes('vegan');
  const isKeto  = dietaryPrefs.map(p => p.toLowerCase()).includes('keto');
  const comboRules = (isVegan && isKeto)
    ? '\nKETO + VEGAN COMBINATION: Use ONLY these protein sources: tofu, tempeh, edamame, hemp seeds. Use ONLY these fats: avocado, coconut oil, olive oil, nuts (almonds, walnuts, macadamia), seeds (chia, flax, sunflower). Absolutely NO eggs, dairy, fish, or meat of any kind. NO grains, legumes (except edamame/tofu/tempeh), or starchy vegetables.'
    : '';
  const activeDietRules = (dietaryPrefs
    .map(p => DIET_RULES[p.toLowerCase()] || `STRICT DIETARY REQUIREMENT: User is ${p}. Every meal MUST comply.`)
    .join('\n')) + comboRules;
  const dietaryBlock = activeDietRules
    ? `\n⚠️ DIETARY RULES — HIGHEST PRIORITY — THESE OVERRIDE EVERYTHING ELSE:\n${activeDietRules}\nDouble-check every ingredient against these rules before including it.\n`
    : '';
  const allergyBlock = allergies.length > 0
    ? `\n⚠️ ALLERGY WARNING — NEVER include these ingredients in any form: ${allergies.join(', ')}.\n`
    : '';
  const avoidBlock = avoidList.length > 0
    ? `STRICT AVOID — do not include any of these previously rejected meals: ${avoidList.join(', ')}.`
    : '';
  return { dietaryBlock, allergyBlock, avoidBlock, isVegan, isKeto, activeDietRules };
}

const cuisineGroups = {
  mediterranean:['Greek','Italian','Spanish','Moroccan','Turkish','Lebanese','Tunisian'],
  asian:['Japanese','Chinese','Korean','Vietnamese','Thai','Filipino','Malaysian','Indonesian'],
  indian:['North Indian','South Indian','Bengali','Punjabi','Goan'],
  middleeastern:['Lebanese','Persian','Israeli','Egyptian','Jordanian'],
  american:['American','Tex-Mex','Southern BBQ','New England','Californian'],
  mexican:['Mexican','Oaxacan','Yucatecan','Street Food Mexican'],
  scandinavian:['Swedish','Norwegian','Danish','Finnish'],
  african:['Ethiopian','West African','South African','Moroccan'],
  european:['French','German','British','Polish','Portuguese'],
  latin:['Brazilian','Argentinian','Peruvian','Colombian']
};
const proteins = ['chicken','salmon','tuna','beef','tofu','eggs','shrimp','turkey','lentils','chickpeas','pork','lamb','cod','tempeh','sardines','halloumi','duck','venison'];
const allCuisinesFlat = Object.values(cuisineGroups).flat();
const proteinsByDiet = {
  vegan:       ['tofu','lentils','chickpeas','tempeh','edamame','hemp seeds','black beans','kidney beans'],
  vegetarian:  ['eggs','tofu','lentils','chickpeas','tempeh','halloumi','cottage cheese','greek yogurt'],
  keto:        ['chicken','salmon','beef','shrimp','turkey','pork','lamb','cod','sardines','duck','venison','eggs','tuna'],
  'dairy-free':['chicken','salmon','tuna','beef','tofu','eggs','shrimp','turkey','lentils','chickpeas','pork','lamb','cod','tempeh','sardines','duck','venison'],
  halal:       ['chicken','salmon','tuna','beef','tofu','eggs','shrimp','turkey','lentils','chickpeas','lamb','cod','tempeh','sardines','duck','venison'],
};

/** Filters the base protein list down to what's compatible with the active
 * dietary preferences (mirrors the eligibleProteins loop in generate-meal). */
function buildEligibleProteins({ dietaryPrefs = [], isVegan = false, isKeto = false }) {
  let eligibleProteins = [...proteins];
  for (const pref of dietaryPrefs.map(p => p.toLowerCase())) {
    if (proteinsByDiet[pref]) {
      eligibleProteins = eligibleProteins.filter(p => proteinsByDiet[pref].includes(p));
      if (eligibleProteins.length === 0) eligibleProteins = proteinsByDiet[pref];
    }
  }
  if (isVegan && isKeto) eligibleProteins = ['tofu','tempeh','hemp seeds','edamame'];
  return eligibleProteins;
}

/** Picks a fresh cuisine/protein/seed, optionally avoiding a previously-picked
 * cuisine (`excludeCuisine`) so a batch of several generations (a 7-day week,
 * or 2-3 swap alternatives) doesn't repeat. Mirrors generate-meal's
 * pickDayVariety exactly. */
function pickVariety({ preferredCuisine = null, excludeCuisine = null, eligibleProteins = proteins }) {
  let todayCuisine;
  if (preferredCuisine && cuisineGroups[preferredCuisine.toLowerCase().replace(/\s/g,'')]) {
    const group = cuisineGroups[preferredCuisine.toLowerCase().replace(/\s/g,'')];
    const pool = (excludeCuisine && group.length > 1) ? group.filter(c => c !== excludeCuisine) : group;
    todayCuisine = pool[Math.floor(Math.random() * pool.length)];
  } else if (preferredCuisine) {
    todayCuisine = preferredCuisine;
  } else {
    const pool = excludeCuisine ? allCuisinesFlat.filter(c => c !== excludeCuisine) : allCuisinesFlat;
    todayCuisine = pool[Math.floor(Math.random() * pool.length)];
  }
  const todayProtein = eligibleProteins[Math.floor(Math.random() * eligibleProteins.length)];
  const randomSeed = Math.floor(Math.random() * 99999);
  return { todayCuisine, todayProtein, randomSeed };
}

/** The one-meal JSON schema embedded in every meal-generation prompt.
 * `mealType` may be a literal type ('dinner') or the original
 * 'breakfast|lunch|dinner|snack' placeholder used by full-day/week mode. */
function buildMealSchema({ mealType, isPro }) {
  return `{
  "type": "${mealType}",
  "name": "string",
  "description": "string — MUST start with a cooking method word (e.g. Grilled, Pan-seared, Slow-cooked, Roasted, Baked, Crispy, Sautéed). Format: [Method] [ingredient] with [accompaniment]. Under ${isPro ? '15' : '10'} words.",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "cookTime": number,
  "servings": 1,
  "estimatedCost": number,
  "ingredients": [{ "name": "string", "amount": "string (human-readable, e.g. '200g' or '2 eggs')", "amountValue": number, "amountUnit": "g|ml|count", "cost": number }],
  "instructions": ["string"],
  "imageKeyword": "simple English food keyword e.g. scrambled eggs"
}`;
}

const INGREDIENT_UNIT_RULE = `Every ingredient's "amountValue"/"amountUnit" MUST use grams (g) for solids, milliliters (ml) for liquids, or count (count) for discrete items like eggs or slices — convert from cups/tbsp/oz yourself, never leave it in those units. Example: "amount": "1 cup rice" -> "amountValue": 185, "amountUnit": "g". Vegetables sold by the head or bunch (broccoli, cauliflower, lettuce, kale) MUST be given in grams, never as a "count" — e.g. "1 head broccoli" -> "amountValue": 340, "amountUnit": "g". List "salt" and "pepper" as TWO separate ingredients, each on its own line — never a single combined "salt and pepper" entry.`;

module.exports = {
  DIET_RULES,
  buildDietaryBlocks,
  cuisineGroups,
  proteins,
  buildEligibleProteins,
  pickVariety,
  buildMealSchema,
  INGREDIENT_UNIT_RULE,
};
