'use strict';

/**
 * Phase 3E-C1 final correction:
 *  (a) CERTIFICATION_GATE=off must not pull the dietary/allergen substrate into
 *      the runtime dependency graph — dietSafety / dietRestrictionContract /
 *      dietAttributeData are lazy-loaded only when shadow assessment runs.
 *  (b) The shadow summary (analytics event + persisted diagnostic) must not
 *      contain the user's restriction selections — raw OR normalised ids.
 *
 * No Anthropic calls, no network.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const B2_REQUESTS = ['./dietSafety', './dietRestrictionContract', './dietAttributeData'];
const B2_FILES = B2_REQUESTS.map((r) => require.resolve(path.join(__dirname, '..', r.slice(2))));
const GATE_FILE = require.resolve('../certificationGate');

function freshRequireGateWithB2Forbidden() {
  const origLoad = Module._load;
  const loaded = [];
  Module._load = function (request, parent, isMain) {
    if (B2_REQUESTS.includes(request)) {
      loaded.push(request);
      throw new Error(`eager B2 load in off path: ${request}`);
    }
    return origLoad.apply(this, arguments);
  };
  // drop cached copies so the require actually re-executes the module body
  for (const f of [GATE_FILE, ...B2_FILES]) delete require.cache[f];
  try {
    const gate = require('../certificationGate');
    return { gate, loaded };
  } finally {
    Module._load = origLoad;
    for (const f of [GATE_FILE, ...B2_FILES]) delete require.cache[f];
    require('../certificationGate'); // restore a clean cache for other test files
  }
}

// ── (a) off-mode load isolation ───────────────────────────────────────────

test('A1. importing certificationGate does not eagerly require the B2 substrate', () => {
  const { gate, loaded } = freshRequireGateWithB2Forbidden();
  assert.deepEqual(loaded, [], 'no B2 module was requested during certificationGate load');
  // off-relevant surface is fully usable without the substrate
  assert.equal(typeof gate.resolveGateMode, 'function');
  assert.equal(gate.resolveGateMode('off'), 'off');
  assert.equal(gate.resolveGateMode('nonsense'), 'off');
  assert.equal(gate.resolveEffectiveMode('on').effective, 'shadow');
  assert.equal(gate.HARD_GATE_PRODUCTION_AUTHORIZED, false);
  assert.equal(gate.DIETARY_ALLERGEN_SUBSTRATE_PRESENT, false);
  assert.equal(gate.CERTIFICATION_VERSION, 1);
});

test('A2. a malformed dietary substrate cannot break the off path', () => {
  // Simulate dietAttributeData throwing at load (e.g. a future bad pork table).
  const origLoad = Module._load;
  Module._load = function (request) {
    if (request === './dietAttributeData' || request === './dietSafety' || request === './dietRestrictionContract') {
      throw new Error('simulated malformed dietary data');
    }
    return origLoad.apply(this, arguments);
  };
  for (const f of [GATE_FILE, ...B2_FILES]) delete require.cache[f];
  try {
    const gate = require('../certificationGate');
    // The gate module + its off/legacy surface still load and operate.
    assert.equal(gate.resolveGateMode('off'), 'off');
    assert.doesNotThrow(() => gate.assessGeneratedWeek({ days: [], requestedBudgetCents: 100, currency: 'USD' }));
  } finally {
    Module._load = origLoad;
    for (const f of [GATE_FILE, ...B2_FILES]) delete require.cache[f];
    require('../certificationGate');
  }
});

test('A3. server.js off wiring: B2 is reached only through the CERTIFICATION_GATE_ACTIVE guard', () => {
  const fs = require('node:fs');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  // server never requires the B2 modules directly
  assert.equal(/require\('\.\/diet(Safety|AttributeData|RestrictionContract)'\)/.test(server), false);
  // the only diet inputs go into runCertificationGate, inside the active guard
  const guard = server.indexOf('if (CERTIFICATION_GATE_ACTIVE) {');
  const call = server.indexOf('certificationGate.runCertificationGate({');
  assert.ok(guard > 0 && call > guard);
  // and CERTIFICATION_GATE_ACTIVE is false for 'off'
  assert.ok(server.includes("CERTIFICATION_GATE_ACTIVE = CERTIFICATION_GATE_MODE !== certificationGate.GATE_MODE.OFF"));
});

test('A4. lazy load still works when shadow assessment IS requested', () => {
  const gate = require('../certificationGate');
  const out = gate.assessGeneratedWeekDietSafetyShadow(
    { days: [{ meals: [{ ingredients: [{ name: 'white rice' }] }] }] },
    { diets: ['vegan'], allergens: [] },
  );
  assert.equal(out.observationalOnly, true);
  assert.equal(out.dietSubstrateVersion, 1);
});

// ── (b) telemetry / persistence privacy ───────────────────────────────────

const ADVERSARIAL = {
  diets: ['vegan', 'mediterranean', 'my private diet'],
  allergens: ['peanut', 'strange private allergen'],
};

// Words that are the USER'S selections and must never appear as restriction data.
const FORBIDDEN_SELECTION_STRINGS = [
  'my private diet', 'strange private allergen', // raw free text
  'vegan', 'mediterranean', 'peanut',            // normalised selections
];

function shadowSummary(restrictions) {
  return require('../certificationGate').assessGeneratedWeekDietSafetyShadow(
    { days: [{ meals: [{ ingredients: [{ name: 'white rice' }, { name: 'broccoli' }] }] }] },
    restrictions,
  );
}

test('B1-B6. the shadow summary carries no restriction selections (raw or normalised)', () => {
  const s = shadowSummary(ADVERSARIAL);
  // the allowed fields only
  assert.deepEqual(Object.keys(s).sort(), [
    'allergenViolationCount', 'dietSafetyCertified', 'dietSafetyStatus', 'dietSubstrateVersion',
    'dietViolationCount', 'failingCanonicalIngredientIds', 'observationalOnly',
    'preferenceOnlyCount', 'supportedAllergenCount', 'supportedDietCount',
    'unresolvedSafetyCount', 'unsupportedReasons', 'unsupportedRestrictionCount',
  ].sort());
  assert.equal('activeDietIds' in s, false);
  assert.equal('activeAllergenIds' in s, false);
  assert.equal('activePreferenceOnlyIds' in s, false);

  // Deep string scan of everything EXCEPT the explicitly-allowed
  // failingCanonicalIngredientIds field (generic vocabulary ids, may contain
  // a food word by coincidence).
  const { failingCanonicalIngredientIds, ...scannable } = s;
  const blob = JSON.stringify(scannable).toLowerCase();
  for (const bad of FORBIDDEN_SELECTION_STRINGS) {
    assert.equal(blob.includes(bad.toLowerCase()), false, `"${bad}" must not appear in telemetry`);
  }
  // unsupportedReasons is {reason, channel} only — no raw, no recognised id
  for (const u of s.unsupportedReasons) {
    assert.deepEqual(Object.keys(u).sort(), ['channel', 'reason']);
    assert.equal(['unsupported_hard_rule', 'unrecognised'].includes(u.reason), true);
    assert.equal(['diets', 'allergens'].includes(u.channel), true);
  }
});

test('B7. failingCanonicalIngredientIds may still appear (generic vocabulary ids)', () => {
  const s = shadowSummary({ diets: ['vegan'], allergens: [] });
  // white rice + broccoli resolve & are vegan-safe → no failures here; force one
  const s2 = require('../certificationGate').assessGeneratedWeekDietSafetyShadow(
    { days: [{ meals: [{ ingredients: [{ name: 'feta' }] }] }] },
    { diets: ['vegan'], allergens: [] },
  );
  assert.ok(Array.isArray(s2.failingCanonicalIngredientIds));
  assert.ok(s2.failingCanonicalIngredientIds.includes('feta'));
  assert.ok(Array.isArray(s.failingCanonicalIngredientIds));
});

test('B8. aggregate counts / statuses still appear', () => {
  const s = shadowSummary(ADVERSARIAL);
  assert.equal(s.supportedDietCount, 1);        // vegan
  assert.equal(s.supportedAllergenCount, 1);    // peanut
  assert.equal(s.preferenceOnlyCount, 1);       // mediterranean
  assert.equal(s.unsupportedRestrictionCount, 2); // "my private diet" + "strange private allergen"
  assert.equal(typeof s.dietSafetyStatus, 'string');
  assert.equal(typeof s.dietSafetyCertified, 'boolean');
});
