import { SleepLogEntry } from '../types/health';
import { addDays } from './dates';
import { DayFitness } from './fitnessMetrics';
import { LoadStatus } from './trainingLoad';
import { sleepScore } from './sleepMetrics';

export type ReadinessLabel = 'Primed' | 'Ready' | 'Moderate' | 'Take it easy' | 'Recover';

export interface ReadinessPart {
  id: 'sleep' | 'hrv' | 'rhr' | 'load';
  label: string;
  /** 0 to 100, higher is better rested. */
  score: number;
  /** The reading behind the score, in plain words. */
  detail: string;
  /** Share of the final score this part carries (the shares of the parts that exist add up to 100). */
  weight: number;
}

export interface Readiness {
  score: number;
  label: ReadinessLabel;
  tone: 'good' | 'neutral' | 'warn' | 'bad';
  advice: string;
  parts: ReadinessPart[];
  /** Parts that could not be worked out yet, with the reason. */
  missing: string[];
}

export interface ReadinessInput {
  sleepLogs: SleepLogEntry[];
  days: Pick<DayFitness, 'date' | 'restingHr' | 'hrvMs'>[];
  load: Pick<LoadStatus, 'id' | 'chronicWeekly' | 'daily'>;
  today: string;
  sleepGoalMin?: number;
}

const WEIGHTS = { sleep: 0.35, hrv: 0.25, rhr: 0.2, load: 0.2 } as const;
const BASELINE_NIGHTS = 14;
const MIN_BASELINE = 4;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The night that ended today or yesterday (the one that decides how you feel now), preferring the longest. */
const lastNight = (logs: SleepLogEntry[], today: string): SleepLogEntry | undefined =>
  logs
    .filter((l) => (l.dateIso === today || l.dateIso === addDays(today, -1)) && l.durationMinutes > 0)
    .sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : b.durationMinutes - a.durationMinutes))[0];

const labelFor = (score: number): { label: ReadinessLabel; tone: Readiness['tone'] } => {
  if (score >= 85) return { label: 'Primed', tone: 'good' };
  if (score >= 70) return { label: 'Ready', tone: 'good' };
  if (score >= 50) return { label: 'Moderate', tone: 'neutral' };
  if (score >= 30) return { label: 'Take it easy', tone: 'warn' };
  return { label: 'Recover', tone: 'bad' };
};

const ADVICE: Record<ReadinessLabel, string> = {
  Primed: 'Rested and recovered. A good day for a hard session or a long one.',
  Ready: 'Well recovered. Train as planned.',
  Moderate: 'Partly recovered. A steady session is fine; save the hardest effort for a better day.',
  'Take it easy': 'Your body is still catching up. Keep it light or do an easy walk.',
  Recover: 'Several signs point to tiredness. Rest, sleep well and eat properly today.',
};

/** Readiness for each of the last `n` mornings, oldest first. Mornings that cannot be worked out are skipped. */
export const recentReadiness = (input: Omit<ReadinessInput, 'today' | 'load'> & { loadFor: (day: string) => ReadinessInput['load'] }, today: string, n = 3): number[] => {
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    const r = readiness({ sleepLogs: input.sleepLogs, days: input.days, sleepGoalMin: input.sleepGoalMin, load: input.loadFor(day), today: day });
    if (r) out.push(r.score);
  }
  return out;
};

/**
 * A 0 to 100 "how ready are you to train" number. It blends four things that each show how recovered you are: last night's
 * sleep (35%), overnight heart rate variability against your usual (25%), resting heart rate against your usual (20%) and
 * how your recent training load compares with your usual week (20%). Any part without data is left out and the rest
 * share its weight. At least two parts are needed. It is an estimate for guidance, not a medical measurement.
 */
