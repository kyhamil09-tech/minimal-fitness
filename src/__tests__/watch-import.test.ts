import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeWatchWorkouts, watchWorkoutToSession } from '../lib/watchImport';
import { DEFAULT_PROFILE } from '../data/defaults';

const START = 1_700_000_000_000;
const payload = () => {
  const track: (number | null)[][] = [];
  const hr: number[][] = [];
  for (let i = 0; i <= 60; i++) {
    track.push([START + i * 5000, 52 + i * 0.0003, 4, i % 7 === 0 ? null : 3 + i * 0.1, i * 0.033]);
    hr.push([START + i * 5000, 140 + (i % 10)]);
  }
  return { id: '1700000000000', type: 'Running', startedAt: START, durationSec: 300, distanceM: 2000, elevGainM: 12.4, avgHr: 145, maxHr: 150, kcal: 180, track, hr, laps: [[1, START + 150_000, 1, 150]] };
};

test('a watch workout becomes a saved workout with route, heart rate and laps', () => {
  const w = watchWorkoutToSession(payload(), DEFAULT_PROFILE)!;
  assert.equal(w.id, 'w-watch-1700000000000');
  assert.equal(w.type, 'Running');
  assert.equal(w.distanceKm, 2);
  assert.equal(w.gpsTracked, true);
  assert.equal(w.track!.length, 61);
  assert.equal(w.track![0].alt, undefined); // missing altitude stays missing
  assert.equal(w.durationMinutes, 5);
  assert.equal(w.avgHeartRate, 145);
  assert.equal(w.maxHeartRate, 150);
  assert.equal(w.caloriesBurned, 180);
  assert.equal(w.elevationGainM, 12);
  assert.equal(w.laps![0].splitSec, 150);
  assert.ok(w.hrSeries!.length > 5);
  assert.equal(w.hrFromSensor, true);
  assert.ok(w.cardioLoadPoints! > 0);
});

test('an indoor watch workout has no route and unknown types fall back safely', () => {
  const w = watchWorkoutToSession({ id: 'x', type: 'Treadmill', startedAt: START, durationSec: 1800, avgHr: 130, kcal: 250 }, DEFAULT_PROFILE)!;
  assert.equal(w.type, 'Treadmill');
  assert.equal(w.gpsTracked, false);
  assert.equal(w.track, undefined);
  const odd = watchWorkoutToSession({ id: 'y', type: 'Unicycling', startedAt: START, durationSec: 600 }, DEFAULT_PROFILE)!;
  assert.equal(odd.type, 'Calisthenics');
});

test('unusable payloads are rejected', () => {
  assert.equal(watchWorkoutToSession({ id: '', type: 'Running', startedAt: START, durationSec: 10 }, DEFAULT_PROFILE), null);
  assert.equal(watchWorkoutToSession({ id: 'z', type: 'Running', startedAt: START, durationSec: 0 }, DEFAULT_PROFILE), null);
});

test('merging never duplicates a workout that was already imported', () => {
  const w = watchWorkoutToSession(payload(), DEFAULT_PROFILE)!;
  const once = mergeWatchWorkouts([], [w]);
  assert.equal(once.length, 1);
  assert.equal(mergeWatchWorkouts(once, [w]).length, 1);
  assert.equal(mergeWatchWorkouts(once, [w]), once);
});