import { FastingSession, SleepLogEntry, WorkoutSession } from '../types/health';
import { addDays, toDateKey } from './dates';
import { DayFitness } from './fitnessMetrics';
import { FAST_STAGES, feelingLabel, feelingTone, hoursInto, stageIndexAt } from './fasting';
import { efficiencyTrend, workoutEfficiency } from './aerobicTrend';
import { cusumUp, mean, median, robustZ, tPValue, welch } from './robust';
import { hm } from './sleepMetrics';

/**
 * Looks for patterns in your own data and says them in plain words: "after nights under 6.5 hours you run 8% slower at the same
 * heart rate". Each pattern splits your days into two groups, compares a result between them with a Welch t-test, and is shown only
 * when there are enough days in both groups and the difference is unlikely to be chance. Everything runs on this phone. These are
 * patterns in your numbers, not proof of cause, and the cards say so.
 */

export type InsightKind = 'pattern' | 'alert' | 'positive';

export interface Insight {
  id: string;
  kind: InsightKind;
  title: string;
  detail: string;
  /** Days (or check-ins) in the smaller group, so a reader can judge how much to trust it. */
  n: number;
  confidence: 'early' | 'likely' | 'strong';
  /** Sort key, larger first. */
  score: number;
  tone: 'good' | 'neutral' | 'warn' | 'bad';
}

export interface InsightInput {
  today: string;
  workouts: WorkoutSession[];
  sleepLogs: SleepLogEntry[];
  days: Pick<DayFitness, 'date' | 'restingHr' | 'hrvMs' | 'steps'>[];
  fasts: FastingSession[];
}

interface Row {
  date: string;
  sleepMin?: number;
  deepMin?: number;
  efficiency?: number;
  bedMinAfter18?: number;
  hrv?: number;
  rhr?: number;
  steps?: number;
  load: number;
  /** Mean grade-adjusted efficiency of the runs that day. */
  ef?: number;
  /** A run that day began after at least 12 hours of fasting. */
  fastedRun?: boolean;
  fedRun?: boolean;
}

const MIN_GROUP = 4;

const bedMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (((h || 0) * 60 + (m || 0) - 18 * 60 + 1440) % 1440);
};

const confidenceOf = (p: number, n: number): Insight['confidence'] | null => {
  if (p < 0.01 && n >= 6) return 'strong';
  if (p < 0.05) return 'likely';
  if (p < 0.12) return 'early';
  return null;
};

const CONF_WEIGHT = { early: 1, likely: 2, strong: 3 } as const;

/** One row per day over the window, joining sleep, readings, training and fasting. */
export const buildRows = (input: InsightInput, windowDays = 120): Row[] => {
  const keys: string[] = [];
  for (let i = windowDays - 1; i >= 0; i--) keys.push(addDays(input.today, -i));
  const rows = new Map<string, Row>(keys.map((k) => [k, { date: k, load: 0 }]));

  for (const l of input.sleepLogs) {
    const r = rows.get(l.dateIso);
    if (!r || (r.sleepMin !== undefined && r.sleepMin >= l.durationMinutes)) continue;
    r.sleepMin = l.durationMinutes;
    r.deepMin = l.deepSleepMinutes || undefined;
    r.efficiency = l.efficiencyScore || undefined;
    r.bedMinAfter18 = bedMinutes(l.bedtime);
    if (l.detail?.hrvMs) r.hrv = l.detail.hrvMs;
  }
  for (const d of input.days) {
    const r = rows.get(d.date);
    if (!r) continue;
    if (d.restingHr) r.rhr = d.restingHr;
    if (d.steps) r.steps = d.steps;
    if (!r.hrv && d.hrvMs) r.hrv = d.hrvMs;
  }
  const efByDay = new Map<string, number[]>();
  for (const w of input.workouts) {
    if (!w.startedAt) continue;
    const key = toDateKey(w.startedAt);
    const r = rows.get(key);
    if (!r) continue;
    r.load += w.cardioLoadPoints || 0;
    const e = workoutEfficiency(w);
    if (e) {
      (efByDay.get(key) ?? efByDay.set(key, []).get(key)!).push(e.adjustedEf);
      const fast = input.fasts.find((f) => f.startTimestamp <= (w.startedAt as number) && (f.endTimestamp ?? Infinity) >= (w.startedAt as number));
      if (fast && hoursInto(fast, w.startedAt) >= 12) r.fastedRun = true;
      else r.fedRun = true;
    }
  }
  for (const [k, v] of efByDay) rows.get(k)!.ef = mean(v);
  return keys.map((k) => rows.get(k)!);
};

