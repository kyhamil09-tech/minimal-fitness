import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivePlan, SavedMeal } from '../types/tracking';
import { PlannedMeal } from '../lib/mealPlan';
import { CalEvent, TrackedEvent, atTime, diffEvents, mealEvents, workoutEvents } from '../lib/calendarSync';

const stamp = (date: string, hhmm: string) => atTime(date, hhmm);

test('a time on a day is local', () => {
  const d = new Date(atTime('2026-10-22', '07:30'));
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 9, 22, 7, 30]);
});

// A plan that is the same every week: Monday walk, Tuesday rest, Wednesday strength, the rest rest.
const plan = {
  id: 'p',
  name: 'Test plan',
  days: [
    { day: 0, title: 'Easy walk', kind: 'cardio', cardioType: 'Walking', targetMinutes: 30 },
    { day: 1, title: 'Rest', kind: 'rest' },
    { day: 2, title: 'Full body', kind: 'strength' },
    { day: 3, title: 'Rest', kind: 'rest' },
    { day: 4, title: 'Rest', kind: 'rest' },
    { day: 5, title: 'Stretch', kind: 'mobility' },
    { day: 6, title: 'Rest', kind: 'rest' },
  ],
};
const active = (startedAt: string): ActivePlan => ({ planId: 'p', startedAt: new Date(`${startedAt}T09:00:00`).getTime(), plan } as unknown as ActivePlan);

test('workouts: only the training days, at the chosen time, with the plan\'s length', () => {
  // 2026-10-19 is a Monday.
  const ev = workoutEvents(active('2026-10-19'), '07:00', 7, '2026-10-19');
  assert.deepEqual(ev.map((e) => e.title), ['Easy walk', 'Full body', 'Stretch']);
  assert.deepEqual(ev.map((e) => e.key), ['w:2026-10-19', 'w:2026-10-21', 'w:2026-10-24']);
  assert.equal(ev[0].start, stamp('2026-10-19', '07:00'));
  assert.equal(ev[0].end - ev[0].start, 30 * 60_000);
  assert.equal(ev[1].end - ev[1].start, 60 * 60_000);
  assert.equal(ev[2].end - ev[2].start, 20 * 60_000);
  assert.match(ev[0].description, /Test plan/);
});

test('workouts: nothing without a plan, and nothing before the plan started', () => {
  assert.deepEqual(workoutEvents(null, '07:00', 7, '2026-10-19'), []);
  assert.deepEqual(workoutEvents(active('2026-11-02'), '07:00', 7, '2026-10-19'), []);
});

test('workouts: a session moved to another day shows on the new day', () => {
  const a = { ...active('2026-10-19'), moves: [{ week: '2026-10-19', from: 2, to: 3 }] } as unknown as ActivePlan;
  const ev = workoutEvents(a, '07:00', 7, '2026-10-19');
  const titles = Object.fromEntries(ev.map((e) => [e.key, e.title]));
  assert.match(titles['w:2026-10-22'], /^Full body/);
  assert.equal(titles['w:2026-10-21'], undefined);
});

const meals: SavedMeal[] = [{ id: 's1', name: 'Oats and berries', items: [{ name: 'Oats', calories: 150, proteinG: 5, carbsG: 27, fatG: 3 }, { name: 'Blueberries', calories: 80, proteinG: 1, carbsG: 20, fatG: 0.5 }] }];
const planned: PlannedMeal[] = [
  { id: 'a', date: '2026-10-20', meal: 'Breakfast', savedMealId: 's1' },
  { id: 'b', date: '2026-10-20', meal: 'Dinner', savedMealId: 'gone' },
  { id: 'c', date: '2026-10-30', meal: 'Lunch', savedMealId: 's1' },
];
const times = { Breakfast: '08:00', Lunch: '12:30', Dinner: '18:30', Snack: '15:30' } as const;

test('meals: one event per planned meal on the chosen dates, skipping deleted meals', () => {
  const ev = mealEvents(planned, meals, ['2026-10-20', '2026-10-21'], times);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].key, 'm:a');
  assert.equal(ev[0].title, 'Breakfast: Oats and berries');
  assert.equal(ev[0].start, stamp('2026-10-20', '08:00'));
  assert.equal(ev[0].end - ev[0].start, 30 * 60_000);
  assert.match(ev[0].description, /230 kcal/);
});

const ev = (key: string, title: string, start: number): CalEvent => ({ key, title, start, end: start + 1, description: '' });

test('sync: new events are added, unchanged ones kept, changed ones replaced, and dropped ones removed', () => {
  const t1 = stamp('2026-10-20', '07:00');
  const t2 = stamp('2026-10-21', '07:00');
  const t3 = stamp('2026-10-22', '07:00');
  const tracked: Record<string, TrackedEvent> = {
    'w:2026-10-20': { id: 11, start: t1, title: 'Easy walk' },
    'w:2026-10-21': { id: 12, start: t2, title: 'Full body' },
    'w:2026-10-22': { id: 13, start: t3, title: 'Stretch' },
  };
  const wanted = [ev('w:2026-10-20', 'Easy walk', t1), ev('w:2026-10-21', 'Full body NEW', t2), ev('w:2026-10-23', 'Run', stamp('2026-10-23', '07:00'))];
  const d = diffEvents(tracked, wanted, stamp('2026-10-20', '00:00'), stamp('2026-10-25', '00:00'));
  assert.equal(d.kept, 1);
  assert.deepEqual(d.add.map((e) => e.key).sort(), ['w:2026-10-21', 'w:2026-10-23']);
  assert.deepEqual(d.remove.sort(), [12, 13]);
});

test('sync: events outside the range, of the other kind, or never tracked are left alone', () => {
  const t = stamp('2026-10-20', '07:00');
  const tracked: Record<string, TrackedEvent> = {
    'w:2026-10-20': { id: 1, start: t, title: 'Walk' },
    'm:x': { id: 2, start: t, title: 'Breakfast: Oats' },
    'w:2026-09-01': { id: 3, start: stamp('2026-09-01', '07:00'), title: 'Old' },
  };
  const d = diffEvents(tracked, [], stamp('2026-10-19', '00:00'), stamp('2026-10-26', '00:00'), 'w');
  assert.deepEqual(d.remove, [1]);
  assert.equal(d.add.length, 0);
});
