'use strict';

// Phase 3D — Nutrition Engine (isolated deterministic calculation).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const e = require('../nutritionEngine.js');
const canon = require('../canonicalIngredients.js');
const { NUTRITION_RECORDS } = require('../canonicalNutritionData.js');
const { STATUS } = e;

const calc = (canonicalIngredientId, amountValue, amountUnit) =>
  e.calculateIngredientNutrition({ canonicalIngredientId, amountValue, amountUnit });
const rec = (id) => NUTRITION_RECORDS.find((r) => r.canonicalIngredientId === id);

describe('direct calculation (g)', () => {
  test('11. 100 g of a direct ingredient returns the exact curated per-100g values', () => {
    const r = calc('spinach', 100, 'g');
    const src = rec('spinach');
    assert.equal(r.status, STATUS.COVERED);
    assert.equal(r.authoritative, true);
    assert.equal(r.kcal, src.kcal);
    assert.equal(r.proteinG, src.proteinG);
    assert.equal(r.carbsG, src.carbsG);
    assert.equal(r.fatG, src.fatG);
  });

  test('12. 50 g returns exactly half of the 100 g record (no early rounding)', () => {
    const r = calc('chicken_breast', 50, 'g');
    const src = rec('chicken_breast');
    assert.equal(r.kcal, src.kcal / 2);
    assert.equal(r.proteinG, src.proteinG / 2);
    assert.equal(r.fatG, src.fatG / 2);
  });

  test('13. 200 g returns exactly double', () => {
    const r = calc('white_rice', 200, 'g');
    const src = rec('white_rice');
    assert.equal(r.kcal, src.kcal * 2);
    assert.equal(r.carbsG, src.carbsG * 2);
  });

  test('14. repeated calls are byte-identical (deterministic)', () => {
    const a = calc('salmon_fillets', 137, 'g');
    const b = calc('salmon_fillets', 137, 'g');
    assert.deepEqual(a, b);
  });

  test('fractional gram amounts keep full precision', () => {
    const r = calc('olive_oil', 0, 'ml'); // guard: 0 -> invalid (covered elsewhere)
    assert.equal(r.status, STATUS.INVALID_QUANTITY);
    const r2 = calc('honey', 12.5, 'g');
    assert.equal(r2.kcal, rec('honey').kcal * 0.125);
  });
});

describe('count ingredients', () => {
  test('15. 1 large egg returns the curated per-count nutrition', () => {
    const r = calc('eggs', 1, 'count');
    const src = rec('eggs');
    assert.equal(r.status, STATUS.COVERED);
    assert.equal(r.kcal, src.kcal);
    assert.equal(r.proteinG, src.proteinG);
  });

  test('16. 2 eggs doubles it', () => {
    const r = calc('eggs', 2, 'count');
    assert.equal(r.kcal, rec('eggs').kcal * 2);
    assert.equal(r.fatG, rec('eggs').fatG * 2);
  });

  test('17. 1 medium banana', () => {
    const r = calc('banana', 1, 'count');
    assert.equal(r.status, STATUS.COVERED);
    assert.equal(r.kcal, rec('banana').kcal);
  });

  test('18. 1 medium bell pepper', () => {
    const r = calc('bell_peppers', 1, 'count');
    assert.equal(r.status, STATUS.COVERED);
    assert.equal(r.carbsG, rec('bell_peppers').carbsG);
  });

  test('19. 1 standard corn tortilla', () => {
    const r = calc('corn_tortillas', 1, 'count');
    assert.equal(r.status, STATUS.COVERED);
    assert.equal(r.kcal, rec('corn_tortillas').kcal);
    // provenance note records the 24 g source portion, no "6-inch" claim
    assert.match(r.record.transformation.constantSource.reference, /24 g/);
  });
});

