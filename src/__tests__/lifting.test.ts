import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLiftCsv, guessMuscle, parseDuration, parseLiftCsv, parseWhen, readCsv, toHevyCsv } from '../lib/importers/liftCsv';
import { SET_KINDS, hasWork, isTimedSet, isWorkingSet, nextKind, setText, workingVolumeKg } from '../lib/sets';
import { addCustomExercise, exerciseEntries, liftRecords, liftingWorkouts, logsToRepeat, previousSets, setsByMuscle, workoutTotals, workoutsPerWeek } from '../lib/lifting';
import { logVolumeKg, personalRecords, detectNewPRs } from '../lib/calc';
import { isTimedExercise, setCustomExercises, getExercise } from '../data/exercises';
import { WorkoutSession } from '../types/health';
import { ExerciseLog, SetLog } from '../types/tracking';

const set = (reps: number, weightKg: number, extra: Partial<SetLog> = {}): SetLog => ({ reps, weightKg, done: true, ...extra });
const session = (id: string, at: number, exercises: ExerciseLog[], title = 'Push'): WorkoutSession =>
  ({ id, type: 'Strength', timestamp: '', startedAt: at, durationMinutes: 60, avgHeartRate: 0, caloriesBurned: 300, exercises, planDayTitle: title }) as WorkoutSession;
const DAY = 24 * 3600 * 1000;
const T0 = new Date(2026, 9, 12, 8, 0, 0).getTime();

test('set kinds cycle, and warm-ups never count toward volume, records or PRs', () => {
  assert.deepEqual(SET_KINDS.map((k) => k.id), ['normal', 'warmup', 'drop', 'failure']);
  assert.equal(nextKind(undefined), 'warmup');
  assert.equal(nextKind('warmup'), 'drop');
  assert.equal(nextKind('failure'), 'normal');
  const log: ExerciseLog = { exerciseId: 'bench-press', name: 'Barbell Bench Press', sets: [set(10, 40, { kind: 'warmup' }), set(8, 80), set(6, 80, { kind: 'drop' }), set(5, 100, { kind: 'failure' })] };
  assert.equal(workingVolumeKg(log), 8 * 80 + 6 * 80 + 5 * 100);
  assert.equal(logVolumeKg(log), workingVolumeKg(log));
  const heavyWarmup: ExerciseLog = { exerciseId: 'bench-press', name: 'Bench', sets: [set(3, 200, { kind: 'warmup' }), set(5, 60)] };
  const prs = personalRecords([session('a', T0, [heavyWarmup])]);
  assert.equal(prs['bench-press'].weightKg, 60, 'a warm-up is not a record');
  assert.deepEqual(detectNewPRs([session('a', T0, [{ ...log, sets: [set(5, 100)] }])], [heavyWarmup]), [], 'and does not announce a PR');
});

test('timed holds are their own kind of set and stay out of the rep maths', () => {
  const plank = set(0, 0, { seconds: 60 });
  assert.equal(isTimedSet(plank), true);
  assert.equal(hasWork(plank), true);
  assert.equal(hasWork(set(0, 50)), false, 'no reps and no time is nothing');
  assert.equal(workingVolumeKg({ exerciseId: 'plank', name: 'Plank', sets: [plank] }), 0);
  assert.equal(setText(plank, (kg) => `${kg} kg`), '1:00');
  assert.equal(setText(set(8, 60), (kg) => `${kg} kg`), '60 kg × 8');
  assert.equal(setText(set(12, 0), (kg) => `${kg} kg`), 'bodyweight × 12');
  assert.equal(isWorkingSet({ ...set(5, 50), done: false }), false);
  assert.equal(isTimedExercise(getExercise('plank')), true);
  assert.equal(isTimedExercise(getExercise('bench-press')), false);
  assert.equal(isTimedExercise(getExercise('hanging-leg-raise')), false, 'a hanging leg raise is counted in reps');
});

const bench = (sets: SetLog[], note?: string): ExerciseLog => ({ exerciseId: 'bench-press', name: 'Barbell Bench Press', sets, ...(note ? { note } : {}) });

