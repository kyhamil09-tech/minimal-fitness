import { SleepDetail, SleepLogEntry, SleepStageCode } from '../types/health';
import { BUCKET_MS, Buckets, bucketSeries } from './ownBuckets';
import { Segment, countAwakenings } from './sleepMetrics';
import { addDays, parseDateKey } from './dates';

/**
 * Estimates a night's sleep stages from what the watch measured on its own: heart rate every few minutes, steps, and the
 * watch's own asleep/awake state. This is the app's guess, not a measurement. Deep sleep is where heart rate is lowest
 * and steadiest, REM is where it rises and wobbles, and anything with movement or a heart-rate spike is awake. The stage
 * shares are nudged toward the ranges seen in healthy adults so one odd trace does not produce nonsense. When
 * Health Connect has the night with stages measured by Google's watch pipeline, that replaces this estimate.
 */
export interface EstimateInput {
  /** The date the night ended (the morning's date). */
  wakeDate: string;
  hr: Buckets;
  steps: Buckets;
  /** The watch's state changes [time ms, code]: 2 asleep, 3 awake, 1 exercise, 0 unknown. */
  states: [number, number][];
  /** The phone's own readings every ten minutes [time ms, confidence you are asleep 0-100, motion, light]. */
  classify: [number, number, number, number][];
  /** Sleep periods the phone detected with Google Play services. */
  phoneSegments: { start: number; end: number; status: number }[];
  now: number;
}

const MIN = 60_000;
const MIN_SLEEP_MS = 180 * MIN;

export type WindowBasis = 'watch' | 'phone' | 'inferred';

export interface SleepWindow {
  startMs: number;
  endMs: number;
  basis: WindowBasis;
}

const at = (dateKey: string, hour: number) => {
  const d = parseDateKey(dateKey);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

const clip = (a: number, b: number, from: number, to: number): [number, number] | null => {
  const s = Math.max(a, from);
  const e = Math.min(b, to);
  return e > s ? [s, e] : null;
};

/** Joins intervals separated by less than {@code gapMs}: a short waking inside the night is still the same night. */
const joinClose = (intervals: [number, number][], gapMs: number): [number, number][] => {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] - last[1] <= gapMs) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
};

const longest = (intervals: [number, number][]): [number, number] | null => {
  let best: [number, number] | null = null;
  for (const iv of intervals) if (iv[1] - iv[0] >= MIN_SLEEP_MS && (!best || iv[1] - iv[0] > best[1] - best[0])) best = iv;
  return best;
};

