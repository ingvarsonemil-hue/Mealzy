'use strict';

/**
 * Dietary / Allergen Restriction Contract — Phase 3E-B2.
 *
 * The finite, frozen set of dietary/allergen restrictions Mealzy can reason
 * about DETERMINISTICALLY, plus an explicit, auditable exact-normalization map
 * from Mealzy's existing (drifted) input vocabularies onto that set.
 *
 * FROZEN SCOPE (3E-C1):
 *   Hard-supported diets    : vegetarian, vegan, gluten-free, dairy-free,
 *                             pork-free
 *   Supported allergen tags : gluten, milk, egg, peanut, tree_nut, soy, fish,
 *                             crustacean_shellfish, sesame
 *   Unsupported hard rules  : keto, halal, kosher, paleo
 *                             (recognised, but Mealzy cannot deterministically
 *                             guarantee them — they still block positive
 *                             diet-safety certification)
 *   Preference-only         : mediterranean, high_protein, low_carb
 *                             (recognised style/optimisation intent, NOT a hard
 *                             safety guarantee — they never block certification
 *                             and never appear in `unsupported`)
 *
 * HARD RULES:
 *   - No fuzzy matching. Normalization is exact after trivial casing /
 *     whitespace / separator folding only. A typo does not normalize.
 *   - Anything that does not map EXACTLY onto a supported id, a preference-only
 *     id, or a recognised unsupported hard rule is returned as an explicit
 *     unsupported/unrecognised entry. It is NEVER silently dropped and NEVER
 *     silently treated as supported.
 *   - The legacy "nut" / "nuts" option historically meant "avoid peanuts AND
 *     tree nuts", so it expands to BOTH supported ids — it is never collapsed
 *     to tree_nut alone.
 *   - pork is NOT an allergen. Legacy web clients place "no_pork" in the diet
 *     channel and (separately) a bare "pork" token in the allergy channel;
 *     BOTH normalise into the canonical hard diet `pork-free`, never into an
 *     allergen. This cross-channel mapping is exact, not fuzzy.
 *   - This module has no opinion about ingredients. It only classifies
 *     restriction strings. dietSafety.js composes it with dietAttributeData.js.
 */

// Bump only when the frozen restriction contract or the deterministic
// safety-data ontology changes in a way that could alter a stored assessment.
// Surfaced in shadow telemetry / persisted diagnostics for auditability.
const DIET_SUBSTRATE_VERSION = 1;

// ── Frozen supported sets ──────────────────────────────────────────────────

