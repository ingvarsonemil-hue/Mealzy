'use strict';

// Regression tests for analyticsIdentity.js — the pure helper POST /api/track
// (server.js) uses to attach a server-verified userId to authenticated
// analytics events and to strip any client-supplied userId, so grocery
// activation events (grocery_list_viewed / grocery_item_checked) can be
// joined to the same authenticated user as generate_plan / week_return.
//
// The session resolution itself (JWT decode + DB token_version check) lives
// in server.js's existing `optionalSession` middleware, already proven in
// production by /api/generate-meal — it is not re-implemented or re-tested
// here. This file tests only the new identity-attachment logic that sits
// between that middleware and db.logEvent().

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolveTrackedEventData } = require('../analyticsIdentity');

describe('resolveTrackedEventData', () => {
  test('A: a server-verified session userId is attached to the event data', () => {
    const result = resolveTrackedEventData({}, 'user-real-123');
    assert.deepEqual(result, { userId: 'user-real-123' });
  });

  test('B: no session (anonymous request) leaves data untouched, no userId key added', () => {
    const result = resolveTrackedEventData({ foo: 'bar' }, undefined);
    assert.deepEqual(result, { foo: 'bar' });
    assert.ok(!('userId' in result));
  });

  test('C: a client-supplied userId can never override or masquerade as the server identity', () => {
    // Authenticated request: client tries to claim a different user's id —
    // the server-verified id always wins.
    const spoofed = resolveTrackedEventData({ userId: 'someone-else' }, 'real-user-1');
    assert.equal(spoofed.userId, 'real-user-1');

    // Anonymous request: client tries to inject a userId with no session at
    // all — must be stripped, not silently trusted and stored.
    const anonSpoofed = resolveTrackedEventData({ userId: 'someone-else' }, undefined);
    assert.ok(!('userId' in anonSpoofed));
  });

  test('D: grocery_list_viewed\'s empty client payload resolves to just {userId} when authenticated', () => {
    const result = resolveTrackedEventData({}, 'user-42');
    assert.deepEqual(result, { userId: 'user-42' });
  });

  test('E: grocery_item_checked\'s empty client payload resolves to just {userId} when authenticated', () => {
    const result = resolveTrackedEventData({}, 'user-42');
    assert.deepEqual(result, { userId: 'user-42' });
  });

  test('F: no ingredient/item/plan data is ever introduced by the identity step itself', () => {
    const result = resolveTrackedEventData({}, 'user-42');
    assert.deepEqual(Object.keys(result), ['userId']);
  });

  test('J: malformed data (non-object) degrades to an empty object instead of throwing', () => {
    assert.deepEqual(resolveTrackedEventData(null, undefined), {});
    assert.deepEqual(resolveTrackedEventData(undefined, undefined), {});
    assert.deepEqual(resolveTrackedEventData('not an object', undefined), {});
    assert.deepEqual(resolveTrackedEventData(['array', 'data'], undefined), {});
    assert.deepEqual(resolveTrackedEventData(null, 'user-42'), { userId: 'user-42' });
  });

  test('existing non-identity fields on legitimate events pass through unchanged', () => {
    // e.g. upgrade_click's {source: 'grocery_banner'} shape must keep working.
    const result = resolveTrackedEventData({ source: 'grocery_banner' }, undefined);
    assert.deepEqual(result, { source: 'grocery_banner' });
  });

  test('does not mutate the caller\'s original data object', () => {
    const original = { userId: 'spoofed', keep: 'me' };
    resolveTrackedEventData(original, 'real-user');
    assert.deepEqual(original, { userId: 'spoofed', keep: 'me' });
  });
});
