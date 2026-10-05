import { KEY_PREFIX } from '../hooks/usePersistentState';

/**
 * Earlier builds seeded every new install with demo workouts, sleep nights and fasts.
 * Those ids are removed from storage on launch so nobody inherits someone else's sample history.
 * Anything the user logged themselves has a different id and is left alone.
 */
const SEEDED_IDS: Record<string, string[]> = {
  workouts: ['w-1', 'w-2', 'w-3'],
  sleep_logs: ['sleep-today', 'sleep-yesterday', 'sleep-2days', 'sleep-3days', 'sleep-4days'],
  fasting_sessions: ['fast-today', 'fast-yesterday', 'fast-2days', 'fast-3days', 'fast-4days'],
};

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Returns how many seeded records were removed. */
export const removeLegacySeedData = (storage: Store): number => {
  let removed = 0;
  for (const [key, ids] of Object.entries(SEEDED_IDS)) {
    try {
      const raw = storage.getItem(KEY_PREFIX + key);
      if (raw === null) continue;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) continue;
      const kept = list.filter((item) => !(item && typeof item.id === 'string' && ids.includes(item.id)));
      if (kept.length !== list.length) {
        removed += list.length - kept.length;
        storage.setItem(KEY_PREFIX + key, JSON.stringify(kept));
      }
    } catch {
      // Unreadable value: leave it for the normal fallback handling.
    }
  }
  return removed;
};
