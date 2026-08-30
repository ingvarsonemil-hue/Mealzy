'use strict';

/**
 * Canonical Ingredient Dietary / Allergen Safety Data — Phase 3E-B2.
 *
 * A deterministic, hand-curated, auditable safety record for EVERY canonical
 * ingredient id (canonicalIngredientData.js), keyed by that id. This is the
 * ONLY place ingredient-level dietary/allergen facts live. dietSafety.js
 * consults it; nothing infers safety anywhere else.
 *
 * ── WHY NOT `category` ────────────────────────────────────────────────────
 * Phase 3E-B1 proved `category` is not a safety authority: `almond_milk` has
 * `category: 'dairy'` but is not milk-derived, and `eggs` is also
 * `category: 'dairy'`. Records here are keyed by canonical ID and ignore
 * category entirely.
 *
 * ── TRI-STATE, NEVER DEFAULTING TO SAFE ───────────────────────────────────
 * Every property is one of:
 *   'present'    — the property/allergen IS present → unsafe for a restriction
 *                  that forbids it.
 *   'absent'     — deterministically established NOT present → safe.
 *   'unresolved' — Mealzy cannot establish it from the frozen canonical
 *                  product convention or the repository identity. NEVER "safe".
 *
 * A record is built from `ALL_UNRESOLVED` (every property 'unresolved') and
 * only the properties an explicit frozen decision or an unambiguous whole-food
 * identity establishes are overridden. A property that is simply not written
 * stays 'unresolved'. It is therefore impossible for missing curation to read
 * as 'absent'/safe. Load-time validation additionally rejects any canonical id
 * without a record and any record for an unknown id.
 *
 * ── PROPERTIES ───────────────────────────────────────────────────────────
 *   animalSlaughter      from a slaughtered animal — meat, poultry, game,
 *                        fish, shellfish, and meat/bone broths & stocks.
 *                        Authority for the VEGETARIAN diet.
 *   animalDerived        any animal origin at all (superset of the above plus
 *                        dairy, egg, honey). Authority for the VEGAN diet.
 *                        Invariant: animalSlaughter 'present' ⇒ animalDerived
 *                        'present' (checked at load).
 *   dairyMilk            milk-derived. Authority for the DAIRY-FREE diet and,
 *                        separately, for the `milk` allergen (distinct
 *                        restrictions, same underlying ingredient fact).
 *   egg                  `egg` allergen.
 *   glutenGrain          contains / is a gluten grain OR is otherwise not
 *                        eligible for positive gluten-free certification
 *                        (e.g. conventional oats). Authority for the
 *                        GLUTEN-FREE diet.
 *   gluten               `gluten` allergen (protein presence). Usually tracks
 *                        glutenGrain, but decoupled where the frozen decision
 *                        differs (oats: glutenGrain 'present', gluten
 *                        'unresolved').
 *   peanut, treeNut, soy, fish, crustaceanShellfish, sesame
 *                        the remaining supported allergen tags.
 *   pork                 the ingredient IS pork (or a pork-derived product).
 *                        Authority for the PORK-FREE diet. This is an
 *                        ingredient-IDENTITY fact, NOT an allergen.
 *                        The generic record helpers (`plant`, `rec`, `_meat`,
 *                        `_finfish`, `_dairyProduct`) CANNOT set pork — it is
 *                        supplied ONLY by the exhaustive, hand-audited
 *                        PORK_STATUS_BY_CANONICAL_ID table, merged in at
 *                        assembly. Load validation fails if that table does not
 *                        cover every canonical id exactly once. A future pork
 *                        ingredient must be added to the table as
 *                        `pork: 'present'`; a future non-pork ingredient must
 *                        be added as `pork: 'absent'`. Neither can be inherited
 *                        silently from a category/helper constructor.
 *
 * All frozen product conventions below are Phase 3E-B2 MODELING DEFINITIONS
 * from the B2 brief, not claims about every supermarket product.
 */

const canonicalIngredients = require('./canonicalIngredients');

const PROPERTY_VALUE = Object.freeze({
  PRESENT: 'present',
  ABSENT: 'absent',
  UNRESOLVED: 'unresolved',
});
const { PRESENT: P, ABSENT: A, UNRESOLVED: U } = PROPERTY_VALUE;