describe('ml ingredients', () => {
  test('20. 100 ml milk returns the curated per-100ml record', () => {
    const r = calc('milk', 100, 'ml');
    assert.equal(r.status, STATUS.COVERED);
    assert.equal(r.kcal, rec('milk').kcal);
  });

  test('21. 50 ml olive oil halves the 100 ml record', () => {
    const r = calc('olive_oil', 50, 'ml');
    assert.equal(r.kcal, rec('olive_oil').kcal / 2);
    assert.equal(r.fatG, rec('olive_oil').fatG / 2);
  });

  test('22. almond_milk uses the approved FNDDS-derived density record', () => {
    const src = rec('almond_milk');
    assert.equal(src.source.dataType, 'Survey (FNDDS)');
    assert.equal(src.source.identifier, '2705409');
    assert.equal(src.transformation.method, 'density_g_to_ml');
    assert.equal(src.transformation.constant, 1.031329); // 244 / 236.588
    const r = calc('almond_milk', 200, 'ml');
    assert.equal(r.kcal, src.kcal * 2);
  });

  test('23. vegetable_oil uses canola nutrition but the id stays vegetable_oil', () => {
    const src = rec('vegetable_oil');
    assert.equal(src.source.foodDescription, 'Oil, canola');
    assert.equal(src.canonicalIngredientId, 'vegetable_oil');
    assert.equal(e.getNutritionRecord('canola_oil'), null);
    const r = calc('vegetable_oil', 100, 'ml');
    assert.equal(r.status, STATUS.COVERED);
  });

  test('24. ready-to-serve broths use the frozen 1.000 g/mL convention', () => {
    for (const id of ['chicken_broth', 'beef_broth', 'vegetable_broth']) {
      const src = rec(id);
      assert.equal(src.transformation.constant, 1.0);
      assert.equal(src.transformation.constantSource.kind, 'Mealzy modeling convention');
      // density 1.000 -> per-100ml === per-100g source values
      const r = calc(id, 100, 'ml');
      assert.equal(r.kcal, src.kcal);
    }
  });
});

describe('failure states — never a silent authoritative zero', () => {
  test('25. unknown canonical id -> not authoritative, no numbers', () => {
    const r = calc('totally_not_real', 100, 'g');
    assert.equal(r.status, STATUS.UNKNOWN_CANONICAL_ID);
    assert.equal(r.authoritative, false);
    assert.equal(r.kcal, null);
  });

  test('26. known canonical id with no nutrition record -> missing_nutrition_record', (t) => {
    // Every current canonical id HAS a record, so simulate the "no record"
    // path by temporarily hiding one via the canonical lookup the engine uses.
    // Instead: assert the contract directly against a canonical id that would
    // have no record if the dataset shrank. Use a stub canonical id present in
    // canonicalIngredientData but (hypothetically) absent from nutrition data.
    // Since coverage is currently 62/62, we prove the branch with a spy.
    const orig = canon.getById;
    t.after(() => { canon.getById = orig; });
    canon.getById = (id) => (id === '__ghost__' ? { id: '__ghost__', baseUnit: 'g' } : orig(id));
    const r = calc('__ghost__', 100, 'g');
    assert.equal(r.status, STATUS.MISSING_NUTRITION_RECORD);
    assert.equal(r.authoritative, false);
    assert.equal(r.kcal, null);
  });

  test('27. explicit ineligible id -> ineligible_record (with reason metadata)', () => {
    for (const id of ['beef_chuck', 'harissa_paste', 'halloumi_cheese']) {
      const r = calc(id, 100, 'g');
      assert.equal(r.status, STATUS.INELIGIBLE_RECORD);
      assert.equal(r.authoritative, false);
      assert.equal(r.kcal, null);
      assert.ok(r.record && r.record.certification.status === 'ineligible' && r.record.certification.reason.length > 0);
    }
  });

  test('28. amount 0 -> invalid_quantity', () => {
    assert.equal(calc('spinach', 0, 'g').status, STATUS.INVALID_QUANTITY);
  });
  test('29. negative amount -> invalid_quantity', () => {
    assert.equal(calc('spinach', -10, 'g').status, STATUS.INVALID_QUANTITY);
  });
  test('30. NaN -> invalid_quantity', () => {
    assert.equal(calc('spinach', NaN, 'g').status, STATUS.INVALID_QUANTITY);
    assert.equal(calc('spinach', 'abc', 'g').status, STATUS.INVALID_QUANTITY);
  });
  test('31. Infinity -> invalid_quantity', () => {
    assert.equal(calc('spinach', Infinity, 'g').status, STATUS.INVALID_QUANTITY);
    assert.equal(calc('spinach', -Infinity, 'g').status, STATUS.INVALID_QUANTITY);
  });

  test('32. wrong unit -> unit_incompatible', () => {
    assert.equal(calc('spinach', 100, 'ml').status, STATUS.UNIT_INCOMPATIBLE);   // g record
    assert.equal(calc('milk', 100, 'g').status, STATUS.UNIT_INCOMPATIBLE);       // ml record
    assert.equal(calc('eggs', 50, 'g').status, STATUS.UNIT_INCOMPATIBLE);        // count record
    assert.equal(calc('spinach', 100, 'cup').status, STATUS.UNIT_INCOMPATIBLE);  // unsupported unit
  });

  test('33. no failure path returns authoritative numbers', () => {
    const failing = [
      calc('nope', 100, 'g'),
      calc('spinach', 0, 'g'),
      calc('spinach', -1, 'g'),
      calc('spinach', NaN, 'g'),
      calc('spinach', Infinity, 'g'),
      calc('spinach', 100, 'ml'),
      calc('beef_chuck', 100, 'g'),
    ];
    for (const r of failing) {
      assert.equal(r.authoritative, false);
      assert.equal(r.kcal, null);
      assert.equal(r.proteinG, null);
      assert.equal(r.carbsG, null);
      assert.equal(r.fatG, null);
    }
  });
});

