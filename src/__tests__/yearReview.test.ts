import test from 'node:test';
import assert from 'node:assert/strict';
import { yearReview, yearsWithData } from '../lib/yearReview';
import { FastingSession, WorkoutSession } from '../types/health';

const w = (id: string, iso: string, type: string, minutes: number, km?: number): WorkoutSession =>
  ({ id, type, timestamp: iso, startedAt: new Date(`${iso}T09:00:00`).getTime(), durationMinutes: minutes, caloriesBurned: minutes * 10, avgHeartRate: 140, distanceKm: km }) as WorkoutSession;

const workouts = [
  w('1', '2026-01-05', 'Running', 30, 5),
  w('2', '2026-01-06', 'Running', 40, 8),
  w('3', '2026-03-10', 'Cycling', 60, 25),
  w('4', '2026-03-11', 'Strength', 45),
  w('5', '2026-03-12', 'Running', 20, 3),
  w('6', '2025-12-31', 'Running', 30, 5),
];

test('years with data, newest first', () => {
  assert.deepEqual(yearsWithData(workouts), [2026, 2025]);
});

test('the year in numbers', () => {
  const r = yearReview(workouts, [], 2026)!;
  assert.equal(r.workouts, 5);
  assert.equal(r.minutes, 195);
  assert.equal(r.distanceKm, 41);
  assert.equal(r.activeDays, 5);
  assert.deepEqual(r.byMonth.slice(0, 4), [2, 0, 3, 0]);
  assert.deepEqual(r.bestMonth, { month: 2, count: 3 });
  assert.equal(r.topSports[0].type, 'Running');
  assert.equal(r.topSports[0].count, 3);
  assert.deepEqual(r.longest, { km: 25, type: 'Cycling', date: '2026-03-10' });
  assert.equal(r.longestStreak, 3); // 10, 11 and 12 March
  assert.equal(r.biggestWeek?.km, 28); // the week of 9 March: 25 + 3
});

test('fasts that ended in the year are counted, and an empty year is null', () => {
  const f = (end: string, hours: number): FastingSession => ({ id: end, startTimeIso: '', startTimestamp: 0, endTimestamp: Date.parse(end), targetDurationHours: 16, isCompleted: true, actualHours: hours, fastProtocolName: '16:8' }) as FastingSession;
  const r = yearReview(workouts, [f('2026-02-01T08:00:00', 16.5), f('2026-02-03T08:00:00', 20), f('2025-02-03T08:00:00', 30)], 2026)!;
  assert.deepEqual(r.fasts, { count: 2, longestHours: 20 });
  assert.equal(yearReview(workouts, [], 2024), null);
});
