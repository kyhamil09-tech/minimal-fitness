import { SleepLogEntry, SleepStageCode } from '../types/health';

export type Segment = [SleepStageCode, number, number];

const MIN = 60_000;

/** Health Connect sleep stage type to this app's stage code (null for "unknown"). */
export const stageCodeFromHc = (type: number): SleepStageCode | null => {
  switch (type) {
    case 1: // awake
    case 3: // out of bed
    case 7: // awake in bed
      return 0;
    case 2: // generic "sleeping"
    case 4: // light
      return 1;
    case 5:
      return 2;
    case 6:
      return 3;
    default:
      return null;
  }
};

/** Raw Health Connect stages as ordered segments: unknown stages dropped, touching stretches of one stage merged. */
export const toSegments = (stages: [number, number, number][]): Segment[] => {
  const out: Segment[] = [];
  for (const [type, from, to] of [...stages].sort((a, b) => a[1] - b[1])) {
    const code = stageCodeFromHc(type);
    if (code === null || !(to > from)) continue;
    const last = out[out.length - 1];
    if (last && last[0] === code && from - last[2] <= MIN) last[2] = Math.max(last[2], to);
    else out.push([code, from, to]);
  }
  return out;
};

/** Times you woke up: awake stretches of at least two minutes between falling asleep and the final waking. */
export const countAwakenings = (segments: Segment[], minMs = 2 * MIN): number => {
  const first = segments.findIndex((s) => s[0] !== 0);
  let last = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i][0] !== 0) {
      last = i;
      break;
    }
  }
  if (first < 0 || last <= first) return 0;
  return segments.slice(first + 1, last).filter((s) => s[0] === 0 && s[2] - s[1] >= minMs).length;
};

/** Fixed stage colors, so the four stages stay easy to tell apart whatever theme is chosen. */
export const STAGE_COLORS = { awake: '#FFB066', rem: '#B18CFF', light: '#7FB3FF', deep: '#4C6FFF' } as const;

/** Typical adult shares of the time asleep, in percent (the ranges Google Health and Fitbit show). */
export const TYPICAL_RANGE = { deep: [13, 23], rem: [20, 25], light: [45, 60] } as const;

