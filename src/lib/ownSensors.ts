import { registerPlugin } from '@capacitor/core';
import { isAndroidApp } from './native';
import { OwnDay } from './fitnessMetrics';
import { Buckets, bucketHr, bucketSteps, hrDayStats, mergeStates, replaceDays, restingFromBuckets } from './ownBuckets';
import { estimateNight } from './sleepEstimate';
import { readClassifyEvents, readSleepSegments } from './sleepDetect';
import { addDays, toDateKey, todayKey } from './dates';
import { SleepLogEntry } from '../types/health';
import { KEY_PREFIX, readStored } from '../hooks/usePersistentState';

/**
 * The app's own sensor data. The watch records heart rate, steps, calories, distance, floors and its asleep/awake state
 * all day by itself and hands them to the phone; the phone adds its own step counter and Sleep API readings. This turns
 * that raw material into daily numbers for the Fitness screen and estimated nights for the Sleep screen, without Google
 * Health or Health Connect.
 */
export interface RawVitals {
  /** [time ms, bpm] */
  hr: [number, number][];
  /** [time ms, steps so far today] */
  st: [number, number][];
  /** [time ms, state]: 2 asleep, 3 awake, 1 exercise, 0 unknown */
  as: [number, number][];
  daily: Record<string, { steps?: number; kcal?: number; dist?: number; floors?: number }>;
  lastSyncAt: number;
}

const Native = registerPlugin<{
  read(options: { sinceMs: number }): Promise<RawVitals>;
  status(): Promise<{ lastSyncAt: number }>;
}>('Vitals');

const ON_KEY = 'kyfit_own_sensors';

export const ownSensorsEnabled = (): boolean => {
  try {
    return localStorage.getItem(ON_KEY) !== 'false';
  } catch {
    return true;
  }
};

export const setOwnSensorsEnabled = (on: boolean) => {
  try {
    localStorage.setItem(ON_KEY, String(on));
  } catch {
    // storage unavailable
  }
};

const save = (key: string, value: unknown) => {
  try {
    localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full: the next sync rebuilds it from the phone's copy
  }
};

export interface OwnSync {
  own: Record<string, OwnDay>;
  estimates: SleepLogEntry[];
  /** When the watch last delivered anything. */
  watchSyncAt: number;
  /** Heart-rate readings the watch delivered for today. */
  hrToday: number;
}

interface SyncMeta {
  at: number;
  watchSyncAt: number;
}

const round = (v: number | undefined, digits = 0) => (v === undefined || !Number.isFinite(v) ? undefined : Math.round(v * 10 ** digits) / 10 ** digits);

/**
 * Reads what the watch delivered, refreshes the stored five-minute series and daily numbers, and estimates the last three
 * nights. Skips quickly when nothing new has arrived. Null when it is off, not on Android, or the plugin is not ready.
 */
export const syncOwnSensors = async (now = Date.now()): Promise<OwnSync | null> => {
  if (!isAndroidApp() || !ownSensorsEnabled()) return null;
  const meta = readStored<SyncMeta>('own_sync', { at: 0, watchSyncAt: 0 });
  let status: { lastSyncAt: number };
  try {
    status = await Native.status();
  } catch {
    return null;
  }
  if (status.lastSyncAt === meta.watchSyncAt && now - meta.at < 15 * 60_000) return null;

  // Whole days are replaced, so start from the beginning of the day three days ago.
  const since = new Date(now);
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 3);
  let raw: RawVitals;
  try {
    raw = await Native.read({ sinceMs: since.getTime() });
  } catch {
    return null;
  }

  const hrStore = replaceDays(readStored<Buckets>('own_hr', {}), bucketHr(raw.hr));
  const stepStore = replaceDays(readStored<Buckets>('own_steps', {}), bucketSteps(raw.st));
  const states = mergeStates(readStored<[number, number][]>('own_states', []), raw.as, now);
  save('own_hr', hrStore);
  save('own_steps', stepStore);
  save('own_states', states);
  save('own_sync', { at: now, watchSyncAt: status.lastSyncAt } satisfies SyncMeta);

  const own: Record<string, OwnDay> = { ...readStored<Record<string, OwnDay>>('own_daily', {}) };
  for (const [date, s] of Object.entries(hrDayStats(raw.hr))) {
    own[date] = { ...own[date], ...s, restingHr: restingFromBuckets(hrStore[date]) ?? own[date]?.restingHr };
  }
  for (const [date, d] of Object.entries(raw.daily ?? {})) {
    own[date] = {
      ...own[date],
      steps: d.steps ? Math.round(d.steps) : own[date]?.steps,
      kcal: d.kcal ? Math.round(d.kcal) : own[date]?.kcal,
      distanceKm: d.dist ? round(d.dist / 1000, 2) : own[date]?.distanceKm,
      floors: d.floors ? Math.round(d.floors) : own[date]?.floors,
    };
  }
  const keepFrom = addDays(todayKey(), -60);
  for (const date of Object.keys(own)) if (date < keepFrom) delete own[date];

  const [classify, phoneSegments] = await Promise.all([readClassifyEvents(), readSleepSegments()]);
  const estimates: SleepLogEntry[] = [];
  for (let back = 0; back < 3; back++) {
    const night = estimateNight({ wakeDate: addDays(todayKey(), -back), hr: hrStore, steps: stepStore, states, classify, phoneSegments, now });
    if (night) estimates.push(night);
  }
  return {
    own,
    estimates,
    watchSyncAt: raw.lastSyncAt,
    hrToday: raw.hr.filter(([t]) => toDateKey(t) === todayKey()).length,
  };
};
