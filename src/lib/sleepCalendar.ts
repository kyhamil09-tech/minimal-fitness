import { SleepLogEntry } from '../types/health';
import { addDays, parseDateKey, startOfWeek, toDateKey } from './dates';
import { sleepScore } from './sleepMetrics';

/** How a night compares with your sleep goal: well short, a little short, on target, or a long one. */
export type SleepLevel = 'poor' | 'short' | 'good' | 'long';

/** The fractions of the goal where the colors change. */
export const LEVEL_EDGES = { poor: 0.7, short: 0.88, good: 1.2 } as const;

export const levelFor = (minutes: number, goalMin: number): SleepLevel => {
  const r = minutes / Math.max(60, goalMin);
  return r < LEVEL_EDGES.poor ? 'poor' : r < LEVEL_EDGES.short ? 'short' : r <= LEVEL_EDGES.good ? 'good' : 'long';
};

export const LEVEL_COLORS: Record<SleepLevel, string> = { poor: '#F28B82', short: '#FDD663', good: '#81C995', long: '#8AB4F8' };

export interface SleepCell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  /** The night that ends on this date (the longest, when more than one was recorded). */
  log?: SleepLogEntry;
  /** How many records there are for the date. */
  records: number;
  level?: SleepLevel;
  score?: number;
}

export interface SleepMonth {
  year: number;
  month: number;
  cells: SleepCell[];
  summary: {
    nights: number;
    avgMin: number;
    best: { date: string; minutes: number } | null;
    shortest: { date: string; minutes: number } | null;
    avgScore: number | null;
    /** Nights in the month under the "a bit short" line. */
    shortNights: number;
  };
}

/** One record for each date: the longest. */
export const byDate = (logs: SleepLogEntry[]): Map<string, { log: SleepLogEntry; records: number }> => {
  const m = new Map<string, { log: SleepLogEntry; records: number }>();
  for (const l of logs) {
    const cur = m.get(l.dateIso);
    if (!cur) m.set(l.dateIso, { log: l, records: 1 });
    else m.set(l.dateIso, { log: l.durationMinutes > cur.log.durationMinutes ? l : cur.log, records: cur.records + 1 });
  }
  return m;
};

/** A month as a grid of whole weeks (the week starts as the app's setting says), with a color for each night and the month's numbers. */
export const buildSleepMonth = (logs: SleepLogEntry[], year: number, month: number, goalMin: number, today: string): SleepMonth => {
  const dates = byDate(logs);
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells: SleepCell[] = [];
  for (let date = toDateKey(startOfWeek(first)); ; date = addDays(date, 1)) {
    const d = parseDateKey(date);
    if (d > last && cells.length % 7 === 0) break;
    const hit = dates.get(date);
    const inMonth = d.getMonth() === month && d.getFullYear() === year;
    cells.push({
      date,
      day: d.getDate(),
      inMonth,
      isToday: date === today,
      isFuture: date > today,
      log: hit?.log,
      records: hit?.records ?? 0,
      level: hit ? levelFor(hit.log.durationMinutes, goalMin) : undefined,
      score: hit ? sleepScore(hit.log, goalMin)?.score : undefined,
    });
  }
  const nights = cells.filter((c) => c.inMonth && c.log);
  const mins = nights.map((c) => ({ date: c.date, minutes: (c.log as SleepLogEntry).durationMinutes }));
  const scores = nights.map((c) => c.score).filter((s): s is number => typeof s === 'number');
  return {
    year,
    month,
    cells,
    summary: {
      nights: nights.length,
      avgMin: mins.length ? Math.round(mins.reduce((s, x) => s + x.minutes, 0) / mins.length) : 0,
      best: mins.length ? mins.reduce((b, x) => (x.minutes > b.minutes ? x : b)) : null,
      shortest: mins.length ? mins.reduce((b, x) => (x.minutes < b.minutes ? x : b)) : null,
      avgScore: scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
      shortNights: mins.filter((x) => levelFor(x.minutes, goalMin) === 'poor' || levelFor(x.minutes, goalMin) === 'short').length,
    },
  };
};

/** The first month with a night (the calendar does not go further back), or the current one when there are none. */
export const earliestMonth = (logs: SleepLogEntry[], today: string): { year: number; month: number } => {
  const keys = logs.map((l) => l.dateIso).sort();
  const d = parseDateKey(keys[0] ?? today);
  return { year: d.getFullYear(), month: d.getMonth() };
};

/** "7h 45m" or "7h" for a number of minutes. */
export const hoursText = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

/** The same, squeezed for a calendar cell: "7h45". */
export const hoursShort = (minutes: number): string => `${Math.floor(minutes / 60)}h${String(Math.round(minutes % 60)).padStart(2, '0')}`;
