import test from 'node:test';
import assert from 'node:assert/strict';
import { checkInDue, hasMoved } from '../lib/stillCheck';

test('GPS drift is not movement, a few steps are', () => {
  assert.equal(hasMoved(1, 1.003), false);
  assert.equal(hasMoved(1, 1.012), true);
  assert.equal(hasMoved(1, 0.9), false);
});

test('the check-in is due after the chosen minutes without movement', () => {
  const t = 1_000_000;
  assert.equal(checkInDue(t, t + 4 * 60_000, 5), false);
  assert.equal(checkInDue(t, t + 5 * 60_000, 5), true);
});