describe('meal aggregation', () => {
  const meal = (...rows) => e.calculateMealNutrition(rows.map(([id, v, u]) => ({ canonicalIngredientId: id, amountValue: v, amountUnit: u })));

  test('34. a fully covered meal totals correctly', () => {
    const m = meal(['spinach', 100, 'g'], ['eggs', 2, 'count'], ['olive_oil', 10, 'ml']);
    assert.equal(m.status, 'covered');
    assert.equal(m.authoritative, true);
    const exp = {
      kcal: rec('spinach').kcal + rec('eggs').kcal * 2 + rec('olive_oil').kcal * 0.1,
      proteinG: rec('spinach').proteinG + rec('eggs').proteinG * 2 + rec('olive_oil').proteinG * 0.1,
      carbsG: rec('spinach').carbsG + rec('eggs').carbsG * 2 + rec('olive_oil').carbsG * 0.1,
      fatG: rec('spinach').fatG + rec('eggs').fatG * 2 + rec('olive_oil').fatG * 0.1,
    };
    assert.deepEqual(m.totals, exp);
  });

  test('35. one ineligible ingredient makes the meal non-authoritative', () => {
    const m = meal(['spinach', 100, 'g'], ['beef_chuck', 150, 'g']);
    assert.equal(m.status, 'nutrition_incomplete');
    assert.equal(m.authoritative, false);
  });

  test('36. one missing/unknown ingredient makes the meal non-authoritative', () => {
    const m = meal(['spinach', 100, 'g'], ['made_up_thing', 20, 'g']);
    assert.equal(m.authoritative, false);
  });

  test('37. authoritative totals are null on an incomplete meal', () => {
    const m = meal(['spinach', 100, 'g'], ['harissa_paste', 5, 'g']);
    assert.equal(m.totals, null);
  });

  test('38. coveredTotals still shows the sum of the covered rows', () => {
    const m = meal(['spinach', 100, 'g'], ['beef_chuck', 150, 'g']);
    assert.deepEqual(m.coveredTotals, {
      kcal: rec('spinach').kcal, proteinG: rec('spinach').proteinG,
      carbsG: rec('spinach').carbsG, fatG: rec('spinach').fatG,
    });
  });

  test('an empty meal is not authoritative', () => {
    const m = e.calculateMealNutrition([]);
    assert.equal(m.authoritative, false);
    assert.equal(m.totals, null);
  });
});

describe('regression: canonical vocabulary + prior phases untouched', () => {
  test('39. canonical count remains 62', () => {
    assert.equal(canon.allCanonicalIngredients().length, 62);
  });
  test('40 + 41. vegetable_oil id valid; canola_oil id does not exist', () => {
    assert.ok(canon.getById('vegetable_oil'));
    assert.equal(canon.getById('canola_oil'), null);
  });
  test('42 + 43. beef_chuck id valid; lean_chuck id does not exist', () => {
    assert.ok(canon.getById('beef_chuck'));
    assert.equal(canon.getById('lean_chuck'), null);
  });
  test('44. salt_and_pepper id does not exist', () => {
    assert.equal(canon.getById('salt_and_pepper'), null);
  });
  test('45. broccoli canonical baseUnit remains g', () => {
    assert.equal(canon.getById('broccoli').baseUnit, 'g');
  });
  test('46 + 47. Phase 2 grocery economics / Phase 3A broccoli untouched by this module', () => {
    // nutritionEngine.js does not require budgetEngine / groceryAggregation /
    // canonicalPurchaseData — prove no accidental coupling.
    const srcTxt = require('fs').readFileSync(require('path').join(__dirname, '..', 'nutritionEngine.js'), 'utf8');
    assert.doesNotMatch(srcTxt, /require\(['"]\.\/(budgetEngine|groceryAggregation|canonicalPurchaseData|planRepairEngine|macroEngine|pricing|server)['"]\)/);
    const dataTxt = require('fs').readFileSync(require('path').join(__dirname, '..', 'canonicalNutritionData.js'), 'utf8');
    assert.doesNotMatch(dataTxt, /require\(/);
  });
});
