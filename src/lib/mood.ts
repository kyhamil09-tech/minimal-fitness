import { FastingSession, SleepLogEntry, WorkoutSession } from '../types/health';
import { addDays, toDateKey } from './dates';

/** One day's check-in: how you feel and how much energy you have, each 1 to 5. Either can be missing. */
export interface MoodEntry {
  date: string;
  mood?: number;
  energy?: number;
  /** Epoch ms of the last tap. */
  at: number;
}

export const MOOD_LABELS = ['Low', 'Meh', 'Okay', 'Good', 'Great'] as const;
export const ENERGY_LABELS = ['Drained', 'Tired', 'Steady', 'Lively', 'Buzzing'] as const;

/** Sets one part of a day's check-in, keeping the other part and every other day. */
export const setCheckIn = (entries: MoodEntry[], date: string, part: 'mood' | 'energy', value: number, at: number): MoodEntry[] => {
  const v = Math.min(5, Math.max(1, Math.round(value)));
  const existing = entries.find((e) => e.date === date);
  const next: MoodEntry = { ...(existing ?? { date }), [part]: v, at } as MoodEntry;
  return [...entries.filter((e) => e.date !== date), next].sort((a, b) => a.date.localeCompare(b.date));
};

export interface MoodFactor {
  id: 'sleep' | 'training' | 'fasting';
  metric: 'mood' | 'energy';
  /** "When you slept 7 h or more", in words. */
  label: string;
  nWith: number;
  nWithout: number;
  withMean: number;
  withoutMean: number;
  /** With minus without, on the 1 to 5 scale. */
  diff: number;
}

/** Need this many check-ins before any pattern is looked for, and this many days on each side of a comparison. */
export const MIN_ENTRIES = 10;
export const MIN_SIDE = 4;
/** A difference smaller than this on the 5 point scale is not worth mentioning. */
export const MIN_DIFF = 0.4;

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * What goes with feeling better or worse, from your own days: a good night's sleep, having trained the day before, having ended a fast
 * that morning. Each is a plain comparison of averages with a minimum number of days on both sides. It shows a pattern, never a cause.
 */
export const moodFactors = (entries: MoodEntry[], sleep: SleepLogEntry[], workouts: WorkoutSession[], fasts: FastingSession[]): MoodFactor[] => {
  if (entries.length < MIN_ENTRIES) return [];
  const night = new Map<string, number>();
  for (const l of sleep) if (l.durationMinutes >= 120) night.set(l.dateIso, Math.max(night.get(l.dateIso) ?? 0, l.durationMinutes));
  const trained = new Set(workouts.filter((w) => w.startedAt).map((w) => toDateKey(w.startedAt as number)));
  const fastEnded = new Set(fasts.filter((f) => f.isCompleted && f.endTimestamp && (f.actualHours ?? 0) >= 14).map((f) => toDateKey(f.endTimestamp as number)));

  const tests: { id: MoodFactor['id']; label: string; flag: (date: string) => boolean | null }[] = [
    { id: 'sleep', label: 'after 7 h of sleep or more', flag: (d) => (night.has(d) ? (night.get(d) as number) >= 420 : null) },
    { id: 'training', label: 'the day after training', flag: (d) => trained.has(addDays(d, -1)) },
    { id: 'fasting', label: 'on mornings you ended a fast', flag: (d) => fastEnded.has(d) },
  ];
  const out: MoodFactor[] = [];
  for (const t of tests) {
    for (const metric of ['mood', 'energy'] as const) {
      const a: number[] = [];
      const b: number[] = [];
      for (const e of entries) {
        const v = e[metric];
        const f = t.flag(e.date);
        if (v === undefined || f === null) continue;
        (f ? a : b).push(v);
      }
      if (a.length < MIN_SIDE || b.length < MIN_SIDE) continue;
      const diff = mean(a) - mean(b);
      if (Math.abs(diff) < MIN_DIFF) continue;
      out.push({ id: t.id, metric, label: t.label, nWith: a.length, nWithout: b.length, withMean: r1(mean(a)), withoutMean: r1(mean(b)), diff: r1(diff) });
    }
  }
  return out.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
};
