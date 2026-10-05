import { WorkoutSession, WorkoutType } from '../types/health';
import {
  ActivityLevel,
  BodyEntry,
  ExerciseLog,
  FoodEntry,
  UserProfile,
} from '../types/tracking';
import { addDays, startOfWeek, toDateKey } from './dates';

/* ---------- Heart rate ---------- */

/** Tanaka formula: 208 - 0.7 * age. */
export const estimateMaxHr = (age: number) => Math.round(208 - 0.7 * age);

export const getMaxHr = (p: Pick<UserProfile, 'age' | 'maxHrOverride'>) =>
  p.maxHrOverride && p.maxHrOverride > 100 ? p.maxHrOverride : estimateMaxHr(p.age);

export type ZoneMethod = 'max' | 'reserve';

/**
 * How heart-rate zones are worked out. "max" uses a share of your highest heart rate. "reserve" (the Karvonen method) uses
 * a share of the gap between your resting and highest heart rate, so the zones fit your own fitness. The app sets this from
 * Settings and from your latest resting heart rate; the default keeps the plain percentage of max.
 */
const zoneConfig: { method: ZoneMethod; restHr: number } = { method: 'max', restHr: 60 };

export const setZoneConfig = (method: ZoneMethod, restHr: number) => {
  zoneConfig.method = method;
  if (Number.isFinite(restHr) && restHr >= 30 && restHr <= 110) zoneConfig.restHr = Math.round(restHr);
};

/** The resting heart rate the app is currently using (Health Connect first, then the watch, then your profile). */
export const currentRestingHr = () => zoneConfig.restHr;

/** The resting heart rate to use: a reading from Health Connect or the watch when there is one, otherwise the profile value. */
export const pickRestingHr = (profileRest: number, ...measured: (number | undefined)[]): number => {
  const m = measured.find((v) => typeof v === 'number' && v >= 30 && v <= 110);
  return m ?? profileRest;
};

/** Share of your effort range for a heart rate, 0 to 1+: of max, or of the reserve between resting and max. */
export const effortShare = (bpm: number, maxHr: number, restHr: number, method: ZoneMethod): number => {
  if (method === 'reserve' && maxHr > restHr) return (bpm - restHr) / (maxHr - restHr);
  return bpm / maxHr;
};

/** 1 (recovery) .. 5 (max). */
export const heartRateZone = (bpm: number, maxHr: number, restHr: number = zoneConfig.restHr, method: ZoneMethod = zoneConfig.method): 1 | 2 | 3 | 4 | 5 => {
  const pct = effortShare(bpm, maxHr, restHr, method);
  if (pct < 0.6) return 1;
  if (pct < 0.7) return 2;
  if (pct < 0.8) return 3;
  if (pct < 0.9) return 4;
  return 5;
};

/** The heart rate at which each zone starts: [zone 2, zone 3, zone 4, zone 5], for showing your own zones. */
export const zoneStarts = (maxHr: number, restHr: number = zoneConfig.restHr, method: ZoneMethod = zoneConfig.method): number[] =>
  [0.6, 0.7, 0.8, 0.9].map((p) => Math.round(method === 'reserve' && maxHr > restHr ? restHr + p * (maxHr - restHr) : p * maxHr));
export const ZONE_NAMES: Record<number, string> = {
  1: 'Recovery',
  2: 'Aerobic',
  3: 'Tempo',
  4: 'Threshold',
  5: 'Max',
};

/** Banister TRIMP (male coefficients, used for all sexes as a rough load score). */
export const trimp = (minutes: number, avgHr: number, maxHr: number, restHr: number) => {
  const reserve = maxHr - restHr;
  if (reserve <= 0 || minutes <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (avgHr - restHr) / reserve));
  return Math.round(minutes * ratio * 0.64 * Math.exp(1.92 * ratio));
};

/* ---------- Energy ---------- */

