import { addDays, toDateKey } from './dates';

/**
 * Optional, manual cycle tracking, kept only on this phone. You log the first day of each period; the app estimates where you are in
 * your cycle and offers training and recovery notes for the phase. It is an estimate from your own dates, not a medical tool, and
 * not for contraception. Nothing here is read from or written to Health Connect.
 */

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export interface CycleStatus {
  /** Day of the cycle, 1 on the first day of the period. */
  day: number;
  cycleLength: number;
  phase: CyclePhase;
  label: string;
  /** Estimated first day of the next period (date key). */
  nextPeriod: string;
  daysToNext: number;
  /** Whether the length is your own average (from at least 3 logged cycles) or the usual 28. */
  personal: boolean;
  tip: string;
  /** Extra context for the readiness reading, or null. */
  readinessNote: string | null;
}

const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000);

/** Logged period start dates, oldest first, one per date, each at least 15 days after the last. */
export const cleanStarts = (starts: string[]): string[] => {
  const out: string[] = [];
  for (const s of [...new Set(starts.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort()) {
    if (out.length === 0 || daysBetween(out[out.length - 1], s) >= 15) out.push(s);
  }
  return out;
};

/** Your usual cycle length: the median of the last gaps when there are at least 3 cycles, else 28. */
export const usualLength = (starts: string[]): { length: number; personal: boolean } => {
  const s = cleanStarts(starts);
  const gaps: number[] = [];
  for (let i = 1; i < s.length; i++) gaps.push(daysBetween(s[i - 1], s[i]));
  const recent = gaps.filter((g) => g >= 20 && g <= 45).slice(-6);
  if (recent.length < 3) return { length: 28, personal: false };
  const sorted = [...recent].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return { length: Math.round(sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2), personal: true };
};

const TIPS: Record<CyclePhase, { label: string; tip: string }> = {
  menstrual: { label: 'Period', tip: 'Energy can be lower. Train by feel: easy and moderate sessions are fine, and a rest day is fine too. Iron-rich food and sleep help.' },
  follicular: { label: 'Follicular phase', tip: 'Energy and recovery are often at their best. A good window for harder sessions, intervals and new strength work.' },
  ovulation: { label: 'Around ovulation', tip: 'Power is often high, but joints can be a little looser. Warm up well, and keep landing and cutting movements controlled.' },
  luteal: { label: 'Luteal phase', tip: 'Body temperature and resting heart rate run a little higher and recovery can feel slower. Keep easy days easy, drink more, and expect long hard efforts to feel harder.' },
};

export const cycleStatus = (startsRaw: string[], today: string): CycleStatus | null => {
  const starts = cleanStarts(startsRaw).filter((s) => s <= today);
  if (starts.length === 0) return null;
  const { length, personal } = usualLength(starts);
  const last = starts[starts.length - 1];
  const since = daysBetween(last, today);
  // A start long ago with nothing logged since: the cycle is no longer known.
  if (since > length + 14) return null;
  const day = (since % length) + 1;
  const ovulationDay = length - 14;
  const phase: CyclePhase = day <= 5 ? 'menstrual' : day < ovulationDay - 1 ? 'follicular' : day <= ovulationDay + 1 ? 'ovulation' : 'luteal';
  const nextPeriod = addDays(last, Math.max(length, since >= length ? Math.ceil((since + 1) / length) * length : length));
  const t = TIPS[phase];
  return {
    day,
    cycleLength: length,
    phase,
    label: t.label,
    nextPeriod,
    daysToNext: Math.max(0, daysBetween(today, nextPeriod)),
    personal,
    tip: t.tip,
    readinessNote: phase === 'luteal' ? 'You are in the luteal phase, when resting heart rate is often a few beats higher and HRV a little lower. A slightly lower readiness here can be normal for you.' : null,
  };
};

export const todayStart = (d: Date = new Date()) => toDateKey(d);
