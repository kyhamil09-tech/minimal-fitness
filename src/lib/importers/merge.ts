import { SleepLogEntry, WorkoutSession } from '../../types/health';

const same = (a: WorkoutSession, b: WorkoutSession): boolean => {
  const ta = a.startedAt ?? new Date(a.timestamp).getTime();
  const tb = b.startedAt ?? new Date(b.timestamp).getTime();
  if (!ta || !tb) return a.id === b.id;
  if (a.id === b.id) return true;
  // Starts within 3 minutes: the same session recorded twice (an app plus a watch, or an export you already imported).
  if (Math.abs(ta - tb) <= 3 * 60_000) {
    const da = a.distanceKm ?? 0;
    const db = b.distanceKm ?? 0;
    if (da === 0 || db === 0) return true;
    return Math.abs(da - db) / Math.max(da, db) < 0.25;
  }
  // One starts while the other is still going and they cover nearly the same ground.
  const endA = ta + (a.durationSec ?? a.durationMinutes * 60) * 1000;
  const endB = tb + (b.durationSec ?? b.durationMinutes * 60) * 1000;
  const overlap = Math.min(endA, endB) - Math.max(ta, tb);
  const shorter = Math.min(endA - ta, endB - tb);
  if (overlap > shorter * 0.8) {
    const da = a.distanceKm ?? 0;
    const db = b.distanceKm ?? 0;
    return da > 0 && db > 0 && Math.abs(da - db) / Math.max(da, db) < 0.15;
  }
  return false;
};

export interface MergeResult {
  merged: WorkoutSession[];
  added: WorkoutSession[];
  duplicates: number;
}

/** Adds imported workouts to the log, skipping any that match one already there (or one earlier in the same import). Newest first. */
export const mergeImportedWorkouts = (existing: WorkoutSession[], imported: WorkoutSession[]): MergeResult => {
  const added: WorkoutSession[] = [];
  let duplicates = 0;
  const known = [...existing];
  // Oldest first so the first copy of a duplicate pair wins, whichever order the files came in.
  const ordered = [...imported].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
  for (const w of ordered) {
    if (known.some((k) => same(k, w))) {
      duplicates++;
      continue;
    }
    known.push(w);
    added.push(w);
  }
  const merged = [...existing, ...added].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  return { merged, added, duplicates };
};

export interface SleepMergeResult {
  merged: SleepLogEntry[];
  added: number;
  duplicates: number;
}

/** Adds imported nights for dates that have no night yet: a night your watch recorded is never replaced by an old export. */
export const mergeImportedNights = (existing: SleepLogEntry[], imported: SleepLogEntry[]): SleepMergeResult => {
  const taken = new Set(existing.map((l) => l.dateIso));
  let added = 0;
  let duplicates = 0;
  const fresh: SleepLogEntry[] = [];
  const byDate = new Map<string, SleepLogEntry>();
  for (const l of imported) {
    const prev = byDate.get(l.dateIso);
    if (!prev || l.durationMinutes > prev.durationMinutes) byDate.set(l.dateIso, l);
  }
  for (const l of byDate.values()) {
    if (taken.has(l.dateIso)) {
      duplicates++;
      continue;
    }
    fresh.push(l);
    added++;
  }
  const merged = [...existing, ...fresh].sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0));
  return { merged, added, duplicates };
};
