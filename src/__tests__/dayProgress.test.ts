import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayProgress, dayProgressText } from '../lib/dayProgress';

const base = { steps: 0, stepGoal: 10000, waterMl: 0, waterGoalMl: 2500, workoutDone: false };

test('nothing done yet is an empty ring', () => {
  const p = dayProgress(base);
  assert.equal(p.fraction, 0);
  assert.equal(p.done, 0);
  assert.equal(dayProgressText(p), '0 of 3 goals today');
});

test('steps and water fill up as you go and are capped at their goal', () => {
  const p = dayProgress({ ...base, steps: 5000, waterMl: 5000 });
  assert.equal(p.steps, false);
  assert.equal(p.water, true);
  assert.ok(Math.abs(p.fraction - (0.5 + 1) / 3) < 1e-9);
  assert.equal(p.done, 1);
});

test('a workout is all or nothing', () => {
  assert.ok(Math.abs(dayProgress({ ...base, workoutDone: true }).fraction - 1 / 3) < 1e-9);
});

test('everything done is a full ring and says so', () => {
  const p = dayProgress({ steps: 12000, stepGoal: 10000, waterMl: 2600, waterGoalMl: 2500, workoutDone: true });
  assert.equal(p.fraction, 1);
  assert.equal(p.done, 3);
  assert.equal(dayProgressText(p), 'All 3 goals done today');
});

test('the text names what is done', () => {
  assert.equal(dayProgressText(dayProgress({ ...base, steps: 10000, workoutDone: true })), '2 of 3 goals today: steps and a workout');
  assert.equal(dayProgressText(dayProgress({ ...base, waterMl: 2500 })), '1 of 3 goals today: water');
});

test('a missing goal never counts as done and never divides by zero', () => {
  const p = dayProgress({ ...base, stepGoal: 0, steps: 5000 });
  assert.equal(p.steps, false);
  assert.equal(p.fraction, 0);
});
