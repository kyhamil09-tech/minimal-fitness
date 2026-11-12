import test from 'node:test';
import assert from 'node:assert/strict';
import { setText } from '../lib/sets';

const show = (kg: number) => `${kg} kg`;

test('a set with a belt, with help, and with nothing extra read in plain words', () => {
  assert.equal(setText({ reps: 8, weightKg: 90, done: true, load: { mode: 'added', kg: 10 } }, show), 'BW +10 kg × 8');
  assert.equal(setText({ reps: 6, weightKg: 60, done: true, load: { mode: 'assisted', kg: 20 } }, show), 'BW −20 kg × 6');
  assert.equal(setText({ reps: 10, weightKg: 80, done: true, load: { mode: 'added', kg: 0 } }, show), 'bodyweight × 10');
  assert.equal(setText({ reps: 5, weightKg: 100, done: true }, show), '100 kg × 5');
});