interface Compare {
  a: number[];
  b: number[];
  t: number;
  df: number;
  p: number;
  meanA: number;
  meanB: number;
}

const compare = (a: number[], b: number[]): Compare | null => {
  if (a.length < MIN_GROUP || b.length < MIN_GROUP) return null;
  const w = welch(a, b);
  if (!w || !Number.isFinite(w.t)) return null;
  return { a, b, t: w.t, df: w.df, p: tPValue(w.t, w.df), meanA: mean(a), meanB: mean(b) };
};

const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);

const tertiles = (xs: number[]): [number, number] | null => {
  if (xs.length < 12) return null;
  const s = [...xs].sort((x, y) => x - y);
  return [s[Math.floor(s.length / 3)], s[Math.floor((2 * s.length) / 3)]];
};

const make = (partial: Omit<Insight, 'score'> & { effect: number; p: number }): Insight => {
  const { effect, p, ...rest } = partial;
  const w = CONF_WEIGHT[rest.confidence];
  return { ...rest, score: w * 10 + Math.min(10, Math.abs(effect)) + (1 - p) };
};

const patterns = (rows: Row[]): Insight[] => {
  const out: Insight[] = [];
  const next = (i: number) => rows[i + 1];

  // 1. Short sleep and how you run the next day (grade-adjusted efficiency = pace at the same heart rate)
  {
    const short: number[] = [];
    const rested: number[] = [];
    const sleeps = rows.map((r) => r.sleepMin).filter((v): v is number => v !== undefined);
    const thr = { lo: 6.5 * 60, hi: 7.5 * 60 };
    const med = sleeps.length ? median(sleeps) : 0;
    const split = sleeps.filter((s) => s < thr.lo).length >= MIN_GROUP && sleeps.filter((s) => s >= thr.hi).length >= MIN_GROUP ? thr : { lo: med - 20, hi: med + 20 };
    for (const r of rows) {
      if (r.ef === undefined || r.sleepMin === undefined) continue;
      if (r.sleepMin < split.lo) short.push(r.ef);
      else if (r.sleepMin >= split.hi) rested.push(r.ef);
    }
    const c = compare(short, rested);
    const conf = c && confidenceOf(c.p, Math.min(short.length, rested.length));
    if (c && conf && Math.abs(pct(c.meanA, c.meanB)) >= 2) {
      const d = pct(c.meanA, c.meanB);
      const label = split.lo === thr.lo ? 'under 6.5 hours' : `under ${hm(split.lo)}`;
      out.push(make({
        id: 'sleep-run',
        kind: 'pattern',
        title: `After ${label} of sleep you run ${Math.abs(d)}% ${d < 0 ? 'slower' : 'faster'} at the same heart rate`,
        detail: `Across ${short.length} runs after short nights and ${rested.length} after longer ones.`,
        n: Math.min(short.length, rested.length),
        confidence: conf,
        tone: d < 0 ? 'warn' : 'neutral',
        effect: Math.abs(d),
        p: c.p,
      }));
    }
  }

  // 2. Hard training days and the next night: deep sleep, and the next morning's resting heart rate
  {
    const loads = rows.map((r) => r.load).filter((v) => v > 0);
    const t = tertiles(loads);
    if (t) {
      const hardDeep: number[] = [];
      const easyDeep: number[] = [];
      const hardRhr: number[] = [];
      const easyRhr: number[] = [];
      const hardHrv: number[] = [];
      const easyHrv: number[] = [];
      rows.forEach((r, i) => {
        const n = next(i);
        if (!n) return;
        const hard = r.load >= t[1];
        const easy = r.load > 0 && r.load <= t[0];
        if (!hard && !easy) return;
        if (n.deepMin !== undefined) (hard ? hardDeep : easyDeep).push(n.deepMin);
        if (n.rhr !== undefined) (hard ? hardRhr : easyRhr).push(n.rhr);
        if (n.hrv !== undefined) (hard ? hardHrv : easyHrv).push(n.hrv);
      });
      const deep = compare(hardDeep, easyDeep);
      const dconf = deep && confidenceOf(deep.p, Math.min(hardDeep.length, easyDeep.length));
      if (deep && dconf && Math.abs(pct(deep.meanA, deep.meanB)) >= 5) {
        const d = pct(deep.meanA, deep.meanB);
        out.push(make({ id: 'load-deep', kind: 'pattern', title: `After your hardest training days you get ${Math.abs(d)}% ${d > 0 ? 'more' : 'less'} deep sleep`, detail: `Compared with nights after your lightest sessions (${hardDeep.length} and ${easyDeep.length} nights).`, n: Math.min(hardDeep.length, easyDeep.length), confidence: dconf, tone: d > 0 ? 'good' : 'warn', effect: Math.abs(d), p: deep.p }));
      }
      const rhr = compare(hardRhr, easyRhr);
      const rconf = rhr && confidenceOf(rhr.p, Math.min(hardRhr.length, easyRhr.length));
      if (rhr && rconf && Math.abs(rhr.meanA - rhr.meanB) >= 1) {
        const d = rhr.meanA - rhr.meanB;
        out.push(make({ id: 'load-rhr', kind: 'pattern', title: `Your resting heart rate is ${Math.abs(d).toFixed(1)} bpm ${d > 0 ? 'higher' : 'lower'} the morning after a hard day`, detail: `${hardRhr.length} mornings after your hardest days against ${easyRhr.length} after easy ones. A bigger gap means you recover more slowly.`, n: Math.min(hardRhr.length, easyRhr.length), confidence: rconf, tone: d > 0 ? 'neutral' : 'good', effect: Math.abs(d) * 3, p: rhr.p }));
      }
      const hrv = compare(hardHrv, easyHrv);
      const hconf = hrv && confidenceOf(hrv.p, Math.min(hardHrv.length, easyHrv.length));
      if (hrv && hconf && Math.abs(pct(hrv.meanA, hrv.meanB)) >= 5) {
        const d = pct(hrv.meanA, hrv.meanB);
        out.push(make({ id: 'load-hrv', kind: 'pattern', title: `Your HRV is ${Math.abs(d)}% ${d < 0 ? 'lower' : 'higher'} after a hard training day`, detail: `${hardHrv.length} hard days against ${easyHrv.length} easy ones.`, n: Math.min(hardHrv.length, easyHrv.length), confidence: hconf, tone: d < 0 ? 'neutral' : 'good', effect: Math.abs(d), p: hrv.p }));
      }
    }
  }

  // 3. Fasted runs against fed runs
  {
    const fasted = rows.filter((r) => r.fastedRun && r.ef !== undefined).map((r) => r.ef as number);
    const fed = rows.filter((r) => r.fedRun && !r.fastedRun && r.ef !== undefined).map((r) => r.ef as number);
    const c = compare(fasted, fed);
    const conf = c && confidenceOf(c.p, Math.min(fasted.length, fed.length));
    if (c && conf && Math.abs(pct(c.meanA, c.meanB)) >= 2) {
      const d = pct(c.meanA, c.meanB);
      out.push(make({ id: 'fasted-run', kind: 'pattern', title: `Fasted runs are ${Math.abs(d)}% ${d < 0 ? 'less' : 'more'} efficient than fed ones`, detail: `Runs that began after 12 or more hours without food (${fasted.length}) against runs that did not (${fed.length}), measured as pace at the same heart rate.`, n: Math.min(fasted.length, fed.length), confidence: conf, tone: d < 0 ? 'warn' : 'good', effect: Math.abs(d), p: c.p }));
    }
  }

  // 4. A late bedtime and that night's HRV and resting heart rate the next morning
  {
    const beds = rows.map((r) => r.bedMinAfter18).filter((v): v is number => v !== undefined);
    if (beds.length >= 12) {
      const m = median(beds);
      const late: Row[] = rows.filter((r) => r.bedMinAfter18 !== undefined && (r.bedMinAfter18 as number) >= m + 45);
      const early: Row[] = rows.filter((r) => r.bedMinAfter18 !== undefined && (r.bedMinAfter18 as number) <= m - 15);
      const hrv = compare(late.filter((r) => r.hrv !== undefined).map((r) => r.hrv as number), early.filter((r) => r.hrv !== undefined).map((r) => r.hrv as number));
      const conf = hrv && confidenceOf(hrv.p, Math.min(hrv.a.length, hrv.b.length));
      if (hrv && conf && Math.abs(pct(hrv.meanA, hrv.meanB)) >= 5) {
        const d = pct(hrv.meanA, hrv.meanB);
        const clock = (min: number) => {
          const t = (min + 18 * 60) % 1440;
          return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
        };
        out.push(make({ id: 'late-bed-hrv', kind: 'pattern', title: `When you go to bed after ${clock(m + 45)}, your HRV is ${Math.abs(d)}% ${d < 0 ? 'lower' : 'higher'}`, detail: `${hrv.a.length} late nights against ${hrv.b.length} earlier ones (your usual bedtime is about ${clock(m)}).`, n: Math.min(hrv.a.length, hrv.b.length), confidence: conf, tone: d < 0 ? 'warn' : 'neutral', effect: Math.abs(d), p: hrv.p }));
      }
    }
  }

  // 5. Very active days and that night's sleep efficiency
  {
    const steps = rows.map((r) => r.steps).filter((v): v is number => v !== undefined && v > 0);
    const t = tertiles(steps);
    if (t) {
      const busy: number[] = [];
      const quiet: number[] = [];
      rows.forEach((r, i) => {
        const n = next(i);
        if (!n || r.steps === undefined || n.efficiency === undefined) return;
        if (r.steps >= t[1]) busy.push(n.efficiency);
        else if (r.steps <= t[0]) quiet.push(n.efficiency);
      });
      const c = compare(busy, quiet);
      const conf = c && confidenceOf(c.p, Math.min(busy.length, quiet.length));
      if (c && conf && Math.abs(c.meanA - c.meanB) >= 1.5) {
        const d = c.meanA - c.meanB;
        out.push(make({ id: 'steps-sleep', kind: 'pattern', title: `On your most active days you sleep ${Math.abs(d).toFixed(1)} points ${d > 0 ? 'more' : 'less'} efficiently that night`, detail: `The top third of step days (${busy.length}) against the bottom third (${quiet.length}). Sleep efficiency is the share of time in bed actually asleep.`, n: Math.min(busy.length, quiet.length), confidence: conf, tone: d > 0 ? 'good' : 'neutral', effect: Math.abs(d) * 2, p: c.p }));
      }
    }
  }
  return out;
};

