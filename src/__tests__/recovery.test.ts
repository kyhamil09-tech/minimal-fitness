import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryAdvice } from '../lib/recovery';
import { WorkoutSession } from '../types/health';

const DAY = 86_400_000;
const now = Date.parse('2026-10-04T08:00:00');
const w = (id: string, daysAgo: number, load: number, rpe?: number): WorkoutSession =>
  ({ id, type: 'Running', timestamp: '', startedAt: now - daysAgo * DAY, durationMinutes: 40, avgHeartRate: 150, caloriesBurned: 400, cardioLoadPoints: load, perceivedExertion: rpe }) as WorkoutSession;

const history = [1, 3, 5, 7, 9].map((d, i) => w(`h${i}`, d, 60));

test('judged against your own last month', () => {
  assert.equal(recoveryAdvice(w('a', 0, 30), history)!.label, 'easy');
  assert.equal(recoveryAdvice(w('b', 0, 60), history)!.label, 'moderate');
  assert.equal(recoveryAdvice(w('c', 0, 90), history)!.label, 'hard');
  assert.equal(recoveryAdvice(w('d', 0, 150), history)!.label, 'very-hard');
});

test('harder sessions need longer, and readiness and effort nudge it', () => {
  const hard = recoveryAdvice(w('a', 0, 100), history)!;
  const easy = recoveryAdvice(w('b', 0, 30), history)!;
  assert.ok(hard.hours > easy.hours);
  assert.ok(recoveryAdvice(w('c', 0, 100), history, { readiness: 30 })!.hours > hard.hours);
  assert.ok(recoveryAdvice(w('e', 0, 100, 10), history)!.hours > hard.hours);
  assert.ok(hard.hours <= 72 && easy.hours >= 8);
});

test('without enough history it says so, and with no load it says nothing', () => {
  assert.match(recoveryAdvice(w('a', 0, 60), [])!.message, /not enough history/);
  assert.equal(recoveryAdvice(w('a', 0, 0), history), null);
});

test('a 9 out of 10 effort is never called easy', () => {
  assert.equal(recoveryAdvice(w('a', 0, 20, 9), history)!.label, 'moderate');
});
