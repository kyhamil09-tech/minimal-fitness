import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bmi,
  bmiCategory,
  bmr,
  currentStreak,
  detectNewPRs,
  estimateCalories,
  estimateMaxHr,
  estimateOneRepMax,
  heartRateZone,
  longestStreak,
  personalRecords,
  tdee,
  trimp,
} from '../lib/calc';
import { WorkoutSession } from '../types/health';

const near = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} not within ${eps} of ${b}`);

const lift = (exerciseId: string, name: string, weightKg: number, reps: number, at = 1): WorkoutSession => ({
  id: `w-${exerciseId}-${weightKg}-${reps}-${at}`,
  type: 'Strength',
  timestamp: '',
  startedAt: at,
  durationMinutes: 45,
  avgHeartRate: 120,
  caloriesBurned: 200,
  exercises: [{ exerciseId, name, sets: [{ weightKg, reps, done: true }] }],
});

test('max heart rate uses Tanaka formula', () => {
  assert.equal(estimateMaxHr(30), 187);
  assert.equal(estimateMaxHr(50), 173);
});

test('heart rate zones follow % of max', () => {
  assert.equal(heartRateZone(100, 200), 1);
  assert.equal(heartRateZone(130, 200), 2);
  assert.equal(heartRateZone(150, 200), 3);
  assert.equal(heartRateZone(170, 200), 4);
  assert.equal(heartRateZone(190, 200), 5);
});

test('trimp is zero for no time or no reserve and grows with intensity', () => {
  assert.equal(trimp(0, 150, 190, 55), 0);
  assert.equal(trimp(30, 150, 55, 55), 0);
  assert.ok(trimp(30, 160, 190, 55) > trimp(30, 120, 190, 55));
});

test('calorie estimates scale with weight, time and activity', () => {
  assert.equal(estimateCalories('Running', 60, 70), Math.round(9.8 * 70));
  assert.ok(estimateCalories('Running', 30, 70) > estimateCalories('Walking', 30, 70));
});

test('BMR / TDEE (Mifflin-St Jeor)', () => {
  assert.equal(bmr({ weightKg: 80, heightCm: 180, age: 30, sex: 'male' }), 1780);
  assert.equal(bmr({ weightKg: 60, heightCm: 165, age: 30, sex: 'female' }), 1320);
  assert.equal(tdee({ weightKg: 80, heightCm: 180, age: 30, sex: 'male', activityLevel: 'moderate' }), 2759);
});

test('BMI and category', () => {
  assert.equal(bmi(70, 175).toFixed(1), '22.9');
  assert.equal(bmiCategory(17), 'Underweight');
  assert.equal(bmiCategory(22), 'Healthy range');
  assert.equal(bmiCategory(27), 'Overweight');
  assert.equal(bmiCategory(35), 'Obese range');
});

test('Epley one-rep max', () => {
  assert.equal(estimateOneRepMax(100, 1), 100);
  near(estimateOneRepMax(100, 10), 133.33);
  assert.equal(estimateOneRepMax(0, 10), 0);
  assert.equal(estimateOneRepMax(100, 0), 0);
});

test('personal records keep the best estimated 1RM per lift', () => {
  const records = personalRecords([lift('squat', 'Back Squat', 100, 5), lift('squat', 'Back Squat', 90, 12), lift('bench-press', 'Bench', 60, 5)]);
  // 100x5 -> 116.7, 90x12 -> 126.0
  assert.equal(records['squat'].reps, 12);
  assert.equal(Object.keys(records).length, 2);
});

test('PR detection ignores first-time lifts and weaker sets', () => {
  const prior = [lift('squat', 'Back Squat', 100, 5)];
  assert.deepEqual(detectNewPRs(prior, lift('squat', 'Back Squat', 100, 8).exercises!), ['Back Squat']);
  assert.deepEqual(detectNewPRs(prior, lift('squat', 'Back Squat', 80, 5).exercises!), []);
  assert.deepEqual(detectNewPRs(prior, lift('deadlift', 'Deadlift', 200, 5).exercises!), []);
});

test('unfinished sets never count towards PRs', () => {
  const prior = [lift('squat', 'Back Squat', 100, 5)];
  const logs = [{ exerciseId: 'squat', name: 'Back Squat', sets: [{ weightKg: 200, reps: 5, done: false }] }];
  assert.deepEqual(detectNewPRs(prior, logs), []);
});

test('current streak counts back from today or yesterday', () => {
  const today = '2026-10-03';
  assert.equal(currentStreak(new Set(), today), 0);
  assert.equal(currentStreak(new Set(['2026-10-03', '2026-10-02', '2026-10-01']), today), 3);
  assert.equal(currentStreak(new Set(['2026-10-02', '2026-10-01']), today), 2); // today not yet logged
  assert.equal(currentStreak(new Set(['2026-10-03', '2026-10-01']), today), 1); // gap breaks it
  assert.equal(currentStreak(new Set(['2026-09-20']), today), 0);
});

test('longest streak finds the best run', () => {
  const keys = new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10', '2026-10-11']);
  assert.equal(longestStreak(keys), 3);
  assert.equal(longestStreak(new Set()), 0);
});
