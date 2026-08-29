'use strict';

/**
 * Nutrition Engine v1 — isolated, deterministic calculation of the four v1
 * macros (kcal, protein g, carbs g, fat g) for a canonical ingredient +
 * quantity, from the curated canonicalNutritionData.js records.
 *
 * SCOPE (Phase 3D): substrate only.
 *   - It does NOT resolve ingredient names (that is canonicalIngredients.js).
 *   - It does NOT touch server.js, generation, budgetEngine, planRepairEngine,
 *     macroEngine, persisted plans, or the weekly-validity contract. That is
 *     Phase 3E.
 *
 * HARD RULES:
 *   - Unknown / incomplete / ineligible nutrition NEVER silently becomes an
 *     authoritative zero. Every non-covered path returns authoritative:false
 *     with an explicit status.
 *   - No fuzzy name matching. The caller passes a canonical ingredient id.
 *   - No implicit cross-unit conversion at runtime: amountUnit MUST equal the
 *     record's basisUnit (which equals the canonical baseUnit). The curated
 *     record already expresses nutrition in the canonical base unit; any
 *     g<->ml / g<->count transform was applied ONCE during curation and is
 *     documented in record.transformation.
 *   - Numbers are deterministic and NOT rounded here (UI rounding is later).
 *   - NaN / Infinity never leak.
 */

const canonicalIngredients = require('./canonicalIngredients');
const { NUTRITION_RECORDS } = require('./canonicalNutritionData');

const CONVENTIONS = Object.freeze(['raw', 'dry', 'drained', 'as_packed', 'as_sold', 'edible_portion']);
const BASIS_UNITS = Object.freeze(['g', 'ml', 'count']);
const TRANSFORM_METHODS = Object.freeze(['direct', 'density_g_to_ml', 'portion_g_to_unit', 'other']);

const STATUS = Object.freeze({
  COVERED: 'covered',
  UNKNOWN_CANONICAL_ID: 'unknown_canonical_id',
  MISSING_NUTRITION_RECORD: 'missing_nutrition_record',
  INELIGIBLE_RECORD: 'ineligible_record',
  UNIT_INCOMPATIBLE: 'unit_incompatible',
  INVALID_QUANTITY: 'invalid_quantity',
});

const MEAL_STATUS = Object.freeze({ COVERED: 'covered', INCOMPLETE: 'nutrition_incomplete' });

// ── Load-time validation + index ──────────────────────────────────────────
const _byId = new Map();

