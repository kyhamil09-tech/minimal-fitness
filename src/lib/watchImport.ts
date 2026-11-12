import { Lap, WorkoutSession, WorkoutType } from '../types/health';
import { ExerciseLog, UserProfile } from '../types/tracking';
import { getExercise } from '../data/exercises';
import { TrackPoint, decimateRoute } from './geo';
import { currentRestingHr, getMaxHr, trimp } from './calc';
import { downsampleHr } from './workoutStats';
import { mergeTracks } from './trackMerge';

/** A workout recorded on the watch on its own (phone left behind), as sent by the watch app. */
export interface WatchWorkoutPayload {
  id: string;
  type: string;
  startedAt: number;
  durationSec: number;
  distanceM?: number;
  elevGainM?: number;
  avgHr?: number;
  maxHr?: number;
  kcal?: number;
  /** [epoch ms, lat, lng, altitude | null, cumulative km] */
  track?: (number | null)[][];
  /** [epoch ms, bpm] */
  hr?: number[][];
  /** [lap number, epoch ms, cumulative km, split seconds] */
  laps?: number[][];
  /** The shoes or bike picked on the watch before it started. */
  shoeId?: string;
  /** A strength session run on the watch alone: each exercise with its done sets as [reps, weight in kg]. */
  exercises?: { id: string; n: string; sets: number[][] }[];
  /** Recorded while the phone was recording the same workout: only its route is used, to fill gaps in the phone's. */
  shared?: boolean;
}

const TYPES: WorkoutType[] = ['Walking', 'Running', 'Cycling', 'Rowing', 'Hiking', 'Strength', 'Calisthenics', 'HIIT', 'Core', 'Mobility', 'Treadmill', 'IndoorCycling', 'Elliptical', 'Yoga', 'Swimming', 'OpenWaterSwim', 'StairClimbing', 'Dance', 'Pilates', 'Stretching', 'AlpineSkiing', 'CrossCountrySkiing', 'Snowboarding', 'Snowshoeing', 'IceSkating', 'Kayaking', 'Paddleboarding'];

export const watchImportId = (p: { id: string }) => `w-watch-${p.id}`;

/** The sets a watch-only strength session logged, as this app's exercise logs. Names are taken from the library when the id is known. */
const strengthLogs = (p: WatchWorkoutPayload): ExerciseLog[] | undefined => {
  const out: ExerciseLog[] = [];
  for (const e of p.exercises ?? []) {
    const sets = (e.sets ?? [])
      .filter((s) => s.length >= 2 && s[0] > 0)
      .map((s) => ({ reps: Math.round(s[0]), weightKg: Math.max(0, s[1]), done: true }));
    if (sets.length === 0) continue;
    const known = e.id ? getExercise(e.id) : undefined;
    const slug = (e.n || 'exercise').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    out.push({ exerciseId: known ? known.id : `watch-${slug}`, name: known?.name ?? (e.n || 'Exercise'), sets });
  }
  return out.length > 0 ? out : undefined;
};

