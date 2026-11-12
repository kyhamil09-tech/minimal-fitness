import { FastingSession, WorkoutSession } from '../types/health';
import { addDays, toDateKey } from './dates';
import { longestStreak } from './calc';

export interface YearReview {
  year: number;
  workouts: number;
  minutes: number;
  distanceKm: number;
  calories: number;
  activeDays: number;
  /** Workouts in each month, January first. */
  byMonth: number[];
  bestMonth: { month: number; count: number } | null;
  topSports: { type: string; count: number; minutes: number }[];
  longest: { km: number; type: string; date: string } | null;
  biggestWeek: { km: number; from: string } | null;
  longestStreak: number;
  fasts: { count: number; longestHours: number };
}

/** Years that have at least one workout, newest first. */
export const yearsWithData = (workouts: WorkoutSession[]): number[] =>
  [...new Set(workouts.filter((w) => w.startedAt).map((w) => new Date(w.startedAt as number).getFullYear()))].sort((a, b) => b - a);

const mondayOf = (ts: number) => {
  const key = toDateKey(ts);
  const day = (new Date(ts).getDay() + 6) % 7;
  return addDays(key, -day);
};

/** A year in numbers, from what is logged on this phone. Null when the year has no workouts. */
export const yearReview = (workouts: WorkoutSession[], fasts: FastingSession[], year: number): YearReview | null => {
  const inYear = workouts.filter((w) => w.startedAt && new Date(w.startedAt).getFullYear() === year);
  if (inYear.length === 0) return null;
  const byMonth = Array<number>(12).fill(0);
  const days = new Set<string>();
  const sports = new Map<string, { count: number; minutes: number }>();
  const weeks = new Map<string, number>();
  let minutes = 0;
  let distanceKm = 0;
  let calories = 0;
  let longest: YearReview['longest'] = null;
  for (const w of inYear) {
    const at = w.startedAt as number;
    byMonth[new Date(at).getMonth()] += 1;
    days.add(toDateKey(at));
    const m = w.durationSec ? w.durationSec / 60 : w.durationMinutes;
    minutes += m;
    calories += w.caloriesBurned || 0;
    const s = sports.get(w.type) ?? { count: 0, minutes: 0 };
    sports.set(w.type, { count: s.count + 1, minutes: s.minutes + m });
    const km = w.distanceKm ?? 0;
    distanceKm += km;
    if (km > 0) {
      weeks.set(mondayOf(at), (weeks.get(mondayOf(at)) ?? 0) + km);
      if (!longest || km > longest.km) longest = { km, type: w.type, date: toDateKey(at) };
    }
  }
  const bestIdx = byMonth.reduce((best, c, i) => (c > byMonth[best] ? i : best), 0);
  const bigWeek = [...weeks.entries()].sort((a, b) => b[1] - a[1])[0];
  const done = fasts.filter((f) => f.isCompleted && f.endTimestamp && new Date(f.endTimestamp).getFullYear() === year);
  return {
    year,
    workouts: inYear.length,
    minutes: Math.round(minutes),
    distanceKm: Math.round(distanceKm * 10) / 10,
    calories: Math.round(calories),
    activeDays: days.size,
    byMonth,
    bestMonth: byMonth[bestIdx] > 0 ? { month: bestIdx, count: byMonth[bestIdx] } : null,
    topSports: [...sports.entries()].map(([type, v]) => ({ type, count: v.count, minutes: Math.round(v.minutes) })).sort((a, b) => b.count - a.count || b.minutes - a.minutes).slice(0, 3),
    longest,
    biggestWeek: bigWeek ? { km: Math.round(bigWeek[1] * 10) / 10, from: bigWeek[0] } : null,
    longestStreak: longestStreak(days),
    fasts: { count: done.length, longestHours: Math.round(Math.max(0, ...done.map((f) => f.actualHours ?? 0)) * 10) / 10 },
  };
};