for (const rec of NUTRITION_RECORDS) {
  if (!rec || typeof rec !== 'object') throw new Error('canonicalNutritionData: non-object record');
  const id = rec.canonicalIngredientId;

  // 1. canonical id exists
  const canonical = canonicalIngredients.getById(id);
  if (!canonical) throw new Error(`canonicalNutritionData: "${id}" is not a canonical ingredient id`);
  // 2. no duplicate nutrition records
  if (_byId.has(id)) throw new Error(`canonicalNutritionData: duplicate nutrition record for "${id}"`);

  if (!BASIS_UNITS.includes(rec.basisUnit)) throw new Error(`canonicalNutritionData: "${id}" invalid basisUnit ${JSON.stringify(rec.basisUnit)}`);
  // 3. basisUnit exactly matches the canonical ingredient's baseUnit
  if (rec.basisUnit !== canonical.baseUnit) throw new Error(`canonicalNutritionData: "${id}" basisUnit "${rec.basisUnit}" != canonical baseUnit "${canonical.baseUnit}"`);
  if (!CONVENTIONS.includes(rec.convention)) throw new Error(`canonicalNutritionData: "${id}" invalid convention ${JSON.stringify(rec.convention)}`);
  // 4. basisQuantity finite and > 0
  if (!Number.isFinite(rec.basisQuantity) || rec.basisQuantity <= 0) throw new Error(`canonicalNutritionData: "${id}" basisQuantity must be finite and > 0`);
  if (rec.basisUnit === 'count' && rec.basisQuantity !== 1) throw new Error(`canonicalNutritionData: "${id}" count records must have basisQuantity 1`);

  // 5. macros finite and >= 0
  for (const k of ['kcal', 'proteinG', 'carbsG', 'fatG']) {
    if (!Number.isFinite(rec[k]) || rec[k] < 0) throw new Error(`canonicalNutritionData: "${id}" ${k} must be finite and >= 0 (got ${JSON.stringify(rec[k])})`);
  }

  // 6-9. source metadata
  const s = rec.source;
  if (!s || typeof s !== 'object') throw new Error(`canonicalNutritionData: "${id}" missing source`);
  if (typeof s.dataset !== 'string' || s.dataset.length === 0) throw new Error(`canonicalNutritionData: "${id}" source.dataset must be non-empty`);
  if (typeof s.foodDescription !== 'string' || s.foodDescription.length === 0) throw new Error(`canonicalNutritionData: "${id}" source.foodDescription must be non-empty`);

  // 12-13. certification
  const c = rec.certification;
  if (!c || (c.status !== 'eligible' && c.status !== 'ineligible')) throw new Error(`canonicalNutritionData: "${id}" certification.status must be 'eligible' | 'ineligible'`);
  if (c.status === 'ineligible' && (typeof c.reason !== 'string' || c.reason.length === 0)) throw new Error(`canonicalNutritionData: "${id}" ineligible records require a non-empty reason`);

  // 8. source.identifier non-empty for source-backed (eligible) records
  if (c.status === 'eligible' && (typeof s.identifier !== 'string' || s.identifier.length === 0)) {
    throw new Error(`canonicalNutritionData: "${id}" eligible records require source.identifier`);
  }

  // 10-11. transformation provenance
  const t = rec.transformation;
  if (t !== null) {
    if (!TRANSFORM_METHODS.includes(t.method)) throw new Error(`canonicalNutritionData: "${id}" invalid transformation.method ${JSON.stringify(t.method)}`);
    if (t.method !== 'direct') {
      if (!Number.isFinite(t.constant) || t.constant <= 0) throw new Error(`canonicalNutritionData: "${id}" non-direct transformation needs a finite positive constant`);
      if (typeof t.constantUnit !== 'string' || t.constantUnit.length === 0) throw new Error(`canonicalNutritionData: "${id}" non-direct transformation needs constantUnit`);
      if (!t.constantSource || typeof t.constantSource.kind !== 'string' || t.constantSource.kind.length === 0 || typeof t.constantSource.reference !== 'string' || t.constantSource.reference.length === 0) {
        throw new Error(`canonicalNutritionData: "${id}" non-direct transformation needs an auditable constantSource {kind, reference}`);
      }
      if (typeof t.note !== 'string' || t.note.length === 0) throw new Error(`canonicalNutritionData: "${id}" non-direct transformation needs a note`);
    }
  }

  _byId.set(id, Object.freeze({
    ...rec,
    source: Object.freeze({ ...s }),
    transformation: t ? Object.freeze({ ...t, constantSource: t.constantSource ? Object.freeze({ ...t.constantSource }) : null }) : null,
    certification: Object.freeze({ ...c }),
  }));
}

// ── Public API ────────────────────────────────────────────────────────────

/** The frozen nutrition record for a canonical id, or null. */
function getNutritionRecord(canonicalIngredientId) {
  return _byId.get(canonicalIngredientId) || null;
}

/** Every canonical id that has a nutrition record, split by certification. */
function coverageSummary() {
  const eligible = [];
  const ineligible = [];
  for (const [id, rec] of _byId) (rec.certification.status === 'eligible' ? eligible : ineligible).push(id);
  const withRecord = new Set(_byId.keys());
  const missing = canonicalIngredients.allCanonicalIngredients()
    .map((c) => c.id)
    .filter((id) => !withRecord.has(id));
  return {
    canonicalCount: canonicalIngredients.allCanonicalIngredients().length,
    recordCount: _byId.size,
    eligible: eligible.sort(),
    ineligible: ineligible.sort(),
    missing: missing.sort(),
  };
}

/** Safe, non-secret snapshot of a record for embedding in a result. */
function _recordMeta(rec) {
  return {
    convention: rec.convention,
    basisUnit: rec.basisUnit,
    basisQuantity: rec.basisQuantity,
    source: rec.source,
    transformation: rec.transformation,
    certification: rec.certification,
  };
}

const _zero = () => ({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });

/**
 * Deterministic nutrition for one canonical ingredient occurrence.
 *
 * @param {{canonicalIngredientId:string, amountValue:number, amountUnit:string}} input
 * @returns {{
 *   status:string, canonicalIngredientId:string,
 *   amountValue:*, amountUnit:*,
 *   kcal:(number|null), proteinG:(number|null), carbsG:(number|null), fatG:(number|null),
 *   authoritative:boolean, record:(object|null)
 * }}
 */
