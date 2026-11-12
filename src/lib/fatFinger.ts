import { estimate1RM } from './oneRepMax';

/**
 * The "fat finger" check for a weight just ticked off: typing 2250 for 225 is the classic slip, and it would wreck a record and the charts.
 * A weight is flagged when it implies a one-rep max more than half again above your best for that exercise, or, with no history, when it
 * is beyond anything a person lifts. All numbers are in the person's own units (the rule is the same in kg and lb).
 */

export interface WeightCheck {
  /** What they probably meant (a digit too many), or null when nothing sensible to offer. */
  suggest: number | null;
}

const OVER_BEST = 1.5;
const ABSOLUTE_KG = 1000;
const ABSOLUTE_LB = 2200;

export const checkWeight = (weight: number, reps: number, bestOneRepMax: number, unit: 'kg' | 'lb'): WeightCheck | null => {
  if (!(weight > 0)) return null;
  const e = estimate1RM(weight, Math.max(1, reps));
  const tooMuchForYou = bestOneRepMax > 0 && e > bestOneRepMax * OVER_BEST;
  const tooMuchForAnyone = weight > (unit === 'lb' ? ABSOLUTE_LB : ABSOLUTE_KG);
  if (!tooMuchForYou && !tooMuchForAnyone) return null;
  // A stray extra digit: drop it and see whether the result fits what they usually lift.
  const tenth = Math.round((weight / 10) * 2) / 2;
  const fits = tenth > 0 && (bestOneRepMax > 0 ? estimate1RM(tenth, Math.max(1, reps)) <= bestOneRepMax * OVER_BEST && estimate1RM(tenth, Math.max(1, reps)) >= bestOneRepMax * 0.2 : true);
  return { suggest: fits ? tenth : null };
};
