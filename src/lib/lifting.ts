import { WorkoutSession } from '../types/health';
import { Exercise, ExerciseLog, MuscleGroup, SetLog } from '../types/tracking';
import { estimateOneRepMax } from './calc';
import { MUSCLE_GROUPS, allExercises, getExercise } from '../data/exercises';
import { hasWork, isTimedSet, isWorkingSet, workingVolumeKg } from './sets';
import { isHardSet } from './oneRepMax';

/**
 * The lifting side's numbers: a lift's history and records, what you did last time in each set, a workout's totals, making your own
 * exercises, and the "repeat this workout" shortcut. Everything is worked out from the sets you have logged.
 */

/** Workouts that hold logged exercises, newest first. */
export const liftingWorkouts = (workouts: WorkoutSession[]): WorkoutSession[] =>
  workouts.filter((w) => (w.exercises ?? []).some((e) => e.sets.some(hasWork))).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));

export interface LiftEntry {
  workoutId: string;
  at: number;
  title?: string;
  sets: SetLog[];
  note?: string;
  volumeKg: number;
  /** The working set with the highest estimated one-rep max. */
  top?: { weightKg: number; reps: number; e1rm: number };
  /** Longest hold in the session, in seconds. */
  bestSeconds: number;
}

/** Every time an exercise was done, newest first. */
export const exerciseEntries = (workouts: WorkoutSession[], exerciseId: string): LiftEntry[] => {
  const out: LiftEntry[] = [];
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      if (ex.exerciseId !== exerciseId) continue;
      const sets = ex.sets.filter(hasWork);
      if (!sets.length) continue;
      let top: LiftEntry['top'];
      let bestSeconds = 0;
      for (const s of sets) {
        if (isTimedSet(s)) bestSeconds = Math.max(bestSeconds, s.seconds ?? 0);
        if (!isWorkingSet(s) || s.weightKg <= 0 || s.reps <= 0) continue;
        const e1rm = estimateOneRepMax(s.weightKg, s.reps, s.rpe);
        if (!top || e1rm > top.e1rm) top = { weightKg: s.weightKg, reps: s.reps, e1rm };
      }
      out.push({ workoutId: w.id, at: w.startedAt ?? 0, title: w.title ?? w.planDayTitle, sets, note: ex.note, volumeKg: workingVolumeKg({ ...ex, sets }), top, bestSeconds });
    }
  }
  return out.sort((a, b) => b.at - a.at);
};

export interface LiftRecords {
  sessions: number;
  totalSets: number;
  totalVolumeKg: number;
  /** The heaviest working set. */
  heaviest?: { weightKg: number; reps: number; at: number };
  /** The best estimated one-rep max. */
  e1rm?: { value: number; weightKg: number; reps: number; at: number };
  /** The working set with the most weight lifted (weight times reps). */
  bestSet?: { volumeKg: number; weightKg: number; reps: number; at: number };
  /** The most reps in a working set at any weight, and at what weight. */
  mostReps?: { reps: number; weightKg: number; at: number };
  /** The longest hold, in seconds. */
  longestHold?: { seconds: number; at: number };
}

export const liftRecords = (entries: LiftEntry[]): LiftRecords => {
  const r: LiftRecords = { sessions: entries.length, totalSets: 0, totalVolumeKg: 0 };
  for (const e of entries) {
    r.totalVolumeKg += e.volumeKg;
    for (const s of e.sets) {
      r.totalSets++;
      if (isTimedSet(s)) {
        if (!r.longestHold || (s.seconds ?? 0) > r.longestHold.seconds) r.longestHold = { seconds: s.seconds ?? 0, at: e.at };
        continue;
      }
      if (!isWorkingSet(s) || s.reps <= 0) continue;
      if (s.weightKg > 0 && (!r.heaviest || s.weightKg > r.heaviest.weightKg || (s.weightKg === r.heaviest.weightKg && s.reps > r.heaviest.reps))) r.heaviest = { weightKg: s.weightKg, reps: s.reps, at: e.at };
      if (s.weightKg > 0) {
        const e1 = estimateOneRepMax(s.weightKg, s.reps, s.rpe);
        if (!r.e1rm || e1 > r.e1rm.value) r.e1rm = { value: e1, weightKg: s.weightKg, reps: s.reps, at: e.at };
        const vol = s.weightKg * s.reps;
        if (!r.bestSet || vol > r.bestSet.volumeKg) r.bestSet = { volumeKg: vol, weightKg: s.weightKg, reps: s.reps, at: e.at };
      }
      if (!r.mostReps || s.reps > r.mostReps.reps) r.mostReps = { reps: s.reps, weightKg: s.weightKg, at: e.at };
    }
  }
  return r;
};

