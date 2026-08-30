'use strict';

/**
 * Dietary / Allergen Restriction Contract — Phase 3E-B2.
 *
 * The finite, frozen set of dietary/allergen restrictions Mealzy can reason
 * about DETERMINISTICALLY, plus an explicit, auditable exact-normalization map
 * from Mealzy's existing (drifted) input vocabularies onto that set.
 *
 * FROZEN SCOPE (B2):
 *   Hard-supported diets    : vegetarian, vegan, gluten-free, dairy-free
 *   Supported allergen tags : gluten, milk, egg, peanut, tree_nut, soy, fish,
 *                             crustacean_shellfish, sesame
 *   Known-but-unsupported   : keto, halal, kosher, paleo, mediterranean,
 *                             low_carb, high_protein
 *
 * HARD RULES:
 *   - No fuzzy matching. Normalization is exact after trivial casing /
 *     whitespace / separator folding only. A typo does not normalize.
 *   - Anything that does not map EXACTLY onto a supported id is returned as an
 *     explicit unsupported entry. It is NEVER silently dropped and NEVER
 *     silently treated as supported.
 *   - The legacy "nut" / "nuts" option historically meant "avoid peanuts AND
 *     tree nuts", so it expands to BOTH supported ids — it is never collapsed
 *     to tree_nut alone.
 *   - This module has no opinion about ingredients. It only classifies
 *     restriction strings. dietSafety.js composes it with dietAttributeData.js.
 */

// ── Frozen supported sets ──────────────────────────────────────────────────

const SUPPORTED_DIET_IDS = Object.freeze([
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
]);

const SUPPORTED_ALLERGEN_IDS = Object.freeze([
  'gluten',
  'milk',
  'egg',
  'peanut',
  'tree_nut',
  'soy',
  'fish',
  'crustacean_shellfish',
  'sesame',
]);

const KNOWN_UNSUPPORTED_DIET_IDS = Object.freeze([
  'keto',
  'halal',
  'kosher',
  'paleo',
  'mediterranean',
  'low_carb',
  'high_protein',
]);

const _SUPPORTED_DIET_SET = new Set(SUPPORTED_DIET_IDS);
const _SUPPORTED_ALLERGEN_SET = new Set(SUPPORTED_ALLERGEN_IDS);

const RESTRICTION_KIND = Object.freeze({
  DIET: 'diet',
  ALLERGEN: 'allergen',
});

const UNSUPPORTED_REASON = Object.freeze({
  KNOWN_UNSUPPORTED_DIET: 'known_unsupported_diet', // recognised concept, no deterministic hard rule
  UNRECOGNISED: 'unrecognised',                     // not in any map (incl. typos, free text)
  NOT_A_STRING: 'not_a_string',
  EMPTY: 'empty',
});

// ── Exact normalization key ───────────────────────────────────────────────
//
// Folds casing, surrounding/internal whitespace, and the three separators
// Mealzy's vocabularies mix ('-', '_', ' ') into a single canonical spaced
// form used ONLY as a lookup key. This is not fuzzy matching: it is a fixed,
// information-preserving canonicalisation of punctuation. "gluten-free",
// "gluten_free" and "Gluten Free" collapse to the same key; "glutenfree" and
// "gluten-fre" do not.

function _key(raw) {
  if (typeof raw !== 'string') return null;
  const k = raw.toLowerCase().trim().replace(/[\s_-]+/g, ' ').trim();
  return k.length > 0 ? k : null;
}

// ── Legacy / synonym maps (exact only) ────────────────────────────────────
//
// Every entry is a deliberate, unambiguous equivalence. When in doubt it is
// left out — an unrecognised restriction is a safe, recoverable outcome; a
// wrong normalization is a silent safety failure.

const _DIET_KEY_MAP = new Map([
  ['vegetarian', 'vegetarian'],
  ['vegan', 'vegan'],
  ['gluten free', 'gluten-free'],
  ['glutenfree', 'gluten-free'],
  ['dairy free', 'dairy-free'],
  ['dairyfree', 'dairy-free'],
]);

const _UNSUPPORTED_DIET_KEY_MAP = new Map([
  ['keto', 'keto'],
  ['ketogenic', 'keto'],
  ['halal', 'halal'],
  ['kosher', 'kosher'],
  ['paleo', 'paleo'],
  ['mediterranean', 'mediterranean'],
  ['low carb', 'low_carb'],
  ['high protein', 'high_protein'],
]);

// Values are arrays so a single legacy token can expand to several supported
// ids (the "nut" case). Order within an array is not significant.
const _ALLERGEN_KEY_MAP = new Map([
  ['gluten', ['gluten']],
  ['wheat gluten', ['gluten']],
  ['milk', ['milk']],
  ['dairy', ['milk']],           // legacy Mealzy allergy chip value
  ['egg', ['egg']],
  ['eggs', ['egg']],             // legacy Mealzy allergy chip value
  ['peanut', ['peanut']],
  ['peanuts', ['peanut']],
  ['tree nut', ['tree_nut']],
  ['tree nuts', ['tree_nut']],
  ['treenut', ['tree_nut']],
  ['treenuts', ['tree_nut']],
  ['soy', ['soy']],
  ['soya', ['soy']],
  ['fish', ['fish']],
  ['finfish', ['fish']],
  ['crustacean shellfish', ['crustacean_shellfish']],
  ['crustacean', ['crustacean_shellfish']],
  ['shellfish', ['crustacean_shellfish']], // legacy Mealzy allergy chip value
  ['sesame', ['sesame']],
  // Legacy broad "nut" — historically meant peanut + tree nut avoidance.
  // Expanded explicitly to BOTH; never collapsed to tree_nut alone.
  ['nut', ['peanut', 'tree_nut']],
  ['nuts', ['peanut', 'tree_nut']],
  ['nut free', ['peanut', 'tree_nut']],
]);