const SAFETY_PROPERTIES = Object.freeze([
  'animalSlaughter',
  'animalDerived',
  'dairyMilk',
  'egg',
  'glutenGrain',
  'gluten',
  'peanut',
  'treeNut',
  'soy',
  'fish',
  'crustaceanShellfish',
  'sesame',
  'pork',
]);

// `pork` is EXCLUDED from every generic helper. It is a hard-diet identity
// fact that must be an intentional per-ingredient decision, never inherited
// from a category constructor — so helpers physically cannot express it and
// the assembly step (below) is the sole place pork is set, from the exhaustive
// PORK_STATUS_BY_CANONICAL_ID table.
const _HELPER_PROPERTIES = Object.freeze(SAFETY_PROPERTIES.filter((k) => k !== 'pork'));

const _ALL_UNRESOLVED = Object.freeze(
  _HELPER_PROPERTIES.reduce((o, k) => { o[k] = U; return o; }, {}),
);

// Unambiguous whole food of plant origin with no supported allergen present:
// every helper-assignable property deterministically 'absent'. Used only for
// simple canonical ingredients whose relevant properties are unambiguous from
// identity. No "may contain" / cross-contamination semantics are ever added.
const _PLANT_WHOLE_FOOD = Object.freeze(
  _HELPER_PROPERTIES.reduce((o, k) => { o[k] = A; return o; }, {}),
);

// Helpers build the NON-pork portion of a record. A `pork` key here is a
// programming error (caught at assembly) — pork comes only from the table.
function rec(overrides) {
  return Object.freeze({ ..._ALL_UNRESOLVED, ...overrides });
}
function plant(overrides) {
  return Object.freeze({ ..._PLANT_WHOLE_FOOD, ...overrides });
}

// Shorthand builders for the recurring animal shapes.
const _meat = () => plant({ animalSlaughter: P, animalDerived: P });
const _finfish = () => plant({ animalSlaughter: P, animalDerived: P, fish: P });
const _dairyProduct = () => plant({ animalDerived: P, dairyMilk: P });

// ── The records ──────────────────────────────────────────────────────────
// Base records carry every property EXCEPT `pork` (helpers cannot express it).
// `pork` is merged in from PORK_STATUS_BY_CANONICAL_ID by _assembleRecords().