/** Alerts from your recent readings against your own usual: resting heart rate up, HRV down, a slow drift. */
const alerts = (rows: Row[], today: string): Insight[] => {
  const out: Insight[] = [];
  const upto = rows.filter((r) => r.date <= today);
  const rhr = upto.filter((r) => r.rhr !== undefined);
  const hrv = upto.filter((r) => r.hrv !== undefined);

  const recentRhr = rhr.filter((r) => r.date >= addDays(today, -2));
  const baseRhr = rhr.filter((r) => r.date < addDays(today, -2)).slice(-28).map((r) => r.rhr as number);
  let rhrUp = false;
  let rhrDelta = 0;
  if (recentRhr.length >= 2 && baseRhr.length >= 10) {
    rhrDelta = mean(recentRhr.map((r) => r.rhr as number)) - median(baseRhr);
    const z = robustZ(mean(recentRhr.map((r) => r.rhr as number)), baseRhr, 1.5);
    rhrUp = z >= 2 && rhrDelta >= 3;
  }
  const recentHrv = hrv.filter((r) => r.date >= addDays(today, -2));
  const baseHrv = hrv.filter((r) => r.date < addDays(today, -2)).slice(-28).map((r) => r.hrv as number);
  let hrvDown = false;
  let hrvPct = 0;
  if (recentHrv.length >= 2 && baseHrv.length >= 10) {
    const m = median(baseHrv);
    hrvPct = Math.round(((mean(recentHrv.map((r) => r.hrv as number)) - m) / m) * 100);
    hrvDown = robustZ(mean(recentHrv.map((r) => r.hrv as number)), baseHrv, m * 0.05) <= -2 && hrvPct <= -10;
  }
  if (rhrUp && hrvDown) {
    out.push({ id: 'strain', kind: 'alert', title: 'Your body may be under strain', detail: `Resting heart rate is ${rhrDelta.toFixed(0)} bpm above your usual and HRV is ${Math.abs(hrvPct)}% below it for the last 2 days. That pairing often shows up with hard training, short sleep, stress or the start of an illness. Take it easier and watch it for a day or two. This is not a diagnosis.`, n: recentRhr.length, confidence: 'likely', score: 100, tone: 'bad' });
  } else if (rhrUp) {
    out.push({ id: 'rhr-up', kind: 'alert', title: `Resting heart rate is ${rhrDelta.toFixed(0)} bpm above your usual`, detail: 'For the last 2 days. Short sleep, a hard week, alcohol, stress or an oncoming illness can all do this. An easy day is a sensible response.', n: recentRhr.length, confidence: 'likely', score: 90, tone: 'warn' });
  } else if (hrvDown) {
    out.push({ id: 'hrv-down', kind: 'alert', title: `HRV is ${Math.abs(hrvPct)}% below your usual`, detail: 'For the last 2 days. HRV drops when your body is carrying stress from training, poor sleep or illness. It usually recovers within a few days.', n: recentHrv.length, confidence: 'likely', score: 85, tone: 'warn' });
  }

  // A slow upward creep in resting heart rate that no single day shows
  if (!rhrUp && rhr.length >= 21) {
    const series = rhr.slice(-21).map((r) => r.rhr as number);
    const base = series.slice(0, 14);
    const zs = series.slice(14).map((v) => robustZ(v, base, 1.5));
    const { alarmAt } = cusumUp(zs, 0.5, 3);
    if (alarmAt !== null && mean(series.slice(14)) - median(base) >= 2) {
      out.push({ id: 'rhr-creep', kind: 'alert', title: 'Your resting heart rate has been creeping up', detail: `About ${(mean(series.slice(14)) - median(base)).toFixed(1)} bpm higher over the past week than the two weeks before. Small, steady rises are easy to miss day to day.`, n: 7, confidence: 'early', score: 60, tone: 'warn' });
    }
  }
  return out;
};