export const readiness = (input: ReadinessInput): Readiness | null => {
  const parts: Omit<ReadinessPart, 'weight'>[] = [];
  const missing: string[] = [];
  const goal = input.sleepGoalMin ?? 480;

  // Sleep: last night's score, or how close the time asleep was to the goal.
  const night = lastNight(input.sleepLogs, input.today);
  if (night) {
    const s = sleepScore(night, goal);
    const asleepMin = night.deepSleepMinutes + night.remSleepMinutes + night.lightSleepMinutes || night.durationMinutes;
    const score = s ? s.score : Math.round(clamp(asleepMin / goal, 0, 1) * 100);
    const h = Math.floor(asleepMin / 60);
    const m = Math.round(asleepMin % 60);
    parts.push({ id: 'sleep', label: 'Sleep', score, detail: `${h}h ${m}m asleep${s ? `, sleep score ${s.score}` : ''}` });
  } else {
    missing.push('Sleep: no night recorded for last night.');
  }

  // Heart rate variability: last night against the usual of the nights before it.
  const nights = input.sleepLogs
    .filter((l) => l.detail?.hrvMs && l.dateIso <= input.today)
    .sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1));
  const latestHrv = night?.detail?.hrvMs ?? nights.find((l) => l.dateIso >= addDays(input.today, -1))?.detail?.hrvMs;
  const hrvBase = nights.filter((l) => l !== night && l.detail?.hrvMs).slice(0, BASELINE_NIGHTS).map((l) => l.detail!.hrvMs as number);
  if (latestHrv && hrvBase.length >= MIN_BASELINE) {
    const ratio = latestHrv / mean(hrvBase);
    const score = Math.round(clamp(100 - Math.max(0, 1 - ratio) * 250, 0, 100));
    const pct = Math.round((ratio - 1) * 100);
    parts.push({ id: 'hrv', label: 'Heart rate variability', score, detail: `${Math.round(latestHrv)} ms, ${pct >= 0 ? '+' : ''}${pct}% against your usual` });
  } else {
    missing.push(latestHrv ? 'Heart rate variability: needs a few more nights to learn your usual.' : 'Heart rate variability: not recorded last night.');
  }

  // Resting heart rate: the newest reading from the last three days against the usual of the days before it.
  const withRhr = input.days.filter((d) => d.restingHr && d.date <= input.today).sort((a, b) => (a.date < b.date ? 1 : -1));
  const newest = withRhr.find((d) => d.date >= addDays(input.today, -2));
  const rhrBase = withRhr.filter((d) => d !== newest).slice(0, BASELINE_NIGHTS).map((d) => d.restingHr as number);
  if (newest && rhrBase.length >= MIN_BASELINE) {
    const delta = (newest.restingHr as number) - mean(rhrBase);
    const score = Math.round(clamp(100 - Math.max(0, delta) * 8, 0, 100));
    const rounded = Math.round(delta);
    parts.push({
      id: 'rhr',
      label: 'Resting heart rate',
      score,
      detail: `${newest.restingHr} bpm, ${rounded === 0 ? 'same as' : `${Math.abs(rounded)} ${rounded > 0 ? 'above' : 'below'}`} your usual`,
    });
  } else {
    missing.push(newest ? 'Resting heart rate: needs a few more days to learn your usual.' : 'Resting heart rate: no recent reading.');
  }

  // Training load: this week against your usual week, and whether yesterday was a very hard day.
  const byStatus: Partial<Record<LoadStatusIdLike, number>> = { rest: 92, detraining: 90, productive: 85, high: 55, overreaching: 25 };
  const base = byStatus[input.load.id as LoadStatusIdLike];
  if (base !== undefined) {
    const yesterday = input.load.daily.find((d) => d.date === addDays(input.today, -1))?.load ?? 0;
    const hardYesterday = input.load.chronicWeekly > 0 && yesterday > (input.load.chronicWeekly / 7) * 2.5;
    const score = clamp(base - (hardYesterday ? 15 : 0), 0, 100);
    const text: Record<string, string> = {
      rest: 'no recent training',
      detraining: 'lighter than your usual week',
      productive: 'in line with your usual week',
      high: 'ramping up fast',
      overreaching: 'a big jump on your usual week',
    };
    parts.push({ id: 'load', label: 'Training load', score, detail: `${text[input.load.id]}${hardYesterday ? ', and yesterday was hard' : ''}` });
  } else {
    missing.push('Training load: appears after two weeks of workouts with heart rate.');
  }

  if (parts.length < 2) return null;
  const totalWeight = parts.reduce((s, p) => s + WEIGHTS[p.id], 0);
  const weighted = parts.map((p) => ({ ...p, weight: Math.round((WEIGHTS[p.id] / totalWeight) * 100) }));
  const score = Math.round(parts.reduce((s, p) => s + p.score * (WEIGHTS[p.id] / totalWeight), 0));
  const { label, tone } = labelFor(score);
  const weakest = [...parts].sort((a, b) => a.score - b.score)[0];
  const advice = weakest.score < 60 && score < 85 ? `${ADVICE[label]} ${weakest.label} is pulling it down.` : ADVICE[label];
  return { score, label, tone, advice, parts: weighted, missing };
};

type LoadStatusIdLike = 'none' | 'building' | 'rest' | 'detraining' | 'productive' | 'high' | 'overreaching';
