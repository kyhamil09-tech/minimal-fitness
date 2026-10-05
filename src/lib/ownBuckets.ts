import { toDateKey } from './dates';

/** The app stores the watch's readings as one number per five minutes, per day. */
export const BUCKET_MS = 5 * 60_000;
export const BUCKETS_PER_DAY = 288;

/** Local date to the day's buckets (index 0 is 00:00 to 00:05). A bucket with no reading holds 0. */
export type Buckets = Record<string, number[]>;

const slotOf = (t: number): { date: string; idx: number } => {
  const d = new Date(t);
  return { date: toDateKey(d), idx: Math.min(BUCKETS_PER_DAY - 1, Math.floor((d.getHours() * 60 + d.getMinutes()) / 5)) };
};

const emptyDay = () => new Array<number>(BUCKETS_PER_DAY).fill(0);

/** Average heart rate per bucket from [time ms, bpm] readings. */
export const bucketHr = (samples: [number, number][]): Buckets => {
  const sums: Record<string, number[]> = {};
  const counts: Record<string, number[]> = {};
  for (const [t, bpm] of samples) {
    if (!(bpm > 25 && bpm < 240)) continue;
    const { date, idx } = slotOf(t);
    (sums[date] ??= emptyDay())[idx] += bpm;
    (counts[date] ??= emptyDay())[idx] += 1;
  }
  const out: Buckets = {};
  for (const date of Object.keys(sums)) out[date] = sums[date].map((s, i) => (counts[date][i] ? Math.round(s / counts[date][i]) : 0));
  return out;
};

/**
 * Steps taken per bucket from [time ms, steps so far today] readings: the rise between two readings is credited to the
 * bucket of the later one. A drop (a new day or a counter reset) starts again from that reading.
 */
export const bucketSteps = (samples: [number, number][]): Buckets => {
  const sorted = [...samples].sort((a, b) => a[0] - b[0]);
  const out: Buckets = {};
  for (let i = 1; i < sorted.length; i++) {
    const [t0, s0] = sorted[i - 1];
    const [t1, s1] = sorted[i];
    const a = slotOf(t0);
    const b = slotOf(t1);
    if (a.date !== b.date || s1 < s0) continue;
    // Nobody takes more than about 200 steps a minute, whatever a delayed reading says.
    const delta = Math.min(s1 - s0, Math.max(1, Math.ceil((t1 - t0) / 60_000)) * 200);
    if (delta > 0) (out[b.date] ??= emptyDay())[b.idx] += delta;
  }
  return out;
};

/** The buckets from {@code startMs} for {@code endMs}, one entry per five minutes, in time order. */
export const bucketSeries = (byDate: Buckets, startMs: number, endMs: number): number[] => {
  const out: number[] = [];
  for (let t = startMs; t < endMs; t += BUCKET_MS) {
    const { date, idx } = slotOf(t);
    out.push(byDate[date]?.[idx] ?? 0);
  }
  return out;
};

export interface HrDayStats {
  hrMin: number;
  hrAvg: number;
  hrMax: number;
}

/** Lowest, average and highest reading per local day. */
export const hrDayStats = (samples: [number, number][]): Record<string, HrDayStats> => {
  const byDay: Record<string, number[]> = {};
  for (const [t, bpm] of samples) {
    if (!(bpm > 25 && bpm < 240)) continue;
    (byDay[toDateKey(t)] ??= []).push(bpm);
  }
  const out: Record<string, HrDayStats> = {};
  for (const [date, vals] of Object.entries(byDay)) {
    out[date] = {
      hrMin: Math.min(...vals),
      hrAvg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      hrMax: Math.max(...vals),
    };
  }
  return out;
};

/**
 * An estimate of resting heart rate: the low end (10th percentile) of the night's five-minute averages, or of the whole
 * day when the night has too few readings. Health Connect's own resting heart rate is preferred when it exists.
 */
export const restingFromBuckets = (day: number[] | undefined): number | undefined => {
  if (!day) return undefined;
  const pick = (vals: number[]) => {
    const sorted = vals.filter((v) => v > 0).sort((a, b) => a - b);
    return sorted;
  };
  let sorted = pick(day.slice(0, 96)); // 00:00 to 08:00
  if (sorted.length < 6) sorted = pick(day);
  if (sorted.length < 12) return undefined;
  return sorted[Math.floor(sorted.length * 0.1)];
};

/** Fresh days replace stored ones; days older than {@code keep} are dropped. */
export const replaceDays = (store: Buckets, fresh: Buckets, keep = 45): Buckets => {
  const merged = { ...store, ...fresh };
  const dates = Object.keys(merged).sort();
  for (const d of dates.slice(0, Math.max(0, dates.length - keep))) delete merged[d];
  return merged;
};

/** Sleep/awake changes [time ms, state id]: union by time, newest week only. */
export const mergeStates = (prev: [number, number][], incoming: [number, number][], now = Date.now()): [number, number][] => {
  const byTime = new Map<number, number>();
  for (const [t, s] of [...prev, ...incoming]) byTime.set(t, s);
  const cutoff = now - 8 * 24 * 3600_000;
  return [...byTime.entries()]
    .filter(([t]) => t >= cutoff)
    .sort((a, b) => a[0] - b[0])
    .map(([t, s]) => [t, s] as [number, number]);
};
