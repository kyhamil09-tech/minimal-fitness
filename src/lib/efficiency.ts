import { TrackPoint } from './geo';

/**
 * Aerobic efficiency. At the same effort a fitter runner is faster, so speed per heartbeat rises with fitness. Across one long
 * steady run it falls when you tire or dehydrate: that drop is "cardiac drift" (aerobic decoupling, Pa:HR). Under about 5%
 * means your aerobic base is solid for that effort; over about 8% means the run outpaced it.
 */

/** Meters per minute per beat per minute: the higher the better. */
export const efficiencyFactor = (speedMs: number, avgHr: number): number => (avgHr > 0 ? (speedMs * 60) / avgHr : 0);

export interface Drift {
  /** Efficiency in the first and second half. */
  firstEf: number;
  secondEf: number;
  /** (first - second) / first as a percentage: positive means you got less efficient. */
  decouplingPct: number;
  /** Average heart rate in each half. */
  firstHr: number;
  secondHr: number;
}

const hrBetween = (hr: [number, number][], from: number, to: number): number | undefined => {
  let sum = 0;
  let n = 0;
  for (const [ts, b] of hr) {
    if (ts >= from && ts <= to) {
      sum += b;
      n++;
    }
  }
  return n >= 3 ? sum / n : undefined;
};

/**
 * Cardiac drift from a workout's track and heart-rate readings. The first 5 minutes (warm-up, when heart rate is catching up) are
 * left out, then the rest is split in two by time. Needs 20 minutes of data with heart rate in both halves.
 */
export const cardiacDrift = (track: TrackPoint[], hr: [number, number][] | undefined): Drift | null => {
  if (!hr || hr.length < 20 || track.length < 10) return null;
  const t0 = track[0].t + 5 * 60_000;
  const tEnd = track[track.length - 1].t;
  if (tEnd - t0 < 15 * 60_000) return null;
  const mid = t0 + (tEnd - t0) / 2;
  const dist = (from: number, to: number) => {
    const pts = track.filter((p) => p.t >= from && p.t <= to);
    if (pts.length < 2) return 0;
    return pts[pts.length - 1].d - pts[0].d;
  };
  const d1 = dist(t0, mid);
  const d2 = dist(mid, tEnd);
  const h1 = hrBetween(hr, t0, mid);
  const h2 = hrBetween(hr, mid, tEnd);
  if (!h1 || !h2 || d1 <= 0 || d2 <= 0) return null;
  const v1 = (d1 * 1000) / ((mid - t0) / 1000);
  const v2 = (d2 * 1000) / ((tEnd - mid) / 1000);
  const e1 = efficiencyFactor(v1, h1);
  const e2 = efficiencyFactor(v2, h2);
  if (e1 <= 0) return null;
  return { firstEf: e1, secondEf: e2, decouplingPct: ((e1 - e2) / e1) * 100, firstHr: h1, secondHr: h2 };
};

export const driftLabel = (pct: number): { label: string; tone: 'good' | 'neutral' | 'warn' } => {
  if (pct <= 5) return { label: 'Steady', tone: 'good' };
  if (pct <= 8) return { label: 'Some drift', tone: 'neutral' };
  return { label: 'High drift', tone: 'warn' };
};

/**
 * Energy cost of running on a slope relative to the flat, from the Minetti et al. (2002) polynomial. {@code grade} is rise over
 * run (0.05 is a 5% hill). Climbing costs more than the flat, a gentle descent less, a steep descent more again.
 */
export const minettiCost = (grade: number): number => {
  const i = Math.max(-0.45, Math.min(0.45, grade));
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
};

/** The flat-ground speed that would cost the same effort as {@code speed} on this grade (grade-adjusted speed). */
export const gradeAdjustedSpeed = (speed: number, grade: number): number => (speed * minettiCost(grade)) / minettiCost(0);

/** Grade-adjusted pace for a split: seconds per unit on the flat that match the effort of the pace run on that hill. */
export const gradeAdjustedPaceSec = (paceSec: number, elevDeltaM: number, distanceKm: number): number => {
  if (!(distanceKm > 0.05) || !(paceSec > 0)) return paceSec;
  const grade = elevDeltaM / (distanceKm * 1000);
  return paceSec / (minettiCost(grade) / minettiCost(0));
};
