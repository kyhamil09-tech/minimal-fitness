import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Shoe, defaultShoe, shoeKm, shoeState } from '../lib/shoes';
import { WorkoutSession } from '../types/health';

const shoe = (over: Partial<Shoe> = {}): Shoe => ({ id: 's1', name: 'Pegasus', startKm: 50, retireKm: 800, retired: false, addedAt: 0, ...over });
const run = (id: string, km: number, shoeId?: string): WorkoutSession =>
  ({ id, type: 'Running', timestamp: '', durationMinutes: 30, distanceKm: km, avgHeartRate: 140, caloriesBurned: 300, shoeId }) as WorkoutSession;

test('mileage adds the starting distance and the runs logged in the shoe', () => {
  assert.equal(shoeKm(shoe(), [run('a', 10, 's1'), run('b', 5, 's1'), run('c', 20, 's2'), run('d', 7)]), 65);
});

test('state flips to worn at 85% and replace at 100%', () => {
  assert.equal(shoeState(600, 800), 'good');
  assert.equal(shoeState(680, 800), 'worn');
  assert.equal(shoeState(800, 800), 'replace');
});

test('default shoe prefers the saved active pair', () => {
  const a = shoe({ id: 'a' });
  const b = shoe({ id: 'b' });
  assert.equal(defaultShoe([a, b], 'b')?.id, 'b');
  assert.equal(defaultShoe([a, shoe({ id: 'b', retired: true })], 'b')?.id, 'a');
  assert.equal(defaultShoe([], null), null);
});
