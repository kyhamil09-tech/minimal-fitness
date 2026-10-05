import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ANSWERS, buildFromAnswers } from '../lib/onboarding';

test('with no goal picked it still produces a complete, onboarded profile from the defaults', () => {
  const { profile, goals, startTab } = buildFromAnswers(DEFAULT_ANSWERS);
  assert.equal(profile.onboarded, true);
  assert.equal(profile.goal, undefined);
  assert.equal(startTab, 'today');
  assert.ok(goals.dailyCalories >= 1400);
  assert.equal(goals.targetWeightKg, profile.weightKg);
});

test('losing weight lowers calories, raises protein and sets a modest target', () => {
  const base = buildFromAnswers({ ...DEFAULT_ANSWERS, weightKg: 80 });
  const lose = buildFromAnswers({ ...DEFAULT_ANSWERS, goal: 'lose', weightKg: 80 });
  assert.ok(lose.goals.dailyCalories < base.goals.dailyCalories);
  assert.ok(lose.goals.dailyProteinG > base.goals.dailyProteinG);
  assert.equal(lose.goals.targetWeightKg, 75);
  assert.equal(lose.goals.dailySteps, 10000);
});

test('running and strength open on Run, sleep opens on Sleep, and strength raises protein', () => {
  assert.equal(buildFromAnswers({ ...DEFAULT_ANSWERS, goal: 'run' }).startTab, 'exercise');
  assert.equal(buildFromAnswers({ ...DEFAULT_ANSWERS, goal: 'sleep' }).startTab, 'sleep');
  const s = buildFromAnswers({ ...DEFAULT_ANSWERS, goal: 'strength', weightKg: 70 });
  assert.equal(s.goals.dailyProteinG, 140);
  assert.equal(s.goals.weeklyWorkouts, 4);
});

test('values are kept in range and the name is trimmed', () => {
  const { profile } = buildFromAnswers({ ...DEFAULT_ANSWERS, name: '  Sam  ', age: 400, heightCm: 20, weightKg: 9 });
  assert.equal(profile.name, 'Sam');
  assert.equal(profile.age, 100);
  assert.equal(profile.heightCm, 100);
  assert.equal(profile.weightKg, 30);
});
