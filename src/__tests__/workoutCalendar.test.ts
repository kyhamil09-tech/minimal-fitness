import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonth, plannedDayFor } from '../lib/workoutCalendar';
import { setWeekStartsOnSunday } from '../lib/dates';
import type { WorkoutSession } from '../types/health';
import type { WorkoutPlan } from '../types/tracking';

const at = (date: string, hour = 7) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime();
const w = (id: string, date: string, minutes = 30, km?: number): WorkoutSession =>
  ({ id, type: 'Running', timestamp: '', startedAt: at(date), durationMinutes: minutes, distanceKm: km, avgHeartRate: 0, caloriesBurned: 0 }) as WorkoutSession;

// A two-week plan: Monday strength, Wednesday cardio, Friday rest.
const plan: WorkoutPlan = {
  id: 'p',
  name: 'Test',
  description: '',
  weeks: 2,
  level: 'Beginner',
  days: [
    { day: 0, title: 'Lift', kind: 'strength' },
    { day: 2, title: 'Run', kind: 'cardio' },
    { day: 4, title: 'Rest', kind: 'rest' },
  ],
};
// Monday 2026-10-05 is the first day of week one.
const startedAt = at('2026-10-05');

test('the grid is whole weeks that start on Monday and cover the month', () => {
  setWeekStartsOnSunday(false);
  const m = buildMonth(2026, 9, [], null, '2026-10-05'); // October 2026
  assert.equal(m.cells.length % 7, 0);
  assert.equal(m.cells[0].date, '2026-09-28'); // the Monday on or before Oct 1 (a Thursday)
  assert.equal(m.cells[m.cells.length - 1].date, '2026-11-01');
  assert.equal(m.cells.filter((c) => c.inMonth).length, 31);
});

test('the grid can start on Sunday', () => {
  setWeekStartsOnSunday(true);
  const m = buildMonth(2026, 9, [], null, '2026-10-05');
  assert.equal(m.cells[0].date, '2026-09-27');
  setWeekStartsOnSunday(false);
});

test('workouts land on their day with a summary', () => {
  const m = buildMonth(2026, 9, [w('a', '2026-10-02', 30, 5), w('b', '2026-10-02', 20), w('c', '2026-10-10', 45, 8)], null, '2026-10-20');
  const day = m.cells.find((c) => c.date === '2026-10-02')!;
  assert.equal(day.workouts.length, 2);
  assert.deepEqual(m.summary, { workouts: 3, activeDays: 2, minutes: 95, distanceKm: 13, plannedPast: 0, plannedDone: 0 });
});

test('planned days follow the plan week by week and skip rest days', () => {
  assert.equal(plannedDayFor(plan, startedAt, '2026-10-05')?.title, 'Lift'); // Monday, week 1
  assert.equal(plannedDayFor(plan, startedAt, '2026-10-07')?.title, 'Run'); // Wednesday
  assert.equal(plannedDayFor(plan, startedAt, '2026-10-09'), undefined); // Friday is rest
  assert.equal(plannedDayFor(plan, startedAt, '2026-10-12')?.title, 'Lift'); // week 2
  assert.equal(plannedDayFor(plan, startedAt, '2026-10-19'), undefined); // week 3 is past the plan
  assert.equal(plannedDayFor(plan, startedAt, '2026-10-04'), undefined); // before it started
  assert.equal(plannedDayFor(undefined, startedAt, '2026-10-05'), undefined);
});

test('a planned day that passed with no workout is missed, and one with a workout is not', () => {
  const m = buildMonth(2026, 9, [w('a', '2026-10-05')], { plan, startedAt }, '2026-10-08');
  const get = (d: string) => m.cells.find((c) => c.date === d)!;
  assert.equal(get('2026-10-05').missed, false); // planned, done
  assert.equal(get('2026-10-07').missed, true); // planned, nothing recorded
  assert.equal(get('2026-10-12').missed, false); // still ahead
  assert.equal(get('2026-10-12').isFuture, true);
  assert.equal(get('2026-10-08').isToday, true);
  assert.equal(m.summary.plannedPast, 2);
  assert.equal(m.summary.plannedDone, 1);
});

test("today's planned day is not counted as missed until the day is over", () => {
  const m = buildMonth(2026, 9, [], { plan, startedAt }, '2026-10-07');
  assert.equal(m.cells.find((c) => c.date === '2026-10-07')!.missed, false);
});
