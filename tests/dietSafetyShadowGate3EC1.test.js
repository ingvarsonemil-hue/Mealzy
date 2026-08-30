'use strict';

/**
 * Phase 3E-C1 — SHADOW-ONLY dietary/allergen observation in certificationGate.
 *
 * Proves B2 is wired as pure evidence: it never changes the existing gate
 * acceptance, never blocks, never repairs, never 422s, and emits only
 * privacy-safe telemetry. No Anthropic calls — `generateRepairedWeek` is never
 * passed (shadow) so no model call is possible.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gate = require('../certificationGate');

// A deterministically CERTIFIABLE week (identity + nutrition + purchase +
// budget) built from generation-eligible ingredients, 7 days × 1 meal.
const generationVocabulary = require('../generationVocabulary');
const pick = (cat) => generationVocabulary.getGenerationEligibleIngredients().find((i) => i.category === cat);

function certifiableDays() {
  const rice = generationVocabulary.getGenerationEligibleIngredients().find((i) => i.canonicalName.includes('rice'));
  const veg = pick('produce');
  const oil = pick('pantry');
  const meal = {
    type: 'dinner', name: 'Test bowl',
    ingredients: [
      { name: rice.canonicalName, amountValue: 100, amountUnit: rice.baseUnit },
      { name: veg.canonicalName, amountValue: 150, amountUnit: veg.baseUnit },
      { name: oil.canonicalName, amountValue: 10, amountUnit: oil.baseUnit },
    ],
  };
  return Array.from({ length: 7 }, () => ({ meals: [meal] }));
}

const run = (opts) => gate.runCertificationGate({
  days: certifiableDays(),
  requestedBudgetCents: 100000,
  currency: 'USD',
  mode: gate.GATE_MODE.SHADOW,
  ...opts,
});

test('baseline: the fixture week certifies on the existing dimensions', async () => {
  const r = await run({});
  assert.equal(r.status, gate.GATE_STATUS.CERTIFIED);
});

test('21. shadow + B2 SAFE does not change existing gate acceptance', async () => {
  const withNone = await run({});
  const withDiet = await run({ diets: ['vegetarian'], allergens: [] });
  assert.equal(withDiet.status, withNone.status);
  assert.equal(withDiet.dietSafety.dietSafetyCertified, true);
});

test('22. shadow + B2 VIOLATION does not block', async () => {
  const r = await run({ diets: ['vegan'], allergens: [] }); // veg fixture: still SAFE; force a violation instead
  const rv = await gate.runCertificationGate({
    days: [{ meals: [{ type: 'dinner', name: 'x', ingredients: [{ name: 'feta', amountValue: 50, amountUnit: 'g' }] }] }],
    requestedBudgetCents: 100000, currency: 'USD', mode: gate.GATE_MODE.SHADOW,
    diets: ['vegan'],
  });
  // existing gate still decides on its own dimensions (uncertified here) — but
  // NOT because of B2, and never a hard failure in shadow.
  assert.notEqual(rv.status, gate.GATE_STATUS.FAILED);
  assert.equal(rv.dietSafety.dietSafetyCertified, false);
  assert.equal(rv.dietSafety.dietViolationCount >= 1, true);
  assert.equal(r.status, gate.GATE_STATUS.CERTIFIED); // sanity
});

test('23. shadow + B2 UNRESOLVED does not block', async () => {
  const r = await gate.runCertificationGate({
    days: [{ meals: [{ type: 'dinner', name: 'x', ingredients: [{ name: 'bread', amountValue: 50, amountUnit: 'g' }] }] }],
    requestedBudgetCents: 100000, currency: 'USD', mode: gate.GATE_MODE.SHADOW,
    diets: ['vegetarian'],
  });
  assert.notEqual(r.status, gate.GATE_STATUS.FAILED);
  assert.equal(r.dietSafety.dietSafetyStatus, 'unresolved');
});

test('24. shadow + B2 UNSUPPORTED_RESTRICTION does not block', async () => {
  const r = await run({ diets: ['keto'], allergens: ['mustard'] });
  assert.equal(r.status, gate.GATE_STATUS.CERTIFIED); // existing dims still pass
  assert.equal(r.dietSafety.dietSafetyStatus, 'unsupported_restriction');
  assert.equal(r.dietSafety.unsupportedRestrictionCount, 2);
});

test('25. shadow emits B2 diagnostic/telemetry fields', async () => {
  const events = [];
  await run({ diets: ['vegetarian'], allergens: ['milk'], onEvent: (n, p) => events.push([n, p]) });
  const dietEvt = events.find((e) => e[0] === 'diet_assessed');
  assert.ok(dietEvt, 'diet_assessed event emitted');
  for (const f of ['dietSafetyCertified', 'dietSafetyStatus', 'supportedDietCount', 'supportedAllergenCount',
    'preferenceOnlyCount', 'unsupportedRestrictionCount', 'dietViolationCount', 'allergenViolationCount',
    'unresolvedSafetyCount', 'dietSubstrateVersion']) {
    assert.ok(f in dietEvt[1], `telemetry field ${f}`);
  }
  assert.equal(dietEvt[1].supportedDietCount, 1);
  assert.equal(dietEvt[1].supportedAllergenCount, 1);
});

test('26. telemetry contains no raw unsupported/allergy text', async () => {
  const events = [];
  await run({ diets: ['keto', 'my secret diet'], allergens: ['shellfish', 'bizarre allergen phrase'], onEvent: (n, p) => events.push([n, p]) });
  const payload = JSON.stringify(events);
  assert.equal(payload.includes('my secret diet'), false);
  assert.equal(payload.includes('bizarre allergen phrase'), false);
  // enum reasons are fine
  const dietEvt = events.find((e) => e[0] === 'diet_assessed')[1];
  assert.ok(dietEvt.unsupportedReasons.every((r) => ['unsupported_hard_rule', 'unrecognised'].includes(r.reason)
    && ['diets', 'allergens'].includes(r.channel)));
  assert.equal('activeDietIds' in dietEvt, false);
  assert.equal('activeAllergenIds' in dietEvt, false);
  assert.equal('activePreferenceOnlyIds' in dietEvt, false);
});

test('27. preference-only counts are observable without blocking', async () => {
  const r = await run({ diets: ['vegetarian', 'mediterranean', 'high_protein'], allergens: [] });
  assert.equal(r.status, gate.GATE_STATUS.CERTIFIED);
  assert.equal(r.dietSafety.preferenceOnlyCount, 2);
  assert.equal(r.dietSafety.dietSafetyCertified, true);
});

test('28. requested "on" downgraded to shadow remains nonblocking for B2', async () => {
  // hardGateAuthorized defaults to false → mode "on" behaves as shadow.
  const r = await gate.runCertificationGate({
    days: [{ meals: [{ type: 'dinner', name: 'x', ingredients: [{ name: 'feta', amountValue: 50, amountUnit: 'g' }] }] }],
    requestedBudgetCents: 100000, currency: 'USD', mode: gate.GATE_MODE.ON,
    diets: ['vegan'],
  });
  assert.notEqual(r.status, gate.GATE_STATUS.FAILED);
  assert.equal(r.hardGateComplete, false);
  assert.equal(r.dietSafety.dietSafetyCertified, false);
});

test('29. no B2-triggered repair occurs in shadow', async () => {
  let repairCalls = 0;
  const r = await run({
    diets: ['vegan'],
    allergens: [],
    generateRepairedWeek: async () => { repairCalls += 1; return certifiableDays(); },
  });
  assert.equal(repairCalls, 0);
  assert.equal(r.repaired, false);
  assert.equal(r.repairAttempts, 0);
});

test('30. no B2-triggered 422 / FAILED occurs in shadow', async () => {
  for (const opt of [{ diets: ['keto'] }, { allergens: ['mustard'] }, { diets: ['vegan'] }]) {
    const r = await run(opt);
    assert.notEqual(r.status, gate.GATE_STATUS.FAILED);
  }
});

test('33/34/35. authorization + version constants unchanged', () => {
  assert.equal(gate.DIETARY_ALLERGEN_SUBSTRATE_PRESENT, false);
  assert.equal(gate.HARD_GATE_PRODUCTION_AUTHORIZED, false);
  assert.equal(gate.CERTIFICATION_VERSION, 1);
});

test('33b. every gate result carries hardGateComplete:false in shadow', async () => {
  const r = await run({ diets: ['vegetarian'] });
  assert.equal(r.hardGateComplete, false);
  assert.deepEqual(r.excludes, ['dietary_safety', 'allergen_safety']);
});

test('36. existing certification dimensions produce the same verdict with or without B2 inputs', async () => {
  const a = await run({});
  const b = await run({ diets: ['vegan', 'keto'], allergens: ['peanut', 'weird'] });
  assert.equal(a.status, b.status); // B2 inputs never move the existing needle
  assert.equal(a.gateResult.certified, b.gateResult.certified);
});

test('31/32. off-mode + legacy regex isolation (static guards)', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  // B2 shadow wiring is inside the CERTIFICATION_GATE_ACTIVE block only.
  assert.ok(server.includes('if (CERTIFICATION_GATE_ACTIVE) {'));
  // legacy allergy regex still present and still throwing (unchanged behaviour).
  assert.ok(server.includes('throw new AllergyViolationError(match, meal.name)'));
  assert.ok(server.includes('new RegExp(`\\\\b${escaped}s?\\\\b`)'));
  // gate never imports dietSafety in a way that runs for off (require is lazy-safe,
  // but the call site is guarded) — assert runCertificationGate is only called
  // under the active guard.
  const idxGuard = server.indexOf('if (CERTIFICATION_GATE_ACTIVE) {');
  const idxCall = server.indexOf('certificationGate.runCertificationGate({');
  assert.ok(idxGuard > 0 && idxCall > idxGuard);
});

test('route wiring: /api/generate-meal week mode reaches runCertificationGate with only declared identifiers (regression: allergens was undeclared)', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  // 1. The call is reached: it sits inside the week-mode branch of the
  //    /api/generate-meal handler, under the CERTIFICATION_GATE_ACTIVE guard.
  const idxRoute = server.indexOf("app.post('/api/generate-meal'");
  const idxWeekMode = server.indexOf('if (weekStart) {', idxRoute);
  const idxGuard = server.indexOf('if (CERTIFICATION_GATE_ACTIVE) {', idxWeekMode);
  const idxCall = server.indexOf('certificationGate.runCertificationGate({', idxGuard);
  assert.ok(idxRoute > 0, 'generate-meal route present');
  assert.ok(idxWeekMode > idxRoute, 'week-mode branch is inside the route');
  assert.ok(idxGuard > idxWeekMode, 'gate guard is inside week mode');
  assert.ok(idxCall > idxGuard, 'runCertificationGate is called under the guard');

  // 2. runCertificationGate is called exactly once in server.js.
  assert.equal(
    server.split('certificationGate.runCertificationGate({').length - 1, 1,
    'exactly one runCertificationGate call site',
  );

  // 3. Extract the call's argument object by brace-matching.
  const open = server.indexOf('{', idxCall);
  let depth = 0; let end = -1;
  for (let i = open; i < server.length; i++) {
    if (server[i] === '{') depth++;
    else if (server[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > open, 'call argument object braces matched');
  const argSrc = server.slice(open + 1, end);

  // 4. Every identifier passed as an argument value must be a real binding in
  //    server.js — a bare undeclared identifier (the `allergens` bug) throws
  //    ReferenceError at runtime and silently kills the whole shadow gate.
  const declared = new Set();
  for (const m of server.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  // route-handler destructured params + loop bindings
  for (const m of server.matchAll(/\b(?:const|let)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.split(':').pop().trim().replace(/\s*=.*$/, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
    }
  }

  const valuesToCheck = [];
  for (const line of argSrc.split('\n')) {
    const s = line.replace(/\/\/.*$/, '').trim();
    if (!s || s.startsWith('//')) continue;
    const kv = s.match(/^([A-Za-z_$][\w$]*)\s*:\s*(.+?),?\s*$/);
    if (kv) {
      valuesToCheck.push({ key: kv[1], expr: kv[2].replace(/,\s*$/, '') });
      continue;
    }
    const shorthand = s.match(/^([A-Za-z_$][\w$]*),?\s*$/);
    if (shorthand) valuesToCheck.push({ key: shorthand[1], expr: shorthand[1] });
  }

  for (const { key, expr } of valuesToCheck) {
    const idMatch = expr.match(/^([A-Za-z_$][\w$]*)$/);
    if (!idMatch) continue; // inline expression / ternary / arrow — not a bare identifier
    assert.ok(
      declared.has(idMatch[1]),
      `runCertificationGate arg "${key}: ${expr}" — "${idMatch[1]}" is not a declared binding in server.js`,
    );
  }

  // 5. Explicit regression pin: the allergen channel is fed from the route's
  //    `allergies` variable, never a bare `allergens` (which never existed).
  assert.ok(/\ballergens\s*:\s*allergies\b/.test(argSrc), 'allergens: allergies wiring present');
  assert.ok(!/^\s*allergens\s*,?\s*$/m.test(argSrc), 'no bare undeclared `allergens` shorthand');
  assert.ok(declared.has('allergies'), '`allergies` is declared in the route');
  assert.ok(/\bdiets\s*:\s*dietaryPrefs\b/.test(argSrc) && declared.has('dietaryPrefs'), 'diets: dietaryPrefs wiring intact');
});

test('adversarial: canonical scenarios resolve as expected in shadow', async () => {
  const one = (ings, diets = [], allergens = []) => gate.runCertificationGate({
    days: [{ meals: [{ type: 'dinner', name: 'x', ingredients: ings.map((n) => ({ name: n, amountValue: 50, amountUnit: 'g' })) }] }],
    requestedBudgetCents: 100000, currency: 'USD', mode: gate.GATE_MODE.SHADOW, diets, allergens,
  });
  assert.equal((await one(['chicken breast'], ['vegan'])).dietSafety.dietViolationCount, 1);
  assert.equal((await one(['vegetable broth'], ['vegan'])).dietSafety.dietSafetyStatus, 'unresolved');
  assert.equal((await one(['bread'], ['vegetarian'])).dietSafety.dietSafetyStatus, 'unresolved');
  assert.equal((await one(['almond milk'], [], ['tree nut'])).dietSafety.allergenViolationCount, 1);
  assert.equal((await one(['hummus'], [], ['sesame'])).dietSafety.dietSafetyStatus, 'unresolved');
  assert.equal((await one(['peanut butter'], [], ['nut'])).dietSafety.allergenViolationCount >= 1, true);
  // legacy allergy-channel "pork" → diet pork-free: one supported diet, week SAFE
  const porkShadow = (await one(['white rice'], [], ['pork'])).dietSafety;
  assert.equal(porkShadow.supportedDietCount, 1);
  assert.equal(porkShadow.supportedAllergenCount, 0);
  assert.equal(porkShadow.dietSafetyStatus, 'safe');
  assert.equal((await one(['white rice'], ['mediterranean'])).dietSafety.preferenceOnlyCount, 1);
  assert.equal((await one(['white rice'], ['keto'])).dietSafety.dietSafetyStatus, 'unsupported_restriction');
  assert.equal((await one(['white rice'], [], ['mustard'])).dietSafety.dietSafetyStatus, 'unsupported_restriction');
  // none of the above produced a hard failure
});
