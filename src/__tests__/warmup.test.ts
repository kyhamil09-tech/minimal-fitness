import test from 'node:test';
import assert from 'node:assert/strict';
import { warmupSets } from '../lib/warmup';

test('100 kg warms up at 50, 70 and 90', () => {
  assert.deepEqual(warmupSets(100, 20, 'kg'), [
    { weight: 50, reps: 5 },
    { weight: 70, reps: 3 },
    { weight: 90, reps: 1 },
  ]);
});

test('225 lb rounds to 5 lb jumps', () => {
  assert.deepEqual(warmupSets(225, 45, 'lb').map((s) => s.weight), [115, 160, 205]);
});

test('light work gets the bar only once and nothing as heavy as the work', () => {
  const w = warmupSets(30, 20, 'kg');
  assert.ok(w.every((s) => s.weight >= 20 && s.weight < 30));
  assert.equal(new Set(w.map((s) => s.weight)).size, w.length);
  assert.deepEqual(warmupSets(20, 20, 'kg'), []);
});