/** Where the night began and ended, from the watch's asleep state first, then the phone, then the quiet heart-rate hours. */
export const findSleepWindow = (input: EstimateInput, from: number, to: number, hr: number[], steps: number[]): SleepWindow | null => {
  const states = [...input.states].sort((a, b) => a[0] - b[0]);
  const watch: [number, number][] = [];
  for (let i = 0; i < states.length; i++) {
    if (states[i][1] !== 2) continue;
    const end = states[i + 1] ? states[i + 1][0] : input.now;
    const c = clip(states[i][0], end, from, to);
    if (c) watch.push(c);
  }
  const fromWatch = longest(joinClose(watch, 45 * MIN));
  if (fromWatch) return { startMs: fromWatch[0], endMs: fromWatch[1], basis: 'watch' };

  const phone: [number, number][] = [];
  for (const s of input.phoneSegments) {
    if (s.status !== 0) continue;
    const c = clip(s.start, s.end, from, to);
    if (c) phone.push(c);
  }
  const fromPhone = longest(joinClose(phone, 45 * MIN));
  if (fromPhone) return { startMs: fromPhone[0], endMs: fromPhone[1], basis: 'phone' };

  // Nothing told us when you slept: look for the longest quiet stretch (no steps, heart rate near its low end).
  const readings = hr.filter((v) => v > 0).sort((a, b) => a - b);
  if (readings.length < 24) return null;
  const quietLimit = readings[Math.floor(readings.length * 0.1)] + 18;
  const quiet = hr.map((v, i) => steps[i] < 5 && (v === 0 || v <= quietLimit));
  // A short interruption (up to ten minutes) between two quiet stretches does not end the night.
  for (let i = 0; i < quiet.length; i++) {
    if (quiet[i]) continue;
    let j = i;
    while (j < quiet.length && !quiet[j]) j++;
    if (j - i <= 2 && i > 0 && j < quiet.length) for (let k = i; k < j; k++) quiet[k] = true;
    i = j;
  }
  let best: [number, number] | null = null;
  let runStart = -1;
  let missing = 0;
  const closeRun = (endIdx: number) => {
    if (runStart < 0) return;
    // A stretch with no readings at the edges is not evidence of sleep: start and end on real readings.
    let s = runStart;
    let e = endIdx;
    while (s < e && hr[s] === 0) s++;
    while (e > s && hr[e - 1] === 0) e--;
    const readingsInRun = hr.slice(s, e).filter((v) => v > 0).length;
    if (e - s >= MIN_SLEEP_MS / BUCKET_MS && readingsInRun >= (e - s) * 0.5 && (!best || e - s > best[1] - best[0])) best = [s, e];
    runStart = -1;
    missing = 0;
  };
  for (let i = 0; i < hr.length; i++) {
    if (quiet[i]) {
      if (runStart < 0) runStart = i;
      missing = hr[i] === 0 ? missing + 1 : 0;
      if (missing > 3) closeRun(i - missing + 1);
    } else closeRun(i);
  }
  closeRun(hr.length);
  if (!best) return null;
  const found = best as [number, number];
  return { startMs: from + found[0] * BUCKET_MS, endMs: from + found[1] * BUCKET_MS, basis: 'inferred' };
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Fills readings missing for up to three buckets in a row; longer gaps stay NaN. */
const fillGaps = (hr: number[]): number[] => {
  const out = hr.map((v) => (v > 0 ? v : NaN));
  let i = 0;
  while (i < out.length) {
    if (!Number.isNaN(out[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < out.length && Number.isNaN(out[j])) j++;
    const before = i > 0 ? out[i - 1] : NaN;
    const after = j < out.length ? out[j] : NaN;
    if (j - i <= 3 && !Number.isNaN(before) && !Number.isNaN(after)) {
      for (let k = i; k < j; k++) out[k] = before + ((after - before) * (k - i + 1)) / (j - i + 1);
    }
    i = j;
  }
  return out;
};

export interface Staged {
  segments: Segment[];
  hrAvg: number;
  hrMin: number;
  hrMax: number;
}

/** Assigns a stage to every five minutes of the window. Returns null when there are too few readings to say anything. */
export const stageWindow = (
  window: SleepWindow,
  hrRaw: number[],
  steps: number[],
  phoneAwakeAt: (t: number) => boolean
): Staged | null => {
  const n = hrRaw.length;
  const hr = fillGaps(hrRaw);
  const valid = hr.filter((v) => !Number.isNaN(v));
  if (n < 12 || valid.length < n * 0.5) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)];
  const med = sorted[Math.floor(sorted.length * 0.5)];
  const range = Math.max(6, med - p10);

  const spread = (i: number) => {
    const near = [i - 2, i - 1, i, i + 1, i + 2].filter((k) => k >= 0 && k < n && !Number.isNaN(hr[k])).map((k) => hr[k]);
    if (near.length < 3) return 0;
    const m = mean(near);
    return Math.sqrt(mean(near.map((v) => (v - m) ** 2)));
  };
  const rel = hr.map((v) => (Number.isNaN(v) ? NaN : (v - p10) / range));
  const sd = hr.map((_, i) => spread(i));
  const moving = steps.map((s) => s >= 15);

  const stage: SleepStageCode[] = hr.map((h, i) => {
    if (Number.isNaN(h)) return moving[i] || phoneAwakeAt(window.startMs + i * BUCKET_MS) ? 0 : 1;
    if (moving[i] || h > med + 12) return 0;
    const pos = i / n;
    if (rel[i] <= 0.35 && sd[i] <= 2.5 && pos <= 0.7) return 2;
    if (rel[i] >= 0.4 && sd[i] >= 3 && pos >= 0.25) return 3;
    return 1;
  });

  // A single five-minute block of deep or REM is too short to mean anything.
  for (let i = 0; i < n; i++) {
    if ((stage[i] === 2 || stage[i] === 3) && stage[i - 1] !== stage[i] && stage[i + 1] !== stage[i]) stage[i] = 1;
  }

  const count = (code: SleepStageCode) => stage.filter((s) => s === code).length;
  const share = (code: SleepStageCode) => count(code) / Math.max(1, n - count(0));
  const swap = (pred: (i: number) => boolean, score: (i: number) => number, to: SleepStageCode, pickHighest: boolean): boolean => {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (!pred(i)) continue;
      if (best < 0 || (pickHighest ? score(i) > score(best) : score(i) < score(best))) best = i;
    }
    if (best < 0) return false;
    stage[best] = to;
    return true;
  };

  // Keep the shares of the night within what healthy adults show.
  let guard = 0;
  while (share(2) > 0.26 && guard++ < n) if (!swap((i) => stage[i] === 2, (i) => rel[i], 1, true)) break;
  guard = 0;
  while (share(3) > 0.28 && guard++ < n) if (!swap((i) => stage[i] === 3, (i) => sd[i], 1, false)) break;
  guard = 0;
  while (share(2) < 0.09 && guard++ < n) {
    if (!swap((i) => stage[i] === 1 && !moving[i] && !Number.isNaN(rel[i]) && i / n <= 0.6 && rel[i] <= 0.8, (i) => rel[i], 2, false)) break;
  }
  guard = 0;
  while (share(3) < 0.13 && guard++ < n) {
    if (!swap((i) => stage[i] === 1 && !Number.isNaN(rel[i]) && i / n >= 0.3 && sd[i] >= 1.5, (i) => sd[i], 3, true)) break;
  }

  const segments: Segment[] = [];
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && stage[j] === stage[i]) j++;
    segments.push([stage[i], window.startMs + i * BUCKET_MS, window.startMs + j * BUCKET_MS]);
    i = j;
  }
  return { segments, hrAvg: Math.round(mean(valid)), hrMin: Math.round(Math.min(...valid)), hrMax: Math.round(Math.max(...valid)) };
};

