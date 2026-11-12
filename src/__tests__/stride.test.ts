import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceFromSteps, heightModel, learnStepModel, nextCalibration, stepLengthAt, stepSample, workoutStepLength } from '../lib/stride';
import { WorkoutSession } from '../types/health';

// 30 min at a given speed with a given cadence, GPS tracked
const run = (id: string, speedKmh: number, spm: number): WorkoutSession =>
  ({ id, type: 'Running', timestamp: '', startedAt: 1, durationMinutes: 30, durationSec: 1800, distanceKm: speedKmh / 2, gpsTracked: true, cadenceAvg: spm, cadenceKind: 'steps', avgHeartRate: 150, caloriesBurned: 300 }) as WorkoutSession;

test('a step length comes from distance and the steps the phone counted', () => {
  const w = run('a', 10, 170); // 5 km in 30 min at 170 spm = 5100 steps
  const s = stepSample(w)!;
  assert.ok(Math.abs(s.stepM - 5000 / 5100) < 0.001);
  assert.equal(workoutStepLength(w), 0.98);
  assert.equal(stepSample({ ...w, gpsTracked: false }), null);
  assert.equal(stepSample({ ...w, cadenceKind: 'rpm' }), null);
  assert.equal(stepSample({ ...w, distanceKm: 0.3 }), null);
});

test('height alone gives a believable step length that grows with speed', () => {
  const m = heightModel(175);
  const walk = stepLengthAt(m, 5);
  const jog = stepLengthAt(m, 10);
  const fast = stepLengthAt(m, 14);
  assert.ok(walk > 0.65 && walk < 0.8, String(walk));
  assert.ok(jog > walk && fast > jog);
  assert.ok(fast < 1.3);
});

test('the model learns from your outdoor runs', () => {
  const runs = [run('1', 8, 160), run('2', 9, 162), run('3', 10, 165), run('4', 11, 168), run('5', 12, 172), run('6', 13, 176)];
  const m = learnStepModel(runs, 175);
  assert.equal(m.samples, 6);
  // 12 km/h at 172 spm is 1.16 m a step
  assert.ok(Math.abs(stepLengthAt(m, 12) - 1.163) < 0.03, String(stepLengthAt(m, 12)));
  assert.equal(learnStepModel([run('1', 8, 160)], 175).samples, 0); // too few: height only
});

test('treadmill distance from steps, and the correction from the display', () => {
  const m = heightModel(175);
  // 30 minutes at 165 steps a minute = 4950 steps
  const km = distanceFromSteps(4950, 1800, m);
  assert.ok(km > 4 && km < 6.5, String(km));
  assert.equal(distanceFromSteps(0, 1800, m), 0);
  // the treadmill showed 10 % less: the correction moves toward 0.9 and the next estimate is lower
  const cal = nextCalibration(1, km, km * 0.9);
  assert.ok(cal < 1 && cal > 0.9);
  assert.ok(distanceFromSteps(4950, 1800, m, cal) < km);
  assert.equal(nextCalibration(1, 0, 5), 1);
  assert.ok(nextCalibration(1, 5, 50) <= 1.6);
});