const _BASE_RECORDS = Object.freeze({
  // ── Meat / poultry / game (slaughter-derived; plain raw flesh carries no
  //    supported allergen) ────────────────────────────────────────────────
  chicken_breast: _meat(),
  chicken_thighs: _meat(),
  ground_beef: _meat(),
  beef_chuck: _meat(),          // nutrition-ineligible, still needs a safety record
  venison: _meat(),

  // ── Fish / shellfish ────────────────────────────────────────────────────
  salmon_fillets: _finfish(),
  cod_fillet: _finfish(),
  shrimp: plant({ animalSlaughter: P, animalDerived: P, crustaceanShellfish: P }),

  // ── Eggs / dairy ────────────────────────────────────────────────────────
  eggs: plant({ animalDerived: P, egg: P }),
  milk: _dairyProduct(),
  greek_yogurt: _dairyProduct(),
  plain_yogurt: _dairyProduct(),
  butter: _dairyProduct(),
  feta: _dairyProduct(),
  halloumi_cheese: _dairyProduct(), // nutrition-ineligible, still needs a record
  // FROZEN (B2 §9): milk/dairy ABSENT despite `category: 'dairy'`; tree nut PRESENT.
  almond_milk: plant({ treeNut: P }),

  // ── Produce (unambiguous plant whole foods) ─────────────────────────────
  banana: plant(),
  apple: plant(),
  spinach: plant(),
  broccoli: plant(),
  bell_peppers: plant(),
  onion: plant(),
  tomato: plant(),
  carrots: plant(),
  potato: plant(),
  sweet_potato: plant(),
  lemon: plant(),
  lime: plant(),
  garlic: plant(),
  cilantro: plant(),
  cucumber: plant(),
  eggplant: plant(),

  // ── Plain grains / naturally gluten-free staples ────────────────────────
  white_rice: plant(),
  brown_rice: plant(),
  rice: plant(),
  quinoa: plant(),
  // FROZEN (B2 §8): conventional oats are NOT eligible for positive
  // gluten-free certification. glutenGrain 'present' (disqualifies the diet);
  // the gluten *protein* is left 'unresolved' — B2 does not claim oats
  // intrinsically contain wheat gluten.
  oats: plant({ glutenGrain: P, gluten: U }),

  // ── Gluten grains / wheat products (FROZEN B2 §8) ───────────────────────
  // bread = standard wheat bread. FROZEN authority establishes ONLY gluten
  // present. It does NOT establish that bread is free of animal ingredients —
  // "bread" spans milk bread, brioche, challah, enriched and lard-shortened
  // loaves. animalSlaughter / animalDerived / milk / egg / soy therefore stay
  // 'unresolved' (not invented). gluten stays 'present' (frozen).
  bread: rec({ glutenGrain: P, gluten: P }),
  // couscous = mechanically milled durum-wheat semolina, dried — a single-grain
  // preparation with no compounding. Plant identity is unambiguous; gluten
  // present (frozen).
  couscous: plant({ glutenGrain: P, gluten: P }),
  // soy_sauce = standard soy sauce. FROZEN authority establishes soy present
  // AND gluten present (brewed with wheat). It does NOT establish vegan /
  // vegetarian suitability — soy sauce is a fermented, compounded condiment, so
  // animalSlaughter / animalDerived stay 'unresolved'. Tamari is NOT modelled
  // here (it would need its own canonical identity).
  soy_sauce: rec({ glutenGrain: P, gluten: P, soy: P }),
  // corn_tortillas = corn tortillas. FROZEN authority establishes ONLY gluten
  // absent (§8). It does NOT establish animal-ingredient freedom — commercial
  // tortillas vary (fats, additives) — so animalSlaughter / animalDerived stay
  // 'unresolved'. No hypothetical wheat-blend product is modelled.
  corn_tortillas: rec({ glutenGrain: A, gluten: A }),

  // ── Legumes / canned staples (plain) ───────────────────────────────────
  red_lentils: plant(),
  canned_chickpeas: plant(),
  black_beans_canned: plant(),
  canned_tomatoes: plant(),

  // ── Nuts / nut & seed products ─────────────────────────────────────────
  almonds: plant({ treeNut: P }),
  // FROZEN (B2 §9): peanut present, and ONLY peanut. Do NOT infer milk / soy /
  // tree nut / gluten — or animal-ingredient freedom — from generic
  // peanut-butter identity. Every property except `peanut` stays 'unresolved'.
  peanut_butter: rec({ peanut: P }),

  // ── Composite / processed spreads & pastes ─────────────────────────────
  // FROZEN (B2 §12): do NOT assert every hummus contains tahini, and do NOT
  // make a broad positive dietary claim. sesame 'unresolved'; vegan and
  // vegetarian relevant properties 'unresolved' (restaurant hummus can carry
  // dairy or a meat garnish). Everything stays 'unresolved' (pork is set
  // separately from PORK_STATUS_BY_CANONICAL_ID).
  hummus: rec({}),
  // harissa = chilli paste. No frozen convention and not an unambiguous single
  // food (compounded paste + spices + oil) → everything 'unresolved'.
  // Nutrition-ineligible; still needs a record.
  harissa_paste: rec({}),

  // ── Sweeteners ────────────────────────────────────────────────────────
  // honey: not animal flesh (vegetarian-safe) but animal-derived → not vegan.
  honey: plant({ animalDerived: P }),

  // ── Oils / juices / seasoning (plant, unambiguous) ─────────────────────
  olive_oil: plant(),
  vegetable_oil: plant(),   // canonicalName "canola oil"
  lemon_juice: plant(),
  lime_juice: plant(),
  salt: plant(),
  pepper: plant(),
  cumin: plant(),           // purchase-not-certifiable, still needs a record
  paprika: plant(),
  cinnamon: plant(),
  rosemary: plant(),

  // ── Broths / stocks (FROZEN B2 §7) ────────────────────────────────────
  // vegetable_broth: animal-derived / vegan / vegetarian suitability all
  // UNRESOLVED — commercial vegetable broth is not deterministically
  // vegetarian/vegan. Everything unresolved (pork set from the table).
  vegetable_broth: rec({}),
  // chicken_broth / beef_broth: animal-derived = true (→ not vegan) AND
  // slaughter-derived (→ not vegetarian). Unrelated allergens are NOT
  // inferred → left unresolved.
  chicken_broth: rec({ animalSlaughter: P, animalDerived: P }),
  beef_broth: rec({ animalSlaughter: P, animalDerived: P }),
});

