import test from 'node:test';
import assert from 'node:assert/strict';
import { generateToken } from './token';

test('generateToken returns 64 hex chars', () => {
  const a = generateToken();
  const b = generateToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.match(b, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});
