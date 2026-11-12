import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FOLDERS, addFolder, cleanFolderName, deleteFolder, groupRoutines, moveRoutine, renameFolder } from '../lib/routineFolders';
import { MAX_LINES, buildLiftCard } from '../lift/shareCard';
import { Routine, ExerciseLog, SetLog } from '../types/tracking';
import { WorkoutSession } from '../types/health';

const r = (id: string, folder?: string): Routine => ({ id, name: `Routine ${id}`, exerciseIds: ['squat'], ...(folder ? { folder } : {}) });

test('folders are added once, cleaned, and capped', () => {
  assert.deepEqual(addFolder([], '  Push   Pull '), ['Push Pull']);
  assert.deepEqual(addFolder(['Push'], 'push'), { error: 'You already have a folder with that name.' });
  assert.deepEqual(addFolder([], '   '), { error: 'Give the folder a name.' });
  assert.equal(cleanFolderName('x'.repeat(80)).length, 30);
  assert.equal(cleanFolderName('<b>Legs</b>'), 'bLegs/b');
  const full = Array.from({ length: MAX_FOLDERS }, (_, i) => `F${i}`);
  assert.ok('error' in (addFolder(full, 'One more') as object));
});

test('renaming a folder moves its routines, deleting one keeps them', () => {
  const routines = [r('a', 'Push'), r('b', 'Legs'), r('c')];
  const renamed = renameFolder(['Push', 'Legs'], routines, 'Push', 'Upper');
  assert.ok(!('error' in renamed));
  if ('error' in renamed) return;
  assert.deepEqual(renamed.folders, ['Upper', 'Legs']);
  assert.equal(renamed.routines.find((x) => x.id === 'a')?.folder, 'Upper');
  assert.equal(renamed.routines.find((x) => x.id === 'b')?.folder, 'Legs');
  assert.ok('error' in renameFolder(['Push', 'Legs'], routines, 'Push', 'legs'), 'cannot take another folder\'s name');
  assert.ok(!('error' in renameFolder(['Push'], routines, 'Push', 'push')), 'changing only the capitals is fine');
  const gone = deleteFolder(['Push', 'Legs'], routines, 'Push');
  assert.deepEqual(gone.folders, ['Legs']);
  assert.equal(gone.routines.length, 3);
  assert.equal(gone.routines.find((x) => x.id === 'a')?.folder, undefined);
  assert.equal('folder' in (gone.routines.find((x) => x.id === 'a') as object), false);
});

test('moving a routine puts it in a folder or takes it out', () => {
  const routines = [r('a'), r('b', 'Legs')];
  assert.equal(moveRoutine(routines, 'a', 'Legs').find((x) => x.id === 'a')?.folder, 'Legs');
  assert.equal(moveRoutine(routines, 'b', undefined).find((x) => x.id === 'b')?.folder, undefined);
  assert.equal(moveRoutine(routines, 'zzz', 'Legs').length, 2);
});

test('the screen layout lists every folder (empty ones too), then routines in none, and never loses a routine', () => {
  const routines = [r('a', 'Push'), r('b'), r('c', 'Gone')];
  const groups = groupRoutines(routines, ['Push', 'Empty']);
  assert.deepEqual(groups.map((g) => [g.folder, g.routines.map((x) => x.id)]), [['Push', ['a']], ['Empty', []], [null, ['b', 'c']]]);
  assert.deepEqual(groupRoutines([], []).map((g) => g.folder), [null]);
  assert.deepEqual(groupRoutines([], ['Only']).map((g) => g.folder), ['Only']);
});

const set = (reps: number, weightKg: number, extra: Partial<SetLog> = {}): SetLog => ({ reps, weightKg, done: true, ...extra });
const wk = (id: string, exercises: ExerciseLog[], extra: Partial<WorkoutSession> = {}): WorkoutSession =>
  ({ id, type: 'Strength', timestamp: '', startedAt: new Date(2026, 9, 12, 8).getTime(), durationMinutes: 62, durationSec: 3720, avgHeartRate: 0, caloriesBurned: 300, exercises, ...extra }) as WorkoutSession;

test('a workout card has its name, three numbers, each exercise with its best working set, and a star on records', () => {
  const prior = wk('p', [{ exerciseId: 'bench-press', name: 'Barbell Bench Press', sets: [set(8, 70)] }]);
  const today = wk(
    't',
    [
      { exerciseId: 'bench-press', name: 'Barbell Bench Press', sets: [set(10, 30, { kind: 'warmup' }), set(8, 80), set(5, 90)] },
      { exerciseId: 'squat', name: 'Back Squat', sets: [set(5, 100)] },
      { exerciseId: 'plank', name: 'Plank', sets: [set(0, 0, { seconds: 45 }), set(0, 0, { seconds: 70 })] },
    ],
    { title: 'Push day' }
  );
  const c = buildLiftCard(today, [prior], 'metric');
  assert.equal(c.title, 'Push day');
  assert.deepEqual(c.stats.map((s) => s.label), ['Time', 'Volume', 'Sets']);
  assert.equal(c.stats[0].value, '1 h 2 min');
  assert.equal(c.stats[2].value, '6');
  const bench = c.lines.find((l) => l.name === 'Barbell Bench Press')!;
  assert.equal(bench.sets, 3);
  assert.equal(bench.best, '90 kg × 5', 'the warm-up is never the best set');
  assert.equal(bench.pr, true, 'beat the old 70 kg x 8');
  assert.equal(c.lines.find((l) => l.name === 'Back Squat')!.pr, false, 'a first time is not announced as a record');
  assert.equal(c.lines.find((l) => l.name === 'Plank')!.best, '1:10');
  assert.equal(buildLiftCard(wk('x', []), [], 'metric').title, 'Workout');
});

test('a long workout shows the first exercises and counts the rest', () => {
  const many: ExerciseLog[] = Array.from({ length: 10 }, (_, i) => ({ exerciseId: `custom-${i}`, name: `Move ${i}`, sets: [set(10, 20)] }));
  const c = buildLiftCard(wk('m', many), [], 'imperial');
  assert.equal(c.lines.length, MAX_LINES);
  assert.equal(c.more, 3);
  assert.match(c.lines[0].best, /lb/);
});
