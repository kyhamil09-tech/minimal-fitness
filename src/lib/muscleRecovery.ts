import type { WorkoutSession } from '../types/health';
import type { MuscleGroup } from '../types/tracking';
import { getExercise } from '../data/exercises';
import { isWorkingSet } from './sets';

/**
 * How recovered each muscle group is, from what you lifted and when. Every finished working set adds strain to its muscle group (more for
 * a harder set), and the strain fades with a half-life that is longer for big muscles than small ones. About ten hard sets, all just now,
 * leave a group at 0%; a group with nothing in the last five days is 100%. A rough guide to what is fresh, not a measurement.
 */
export const RECOVERY_GROUPS: MuscleGroup[] = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes', 'Core'];

/** Hours for half the strain to fade. */
const HALF_LIFE_HOURS: Record<string, number> = { Legs: 36, Glutes: 36, Chest: 30, Back: 30, Shoulders: 22, Arms: 20, Core: 16 };

/** Strain points one hard working set (effort 8) adds. */
const POINTS_PER_SET = 10;
const IGNORE_AFTER_HOURS = 120;

export interface GroupRecovery {
  group: MuscleGroup;
  /** 0 (just trained hard) to 100 (fresh). */
  score: number;
  /** Working sets in the last five days. */
  sets: number;
  /** Hours since the last working set, or undefined when none in five days. */
  hoursSince?: number;
}

/** When a workout's sets were done: its end, never later than now. */
const endOf = (w: WorkoutSession, now: number): number => Math.min(now, (w.startedAt ?? 0) + (w.durationSec ? w.durationSec * 1000 : (w.durationMinutes ?? 0) * 60_000));

export const strainFor = (rpe?: number): number => Math.max(0.4, ((rpe ?? 8) - 4) / 4);

export const computeRecovery = (workouts: WorkoutSession[], now: number = Date.now()): GroupRecovery[] => {
  const load: Record<string, number> = {};
  const sets: Record<string, number> = {};
  const last: Record<string, number> = {};
  for (const w of workouts) {
    if (!w.startedAt || !w.exercises?.length) continue;
    const t = endOf(w, now);
    const hours = Math.max(0, (now - t) / 3_600_000);
    if (hours > IGNORE_AFTER_HOURS) continue;
    for (const ex of w.exercises) {
      const g = getExercise(ex.exerciseId)?.muscle;
      if (!g || !(g in HALF_LIFE_HOURS)) continue;
      const done = ex.sets.filter((s) => isWorkingSet(s) && (s.reps > 0 || (s.seconds ?? 0) > 0));
      if (done.length === 0) continue;
      const decay = Math.pow(0.5, hours / HALF_LIFE_HOURS[g]);
      for (const s of done) load[g] = (load[g] ?? 0) + POINTS_PER_SET * strainFor(s.rpe) * decay;
      sets[g] = (sets[g] ?? 0) + done.length;
      last[g] = Math.min(last[g] ?? Infinity, hours);
    }
  }
  return RECOVERY_GROUPS.map((group) => ({
    group,
    score: Math.round(Math.max(0, Math.min(100, 100 - (load[group] ?? 0)))),
    sets: sets[group] ?? 0,
    hoursSince: last[group] === undefined ? undefined : Math.round(last[group]),
  }));
};

export type Split = 'push' | 'pull' | 'legs';

const SPLITS: Record<Split, MuscleGroup[]> = { push: ['Chest', 'Shoulders'], pull: ['Back', 'Arms'], legs: ['Legs', 'Glutes'] };

/** The split whose muscles are freshest right now, and how fresh. Nothing is suggested when you have not trained in five days. */
export const bestSplit = (rec: GroupRecovery[]): { split: Split; ready: number } | null => {
  if (rec.every((r) => r.sets === 0)) return null;
  const score = (g: MuscleGroup) => rec.find((r) => r.group === g)?.score ?? 100;
  const ranked = (Object.keys(SPLITS) as Split[]).map((split) => ({ split, ready: Math.round(SPLITS[split].reduce((s, g) => s + score(g), 0) / SPLITS[split].length) })).sort((a, b) => b.ready - a.ready);
  return ranked[0];
};

export type RecoveryState = 'fresh' | 'recovering' | 'rest';
export const stateOf = (score: number): RecoveryState => (score < 45 ? 'rest' : score < 80 ? 'recovering' : 'fresh');
