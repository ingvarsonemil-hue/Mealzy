'use strict';

/**
 * Phase 3E — deterministic certification generation gate.
 *
 * Covers: off | shadow | on mode semantics, the structural downgrade of a
 * requested 'on' while the dietary/allergen substrate is missing, the
 * unsupported-currency boundary, and the eventual (authorized) accept /
 * one-bounded-repair / fail state machine.
 *
 * No Anthropic calls: the repair generator is a stub the test controls, and
 * every "week" is synthetic structured data. The eventual-'on' tests use the
 * `hardGateAuthorized: true` injection seam (production never passes it).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const gate = require('../certificationGate');

const meal = (ings) => ({ type: 'breakfast', name: 'test meal', ingredients: ings });
const day = (...meals) => ({ meals });

const certifiedWeek = () => ({
  days: [day(meal([
    { name: 'oats', amountValue: 60, amountUnit: 'g' },
    { name: 'milk', amountValue: 200, amountUnit: 'ml' },
  ]))],
  requestedBudgetCents: 500000,
  currency: 'USD',
});

const brokenWeek = () => ({
  days: [day(meal([
    { name: 'oats', amountValue: 60, amountUnit: 'g' },
    { name: 'moon cheese crumble', amountValue: 30, amountUnit: 'g' },
  ]))],
  requestedBudgetCents: 500000,
  currency: 'USD',
});

const run = (week, opts) => gate.runCertificationGate({
  days: week.days,
  requestedBudgetCents: week.requestedBudgetCents,
  currency: week.currency,
  ...opts,
});

// ═══════════════════════════════════════════════════════════════════════════
// A. Hard enforcement is structurally unreachable right now
// ═══════════════════════════════════════════════════════════════════════════

test('A1. HARD_GATE_PRODUCTION_AUTHORIZED is false and the dietary/allergen substrate is absent', () => {
  assert.equal(gate.DIETARY_ALLERGEN_SUBSTRATE_PRESENT, false);
  assert.equal(gate.HARD_GATE_PRODUCTION_AUTHORIZED, false);
});

test('A2. resolveEffectiveMode downgrades a requested "on" to effective "shadow"', () => {
  const r = gate.resolveEffectiveMode('on');
  assert.equal(r.requested, 'on');
  assert.equal(r.effective, gate.GATE_MODE.SHADOW);
  assert.equal(r.downgraded, true);
  assert.equal(r.reason, 'hard_gate_not_production_authorized');
  // shadow / off pass through unchanged
  assert.deepEqual(gate.resolveEffectiveMode('shadow'), { requested: 'shadow', effective: 'shadow', downgraded: false, reason: null });
  assert.deepEqual(gate.resolveEffectiveMode('off'), { requested: 'off', effective: 'off', downgraded: false, reason: null });
  assert.equal(gate.resolveEffectiveMode('bogus').effective, 'off');
});

test('A3. REGRESSION: an env value of "on" cannot execute repair while hard-gate authorization is false', async () => {
  let repairCalls = 0;
  // Simulate what server.js does: resolve the effective mode, then run the gate.
  const effective = gate.resolveEffectiveMode('on').effective;
  const out = await run(brokenWeek(), {
    mode: effective, // 'shadow'
    generateRepairedWeek: async () => { repairCalls += 1; return certifiedWeek().days; },
  });
  assert.equal(repairCalls, 0, 'no repair generation call');
  assert.equal(out.status, gate.GATE_STATUS.SHADOW_UNCERTIFIED);
  assert.equal(out.repaired, false);
});

test('A4. REGRESSION: even if mode:"on" is passed straight to runCertificationGate, no repair or rejection executes', async () => {
  let repairCalls = 0;
  const out = await run(brokenWeek(), {
    mode: gate.GATE_MODE.ON, // passed directly, bypassing resolveEffectiveMode
    generateRepairedWeek: async () => { repairCalls += 1; return brokenWeek().days; },
    // hardGateAuthorized NOT passed -> defaults to the (false) constant
  });
  assert.equal(repairCalls, 0, 'defense in depth: no repair call');
  assert.equal(out.status, gate.GATE_STATUS.SHADOW_UNCERTIFIED, 'never FAILED -> no rejection');
  assert.notEqual(out.status, gate.GATE_STATUS.FAILED);
});

// ═══════════════════════════════════════════════════════════════════════════
// B. off | shadow behaviour available today
// ═══════════════════════════════════════════════════════════════════════════

test('B1. resolveGateMode: only off | shadow | on honoured; unknown -> off', () => {
  assert.equal(gate.resolveGateMode('off'), gate.GATE_MODE.OFF);
  assert.equal(gate.resolveGateMode('shadow'), gate.GATE_MODE.SHADOW);
  assert.equal(gate.resolveGateMode(' SHADOW '), gate.GATE_MODE.SHADOW);
  assert.equal(gate.resolveGateMode('on'), gate.GATE_MODE.ON); // requested, not effective
  for (const v of [undefined, '', 'true', '1', 'yes', 'enabled', 'hard']) {
    assert.equal(gate.resolveGateMode(v), gate.GATE_MODE.OFF, JSON.stringify(v));
  }
});

test('B2. shadow mode: certified week -> CERTIFIED', async () => {
  const out = await run(certifiedWeek(), { mode: gate.GATE_MODE.SHADOW });
  assert.equal(out.status, gate.GATE_STATUS.CERTIFIED);
  assert.equal(out.repaired, false);
});

test('B3. shadow mode: uncertified week -> reported, never blocked, never repaired', async () => {
  let repairCalls = 0;
  const out = await run(brokenWeek(), {
    mode: gate.GATE_MODE.SHADOW,
    generateRepairedWeek: async () => { repairCalls += 1; return certifiedWeek().days; },
  });
  assert.equal(repairCalls, 0);
  assert.equal(out.status, gate.GATE_STATUS.SHADOW_UNCERTIFIED);
});

test('B4. shadow mode + non-USD currency: reported, never blocked', async () => {
  const out = await run({ ...certifiedWeek(), currency: 'EUR' }, { mode: gate.GATE_MODE.SHADOW });
  assert.equal(out.status, gate.GATE_STATUS.SHADOW_UNCERTIFIED);
});

test('B5. the deterministic engine is the source of truth for the verdict', () => {
  const c = gate.assessGeneratedWeek(certifiedWeek());
  const b = gate.assessGeneratedWeek(brokenWeek());
  assert.equal(c.certified, c.assessment.certified);
  assert.equal(b.certified, b.assessment.certified);
  assert.equal(c.certified, true);
  assert.equal(b.certified, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// C. Unsupported-currency boundary (pre-generation)
// ═══════════════════════════════════════════════════════════════════════════

test('C1. isCurrencyCertifiable: USD / unset -> true; anything else -> false; no FX', () => {
  assert.equal(gate.isCurrencyCertifiable('USD'), true);
  assert.equal(gate.isCurrencyCertifiable('usd'), true);
  assert.equal(gate.isCurrencyCertifiable(''), true);
  assert.equal(gate.isCurrencyCertifiable(undefined), true);
  for (const c of ['EUR', 'GBP', 'SEK', 'JPY']) {
    assert.equal(gate.isCurrencyCertifiable(c), false, c);
  }
});

test('C2. authorized hard mode + non-USD -> FAILED unsupported_currency, no repair call', async () => {
  let repairCalls = 0;
  const out = await run({ ...certifiedWeek(), currency: 'EUR' }, {
    mode: gate.GATE_MODE.ON,
    hardGateAuthorized: true, // test seam — eventual authorized behaviour
    generateRepairedWeek: async () => { repairCalls += 1; return certifiedWeek().days; },
  });
  assert.equal(repairCalls, 0, 'currency cannot be repaired');
  assert.equal(out.status, gate.GATE_STATUS.FAILED);
  assert.equal(out.failureReason, gate.FAILURE_REASON.UNSUPPORTED_CURRENCY);
});

// ═══════════════════════════════════════════════════════════════════════════
// D. Eventual authorized 'on' state machine (via the injection seam)
// ═══════════════════════════════════════════════════════════════════════════

test('D1. authorized + already-certified week -> accepted, no repair call', async () => {
  let repairCalls = 0;
  const out = await run(certifiedWeek(), {
    mode: gate.GATE_MODE.ON, hardGateAuthorized: true,
    generateRepairedWeek: async () => { repairCalls += 1; return certifiedWeek().days; },
  });
  assert.equal(out.status, gate.GATE_STATUS.CERTIFIED);
  assert.equal(repairCalls, 0);
  assert.equal(out.repairAttempts, 0);
});

test('D2. authorized + uncertified week -> exactly one repair; repaired-certified accepted', async () => {
  let repairCalls = 0;
  const out = await run(brokenWeek(), {
    mode: gate.GATE_MODE.ON, hardGateAuthorized: true,
    generateRepairedWeek: async (gr) => {
      repairCalls += 1;
      assert.ok(gr.failingIngredients[0].failures.includes('unresolved_canonical_ingredient'));
      return certifiedWeek().days;
    },
  });
  assert.equal(repairCalls, 1);
  assert.equal(out.status, gate.GATE_STATUS.CERTIFIED);
  assert.equal(out.repaired, true);
  assert.equal(out.repairAttempts, 1);
});

test('D3. authorized + still-uncertified after repair -> FAILED, no second attempt', async () => {
  let repairCalls = 0;
  const out = await run(brokenWeek(), {
    mode: gate.GATE_MODE.ON, hardGateAuthorized: true,
    generateRepairedWeek: async () => { repairCalls += 1; return brokenWeek().days; },
  });
  assert.equal(repairCalls, 1);
  assert.equal(out.status, gate.GATE_STATUS.FAILED);
  assert.equal(out.failureReason, gate.FAILURE_REASON.UNCERTIFIED_AFTER_REPAIR);
  assert.equal(gate.MAX_REPAIR_ROUNDS, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// E. Dietary/allergen safeguard markers
// ═══════════════════════════════════════════════════════════════════════════

test('E1. every result marks the gate as NOT the complete hard certification gate', async () => {
  assert.deepEqual(gate.GATE_EXCLUDES, ['dietary_safety', 'allergen_safety']);
  const a = await run(certifiedWeek(), { mode: gate.GATE_MODE.SHADOW });
  const b = await run(brokenWeek(), { mode: gate.GATE_MODE.ON, hardGateAuthorized: true, generateRepairedWeek: async () => brokenWeek().days });
  for (const out of [a, b]) {
    assert.equal(out.hardGateComplete, false);
    assert.deepEqual(out.excludes, ['dietary_safety', 'allergen_safety']);
  }
});

test('E2. CERTIFICATION_VERSION is still 1', () => {
  assert.equal(gate.CERTIFICATION_VERSION, 1);
});
