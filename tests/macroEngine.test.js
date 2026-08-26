'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const macroEngine = require('../macroEngine.js');
const {
  evaluateMacros, buildDailyMacroTargets, splitMacroTargetsPerMeal,
  sanitizeMacroTarget, deviationPct, buildDirectionalGuidance,
  MACRO_STATUS, MEAL_WEIGHTS,
} = macroEngine;

describe('sanitizeMacroTarget — direct unit tests of the value/fallback/ceiling contract', () => {
  test('a valid value at any point below the ceiling passes through exactly, unmodified', () => {
    assert.equal(sanitizeMacroTarget(1, 150, 1000), 1);
    assert.equal(sanitizeMacroTarget(999, 150, 1000), 999);
    assert.equal(sanitizeMacroTarget(173.4, 150, 1000), 173.4);
  });
  test('exactly at the ceiling still passes through (inclusive)', () => {
    assert.equal(sanitizeMacroTarget(1000, 150, 1000), 1000);
  });
  test('one unit past the ceiling falls back — never clamped to the ceiling value', () => {
    assert.equal(sanitizeMacroTarget(1000.01, 150, 1000), 150);
  });
  test('non-numeric, zero, and negative all fall back', () => {
    assert.equal(sanitizeMacroTarget('abc', 150, 1000), 150);
    assert.equal(sanitizeMacroTarget(undefined, 150, 1000), 150);
    assert.equal(sanitizeMacroTarget(null, 150, 1000), 150);
    assert.equal(sanitizeMacroTarget(NaN, 150, 1000), 150);
    assert.equal(sanitizeMacroTarget(0, 150, 1000), 150);
    assert.equal(sanitizeMacroTarget(-5, 150, 1000), 150);
  });
});

describe('deviationPct — signed percentage deviation from target', () => {
  test('exact match is 0%', () => {
    assert.equal(deviationPct(100, 100), 0);
  });
  test('under target is negative', () => {
    assert.equal(deviationPct(50, 100), -50);
  });
  test('over target is positive', () => {
    assert.equal(deviationPct(150, 100), 50);
  });
  test('a missing/non-positive target never produces NaN/Infinity — returns 0', () => {
    assert.equal(deviationPct(100, 0), 0);
    assert.equal(deviationPct(100, -10), 0);
    assert.equal(deviationPct(100, NaN), 0);
    assert.equal(deviationPct(100, undefined), 0);
  });
});

describe('evaluateMacros — inside ±15% requires no repair', () => {
  test('all three axes within tolerance -> withinTolerance true, status within_target_estimate', () => {
    const target = { protein: 150, carbs: 200, fat: 65 };
    const actual = { protein: 140, carbs: 210, fat: 70 }; // all within ~7%
    const r = evaluateMacros(actual, target);
    assert.equal(r.withinTolerance, true);
    assert.equal(r.status, MACRO_STATUS.WITHIN_TARGET_ESTIMATE);
  });

  test('exactly at the 15% boundary passes (inclusive)', () => {
    const target = { protein: 100, carbs: 100, fat: 100 };
    const actual = { protein: 115, carbs: 85, fat: 100 };
    const r = evaluateMacros(actual, target);
    assert.equal(r.withinTolerance, true);
  });

  test('15.1% over fails', () => {
    const target = { protein: 100, carbs: 100, fat: 100 };
    const actual = { protein: 115.1, carbs: 100, fat: 100 };
    const r = evaluateMacros(actual, target);
    assert.equal(r.withinTolerance, false);
    assert.equal(r.worstAxis, 'protein');
  });
});

describe('evaluateMacros — the real screenshot regression case', () => {
  // target: 2382 kcal, 179g protein, 238g carbs, 79g fat
  // generated: 2382 kcal, 129g protein, 195g carbs, 109g fat
  // This is the case the whole audit was written to close: calories hit
  // exactly, but every macro axis is materially off. It MUST fail tolerance
  // and MUST NOT be labeled "certified" anywhere in this module.
  const target = { protein: 179, carbs: 238, fat: 79 };
  const actual = { protein: 129, carbs: 195, fat: 109 };

  test('fails macro tolerance', () => {
    const r = evaluateMacros(actual, target);
    assert.equal(r.withinTolerance, false);
    assert.equal(r.status, MACRO_STATUS.OUTSIDE_TARGET_ESTIMATE);
  });

  test('deviations match hand-computed percentages', () => {
    const r = evaluateMacros(actual, target);
    assert.equal(r.deviations.protein, -27.9);
    assert.equal(r.deviations.carbs, -18.1);
    assert.equal(r.deviations.fat, 38.0);
  });

  test('worst axis is fat (largest magnitude deviation)', () => {
    const r = evaluateMacros(actual, target);
    assert.equal(r.worstAxis, 'fat');
  });

  test('status is never the word "certified" anywhere in the module', () => {
    assert.ok(!Object.values(MACRO_STATUS).some((v) => v.includes('certified')));
  });
});

