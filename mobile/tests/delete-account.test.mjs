import test from 'node:test';
import assert from 'node:assert/strict';

import { DELETE_ACCOUNT_ENDPOINT, resolveDeleteAccountOutcome } from '../src/lib/delete-account.ts';

test('targets the mobile soft-delete endpoint, not the web hard-delete one', () => {
  assert.equal(DELETE_ACCOUNT_ENDPOINT, '/api/delete-account');
  assert.notEqual(DELETE_ACCOUNT_ENDPOINT, '/api/account');
});

test('a 200 resolves ok with no message', () => {
  assert.deepEqual(resolveDeleteAccountOutcome(200, { success: true }), { ok: true });
});

test('a 403 reauth_required surfaces the server message distinctly', () => {
  assert.deepEqual(
    resolveDeleteAccountOutcome(403, {
      error: 'reauth_required',
      message: 'For your security, please sign in again before deleting your account.',
    }),
    { ok: false, message: 'For your security, please sign in again before deleting your account.' },
  );
});

test('a 403 reauth_required falls back to a default message if the server omits one', () => {
  assert.deepEqual(resolveDeleteAccountOutcome(403, { error: 'reauth_required' }), {
    ok: false,
    message: 'For your security, please sign in again before deleting your account.',
  });
});

test('a 409 active_subscription surfaces the server message', () => {
  assert.deepEqual(
    resolveDeleteAccountOutcome(409, {
      error: 'active_subscription',
      message: 'Please cancel your Pro subscription before deleting your account.',
    }),
    { ok: false, message: 'Please cancel your Pro subscription before deleting your account.' },
  );
});

test('a 5xx is treated as a connection problem', () => {
  assert.deepEqual(resolveDeleteAccountOutcome(500, null), {
    ok: false,
    message: 'Could not reach Mealzy. Check your connection and try again.',
  });
});

test('an unexpected status falls back to a generic message', () => {
  assert.deepEqual(resolveDeleteAccountOutcome(418, null), {
    ok: false,
    message: 'Could not delete your account. Please try again.',
  });
});