const SUPPORTED_DIET_IDS = Object.freeze([
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'pork-free',
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

// Recognised, but Mealzy has no deterministic hard rule for them. They block
// positive diet-safety certification (never SAFE) and stay distinguishable
// from arbitrary free text via UNSUPPORTED_REASON.UNSUPPORTED_HARD_RULE.
const UNSUPPORTED_HARD_RULE_IDS = Object.freeze([
  'keto',
  'halal',
  'kosher',
  'paleo',
]);

// Recognised style / optimisation intent — NOT a hard safety guarantee.
// Never enters activeDietIds, never enters `unsupported`, never sets
// hasUnsupported, never blocks certification. Surfaced as
// activePreferenceOnlyIds so existing generation-prompt behaviour can still
// use them.
const PREFERENCE_ONLY_IDS = Object.freeze([
  'mediterranean',
  'high_protein',
  'low_carb',
]);

const _SUPPORTED_DIET_SET = new Set(SUPPORTED_DIET_IDS);
const _SUPPORTED_ALLERGEN_SET = new Set(SUPPORTED_ALLERGEN_IDS);
const _PREFERENCE_ONLY_SET = new Set(PREFERENCE_ONLY_IDS);

const RESTRICTION_KIND = Object.freeze({
  DIET: 'diet',
  ALLERGEN: 'allergen',
  PREFERENCE: 'preference', // recognised preference-only diet style (non-blocking)
});

const UNSUPPORTED_REASON = Object.freeze({
  UNSUPPORTED_HARD_RULE: 'unsupported_hard_rule', // recognised concept, no deterministic hard rule
  UNRECOGNISED: 'unrecognised',                   // not in any map (incl. typos, free text)
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
  // pork-free — canonical hard diet. "no_pork" / "no pork" fold to "no pork";
  // "pork-free" / "pork free" fold to "pork free". Exact only, no fuzzy.
  ['pork free', 'pork-free'],
  ['no pork', 'pork-free'],
]);

// Recognised but unsupported as a hard guarantee.
const _UNSUPPORTED_HARD_RULE_KEY_MAP = new Map([
  ['keto', 'keto'],
  ['ketogenic', 'keto'],
  ['halal', 'halal'],
  ['kosher', 'kosher'],
  ['paleo', 'paleo'],
]);

// Recognised preference-only styles (non-blocking).
const _PREFERENCE_ONLY_KEY_MAP = new Map([
  ['mediterranean', 'mediterranean'],
  ['high protein', 'high_protein'],
  ['low carb', 'low_carb'],
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
 *          | {kind:'preference', id:string}
 *          | {kind:'unsupported', raw:*, reason:string, id?:string}}
 */
function classifyDiet(raw) {
  const k = _key(raw);
  if (typeof raw !== 'string') return { kind: 'unsupported', raw, reason: UNSUPPORTED_REASON.NOT_A_STRING };
  if (k === null) return { kind: 'unsupported', raw, reason: UNSUPPORTED_REASON.EMPTY };

  const supported = _DIET_KEY_MAP.get(k);
  if (supported) return { kind: RESTRICTION_KIND.DIET, id: supported };

  const preference = _PREFERENCE_ONLY_KEY_MAP.get(k);
  if (preference) return { kind: RESTRICTION_KIND.PREFERENCE, id: preference };

  const hardRule = _UNSUPPORTED_HARD_RULE_KEY_MAP.get(k);
  if (hardRule) return { kind: 'unsupported', raw, reason: UNSUPPORTED_REASON.UNSUPPORTED_HARD_RULE, id: hardRule };

  return { kind: 'unsupported', raw, reason: UNSUPPORTED_REASON.UNRECOGNISED };
}

/**
 * Classify one raw restriction string coming from the ALLERGEN channel
 * (Mealzy `allergies`). Result `ids` may contain more than one supported id
 * (legacy "nut").
 *
 * Legacy cross-channel case: web clients push a bare "pork" token into the
 * allergy channel to mean "no pork". Pork is NOT an allergen — it normalises
 * into the canonical hard diet `pork-free` instead.
 *
 * @returns {{kind:'allergen', ids:string[]}
 *          | {kind:'diet', id:'pork-free'}
 *          | {kind:'unsupported', raw:*, reason:string}}
 */
function classifyAllergen(raw) {
  const k = _key(raw);
  if (typeof raw !== 'string') return { kind: 'unsupported', raw, reason: UNSUPPORTED_REASON.NOT_A_STRING };
  if (k === null) return { kind: 'unsupported', raw, reason: UNSUPPORTED_REASON.EMPTY };

  // Legacy cross-channel normalization — exact token only.
  if (k === 'pork' || k === 'no pork') return { kind: RESTRICTION_KIND.DIET, id: 'pork-free' };

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
 *   activeDietIds: string[],            // supported hard diets, deduped, sorted
 *   activeAllergenIds: string[],        // supported allergen tags, deduped, sorted
 *   activePreferenceOnlyIds: string[],  // recognised preference-only styles (non-blocking)
 *   unsupported: Array<{raw:*, reason:string, channel:string, id?:string}>,
 *   hasUnsupported: boolean,
 *   isEmpty: boolean                    // no supported hard rule AND no unsupported entries
 * }>}
 *
 * Preference-only ids NEVER enter `unsupported`, NEVER set `hasUnsupported`,
 * and NEVER block certification (see dietSafety.js). They are surfaced only so
 * existing generation-prompt behaviour can still read them.
 */
function normalizeRestrictions(input) {
  const src = input && typeof input === 'object' ? input : {};
  const rawDiets = Array.isArray(src.diets) ? src.diets : [];
  const rawAllergens = Array.isArray(src.allergens) ? src.allergens : [];

  const dietIds = new Set();
  const allergenIds = new Set();
  const preferenceOnlyIds = new Set();
  const unsupported = [];

  for (const raw of rawDiets) {
    const c = classifyDiet(raw);
    if (c.kind === RESTRICTION_KIND.DIET) {
      dietIds.add(c.id);
    } else if (c.kind === RESTRICTION_KIND.PREFERENCE) {
      preferenceOnlyIds.add(c.id);
    } else {
      unsupported.push(Object.freeze({ raw: c.raw, reason: c.reason, channel: 'diets', ...(c.id ? { id: c.id } : {}) }));
    }
  }

  for (const raw of rawAllergens) {
    const c = classifyAllergen(raw);
    if (c.kind === RESTRICTION_KIND.ALLERGEN) {
      for (const id of c.ids) allergenIds.add(id);
    } else if (c.kind === RESTRICTION_KIND.DIET) {
      // Legacy cross-channel: bare "pork" in the allergy channel → diet pork-free.
      dietIds.add(c.id);
    } else {
      unsupported.push(Object.freeze({ raw: c.raw, reason: c.reason, channel: 'allergens' }));
    }
  }

  const activeDietIds = [...dietIds].sort();
  const activeAllergenIds = [...allergenIds].sort();
  const activePreferenceOnlyIds = [...preferenceOnlyIds].sort();

  return Object.freeze({
    activeDietIds: Object.freeze(activeDietIds),
    activeAllergenIds: Object.freeze(activeAllergenIds),
    activePreferenceOnlyIds: Object.freeze(activePreferenceOnlyIds),
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

function isPreferenceOnly(id) {
  return _PREFERENCE_ONLY_SET.has(id);
}

module.exports = {
  DIET_SUBSTRATE_VERSION,
  SUPPORTED_DIET_IDS,
  SUPPORTED_ALLERGEN_IDS,
  UNSUPPORTED_HARD_RULE_IDS,
  PREFERENCE_ONLY_IDS,
  RESTRICTION_KIND,
  UNSUPPORTED_REASON,
  LEGACY_NUT_EXPANSION,
  classifyDiet,
  classifyAllergen,
  normalizeRestrictions,
  isSupportedDiet,
  isSupportedAllergen,
  isPreferenceOnly,
};
