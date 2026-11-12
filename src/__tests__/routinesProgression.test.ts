import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTargets, routineLogs, targetSummary, targetsFromLogs } from '../lib/routines';
import { progressedWeight } from '../lib/progression';
import { EXERCISES } from '../data/exercises';

const id = EXERCISES[0].id;

test('targets from a workout skip warm-ups and round-trip to the sets a routine opens with', () => {
  const t = targetsFromLogs([
    { exerciseId: id, name: 'x', sets: [{ reps: 5, weightKg: 40, done: true, kind: 'warmup' }, { reps: 8, weightKg: 80, done: true }, { reps: 8, weightKg: 80, done: true }] },
  ]);
  assert.equal(t[id].length, 2);
  const logs = routineLogs({ exerciseIds: [id], targets: t })!;
  assert.equal(logs[0].sets.length, 2);
  assert.equal(logs[0].sets[0].done, false);
  assert.equal(logs[0].sets[0].weightKg, 80);
});

test('a routine without targets opens with last time\'s sets', () => {
  assert.equal(routineLogs({ exerciseIds: [id] }), undefined);
});

test('clean drops targets for removed exercises', () => {
  assert.equal(cleanTargets([id], { gone: [{ reps: 1, weightKg: 1 }] }), undefined);
  assert.deepEqual(Object.keys(cleanTargets([id], { [id]: [{ reps: 1, weightKg: 1 }], gone: [{ reps: 1, weightKg: 1 }] })!), [id]);
});

test('summary', () => {
  assert.equal(targetSummary([{ reps: 8, weightKg: 60 }, { reps: 8, weightKg: 60 }, { reps: 8, weightKg: 60 }], (k) => `${k} kg`), '3 × 8 at 60 kg');
  assert.equal(targetSummary(undefined, String), 'No target');
});

test('progression adds the step only when every working set hit the reps', () => {
  const rule = { step: 2.5, reps: 8 };
  const id2 = (k: number) => k;
  assert.equal(progressedWeight([{ reps: 8, weightKg: 60, done: true }, { reps: 9, weightKg: 60, done: true }], rule, id2), 62.5);
  assert.equal(progressedWeight([{ reps: 8, weightKg: 60, done: true }, { reps: 7, weightKg: 60, done: true }], rule, id2), null);
  assert.equal(progressedWeight([{ reps: 5, weightKg: 20, done: true, kind: 'warmup' }], rule, id2), null);
  assert.equal(progressedWeight(undefined, rule, id2), null);
  assert.equal(progressedWeight([{ reps: 8, weightKg: 60, done: true }], undefined, id2), null);
});