/** Good news worth saying: resting heart rate falling, efficiency rising, a better sleep schedule. */
const positives = (input: InsightInput, rows: Row[]): Insight[] => {
  const out: Insight[] = [];
  const rhr = rows.filter((r) => r.rhr !== undefined && r.date <= input.today);
  if (rhr.length >= 40) {
    const recent = median(rhr.slice(-14).map((r) => r.rhr as number));
    const before = median(rhr.slice(-42, -28).map((r) => r.rhr as number));
    if (before - recent >= 2) {
      out.push({ id: 'rhr-down', kind: 'positive', title: `Your resting heart rate is down ${(before - recent).toFixed(0)} bpm in six weeks`, detail: 'A falling resting heart rate usually means your heart is getting more efficient: a good sign your training is working.', n: 14, confidence: 'likely', score: 20, tone: 'good' });
    }
  }
  const trend = efficiencyTrend(input.workouts);
  if (trend.changePct !== undefined && trend.changePct >= 3) {
    out.push({ id: 'ef-up', kind: 'positive', title: `You cover ${trend.changePct}% more ground per heartbeat than a few runs ago`, detail: 'Aerobic efficiency, adjusted for hills. Rising efficiency is what building an aerobic base looks like.', n: 6, confidence: 'likely', score: 18, tone: 'good' });
  }
  return out;
};

