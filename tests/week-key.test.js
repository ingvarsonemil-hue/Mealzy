'use strict';

// Unit tests for the pure ISO-week calculation used by the week_return
// retention signal (server.js maybeLogWeekReturn). Split into weekKey.js
// specifically so this logic is testable without requiring server.js
// (which has no module.exports — it's the app entry point).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { getISOWeekKey } = require('../weekKey.js');

describe('getISOWeekKey', () => {
  test('two dates in the same Mon-Sun week produce the same key', () => {
    const monday = new Date('2026-08-17T09:00:00');
    const sunday = new Date('2026-08-23T21:00:00');
    assert.equal(getISOWeekKey(monday), getISOWeekKey(sunday));
  });

  test('a date in the following week produces a different key', () => {
    const thisWeek = new Date('2026-08-17T09:00:00');
    const nextWeek = new Date('2026-08-24T09:00:00');
    assert.notEqual(getISOWeekKey(thisWeek), getISOWeekKey(nextWeek));
  });

  test('correctly handles the year boundary (late Dec can belong to week 1 of the new year)', () => {
    // 2025-12-29 (Mon) through 2026-01-04 (Sun) is ISO week 1 of 2026.
    const dec29 = new Date('2025-12-29T00:00:00');
    const jan04 = new Date('2026-01-04T00:00:00');
    assert.equal(getISOWeekKey(dec29), getISOWeekKey(jan04));
    assert.equal(getISOWeekKey(dec29), '2026-W01');
  });

  test('a date just before the boundary still belongs to the prior year\'s last week', () => {
    const dec28 = new Date('2025-12-28T00:00:00'); // Sunday, ISO week 52 of 2025
    const dec29 = new Date('2025-12-29T00:00:00'); // Monday, ISO week 1 of 2026
    assert.notEqual(getISOWeekKey(dec28), getISOWeekKey(dec29));
  });
});
