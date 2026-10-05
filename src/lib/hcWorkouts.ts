import { WorkoutSession, WorkoutType } from '../types/health';
import { UserProfile } from '../types/tracking';
import { HcWorkout } from './native';
import { currentRestingHr, estimateCalories, getMaxHr, trimp } from './calc';
import { downsampleHr } from './workoutStats';

/**
 * Turns workouts that other apps wrote to Health Connect (the Google Health / Fitbit app above all) into this app's own workouts,
 * so they sit in the same list as the ones recorded here. Distance, calories and heart rate come across; the route does not, because
 * Android asks separately before one app may read another app's GPS route.
 */

/** Health Connect exercise type numbers (ExerciseSessionRecord.EXERCISE_TYPE_*) and the workout type each becomes. */
const TYPE_MAP: Record<number, WorkoutType> = {
  8: 'Cycling', // biking
  9: 'IndoorCycling', // biking, stationary
  13: 'Calisthenics',
  25: 'Elliptical',
  36: 'HIIT',
  37: 'Hiking',
  48: 'Mobility', // pilates
  53: 'Rowing',
  54: 'Rowing', // rowing machine
  56: 'Running',
  57: 'Treadmill',
  70: 'Strength',
  71: 'Mobility', // stretching
  79: 'Walking',
  81: 'Strength', // weightlifting
  83: 'Yoga',
};

export const workoutTypeFromHc = (type: number): WorkoutType => TYPE_MAP[type] ?? 'Calisthenics';

/** The app a workout came from, in words. */
export const sourceLabel = (pkg: string): string => {
  if (pkg === 'com.fitbit.FitbitMobile') return 'Google Health';
  if (pkg.includes('strava')) return 'Strava';
  if (pkg.includes('garmin')) return 'Garmin';
  if (pkg.includes('samsung')) return 'Samsung Health';
  if (pkg.includes('google')) return 'Google';
  return pkg;
};

export const hcWorkoutId = (id: string) => `hc-${id}`;

/** Converts one session. Returns null when it is too short or has no usable times. */
export const hcWorkoutToSession = (w: HcWorkout, profile: UserProfile): WorkoutSession | null => {
  const durationSec = Math.round((w.end - w.start) / 1000);
  if (!w.id || !(w.start > 0) || durationSec < 60) return null;
  const type = workoutTypeFromHc(w.type);
  const minutes = Math.max(1, Math.round(durationSec / 60));
  const hrSeries = downsampleHr((w.hr ?? []).filter(([, b]) => b > 30 && b < 230));
  const measuredHr = hrSeries.length > 5;
  const avgHr = w.hrAvg && w.hrAvg > 30 ? Math.round(w.hrAvg) : measuredHr ? Math.round(hrSeries.reduce((s, [, b]) => s + b, 0) / hrSeries.length) : 0;
  const maxHr = w.hrMax && w.hrMax > 30 ? Math.round(w.hrMax) : measuredHr ? Math.max(...hrSeries.map(([, b]) => b)) : undefined;
  const kcal = Math.round(w.totalKcal && w.totalKcal > 0 ? w.totalKcal : w.activeKcal && w.activeKcal > 0 ? w.activeKcal : estimateCalories(type, minutes, profile.weightKg));
  const source = sourceLabel(w.source);
  const note = [w.title.trim(), w.notes.trim()].filter(Boolean).join(': ');
  return {
    id: hcWorkoutId(w.id),
    type,
    timestamp: '',
    startedAt: w.start,
    durationMinutes: minutes,
    durationSec,
    distanceKm: w.distanceM && w.distanceM > 50 ? Number((w.distanceM / 1000).toFixed(3)) : undefined,
    avgHeartRate: avgHr || profile.restingHr,
    maxHeartRate: maxHr,
    hrSeries: measuredHr ? hrSeries : undefined,
    hrFromSensor: avgHr > 0,
    caloriesBurned: kcal,
    isManualEntry: false,
    notes: note ? `${note} (from ${source})` : `From ${source}`,
    cardioLoadPoints: avgHr > 0 ? trimp(minutes, avgHr, getMaxHr(profile), currentRestingHr()) : undefined,
    importedFrom: source,
  };
};

export const SEEN_KEY = 'hc_seen_workouts';

/** How far back the first import looks, and later ones. */
export const FIRST_DAYS = 90;
export const LATER_DAYS = 14;
export const PER_READ = 8;
