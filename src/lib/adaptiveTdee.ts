import { addDays } from './dates';
import type { BodyEntry, FoodEntry } from '../types/tracking';
import { KCAL_PER_KG } from './energyPlan';

/**
 * Your own maintenance calories, measured instead of guessed. A smoothed "trend weight" removes the day-to-day noise of the scale
 * (water, salt, the last meal), and what you actually ate over the last two weeks, set against how much that trend moved, gives what
 * your body really burns: intake minus the energy of the weight change. It needs about two weeks of weighing and food logging, and until
 * then the guide keeps using the formula from your profile.
 */

/** A change smaller than this (kg) in the trend counts as no change at all. */
const TREND_EPSILON = 0.00019950214;
/** The trend follows the scale over about ten days. */
const ALPHA = 2 / (10 + 1);
export const WINDOW_DAYS = 14;
/** Logged calories under this make a day look like part of a day, so it is left out. */
const MIN_LOGGED_KCAL = 800;
const MIN_FOOD_DAYS = 10;
const MIN_WEIGH_INS = 5;

export interface TrendPoint {
  date: string;
  /** What the scale said that day, when it was used. */
  scaleKg?: number;
  trendKg: number;
}

export interface AdaptiveResult {
  confidence: 'calibrating' | 'locked';
  /** The smoothed weight now, and the last scale reading. */
  latestTrendKg?: number;
  latestScaleKg?: number;
  /** How much the trend moved, kg a week (negative when losing). */
  weeklyChangeKg?: number;
  /** Measured maintenance, kcal a day, once locked. */
  maintenanceKcal?: number;
  /** The measured figure was held to a believable range around the formula. */
  clamped?: boolean;
  /** Progress while calibrating, and what the figure rests on once locked. */
  foodDays: number;
  weighIns: number;
  trend: TrendPoint[];
}

/** One weight a day: when a day has several, the last one entered wins. */
const lastPerDay = (entries: Pick<BodyEntry, 'date' | 'weightKg'>[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const e of entries) if (e.weightKg > 0) m.set(e.date, e.weightKg);
  return m;
};

/** Calories logged on each day. */
export const intakeByDay = (food: Pick<FoodEntry, 'date' | 'calories'>[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const f of food) out[f.date] = (out[f.date] ?? 0) + f.calories;
  return out;
};

/**
 * The trend weight for every day from the first weigh-in to `today` (days without a weigh-in keep yesterday's trend), and, with
 * enough weighing and food logging in the last two weeks, your measured maintenance.
 * `formulaKcal` is the profile-based figure; the result is kept within 60% to 160% of it so one strange fortnight cannot give nonsense.
 */
export const adaptiveTdee = (body: Pick<BodyEntry, 'date' | 'weightKg'>[], intake: Record<string, number>, today: string, formulaKcal: number): AdaptiveResult => {
  const weights = lastPerDay(body);
  const dates = [...weights.keys()].filter((d) => d <= today).sort();
  const trend: TrendPoint[] = [];
  if (dates.length > 0) {
    let ema = 0;
    for (let d = dates[0]; d <= today; d = addDays(d, 1)) {
      const w = weights.get(d);
      if (w !== undefined) ema = ema === 0 ? w : w * ALPHA + ema * (1 - ALPHA);
      trend.push({ date: d, scaleKg: w, trendKg: Math.round(ema * 100) / 100 });
    }
  }
  const latest = trend[trend.length - 1];
  const latestScale = [...trend].reverse().find((p) => p.scaleKg !== undefined)?.scaleKg;

  // The window is the two weeks before today: today's food is not finished yet.
  const windowEnd = addDays(today, -1);
  const windowStart = addDays(windowEnd, -(WINDOW_DAYS - 1));
  const foodDays: number[] = [];
  for (let d = windowStart; d <= windowEnd; d = addDays(d, 1)) {
    const k = intake[d];
    if (k !== undefined && k >= MIN_LOGGED_KCAL) foodDays.push(k);
  }
  const weighIns = [...weights.keys()].filter((d) => d >= windowStart && d <= today).length;
  const base: AdaptiveResult = { confidence: 'calibrating', latestTrendKg: latest?.trendKg, latestScaleKg: latestScale, foodDays: foodDays.length, weighIns, trend };

  const before = trend.find((p) => p.date === addDays(windowStart, -1)) ?? trend.find((p) => p.date === windowStart);
  const startedEarlyEnough = !!before && !!dates[0] && dates[0] <= addDays(windowStart, 2);
  if (!latest || !before || !startedEarlyEnough || foodDays.length < MIN_FOOD_DAYS || weighIns < MIN_WEIGH_INS) return base;

  const days = Math.max(1, Math.round((Date.parse(latest.date) - Date.parse(before.date)) / 86_400_000));
  let delta = latest.trendKg - before.trendKg;
  if (Math.abs(delta) < TREND_EPSILON) delta = 0;
  const avgIntake = foodDays.reduce((a, b) => a + b, 0) / foodDays.length;
  const raw = avgIntake - (delta * KCAL_PER_KG) / days;
  const lo = formulaKcal * 0.6;
  const hi = formulaKcal * 1.6;
  const maintenanceKcal = Math.round(Math.min(hi, Math.max(lo, raw)) / 5) * 5;
  return { ...base, confidence: 'locked', weeklyChangeKg: Math.round(((delta / days) * 7) * 100) / 100, maintenanceKcal, clamped: raw < lo || raw > hi };
};
