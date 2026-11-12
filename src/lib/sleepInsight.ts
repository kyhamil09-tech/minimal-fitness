import { SleepLogEntry } from '../types/health';

export type InsightTone = 'good' | 'neutral' | 'warn';

export interface SleepInsight {
  /** One or two clinical sentences comparing the latest night with the recent baseline. */
  text: string;
  tone: InsightTone;
  /** Latest night minus the baseline average, minutes (undefined while there is no baseline yet). */
  durationDeltaMin?: number;
  /** Positive = went to bed later than usual. */
  bedtimeDeltaMin?: number;
  wakeDeltaMin?: number;
  qualityDelta?: number;
  /** Nights in the baseline (excluding the latest). */
  baselineNights: number;
  /** Short label for compact spaces, e.g. "1h 05m below avg". */
  deltaLabel: string;
}

/** A baseline needs at least this many earlier nights. */
const MIN_BASELINE = 2;
const WINDOW = 7;
/** Differences smaller than this are reported as "in line". */
const SAME_MIN = 15;
const SHIFT_MIN = 30;

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Minutes after 18:00, so 23:30 and 00:30 sit close together instead of 23 hours apart. */
const eveningScale = (hhmm: string) => (toMinutes(hhmm) - 18 * 60 + 1440) % 1440;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

export const formatHM = (minutes: number): string => {
  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

const clock = (minutesAfter18: number) => {
  const t = (minutesAfter18 + 18 * 60) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.round(t % 60)).padStart(2, '0')}`;
};

const prettyDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const daysBetween = (aIso: string, bIso: string) =>
  Math.round((new Date(`${bIso}T12:00:00`).getTime() - new Date(`${aIso}T12:00:00`).getTime()) / 86400000);

/**
 * Compares the latest logged night with the average of the previous nights (up to seven).
 * Works only from what the app really knows: duration, bedtime, wake time and your own quality rating.
 * Sleep-stage percentages are estimates for hand-logged nights, so they are deliberately not used.
 * Returns null when nothing has been logged.
 */
export const buildSleepInsight = (logs: SleepLogEntry[], todayIso: string): SleepInsight | null => {
  if (logs.length === 0) return null;
  const sorted = [...logs].sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0));
  const latest = sorted[0];
  const base = sorted.slice(1, 1 + WINDOW);

  const age = daysBetween(latest.dateIso, todayIso);
  const prefix = age > 2 ? `Last logged night (${prettyDate(latest.dateIso)}): ` : '';
  const slept = `slept ${formatHM(latest.durationMinutes)}`;
  const lead = prefix ? `${prefix}${slept}` : `Slept ${formatHM(latest.durationMinutes)}`;

  if (base.length < MIN_BASELINE) {
    const left = MIN_BASELINE + 1 - logs.length;
    return {
      text: `${lead}; a baseline comparison unlocks after ${left} more logged night${left === 1 ? '' : 's'}.`,
      tone: latest.durationMinutes < 360 ? 'warn' : 'neutral',
      baselineNights: base.length,
      deltaLabel: 'Building baseline',
    };
  }

  const avgDur = mean(base.map((l) => l.durationMinutes));
  const durDelta = latest.durationMinutes - avgDur;
  const bedScale = base.map((l) => eveningScale(l.bedtime));
  const wakeScale = base.map((l) => toMinutes(l.wakeTime));
  const bedDelta = eveningScale(latest.bedtime) - mean(bedScale);
  const wakeDelta = toMinutes(latest.wakeTime) - mean(wakeScale);
  // Star ratings are only compared when you rated both sides yourself; imported nights carry an estimate.
  const rated = base.filter((l) => l.source !== 'health-connect');
  const qualityDelta =
    latest.source !== 'health-connect' && rated.length >= 2 ? latest.qualityRating - mean(rated.map((l) => l.qualityRating)) : 0;
  const bedSpread = stdev([...bedScale, eveningScale(latest.bedtime)]);
  const avgDurAll = mean([...base.map((l) => l.durationMinutes), latest.durationMinutes]);
  const n = base.length;

  // Sentence 1: duration against the baseline.
  let first: string;
  if (Math.abs(durDelta) < SAME_MIN) {
    first = `${lead}, in line with your ${n}-night average of ${formatHM(avgDur)}.`;
  } else {
    first = `${lead}, ${formatHM(durDelta)} ${durDelta < 0 ? 'below' : 'above'} your ${n}-night average of ${formatHM(avgDur)}.`;
  }

  // Sentence 2: the single most useful secondary finding, in priority order.
  let second: string;
  if (latest.durationMinutes < 360) {
    second = 'Under 6 hours is short enough to impair recovery; prioritize an earlier bedtime tonight.';
  } else if (Math.abs(bedDelta) >= SHIFT_MIN) {
    second = `Bedtime was ${formatHM(bedDelta)} ${bedDelta > 0 ? 'later' : 'earlier'} than your usual ${clock(mean(bedScale))}.`;
  } else if (Math.abs(qualityDelta) >= 1) {
    second = `Self-rated quality was ${qualityDelta > 0 ? 'up' : 'down'} ${Math.abs(qualityDelta).toFixed(1)} stars versus your average.`;
  } else if (bedSpread > 60) {
    second = `Bedtime varies by about ${formatHM(bedSpread)} night to night; a fixed schedule improves sleep quality.`;
  } else if (avgDurAll < 420) {
    second = `Your recent average of ${formatHM(avgDurAll)} sits below the 7-hour minimum recommended for adults.`;
  } else {
    second = 'Bedtime and wake time were consistent with your baseline.';
  }

  const tone: InsightTone =
    latest.durationMinutes < 360 || durDelta <= -60
      ? 'warn'
      : durDelta >= -SAME_MIN && latest.durationMinutes >= 420
        ? 'good'
        : 'neutral';

  const deltaLabel =
    Math.abs(durDelta) < SAME_MIN ? 'In line with avg' : `${formatHM(durDelta)} ${durDelta < 0 ? 'below' : 'above'} avg`;

  return {
    text: `${first} ${second}`,
    tone,
    durationDeltaMin: Math.round(durDelta),
    bedtimeDeltaMin: Math.round(bedDelta),
    wakeDeltaMin: Math.round(wakeDelta),
    qualityDelta: Math.round(qualityDelta * 10) / 10,
    baselineNights: n,
    deltaLabel,
  };
};