const pad = (v: number) => String(v).padStart(2, '0');
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const rating = (asleepMin: number, efficiency: number) =>
  asleepMin >= 420 && efficiency >= 90 ? 5 : asleepMin >= 390 && efficiency >= 85 ? 4 : asleepMin >= 360 ? 3 : asleepMin >= 300 ? 2 : 1;

/**
 * Estimates the night that ended on {@code input.wakeDate}, or null when the watch left too little to go on or the night is
 * still going.
 */
export const estimateNight = (input: EstimateInput): SleepLogEntry | null => {
  const from = at(addDays(input.wakeDate, -1), 18);
  const to = at(input.wakeDate, 12);
  if (input.now < from + MIN_SLEEP_MS) return null;
  const end = Math.min(to, input.now);
  const length = Math.floor((end - from) / BUCKET_MS);
  const hr = bucketSeries(input.hr, from, from + length * BUCKET_MS);
  const steps = bucketSeries(input.steps, from, from + length * BUCKET_MS);

  const window = findSleepWindow(input, from, to, hr, steps);
  if (!window) return null;

  // Still asleep: the watch has not said you woke up and readings are still arriving.
  const lastState = [...input.states].sort((a, b) => a[0] - b[0]).pop();
  if (window.basis === 'watch' && lastState && lastState[1] === 2 && input.now - window.endMs < 20 * MIN && input.now < to) return null;

  const startIdx = Math.max(0, Math.floor((window.startMs - from) / BUCKET_MS));
  const endIdx = Math.min(length, Math.ceil((window.endMs - from) / BUCKET_MS));
  const w: SleepWindow = { ...window, startMs: from + startIdx * BUCKET_MS, endMs: from + endIdx * BUCKET_MS };
  const classify = input.classify;
  const phoneAwakeAt = (t: number) => {
    let best: [number, number, number, number] | null = null;
    for (const e of classify) if (Math.abs(e[0] - t) <= 6 * MIN && (!best || Math.abs(e[0] - t) < Math.abs(best[0] - t))) best = e;
    return !!best && best[1] <= 25;
  };
  const staged = stageWindow(w, hr.slice(startIdx, endIdx), steps.slice(startIdx, endIdx), phoneAwakeAt);
  if (!staged) return null;

  const minutes = (code: SleepStageCode) =>
    Math.round(staged.segments.filter((s) => s[0] === code).reduce((acc, s) => acc + (s[2] - s[1]), 0) / MIN);
  const deep = minutes(2);
  const rem = minutes(3);
  const light = minutes(1);
  const awake = minutes(0);
  const asleep = deep + rem + light;
  if (asleep < MIN_SLEEP_MS / MIN) return null;
  const inBed = Math.round((w.endMs - w.startMs) / MIN);
  const efficiency = inBed > 0 ? Math.min(100, Math.round((asleep / inBed) * 100)) : 0;
  const detail: SleepDetail = {
    startMs: w.startMs,
    endMs: w.endMs,
    segments: staged.segments,
    awakenings: countAwakenings(staged.segments),
    inBedMinutes: inBed,
    hrAvg: staged.hrAvg,
    hrMin: staged.hrMin,
    hrMax: staged.hrMax,
    stagesFrom: 'estimated',
  };
  return {
    id: `sensors-${input.wakeDate}`,
    dateIso: input.wakeDate,
    displayDate: new Date(`${input.wakeDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    bedtime: clock(w.startMs),
    wakeTime: clock(w.endMs),
    durationMinutes: asleep,
    qualityRating: rating(asleep, efficiency),
    notes: 'Estimated from your watch heart rate and movement',
    isManualEntry: false,
    source: 'sensors',
    deepSleepMinutes: deep,
    remSleepMinutes: rem,
    lightSleepMinutes: light,
    awakeMinutes: awake,
    efficiencyScore: efficiency,
    detail,
  };
};

/**
 * Adds estimated nights to the log. A night logged by hand or measured through Health Connect is never replaced; an earlier
 * estimate or a phone-detected night (times only) is refreshed. A night you deleted does not come back.
 */
export const mergeEstimatedSleep = (
  existing: SleepLogEntry[],
  estimates: SleepLogEntry[],
  isDismissed: (id: string) => boolean = () => false
): SleepLogEntry[] => {
  const protectedDates = new Set(existing.filter((l) => l.source !== 'sensors' && l.source !== 'sleep-api').map((l) => l.dateIso));
  const incoming = estimates.filter((l) => !protectedDates.has(l.dateIso) && !isDismissed(l.id));
  if (incoming.length === 0) return existing;
  const dates = new Set(incoming.map((l) => l.dateIso));
  const kept = existing.filter((l) => !((l.source === 'sensors' || l.source === 'sleep-api') && dates.has(l.dateIso)));
  return [...kept, ...incoming].sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0));
};