// ── Pork authority — exhaustive, hand-audited, ONE entry per canonical id ──
//
// pork-free is a hard diet whose authority is an ingredient-IDENTITY fact, so
// it must be an explicit decision per ingredient — never inherited from a
// helper. This table is the SOLE source of the `pork` property. Load
// validation (below) fails if it does not map every canonical id exactly once,
// contains an unknown id, or carries an invalid value. Every current canonical
// is deliberately 'absent': the frozen vocabulary contains no pork ingredient
// or pork-derived product. A FUTURE pork ingredient (e.g. pork_loin, bacon,
// chorizo, lard) MUST be added here as PROPERTY_VALUE.PRESENT before the
// module will load.
const PORK_STATUS_BY_CANONICAL_ID = Object.freeze({
  chicken_breast: A, chicken_thighs: A, ground_beef: A, beef_chuck: A, salmon_fillets: A,
  cod_fillet: A, shrimp: A, venison: A, eggs: A, milk: A,
  almond_milk: A, greek_yogurt: A, plain_yogurt: A, butter: A, halloumi_cheese: A,
  feta: A, banana: A, apple: A, spinach: A, broccoli: A,
  bell_peppers: A, onion: A, tomato: A, carrots: A, potato: A,
  sweet_potato: A, lemon: A, lime: A, garlic: A, cilantro: A,
  cucumber: A, eggplant: A, white_rice: A, brown_rice: A, rice: A,
  oats: A, bread: A, couscous: A, quinoa: A, corn_tortillas: A,
  red_lentils: A, almonds: A, canned_chickpeas: A, black_beans_canned: A, canned_tomatoes: A,
  hummus: A, harissa_paste: A, peanut_butter: A, honey: A, olive_oil: A,
  vegetable_oil: A, soy_sauce: A, lemon_juice: A, lime_juice: A, vegetable_broth: A,
  chicken_broth: A, beef_broth: A, salt: A, pepper: A, cumin: A,
  paprika: A, cinnamon: A, rosemary: A,
});

// Merge the explicit pork authority into each base record. Throws on any base
// record that already carries a `pork` key (helper misuse) or that lacks a
// pork classification in the table.
function _assembleRecords() {
  const validValues = new Set(Object.values(PROPERTY_VALUE));
  const out = {};
  for (const [id, base] of Object.entries(_BASE_RECORDS)) {
    if (Object.prototype.hasOwnProperty.call(base, 'pork')) {
      throw new Error(`dietAttributeData: base record "${id}" set 'pork' via a helper — pork must come only from PORK_STATUS_BY_CANONICAL_ID`);
    }
    if (!Object.prototype.hasOwnProperty.call(PORK_STATUS_BY_CANONICAL_ID, id)) {
      throw new Error(`dietAttributeData: canonical "${id}" has no explicit pork classification in PORK_STATUS_BY_CANONICAL_ID`);
    }
    const porkStatus = PORK_STATUS_BY_CANONICAL_ID[id];
    if (!validValues.has(porkStatus)) {
      throw new Error(`dietAttributeData: PORK_STATUS_BY_CANONICAL_ID["${id}"] has invalid value ${JSON.stringify(porkStatus)}`);
    }
    out[id] = Object.freeze({ ...base, pork: porkStatus });
  }
  return Object.freeze(out);
}

const SAFETY_RECORDS = _assembleRecords();

// ── Load-time validation ─────────────────────────────────────────────────

