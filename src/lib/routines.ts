import { ExerciseLog, Routine, RoutineSet, SetLog } from '../types/tracking';
import { getExercise } from '../data/exercises';

/**
 * A routine can remember how many sets of each exercise to do and the reps and weight to start from. These turn that into the sets the
 * workout screen opens with, and a finished workout back into targets.
 */

/** The sets a routine opens with, or undefined when it has no targets (the screen then uses what was done last time). */
export const routineLogs = (r: Pick<Routine, 'exerciseIds' | 'targets'>): ExerciseLog[] | undefined => {
  if (!r.targets) return undefined;
  const logs: ExerciseLog[] = [];
  for (const id of r.exerciseIds) {
    const ex = getExercise(id);
    if (!ex) continue;
    const sets = r.targets[id];
    const rows: SetLog[] = (sets ?? []).map((s) => ({ reps: s.reps, weightKg: s.weightKg, done: false, ...(s.kind && s.kind !== 'normal' ? { kind: s.kind } : {}), ...(s.seconds ? { seconds: s.seconds } : {}) }));
    logs.push({ exerciseId: id, name: ex.name, sets: rows });
  }
  return logs;
};

/** Targets from a workout's sets (warm-ups left out: they are worked out from the first working weight). */
export const targetsFromLogs = (logs: ExerciseLog[]): Record<string, RoutineSet[]> => {
  const out: Record<string, RoutineSet[]> = {};
  for (const l of logs) {
    const sets = l.sets
      .filter((s) => s.kind !== 'warmup' && (s.reps > 0 || (s.seconds ?? 0) > 0))
      .map((s): RoutineSet => ({ reps: s.reps, weightKg: s.weightKg, ...(s.kind && s.kind !== 'normal' ? { kind: s.kind } : {}), ...(s.seconds ? { seconds: s.seconds } : {}) }));
    if (sets.length) out[l.exerciseId] = sets;
  }
  return out;
};

/** Drops targets for exercises that are no longer in the routine, and empty ones. */
export const cleanTargets = (ids: string[], targets: Record<string, RoutineSet[]> | undefined): Record<string, RoutineSet[]> | undefined => {
  if (!targets) return undefined;
  const out: Record<string, RoutineSet[]> = {};
  for (const id of ids) if (targets[id]?.length) out[id] = targets[id];
  return Object.keys(out).length ? out : undefined;
};

/** "3 × 8 at 60 kg" style summary of the sets planned for an exercise. */
export const targetSummary = (sets: RoutineSet[] | undefined, show: (kg: number) => string): string => {
  if (!sets?.length) return 'No target';
  const first = sets[0];
  const same = sets.every((s) => s.reps === first.reps && s.weightKg === first.weightKg);
  if (first.seconds && same) return `${sets.length} × ${first.seconds} s`;
  return same ? `${sets.length} × ${first.reps}${first.weightKg > 0 ? ` at ${show(first.weightKg)}` : ''}` : `${sets.length} sets`;
};
