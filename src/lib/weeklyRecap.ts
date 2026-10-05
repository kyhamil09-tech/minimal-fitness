import { SleepLogEntry, WorkoutSession } from '../types/health';
import { addDays, toDateKey } from './dates';
import { sleepScore } from './sleepMetrics';

export interface RecapTotals {
  workouts: number;
  distanceKm: number;
  minutes: number;
  kcal: number;
  /** Sum of the workouts' training load scores. */
  load: number;
  activeDays: number;
  /** Average time asleep per recorded night, in minutes (0 when no night was recorded). */
  sleepAvgMin: number;
  sleepNights: number;
  /** Average of the app's sleep score over the nights that have one, or 0. */
  sleepScoreAvg: number;
}

export interface Recap {
  /** First and last day of the week shown (local date keys). */
  from: string;
  to: string;
  /** The same number of days, one week earlier. */
  prevFrom: string;
  prevTo: string;
  /** Days of the week covered so far (7 for a finished week). */
  days: number;
  current: RecapTotals;
  previous: RecapTotals;
  longest?: { type: string; minutes: number; km?: number };
  headline: string;
}

type RecapWorkout = Pick<WorkoutSession, 'startedAt' | 'timestamp' | 'durationMinutes' | 'distanceKm' | 'caloriesBurned' | 'cardioLoadPoints' | 'type'>;

const dayOf = (w: RecapWorkout) => toDateKey(w.startedAt ?? new Date(w.timestamp).getTime());

const totalsFor = (workouts: RecapWorkout[], sleepLogs: SleepLogEntry[], from: string, to: string): RecapTotals => {
  const inRange = workouts.filter((w) => {
    const k = dayOf(w);
    return k >= from && k <= to;
  });
  const nights = new Map<string, SleepLogEntry>();
  for (const l of sleepLogs) {
    if (l.dateIso < from || l.dateIso > to) continue;
    const prev = nights.get(l.dateIso);
    if (!prev || l.durationMinutes > prev.durationMinutes) nights.set(l.dateIso, l);
  }
  const nightList = [...nights.values()];
  const scores = nightList.map((l) => sleepScore(l)?.score).filter((s): s is number => typeof s === 'number');
  return {
    workouts: inRange.length,
    distanceKm: inRange.reduce((s, w) => s + (w.distanceKm || 0), 0),
    minutes: inRange.reduce((s, w) => s + (w.durationMinutes || 0), 0),
    kcal: inRange.reduce((s, w) => s + (w.caloriesBurned || 0), 0),
    load: inRange.reduce((s, w) => s + (w.cardioLoadPoints || 0), 0),
    activeDays: new Set(inRange.map(dayOf)).size,
    sleepAvgMin: nightList.length ? nightList.reduce((s, l) => s + l.durationMinutes, 0) / nightList.length : 0,
    sleepNights: nightList.length,
    sleepScoreAvg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
  };
};

/** Percent change, or undefined when there is nothing to compare with. */
export const changePct = (now: number, before: number): number | undefined =>
  before > 0 ? Math.round(((now - before) / before) * 100) : undefined;

/**
 * Summary of one week against the week before. {@code weekStart} is the first day of the week shown. For the week still
 * in progress only the days so far are counted, and the earlier week is cut to the same number of days so the comparison is fair.
 */
export const weeklyRecap = (workouts: RecapWorkout[], sleepLogs: SleepLogEntry[], weekStart: string, today: string): Recap => {
  const fullEnd = addDays(weekStart, 6);
  const to = today < fullEnd ? today : fullEnd;
  const days = Math.max(1, Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${weekStart}T12:00:00`).getTime()) / 86_400_000) + 1);
  const prevFrom = addDays(weekStart, -7);
  const prevTo = addDays(prevFrom, days - 1);
  const current = totalsFor(workouts, sleepLogs, weekStart, to);
  const previous = totalsFor(workouts, sleepLogs, prevFrom, prevTo);
  const inRange = workouts.filter((w) => {
    const k = dayOf(w);
    return k >= weekStart && k <= to;
  });
  const longestW = inRange.sort((a, b) => (b.durationMinutes || 0) - (a.durationMinutes || 0))[0];
  const headline = buildHeadline(current, previous);
  return {
    from: weekStart,
    to,
    prevFrom,
    prevTo,
    days,
    current,
    previous,
    longest: longestW ? { type: longestW.type, minutes: longestW.durationMinutes, km: longestW.distanceKm } : undefined,
    headline,
  };
};

const buildHeadline = (c: RecapTotals, p: RecapTotals): string => {
  if (c.workouts === 0) return p.workouts > 0 ? 'No workouts yet this week. Last week you did ' + p.workouts + '.' : 'No workouts recorded this week.';
  const dist = changePct(c.distanceKm, p.distanceKm);
  const mins = changePct(c.minutes, p.minutes);
  const lead = dist !== undefined && c.distanceKm > 0 ? { what: 'distance', pct: dist } : mins !== undefined ? { what: 'time active', pct: mins } : null;
  if (!lead) return `${c.workouts} workout${c.workouts === 1 ? '' : 's'} on ${c.activeDays} day${c.activeDays === 1 ? '' : 's'}. Nothing earlier to compare with yet.`;
  if (Math.abs(lead.pct) < 5) return `Steady: your ${lead.what} matches the week before.`;
  return lead.pct > 0 ? `Your ${lead.what} is up ${lead.pct}% on the week before.` : `Your ${lead.what} is down ${Math.abs(lead.pct)}% on the week before.`;
};