/** Converts a payload from the watch into a saved workout. Returns null if it is unusable. */
export const watchWorkoutToSession = (p: WatchWorkoutPayload, profile: UserProfile): WorkoutSession | null => {
  if (!p || !p.id || !p.startedAt || !(p.durationSec > 0)) return null;
  const type = (TYPES as string[]).includes(p.type) ? (p.type as WorkoutType) : 'Calisthenics';
  const track: TrackPoint[] = (p.track ?? [])
    .filter((r) => r.length >= 5 && r[0] != null && r[1] != null && r[2] != null)
    .map((r) => ({ t: r[0] as number, lat: r[1] as number, lng: r[2] as number, alt: r[3] == null ? undefined : (r[3] as number), d: (r[4] as number) ?? 0 }));
  const hasRoute = track.length >= 2;
  const hrSeries = downsampleHr((p.hr ?? []).map((r): [number, number] => [r[0], r[1]]).filter(([, b]) => b > 30 && b < 230));
  const minutes = Math.max(1, Math.round(p.durationSec / 60));
  const maxHrProfile = getMaxHr(profile);
  const avgHr = p.avgHr && p.avgHr > 0 ? p.avgHr : hrSeries.length ? Math.round(hrSeries.reduce((s, [, b]) => s + b, 0) / hrSeries.length) : 0;
  const laps: Lap[] = (p.laps ?? []).map((l) => ({ n: l[0], t: l[1], distanceKm: l[2], splitSec: l[3] }));
  const distanceKm = p.distanceM && p.distanceM > 20 ? Number((p.distanceM / 1000).toFixed(3)) : hasRoute ? track[track.length - 1].d : undefined;

  return {
    id: watchImportId(p),
    type,
    timestamp: '',
    startedAt: p.startedAt,
    durationMinutes: minutes,
    durationSec: Math.round(p.durationSec),
    distanceKm,
    gpsTracked: hasRoute,
    route: hasRoute ? decimateRoute(track.map((t): [number, number] => [t.lat, t.lng]), 300) : undefined,
    track: hasRoute ? track : undefined,
    elevationGainM: p.elevGainM && p.elevGainM > 0 ? Math.round(p.elevGainM) : undefined,
    avgHeartRate: avgHr || profile.restingHr,
    maxHeartRate: p.maxHr && p.maxHr > 0 ? p.maxHr : hrSeries.length ? Math.max(...hrSeries.map(([, b]) => b)) : undefined,
    hrSeries: hrSeries.length > 5 ? hrSeries : undefined,
    hrFromSensor: hrSeries.length > 5 || avgHr > 0,
    caloriesBurned: Math.round(p.kcal ?? 0),
    isManualEntry: false,
    notes: 'Recorded on your watch',
    exercises: strengthLogs(p),
    cardioLoadPoints: avgHr > 0 ? trimp(minutes, avgHr, maxHrProfile, currentRestingHr()) : undefined,
    laps: laps.length > 0 ? laps : undefined,
    // The shoes or bike picked on the watch, so the mileage lands on the right pair.
    shoeId: typeof p.shoeId === 'string' && p.shoeId && p.shoeId !== 'none' ? p.shoeId : undefined,
  };
};

/** How far apart the two devices' start times may be and still count as the same workout. */
const SAME_WORKOUT_MS = 3 * 60_000;

/** The watch's route points from a payload. */
const payloadTrack = (p: WatchWorkoutPayload): TrackPoint[] =>
  (p.track ?? [])
    .filter((r) => r.length >= 5 && r[0] != null && r[1] != null && r[2] != null)
    .map((r) => ({ t: r[0] as number, lat: r[1] as number, lng: r[2] as number, alt: r[3] == null ? undefined : (r[3] as number), d: (r[4] as number) ?? 0 }));

export interface TrackFill {
  workouts: WorkoutSession[];
  /** The phone's workout was found, whether or not the watch had anything to add. */
  matched: boolean;
  /** Points added from the watch. */
  filled: number;
}

/**
 * For a workout both devices recorded: fills gaps in the phone's route (pocket, tunnel, lost fix) with the watch's points and
 * recalculates the distance to match. The phone's own record stays the main one, and is only changed where it had no fix.
 */
export const fillTrackFromWatch = (workouts: WorkoutSession[], p: WatchWorkoutPayload): TrackFill => {
  const idx = workouts.findIndex(
    (w) => !w.id.startsWith('w-watch-') && w.startedAt !== undefined && Math.abs(w.startedAt - p.startedAt) <= SAME_WORKOUT_MS
  );
  if (idx < 0) return { workouts, matched: false, filled: 0 };
  const mine = workouts[idx];
  const merged = mergeTracks(mine.track ?? [], payloadTrack(p));
  if (merged.filled === 0) return { workouts, matched: true, filled: 0 };
  const next = [...workouts];
  next[idx] = {
    ...mine,
    gpsTracked: true,
    track: merged.track,
    route: decimateRoute(merged.track.map((t): [number, number] => [t.lat, t.lng]), 300),
    distanceKm: Number(merged.distanceKm.toFixed(3)),
  };
  return { workouts: next, matched: true, filled: merged.filled };
};

/** Adds imported workouts that are not already saved. Newest first. */
export const mergeWatchWorkouts = (existing: WorkoutSession[], incoming: WorkoutSession[]): WorkoutSession[] => {
  const have = new Set(existing.map((w) => w.id));
  const fresh = incoming.filter((w) => !have.has(w.id));
  return fresh.length === 0 ? existing : [...fresh, ...existing].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
};




