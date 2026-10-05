import { HcFitnessDay } from './native';
import { WorkoutSession } from '../types/health';
import { lastNDayKeys, toDateKey } from './dates';

/** What the app's own watch and phone sensors measured for one day (see ownSensors.ts). */
export interface OwnDay {
  steps?: number;
  kcal?: number;
  distanceKm?: number;
  floors?: number;
  hrMin?: number;
  hrAvg?: number;
  hrMax?: number;
  restingHr?: number;
}

/** One day of every fitness number the app can show, each missing when no source had it. */
export interface DayFitness {
  date: string;
  steps?: number;
  distanceKm?: number;
  kcalTotal?: number;
  kcalActive?: number;
  exerciseMin?: number;
  floors?: number;
  restingHr?: number;
  hrAvg?: number;
  hrMin?: number;
  hrMax?: number;
  hrvMs?: number;
}

export interface FitnessInputs {
  /** Number of days to build, ending today. */
  days: number;
  today: string;
  /** Steps per day from every step source (the highest wins). */
  steps: Record<string, number>;
  /** Health Connect daily totals. */
  hcDaily: Record<string, { totalKcal: number; activeKcal: number; distanceKm: number; avgHr: number }>;
  hcFitness: Record<string, HcFitnessDay>;
  own: Record<string, OwnDay>;
  workouts: Pick<WorkoutSession, 'startedAt' | 'durationMinutes' | 'distanceKm' | 'caloriesBurned'>[];
}

const positive = (v: number | undefined | null): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

/** The largest of the values that exist: every source can only under-count a day. */
const most = (...xs: (number | undefined | null)[]): number | undefined => {
  const ok = xs.map(positive).filter((v): v is number => v !== undefined);
  return ok.length ? Math.max(...ok) : undefined;
};

/** The first value that exists, so a reading from one device is not blended with another's. */
const first = (...xs: (number | undefined | null)[]): number | undefined => xs.map(positive).find((v) => v !== undefined);

const round = (v: number | undefined, digits = 0): number | undefined =>
  v === undefined ? undefined : Math.round(v * 10 ** digits) / 10 ** digits;

/**
 * Builds the daily series for the Fitness screen from every source. Sums (steps, distance, calories, exercise
 * minutes, floors) take the largest source, since each source can only miss activity. Readings (heart rate, HRV)
 * come from Health Connect first and fall back to the app's own sensors.
 */
export const buildFitnessDays = (input: FitnessInputs): DayFitness[] => {
  const workoutsByDay = new Map<string, { min: number; km: number; kcal: number }>();
  for (const w of input.workouts) {
    if (!w.startedAt) continue;
    const key = toDateKey(w.startedAt);
    const cur = workoutsByDay.get(key) ?? { min: 0, km: 0, kcal: 0 };
    cur.min += w.durationMinutes || 0;
    cur.km += w.distanceKm || 0;
    cur.kcal += w.caloriesBurned || 0;
    workoutsByDay.set(key, cur);
  }

  return lastNDayKeys(input.days, input.today).map((date) => {
    const hc = input.hcDaily[date];
    const fit = input.hcFitness[date];
    const own = input.own[date];
    const wk = workoutsByDay.get(date);
    return {
      date,
      steps: most(input.steps[date], own?.steps),
      distanceKm: round(most(hc?.distanceKm, own?.distanceKm, wk?.km), 2),
      kcalTotal: round(most(hc?.totalKcal, own?.kcal)),
      kcalActive: round(most(hc?.activeKcal, wk?.kcal)),
      exerciseMin: round(most(fit?.exerciseMin, wk?.min)),
      floors: round(most(fit?.floors, own?.floors)),
      restingHr: round(first(fit?.restingHr, own?.restingHr)),
      hrAvg: round(first(fit?.hrAvg, hc?.avgHr, own?.hrAvg)),
      hrMin: round(first(fit?.hrMin, own?.hrMin)),
      hrMax: round(first(fit?.hrMax, own?.hrMax)),
      hrvMs: round(first(fit?.hrvMs), 1),
    };
  });
};

export interface MetricSummary {
  /** Newest day that has a value. */
  latest?: number;
  latestDate?: string;
  /** Average over the days that have a value. */
  avg?: number;
  min?: number;
  max?: number;
  /** Days with a value. */
  count: number;
  /** Average of the most recent week against the days before it, in percent (needs both). */
  trendPct?: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const summarize = (days: DayFitness[], pick: (d: DayFitness) => number | undefined): MetricSummary => {
  const rows = days.map((d) => ({ date: d.date, v: pick(d) })).filter((r): r is { date: string; v: number } => r.v !== undefined);
  if (rows.length === 0) return { count: 0 };
  const values = rows.map((r) => r.v);
  const newest = rows[rows.length - 1];
  const recent = rows.slice(-7).map((r) => r.v);
  const earlier = rows.slice(0, -7).map((r) => r.v);
  return {
    latest: newest.v,
    latestDate: newest.date,
    avg: mean(values),
    min: Math.min(...values),
    max: Math.max(...values),
    count: rows.length,
    trendPct: earlier.length >= 3 && mean(earlier) > 0 ? Math.round(((mean(recent) - mean(earlier)) / mean(earlier)) * 100) : undefined,
  };
};