test('an exercise has a history, records and a previous session to prefill from', () => {
  const w = [
    session('w1', T0 - 14 * DAY, [bench([set(8, 60), set(8, 60)])]),
    session('w2', T0 - 7 * DAY, [bench([set(5, 100, { kind: 'warmup' }), set(5, 80), set(3, 90)], 'felt strong')]),
    session('w3', T0, [{ exerciseId: 'squat', name: 'Back Squat', sets: [set(5, 100)] }]),
  ];
  const entries = exerciseEntries(w, 'bench-press');
  assert.deepEqual(entries.map((e) => e.workoutId), ['w2', 'w1'], 'newest first');
  assert.equal(entries[0].note, 'felt strong');
  const r = liftRecords(entries);
  assert.equal(r.sessions, 2);
  assert.equal(r.totalSets, 5);
  assert.equal(r.heaviest?.weightKg, 90, 'the 100 kg warm-up is not the heaviest');
  assert.equal(r.bestSet?.volumeKg, 480);
  assert.equal(r.mostReps?.reps, 8);
  assert.ok(r.e1rm && r.e1rm.value > 90);
  const prev = previousSets(w, 'bench-press');
  assert.equal(prev?.sets.length, 3);
  assert.equal(prev?.note, 'felt strong');
  assert.equal(previousSets(w, 'deadlift'), undefined);
  assert.equal(liftRecords(exerciseEntries([session('p', T0, [{ exerciseId: 'plank', name: 'Plank', sets: [set(0, 0, { seconds: 45 }), set(0, 0, { seconds: 70 })] }])], 'plank')).longestHold?.seconds, 70);
});

test('a workout\'s totals and the week\'s sets by muscle skip warm-ups', () => {
  const w = session('w', T0, [bench([set(10, 40, { kind: 'warmup' }), set(8, 80), set(8, 80)]), { exerciseId: 'squat', name: 'Back Squat', sets: [set(5, 100)] }]);
  const t = workoutTotals(w);
  assert.deepEqual(t, { exercises: 2, sets: 4, reps: 21, volumeKg: 8 * 80 * 2 + 500 });
  const byMuscle = setsByMuscle([w], T0 + DAY);
  assert.equal(byMuscle.Chest, 2);
  assert.equal(byMuscle.Legs, 1);
  assert.equal(liftingWorkouts([w, session('cardio', T0, [])]).length, 1, 'a workout with no logged sets is not a lifting workout');
  const weeks = workoutsPerWeek([w], T0 + DAY, 4);
  assert.equal(weeks.length, 4);
  assert.equal(weeks[3].count, 1);
});

test('your own exercises get a unique id, a name check, and are found like built-in ones', () => {
  const first = addCustomExercise([], { name: '  Zercher   Squat ', muscle: 'Legs', equipment: 'Barbell' });
  assert.ok(!('error' in first));
  if ('error' in first) return;
  assert.equal(first.exercise.name, 'Zercher Squat');
  assert.equal(first.exercise.custom, true);
  assert.match(first.exercise.id, /^custom-zercher-squat/);
  setCustomExercises(first.list);
  assert.equal(getExercise(first.exercise.id)?.name, 'Zercher Squat');
  assert.ok('error' in addCustomExercise(first.list, { name: 'zercher squat', muscle: 'Legs', equipment: 'Barbell' }), 'same name twice');
  assert.ok('error' in addCustomExercise([], { name: 'Back Squat', muscle: 'Legs', equipment: 'Barbell' }), 'a built-in name');
  assert.ok('error' in addCustomExercise([], { name: ' ', muscle: 'Legs', equipment: 'Barbell' }));
  const timed = addCustomExercise(first.list, { name: 'Copenhagen Hold', muscle: 'Core', equipment: 'Bodyweight', timed: true });
  assert.ok(!('error' in timed) && isTimedExercise(timed.exercise));
  setCustomExercises([]);
});

test('repeating a workout loads the same sets, ticked off nothing, with warm-ups and notes kept', () => {
  const w = session('w', T0, [bench([set(10, 40, { kind: 'warmup' }), set(8, 80), { reps: 0, weightKg: 0, done: false }], 'pause the rep')]);
  const logs = logsToRepeat(w);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].sets.length, 2, 'unfinished sets are not carried over');
  assert.ok(logs[0].sets.every((s) => s.done === false));
  assert.equal(logs[0].sets[0].kind, 'warmup');
  assert.equal(logs[0].note, 'pause the rep');
});

const HEVY = `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
"Push day","12 Oct 2026, 08:00","12 Oct 2026, 09:10","Felt good","Bench Press (Barbell)","","Pause at the bottom",0,"warmup",40,10,,,
"Push day","12 Oct 2026, 08:00","12 Oct 2026, 09:10","Felt good","Bench Press (Barbell)","","Pause at the bottom",1,"normal",80,8,,,8
"Push day","12 Oct 2026, 08:00","12 Oct 2026, 09:10","Felt good","Bench Press (Barbell)","","Pause at the bottom",2,"dropset",60,10,,,
"Push day","12 Oct 2026, 08:00","12 Oct 2026, 09:10","Felt good","Lateral Raise (Dumbbell)","1","",0,"normal",10,15,,,
"Push day","12 Oct 2026, 08:00","12 Oct 2026, 09:10","Felt good","Triceps Pushdown (Cable)","1","",0,"failure",30,12,,,
"Push day","12 Oct 2026, 08:00","12 Oct 2026, 09:10","Felt good","Plank","","",0,"normal",,,,60,
"Push day","12 Oct 2026, 08:00","12 Oct 2026, 09:10","Felt good","Zottman Spin Machine X","","",0,"normal",20,10,,,
"Pull day","14 Oct 2026, 18:30","14 Oct 2026, 19:15","","Squat (Barbell)","","",0,"normal",100,5,,,
"Pull day","14 Oct 2026, 18:30","14 Oct 2026, 19:15","","Bad row","","",0,"normal",,,,,
`;

