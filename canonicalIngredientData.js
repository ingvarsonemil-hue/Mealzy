'use strict';

/**
 * Canonical Ingredient Identity v1 — the single deterministic source of truth
 * for "what ingredient is this, really".
 *
 * PURPOSE: Mealzy generation produces free-text ingredient names ("boneless
 * chicken breast", "chick peas", "fresh cilantro"). Several downstream systems
 * — pricing, grocery purchasing, nutrition, and the planned Swap feature —
 * each need to agree on WHICH real-world ingredient a given string refers to.
 * Today that agreement is implicit and re-derived independently in each place
 * (see pricing.js `_findPriceRow`, groceryAggregation.js
 * `normalizeIngredientName`). This file establishes one shared identity so
 * those systems can converge on it over time.
 *
 * SCOPE (Phase 1): identity only. No nutrition data. No package/purchase
 * profiles. No pricing. No raw/cooked handling. Adding those is a later phase
 * and MUST NOT change the shape of these records without a migration plan for
 * anything that has persisted an `id`.
 *
 * SEED SOURCE: the existing Mealzy vocabulary — every `PRICES` row name and
 * every `ALIASES` entry in ingredientPriceData.js — is represented here, so
 * this is a superset of the ingredients Mealzy already reasons about, not a
 * new parallel taxonomy. `category` values reuse the exact strings already
 * used by ingredient_prices (`meat`, `dairy`, `pantry`, `produce`,
 * `protein`). `baseUnit` is the canonical g/ml/count unit (the same three
 * units pricing.js supports), derived from each row's existing price unit.
 *
 * ID CONTRACT: `id` is a stable, human-readable, lowercase snake_case string.
 * It is chosen once and never changed — downstream systems and (later)
 * persisted rows key off it. `id` is intentionally hand-written, not derived
 * at runtime, so a future edit to `canonicalName` can never silently shift an
 * identity.
 *
 * ALIASES: only genuinely unambiguous synonyms, spelling variants, plurals,
 * and common prep-prefixed forms of the SAME real-world ingredient. An alias
 * must never name a different cut, variety, or product (the same rule
 * ingredientPriceData.js applies to its price aliases: "chicken thighs" is
 * NOT an alias of "chicken breast"). When in doubt, leave it out — the
 * resolver returning "unresolved" is a safe, recoverable outcome; a wrong
 * merge silently changes what a user is told to buy / eat.
 */

const VALID_BASE_UNITS = Object.freeze(['g', 'ml', 'count']);

// Reuses the exact category vocabulary already present in ingredient_prices
// (db.getIngredientPrices / ingredientPriceData.js PRICES). Not a redesign —
// if that set grows, this grows with it.
const VALID_CATEGORIES = Object.freeze(['meat', 'protein', 'dairy', 'produce', 'pantry']);

/**
 * @typedef {Object} CanonicalIngredient
 * @property {string} id            stable snake_case identity key
 * @property {string} canonicalName lowercase display/lookup name
 * @property {string[]} aliases     unambiguous alternate names (lowercase)
 * @property {string} category      one of VALID_CATEGORIES
 * @property {string} baseUnit      one of VALID_BASE_UNITS
 */

