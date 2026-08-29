'use strict';

// Phase 3D — Canonical Nutrition Data integrity.
// Every curated record must be internally valid, point at a real canonical
// identity, and match that identity's base unit. Curation values are NOT
// re-derived here; this asserts the structural contract + coverage counts.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { NUTRITION_RECORDS, US_CUP_ML } = require('../canonicalNutritionData.js');
const canon = require('../canonicalIngredients.js');
const nutritionEngine = require('../nutritionEngine.js');
const { CONVENTIONS, BASIS_UNITS, TRANSFORM_METHODS } = nutritionEngine;

describe('canonicalNutritionData: structural integrity', () => {
  test('1. every record points to a real canonical id', () => {
    for (const r of NUTRITION_RECORDS) {
      assert.ok(canon.getById(r.canonicalIngredientId), `no canonical ingredient "${r.canonicalIngredientId}"`);
    }
  });

  test('2. no duplicate canonicalIngredientId nutrition records', () => {
    const ids = NUTRITION_RECORDS.map((r) => r.canonicalIngredientId);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('3. basisUnit exactly matches the canonical ingredient baseUnit', () => {
    for (const r of NUTRITION_RECORDS) {
      assert.ok(BASIS_UNITS.includes(r.basisUnit), `${r.canonicalIngredientId} bad basisUnit`);
      assert.equal(r.basisUnit, canon.getById(r.canonicalIngredientId).baseUnit, r.canonicalIngredientId);
    }
  });

  test('4. basisQuantity is finite and > 0 (and === 1 for count)', () => {
    for (const r of NUTRITION_RECORDS) {
      assert.ok(Number.isFinite(r.basisQuantity) && r.basisQuantity > 0, r.canonicalIngredientId);
      if (r.basisUnit === 'count') assert.equal(r.basisQuantity, 1, r.canonicalIngredientId);
      else assert.equal(r.basisQuantity, 100, r.canonicalIngredientId);
    }
  });

  test('5. kcal / proteinG / carbsG / fatG are finite and >= 0', () => {
    for (const r of NUTRITION_RECORDS) {
      for (const k of ['kcal', 'proteinG', 'carbsG', 'fatG']) {
        assert.ok(Number.isFinite(r[k]) && r[k] >= 0, `${r.canonicalIngredientId}.${k} = ${r[k]}`);
      }
    }
  });

  test('convention is one of the frozen set', () => {
    for (const r of NUTRITION_RECORDS) assert.ok(CONVENTIONS.includes(r.convention), `${r.canonicalIngredientId} convention ${r.convention}`);
  });

  test('6. source.dataset and 7. source.foodDescription are non-empty', () => {
    for (const r of NUTRITION_RECORDS) {
      assert.ok(typeof r.source.dataset === 'string' && r.source.dataset.length > 0, r.canonicalIngredientId);
      assert.ok(typeof r.source.foodDescription === 'string' && r.source.foodDescription.length > 0, r.canonicalIngredientId);
    }
  });

  test('8. eligible records carry a non-empty source.identifier', () => {
    for (const r of NUTRITION_RECORDS) {
      if (r.certification.status === 'eligible') {
        assert.ok(typeof r.source.identifier === 'string' && r.source.identifier.length > 0, r.canonicalIngredientId);
      }
    }
  });

  test('9. eligible records capture an energy nutrient id (1008 / 2047 / 2048)', () => {
    for (const r of NUTRITION_RECORDS) {
      if (r.certification.status === 'eligible') {
        assert.ok(['1008', '2047', '2048'].includes(r.source.energyNutrientId), `${r.canonicalIngredientId} energyNutrientId=${r.source.energyNutrientId}`);
      }
    }
  });

  test('7/12. certification.status is only eligible | ineligible', () => {
    for (const r of NUTRITION_RECORDS) assert.ok(r.certification.status === 'eligible' || r.certification.status === 'ineligible', r.canonicalIngredientId);
  });

  test('8/13. ineligible records have a non-empty reason', () => {
    for (const r of NUTRITION_RECORDS) {
      if (r.certification.status === 'ineligible') {
        assert.ok(typeof r.certification.reason === 'string' && r.certification.reason.length > 0, r.canonicalIngredientId);
      } else {
        assert.equal(r.certification.reason, null, r.canonicalIngredientId);
      }
    }
  });

  test('10. direct records may have transformation === null', () => {
    const directish = NUTRITION_RECORDS.filter((r) => r.basisUnit === 'g' && r.certification.status === 'eligible');
    assert.ok(directish.every((r) => r.transformation === null));
  });

  test('9/11. non-direct transformations carry complete auditable provenance', () => {
    for (const r of NUTRITION_RECORDS) {
      const t = r.transformation;
      if (t === null) continue;
      assert.ok(TRANSFORM_METHODS.includes(t.method), `${r.canonicalIngredientId} method ${t.method}`);
      if (t.method === 'direct') continue;
      assert.ok(Number.isFinite(t.constant) && t.constant > 0, `${r.canonicalIngredientId} constant`);
      assert.ok(typeof t.constantUnit === 'string' && t.constantUnit.length > 0, `${r.canonicalIngredientId} constantUnit`);
      assert.ok(t.constantSource && typeof t.constantSource.kind === 'string' && t.constantSource.kind.length > 0, `${r.canonicalIngredientId} constantSource.kind`);
      assert.ok(typeof t.constantSource.reference === 'string' && t.constantSource.reference.length > 0, `${r.canonicalIngredientId} constantSource.reference`);
      assert.ok(typeof t.note === 'string' && t.note.length > 0, `${r.canonicalIngredientId} note`);
    }
  });

  test('every ml/count eligible record has a non-direct transformation', () => {
    for (const r of NUTRITION_RECORDS) {
      if (r.certification.status !== 'eligible') continue;
      if (r.basisUnit === 'ml') assert.equal(r.transformation && r.transformation.method, 'density_g_to_ml', r.canonicalIngredientId);
      if (r.basisUnit === 'count') assert.equal(r.transformation && r.transformation.method, 'portion_g_to_unit', r.canonicalIngredientId);
    }
  });

  test('ml density constants are recomputable from the documented cup weight', () => {
    // Guards against a typo between the stored constant and the reference text.
    for (const r of NUTRITION_RECORDS) {
      if (r.basisUnit !== 'ml' || !r.transformation || r.transformation.constantSource.kind !== 'USDA FDC foodPortion / US legal cup') continue;
      const m = r.transformation.constantSource.reference.match(/=\s*(\d+(?:\.\d+)?)\s*g;/);
      assert.ok(m, `${r.canonicalIngredientId} reference has no "= N g;"`);
      const expected = Number((Number(m[1]) / US_CUP_ML).toFixed(6));
      assert.equal(r.transformation.constant, expected, `${r.canonicalIngredientId} density constant`);
    }
  });

  test('the 3 broths use the frozen 1.000 g/mL Mealzy modeling convention', () => {
    for (const id of ['chicken_broth', 'beef_broth', 'vegetable_broth']) {
      const r = NUTRITION_RECORDS.find((x) => x.canonicalIngredientId === id);
      assert.equal(r.transformation.constant, 1.0);
      assert.equal(r.transformation.constantSource.kind, 'Mealzy modeling convention');
    }
  });
});

describe('canonicalNutritionData: coverage counts (10.)', () => {
  const cov = nutritionEngine.coverageSummary();

  test('canonical vocabulary = 62', () => {
    assert.equal(cov.canonicalCount, 62);
  });

  test('nutrition record count = 62 (every canonical id has a record)', () => {
    assert.equal(cov.recordCount, 62);
    assert.equal(cov.missing.length, 0);
  });

  test('eligible = 59', () => {
    assert.equal(cov.eligible.length, 59);
  });

  test('ineligible = 3 and exactly {beef_chuck, halloumi_cheese, harissa_paste}', () => {
    assert.equal(cov.ineligible.length, 3);
    assert.deepEqual(cov.ineligible, ['beef_chuck', 'halloumi_cheese', 'harissa_paste']);
  });

  test('base-unit split of records is 48 g / 10 ml / 4 count', () => {
    const by = {};
    for (const r of NUTRITION_RECORDS) by[r.basisUnit] = (by[r.basisUnit] || 0) + 1;
    assert.deepEqual(by, { g: 48, ml: 10, count: 4 });
  });
});

describe('canonicalNutritionData: transformed records are reproducible from their own transformation metadata', () => {
  // The verified USDA per-100 g source nutrient values for every transformed
  // record (from the registered-key /food fetches in the Phase 3B/3D curation).
  // [kcal, proteinG, carbsG, fatG] per 100 g of the SOURCE food, plus the
  // grams-per-unit for count records (matches transformation.constant).
  const SOURCE_PER_100G = {
    // density_g_to_ml (constant = density; must equal record.transformation.constant)
    milk:            { fdcId: '171267', v: [50, 3.3, 4.8, 1.98] },
    almond_milk:     { fdcId: '2705409', v: [15, 0.55, 0.34, 1.22] },
    olive_oil:       { fdcId: '171413', v: [884, 0, 0, 100] },
    vegetable_oil:   { fdcId: '172336', v: [884, 0, 0, 100] },
    soy_sauce:       { fdcId: '174277', v: [53, 8.14, 4.93, 0.57] },
    lemon_juice:     { fdcId: '167747', v: [22, 0.35, 6.9, 0.24] },
    lime_juice:      { fdcId: '168156', v: [25, 0.42, 8.42, 0.07] },
    vegetable_broth: { fdcId: '171583', v: [5, 0.24, 0.93, 0.07] },
    chicken_broth:   { fdcId: '174536', v: [6, 0.64, 0.44, 0.21] },
    beef_broth:      { fdcId: '171538', v: [7, 1.14, 0.04, 0.22] },
    // portion_g_to_unit (constant = grams per unit)
    eggs:            { fdcId: '171287', v: [143, 12.56, 0.72, 9.51] },
    banana:          { fdcId: '173944', v: [89, 1.09, 22.84, 0.33] },
    bell_peppers:    { fdcId: '170108', v: [26, 0.99, 6.03, 0.3] },
    corn_tortillas:  { fdcId: '175036', v: [218, 5.7, 44.64, 2.85] },
  };
  const r6 = (n) => Number(n.toFixed(6));

  const transformed = NUTRITION_RECORDS.filter((r) => r.certification.status === 'eligible' && r.transformation !== null);

  test('every transformed eligible record has a SOURCE_PER_100G entry (and vice versa)', () => {
    assert.deepEqual(
      transformed.map((r) => r.canonicalIngredientId).sort(),
      Object.keys(SOURCE_PER_100G).sort()
    );
    assert.equal(transformed.length, 14);
  });

  for (const r of NUTRITION_RECORDS) {
    if (r.certification.status !== 'eligible' || r.transformation === null) continue;
    const id = r.canonicalIngredientId;

    test(`${id}: stored macros === round(sourcePer100g × documented transformation.constant, 6)`, () => {
      const s = SOURCE_PER_100G[id];
      assert.ok(s, `no source values for ${id}`);
      assert.equal(r.source.identifier, s.fdcId, `${id} source identifier moved`);

      let k;
      if (r.transformation.method === 'density_g_to_ml') {
        k = r.transformation.constant;          // g/mL — recompute per-100 mL
      } else if (r.transformation.method === 'portion_g_to_unit') {
        k = r.transformation.constant / 100;    // grams-per-unit / 100 — recompute per-1-unit
      } else {
        throw new Error(`unexpected transformation.method ${r.transformation.method} for ${id}`);
      }

      const recomputed = s.v.map((x) => r6(x * k));
      const stored = [r.kcal, r.proteinG, r.carbsG, r.fatG];
      // STRICT equality: the record must be exactly reproducible from its own
      // documented 6-dp constant. A hidden higher-precision constant would
      // produce a different 6-dp value here and fail. (This is the regression
      // that catches the Phase 3D audit defect.)
      assert.deepEqual(stored, recomputed, `${id}: stored ${JSON.stringify(stored)} != recomputed ${JSON.stringify(recomputed)}`);
    });
  }

  test('the 3 broth records keep transformation.constant === 1.000 and a Mealzy modeling-convention provenance (not USDA density)', () => {
    for (const id of ['chicken_broth', 'beef_broth', 'vegetable_broth']) {
      const t = NUTRITION_RECORDS.find((x) => x.canonicalIngredientId === id).transformation;
      assert.equal(t.method, 'density_g_to_ml');
      assert.equal(t.constant, 1.0);
      assert.equal(t.constantUnit, 'g/ml');
      assert.equal(t.constantSource.kind, 'Mealzy modeling convention');
      assert.equal(t.constantSource.identifier, null);        // no USDA identifier
      assert.doesNotMatch(t.note, /USDA|FDC|sourced/i);        // provenance must not imply a USDA density
    }
  });

  test('the 7 non-broth ml records use their USDA foodPortion-derived density (constant recomputable from the documented cup weight)', () => {
    for (const r of transformed) {
      if (r.basisUnit !== 'ml') continue;
      if (r.transformation.constantSource.kind !== 'USDA FDC foodPortion / US legal cup') continue;
      const m = r.transformation.constantSource.reference.match(/=\s*(\d+(?:\.\d+)?)\s*g;/);
      assert.ok(m, `${r.canonicalIngredientId} reference missing "= N g;"`);
      assert.equal(r.transformation.constant, Number((Number(m[1]) / US_CUP_ML).toFixed(6)), `${r.canonicalIngredientId} density constant != cupGrams/236.588 rounded to 6dp`);
    }
  });
});

describe('canonicalNutritionData: kcal-vs-macro is a diagnostic, not a gate', () => {
  test('records still load even where 4P+4C+9F diverges from curated kcal', () => {
    // e.g. spices / high-fibre foods legitimately diverge. Just prove the
    // helper runs and never throws / rejects.
    let flagged = 0;
    for (const r of NUTRITION_RECORDS) {
      if (r.certification.status !== 'eligible') continue;
      const d = nutritionEngine.kcalMacroMismatch(r);
      if (d && d.exceedsTolerance) flagged += 1;
    }
    assert.ok(flagged >= 0); // informational only; no assertion on the count
    assert.equal(NUTRITION_RECORDS.length, 62); // and the dataset is intact
  });
});
