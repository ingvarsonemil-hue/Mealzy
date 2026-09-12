import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSignInErrorMessage } from '../src/lib/sign-in.ts';

test('a local submit error takes priority over the AuthProvider error', () => {
  assert.equal(
    resolveSignInErrorMessage('Email or password is incorrect.', { message: 'Could not reach Mealzy.' }),
    'Email or password is incorrect.',
  );
});

test('falls back to the AuthProvider error message when there is no local error', () => {
  assert.equal(resolveSignInErrorMessage(null, { message: 'Could not reach Mealzy.' }), 'Could not reach Mealzy.');
});

test('is null when neither a local nor an AuthProvider error is present', () => {
  assert.equal(resolveSignInErrorMessage(null, null), null);
});
