import test from 'node:test';
import assert from 'node:assert/strict';
import { hcWorkoutToSession, sourceLabel, workoutTypeFromHc } from '../lib/hcWorkouts';
import { mergeImportedWorkouts } from '../lib/importers/merge';
import { DEFAULT_PROFILE } from '../data/defaults';
import { HcWorkout } from '../lib/native';

const start = Date.parse('2026-10-03T07:00:00');
const base: HcWorkout = { id: 'abc', type: 56, title: 'Morning run', notes: '', start, end: start + 32 * 60_000, source: 'com.fitbit.FitbitMobile', distanceM: 5200, totalKcal: 410, activeKcal: 350, hrAvg: 152, hrMax: 178 };

test('a Google Health run becomes a running workout with its numbers', () => {
  const w = hcWorkoutToSession(base, DEFAULT_PROFILE)!;
  assert.equal(w.id, 'hc-abc');
  assert.equal(w.type, 'Running');
  assert.equal(w.durationMinutes, 32);
  assert.equal(w.distanceKm, 5.2);
  assert.equal(w.caloriesBurned, 410);
  assert.equal(w.avgHeartRate, 152);
  assert.equal(w.maxHeartRate, 178);
  assert.equal(w.importedFrom, 'Google Health');
  assert.match(w.notes ?? '', /Morning run \(from Google Health\)/);
  assert.ok((w.cardioLoadPoints ?? 0) > 0);
});

test('types map, unknown ones become a general workout, and short or broken ones are refused', () => {
  assert.equal(workoutTypeFromHc(79), 'Walking');
  assert.equal(workoutTypeFromHc(70), 'Strength');
  assert.equal(workoutTypeFromHc(9999), 'Calisthenics');
  assert.equal(hcWorkoutToSession({ ...base, end: base.start + 30_000 }, DEFAULT_PROFILE), null);
  assert.equal(hcWorkoutToSession({ ...base, id: '' }, DEFAULT_PROFILE), null);
});

test('missing numbers fall back sensibly', () => {
  const w = hcWorkoutToSession({ ...base, distanceM: 0, totalKcal: 0, activeKcal: 120, hrAvg: 0, hrMax: 0 }, DEFAULT_PROFILE)!;
  assert.equal(w.distanceKm, undefined);
  assert.equal(w.caloriesBurned, 120);
  assert.equal(w.avgHeartRate, DEFAULT_PROFILE.restingHr);
  assert.equal(w.cardioLoadPoints, undefined);
});

test('heart-rate samples give a series and the average when the summary is missing', () => {
  const hr: [number, number][] = Array.from({ length: 200 }, (_, i) => [start + i * 5000, 140 + (i % 10)]);
  const w = hcWorkoutToSession({ ...base, hrAvg: 0, hrMax: 0, hr }, DEFAULT_PROFILE)!;
  assert.ok(w.hrSeries && w.hrSeries.length > 5);
  assert.ok(w.avgHeartRate >= 140 && w.avgHeartRate <= 150);
});

test('a copy of a run the app already has is not added twice', () => {
  const mine = { ...hcWorkoutToSession(base, DEFAULT_PROFILE)!, id: 'w-123', distanceKm: 5.25, startedAt: start + 60_000 };
  const incoming = hcWorkoutToSession(base, DEFAULT_PROFILE)!;
  const r = mergeImportedWorkouts([mine], [incoming]);
  assert.equal(r.added.length, 0);
  assert.equal(r.duplicates, 1);
});

test('source names', () => {
  assert.equal(sourceLabel('com.fitbit.FitbitMobile'), 'Google Health');
  assert.equal(sourceLabel('com.strava'), 'Strava');
  assert.equal(sourceLabel('org.example.app'), 'org.example.app');
});
