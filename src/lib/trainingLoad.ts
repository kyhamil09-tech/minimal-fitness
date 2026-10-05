import { WorkoutSession } from '../types/health';
import { addDays, lastNDayKeys, toDateKey } from './dates';

export type LoadStatusId = 'none' | 'building' | 'rest' | 'detraining' | 'productive' | 'high' | 'overreaching';

export interface LoadStatus {
  id: LoadStatusId;
  label: string;
  message: string;
  tone: 'neutral' | 'good' | 'warn' | 'bad';
  /** Training load of the last 7 days (sum of each workout's load score). */
  acute: number;
  /** Average weekly load over the last 4 weeks (or over the days there are, when fewer). */
  chronicWeekly: number;
  /** Last week against your usual week: 1.0 is the same as usual. Missing while the baseline is still being built. */
  ratio?: number;
  /** Load per day, oldest first, for the last 28 days. */
  daily: { date: string; load: number }[];
}

type LoadWorkout = Pick<WorkoutSession, 'startedAt' | 'cardioLoadPoints'>;

/** Load per local day for the last {@code days} days, oldest first. */
export const dailyLoad = (workouts: LoadWorkout[], days: number, today: string): { date: string; load: number }[] => {
  const byDay = new Map<string, number>();
  for (const w of workouts) {
    if (!w.startedAt || !w.cardioLoadPoints) continue;
    const key = toDateKey(w.startedAt);
    byDay.set(key, (byDay.get(key) ?? 0) + w.cardioLoadPoints);
  }
  return lastNDayKeys(days, today).map((date) => ({ date, load: byDay.get(date) ?? 0 }));
};

/** Days of history needed before the comparison with your usual training means anything. */
const BASELINE_DAYS = 14;

/**
 * Compares this week's training load with your usual week, to flag a jump that raises the risk of overtraining or injury
 * (the acute to chronic workload idea used in sport science). Load is each workout's TRIMP score from its duration and
 * heart rate. It is general guidance, not medical advice.
 */
export const trainingLoadStatus = (workouts: LoadWorkout[], today: string): LoadStatus => {
  const daily = dailyLoad(workouts, 28, today);
  const acute = daily.slice(-7).reduce((s, d) => s + d.load, 0);
  const withLoad = workouts.filter((w) => w.startedAt && w.cardioLoadPoints);
  if (withLoad.length === 0) {
    return { id: 'none', label: 'No data yet', message: 'Your training load appears after workouts recorded with a heart rate.', tone: 'neutral', acute: 0, chronicWeekly: 0, daily };
  }
  const first = toDateKey(Math.min(...withLoad.map((w) => w.startedAt as number)));
  const historyDays = Math.max(1, Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${first}T12:00:00`).getTime()) / 86_400_000) + 1);
  const window = Math.min(28, historyDays);
  const chronicWeekly = (daily.slice(-window).reduce((s, d) => s + d.load, 0) / window) * 7;
  const base = { acute: Math.round(acute), chronicWeekly: Math.round(chronicWeekly), daily };

  if (historyDays < BASELINE_DAYS) {
    return {
      ...base,
      id: 'building',
      label: 'Building your baseline',
      message: `Your usual training level needs about ${BASELINE_DAYS} days of workouts to learn. ${Math.max(1, BASELINE_DAYS - historyDays)} more to go.`,
      tone: 'neutral',
    };
  }
  if (chronicWeekly <= 0) {
    return { ...base, id: 'rest', label: 'Resting', message: 'No training load in the last four weeks. Start gently and build up.', tone: 'neutral' };
  }
  const ratio = acute / chronicWeekly;
  const r = Math.round(ratio * 100) / 100;
  if (ratio < 0.8) {
    return {
      ...base,
      ratio: r,
      id: 'detraining',
      label: 'Lighter than usual',
      message: 'You trained less this week than you usually do. Fine for recovery; add a session if you want to hold your fitness.',
      tone: 'neutral',
    };
  }
  if (ratio <= 1.3) {
    return { ...base, ratio: r, id: 'productive', label: 'In your zone', message: 'This week matches your recent training: a steady, sustainable build.', tone: 'good' };
  }
  if (ratio <= 1.5) {
    return {
      ...base,
      ratio: r,
      id: 'high',
      label: 'Ramping up fast',
      message: 'Your load is rising faster than your body is used to. Keep the next easy days easy.',
      tone: 'warn',
    };
  }
  return {
    ...base,
    ratio: r,
    id: 'overreaching',
    label: 'Overtraining risk',
    message: 'A big jump compared with your usual week. This is when overtraining and injuries happen: take an easier day or rest.',
    tone: 'bad',
  };
};

/** Used by tests and callers that need the date range the status covers. */
export const loadWindow = (today: string) => ({ from: addDays(today, -27), to: today });
