import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import type { WorkoutSession } from '../types/health';

/**
 * Workouts hold full GPS tracks and heart-rate series, which are by far the biggest thing the app stores, and browser storage
 * holds only about 5 MB. Before a workout is written its heavy parts are squeezed (zlib, then base64) into one field, and they are
 * expanded again when it is read. Backups copy the stored text as it is, so they stay small and restore exactly. A workout
 * written before this existed has plain fields and is read as before.
 */
export const COMPRESSED_FIELD = '_z';

/** Below this many points a track is too small to be worth squeezing. */
const MIN_POINTS = 60;

const HEAVY = ['track', 'hrSeries'] as const;

const toBase64 = (bytes: Uint8Array): string => {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
};

const fromBase64 = (b64: string): Uint8Array => {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

const worthSqueezing = (w: Record<string, unknown>): boolean => HEAVY.some((k) => Array.isArray(w[k]) && (w[k] as unknown[]).length >= MIN_POINTS);

// A workout is squeezed once: the result is remembered for as long as the same object is in use.
const squeezed = new WeakMap<object, Record<string, unknown>>();

/** One workout ready for storage. Returned as it is when it is small or already squeezed. */
export const encodeWorkout = (w: WorkoutSession): WorkoutSession => {
  const rec = w as unknown as Record<string, unknown>;
  if (typeof rec[COMPRESSED_FIELD] === 'string' || !worthSqueezing(rec)) return w;
  const cached = squeezed.get(w);
  if (cached) return cached as unknown as WorkoutSession;
  const heavy: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if ((HEAVY as readonly string[]).includes(k) && v !== undefined) heavy[k] = v;
    else rest[k] = v;
  }
  rest[COMPRESSED_FIELD] = toBase64(zlibSync(strToU8(JSON.stringify(heavy)), { level: 6 }));
  squeezed.set(w, rest);
  return rest as unknown as WorkoutSession;
};

/** One stored workout with its heavy parts put back. A damaged squeezed field is dropped, keeping the rest of the workout. */
export const decodeWorkout = (raw: unknown): WorkoutSession => {
  if (!raw || typeof raw !== 'object') return raw as WorkoutSession;
  const rec = raw as Record<string, unknown>;
  const z = rec[COMPRESSED_FIELD];
  if (typeof z !== 'string') return raw as WorkoutSession;
  const { [COMPRESSED_FIELD]: _gone, ...rest } = rec;
  try {
    const heavy = JSON.parse(strFromU8(unzlibSync(fromBase64(z)))) as Record<string, unknown>;
    return { ...rest, ...heavy } as unknown as WorkoutSession;
  } catch {
    return rest as unknown as WorkoutSession;
  }
};

export const encodeWorkouts = (list: WorkoutSession[]): WorkoutSession[] => (Array.isArray(list) ? list.map(encodeWorkout) : list);

export const decodeWorkouts = (raw: unknown): WorkoutSession[] => (Array.isArray(raw) ? raw.map(decodeWorkout) : []);

/** What usePersistentState uses for the workouts list. */
export const workoutsCodec = {
  encode: (v: WorkoutSession[]) => encodeWorkouts(v),
  decode: (raw: unknown) => decodeWorkouts(raw),
};
