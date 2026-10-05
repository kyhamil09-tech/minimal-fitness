import { DayFitness } from './fitnessMetrics';
import { lastNDayKeys } from './dates';

/** Everything a health tile can open into. */
export type MetricId = 'steps' | 'distance' | 'kcal' | 'active' | 'exercise' | 'floors' | 'resting' | 'heart' | 'hrv' | 'weight' | 'water' | 'eaten';

export interface SeriesPoint {
  date: string;
  /** Missing when nothing was recorded that day. */
  value?: number;
}

export interface SeriesInput {
  /** The daily fitness numbers, oldest first (see buildFitnessDays). */
  days: DayFitness[];
  body: { date: string; weightKg: number }[];
  food: { date: string; calories: number }[];
  water: { date: string; ml: number }[];
}

const positive = (v: number | undefined): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

const fromDays = (days: DayFitness[], keys: string[], pick: (d: DayFitness) => number | undefined): SeriesPoint[] => {
  const byDate = new Map(days.map((d) => [d.date, d]));
  return keys.map((date) => ({ date, value: positive(pick(byDate.get(date) ?? ({ date } as DayFitness))) }));
};

/** The last `range` days of one number, one point per day, oldest first. Days with nothing recorded have no value. */
export const buildSeries = (id: MetricId, input: SeriesInput, range: number, today: string): SeriesPoint[] => {
  const keys = lastNDayKeys(range, today);
  switch (id) {
    case 'steps':
      return fromDays(input.days, keys, (d) => d.steps);
    case 'distance':
      return fromDays(input.days, keys, (d) => d.distanceKm);
    case 'kcal':
      return fromDays(input.days, keys, (d) => d.kcalTotal ?? d.kcalActive);
    case 'active':
      return fromDays(input.days, keys, (d) => d.kcalActive);
    case 'exercise':
      return fromDays(input.days, keys, (d) => d.exerciseMin);
    case 'floors':
      return fromDays(input.days, keys, (d) => d.floors);
    case 'resting':
      return fromDays(input.days, keys, (d) => d.restingHr);
    case 'heart':
      return fromDays(input.days, keys, (d) => d.hrAvg);
    case 'hrv':
      return fromDays(input.days, keys, (d) => d.hrvMs);
    case 'weight': {
      // The last weigh-in of each day.
      const last = new Map<string, number>();
      for (const b of input.body) last.set(b.date, b.weightKg);
      return keys.map((date) => ({ date, value: positive(last.get(date)) }));
    }
    case 'water': {
      const sum = new Map<string, number>();
      for (const w of input.water) sum.set(w.date, (sum.get(w.date) ?? 0) + w.ml);
      return keys.map((date) => ({ date, value: positive(sum.get(date)) }));
    }
    case 'eaten': {
      const sum = new Map<string, number>();
      for (const f of input.food) sum.set(f.date, (sum.get(f.date) ?? 0) + f.calories);
      return keys.map((date) => ({ date, value: positive(sum.get(date)) }));
    }
  }
};

export interface SeriesStats {
  /** Newest day that has a value. */
  latest?: number;
  latestDate?: string;
  /** Average over the days that have a value. */
  avg?: number;
  min?: number;
  max?: number;
  maxDate?: string;
  /** Total of all days (for sums such as steps or minutes). */
  total: number;
  /** Days that have a value. */
  count: number;
  /** The newest week's average against the days before it, in percent. Needs at least three earlier days with a value. */
  trendPct?: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const seriesStats = (series: SeriesPoint[]): SeriesStats => {
  const rows = series.filter((p): p is { date: string; value: number } => p.value !== undefined);
  if (rows.length === 0) return { total: 0, count: 0 };
  const values = rows.map((r) => r.value);
  const newest = rows[rows.length - 1];
  const best = rows.reduce((a, b) => (b.value > a.value ? b : a));
  const lastWeek = series.slice(-7).filter((p) => p.value !== undefined).map((p) => p.value as number);
  const before = series.slice(0, -7).filter((p) => p.value !== undefined).map((p) => p.value as number);
  return {
    latest: newest.value,
    latestDate: newest.date,
    avg: mean(values),
    min: Math.min(...values),
    max: best.value,
    maxDate: best.date,
    total: values.reduce((a, b) => a + b, 0),
    count: rows.length,
    trendPct:
      lastWeek.length > 0 && before.length >= 3 && mean(before) > 0
        ? Math.round(((mean(lastWeek) - mean(before)) / mean(before)) * 100)
        : undefined,
  };
};