/** What was lifted in each set last time (the "previous" column), or undefined if the exercise was never done. */
export const previousSets = (workouts: WorkoutSession[], exerciseId: string): { sets: SetLog[]; note?: string } | undefined => {
  const last = exerciseEntries(workouts, exerciseId)[0];
  return last ? { sets: last.sets, note: last.note } : undefined;
};

export interface WorkoutTotals {
  exercises: number;
  sets: number;
  reps: number;
  volumeKg: number;
}

/** Counts a workout's finished sets. Warm-ups are shown in the set count but do not add to volume. */
export const workoutTotals = (w: Pick<WorkoutSession, 'exercises'>): WorkoutTotals => {
  const t: WorkoutTotals = { exercises: 0, sets: 0, reps: 0, volumeKg: 0 };
  for (const ex of w.exercises ?? []) {
    const done = ex.sets.filter(hasWork);
    if (!done.length) continue;
    t.exercises++;
    t.sets += done.length;
    for (const s of done) if (isWorkingSet(s)) t.reps += s.reps;
    t.volumeKg += workingVolumeKg({ ...ex, sets: done });
  }
  return t;
};

/** Hard sets (finished work at effort 7 or more, or with no effort logged) per muscle group over the last `days` days. */
export const setsByMuscle = (workouts: WorkoutSession[], now: number, days = 7): Record<MuscleGroup, number> => {
  const since = now - days * 24 * 3600 * 1000;
  const out = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0])) as Record<MuscleGroup, number>;
  for (const w of workouts) {
    if ((w.startedAt ?? 0) < since) continue;
    for (const ex of w.exercises ?? []) {
      const g = getExercise(ex.exerciseId)?.muscle;
      if (g && g in out) out[g] += ex.sets.filter((s) => isWorkingSet(s) && isHardSet(s) && (s.reps > 0 || (s.seconds ?? 0) > 0)).length;
    }
  }
  return out;
};

/** Workouts per week for the last `weeks` weeks (Monday to Sunday), oldest first. */
export const workoutsPerWeek = (workouts: WorkoutSession[], now: number, weeks = 8): { week: string; count: number }[] => {
  const monday = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  };
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = monday(now);
  const out: { week: string; count: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - 7 * i);
    out.push({ week: key(d), count: 0 });
  }
  const by = new Map(out.map((o) => [o.week, o]));
  for (const w of liftingWorkouts(workouts)) {
    const row = by.get(key(monday(w.startedAt ?? 0)));
    if (row) row.count++;
  }
  return out;
};

// ----- Your own exercises -----

export const MAX_CUSTOM = 300;

const slug = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

export interface NewExercise {
  name: string;
  muscle: MuscleGroup;
  equipment: Exercise['equipment'];
  timed?: boolean;
}

/** Adds an exercise of your own. Returns the new list and the exercise, or an error in plain words. */
export const addCustomExercise = (list: Exercise[], input: NewExercise): { list: Exercise[]; exercise: Exercise } | { error: string } => {
  const name = input.name.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (name.length < 2) return { error: 'Give the exercise a name.' };
  const lower = name.toLowerCase();
  if (list.length >= MAX_CUSTOM) return { error: `You can make up to ${MAX_CUSTOM} exercises.` };
  if (allExercises().some((e) => e.name.toLowerCase() === lower) || list.some((e) => e.name.toLowerCase() === lower)) return { error: 'There is already an exercise with that name.' };
  let id = `custom-${slug(name) || 'exercise'}`;
  const taken = new Set([...list.map((e) => e.id), ...allExercises().map((e) => e.id)]);
  for (let n = 2; taken.has(id); n++) id = `custom-${slug(name) || 'exercise'}-${n}`;
  const exercise: Exercise = { id, name, muscle: input.muscle, equipment: input.equipment, custom: true, ...(input.timed ? { timed: true } : {}) };
  return { list: [exercise, ...list], exercise };
};

export const removeCustomExercise = (list: Exercise[], id: string): Exercise[] => list.filter((e) => e.id !== id);

// ----- Repeat a workout -----

/** The logs of a past workout, ready to load into a new session: same exercises, same sets, nothing ticked off. */
export const logsToRepeat = (w: Pick<WorkoutSession, 'exercises'>): ExerciseLog[] =>
  (w.exercises ?? [])
    .map((ex) => ({ ...ex, sets: ex.sets.filter(hasWork).map((s) => ({ ...s, done: false })) }))
    .filter((ex) => ex.sets.length > 0);