/** @type {CanonicalIngredient[]} */
const CANONICAL_INGREDIENTS = [
  // ── Poultry / meat ──────────────────────────────────────────────────────
  {
    id: 'chicken_breast',
    canonicalName: 'chicken breast',
    aliases: [
      'chicken breasts',
      'boneless chicken breast',
      'boneless skinless chicken breast',
      'skinless chicken breast',
      'boneless, skinless chicken breast',
      'chicken breast (skinless)', // 3E0-F1
    ],
    category: 'meat',
    baseUnit: 'g',
  },
  {
    id: 'chicken_thighs',
    canonicalName: 'chicken thighs',
    aliases: [
      'chicken thigh',
      'boneless chicken thighs',
      'boneless skinless chicken thighs',
      'skinless chicken thighs',
      'chicken thigh (boneless, skinless)', // 3E0-F1
      'chicken thigh, boneless skinless', // 3E0-F1
    ],
    category: 'meat',
    baseUnit: 'g',
  },
  {
    id: 'ground_beef',
    canonicalName: 'ground beef',
    aliases: ['beef mince', 'minced beef', 'ground beef mince'],
    category: 'meat',
    baseUnit: 'g',
  },
  {
    // Phase 3C: was id 'lean_chuck'/'lean chuck' — false "separable lean only" precision; nutrition source still unresolved.
    id: 'beef_chuck',
    canonicalName: 'beef chuck',
    aliases: ['lean chuck', 'chuck steak', 'chuck roast', 'lean beef chuck'],
    category: 'meat',
    baseUnit: 'g',
  },

  // ── Fish / other protein ────────────────────────────────────────────────
  {
    id: 'salmon_fillets',
    canonicalName: 'salmon fillets',
    aliases: ['salmon', 'salmon fillet', 'salmon filet', 'salmon filets'],
    category: 'protein',
    baseUnit: 'g',
  },
  {
    id: 'cod_fillet',
    canonicalName: 'cod fillet',
    aliases: ['cod', 'cod fillets', 'cod filet'],
    category: 'protein',
    baseUnit: 'g',
  },
  {
    id: 'shrimp',
    canonicalName: 'shrimp',
    aliases: ['shrimps', 'prawns', 'prawn', 'peeled shrimp', 'raw shrimp'],
    category: 'protein',
    baseUnit: 'g',
  },
  {
    id: 'venison',
    canonicalName: 'venison',
    aliases: ['venison steak', 'ground venison', 'venison mince'],
    category: 'protein',
    baseUnit: 'g',
  },

  // ── Dairy / eggs ────────────────────────────────────────────────────────
  {
    id: 'eggs',
    canonicalName: 'eggs',
    aliases: ['egg', 'large eggs', 'large egg'],
    category: 'dairy',
    baseUnit: 'count',
  },
  {
    id: 'milk',
    canonicalName: 'milk',
    aliases: [],
    category: 'dairy',
    baseUnit: 'ml',
  },
  {
    id: 'almond_milk',
    canonicalName: 'almond milk',
    aliases: ['unsweetened almond milk', 'almond milk unsweetened'],
    category: 'dairy',
    baseUnit: 'ml',
  },
  {
    id: 'greek_yogurt',
    canonicalName: 'greek yogurt',
    aliases: ['greek yoghurt', 'plain greek yogurt', 'nonfat greek yogurt', 'non-fat greek yogurt', 'greek yogurt, plain nonfat', 'greek yogurt (plain, 0% fat)', 'plain greek yogurt (0% fat)'], // 3E0-F1: last 3
    category: 'dairy',
    baseUnit: 'g',
  },
  {
    id: 'plain_yogurt',
    canonicalName: 'plain yogurt',
    aliases: ['plain yoghurt', 'natural yogurt', 'natural yoghurt'],
    category: 'dairy',
    baseUnit: 'g',
  },
  {
    id: 'butter',
    canonicalName: 'butter',
    aliases: ['unsalted butter', 'salted butter'],
    category: 'dairy',
    baseUnit: 'g',
  },
  {
    id: 'halloumi_cheese',
    canonicalName: 'halloumi cheese',
    aliases: ['halloumi'],
    category: 'dairy',
    baseUnit: 'g',
  },
  {
    id: 'feta',
    canonicalName: 'feta',
    aliases: ['feta cheese', 'crumbled feta', 'feta cheese, crumbled'], // 3E0-F1: last 1
    category: 'dairy',
    baseUnit: 'g',
  },

  // ── Produce ─────────────────────────────────────────────────────────────
  {
    id: 'banana',
    canonicalName: 'banana',
    aliases: ['bananas'],
    category: 'produce',
    baseUnit: 'count',
  },
  {
    id: 'apple',
    canonicalName: 'apple',
    aliases: ['apples'],
    category: 'produce',
    baseUnit: 'g',
  },
  {
    id: 'spinach',
    canonicalName: 'spinach',
    aliases: ['baby spinach', 'fresh spinach', 'spinach leaves', 'fresh spinach (baby)'], // 3E0-F1: last 1
    category: 'produce',
    baseUnit: 'g',
  },
  {
    id: 'broccoli',
    canonicalName: 'broccoli',
    aliases: ['broccoli florets', 'fresh broccoli florets'], // 3E0-F1: last 1
    category: 'produce',
    baseUnit: 'g', // Phase 3A: migrated from 'count' — "1 broccoli" is too ambiguous (head vs floret) for nutrition/purchase; see canonicalPurchaseData.js broccoli note
  },
  {
    id: 'bell_peppers',
    canonicalName: 'bell peppers',
    aliases: ['bell pepper', 'capsicum', 'red bell pepper', 'green bell pepper', 'yellow bell pepper'],
    category: 'produce',
    baseUnit: 'count',
  },
  {
    id: 'onion',
    canonicalName: 'onion',
    aliases: ['onions', 'yellow onion', 'yellow onions', 'white onion', 'brown onion', 'diced onion', 'chopped onion'],
    category: 'produce',
    baseUnit: 'g',
  },
  {
    id: 'tomato',
    canonicalName: 'tomato',
    aliases: ['tomatoes', 'fresh tomato', 'fresh tomatoes', 'roma tomato', 'roma tomatoes'],
    category: 'produce',
    baseUnit: 'g',
  },
  {
    id: 'carrots',
    canonicalName: 'carrots',
    aliases: ['carrot', 'diced carrots', 'chopped carrots', 'shredded carrots', 'baby carrots', 'carrots (raw)', 'carrots, raw'], // 3E0-F1: last 2
    category: 'produce',
    baseUnit: 'g',
  },
  {
    id: 'potato',
    canonicalName: 'potato',
    aliases: ['potatoes', 'russet potato', 'russet potatoes', 'yukon gold potatoes', 'diced potatoes'],
    category: 'produce',
    baseUnit: 'g',
  },
  {
    id: 'sweet_potato',
    canonicalName: 'sweet potato',
    aliases: ['sweet potatoes'],
    category: 'produce',
    baseUnit: 'g',
  },
  {
    id: 'lemon',
    canonicalName: 'lemon',
    aliases: ['lemons', 'fresh lemon'],
    category: 'produce',
    baseUnit: 'g',
  },
  {
    id: 'lime',
    canonicalName: 'lime',
    aliases: ['limes', 'fresh lime'],
    category: 'produce',
    baseUnit: 'g',
  },
  {
    id: 'garlic',
    canonicalName: 'garlic',
    aliases: ['garlic cloves', 'garlic clove', 'minced garlic', 'garlic, minced', 'fresh garlic', 'garlic (minced)', 'garlic cloves (minced)', 'garlic cloves, minced'], // 3E0-F1: last 3
    category: 'produce',
    baseUnit: 'g',
  },
  {
    id: 'cilantro',
    canonicalName: 'cilantro',
    aliases: ['fresh cilantro', 'cilantro leaves', 'fresh coriander', 'coriander leaves'],
    category: 'produce',
    baseUnit: 'g',
  },
  {
    id: 'cucumber',
    canonicalName: 'cucumber',
    aliases: ['cucumbers', 'english cucumber', 'persian cucumber'],
    category: 'produce',
    baseUnit: 'g',
  },
  {
    id: 'eggplant',
    canonicalName: 'eggplant',
    aliases: ['eggplants', 'aubergine', 'aubergines'],
    category: 'produce',
    baseUnit: 'g',
  },

  // ── Grains / starches ───────────────────────────────────────────────────
  {
    id: 'white_rice',
    canonicalName: 'white rice',
    aliases: ['uncooked white rice'], // 3E0-F1
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'brown_rice',
    canonicalName: 'brown rice',
    aliases: ['brown rice (uncooked)'], // 3E0-F1
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'rice',
    canonicalName: 'rice',
    aliases: [],
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'oats',
    canonicalName: 'oats',
    aliases: ['rolled oats', 'old fashioned oats', 'old-fashioned oats', 'quick oats', 'porridge oats'],
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'bread',
    canonicalName: 'bread',
    aliases: ['sliced bread', 'bread slices'],
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'couscous',
    canonicalName: 'couscous',
    aliases: [],
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'corn_tortillas',
    canonicalName: 'corn tortillas',
    aliases: ['corn tortilla'],
    category: 'pantry',
    baseUnit: 'count',
  },
  {
    id: 'red_lentils',
    canonicalName: 'red lentils',
    aliases: ['red lentil', 'dried red lentils', 'split red lentils'],
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'almonds',
    canonicalName: 'almonds',
    aliases: ['raw almonds', 'sliced almonds', 'slivered almonds', 'whole almonds', 'sliced almonds (raw)', 'almonds, sliced'], // 3E0-F1: last 2
    category: 'pantry',
    baseUnit: 'g',
  },

  // ── Canned / jarred ─────────────────────────────────────────────────────
  {
    id: 'canned_chickpeas',
    canonicalName: 'canned chickpeas',
    aliases: ['chickpeas', 'chick peas', 'garbanzo beans', 'canned garbanzo beans', 'chickpeas, canned', 'canned chickpeas, drained', 'canned chickpeas (drained)'], // 3E0-F1: last 2
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'black_beans_canned',
    canonicalName: 'black beans canned',
    aliases: ['black beans', 'canned black beans', 'black beans, canned', 'tinned black beans'],
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'canned_tomatoes',
    canonicalName: 'canned tomatoes',
    aliases: ['diced tomatoes', 'crushed tomatoes', 'canned diced tomatoes', 'canned crushed tomatoes', 'tinned tomatoes', 'canned tomatoes, crushed'], // 3E0-F1: last 1
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'hummus',
    canonicalName: 'hummus',
    aliases: ['classic hummus', 'plain hummus'],
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'harissa_paste',
    canonicalName: 'harissa paste',
    aliases: ['harissa'],
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'peanut_butter',
    canonicalName: 'peanut butter',
    aliases: ['natural peanut butter', 'creamy peanut butter', 'smooth peanut butter'],
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'honey',
    canonicalName: 'honey',
    aliases: ['raw honey', 'pure honey'],
    category: 'pantry',
    baseUnit: 'g',
  },

  // ── Oils / liquids / broths ─────────────────────────────────────────────
  {
    id: 'olive_oil',
    canonicalName: 'olive oil',
    aliases: ['extra virgin olive oil', 'extra-virgin olive oil'],
    category: 'pantry',
    baseUnit: 'ml',
  },
  {
    // Phase 3C: id stays 'vegetable_oil' (stable); canonicalName narrowed to canola. `olive_oil` is separate.
    id: 'vegetable_oil',
    canonicalName: 'canola oil',
    aliases: ['vegetable oil', 'canola', 'rapeseed oil'],
    category: 'pantry',
    baseUnit: 'ml',
  },
  {
    id: 'soy_sauce',
    canonicalName: 'soy sauce',
    aliases: ['light soy sauce', 'low sodium soy sauce', 'low-sodium soy sauce', 'reduced sodium soy sauce'],
    category: 'pantry',
    baseUnit: 'ml',
  },
  {
    id: 'lemon_juice',
    canonicalName: 'lemon juice',
    aliases: ['fresh lemon juice'],
    category: 'pantry',
    baseUnit: 'ml',
  },
  {
    id: 'lime_juice',
    canonicalName: 'lime juice',
    aliases: ['fresh lime juice'],
    category: 'pantry',
    baseUnit: 'ml',
  },
  {
    id: 'vegetable_broth',
    canonicalName: 'vegetable broth',
    aliases: ['vegetable stock', 'veggie broth'],
    category: 'pantry',
    baseUnit: 'ml',
  },
  {
    id: 'chicken_broth',
    canonicalName: 'chicken broth',
    aliases: ['chicken stock'],
    category: 'pantry',
    baseUnit: 'ml',
  },
  {
    id: 'beef_broth',
    canonicalName: 'beef broth',
    aliases: ['beef stock'],
    category: 'pantry',
    baseUnit: 'ml',
  },

  // ── Spices / herbs / seasoning ──────────────────────────────────────────
  {
    id: 'salt',
    canonicalName: 'salt',
    aliases: ['sea salt', 'kosher salt', 'table salt', 'fine salt'],
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'pepper',
    canonicalName: 'pepper',
    aliases: ['black pepper', 'ground black pepper', 'black peppercorns', 'cracked black pepper', 'ground pepper'],
    category: 'pantry',
    baseUnit: 'g',
  },
  // Phase 3C: combined pseudo-identity 'salt_and_pepper' removed (no defensible
  // source; no invented blend). Use separate `salt` + `pepper`; the strings
  // "salt and pepper"/"salt & pepper"/"salt and black pepper" now resolve
  // UNRESOLVED (legacy free-text pricing still covers them — ingredientPriceData).
  {
    id: 'cumin',
    canonicalName: 'cumin',
    aliases: ['ground cumin', 'cumin seeds', 'cumin powder'],
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'paprika',
    canonicalName: 'paprika',
    aliases: ['smoked paprika', 'sweet paprika', 'ground paprika'],
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'cinnamon',
    canonicalName: 'cinnamon',
    aliases: ['ground cinnamon', 'cinnamon powder'],
    category: 'pantry',
    baseUnit: 'g',
  },
  {
    id: 'rosemary',
    canonicalName: 'rosemary',
    // Phase 3C: 'fresh rosemary' removed — nutrition convention is DRIED; "fresh rosemary" is now UNRESOLVED.
    aliases: ['dried rosemary', 'rosemary leaves'],
    category: 'pantry',
    baseUnit: 'g',
  },
];

module.exports = { CANONICAL_INGREDIENTS, VALID_BASE_UNITS, VALID_CATEGORIES };
