import test from 'node:test';
import assert from 'node:assert/strict';
import { FastingSession, WorkoutSession } from '../types/health';
import { PlanDay } from '../types/tracking';
import { addDays } from '../lib/dates';
import { afterFast, afterWorkout, computeRewards, longestFastStreak, newAwards, nextAward, weeklyGoalStreak } from '../lib/rewards';
import { allBests } from '../lib/bestRecords';
import { adaptWeek } from '../lib/planWeek';
import { BIKE_SPORTS, gearKindFor, gearOfKind, shoeMessage } from '../lib/shoes';
import { STRENGTH_TEMPLATES } from '../data/templates';
import { getExercise } from '../data/exercises';

const TODAY = '2026-10-07'; // a Wednesday
const noon = (key: string) => new Date(`${key}T12:00:00`).getTime();

const workout = (key: string, extra: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: `w-${key}-${Math.random().toString(36).slice(2, 6)}`,
  type: 'Running',
  timestamp: new Date(noon(key)).toISOString(),
  startedAt: noon(key),
  durationMinutes: 30,
  avgHeartRate: 140,
  caloriesBurned: 300,
  ...extra,
});

const fast = (key: string, hours: number, target = 16): FastingSession => ({
  id: `f-${key}`,
  startTimeIso: '',
  startTimestamp: noon(key) - hours * 3_600_000,
  endTimestamp: noon(key),
  targetDurationHours: target,
  isCompleted: true,
  actualHours: hours,
  fastProtocolName: '16:8',
});

const days = (n: number, from = TODAY) => Array.from({ length: n }, (_, i) => addDays(from, -i));

test('workout streak awards unlock at their step and not before', () => {
  const ws = days(7).map((k) => workout(k));
  const a = computeRewards({ workouts: ws, fasts: [], goals: { weeklyWorkouts: 3 }, today: TODAY });
  assert.equal(a.find((x) => x.id === 'wk-streak-7')?.unlocked, true);
  assert.equal(a.find((x) => x.id === 'wk-streak-14')?.unlocked, false);
  assert.ok((a.find((x) => x.id === 'wk-streak-14')?.progress ?? 0) > 0.4);
});

test('fasting streak counts days that met the goal, and a short fast does not extend it', () => {
  const fasts = [fast(TODAY, 17), fast(addDays(TODAY, -1), 17), fast(addDays(TODAY, -2), 17), fast(addDays(TODAY, -3), 9)];
  const a = computeRewards({ workouts: [], fasts, goals: { weeklyWorkouts: 3 }, today: TODAY });
  assert.equal(a.find((x) => x.id === 'fast-streak-3')?.unlocked, true);
  assert.equal(a.find((x) => x.id === 'fast-streak-7')?.unlocked, false);
  assert.equal(a.find((x) => x.id === 'fast-first')?.unlocked, true);
  assert.equal(longestFastStreak(fasts), 3);
});

test('fasting hour awards use the longest fast', () => {
  const a = computeRewards({ workouts: [], fasts: [fast(TODAY, 25, 24)], goals: { weeklyWorkouts: 3 }, today: TODAY });
  assert.equal(a.find((x) => x.id === 'fast-16')?.unlocked, true);
  assert.equal(a.find((x) => x.id === 'fast-24')?.unlocked, true);
});

test('weekly goal streak carries over an unfinished current week', () => {
  const lastWeek = [addDays(TODAY, -7), addDays(TODAY, -8), addDays(TODAY, -9)].map((k) => workout(k));
  assert.equal(weeklyGoalStreak(lastWeek, 3, noon(TODAY)) >= 1, true);
  assert.equal(weeklyGoalStreak([], 3, noon(TODAY)), 0);
});

test('newAwards returns only unseen unlocked awards, biggest first', () => {
  const ws = days(8).map((k) => workout(k));
  const a = computeRewards({ workouts: ws, fasts: [], goals: { weeklyWorkouts: 3 }, today: TODAY });
  const fresh = newAwards(a, ['wk-streak-3']);
  assert.ok(fresh.every((x) => x.unlocked && x.id !== 'wk-streak-3'));
  assert.ok(fresh.length >= 1);
  for (let i = 1; i < fresh.length; i++) assert.ok(fresh[i - 1].tier >= fresh[i].tier);
  assert.equal(newAwards(a, a.filter((x) => x.unlocked).map((x) => x.id)).length, 0);
  assert.ok(nextAward(a, 'fasting'));
});

test('encouragement names something true and never scolds', () => {
  const first = workout(TODAY);
  assert.equal(afterWorkout(first, [first], { weeklyWorkouts: 3 }, TODAY).title, 'First one done');

  const streak = days(7).map((k) => workout(k));
  assert.match(afterWorkout(streak[0], streak, { weeklyWorkouts: 5 }, TODAY).title, /7 days/);

  const comeback = [workout(addDays(TODAY, -20)), workout(TODAY)];
  const msg = afterWorkout(comeback[1], comeback, { weeklyWorkouts: 3 }, TODAY);
  assert.equal(msg.title, 'Welcome back');
  assert.doesNotMatch(msg.body.toLowerCase(), /miss|lazy|fail|behind/);
});

test('a lift personal record is celebrated', () => {
  const lift = (key: string, kg: number) =>
    workout(key, { type: 'Strength', exercises: [{ exerciseId: 'squat', name: 'Back Squat', sets: [{ reps: 5, weightKg: kg, done: true }] }] });
  const before = lift(addDays(TODAY, -3), 100);
  const now = lift(TODAY, 110);
  const msg = afterWorkout(now, [now, before], { weeklyWorkouts: 3 }, TODAY);
  assert.equal(msg.title, 'New personal record');
  assert.equal(msg.big, true);
});