test('Hevy exports are recognized and read into workouts with set types, supersets, notes, holds and unknown exercises', () => {
  const rows = readCsv(HEVY);
  assert.equal(detectLiftCsv(rows), 'hevy');
  const r = parseLiftCsv(HEVY, { unit: 'kg' });
  assert.ok(r);
  assert.equal(r.format, 'hevy');
  assert.equal(r.workouts.length, 2);
  const push = r.workouts.find((w) => w.title === 'Push day')!;
  assert.equal(push.startedAt, new Date(2026, 9, 12, 8, 0).getTime());
  assert.equal(push.durationMinutes, 70);
  assert.equal(push.notes, 'Felt good');
  assert.equal(push.importedFrom, 'Hevy export');
  const benchLog = push.exercises!.find((e) => e.exerciseId === 'bench-press')!;
  assert.deepEqual(benchLog.sets.map((s) => s.kind ?? 'normal'), ['warmup', 'normal', 'drop']);
  assert.equal(benchLog.sets[1].rpe, 8);
  assert.equal(benchLog.note, 'Pause at the bottom');
  const raise = push.exercises!.find((e) => e.exerciseId === 'lateral-raise')!;
  const pushdown = push.exercises!.find((e) => e.exerciseId === 'tricep-pushdown')!;
  assert.ok(raise && pushdown, 'equipment in brackets is matched to the library');
  assert.equal(raise.group, pushdown.group, 'a shared superset id links the two exercises');
  assert.ok(raise.group?.startsWith('ss-'));
  const plank = push.exercises!.find((e) => e.exerciseId === 'plank')!;
  assert.equal(plank.sets[0].seconds, 60);
  assert.equal(plank.sets[0].reps, 0);
  assert.equal(r.created.length, 1);
  assert.equal(r.created[0].name, 'Zottman Spin Machine X');
  assert.equal(r.created[0].custom, true);
  assert.equal(r.created[0].equipment, 'Machine');
  assert.equal(r.skippedRows, 1, 'the row with no reps or time is skipped');
  const squat = r.workouts.find((w) => w.title === 'Pull day')!.exercises![0];
  assert.equal(squat.exerciseId, 'squat', 'Squat (Barbell) is this library\'s Back Squat');
});