/** What the fasting check-ins say: when you feel best, and when hunger or headaches peak. */
export const fastingInsights = (fasts: FastingSession[]): Insight[] => {
  const out: Insight[] = [];
  // Bin every check-in into 2-hour windows of the fast
  const bins = new Map<number, { n: number; good: number; bad: number; tags: Map<string, number> }>();
  let total = 0;
  for (const f of fasts) {
    for (const c of f.checkIns ?? []) {
      const bin = Math.floor(hoursInto(f, c.at) / 2) * 2;
      const b = bins.get(bin) ?? { n: 0, good: 0, bad: 0, tags: new Map() };
      b.n++;
      total++;
      for (const t of c.tags) {
        if (feelingTone(t) === 'good') b.good++;
        else b.bad++;
        b.tags.set(t, (b.tags.get(t) ?? 0) + 1);
      }
      bins.set(bin, b);
    }
  }
  if (total < 6) return out;
  const usable = [...bins.entries()].filter(([, b]) => b.n >= 2);
  if (usable.length === 0) return out;
  const net = (b: { n: number; good: number; bad: number }) => (b.good - b.bad) / b.n;
  const best = usable.reduce((a, b) => (net(b[1]) > net(a[1]) ? b : a));
  const worst = usable.reduce((a, b) => (net(b[1]) < net(a[1]) ? b : a));
  const top = (b: { tags: Map<string, number>; n: number }, tone: 'good' | 'bad') =>
    [...b.tags.entries()].filter(([t]) => feelingTone(t) === tone).sort((x, y) => y[1] - x[1])[0];
  if (net(best[1]) > 0.3) {
    const t = top(best[1], 'good');
    out.push({ id: 'fast-best', kind: 'pattern', title: `You feel best around hour ${best[0]}–${best[0] + 2} of a fast`, detail: `${t ? `${feelingLabel(t[0])} comes up most` : 'Good feelings dominate'} in that window (${best[1].n} check-ins). It sits in the ${FAST_STAGES[stageIndexAt(best[0] + 1)].name.toLowerCase()} stage.`, n: best[1].n, confidence: best[1].n >= 6 ? 'likely' : 'early', score: 12 + best[1].n, tone: 'good' });
  }
  if (net(worst[1]) < -0.3 && worst[0] !== best[0]) {
    const t = top(worst[1], 'bad');
    out.push({ id: 'fast-worst', kind: 'pattern', title: `The hardest stretch is around hour ${worst[0]}–${worst[0] + 2}`, detail: `${t ? `${feelingLabel(t[0])} shows up most` : 'Rough feelings dominate'} there (${worst[1].n} check-ins). Planning a walk, water or a task for that window can help.`, n: worst[1].n, confidence: worst[1].n >= 6 ? 'likely' : 'early', score: 11 + worst[1].n, tone: 'warn' });
  }
  return out;
};

/** All insights, best first. */
export const buildInsights = (input: InsightInput, limit = 12, windowDays = 120): Insight[] => {
  const rows = buildRows(input, windowDays);
  const all = [...alerts(rows, input.today), ...patterns(rows), ...fastingInsights(input.fasts), ...positives(input, rows)];
  return all.sort((a, b) => b.score - a.score).slice(0, limit);
};

/** One sentence on how much history there is, for the empty state. */
export const insightReadiness = (input: InsightInput): { nights: number; workouts: number; checkIns: number; ready: boolean } => {
  const nights = new Set(input.sleepLogs.map((l) => l.dateIso)).size;
  const workouts = input.workouts.length;
  const checkIns = input.fasts.reduce((n, f) => n + (f.checkIns?.length ?? 0), 0);
  return { nights, workouts, checkIns, ready: nights >= 14 || workouts >= 10 || checkIns >= 6 };
};
