import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchImportId, watchWorkoutToSession } from '../lib/watchImport';
import { buildWatchRoutines, watchRoutinesJson } from '../lib/watchStrength';
import { workoutTypeFromHc } from '../lib/hcWorkouts';
import { estimateCalories } from '../lib/calc';
import { DEFAULT_PROFILE } from '../data/defaults';

test('a strength session run on the watch alone arrives with its sets, in kilograms', () => {
  const s = watchWorkoutToSession(
    {
      id: '1780000000000',
      type: 'Strength',
      startedAt: 1780000000000,
      durationSec: 1800,
      kcal: 200,
      exercises: [
        { id: 'bench-press', n: 'Barbell Bench Press', sets: [[8, 60], [8, 62.5]] },
        { id: '', n: 'Exercise 2', sets: [[10, 0]] },
        { id: 'squat', n: 'Back Squat', sets: [] },
      ],
    },
    DEFAULT_PROFILE
  );
  assert.ok(s);
  assert.equal(s!.id, watchImportId({ id: '1780000000000' }));
  assert.equal(s!.exercises?.length, 2);
  assert.equal(s!.exercises![0].name, 'Barbell Bench Press');
  assert.deepEqual(s!.exercises![0].sets, [
    { reps: 8, weightKg: 60, done: true },
    { reps: 8, weightKg: 62.5, done: true },
  ]);
  assert.equal(s!.exercises![1].exerciseId, 'watch-exercise-2');
});

test('the new sports are known on import and in Health Connect', () => {
  const s = watchWorkoutToSession({ id: '2', type: 'Swimming', startedAt: 1780000000000, durationSec: 1200, kcal: 150 }, DEFAULT_PROFILE);
  assert.equal(s!.type, 'Swimming');
  assert.equal(workoutTypeFromHc(74), 'Swimming');
  assert.equal(workoutTypeFromHc(73), 'OpenWaterSwim');
  assert.equal(workoutTypeFromHc(68), 'StairClimbing');
  assert.equal(workoutTypeFromHc(16), 'Dance');
  assert.ok(estimateCalories('Swimming', 30, 70) > 0);
});

test('routines sent to the watch carry their exercises and last-used sets when asked', () => {
  const list = buildWatchRoutines({ routines: [], activePlan: null });
  const plain = JSON.parse(watchRoutinesJson(list));
  assert.equal(plain[0].ex, undefined);
  const rich = JSON.parse(
    watchRoutinesJson(list, (id) => ({ id, n: id, step: 2.5, sets: [{ r: 8, w: 20 }] }), 'lb')
  );
  assert.equal(rich[0].u, 'lb');
  assert.ok(rich[0].ex.length > 0);
  assert.deepEqual(rich[0].ex[0].sets, [{ r: 8, w: 20 }]);
});

test('the watch gets every exercise with the sets last done, in the units you use', async () => {
  const { buildWatchExercises } = await import('../lib/watchStrength');
  const { EXERCISES } = await import('../data/exercises');
  const history = [
    { id: 'a', type: 'Strength', startedAt: 1000, exercises: [{ exerciseId: 'bench-press', name: 'Barbell Bench Press', sets: [{ reps: 8, weightKg: 60, done: true }] }] },
    { id: 'b', type: 'Strength', startedAt: 2000, exercises: [{ exerciseId: 'bench-press', name: 'Barbell Bench Press', sets: [{ reps: 6, weightKg: 70, done: true }, { reps: 6, weightKg: 70, done: true }] }] },
  ] as unknown as Parameters<typeof buildWatchExercises>[0];
  const lib = buildWatchExercises(history, 'metric');
  assert.equal(lib.ex.length, EXERCISES.length);
  const bench = lib.ex.find((e) => e.id === 'bench-press')!;
  assert.deepEqual(bench.sets, [[6, 70], [6, 70]]);
  assert.equal(EXERCISES[bench.i].id, 'bench-press');
  assert.deepEqual(lib.ex.find((e) => e.id === 'squat')!.sets, []);
  assert.ok(lib.groups.includes('Stretch') && lib.groups.includes('Chest'));
  const lb = buildWatchExercises(history, 'imperial');
  assert.equal(lb.u, 'lb');
  assert.ok(Math.abs(lb.ex.find((e) => e.id === 'bench-press')!.sets[0][1] - 154.3) < 0.2);
});
