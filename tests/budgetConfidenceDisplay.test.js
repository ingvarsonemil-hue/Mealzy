'use strict';

/**
 * Plan-Level Budget Status Truthfulness — regression coverage for the
 * grocery-list page's confidence display. See public/js/budgetConfidenceDisplay.js
 * for the rationale: green "you're fine" styling is only earned by
 * budgetStatus === 'certified'.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { getBudgetConfidenceDisplay, isEstimatedGroceryRow } = require('../public/js/budgetConfidenceDisplay.js');

describe('A: certified + under budget -> confident state', () => {
  test('certified with positive remaining is green, no disclosure note', () => {
    const { color, note } = getBudgetConfidenceDisplay('certified', 8);
    assert.equal(color, 'var(--color-green)');
    assert.equal(note, '');
  });
});

describe('C/D: estimated_with_unknowns -> uncertainty copy present, never confident-certified wording', () => {
  test('estimated_with_unknowns with positive remaining is NOT green and carries a disclosure', () => {
    const { color, note } = getBudgetConfidenceDisplay('estimated_with_unknowns', 8);
    assert.notEqual(color, 'var(--color-green)');
    assert.equal(color, 'var(--clr-warning)');
    assert.ok(note.length > 0);
    assert.doesNotMatch(note.toLowerCase(), /certified|guarantee|verified/);
  });

  test('the disclosure never calls the plan broken or implies checkout accuracy', () => {
    const { note } = getBudgetConfidenceDisplay('estimated_with_unknowns', 8);
    assert.doesNotMatch(note.toLowerCase(), /broken|checkout|exact/);
  });
});

describe('E: certified does not claim a checkout guarantee', () => {
  test('certified produces no note text at all — nothing to accidentally overclaim with', () => {
    const { note } = getBudgetConfidenceDisplay('certified', 5);
    assert.equal(note, '');
  });
});

describe('I: not_enforced never renders as certified', () => {
  test('not_enforced is neutral, not green, even with positive remaining', () => {
    const { color } = getBudgetConfidenceDisplay('not_enforced', 20);
    assert.notEqual(color, 'var(--color-green)');
  });
});

describe('over_budget always wins on color, regardless of status label', () => {
  test('negative remaining is always the error color', () => {
    const { color } = getBudgetConfidenceDisplay('certified', -3);
    assert.equal(color, 'var(--clr-error)');
  });
  test('over_budget status is the error color even if remaining is reported as non-negative', () => {
    const { color } = getBudgetConfidenceDisplay('over_budget', 0);
    assert.equal(color, 'var(--clr-error)');
  });
});

describe('B: estimated_with_unknowns retains the numeric estimate (nothing here hides it)', () => {
  test('getBudgetConfidenceDisplay never returns a hidden/blank color — the number stays visible either way', () => {
    const { color } = getBudgetConfidenceDisplay('estimated_with_unknowns', 8);
    assert.ok(color); // always a real color value; the caller always renders the number
  });
});

describe('F: unknown-priced grocery row gets the estimate badge', () => {
  test('unknown_ingredient row is flagged', () => {
    assert.equal(isEstimatedGroceryRow({ priceSource: 'unknown_ingredient' }), true);
  });
  test('unsupported_unit row is flagged', () => {
    assert.equal(isEstimatedGroceryRow({ priceSource: 'unsupported_unit' }), true);
  });
  test('a user-entered actualCost suppresses the badge — they saw the real price', () => {
    assert.equal(isEstimatedGroceryRow({ priceSource: 'unknown_ingredient', actualCost: 4.20 }), false);
  });
});

describe('G: dataset-priced row does not get a competing badge', () => {
  test('a verified row is never flagged as an estimate', () => {
    assert.equal(isEstimatedGroceryRow({ priceSource: 'verified' }), false);
  });
});

describe('Missing/legacy budgetStatus never defaults to a confident green', () => {
  test('undefined status (a list saved before this field existed) is neutral, not green', () => {
    const { color, note } = getBudgetConfidenceDisplay(undefined, 8);
    assert.notEqual(color, 'var(--color-green)');
    assert.equal(note, ''); // and doesn't fabricate a disclosure it can't actually confirm
  });
});
