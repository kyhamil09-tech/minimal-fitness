import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeRoutine, encodeRoutine, importRoutine, routineShareText } from '../lib/routineShare';
import { setCustomExercises } from '../data/exercises';
import { Exercise, Routine } from '../types/tracking';

const base: Routine = {
  id: 'r1',
  name: 'Push day',
  exerciseIds: ['bench-press', 'ohp'],
  days: [0, 3],
  targets: { 'bench-press': [{ reps: 8, weightKg: 60 }, { reps: 8, weightKg: 60 }, { reps: 6, weightKg: 65 }], ohp: [{ reps: 10, weightKg: 30 }] },
};

test('a routine goes through its code and comes back the same', () => {
  const d = decodeRoutine(encodeRoutine(base))!;
  assert.equal(d.name, 'Push day');
  assert.deepEqual(d.days, [0, 3]);
  assert.deepEqual(d.exercises.map((e) => e.id), ['bench-press', 'ohp']);
  assert.equal(d.exercises[0].sets.length, 3);
  assert.equal(d.exercises[0].sets[2].weightKg, 65);
});

test('the code is found inside a longer message', () => {
  const msg = routineShareText(base, (kg) => `${kg} kg`);
  assert.match(msg, /Bench Press 3 sets/);
  assert.equal(decodeRoutine('hey look!\n' + msg + '\nenjoy')?.name, 'Push day');
});

test('nonsense is refused, not guessed at', () => {
  assert.equal(decodeRoutine('hello'), null);
  assert.equal(decodeRoutine('KYFIT-ROUTINE-1:@@@'), null);
  assert.equal(decodeRoutine('KYFIT-ROUTINE-1:' + Buffer.from('{"v":2}').toString('base64url')), null);
});

test('values are limited so a hostile code cannot make a huge routine', () => {
  const wire = { v: 1, n: 'x'.repeat(500), e: Array.from({ length: 200 }, (_, i) => ({ i: 'bench-press', n: 'Bench Press' + i, s: Array.from({ length: 200 }, () => [99999, 99999]) })) };
  const d = decodeRoutine('KYFIT-ROUTINE-1:' + Buffer.from(JSON.stringify(wire)).toString('base64url'))!;
  assert.ok(d.name.length <= 60);
  assert.equal(d.exercises.length, 40);
  assert.equal(d.exercises[0].sets.length, 30);
  assert.ok(d.exercises[0].sets[0].reps <= 1000 && d.exercises[0].sets[0].weightKg <= 2000);
});

test('importing adds an exercise you do not have as one of your own', () => {
  const mine: Exercise = { id: 'custom-zercher', name: 'Zercher squat', muscle: 'Legs', equipment: 'Barbell', custom: true };
  setCustomExercises([mine]);
  const d = decodeRoutine(encodeRoutine({ name: 'Legs', exerciseIds: ['custom-zercher', 'squat'], targets: {} }))!;
  setCustomExercises([]);
  const out = importRoutine(d, []);
  assert.equal(out.custom.length, 1);
  assert.equal(out.custom[0].name, 'Zercher squat');
  assert.equal(out.routine.exerciseIds.length, 2);
  assert.ok(out.routine.exerciseIds.includes('squat'));
  // importing again finds the exercise by name instead of making a copy
  setCustomExercises(out.custom);
  const again = importRoutine(d, out.custom);
  assert.equal(again.custom.length, 1);
  setCustomExercises([]);
});