describe('evaluateMacros — single-axis failures', () => {
  const target = { protein: 150, carbs: 200, fat: 65 };

  test('low protein only', () => {
    const r = evaluateMacros({ protein: 100, carbs: 200, fat: 65 }, target);
    assert.equal(r.withinTolerance, false);
    assert.equal(r.worstAxis, 'protein');
    assert.ok(r.deviations.protein < -15);
    assert.equal(Math.abs(r.deviations.carbs) <= 15, true);
    assert.equal(Math.abs(r.deviations.fat) <= 15, true);
  });

  test('high fat only', () => {
    const r = evaluateMacros({ protein: 150, carbs: 200, fat: 100 }, target);
    assert.equal(r.withinTolerance, false);
    assert.equal(r.worstAxis, 'fat');
    assert.ok(r.deviations.fat > 15);
  });

  test('low carbs only', () => {
    const r = evaluateMacros({ protein: 150, carbs: 140, fat: 65 }, target);
    assert.equal(r.withinTolerance, false);
    assert.equal(r.worstAxis, 'carbs');
    assert.ok(r.deviations.carbs < -15);
  });
});

describe('buildDirectionalGuidance — only mentions axes actually outside tolerance', () => {
  test('mentions only the failing axis, with correct direction', () => {
    const lines = buildDirectionalGuidance({ protein: -27.9, carbs: -18.1, fat: 38.0 });
    assert.equal(lines.length, 3);
    assert.match(lines.find((l) => l.startsWith('protein')), /too low/);
    assert.match(lines.find((l) => l.startsWith('carbs')), /too low/);
    assert.match(lines.find((l) => l.startsWith('fat')), /too high/);
  });

  test('returns [] when nothing exceeds tolerance', () => {
    const lines = buildDirectionalGuidance({ protein: 5, carbs: -3, fat: 10 });
    assert.deepEqual(lines, []);
  });
});

describe('malformed macro targets fail safely (never invents a fitness recommendation)', () => {
  test('non-numeric input falls back to Mealzy\'s existing defaults (150/200/65)', () => {
    const t = buildDailyMacroTargets({ daily_protein: 'abc', daily_carbs: null, daily_fat: undefined });
    assert.deepEqual(t, { protein: 150, carbs: 200, fat: 65 });
  });

  test('negative/zero values fall back to defaults', () => {
    const t = buildDailyMacroTargets({ daily_protein: -50, daily_carbs: 0, daily_fat: -1 });
    assert.deepEqual(t, { protein: 150, carbs: 200, fat: 65 });
  });

  test('impossible (corrupt-data-shaped) values fall back to defaults — never clamped to an invented number', () => {
    const t = buildDailyMacroTargets({ daily_protein: 99999, daily_carbs: 99999, daily_fat: 99999 });
    // Must fall back to the existing default, NOT a clamped ceiling value —
    // a clamp would present an invented number as if it were the user's
    // real target.
    assert.deepEqual(t, { protein: 150, carbs: 200, fat: 65 });
  });

  test('a legitimate, real-world value passes through unchanged', () => {
    const t = buildDailyMacroTargets({ daily_protein: 179, daily_carbs: 238, daily_fat: 79 });
    assert.deepEqual(t, { protein: 179, carbs: 238, fat: 79 });
  });

  test('a valid but UNUSUAL value (well above typical, still physiologically real) survives EXACTLY unchanged — never silently clamped', () => {
    // 350g protein is a real target some athletes track; it must not be
    // treated as "impossible" just because it looks unusual next to the
    // 150g default.
    const t = buildDailyMacroTargets({ daily_protein: 350, daily_carbs: 550, daily_fat: 220 });
    assert.deepEqual(t, { protein: 350, carbs: 550, fat: 220 });
  });

  test('a valid but unusually LOW value also survives EXACTLY unchanged', () => {
    const t = buildDailyMacroTargets({ daily_protein: 15, daily_carbs: 20, daily_fat: 12 });
    assert.deepEqual(t, { protein: 15, carbs: 20, fat: 12 });
  });

  test('target sanitation does not silently replace a valid value with a rounded/adjusted one', () => {
    // A deliberately odd, non-round number — must come back byte-for-byte
    // identical, proving there is no rounding/normalization step hiding in
    // the "valid" path.
    const t = buildDailyMacroTargets({ daily_protein: 173.4, daily_carbs: 241.7, daily_fat: 81.2 });
    assert.deepEqual(t, { protein: 173.4, carbs: 241.7, fat: 81.2 });
  });

  test('nested profile.macros object is also accepted', () => {
    const t = buildDailyMacroTargets({ macros: { protein: 160, carbs: 220, fat: 70 } });
    assert.deepEqual(t, { protein: 160, carbs: 220, fat: 70 });
  });

  test('evaluateMacros never throws even on garbage actual totals', () => {
    assert.doesNotThrow(() => evaluateMacros({ protein: NaN, carbs: undefined, fat: 'x' }, { protein: 150, carbs: 200, fat: 65 }));
  });
});

describe('splitMacroTargetsPerMeal — same breakfast/lunch/dinner/snack weighting as calories', () => {
  test('per-meal targets sum back to (approximately) the daily target', () => {
    const daily = { protein: 179, carbs: 238, fat: 79 };
    const perMeal = splitMacroTargetsPerMeal(daily);
    assert.equal(Object.keys(perMeal).sort().join(','), 'breakfast,dinner,lunch,snack');
    const sumProtein = perMeal.breakfast.protein + perMeal.lunch.protein + perMeal.dinner.protein + perMeal.snack.protein;
    assert.ok(Math.abs(sumProtein - daily.protein) <= 2); // rounding slack only
  });

  test('weighting matches the calorie split (25/30/35/10)', () => {
    assert.equal(MEAL_WEIGHTS.breakfast, 0.25);
    assert.equal(MEAL_WEIGHTS.lunch, 0.30);
    assert.equal(MEAL_WEIGHTS.dinner, 0.35);
    assert.equal(MEAL_WEIGHTS.snack, 0.10);
  });
});
