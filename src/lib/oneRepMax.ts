import type { SetLog } from '../types/tracking';

/**
 * Estimating a one-rep max (1RM) from a lighter set. Three ways, in the order they are used:
 *  1. When you logged how hard the set was (RPE), a chart of the percent of your 1RM that a number of reps at that effort usually is
 *     (the Tuchscherer-style table lifters use for RPE training): 1RM = weight / percent.
 *  2. Otherwise a formula on the weight and reps: Epley (weight x (1 + reps / 30)), or Brzycki (weight x 36 / (37 - reps)).
 *  3. One rep at full effort is the weight itself.
 * These are estimates. They get less reliable above about ten reps.
 */

export type OneRepMaxFormula = 'epley' | 'brzycki';

export const epley = (weight: number, reps: number): number => (reps <= 1 ? weight : weight * (1 + reps / 30));

export const brzycki = (weight: number, reps: number): number => (reps <= 1 ? weight : reps >= 37 ? epley(weight, reps) : (weight * 36) / (37 - reps));

/** RPE columns of the chart, from hardest to easiest. */
export const RPE_STEPS = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6] as const;

/** Percent of 1RM for 1 to 10 reps at each RPE in {@link RPE_STEPS}. */
export const RPE_CHART: number[][] = [
  [100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3],
  [95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85, 83.7],
  [92.2, 90.7, 89.2, 87.8, 86.3, 85, 83.7, 82.4, 81.1],
  [89.2, 87.8, 86.3, 85, 83.7, 82.4, 81.1, 79.9, 78.6],
  [86.3, 85, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2],
  [83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9],
  [81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9, 72.3, 70.7],
  [78.6, 77.4, 76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68],
  [76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68, 66.7, 65.3],
  [73.9, 72.3, 70.7, 69.4, 68, 66.7, 65.3, 64, 62.6],
];

/** The fraction of 1RM (0 to 1) for `reps` at `rpe`, between chart values for in-between efforts. Undefined outside 1 to 10 reps or RPE 6 to 10. */
export const rpePercent = (reps: number, rpe: number): number | undefined => {
  const r = Math.round(reps);
  if (r < 1 || r > 10 || !(rpe >= 6 && rpe <= 10)) return undefined;
  const row = RPE_CHART[r - 1];
  const pos = (10 - rpe) / 0.5; // 0 at RPE 10, 8 at RPE 6
  const lo = Math.floor(pos);
  const hi = Math.min(RPE_STEPS.length - 1, Math.ceil(pos));
  const t = pos - lo;
  return (row[lo] * (1 - t) + row[hi] * t) / 100;
};

let chosen: OneRepMaxFormula = 'epley';

/** Which formula is used when there is no RPE. The app sets this from Settings. */
export const setOneRepMaxFormula = (f: OneRepMaxFormula) => {
  chosen = f;
};

export const oneRepMaxFormula = (): OneRepMaxFormula => chosen;

/** Estimated 1RM for a weight lifted for some reps, using the RPE chart when an RPE is given and sensible, else the chosen formula. */
export const estimate1RM = (weight: number, reps: number, opts: { rpe?: number; formula?: OneRepMaxFormula } = {}): number => {
  if (!(weight > 0) || !(reps > 0)) return 0;
  if (opts.rpe !== undefined) {
    const pct = rpePercent(reps, opts.rpe);
    if (pct) return weight / pct;
  }
  if (reps === 1) return weight;
  return (opts.formula ?? chosen) === 'brzycki' ? brzycki(weight, reps) : epley(weight, reps);
};

/** The estimated 1RM of a logged set, using its effort when it has one. Warm-ups and holds are the caller's business. */
export const setOneRepMax = (s: Pick<SetLog, 'weightKg' | 'reps' | 'rpe'>): number => estimate1RM(s.weightKg, s.reps, { rpe: s.rpe });

/** A hard set for the weekly muscle count: finished work at effort 7 or more, or with no effort logged (counted as hard). */
export const isHardSet = (s: Pick<SetLog, 'rpe'>): boolean => s.rpe === undefined || s.rpe >= 7;

/** Reps in reserve from an RPE (RPE 8 is two reps left). */
export const rirFromRpe = (rpe: number): number => Math.max(0, Math.round((10 - rpe) * 2) / 2);
