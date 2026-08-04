'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { scaleAmount, scaleCost } = require('../public/js/utils.js');

describe('scaleAmount', () => {
  test('returns the trimmed string unchanged when multiplier is 1', () => {
    assert.equal(scaleAmount('200g', 1), '200g');
  });

  test('returns the value unchanged when multiplier is falsy', () => {
    assert.equal(scaleAmount('200g', 0), '200g');
    assert.equal(scaleAmount('200g', undefined), '200g');
  });

  test('scales a plain integer amount with a unit', () => {
    assert.equal(scaleAmount('200g', 2), '400 g');
  });

  test('scales a decimal amount', () => {
    assert.equal(scaleAmount('1.5 cups', 2), '3 cups');
  });

  test('scales a simple fraction', () => {
    assert.equal(scaleAmount('1/2 cup', 2), '1 cup');
  });

  test('scales a mixed number fraction', () => {
    assert.equal(scaleAmount('1 1/2 tbsp', 2), '3 tbsp');
  });

  test('scales down and trims trailing zeros', () => {
    assert.equal(scaleAmount('4 eggs', 0.5), '2 eggs');
  });

  test('rounds to two decimals and strips trailing zeros for non-integer results', () => {
    assert.equal(scaleAmount('1 clove', 0.3333), '0.33 clove');
  });

  test('handles amounts with no unit', () => {
    assert.equal(scaleAmount('3', 2), '6');
  });

  test('returns non-numeric strings unchanged', () => {
    assert.equal(scaleAmount('to taste', 2), 'to taste');
  });

  test('passes through null and undefined amounts unchanged', () => {
    assert.equal(scaleAmount(null, 2), null);
    assert.equal(scaleAmount(undefined, 2), undefined);
  });

  test('trims surrounding whitespace before scaling', () => {
    assert.equal(scaleAmount('  200g  ', 2), '400 g');
  });
});

describe('scaleCost', () => {
  test('scales a numeric cost by the multiplier', () => {
    assert.equal(scaleCost(10, 2), 20);
  });

  test('treats a falsy multiplier as 1', () => {
    assert.equal(scaleCost(10, 0), 10);
    assert.equal(scaleCost(10, undefined), 10);
  });

  test('scales down fractional multipliers', () => {
    assert.equal(scaleCost(10, 0.5), 5);
  });

  test('returns non-numeric costs unchanged', () => {
    assert.equal(scaleCost('10', 2), '10');
    assert.equal(scaleCost(null, 2), null);
    assert.equal(scaleCost(undefined, 2), undefined);
  });

  test('returns NaN and Infinity unchanged', () => {
    assert.equal(Number.isNaN(scaleCost(NaN, 2)), true);
    assert.equal(scaleCost(Infinity, 2), Infinity);
  });
});