function _validate() {
  const canonicalIds = canonicalIngredients.allCanonicalIngredients().map((c) => c.id);
  const canonicalIdSet = new Set(canonicalIds);
  const recordIds = Object.keys(SAFETY_RECORDS);
  const validValues = new Set(Object.values(PROPERTY_VALUE));

  // 1. Every canonical id has a record.
  for (const id of canonicalIds) {
    if (!Object.prototype.hasOwnProperty.call(SAFETY_RECORDS, id)) {
      throw new Error(`dietAttributeData: canonical ingredient "${id}" has no safety record — missing data must never default to safe`);
    }
  }
  // 2. No record for an unknown id.
  for (const id of recordIds) {
    if (!canonicalIdSet.has(id)) {
      throw new Error(`dietAttributeData: safety record "${id}" does not correspond to any canonical ingredient`);
    }
  }
  // 3. Every record has every property, each with a valid tri-state, and the
  //    animalSlaughter⇒animalDerived invariant holds.
  for (const id of recordIds) {
    const r = SAFETY_RECORDS[id];
    for (const prop of SAFETY_PROPERTIES) {
      if (!Object.prototype.hasOwnProperty.call(r, prop)) {
        throw new Error(`dietAttributeData: record "${id}" is missing property "${prop}"`);
      }
      if (!validValues.has(r[prop])) {
        throw new Error(`dietAttributeData: record "${id}" property "${prop}" has invalid value ${JSON.stringify(r[prop])}`);
      }
    }
    for (const prop of Object.keys(r)) {
      if (!SAFETY_PROPERTIES.includes(prop)) {
        throw new Error(`dietAttributeData: record "${id}" has unknown property "${prop}"`);
      }
    }
    if (r.animalSlaughter === PROPERTY_VALUE.PRESENT && r.animalDerived !== PROPERTY_VALUE.PRESENT) {
      throw new Error(`dietAttributeData: record "${id}" violates invariant animalSlaughter=present ⇒ animalDerived=present`);
    }
  }

  // 4. The pork authority is EXHAUSTIVE and EXACT against the canonical
  //    vocabulary (see _auditPorkAuthority).
  _auditPorkAuthority(canonicalIds);
}

/**
 * The pork authority must map EVERY given canonical id exactly once, contain
 * NO id outside that set, and carry only valid tri-state values. This is the
 * guarantee that forces an intentional pork decision for any future canonical
 * ingredient — a new id with no entry here fails module load — and forbids a
 * helper-inherited default. Exported (as __auditPorkAuthority) so a test can
 * prove the "developer forgot to classify the new ingredient" case fails.
 *
 * @param {string[]} canonicalIds  the full canonical vocabulary id list
 */
function _auditPorkAuthority(canonicalIds) {
  const validValues = new Set(Object.values(PROPERTY_VALUE));
  const canonicalIdSet = new Set(canonicalIds);
  for (const id of canonicalIds) {
    if (!Object.prototype.hasOwnProperty.call(PORK_STATUS_BY_CANONICAL_ID, id)) {
      throw new Error(`dietAttributeData: canonical "${id}" is missing from PORK_STATUS_BY_CANONICAL_ID — pork-free needs an explicit per-ingredient decision`);
    }
  }
  for (const id of Object.keys(PORK_STATUS_BY_CANONICAL_ID)) {
    if (!canonicalIdSet.has(id)) {
      throw new Error(`dietAttributeData: PORK_STATUS_BY_CANONICAL_ID has entry "${id}" that is not a canonical ingredient`);
    }
    if (!validValues.has(PORK_STATUS_BY_CANONICAL_ID[id])) {
      throw new Error(`dietAttributeData: PORK_STATUS_BY_CANONICAL_ID["${id}"] has invalid value ${JSON.stringify(PORK_STATUS_BY_CANONICAL_ID[id])}`);
    }
  }
}

_validate();

/**
 * The frozen safety record for a canonical ingredient id, or null if the id is
 * not a canonical ingredient. A resolved canonical id ALWAYS has a record
 * (guaranteed by _validate at load).
 */
function getSafetyRecord(canonicalId) {
  return Object.prototype.hasOwnProperty.call(SAFETY_RECORDS, canonicalId)
    ? SAFETY_RECORDS[canonicalId]
    : null;
}

/** { [canonicalId]: record } — the whole frozen table. */
function allSafetyRecords() {
  return SAFETY_RECORDS;
}

module.exports = {
  PROPERTY_VALUE,
  SAFETY_PROPERTIES,
  SAFETY_RECORDS,
  PORK_STATUS_BY_CANONICAL_ID,
  getSafetyRecord,
  allSafetyRecords,
  // exported for the completeness test — throws on any coverage gap
  __validate: _validate,
  __auditPorkAuthority: _auditPorkAuthority,
};