test('a short fast is met with kindness, a long streak is celebrated', () => {
  const short = afterFast([fast(addDays(TODAY, -1), 16), fast(TODAY, 10)], TODAY);
  assert.equal(short?.title, 'Every hour counts');
  const run = days(7).map((k) => fast(k, 17));
  assert.match(afterFast(run, TODAY)?.title ?? '', /7-day fasting streak/);
  assert.equal(afterFast([], TODAY), null);
});

test('best records cover lifts, rides and runs in the chosen units', () => {
  const ride = workout(TODAY, { type: 'Cycling', distanceKm: 40, durationMinutes: 80, elevationGainM: 300, bestPower20W: 240 });
  const lift = workout(addDays(TODAY, -1), { type: 'Strength', exercises: [{ exerciseId: 'bench-press', name: 'Barbell Bench Press', sets: [{ reps: 5, weightKg: 80, done: true }, { reps: 8, weightKg: 70, done: true }, { reps: 3, weightKg: 100, done: false }] }] });
  const list = allBests([ride, lift], 'metric');
  const byId = new Map(list.map((r) => [r.id, r]));
  assert.equal(byId.get('ride-longest')?.value, '40 km');
  assert.equal(byId.get('ride-speed')?.value, '30.0 km/h');
  assert.equal(byId.get('ride-p20')?.value, '240 W');
  assert.equal(byId.get('lift-heavy-bench-press')?.value, '80 kg × 5');
  // The unfinished 100 kg set must not count.
  assert.notEqual(byId.get('lift-heavy-bench-press')?.value, '100 kg × 3');
  assert.match(allBests([ride], 'imperial').find((r) => r.id === 'ride-longest')?.value ?? '', /mi$/);
  assert.equal(allBests([], 'metric').length, 0);
});

const day = (d: PlanDay['day'], title: string, extra: Partial<PlanDay> = {}): PlanDay => ({ day: d, title, kind: 'cardio', targetMinutes: 40, ...extra });
const WEEK: PlanDay[] = [day(0, 'Easy run'), day(1, 'Intervals', { intervalId: '5x3' }), day(2, 'Rest', { kind: 'rest', targetMinutes: 0 }), day(3, 'Tempo', { targetMinutes: 70 }), day(4, 'Easy run'), day(5, 'Long run', { targetMinutes: 90 }), day(6, 'Rest', { kind: 'rest' })];

test('week advice eases hard days when load is high, and stays quiet when all is well', () => {
  const eased = adaptWeek({ days: WEEK, doneDays: [0, 1], todayIdx: 2, load: { id: 'overreaching', ratio: 1.7 }, readiness: [60] });
  assert.ok(eased);
  assert.equal(eased?.tone, 'warn');
  assert.ok((eased?.suggestedMinutes ?? 0) < (eased?.plannedMinutes ?? 0));
  assert.ok(eased?.days.some((d) => d.change === 'rest' || d.change === 'easy'));
  assert.ok(!eased?.days.some((d) => d.day < 2), 'days already past are not advised');

  const fine = adaptWeek({ days: WEEK, doneDays: [], todayIdx: 0, load: { id: 'productive', ratio: 1 }, readiness: [80] });
  assert.equal(fine?.tone, 'good');
  assert.ok(fine?.days.every((d) => d.change === 'keep'));

  assert.equal(adaptWeek({ days: WEEK, doneDays: [0, 1, 3, 4, 5], todayIdx: 6, load: null, readiness: [] }), null);
});

test('low readiness lightens the week even when load is normal; fresh and under-trained offers a little more', () => {
  const tired = adaptWeek({ days: WEEK, doneDays: [], todayIdx: 0, load: { id: 'productive', ratio: 1 }, readiness: [30, 35, 28] });
  assert.equal(tired?.tone, 'warn');
  const fresh = adaptWeek({ days: WEEK, doneDays: [], todayIdx: 0, load: { id: 'detraining', ratio: 0.6 }, readiness: [85, 90] });
  assert.equal(fresh?.tone, 'info');
});

test('gear kinds: shoes for foot sports, bikes for riding, older gear counts as shoes', () => {
  assert.equal(gearKindFor('Running'), 'shoe');
  assert.equal(gearKindFor('Cycling'), 'bike');
  assert.equal(gearKindFor('Yoga'), null);
  assert.ok(BIKE_SPORTS.has('IndoorCycling'));
  const gear = [
    { id: 'a', name: 'Old shoes', startKm: 0, retireKm: 800, retired: false, addedAt: 0 },
    { id: 'b', name: 'Road bike', kind: 'bike' as const, startKm: 0, retireKm: 1500, retired: false, addedAt: 0 },
  ];
  assert.deepEqual(gearOfKind(gear, 'shoe').map((g) => g.id), ['a']);
  assert.deepEqual(gearOfKind(gear, 'bike').map((g) => g.id), ['b']);
  assert.match(shoeMessage('replace', 'bike'), /Service/);
  assert.match(shoeMessage('replace'), /replace/);
});

test('every strength template only uses exercises that exist', () => {
  assert.ok(STRENGTH_TEMPLATES.length >= 8);
  for (const t of STRENGTH_TEMPLATES) {
    assert.ok(t.exerciseIds.length >= 4, t.name);
    assert.ok(t.exerciseIds.every((id) => !!getExercise(id)), t.name);
  }
});
