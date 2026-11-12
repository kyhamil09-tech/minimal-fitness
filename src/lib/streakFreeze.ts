import { streakFrom } from './calc';
import { addDays } from './dates';

/** Freezes available in each calendar month. A frozen day keeps the streak alive without adding a day to it. */
export const FREEZES_PER_MONTH = 2;
/** A streak shorter than this is not worth protecting with a freeze. */
export const MIN_STREAK_TO_FREEZE = 3;

const month = (key: string) => key.slice(0, 7);

export const freezesLeft = (frozen: readonly string[], key: string): number => Math.max(0, FREEZES_PER_MONTH - frozen.filter((k) => month(k) === month(key)).length);

export interface FreezeOffer {
  /** The day that would be frozen. */
  key: string;
  kind: 'today' | 'yesterday';
  /** The streak that would be protected. */
  streak: number;
  left: number;
}

/**
 * When to offer a freeze: today, if nothing is logged yet and a streak of three days or more is running; or yesterday, if it was missed
 * and a streak of that length ended the day before. Needs a freeze left in that day's month. Null when there is nothing to protect.
 */
export const freezeOffer = (workoutKeys: Set<string>, frozen: readonly string[], today: string): FreezeOffer | null => {
  const fz = new Set(frozen);
  const free = (k: string) => !workoutKeys.has(k) && !fz.has(k);
  const yesterday = addDays(today, -1);
  if (free(today)) {
    const streak = streakFrom(workoutKeys, fz, yesterday);
    const left = freezesLeft(frozen, today);
    if (streak >= MIN_STREAK_TO_FREEZE && left > 0) return { key: today, kind: 'today', streak, left };
  }
  if (free(yesterday)) {
    const streak = streakFrom(workoutKeys, fz, addDays(today, -2));
    const left = freezesLeft(frozen, yesterday);
    if (streak >= MIN_STREAK_TO_FREEZE && left > 0) return { key: yesterday, kind: 'yesterday', streak, left };
  }
  return null;
};

export const addFreeze = (frozen: readonly string[], key: string): string[] => [...new Set([...frozen, key])].sort();
