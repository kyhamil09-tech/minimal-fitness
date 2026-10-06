import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPRESSED_FIELD, decodeWorkout, decodeWorkouts, encodeWorkout, encodeWorkouts } from '../lib/storageCodec';
import type { WorkoutSession } from '../types/health';

// A realistic hour of running: a point every 2 seconds with GPS-like noise.
const bigRun = (id = 'r1', points = 1800): WorkoutSession => {
  const T0 = Date.UTC(2026, 9, 5, 7, 0, 0);
  const track = Array.from({ length: points }, (_, i) => ({
    t: T0 + i * 2000,
    lat: 50 + i * 0.00002 + Math.sin(i / 7) * 0.00001,
    lng: 10 + i * 0.00003 + Math.cos(i / 9) * 0.00001,
    alt: 120 + Math.sin(i / 40) * 5,
    d: Number((i * 0.0055).toFixed(4)),
  }));
  const hrSeries = Array.from({ length: points / 2 }, (_, i) => [T0 + i * 4000, 140 + Math.round(Math.sin(i / 20) * 8)] as [number, number]);
  return { id, type: 'Running', timestamp: '', startedAt: T0, durationMinutes: 60, avgHeartRate: 145, caloriesBurned: 600, distanceKm: 9.9, gpsTracked: true, track, hrSeries, route: [[50, 10]] } as WorkoutSession;
};

test('a big workout survives a round trip exactly', () => {
  const w = bigRun();
  const stored = JSON.parse(JSON.stringify(encodeWorkout(w)));
  assert.equal(typeof stored[COMPRESSED_FIELD], 'string');
  assert.equal(stored.track, undefined);
  assert.equal(stored.hrSeries, undefined);
  assert.deepEqual(decodeWorkout(stored), w);
});

test('squeezing makes the stored text at least half as small (lossless, so GPS noise limits it to about 2.5x)', () => {
  const w = bigRun();
  const plain = JSON.stringify(w).length;
  const packed = JSON.stringify(encodeWorkout(w)).length;
  assert.ok(packed * 2 < plain, `plain ${plain} chars, packed ${packed} chars`);
});

test('small and plain workouts are left alone', () => {
  const small = { id: 's', type: 'Running', timestamp: '', durationMinutes: 5, avgHeartRate: 0, caloriesBurned: 0, track: [{ t: 1, lat: 1, lng: 1, d: 0 }] } as WorkoutSession;
  assert.equal(encodeWorkout(small), small);
  const plain = bigRun('p', 10);
  assert.equal(encodeWorkout(plain), plain);
});

test('a workout written before this existed is read as it is', () => {
  const old = JSON.parse(JSON.stringify(bigRun('old')));
  assert.deepEqual(decodeWorkout(old), bigRun('old'));
});

test('a squeezed workout is not squeezed twice, and the same object is only squeezed once', () => {
  const w = bigRun();
  const once = encodeWorkout(w);
  assert.equal(encodeWorkout(once), once);
  assert.equal(encodeWorkout(w), once);
});

test('a damaged squeezed field loses only the heavy data, not the workout', () => {
  const stored = { id: 'x', type: 'Running', timestamp: '', durationMinutes: 30, avgHeartRate: 120, caloriesBurned: 300, [COMPRESSED_FIELD]: 'not-valid!!' };
  const out = decodeWorkout(stored);
  assert.equal(out.id, 'x');
  assert.equal(out.durationMinutes, 30);
  assert.equal(out.track, undefined);
  assert.equal((out as unknown as Record<string, unknown>)[COMPRESSED_FIELD], undefined);
});

test('lists encode and decode together, and anything that is not a list decodes to empty', () => {
  const list = [bigRun('a'), bigRun('b', 100)];
  const back = decodeWorkouts(JSON.parse(JSON.stringify(encodeWorkouts(list))));
  assert.deepEqual(back, list);
  assert.deepEqual(decodeWorkouts(null), []);
  assert.deepEqual(decodeWorkouts({}), []);
});

test('the desktop viewer reads squeezed workouts from a backup, and plain ones too', async () => {
  const { buildModel } = await import('../../viewer/model');
  const run = bigRun('v1');
  const old = bigRun('v2', 300);
  const backup = {
    app: 'ky-fitness' as const,
    version: 1 as const,
    exportedAt: '2026-10-05T00:00:00Z',
    data: { kyfit_workouts: JSON.stringify([...encodeWorkouts([run]), old]) },
  };
  const m = buildModel(backup, new Date('2026-10-06T12:00:00'));
  assert.equal(m.workouts.length, 2);
  assert.equal(m.workouts.find((w) => w.id === 'v1')!.track!.length, run.track!.length);
  assert.equal(m.workouts.find((w) => w.id === 'v2')!.track!.length, old.track!.length);
});
