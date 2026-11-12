import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWeight } from '../lib/fatFinger';

test('2250 where 225 is usual is flagged with 225 as the guess', () => {
  assert.deepEqual(checkWeight(2250, 5, 260, 'lb'), { suggest: 225 });
});

test('a normal progression is left alone', () => {
  assert.equal(checkWeight(230, 5, 260, 'lb'), null);
  assert.equal(checkWeight(100, 8, 110, 'kg'), null);
});

test('with no history only the impossible is flagged', () => {
  assert.equal(checkWeight(140, 5, 0, 'kg'), null);
  assert.deepEqual(checkWeight(1350, 5, 0, 'kg'), { suggest: 135 });
});

test('a flagged weight with no sensible fix offers none', () => {
  assert.deepEqual(checkWeight(1000, 1, 600, 'kg'), { suggest: null });
});
