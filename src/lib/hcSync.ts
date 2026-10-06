import type { WorkoutSession } from '../types/health';

/** How far back "send unsynced workouts" looks, so switching Health Connect on never floods it with years of history. */
export const UNSYNCED_DAYS = 90;

/** The shortest workout the write code sends (shorter ones are skipped there too, so they are never "waiting"). */
const MIN_SECONDS = 30;

/**
 * Workouts that were never saved to Health Connect, newest first. Left out: ones that came from Health Connect, files or other
 * apps (they already live somewhere else), ones with no start time, ones too short to send, and anything older than
 * {@link UNSYNCED_DAYS} days.
 */
export const unsyncedWorkouts = (workouts: WorkoutSession[], now: number, days = UNSYNCED_DAYS): WorkoutSession[] =>
  workouts
    .filter((w) => {
      if (w.syncedToHc || w.importedFrom || w.id.startsWith('hc-')) return false;
      if (!w.startedAt || now - w.startedAt > days * 86_400_000) return false;
      return (w.durationSec ?? w.durationMinutes * 60) >= MIN_SECONDS;
    })
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));

/** Marks the given workouts as saved to Health Connect. Returns the same list when nothing changed. */
export const markSynced = (workouts: WorkoutSession[], ids: Set<string>): WorkoutSession[] =>
  ids.size === 0 || !workouts.some((w) => ids.has(w.id) && !w.syncedToHc)
    ? workouts
    : workouts.map((w) => (ids.has(w.id) ? { ...w, syncedToHc: true } : w));