const MET: Record<WorkoutType, number> = {
  Walking: 3.5,
  Running: 9.8,
  Cycling: 7.5,
  Rowing: 7,
  Hiking: 6,
  Strength: 5,
  Calisthenics: 5.5,
  HIIT: 8,
  Core: 3.8,
  Mobility: 2.5,
  Treadmill: 9,
  IndoorCycling: 7,
  Elliptical: 5,
  Yoga: 2.5,
};

export const estimateCalories = (type: WorkoutType, minutes: number, weightKg: number) =>
  Math.round(MET[type] * weightKg * (minutes / 60));

/**
 * Calories from heart rate (Keytel et al., 2005), for when a watch or strap measured it. Only valid while exercising, roughly
 * 90 beats per minute and above. Without age and sex it cannot be used.
 */
export const caloriesFromHeartRate = (avgHr: number, minutes: number, p: Pick<UserProfile, 'weightKg' | 'age' | 'sex'>): number => {
  const male = (-55.0969 + 0.6309 * avgHr + 0.1988 * p.weightKg + 0.2017 * p.age) / 4.184;
  const female = (-20.4022 + 0.4472 * avgHr - 0.1263 * p.weightKg + 0.074 * p.age) / 4.184;
  const perMin = p.sex === 'male' ? male : p.sex === 'female' ? female : (male + female) / 2;
  return Math.max(0, Math.round(perMin * minutes));
};

/**
 * Energy for a workout the app measured itself. With a measured heart rate in the exercise range it uses the heart-rate
 * formula (limited to between half and double the MET figure, so one odd reading cannot give nonsense); otherwise the
 * activity's MET value, your weight and the time.
 */
export const estimateWorkoutCalories = (
  type: WorkoutType,
  minutes: number,
  p: Pick<UserProfile, 'weightKg' | 'age' | 'sex'>,
  avgHr?: number,
  hrMeasured = false
): number => {
  const met = estimateCalories(type, minutes, p.weightKg);
  if (!hrMeasured || !avgHr || avgHr < 90 || minutes <= 0) return met;
  const fromHr = caloriesFromHeartRate(avgHr, minutes, p);
  return Math.round(Math.min(met * 2, Math.max(met * 0.5, fromHr)));
};
export const bmr = (p: Pick<UserProfile, 'weightKg' | 'heightCm' | 'age' | 'sex'>) => {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  if (p.sex === 'male') return Math.round(base + 5);
  if (p.sex === 'female') return Math.round(base - 161);
  return Math.round(base - 78);
};

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

export const tdee = (p: Pick<UserProfile, 'weightKg' | 'heightCm' | 'age' | 'sex' | 'activityLevel'>) =>
  Math.round(bmr(p) * ACTIVITY_FACTOR[p.activityLevel]);

/* ---------- Body ---------- */

export const bmi = (weightKg: number, heightCm: number) => {
  const m = heightCm / 100;
  return m > 0 ? weightKg / (m * m) : 0;
};

export const bmiCategory = (value: number) => {
  if (value < 18.5) return 'Underweight';
  if (value < 25) return 'Healthy range';
  if (value < 30) return 'Overweight';
  return 'Obese range';
};

export const sortedBodyEntries = (entries: BodyEntry[]) =>
  [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/* ---------- Strength ---------- */

/** Epley one-rep-max estimate. */
export const estimateOneRepMax = (weightKg: number, reps: number) => {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
};

export const logVolumeKg = (log: ExerciseLog) =>
  log.sets.reduce((sum, s) => (s.done ? sum + s.reps * s.weightKg : sum), 0);

export const workoutVolumeKg = (w: WorkoutSession) =>
  (w.exercises || []).reduce((sum, e) => sum + logVolumeKg(e), 0);

export interface PersonalRecord {
  exerciseId: string;
  name: string;
  weightKg: number;
  reps: number;
  oneRepMax: number;
  achievedAt: number;
}

export const personalRecords = (workouts: WorkoutSession[]): Record<string, PersonalRecord> => {
  const records: Record<string, PersonalRecord> = {};
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      for (const s of ex.sets) {
        if (!s.done || s.weightKg <= 0 || s.reps <= 0) continue;
        const e1 = estimateOneRepMax(s.weightKg, s.reps);
        const cur = records[ex.exerciseId];
        if (!cur || e1 > cur.oneRepMax) {
          records[ex.exerciseId] = {
            exerciseId: ex.exerciseId,
            name: ex.name,
            weightKg: s.weightKg,
            reps: s.reps,
            oneRepMax: e1,
            achievedAt: w.startedAt || 0,
          };
        }
      }
    }
  }
  return records;
};

