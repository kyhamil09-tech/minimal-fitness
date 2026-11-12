import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkoutSession } from '../types/health';
import { badges, dayKey, dayStreak, monthGrid, muscleVolume, recordCount, strengthScore, weeklyStreak, workoutsByDay } from '../lib/liftStats';

const NOW = new Date(2026, 9, 14, 12).getTime(); // Wed 14 Oct 2026
const DAY = 86400000;
const w = (id: string, at: number, weightKg = 100, reps = 5, exerciseId = 'squat'): WorkoutSession =>
  ({ id, type: 'Strength', timestamp: '', startedAt: at, durationMinutes: 40, avgHeartRate: 100, caloriesBurned: 100, isManualEntry: false, exercises: [{ exerciseId, name: exerciseId, sets: [{ reps, weightKg, done: true }] }] }) as WorkoutSession;

test('calendar marks the days with workouts and pads to whole weeks', () => {
  const by = workoutsByDay([w('a', NOW), w('b', NOW - DAY)]);
  const grid = monthGrid(2026, 9, by);
  assert.ok(grid.every((r) => r.length === 7));
  assert.equal(grid.flat().find((c) => c.key === dayKey(NOW))!.count, 1);
  assert.equal(grid.flat().filter((c) => c.inMonth).length, 31);
});

test('weekly streak counts weeks with two workouts, and a week in progress does not break it', () => {
  const list = [w('1', NOW - 7 * DAY), w('2', NOW - 8 * DAY), w('3', NOW - 14 * DAY), w('4', NOW - 15 * DAY), w('5', NOW)];
  const s = weeklyStreak(list, NOW, 2);
  assert.equal(s.current, 2);
  assert.equal(s.best, 2);
  assert.equal(weeklyStreak([], NOW).current, 0);
});

test('day streak', () => {
  const by = workoutsByDay([w('1', NOW), w('2', NOW - DAY), w('3', NOW - 3 * DAY)]);
  assert.equal(dayStreak(by, NOW), 2);
});

test('records are counted when a best is beaten, not on the first time', () => {
  const list = [w('1', NOW - 20 * DAY, 100, 5), w('2', NOW - 10 * DAY, 100, 5), w('3', NOW, 110, 5)];
  assert.equal(recordCount(list), 1);
});

test('strength total adds the best of each big lift', () => {
  const s = strengthScore([w('1', NOW, 100, 1, 'squat'), w('2', NOW, 80, 1, 'bench-press')]);
  assert.equal(Math.round(s.totalKg), 180);
  assert.equal(s.done, 2);
});

test('muscle volume only counts the window', () => {
  const v = muscleVolume([w('1', NOW, 100, 5), w('2', NOW - 40 * DAY, 100, 5)], NOW, 30);
  assert.equal(v.Legs, 500);
});

test('badges start unearned and the first one is earned by a workout', () => {
  assert.equal(badges([], NOW).every((b) => !b.earned), true);
  assert.equal(badges([w('1', NOW)], NOW).find((b) => b.id === 'first')!.earned, true);
});

test('this week\'s volume and the "days ago" wording', async () => {
  const { weekVolumeKg, daysAgoText } = await import('../lib/liftStats');
  assert.equal(weekVolumeKg([w('1', NOW, 100, 5), w('2', NOW - 10 * DAY, 100, 5)], NOW), 500);
  assert.equal(daysAgoText(NOW, NOW), 'Today');
  assert.equal(daysAgoText(NOW - DAY, NOW), 'Yesterday');
  assert.equal(daysAgoText(NOW - 5 * DAY, NOW), '5 days ago');
  assert.equal(daysAgoText(NOW - 21 * DAY, NOW), '3 weeks ago');
});

test('record events list each beaten best, newest first, with what it beat', async () => {
  const { recordEvents } = await import('../lib/liftStats');
  const list = [w('1', NOW - 20 * DAY, 100, 5), w('2', NOW - 10 * DAY, 100, 5), w('3', NOW - 5 * DAY, 110, 5), w('4', NOW, 120, 5)];
  const ev = recordEvents(list);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].weightKg, 120);
  assert.equal(ev[1].weightKg, 110);
  assert.ok(Math.abs(ev[0].previousKg - ev[1].e1rmKg) < 0.01);
});
