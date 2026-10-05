import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkoutSession } from '../types/health';
import { liftHistory, plateBreakdown, PLATES_KG, PLATES_LB, suggestNext, weeklySets, volumeBand, trainedLifts, e1rmChangePct } from '../lib/strengthProgress';

const session = (at: number, id: string, sets: [number, number][]): WorkoutSession =>
  ({
    id: `w${at}`, type: 'Strength', timestamp: '', startedAt: at, durationMinutes: 45, avgHeartRate: 120, caloriesBurned: 200,
    exercises: [{ exerciseId: id, name: id, sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, done: true })) }],
  }) as WorkoutSession;

const day = 86_400_000;
const t0 = Date.parse('2026-09-01T09:00:00');

test('weight goes up once every set reaches the top of the range', () => {
  const h = liftHistory([session(t0, 'bench-press', [[60, 8], [60, 8], [60, 8]])], 'bench-press');
  const s = suggestNext(h, 'bench-press', 'metric')!;
  assert.equal(s.kind, 'weight');
  assert.equal(s.weightKg, 62.5);
  assert.equal(s.reps, 5);
});

test('below the top of the range it asks for one more rep at the same weight', () => {
  const h = liftHistory([session(t0, 'bench-press', [[60, 6], [60, 6], [60, 5]])], 'bench-press');
  const s = suggestNext(h, 'bench-press', 'metric')!;
  assert.equal(s.kind, 'repeat');
  assert.equal(s.weightKg, 60);
  assert.equal(s.reps, 6);
});

test('three flat sessions suggest a lighter restart', () => {
  const ws = [0, 1, 2].map((i) => session(t0 + i * 3 * day, 'bench-press', [[80, 5], [80, 5], [80, 4]]));
  const s = suggestNext(liftHistory(ws, 'bench-press'), 'bench-press', 'metric')!;
  assert.equal(s.kind, 'deload');
  assert.ok(s.weightKg < 80 && s.weightKg >= 70);
});

test('bodyweight work adds reps, and no history gives nothing', () => {
  const h = liftHistory([session(t0, 'pull-up', [[0, 6], [0, 5]])], 'pull-up');
  assert.equal(suggestNext(h, 'pull-up', 'metric')?.reps, 6);
  assert.equal(suggestNext([], 'bench-press', 'metric'), null);
});

test('imperial uses 5 lb jumps', () => {
  const h = liftHistory([session(t0, 'bench-press', [[45.359237, 8], [45.359237, 8]])], 'bench-press'); // 100 lb
  const s = suggestNext(h, 'bench-press', 'imperial')!;
  assert.equal(Math.round(s.weightKg / 0.45359237), 105);
});

test('history, trend and lift list', () => {
  const ws = [0, 1, 2, 3].map((i) => session(t0 + i * 3 * day, 'ohp', [[40 + i * 2.5, 8]]));
  const h = liftHistory(ws, 'ohp');
  assert.equal(h.length, 4);
  assert.ok((e1rmChangePct(h) ?? 0) > 10);
  assert.equal(trainedLifts(ws)[0].exerciseId, 'ohp');
});

test('weekly sets count done sets by muscle group per Monday week', () => {
  const ws = [session(Date.parse('2026-10-05T09:00:00'), 'bench-press', [[60, 8], [60, 8], [60, 8]]), session(Date.parse('2026-10-07T09:00:00'), 'bench-press', [[60, 8]])];
  const weeks = weeklySets(ws, '2026-10-08', 3);
  assert.equal(weeks.length, 3);
  assert.equal(weeks[2].week, '2026-10-05');
  assert.equal(weeks[2].sets.Chest, 4);
  assert.equal(weeks[1].sets.Chest, 0);
  assert.equal(volumeBand(4), 'low');
  assert.equal(volumeBand(12), 'good');
  assert.equal(volumeBand(25), 'high');
});

test('plate calculator', () => {
  const a = plateBreakdown(100, 20, PLATES_KG);
  assert.deepEqual(a.perSide, [25, 15]);
  assert.equal(a.short, 0);
  const b = plateBreakdown(225, 45, PLATES_LB);
  assert.deepEqual(b.perSide, [45, 45]);
  const c = plateBreakdown(61, 20, PLATES_KG); // 20.5 per side: 20 + 0.5
  assert.equal(c.loaded, 61);
  const d = plateBreakdown(21, 20, PLATES_KG); // 0.5 per side
  assert.deepEqual(d.perSide, [0.5]);
  const e = plateBreakdown(20.7, 20, PLATES_KG);
  assert.ok(e.short > 0);
});
