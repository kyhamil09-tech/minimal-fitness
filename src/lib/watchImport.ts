import { Lap, WorkoutSession, WorkoutType } from '../types/health';
import { UserProfile } from '../types/tracking';
import { TrackPoint, decimateRoute } from './geo';
import { currentRestingHr, getMaxHr, trimp } from './calc';
import { downsampleHr } from './workoutStats';

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
}

const TYPES: WorkoutType[] = ['Walking', 'Running', 'Cycling', 'Rowing', 'Hiking', 'Strength', 'Calisthenics', 'HIIT', 'Core', 'Mobility', 'Treadmill', 'IndoorCycling', 'Elliptical', 'Yoga'];

export const watchImportId = (p: { id: string }) => `w-watch-${p.id}`;

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
    cardioLoadPoints: avgHr > 0 ? trimp(minutes, avgHr, maxHrProfile, currentRestingHr()) : undefined,
    laps: laps.length > 0 ? laps : undefined,
    // The shoes or bike picked on the watch, so the mileage lands on the right pair.
    shoeId: typeof p.shoeId === 'string' && p.shoeId && p.shoeId !== 'none' ? p.shoeId : undefined,
  };
};

/** Adds imported workouts that are not already saved. Newest first. */
export const mergeWatchWorkouts = (existing: WorkoutSession[], incoming: WorkoutSession[]): WorkoutSession[] => {
  const have = new Set(existing.map((w) => w.id));
  const fresh = incoming.filter((w) => !have.has(w.id));
  return fresh.length === 0 ? existing : [...fresh, ...existing].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
};