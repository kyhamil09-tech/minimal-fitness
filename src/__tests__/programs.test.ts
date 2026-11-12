import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMS, completeSession, getProgram, planSession, plannedLogs, roundLoad, sessionInfo, setupExercises, skipSession, startProgram, suggestStart } from '../lib/programs';
import { getExercise } from '../data/exercises';

const def = (id: string) => getProgram(id)!;
const logOf = (exerciseId: string, sets: [number, number][]) => ({ exerciseId, name: exerciseId, sets: sets.map(([reps, weightKg]) => ({ reps, weightKg, done: true })) });

test('every program only uses exercises the app has, and its days rotate sensibly', () => {
  for (const p of PROGRAMS) {
    assert.ok(p.days.length > 0 && p.sessionsPerWeek > 0 && p.cycleWeeks > 0, p.id);
    for (const d of p.days) for (const e of d.exercises) assert.ok(getExercise(e.id), `${p.id}: ${e.id}`);
  }
});

test('weights round to plate jumps in either unit', () => {
  assert.equal(roundLoad(61, 'metric'), 60);
  assert.equal(roundLoad(62, 'metric'), 62.5);
  assert.equal(Math.round((roundLoad(100, 'imperial') / 0.45359237) * 10) / 10, 220); // 220 lb
  assert.equal(roundLoad(0, 'metric'), 0);
});

test('the workouts rotate A, B, A then B, A, B across weeks', () => {
  const p = def('linear-5x5');
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => sessionInfo(p, i).day.name), ['Workout A', 'Workout B', 'Workout A', 'Workout B', 'Workout A', 'Workout B']);
  assert.equal(sessionInfo(p, 3).week, 2);
});

test('5/3/1 week one is 65, 75 and 85 percent of the training max, the last set as many as you can', () => {
  const p = def('five31');
  const st = startProgram(p, { ohp: 60, deadlift: 140, 'bench-press': 100, squat: 120 });
  const plan = planSession(p, st, 'metric');
  assert.equal(plan.info.day.name, 'Overhead press');
  const main = plan.exercises[0];
  assert.deepEqual(main.sets.map((s) => s.weightKg), [40, 45, 50]);
  assert.deepEqual(main.sets.map((s) => s.reps), [5, 5, 5]);
  assert.equal(main.sets[2].plus, true);
});

test('5/3/1 week four is the light week, and the maxes go up when the cycle ends', () => {
  const p = def('five31');
  let st = startProgram(p, { ohp: 60, deadlift: 140, 'bench-press': 100, squat: 120 });
  for (let i = 0; i < 12; i++) st = skipSession(p, st, 'metric');
  const light = planSession(p, st, 'metric');
  assert.equal(light.info.cycleWeek, 3);
  assert.equal(light.info.deload, true);
  assert.deepEqual(light.exercises[0].sets.map((s) => s.weightKg), [25, 30, 35]);
  for (let i = 0; i < 4; i++) st = skipSession(p, st, 'metric');
  assert.equal(st.done, 16);
  assert.equal(st.weights.ohp, 62.5);
  assert.equal(st.weights.squat, 125);
  assert.equal(st.weights.deadlift, 145);
  assert.equal(sessionInfo(p, st.done).cycle, 2);
});

test('a completed linear session adds weight; three misses in a row take ten percent off', () => {
  const p = def('linear-5x5');
  let st = startProgram(p, { squat: 60, 'bench-press': 40, 'barbell-row': 40, ohp: 30, deadlift: 80 });
  const plan = planSession(p, st, 'metric');
  assert.equal(plan.exercises[0].sets.length, 5);
  const good = { exercises: [logOf('squat', Array(5).fill([5, 60])), logOf('bench-press', Array(5).fill([5, 40])), logOf('barbell-row', Array(5).fill([5, 40]))] };
  st = completeSession(p, st, good, 'metric');
  assert.equal(st.weights.squat, 62.5);
  assert.equal(st.done, 1);
  // next is workout B: squat is planned at 62.5; miss it three times (B, A, B all include squat)
  const miss = (id: string, w: number) => ({ exercises: [logOf(id, [[5, w], [5, w], [4, w], [3, w], [3, w]])] });
  st = completeSession(p, st, miss('squat', 62.5), 'metric');
  assert.equal(st.weights.squat, 62.5);
  assert.equal(st.fails.squat, 1);
  st = completeSession(p, st, miss('squat', 62.5), 'metric');
  assert.equal(st.fails.squat, 2);
  st = completeSession(p, st, miss('squat', 62.5), 'metric');
  assert.equal(st.weights.squat, 57.5);
  assert.equal(st.fails.squat, 0);
});

test('double progression adds weight only when every set reaches the top of the range', () => {
  const p = def('upper-lower-4');
  let st = startProgram(p, { 'bench-press': 60, 'barbell-row': 50 });
  const bench = (reps: number[], w = 60) => ({ exercises: [logOf('bench-press', reps.map((r) => [r, w] as [number, number]))] });
  st = completeSession(p, st, bench([8, 8, 7, 6]), 'metric');
  assert.equal(st.weights['bench-press'], 60);
  st = { ...st, done: 0 };
  st = completeSession(p, st, bench([8, 8, 8, 8]), 'metric');
  assert.equal(st.weights['bench-press'], 62.5);
  // lifting heavier than planned is adopted as the new baseline
  st = { ...st, done: 0 };
  st = completeSession(p, st, bench([6, 6, 5, 5], 70), 'metric');
  assert.equal(st.weights['bench-press'], 70);
});

test('a light week halves the sets and lowers the weight, and does not change the weights', () => {
  const p = def('upper-lower-4');
  let st = startProgram(p, { 'bench-press': 100 });
  st = { ...st, done: 12 }; // week 4 of the cycle
  const plan = planSession(p, st, 'metric');
  assert.equal(plan.info.deload, true);
  assert.equal(plan.exercises[0].sets.length, 2);
  assert.equal(plan.exercises[0].sets[0].weightKg, 80);
  const after = completeSession(p, st, { exercises: [logOf('bench-press', [[8, 80], [8, 80]])] }, 'metric');
  assert.equal(after.weights['bench-press'], 100);
});

test('setup asks only for the main lifts, and suggests a start from your best lift', () => {
  assert.deepEqual(setupExercises(def('five31')).sort(), ['bench-press', 'deadlift', 'ohp', 'squat']);
  assert.deepEqual(setupExercises(def('ppl-6')), []);
  assert.equal(suggestStart(def('five31'), 100, 'metric'), 90);
  assert.equal(suggestStart(def('linear-5x5'), 100, 'metric'), 65);
  assert.equal(suggestStart(def('linear-5x5'), 0, 'metric'), 0);
});

test('the planned workout becomes the sets the workout screen opens with', () => {
  const p = def('linear-5x5');
  const st = startProgram(p, { squat: 60, 'bench-press': 40, 'barbell-row': 40 });
  const logs = plannedLogs(planSession(p, st, 'metric').exercises, (id) => getExercise(id)?.name ?? id);
  assert.equal(logs[0].sets.length, 5);
  assert.equal(logs[0].sets[0].done, false);
  assert.equal(logs[0].sets[0].weightKg, 60);
});
