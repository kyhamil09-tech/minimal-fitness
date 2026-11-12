import { SetLog } from '../types/tracking';
import { isWorkingSet } from './sets';
import { rpePercent } from './oneRepMax';

/**
 * Weights from effort: what to put on the bar for the next set to land near a target effort (RPE), and whether last session's weights
 * felt easy or hard. It rests on the usual RPE chart, which is a good guide and not a promise: how a set feels varies day to day.
 */

export const DEFAULT_TARGET_RPE = 8;
export const TARGET_RPE_RANGE = { min: 6.5, max: 9.5, step: 0.5 };

const roundTo = (kg: number, step: number) => (step > 0 ? Math.round(kg / step) * step : kg);

/** Estimated one-rep max from a set with an effort, by the RPE chart. Null when the set cannot be used (no effort, 11+ reps, RPE outside 6 to 10). */
export const e1rmFromEffort = (s: Pick<SetLog, 'weightKg' | 'reps' | 'rpe'>): number | null => {
  if (!(s.weightKg > 0) || !(s.reps >= 1) || s.rpe === undefined) return null;
  const pct = rpePercent(s.reps, s.rpe);
  return pct && pct > 0 ? s.weightKg / pct : null;
};

/**
 * The weight (kg, rounded to `stepKg`) for the next set of the same reps to land at `targetRpe`, from a set just done at some effort.
 * Null when there is nothing to go on, or when the answer is the same weight (so a suggestion is only shown when it says something).
 */
export const nextSetWeightKg = (done: Pick<SetLog, 'weightKg' | 'reps' | 'rpe'>, targetRpe: number, stepKg = 2.5): number | null => {
  const e1 = e1rmFromEffort(done);
  const pct = rpePercent(done.reps, targetRpe);
  if (e1 === null || !pct) return null;
  const next = roundTo(e1 * pct, stepKg);
  if (!(next > 0) || Math.abs(next - done.weightKg) < stepKg / 2) return null;
  return Math.round(next * 100) / 100;
};

export interface EffortNudge {
  dir: 'up' | 'down' | 'same';
  /** The average effort of last session's working sets that had one. */
  avgRpe: number;
  sets: number;
}

/** Whether last session's working sets felt easier or harder than the target: a full point under means "try more", a full point over, "ease off". */
export const effortNudge = (lastSets: SetLog[] | undefined, targetRpe: number): EffortNudge | null => {
  const rated = (lastSets ?? []).filter((s) => isWorkingSet(s) && s.weightKg > 0 && s.rpe !== undefined && s.rpe >= 5);
  if (rated.length < 2) return null;
  const avg = rated.reduce((t, s) => t + (s.rpe as number), 0) / rated.length;
  const diff = avg - targetRpe;
  return { dir: diff <= -1 ? 'up' : diff >= 1 ? 'down' : 'same', avgRpe: Math.round(avg * 10) / 10, sets: rated.length };
};