function calculateIngredientNutrition(input) {
  const id = input && input.canonicalIngredientId;
  const amountValue = input ? input.amountValue : undefined;
  const amountUnit = input ? input.amountUnit : undefined;

  const base = {
    canonicalIngredientId: id ?? null,
    amountValue: amountValue ?? null,
    amountUnit: amountUnit ?? null,
    kcal: null, proteinG: null, carbsG: null, fatG: null,
    authoritative: false,
    record: null,
  };

  // 1. canonical id must already be canonical
  const canonical = typeof id === 'string' ? canonicalIngredients.getById(id) : null;
  if (!canonical) return { ...base, status: STATUS.UNKNOWN_CANONICAL_ID };

  // 2. quantity must be finite and > 0 (rejects 0, negatives, NaN, Infinity)
  const n = Number(amountValue);
  if (!Number.isFinite(n) || n <= 0) return { ...base, status: STATUS.INVALID_QUANTITY };

  // 3. nutrition record must exist
  const rec = _byId.get(id);
  if (!rec) return { ...base, status: STATUS.MISSING_NUTRITION_RECORD };

  // 4. record must be certification-eligible
  if (rec.certification.status !== 'eligible') {
    return { ...base, status: STATUS.INELIGIBLE_RECORD, record: _recordMeta(rec) };
  }

  // 5. unit must match the record/canonical base unit — no runtime conversion
  if (amountUnit !== rec.basisUnit) {
    return { ...base, status: STATUS.UNIT_INCOMPATIBLE, record: _recordMeta(rec) };
  }

  // 6. covered — deterministic, unrounded
  const factor = n / rec.basisQuantity;
  const out = {
    kcal: rec.kcal * factor,
    proteinG: rec.proteinG * factor,
    carbsG: rec.carbsG * factor,
    fatG: rec.fatG * factor,
  };
  for (const k of ['kcal', 'proteinG', 'carbsG', 'fatG']) {
    if (!Number.isFinite(out[k])) return { ...base, status: STATUS.INVALID_QUANTITY };
  }

  return {
    status: STATUS.COVERED,
    canonicalIngredientId: id,
    amountValue: n,
    amountUnit,
    ...out,
    authoritative: true,
    record: _recordMeta(rec),
  };
}

/**
 * Aggregate one meal's ingredient occurrences.
 *
 * A meal is `covered` / authoritative ONLY when every ingredient row is
 * covered. Authoritative totals are null on an incomplete meal. `coveredTotals`
 * is the sum over the covered rows only — observability/diagnostics, NEVER an
 * authoritative total.
 *
 * @param {Array<{canonicalIngredientId:string, amountValue:number, amountUnit:string}>} ingredients
 */
function calculateMealNutrition(ingredients) {
  const rows = (Array.isArray(ingredients) ? ingredients : []).map(calculateIngredientNutrition);

  const covered = _zero();
  let allCovered = rows.length > 0;
  for (const r of rows) {
    if (r.status === STATUS.COVERED && r.authoritative) {
      covered.kcal += r.kcal;
      covered.proteinG += r.proteinG;
      covered.carbsG += r.carbsG;
      covered.fatG += r.fatG;
    } else {
      allCovered = false;
    }
  }

  return {
    status: allCovered ? MEAL_STATUS.COVERED : MEAL_STATUS.INCOMPLETE,
    authoritative: allCovered,
    totals: allCovered ? { ...covered } : null,
    coveredTotals: { ...covered },
    ingredients: rows,
  };
}

/**
 * Diagnostic ONLY (never rejects data): flags a record whose Atwater estimate
 * (4*protein + 4*carbs + 9*fat) diverges a lot from the curated kcal. Specific
 * factors, fibre, alcohol and rounding all legitimately cause divergence — this
 * is an observability aid for curators, not a validation gate.
 */
function kcalMacroMismatch(record, tolerancePct = 25) {
  if (!record || !Number.isFinite(record.kcal) || record.kcal <= 0) return null;
  const atwater = 4 * record.proteinG + 4 * record.carbsG + 9 * record.fatG;
  const deltaPct = ((atwater - record.kcal) / record.kcal) * 100;
  return {
    canonicalIngredientId: record.canonicalIngredientId,
    curatedKcal: record.kcal,
    atwaterEstimate: atwater,
    deltaPct: Math.round(deltaPct * 10) / 10,
    exceedsTolerance: Math.abs(deltaPct) > tolerancePct,
  };
}

module.exports = {
  STATUS,
  MEAL_STATUS,
  CONVENTIONS,
  BASIS_UNITS,
  TRANSFORM_METHODS,
  calculateIngredientNutrition,
  calculateMealNutrition,
  getNutritionRecord,
  coverageSummary,
  kcalMacroMismatch,
};