/** Names of exercises in `logs` whose best set beats the record held in `prior`. */
export const detectNewPRs = (prior: WorkoutSession[], logs: ExerciseLog[]): string[] => {
  const before = personalRecords(prior);
  const names: string[] = [];
  for (const ex of logs) {
    let best = 0;
    for (const s of ex.sets) {
      if (s.done) best = Math.max(best, estimateOneRepMax(s.weightKg, s.reps));
    }
    if (best <= 0) continue;
    const prev = before[ex.exerciseId];
    // First time logging an exercise is not announced as a PR.
    if (prev && best > prev.oneRepMax + 0.01) names.push(ex.name);
  }
  return names;
};

/** Most recent completed log for an exercise, used to prefill sets. */
export const lastLogFor = (workouts: WorkoutSession[], exerciseId: string): ExerciseLog | undefined => {
  let best: { t: number; log: ExerciseLog } | undefined;
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      if (ex.exerciseId === exerciseId && ex.sets.some((s) => s.done)) {
        const t = w.startedAt || 0;
        if (!best || t > best.t) best = { t, log: ex };
      }
    }
  }
  return best?.log;
};

/* ---------- Activity roll-ups ---------- */

export const workoutDateKey = (w: WorkoutSession) => (w.startedAt ? toDateKey(w.startedAt) : '');

export const workoutDateKeys = (workouts: WorkoutSession[]) => {
  const set = new Set<string>();
  for (const w of workouts) {
    const k = workoutDateKey(w);
    if (k) set.add(k);
  }
  return set;
};

export const currentStreak = (dateKeys: Set<string>, today: string): number => {
  let cursor = dateKeys.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dateKeys.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
};

export const longestStreak = (dateKeys: Set<string>): number => {
  const sorted = [...dateKeys].sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const k of sorted) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
};

export interface PeriodSummary {
  count: number;
  minutes: number;
  calories: number;
  trimp: number;
  distanceKm: number;
  volumeKg: number;
}

export const summarize = (workouts: WorkoutSession[]): PeriodSummary =>
  workouts.reduce<PeriodSummary>(
    (acc, w) => ({
      count: acc.count + 1,
      minutes: acc.minutes + w.durationMinutes,
      calories: acc.calories + w.caloriesBurned,
      trimp: acc.trimp + (w.cardioLoadPoints || 0),
      distanceKm: acc.distanceKm + (w.distanceKm || 0),
      volumeKg: acc.volumeKg + workoutVolumeKg(w),
    }),
    { count: 0, minutes: 0, calories: 0, trimp: 0, distanceKm: 0, volumeKg: 0 }
  );

export const workoutsInWeek = (workouts: WorkoutSession[], now: number = Date.now()) => {
  const start = startOfWeek(now).getTime();
  const end = start + 7 * 24 * 3600 * 1000;
  return workouts.filter((w) => w.startedAt && w.startedAt >= start && w.startedAt < end);
};

export const workoutsOnDay = (workouts: WorkoutSession[], key: string) =>
  workouts.filter((w) => workoutDateKey(w) === key);

/* ---------- Nutrition ---------- */

export const sumFood = (entries: FoodEntry[]) =>
  entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      proteinG: acc.proteinG + e.proteinG,
      carbsG: acc.carbsG + e.carbsG,
      fatG: acc.fatG + e.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