const STRONG = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-10-12 08:00:00,Legs,1h 5m,Squat (Barbell),W,100,5,0,0,,Leg day,
2026-10-12 08:00:00,Legs,1h 5m,Squat (Barbell),1,225,5,0,0,"deep, slow",Leg day,8.5
2026-10-12 08:00:00,Legs,1h 5m,Squat (Barbell),Rest Timer,,,,120,,,
2026-10-12 08:00:00,Legs,1h 5m,Leg Press,1,300,10,0,0,,Leg day,
`;

test('Strong exports read with the unit you say, rest timers skipped, and warm-up markers kept', () => {
  assert.equal(detectLiftCsv(readCsv(STRONG)), 'strong');
  const lb = parseLiftCsv(STRONG, { unit: 'lb' })!;
  assert.equal(lb.workouts.length, 1);
  const w = lb.workouts[0];
  assert.equal(w.durationMinutes, 65);
  assert.equal(w.importedFrom, 'Strong export');
  const squat = w.exercises!.find((e) => e.exerciseId === 'squat')!;
  assert.equal(squat.sets.length, 2);
  assert.equal(squat.sets[0].kind, 'warmup');
  assert.ok(Math.abs(squat.sets[1].weightKg - 225 * 0.45359237) < 0.01);
  assert.equal(squat.sets[1].rpe, 8.5);
  assert.equal(squat.note, 'deep, slow');
  assert.equal(lb.skippedRows, 1);
  const kg = parseLiftCsv(STRONG, { unit: 'kg' })!;
  assert.equal(kg.workouts[0].exercises!.find((e) => e.exerciseId === 'squat')!.sets[1].weightKg, 225);
});

test('other files are not mistaken for lifting exports', () => {
  assert.equal(parseLiftCsv('Activity ID,Activity Name,Activity Type,Filename\n1,Run,Run,a.gpx\n', { unit: 'kg' }), null);
  assert.equal(parseLiftCsv('', { unit: 'kg' }), null);
});

test('dates and durations read the ways these apps write them', () => {
  assert.equal(parseWhen('12 Oct 2026, 08:00'), new Date(2026, 9, 12, 8, 0).getTime());
  assert.equal(parseWhen('2026-10-12 08:30:15'), new Date(2026, 9, 12, 8, 30, 15).getTime());
  assert.equal(parseWhen('12 Oct 2026, 8:05 PM'), new Date(2026, 9, 12, 20, 5).getTime());
  assert.ok(Number.isNaN(parseWhen('soon')));
  assert.equal(parseDuration('1h 5m'), 3900);
  assert.equal(parseDuration('45m'), 2700);
  assert.equal(parseDuration('3600'), 3600);
  assert.equal(parseDuration(''), 0);
  assert.equal(guessMuscle('Cable Crossover Thing'), 'Chest');
  assert.equal(guessMuscle('Mystery Move'), 'Full Body');
});

test('exporting in Hevy\'s layout and reading it back gives the same workouts', () => {
  const imported = parseLiftCsv(HEVY, { unit: 'kg' })!;
  const csv = toHevyCsv(imported.workouts);
  assert.ok(csv.startsWith('title,start_time,end_time'));
  assert.equal(detectLiftCsv(readCsv(csv)), 'hevy');
  const again = parseLiftCsv(csv, { unit: 'kg', known: imported.created })!;
  assert.equal(again.workouts.length, imported.workouts.length);
  const a = imported.workouts.find((w) => w.title === 'Push day')!;
  const b = again.workouts.find((w) => w.title === 'Push day')!;
  assert.equal(b.startedAt, a.startedAt);
  assert.deepEqual(b.exercises!.map((e) => e.sets.map((s) => [s.reps, s.weightKg, s.kind ?? 'normal', s.seconds ?? 0])), a.exercises!.map((e) => e.sets.map((s) => [s.reps, s.weightKg, s.kind ?? 'normal', s.seconds ?? 0])));
  assert.equal(b.exercises!.find((e) => e.exerciseId === 'bench-press')!.note, 'Pause at the bottom');
  assert.equal(again.created.length, 0, 'the custom exercise is already known the second time');
});

test('a Hevy CSV dropped into the import screen comes back as workouts and the exercises it had to make', async () => {
  const { importFiles } = await import('../lib/importers');
  const { DEFAULT_PROFILE } = await import('../data/defaults');
  const file = new File([HEVY], 'workout_data.csv', { type: 'text/csv' });
  const out = await importFiles([file], DEFAULT_PROFILE);
  assert.equal(out.workouts.length, 2);
  assert.equal(out.exercises.length, 1);
  assert.equal(out.exercises[0].name, 'Zottman Spin Machine X');
  assert.equal(out.lift?.source, 'Hevy');
  assert.equal(out.lift?.created, 1);
  const other = await importFiles([new File(['a,b\n1,2\n'], 'random.csv')], DEFAULT_PROFILE);
  assert.equal(other.workouts.length, 0);
  assert.match(other.skipped[0].reason, /Hevy or Strong/);
  const lb = await importFiles([new File([STRONG], 'strong.csv')], DEFAULT_PROFILE, undefined, { liftUnit: 'lb' });
  assert.ok(Math.abs(lb.workouts[0].exercises![0].sets[1].weightKg - 225 * 0.45359237) < 0.01);
});

test('set labels number the normal sets and show the letter for the others', async () => {
  const { setLabel } = await import('../lib/sets');
  const sets = [{ kind: 'warmup' as const }, {}, { kind: 'drop' as const }, {}, { kind: 'failure' as const }];
  assert.deepEqual(sets.map((_, i) => setLabel(sets, i)), ['W', '1', 'D', '2', 'F']);
});

test('the Lift preferences default sensibly and reject junk', async () => {
  const { DEFAULT_PREFS, sanitizePrefs } = await import('../lib/prefs');
  assert.equal(DEFAULT_PREFS.liftTheme, 'dark');
  assert.equal(DEFAULT_PREFS.liftRest, 90);
  assert.equal(DEFAULT_PREFS.startInLift, false);
  assert.equal(sanitizePrefs({ liftTheme: 'neon' as never }).liftTheme, 'dark');
  assert.equal(sanitizePrefs({ liftRest: 77 }).liftRest, 90);
  assert.equal(sanitizePrefs({ liftRest: 0 }).liftRest, 0);
  assert.equal(sanitizePrefs({ liftTheme: 'light', startInLift: true, liftRpe: true }).startInLift, true);
});
