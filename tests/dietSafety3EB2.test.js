'use strict';

/**
 * Phase 3E-B2 — deterministic dietary/allergen substrate.
 *
 * Proves the restriction contract, the canonical safety-data coverage, and the
 * meal/week safety engine. No Anthropic calls, no network — every "week" is
 * synthetic structured data.
 *
 * Substrate only: these tests must NOT exercise certificationGate.js or
 * server.js, and nothing here activates a hard gate.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contract = require('../dietRestrictionContract');
const attr = require('../dietAttributeData');
const safety = require('../dietSafety');
const canonicalIngredients = require('../canonicalIngredients');

const { STATUS } = safety;
const { PRESENT, ABSENT, UNRESOLVED } = attr.PROPERTY_VALUE;

// ── helpers ───────────────────────────────────────────────────────────────
const meal = (...names) => ({ ingredients: names.map((n) => (typeof n === 'string' ? { name: n } : n)) });
const week = (...meals) => ({ days: [{ meals }] });
const norm = (diets = [], allergens = []) => contract.normalizeRestrictions({ diets, allergens });
const assessOneMeal = (m, diets = [], allergens = []) => safety.assessWeek(week(m), { diets, allergens });
const prop = (id, p) => attr.getSafetyRecord(id)[p];

// ══ CONTRACT / NORMALIZATION ═════════════════════════════════════════════

test('1. supported hard diets normalise as supported', () => {
  for (const id of ['vegetarian', 'vegan', 'gluten-free', 'dairy-free']) {
    const n = norm([id]);
    assert.deepEqual(n.activeDietIds, [id]);
    assert.equal(n.hasUnsupported, false);
  }
  // separator variants fold exactly (not fuzzily)
  assert.deepEqual(norm(['Gluten Free']).activeDietIds, ['gluten-free']);
  assert.deepEqual(norm(['gluten_free']).activeDietIds, ['gluten-free']);
  assert.deepEqual(norm(['dairy_free']).activeDietIds, ['dairy-free']);
});

test('2. keto/halal/kosher/paleo/mediterranean/low_carb/high_protein are known-but-unsupported', () => {
  for (const raw of ['keto', 'halal', 'kosher', 'paleo', 'mediterranean', 'low_carb', 'high_protein']) {
    const n = norm([raw]);
    assert.deepEqual(n.activeDietIds, [], `${raw} must not be an active diet`);
    assert.equal(n.hasUnsupported, true);
    assert.equal(n.unsupported[0].reason, contract.UNSUPPORTED_REASON.KNOWN_UNSUPPORTED_DIET);
  }
});

test('3. all nine supported allergen ids normalise', () => {
  for (const id of contract.SUPPORTED_ALLERGEN_IDS) {
    const key = id.replace(/_/g, ' ');
    const n = norm([], [key]);
    assert.ok(n.activeAllergenIds.includes(id), `${key} → ${id}`);
    assert.equal(n.hasUnsupported, false);
  }
  assert.equal(contract.SUPPORTED_ALLERGEN_IDS.length, 9);
});

test('4. approved legacy allergy synonyms normalise exactly', () => {
  assert.deepEqual(norm([], ['dairy']).activeAllergenIds, ['milk']);
  assert.deepEqual(norm([], ['eggs']).activeAllergenIds, ['egg']);
  assert.deepEqual(norm([], ['shellfish']).activeAllergenIds, ['crustacean_shellfish']);
  assert.deepEqual(norm([], ['peanuts']).activeAllergenIds, ['peanut']);
  assert.deepEqual(norm([], ['tree nuts']).activeAllergenIds, ['tree_nut']);
  assert.deepEqual(norm([], ['soya']).activeAllergenIds, ['soy']);
});

test('5. typo "sesamee" is unsupported (no fuzzy)', () => {
  const n = norm([], ['sesamee']);
  assert.deepEqual(n.activeAllergenIds, []);
  assert.equal(n.hasUnsupported, true);
  assert.equal(n.unsupported[0].reason, contract.UNSUPPORTED_REASON.UNRECOGNISED);
});

test('6. arbitrary unknown allergy text is unsupported and never dropped', () => {
  for (const junk of ['mustard', 'kiwi', 'red dye', 'my weird allergy']) {
    const n = norm([], [junk]);
    assert.deepEqual(n.activeAllergenIds, []);
    assert.equal(n.hasUnsupported, true);
    assert.equal(n.unsupported.length, 1);
    assert.equal(n.unsupported[0].raw, junk);
  }
});

test('7. no fuzzy normalization occurs', () => {
  for (const nearMiss of ['vegatarian', 'vega', 'glutenfre', 'dary free', 'pea nut', 'sesam']) {
    assert.equal(norm([nearMiss], [nearMiss]).hasUnsupported, true, nearMiss);
  }
});

// ══ CANONICAL SAFETY DATA ════════════════════════════════════════════════

test('8. every canonical ingredient id has an explicit safety record', () => {
  const ids = canonicalIngredients.allCanonicalIngredients().map((c) => c.id);
  assert.ok(ids.length >= 63);
  for (const id of ids) assert.ok(attr.getSafetyRecord(id) !== null, `${id} missing safety record`);
});

test('9. a missing record never defaults to safe (load validation throws on a gap)', () => {
  // __validate is the exact function that runs at load. Simulate a new
  // canonical id with no record and confirm it throws rather than being
  // silently treated as safe/absent.
  const realAll = canonicalIngredients.allCanonicalIngredients;
  canonicalIngredients.allCanonicalIngredients = () => [
    ...realAll.call(canonicalIngredients),
    Object.freeze({ id: 'future_unlisted_ingredient', canonicalName: 'future unlisted ingredient', aliases: [], category: 'produce', baseUnit: 'g' }),
  ];
  try {
    assert.throws(() => attr.__validate(), /future_unlisted_ingredient.*no safety record/s);
  } finally {
    canonicalIngredients.allCanonicalIngredients = realAll;
  }
  // sanity: real vocabulary still validates
  assert.doesNotThrow(() => attr.__validate());
});

test('10. almond milk — tree nut present, milk/dairy absent, despite category:dairy', () => {
  assert.equal(canonicalIngredients.getById('almond_milk').category, 'dairy');
  assert.equal(prop('almond_milk', 'treeNut'), PRESENT);
  assert.equal(prop('almond_milk', 'dairyMilk'), ABSENT);
  assert.equal(prop('almond_milk', 'animalDerived'), ABSENT);
});

test('11. dairy products — milk present', () => {
  for (const id of ['milk', 'greek_yogurt', 'plain_yogurt', 'butter', 'feta']) {
    assert.equal(prop(id, 'dairyMilk'), PRESENT, id);
    assert.equal(prop(id, 'animalDerived'), PRESENT, id);
  }
});

test('12. eggs — egg present', () => {
  assert.equal(prop('eggs', 'egg'), PRESENT);
  assert.equal(prop('eggs', 'animalDerived'), PRESENT);
  assert.equal(prop('eggs', 'animalSlaughter'), ABSENT);
});

test('13. peanut butter — peanut present; milk/soy/treeNut/gluten NOT inferred', () => {
  assert.equal(prop('peanut_butter', 'peanut'), PRESENT);
  assert.equal(prop('peanut_butter', 'dairyMilk'), UNRESOLVED);
  assert.equal(prop('peanut_butter', 'soy'), UNRESOLVED);
  assert.equal(prop('peanut_butter', 'treeNut'), UNRESOLVED);
  assert.equal(prop('peanut_butter', 'gluten'), UNRESOLVED);
});

test('14. almonds — tree nut present', () => {
  assert.equal(prop('almonds', 'treeNut'), PRESENT);
});

test('15. salmon/cod — fish present + animal-derived', () => {
  for (const id of ['salmon_fillets', 'cod_fillet']) {
    assert.equal(prop(id, 'fish'), PRESENT, id);
    assert.equal(prop(id, 'animalSlaughter'), PRESENT, id);
  }
});

test('16. shrimp — crustacean shellfish present (not finfish)', () => {
  assert.equal(prop('shrimp', 'crustaceanShellfish'), PRESENT);
  assert.equal(prop('shrimp', 'fish'), ABSENT);
  assert.equal(prop('shrimp', 'animalSlaughter'), PRESENT);
});

test('17. chicken/beef broth — animal-derived AND slaughter-derived', () => {
  for (const id of ['chicken_broth', 'beef_broth']) {
    assert.equal(prop(id, 'animalDerived'), PRESENT, id);
    assert.equal(prop(id, 'animalSlaughter'), PRESENT, id);
  }
});

test('18. vegetable broth — animal/vegan property unresolved', () => {
  assert.equal(prop('vegetable_broth', 'animalSlaughter'), UNRESOLVED);
  assert.equal(prop('vegetable_broth', 'animalDerived'), UNRESOLVED);
});

test('19. bread/couscous/soy sauce — gluten grain present', () => {
  for (const id of ['bread', 'couscous', 'soy_sauce']) {
    assert.equal(prop(id, 'glutenGrain'), PRESENT, id);
    assert.equal(prop(id, 'gluten'), PRESENT, id);
  }
});

test('20. soy sauce — soy present', () => {
  assert.equal(prop('soy_sauce', 'soy'), PRESENT);
});

test('21. oats — cannot positively pass gluten-free (glutenGrain present, gluten protein unresolved)', () => {
  assert.equal(prop('oats', 'glutenGrain'), PRESENT);
  assert.equal(prop('oats', 'gluten'), UNRESOLVED);
});

test('22. corn tortillas — gluten property absent', () => {
  assert.equal(prop('corn_tortillas', 'glutenGrain'), ABSENT);
  assert.equal(prop('corn_tortillas', 'gluten'), ABSENT);
});

test('23. hummus — sesame unresolved, vegan AND vegetarian unresolved (no invented positive claim)', () => {
  assert.equal(prop('hummus', 'sesame'), UNRESOLVED);
  assert.equal(prop('hummus', 'animalDerived'), UNRESOLVED);
  assert.equal(prop('hummus', 'animalSlaughter'), UNRESOLVED);
});

// ══ DIET ASSESSMENT ═════════════════════════════════════════════════════

test('24-26. vegetarian rejects chicken / salmon / chicken broth', () => {
  for (const ing of ['chicken breast', 'salmon fillets', 'chicken broth']) {
    const r = assessOneMeal(meal(ing), ['vegetarian']);
    assert.equal(r.status, STATUS.VIOLATION, ing);
    assert.equal(r.certified, false);
  }
});

test('27. vegetarian permits milk / eggs', () => {
  const r = assessOneMeal(meal('milk', 'eggs'), ['vegetarian']);
  assert.equal(r.status, STATUS.SAFE);
  assert.equal(r.certified, true);
});

test('28. vegetarian + vegetable broth = unresolved, not safe', () => {
  const r = assessOneMeal(meal('vegetable broth'), ['vegetarian']);
  assert.equal(r.status, STATUS.UNRESOLVED);
  assert.equal(r.certified, false);
});

test('29-32. vegan rejects dairy / eggs / honey / chicken+beef broth', () => {
  for (const ing of ['feta', 'eggs', 'honey', 'chicken broth', 'beef broth']) {
    const r = assessOneMeal(meal(ing), ['vegan']);
    assert.equal(r.status, STATUS.VIOLATION, ing);
  }
});

test('33. vegan + unresolved bread / hummus / vegetable broth cannot certify', () => {
  for (const ing of ['bread', 'hummus', 'vegetable broth']) {
    const r = assessOneMeal(meal(ing), ['vegan']);
    assert.equal(r.status, STATUS.UNRESOLVED, ing);
    assert.equal(r.certified, false, ing);
  }
});

test('34-36. gluten-free rejects bread / couscous / soy sauce', () => {
  for (const ing of ['bread', 'couscous', 'soy sauce']) {
    assert.equal(assessOneMeal(meal(ing), ['gluten-free']).status, STATUS.VIOLATION, ing);
  }
});

test('37. gluten-free does not positively certify oats', () => {
  const r = assessOneMeal(meal('oats'), ['gluten-free']);
  assert.notEqual(r.status, STATUS.SAFE);
  assert.equal(r.certified, false);
});

test('38. gluten-free permits corn tortillas', () => {
  const r = assessOneMeal(meal('corn tortillas'), ['gluten-free']);
  assert.equal(r.status, STATUS.SAFE);
  assert.equal(r.certified, true);
});

test('39. dairy-free rejects milk / yogurt / butter / feta', () => {
  for (const ing of ['milk', 'greek yogurt', 'plain yogurt', 'butter', 'feta']) {
    assert.equal(assessOneMeal(meal(ing), ['dairy-free']).status, STATUS.VIOLATION, ing);
  }
});

test('40. dairy-free permits almond milk', () => {
  const r = assessOneMeal(meal('almond milk'), ['dairy-free']);
  assert.equal(r.status, STATUS.SAFE);
  assert.equal(r.certified, true);
});

// ══ ALLERGEN ASSESSMENT ═════════════════════════════════════════════════

test('41. milk allergy rejects milk / yogurt / feta', () => {
  for (const ing of ['milk', 'greek yogurt', 'feta']) {
    assert.equal(assessOneMeal(meal(ing), [], ['milk']).status, STATUS.VIOLATION, ing);
  }
});

test('42. tree-nut allergy rejects almonds / almond milk', () => {
  for (const ing of ['almonds', 'almond milk']) {
    assert.equal(assessOneMeal(meal(ing), [], ['tree nut']).status, STATUS.VIOLATION, ing);
  }
});

test('43. peanut allergy rejects peanut butter', () => {
  assert.equal(assessOneMeal(meal('peanut butter'), [], ['peanut']).status, STATUS.VIOLATION);
});

test('44. fish allergy rejects salmon / cod (not shrimp)', () => {
  assert.equal(assessOneMeal(meal('salmon fillets'), [], ['fish']).status, STATUS.VIOLATION);
  assert.equal(assessOneMeal(meal('cod fillet'), [], ['fish']).status, STATUS.VIOLATION);
  assert.equal(assessOneMeal(meal('shrimp'), [], ['fish']).status, STATUS.SAFE);
});

test('45. crustacean-shellfish allergy rejects shrimp', () => {
  assert.equal(assessOneMeal(meal('shrimp'), [], ['crustacean shellfish']).status, STATUS.VIOLATION);
  assert.equal(assessOneMeal(meal('shrimp'), [], ['shellfish']).status, STATUS.VIOLATION); // legacy synonym
});

test('46. soy allergy rejects soy sauce', () => {
  assert.equal(assessOneMeal(meal('soy sauce'), [], ['soy']).status, STATUS.VIOLATION);
});

test('47. sesame allergy + hummus = unresolved, never safe / never violation', () => {
  const r = assessOneMeal(meal('hummus'), [], ['sesame']);
  assert.equal(r.status, STATUS.UNRESOLVED);
  assert.equal(r.certified, false);
});

test('48. gluten allergen rejects bread / couscous / soy sauce', () => {
  for (const ing of ['bread', 'couscous', 'soy sauce']) {
    assert.equal(assessOneMeal(meal(ing), [], ['gluten']).status, STATUS.VIOLATION, ing);
  }
});

test('49. legacy "nut" keeps BOTH peanut and tree-nut protection', () => {
  const n = norm([], ['nut']);
  assert.deepEqual(n.activeAllergenIds, ['peanut', 'tree_nut']);
  assert.equal(assessOneMeal(meal('almonds'), [], ['nut']).status, STATUS.VIOLATION);
  assert.equal(assessOneMeal(meal('peanut butter'), [], ['nut']).status, STATUS.VIOLATION);
  assert.deepEqual(norm([], ['nuts']).activeAllergenIds, ['peanut', 'tree_nut']);
});

// ══ AUTHORITY / ADVERSARIAL ═════════════════════════════════════════════

test('50. alias resolution does not change the safety meaning of the canonical id', () => {
  const viaAlias = assessOneMeal(meal('boneless skinless chicken breast'), ['vegan']);
  const viaCanonical = assessOneMeal(meal('chicken breast'), ['vegan']);
  assert.equal(viaAlias.status, viaCanonical.status);
  assert.equal(viaAlias.meals[0].ingredients[0].canonicalIngredientId, 'chicken_breast');
});

test('51. unresolved ingredient name cannot certify (no regex authority)', () => {
  // "chicken broth powder" is NOT a canonical alias → unresolved → UNRESOLVED,
  // never VIOLATION (a name-regex would wrongly fire on "chicken"/"broth").
  const r = assessOneMeal(meal('chicken broth powder'), ['vegan']);
  assert.equal(r.status, STATUS.UNRESOLVED);
  assert.equal(r.certified, false);
  assert.equal(r.failures[0].type, safety.FAILURE_TYPE.UNRESOLVED_INGREDIENT);
});

test('52. model-proposed canonical id cannot rescue an unresolved name', () => {
  const m = { ingredients: [{ name: 'definitely not a real ingredient', canonicalIngredientId: 'white_rice' }] };
  const r = assessOneMeal(m, ['vegan']);
  assert.equal(r.status, STATUS.UNRESOLVED);
  assert.equal(r.meals[0].ingredients[0].resolved, false);
  assert.equal(r.meals[0].ingredients[0].canonicalIngredientId, null);
});

test('53. an unknown restriction makes an otherwise-perfect meal/week uncertified', () => {
  const perfect = week(meal('white rice', 'broccoli', 'olive oil'));
  const ok = safety.assessWeek(perfect, { diets: ['vegan'], allergens: [] });
  assert.equal(ok.certified, true);
  const withJunk = safety.assessWeek(perfect, { diets: ['vegan'], allergens: ['mustard'] });
  assert.equal(withJunk.certified, false);
  assert.equal(withJunk.status, STATUS.UNSUPPORTED_RESTRICTION);
  assert.equal(withJunk.failures.some((f) => f.type === safety.FAILURE_TYPE.UNSUPPORTED_RESTRICTION), true);
});

test('54. multiple supported restrictions intersect (must satisfy every one)', () => {
  // vegan + gluten-free on a meal that satisfies vegan but not GF
  const r = assessOneMeal(meal('couscous'), ['vegan', 'gluten-free']);
  assert.equal(r.status, STATUS.VIOLATION);
  const gfFail = r.failures.find((f) => f.restrictionId === 'gluten-free');
  assert.ok(gfFail && gfFail.type === safety.FAILURE_TYPE.DIET_VIOLATION);
  // a meal that satisfies BOTH
  assert.equal(assessOneMeal(meal('white rice', 'broccoli'), ['vegan', 'gluten-free']).certified, true);
});

test('55. multiple allergens are a union of exclusions', () => {
  const r = safety.assessWeek(
    week(meal('almonds'), meal('peanut butter')),
    { diets: [], allergens: ['tree nut', 'peanut'] },
  );
  assert.equal(r.certified, false);
  assert.equal(r.anyViolation, true);
});

test('56. no empty-intersection fallback ever relaxes a constraint', () => {
  // vegan + a meal of only animal products: must stay VIOLATION, never "fall
  // back" to allowing them.
  const r = assessOneMeal(meal('chicken breast', 'feta', 'eggs'), ['vegan']);
  assert.equal(r.status, STATUS.VIOLATION);
  assert.equal(r.certified, false);
});

test('57. any relevant unresolved attribute makes the meal/week uncertified', () => {
  // dairy-free + bread: bread.dairyMilk is unresolved
  const r = assessOneMeal(meal('bread'), ['dairy-free']);
  assert.equal(r.status, STATUS.UNRESOLVED);
  assert.equal(r.certified, false);
});

test('58. excluded / ineligible canonical ingredients still have explicit safety records', () => {
  for (const id of ['beef_chuck', 'halloumi_cheese', 'harissa_paste', 'cumin', 'paprika', 'cinnamon', 'rosemary']) {
    const rec = attr.getSafetyRecord(id);
    assert.ok(rec, id);
    for (const p of attr.SAFETY_PROPERTIES) assert.ok(p in rec, `${id}.${p}`);
  }
  // halloumi is dairy; beef chuck is slaughter-derived
  assert.equal(prop('halloumi_cheese', 'dairyMilk'), PRESENT);
  assert.equal(prop('beef_chuck', 'animalSlaughter'), PRESENT);
});

test('59. completeness — no canonical vocabulary addition can silently lack safety data', () => {
  // __validate is the load-time guard. Confirm it is wired (test 9 proves the
  // throw) and that record/id counts are exactly aligned right now.
  const ids = new Set(canonicalIngredients.allCanonicalIngredients().map((c) => c.id));
  const recIds = new Set(Object.keys(attr.SAFETY_RECORDS));
  assert.equal(ids.size, recIds.size);
  for (const id of ids) assert.ok(recIds.has(id), `canonical ${id} lacks a record`);
  for (const id of recIds) assert.ok(ids.has(id), `record ${id} has no canonical ingredient`);
});

test('60. hard safety output never uses raw regex as authority', () => {
  // Static: dietSafety.js contains no RegExp / .test( / .match( / .includes(
  // applied to ingredient text.
  const src = fs.readFileSync(path.join(__dirname, '..', 'dietSafety.js'), 'utf8');
  assert.equal(/new RegExp|\.test\(|\.match\(|RegExp\(/.test(src), false, 'dietSafety.js must not pattern-match text');
  // Behavioural: a name containing forbidden words but not canonically
  // resolvable is UNRESOLVED, not VIOLATION.
  assert.equal(assessOneMeal(meal('beef-free plant crumble'), ['vegan']).status, STATUS.UNRESOLVED);
  assert.equal(assessOneMeal(meal('imitation shrimp flavour'), [], ['crustacean shellfish']).status, STATUS.UNRESOLVED);
});

// ══ EXTRA — invariants the brief leans on ═══════════════════════════════

test('E1. empty restriction set → vacuously certified, nothing to enforce', () => {
  const r = safety.assessWeek(week(meal('chicken breast')), { diets: [], allergens: [] });
  assert.equal(r.certified, true);
  assert.equal(r.status, STATUS.SAFE);
});

test('E2. empty week (no meals) is never certified', () => {
  assert.equal(safety.assessWeek({ days: [] }, { diets: ['vegan'] }).certified, false);
});

test('E3. diet and allergen concepts are not conflated (dairy-free vs milk)', () => {
  const dr = assessOneMeal(meal('milk'), ['dairy-free']);
  const mr = assessOneMeal(meal('milk'), [], ['milk']);
  assert.equal(dr.failures[0].restrictionKind, 'diet');
  assert.equal(mr.failures[0].restrictionKind, 'allergen');
});

test('E4. week-level failure detail identifies ingredient + restriction + property', () => {
  const r = safety.assessWeek(week(meal('white rice'), meal('feta')), { diets: ['vegan'], allergens: [] });
  const f = r.failures.find((x) => x.type === safety.FAILURE_TYPE.DIET_VIOLATION);
  assert.equal(f.canonicalIngredientId, 'feta');
  assert.equal(f.restrictionId, 'vegan');
  assert.equal(f.property, 'animalDerived');
  assert.equal(f.dayIndex, 0);
  assert.equal(f.mealIndex, 1);
  assert.equal(r.allMealsPassed, false);
});

// ══ FINAL ADVERSARIAL CORRECTION 1 — no invented positive vegetarian certainty
//    for formulation-dependent composite products ═══════════════════════════

test('C1. vegetarian + bread → UNRESOLVED, not SAFE (animalSlaughter no longer invented absent)', () => {
  assert.equal(prop('bread', 'animalSlaughter'), UNRESOLVED);
  assert.equal(prop('bread', 'animalDerived'), UNRESOLVED);
  const r = assessOneMeal(meal('bread'), ['vegetarian']);
  assert.equal(r.status, STATUS.UNRESOLVED);
  assert.equal(r.certified, false);
});

test('C2. vegetarian + hummus → UNRESOLVED, not SAFE', () => {
  const r = assessOneMeal(meal('hummus'), ['vegetarian']);
  assert.equal(r.status, STATUS.UNRESOLVED);
  assert.equal(r.certified, false);
});

test('C3. other composites carry no invented positive vegetarian/vegan claim', () => {
  for (const id of ['soy_sauce', 'corn_tortillas', 'peanut_butter', 'harissa_paste', 'vegetable_broth']) {
    assert.equal(prop(id, 'animalSlaughter'), UNRESOLVED, `${id}.animalSlaughter`);
    assert.equal(prop(id, 'animalDerived'), UNRESOLVED, `${id}.animalDerived`);
  }
  assert.equal(assessOneMeal(meal('soy sauce'), ['vegan']).status, STATUS.UNRESOLVED);
  assert.equal(assessOneMeal(meal('corn tortillas'), ['vegetarian']).status, STATUS.UNRESOLVED);
});

test('C4. frozen certainty RETAINED — deterministic violations & safe cases unchanged', () => {
  // frozen violations
  assert.equal(assessOneMeal(meal('chicken breast'), ['vegetarian']).status, STATUS.VIOLATION);
  assert.equal(assessOneMeal(meal('chicken broth'), ['vegetarian']).status, STATUS.VIOLATION);
  assert.equal(assessOneMeal(meal('beef broth'), ['vegan']).status, STATUS.VIOLATION);
  assert.equal(assessOneMeal(meal('bread'), ['gluten-free']).status, STATUS.VIOLATION);
  assert.equal(assessOneMeal(meal('couscous'), ['gluten-free']).status, STATUS.VIOLATION);
  assert.equal(assessOneMeal(meal('soy sauce'), ['gluten-free']).status, STATUS.VIOLATION);
  assert.equal(assessOneMeal(meal('soy sauce'), [], ['soy']).status, STATUS.VIOLATION);
  assert.equal(assessOneMeal(meal('feta'), ['dairy-free']).status, STATUS.VIOLATION);
  assert.equal(assessOneMeal(meal('almonds'), [], ['tree nut']).status, STATUS.VIOLATION);
  // frozen safe cases
  assert.equal(assessOneMeal(meal('corn tortillas'), ['gluten-free']).certified, true);
  assert.equal(assessOneMeal(meal('almond milk'), ['dairy-free']).certified, true);
  assert.equal(assessOneMeal(meal('almond milk'), [], ['tree nut']).status, STATUS.VIOLATION);
  // oats still cannot pass gluten-free
  assert.notEqual(assessOneMeal(meal('oats'), ['gluten-free']).status, STATUS.SAFE);
  // plain whole foods & single-food cans stay conservatively vegetarian/vegan-safe
  for (const id of ['spinach', 'white_rice', 'quinoa', 'couscous', 'oats', 'canned_chickpeas', 'black_beans_canned', 'canned_tomatoes', 'olive_oil', 'almonds']) {
    assert.equal(prop(id, 'animalSlaughter'), ABSENT, `${id} whole-food`);
    assert.equal(prop(id, 'animalDerived'), ABSENT, `${id} whole-food`);
  }
  assert.equal(assessOneMeal(meal('white rice', 'broccoli', 'canned chickpeas'), ['vegan']).certified, true);
});

// ══ FINAL ADVERSARIAL CORRECTION 2 — unresolved canonical identity blocks
//    certification even with ZERO active restrictions ═══════════════════════

test('C5. unresolved ingredient identity blocks certification with zero restrictions', () => {
  const r = assessOneMeal(meal('white rice', 'moon cheese crumble'), [], []);
  assert.equal(r.certified, false);
  assert.equal(r.status, STATUS.UNRESOLVED);
  const f = r.failures.find((x) => x.type === safety.FAILURE_TYPE.UNRESOLVED_INGREDIENT);
  assert.ok(f);
  assert.equal(f.ingredientName, 'moon cheese crumble');
  assert.equal(f.canonicalIngredientId, null);
});

test('C6. assessWeek with zero restrictions + one unresolved ingredient → certified:false', () => {
  const r = safety.assessWeek(week(meal('white rice'), meal('quinoa', 'unicorn flakes')), {});
  assert.equal(r.certified, false);
  assert.equal(r.anyUnresolved, true);
});

test('C7. zero restrictions + all ingredients resolve → substrate may return certified:true', () => {
  const mealR = assessOneMeal(meal('chicken breast', 'white rice', 'broccoli'), [], []);
  assert.equal(mealR.certified, true);
  assert.equal(mealR.status, STATUS.SAFE);
  const weekR = safety.assessWeek(week(meal('salmon fillets', 'potato'), meal('eggs', 'spinach')), {});
  assert.equal(weekR.certified, true);
  assert.equal(weekR.status, STATUS.SAFE);
});
