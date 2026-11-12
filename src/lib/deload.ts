import { WorkoutSession } from '../types/health';
import { SetLog } from '../types/tracking';
import { startOfMondayWeek, toDateKey } from './dates';
import { isWorkingSet, workingVolumeKg } from './sets';
import { estimate1RM } from './oneRepMax';
import { BIG_LIFTS } from './liftStats';

/**
 * Deload week suggestions: after a long run of hard weeks, when the big lifts stop going up, or when the effort you log keeps climbing,
 * an easy week (about 10% lighter, about half the sets) lets the body catch up. These are signs, not a diagnosis: they only ever
 * suggest, and a week off or an easy week is always the person's call.
 */

export const DELOAD_FACTOR = 0.9;
export const deloadSets = (n: number): number => Math.max(1, Math.ceil(n / 2));
/** A weight for a deload week, in kg, to the nearest half. */
export const deloadWeightKg = (kg: number): number => Math.round(kg * DELOAD_FACTOR * 2) / 2;

const DAY = 86_400_000;
const msOf = (w: WorkoutSession) => w.startedAt ?? Date.parse(w.timestamp);

export interface WeekLoad {
  /** Monday of the week, YYYY-MM-DD. */
  week: string;
  sessions: number;
  volumeKg: number;
  /** Average effort of the working sets that had one, and how many did. */
  avgRpe: number | null;
  rated: number;
}

/** The last `weeks` weeks, newest first, with how much lifting was done in each. */
export const weekLoads = (workouts: WorkoutSession[], now: number, weeks = 10): WeekLoad[] => {
  const thisMonday = startOfMondayWeek(now).getTime();
  const out: WeekLoad[] = [];
  for (let i = 0; i < weeks; i++) {
    const from = thisMonday - i * 7 * DAY;
    const to = from + 7 * DAY;
    let sessions = 0;
    let volume = 0;
    let rpeSum = 0;
    let rated = 0;
    for (const w of workouts) {
      const t = msOf(w);
      if (!(t >= from && t < to) || !w.exercises?.length) continue;
      const vol = w.exercises.reduce((s, e) => s + workingVolumeKg(e), 0);
      const sets = w.exercises.flatMap((e) => e.sets.filter(isWorkingSet));
      if (sets.length === 0) continue;
      sessions++;
      volume += vol;
      for (const s of sets) if (s.rpe !== undefined) { rpeSum += s.rpe; rated++; }
    }
    out.push({ week: toDateKey(from), sessions, volumeKg: Math.round(volume), avgRpe: rated > 0 ? Math.round((rpeSum / rated) * 10) / 10 : null, rated });
  }
  return out;
};

/** How many weeks in a row (newest first, this week counted only once it has a session) had two or more lifting sessions. */
export const hardWeeksInARow = (loads: WeekLoad[]): number => {
  let i = loads[0] && loads[0].sessions === 0 ? 1 : 0;
  let n = 0;
  for (; i < loads.length; i++) {
    if (loads[i].sessions >= 2) n++;
    else break;
  }
  return n;
};

const bestE1rm = (sets: SetLog[]): number => sets.filter(isWorkingSet).reduce((m, s) => Math.max(m, s.weightKg > 0 && s.reps > 0 ? estimate1RM(s.weightKg, s.reps, { rpe: s.rpe }) : 0), 0);

/** Big lifts whose last two sessions came in under the three before them by more than 3%. */
export const dippingLifts = (workouts: WorkoutSession[], now: number, days = 56): string[] => {
  const since = now - days * DAY;
  const out: string[] = [];
  for (const lift of BIG_LIFTS) {
    const sessions = workouts
      .filter((w) => msOf(w) >= since && msOf(w) <= now)
      .map((w) => ({ at: msOf(w), e1: bestE1rm((w.exercises ?? []).filter((e) => e.exerciseId === lift.id).flatMap((e) => e.sets)) }))
      .filter((s) => s.e1 > 0)
      .sort((a, b) => b.at - a.at);
    if (sessions.length < 5) continue;
    const recent = (sessions[0].e1 + sessions[1].e1) / 2;
    const before = (sessions[2].e1 + sessions[3].e1 + sessions[4].e1) / 3;
    if (recent < before * 0.97) out.push(lift.label);
  }
  return out;
};

export interface DeloadAdvice {
  verdict: 'ok' | 'watch' | 'deload';
  reasons: string[];
  weeksOn: number;
}

export const deloadAdvice = (workouts: WorkoutSession[], now: number): DeloadAdvice => {
  const loads = weekLoads(workouts, now, 10);
  const weeksOn = hardWeeksInARow(loads);
  const reasons: string[] = [];
  let signals = 0;
  if (weeksOn >= 5) {
    signals++;
    reasons.push(`${weeksOn} weeks in a row with two or more lifting sessions.`);
  }
  const dips = dippingLifts(workouts, now);
  if (dips.length > 0) {
    signals++;
    reasons.push(`${dips.join(' and ')} ${dips.length === 1 ? 'has' : 'have'} slipped over the last two sessions.`);
  }
  // Effort has crept up: the last two weeks average 9 or more, and half a point above the weeks before.
  const recent = loads.slice(0, 2).filter((l) => l.rated > 0);
  const earlier = loads.slice(2, 6).filter((l) => l.rated > 0);
  if (recent.length > 0 && earlier.length > 0) {
    const r = recent.reduce((s, l) => s + (l.avgRpe as number) * l.rated, 0) / recent.reduce((s, l) => s + l.rated, 0);
    const e = earlier.reduce((s, l) => s + (l.avgRpe as number) * l.rated, 0) / earlier.reduce((s, l) => s + l.rated, 0);
    if (recent.reduce((s, l) => s + l.rated, 0) >= 12 && r >= 9 && r - e >= 0.5) {
      signals++;
      reasons.push(`Your sets have felt harder lately (average effort ${Math.round(r * 10) / 10}, up from ${Math.round(e * 10) / 10}).`);
    }
  }
  const verdict = signals >= 2 || weeksOn >= 8 ? 'deload' : signals === 1 ? 'watch' : 'ok';
  return { verdict, reasons, weeksOn };
};

export interface DeloadState {
  /** The deload week lasts until this time (epoch ms), or 0 when none is on. */
  until: number;
  /** The suggestion is hidden until this time. */
  snoozedUntil: number;
}

export const DEFAULT_DELOAD: DeloadState = { until: 0, snoozedUntil: 0 };

export const deloadActive = (s: DeloadState | undefined, now: number): boolean => !!s && s.until > now;
export const showDeloadSuggestion = (advice: DeloadAdvice, s: DeloadState | undefined, now: number): boolean =>
  advice.verdict === 'deload' && !deloadActive(s, now) && (s?.snoozedUntil ?? 0) <= now;

/** A deload week starts now and runs to the end of the seventh day. */
export const startDeload = (now: number): DeloadState => ({ until: now + 7 * DAY, snoozedUntil: 0 });
export const snoozeDeload = (now: number, days = 7): DeloadState => ({ until: 0, snoozedUntil: now + days * DAY });
