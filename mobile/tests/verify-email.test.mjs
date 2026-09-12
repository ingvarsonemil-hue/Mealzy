import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveVerifyEmailOutcome } from '../src/lib/verify-email.ts';

test('a successful check that confirms verification routes to verified', () => {
  assert.deepEqual(resolveVerifyEmailOutcome(true, true), { status: 'verified' });
});

test('a successful check that finds the account still unverified shows the not-yet-verified notice', () => {
  const outcome = resolveVerifyEmailOutcome(true, false);
  assert.equal(outcome.status, 'not-yet-verified');
  assert.match(outcome.notice, /Still not verified/);
});

test('a failed check shows a distinct check-failed error, not the not-yet-verified notice', () => {
  const outcome = resolveVerifyEmailOutcome(false, false);
  assert.equal(outcome.status, 'check-failed');
  assert.match(outcome.error, /couldn't check your verification status/);
});

test('a failed check reports check-failed even if the stale snapshot says verified', () => {
  const outcome = resolveVerifyEmailOutcome(false, true);
  assert.equal(outcome.status, 'check-failed');
});