export interface StageSummary {
  deep: number;
  rem: number;
  light: number;
  awake: number;
  /** Light + deep + REM, in minutes. */
  asleep: number;
  /** Time from getting into bed to getting up, in minutes. */
  inBed: number;
  /** Time asleep as a percentage of time in bed. */
  efficiency: number;
  /** Stage shares of the time asleep, in percent. */
  deepPct: number;
  remPct: number;
  lightPct: number;
  /** Awake time as a percentage of time in bed. */
  awakePct: number;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export const stageSummary = (log: SleepLogEntry): StageSummary => {
  const deep = log.deepSleepMinutes;
  const rem = log.remSleepMinutes;
  const light = log.lightSleepMinutes;
  const awake = log.awakeMinutes;
  const asleep = deep + rem + light;
  const inBed = log.detail?.inBedMinutes ?? asleep + awake;
  return {
    deep,
    rem,
    light,
    awake,
    asleep,
    inBed,
    efficiency: inBed > 0 ? Math.min(100, Math.round((asleep / inBed) * 100)) : 0,
    deepPct: pct(deep, asleep),
    remPct: pct(rem, asleep),
    lightPct: pct(light, asleep),
    awakePct: pct(awake, inBed),
  };
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface SleepScore {
  score: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  /** Out of 50, 25 and 25. */
  duration: number;
  quality: number;
  restoration: number;
}

/**
 * The app's own 0 to 100 sleep score. Google's Sleep Score is not shared with other apps, so this is a stand-in built
 * the same way: how long you slept against your goal (50), how much deep and REM sleep you got (25), and how
 * unbroken the night was (25). Hand-logged nights have no measured stages and get no score.
 */
export const sleepScore = (log: SleepLogEntry, goalMin = 480): SleepScore | null => {
  if (log.isManualEntry && !log.detail) return null;
  const s = stageSummary(log);
  if (s.asleep <= 0) return null;
  const duration = 50 * clamp(s.asleep / goalMin, 0, 1);
  const quality = 12.5 * clamp(s.deepPct / 18, 0, 1) + 12.5 * clamp(s.remPct / 22, 0, 1);
  const wakes = log.detail?.awakenings ?? 0;
  const restoration = clamp(25 * clamp((s.efficiency - 70) / 25, 0, 1) - Math.max(0, wakes - 2) * 1.5, 0, 25);
  const score = Math.round(duration + quality + restoration);
  const label = score >= 90 ? 'Excellent' : score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Poor';
  return { score, label, duration: Math.round(duration), quality: Math.round(quality), restoration: Math.round(restoration) };
};

/** The last `count` nights, one per date (the longest wins), oldest first. */
export const lastNights = (logs: SleepLogEntry[], count: number): SleepLogEntry[] => {
  const byDate = new Map<string, SleepLogEntry>();
  for (const l of logs) {
    const prev = byDate.get(l.dateIso);
    if (!prev || l.durationMinutes > prev.durationMinutes) byDate.set(l.dateIso, l);
  }
  return [...byDate.values()].sort((a, b) => (a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0)).slice(-count);
};

/** "7h 12m" / "45m". */
export const hm = (minutes: number): string => {
  const total = Math.round(Math.max(0, minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const average = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Minutes after 18:00, so 23:30 and 00:30 sit close together. */
const eveningScale = (hhmm: string) => (toMinutes(hhmm) - 18 * 60 + 1440) % 1440;

const stdev = (xs: number[]) => {
  const m = average(xs);
  return Math.sqrt(average(xs.map((x) => (x - m) ** 2)));
};

const clockFrom = (minutes: number) => {
  const t = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * Sleep Regularity Index (Phillips et al., 2017): the chance that you are in the same state, asleep or awake, at any two moments
 * exactly 24 hours apart, scaled from -100 to 100 (100 is perfectly regular, 0 is no better than chance). Unlike "average
 * bedtime", it notices a late weekend. Needs at least 5 nights, with each pair of consecutive days compared minute by minute.
 */
export const sleepRegularityIndex = (logs: SleepLogEntry[]): { sri: number; label: 'Very regular' | 'Fairly regular' | 'Irregular'; nights: number } | null => {
  const byDate = new Map<string, [number, number]>();
  for (const l of logs) {
    const iv = l.detail ? ([l.detail.startMs, l.detail.endMs] as [number, number]) : null;
    if (!iv || !(iv[1] > iv[0])) continue;
    const prev = byDate.get(l.dateIso);
    if (!prev || iv[1] - iv[0] > prev[1] - prev[0]) byDate.set(l.dateIso, iv);
  }
  const intervals = [...byDate.values()].sort((a, b) => a[0] - b[0]);
  if (intervals.length < 5) return null;
  const asleepAt = (t: number) => intervals.some(([a, b]) => t >= a && t < b);
  const DAY = 86_400_000;
  const MIN = 60_000;
  const start = intervals[0][0];
  const end = intervals[intervals.length - 1][1];
  let same = 0;
  let total = 0;
  for (let t = start; t + DAY < end; t += 5 * MIN) {
    total++;
    if (asleepAt(t) === asleepAt(t + DAY)) same++;
  }
  if (total < 288) return null;
  const sri = Math.round(-100 + (200 * same) / total);
  return { sri, label: sri >= 85 ? 'Very regular' : sri >= 70 ? 'Fairly regular' : 'Irregular', nights: intervals.length };
};

export interface SleepSchedule {
  avgBedtime: string;
  avgWake: string;
  /** Night-to-night variation in minutes. */
  bedSpreadMin: number;
  wakeSpreadMin: number;
  label: 'Very consistent' | 'Consistent' | 'Irregular';
}

/** Average bedtime and wake time and how much they move around. Needs at least three nights. */
export const sleepSchedule = (logs: SleepLogEntry[]): SleepSchedule | null => {
  if (logs.length < 3) return null;
  const bed = logs.map((l) => eveningScale(l.bedtime));
  const wake = logs.map((l) => toMinutes(l.wakeTime));
  const bedSpreadMin = Math.round(stdev(bed));
  const wakeSpreadMin = Math.round(stdev(wake));
  const worst = Math.max(bedSpreadMin, wakeSpreadMin);
  return {
    avgBedtime: clockFrom(average(bed) + 18 * 60),
    avgWake: clockFrom(average(wake)),
    bedSpreadMin,
    wakeSpreadMin,
    label: worst <= 30 ? 'Very consistent' : worst <= 60 ? 'Consistent' : 'Irregular',
  };
};
