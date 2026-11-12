import { SetLog } from '../types/tracking';
import { isWorkingSet } from './sets';

/**
 * Automatic progression for an exercise: "add 2.5 when every set reaches 8 reps". The rule is kept per exercise, in the person's own
 * units, and is checked when a workout starts, against what was done last time.
 */
export interface ProgressionRule {
  /** How much to add, in display units (kg or lb). */
  step: number;
  /** Every working set last time must have reached at least this many reps. */
  reps: number;
}

export type ProgressionRules = Record<string, ProgressionRule>;

export const isValidRule = (r: Partial<ProgressionRule> | undefined): r is ProgressionRule => !!r && typeof r.step === 'number' && r.step > 0 && typeof r.reps === 'number' && r.reps >= 1;

/**
 * The weight to start from now, in display units, or null when the rule does not apply (nothing to compare with, or a set fell short).
 * `lastSets` are the sets from the last session, in kg; `toDisplay` converts a kg weight to display units.
 */
export const progressedWeight = (lastSets: SetLog[] | undefined, rule: ProgressionRule | undefined, toDisplay: (kg: number) => number): number | null => {
  if (!lastSets || !isValidRule(rule)) return null;
  const work = lastSets.filter((s) => isWorkingSet(s) && s.weightKg > 0 && s.reps > 0);
  if (work.length === 0) return null;
  if (!work.every((s) => s.reps >= rule.reps)) return null;
  const top = Math.max(...work.map((s) => toDisplay(s.weightKg)));
  return Math.round((top + rule.step) * 100) / 100;
};