const LEGACY_NUT_EXPANSION = Object.freeze(['peanut', 'tree_nut']);

// ── Single-token classification ──────────────────────────────────────────

/**
 * Classify one raw restriction string coming from the DIET channel
 * (Mealzy `dietaryPrefs` / `dietary_preferences` / `dietaryRestrictions`).
 *
 * @returns {{kind:'diet', id:string}
 *          | {kind:'unsupported', raw:*, reason:string, id?:string}}
 */
function classifyDiet(raw) {
  const k = _key(raw);
  if (typeof raw !== 'string') return { kind: 'unsupported', raw, reason: UNSUPPORTED_REASON.NOT_A_STRING };
  if (k === null) return { kind: 'unsupported', raw, reason: UNSUPPORTED_REASON.EMPTY };

  const supported = _DIET_KEY_MAP.get(k);
  if (supported) return { kind: RESTRICTION_KIND.DIET, id: supported };

  const known = _UNSUPPORTED_DIET_KEY_MAP.get(k);
  if (known) return { kind: 'unsupported', raw, reason: UNSUPPORTED_REASON.KNOWN_UNSUPPORTED_DIET, id: known };

  return { kind: 'unsupported', raw, reason: UNSUPPORTED_REASON.UNRECOGNISED };
}

/**
 * Classify one raw restriction string coming from the ALLERGEN channel
 * (Mealzy `allergies`). Result `ids` may contain more than one supported id
 * (legacy "nut").
 *
 * @returns {{kind:'allergen', ids:string[]}
 *          | {kind:'unsupported', raw:*, reason:string}}
 */
function classifyAllergen(raw) {
  const k = _key(raw);
  if (typeof raw !== 'string') return { kind: 'unsupported', raw, reason: UNSUPPORTED_REASON.NOT_A_STRING };
  if (k === null) return { kind: 'unsupported', raw, reason: UNSUPPORTED_REASON.EMPTY };

  const ids = _ALLERGEN_KEY_MAP.get(k);
  if (ids) return { kind: RESTRICTION_KIND.ALLERGEN, ids: [...ids] };

  return { kind: 'unsupported', raw, reason: UNSUPPORTED_REASON.UNRECOGNISED };
}

// ── Whole restriction set ────────────────────────────────────────────────

/**
 * Normalise a Mealzy restriction set into the frozen deterministic contract.
 *
 * @param {{diets?:*, allergens?:*}} input
 *   `diets`     raw strings from the diet-style channel
 *   `allergens` raw strings from the allergy channel
 *   Non-array / missing channels are treated as empty. Non-string entries
 *   become explicit unsupported entries (never dropped).
 *
 * @returns {Readonly<{
 *   activeDietIds: string[],          // supported hard diets, deduped, sorted
 *   activeAllergenIds: string[],      // supported allergen tags, deduped, sorted
 *   unsupported: Array<{raw:*, reason:string, channel:string, id?:string}>,
 *   hasUnsupported: boolean,
 *   isEmpty: boolean                  // no supported AND no unsupported entries
 * }>}
 */
function normalizeRestrictions(input) {
  const src = input && typeof input === 'object' ? input : {};
  const rawDiets = Array.isArray(src.diets) ? src.diets : [];
  const rawAllergens = Array.isArray(src.allergens) ? src.allergens : [];

  const dietIds = new Set();
  const allergenIds = new Set();
  const unsupported = [];

  for (const raw of rawDiets) {
    const c = classifyDiet(raw);
    if (c.kind === RESTRICTION_KIND.DIET) {
      dietIds.add(c.id);
    } else {
      unsupported.push(Object.freeze({ raw: c.raw, reason: c.reason, channel: 'diets', ...(c.id ? { id: c.id } : {}) }));
    }
  }

  for (const raw of rawAllergens) {
    const c = classifyAllergen(raw);
    if (c.kind === RESTRICTION_KIND.ALLERGEN) {
      for (const id of c.ids) allergenIds.add(id);
    } else {
      unsupported.push(Object.freeze({ raw: c.raw, reason: c.reason, channel: 'allergens' }));
    }
  }

  const activeDietIds = [...dietIds].sort();
  const activeAllergenIds = [...allergenIds].sort();

  return Object.freeze({
    activeDietIds: Object.freeze(activeDietIds),
    activeAllergenIds: Object.freeze(activeAllergenIds),
    unsupported: Object.freeze(unsupported),
    hasUnsupported: unsupported.length > 0,
    isEmpty: activeDietIds.length === 0 && activeAllergenIds.length === 0 && unsupported.length === 0,
  });
}

function isSupportedDiet(id) {
  return _SUPPORTED_DIET_SET.has(id);
}

function isSupportedAllergen(id) {
  return _SUPPORTED_ALLERGEN_SET.has(id);
}

module.exports = {
  SUPPORTED_DIET_IDS,
  SUPPORTED_ALLERGEN_IDS,
  KNOWN_UNSUPPORTED_DIET_IDS,
  RESTRICTION_KIND,
  UNSUPPORTED_REASON,
  LEGACY_NUT_EXPANSION,
  classifyDiet,
  classifyAllergen,
  normalizeRestrictions,
  isSupportedDiet,
  isSupportedAllergen,
};
