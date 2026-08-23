'use strict';

// Regression tests for public/js/consent.js's mealzyTrack/mealzyTrackReliable —
// the single transport grocery_list_viewed and grocery_item_checked (and every
// other client analytics call) go through. Runs the REAL source file in a
// sandboxed VM context, same seam as the grocery activation tracking tests.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'consent.js'), 'utf8');

function makeLocalStorage(initial) {
  const store = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

// Permissive stand-in for a DOM element — the "consent unset" path builds and
// wires up the real cookie banner, which these tests don't assert on; only
// that it doesn't crash and that it doesn't itself trigger any tracking call.
function makeEl() {
  return {
    style: {},
    classList: { add() {}, remove() {} },
    addEventListener() {},
    setAttribute() {},
    appendChild() {},
    innerHTML: '',
  };
}

function makeSandbox(consentValue) {
  const calls = [];
  const sandbox = {
    localStorage: makeLocalStorage(consentValue !== null ? { mealzy_consent: consentValue } : {}),
    fetch: (...args) => { calls.push({ name: 'fetch', args }); return Promise.resolve({ ok: true }); },
    navigator: {}, // no sendBeacon -> mealzyTrackReliable falls back to fetch
    document: {
      readyState: 'complete',
      addEventListener() {},
      createElement: () => makeEl(),
      head: { appendChild() {} },
      body: { appendChild() {} },
      getElementById: () => makeEl(),
    },
    requestAnimationFrame: (fn) => fn(),
    window: undefined,
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'consent.js' });
  return { sandbox, calls };
}

describe('mealzyTrack — consent gate', () => {
  test('G: consent declined -> tracking call never reaches the network', () => {
    const { sandbox, calls } = makeSandbox('declined');
    sandbox.mealzyTrack('grocery_list_viewed', {});
    assert.equal(calls.length, 0);
  });

  test('G2: consent never decided (unset) -> tracking call never reaches the network', () => {
    const { sandbox, calls } = makeSandbox(null);
    sandbox.mealzyTrack('grocery_list_viewed', {});
    assert.equal(calls.length, 0);
  });

  test('H: consent accepted -> the event reaches /api/track with the given event/data shape', () => {
    const { sandbox, calls } = makeSandbox('accepted');
    sandbox.mealzyTrack('grocery_item_checked', {});
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args[0], '/api/track');
    const body = JSON.parse(calls[0].args[1].body);
    assert.deepEqual(body, { event: 'grocery_item_checked', data: {} });
  });

  test('I: existing non-grocery events still work unchanged (e.g. upgrade_click)', () => {
    const { sandbox, calls } = makeSandbox('accepted');
    sandbox.mealzyTrack('upgrade_click', { source: 'grocery_banner' });
    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0].args[1].body);
    assert.deepEqual(body, { event: 'upgrade_click', data: { source: 'grocery_banner' } });
  });

  test('mealzyTrackReliable also respects the consent gate when declined', () => {
    const { sandbox, calls } = makeSandbox('declined');
    sandbox.mealzyTrackReliable('checkout_started', { tier: 'pro' });
    assert.equal(calls.length, 0);
  });

  test('mealzyTrackReliable sends when consent accepted (fetch fallback, no sendBeacon)', () => {
    const { sandbox, calls } = makeSandbox('accepted');
    sandbox.mealzyTrackReliable('checkout_started', { tier: 'pro' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args[0], '/api/track');
  });
});
