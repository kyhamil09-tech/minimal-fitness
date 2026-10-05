/**
 * Race times from one good effort, using two classic methods:
 * - VDOT (Jack Daniels): a fitness number worked out from how fast you covered a distance, then turned back into times for other
 *   distances. It accounts for the fact that you cannot hold your 1 km pace for a marathon.
 * - Riegel: time grows with distance to the power of about 1.06.
 * Both assume you trained for the target distance. They are estimates, not promises.
 */

/** Oxygen cost of running at {@code metersPerMin}, ml/kg/min (Daniels and Gilbert). */
const vo2At = (metersPerMin: number) => -4.6 + 0.182258 * metersPerMin + 0.000104 * metersPerMin * metersPerMin;

/** Share of VO2 max a runner can hold for {@code minutes} (Daniels and Gilbert). */
const fractionOfMax = (minutes: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);

/** VDOT from a race or hard effort: distance in metres, time in seconds. */
export const vdotFromEffort = (distanceM: number, seconds: number): number => {
  const minutes = seconds / 60;
  return vo2At(distanceM / minutes) / fractionOfMax(minutes);
};

/** Time in seconds a runner with this VDOT takes for the distance (solved by bisection; time falls as fitness rises). */
export const timeFromVdot = (vdot: number, distanceM: number): number => {
  let lo = distanceM / 8.5 * 1; // faster than 8.5 m/s is beyond any runner
  let hi = distanceM / 1.2; // slower than a walk
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromEffort(distanceM, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

export const riegel = (seconds1: number, distance1M: number, distance2M: number, exponent = 1.06): number => seconds1 * (distance2M / distance1M) ** exponent;

export const RACES = [
  { id: '5k', label: '5K', meters: 5000 },
  { id: '10k', label: '10K', meters: 10000 },
  { id: 'half', label: 'Half marathon', meters: 21097.5 },
  { id: 'marathon', label: 'Marathon', meters: 42195 },
] as const;

export interface RacePrediction {
  id: string;
  label: string;
  meters: number;
  /** Predicted time with VDOT and with Riegel, in seconds. */
  vdotSeconds: number;
  riegelSeconds: number;
  /** The figure to show: the VDOT time, which is gentler than Riegel for long distances. */
  seconds: number;
}

export interface PredictionBasis {
  vdot: number;
  /** The effort the numbers come from. */
  distanceM: number;
  seconds: number;
  /** A basis shorter than 3 km says little about a marathon. */
  confidence: 'good' | 'rough';
}

/**
 * Picks the effort that shows the best fitness (highest VDOT) among efforts of at least 3 km (or 1.5 km when there are none),
 * and predicts the standard races from it. Returns null when there is no usable effort.
 */
export const predictRaces = (efforts: { distanceM: number; seconds: number }[]): { basis: PredictionBasis; predictions: RacePrediction[] } | null => {
  const valid = efforts.filter((e) => e.distanceM >= 1500 && e.seconds > 0);
  // Longer efforts say more about race fitness; a short, fast effort flatters it. Use them when there are any.
  const long = valid.filter((e) => e.distanceM >= 3000);
  const usable = long.length > 0 ? long : valid;
  if (usable.length === 0) return null;
  const scored = usable.map((e) => ({ ...e, vdot: vdotFromEffort(e.distanceM, e.seconds) }));
  const best = scored.reduce((a, b) => (b.vdot > a.vdot ? b : a));
  if (!(best.vdot > 15 && best.vdot < 90)) return null;
  const predictions = RACES.map((r) => {
    const vdotSeconds = timeFromVdot(best.vdot, r.meters);
    const riegelSeconds = riegel(best.seconds, best.distanceM, r.meters);
    return { id: r.id, label: r.label, meters: r.meters, vdotSeconds, riegelSeconds, seconds: vdotSeconds };
  });
  return {
    basis: { vdot: Math.round(best.vdot * 10) / 10, distanceM: best.distanceM, seconds: best.seconds, confidence: best.distanceM >= 3000 ? 'good' : 'rough' },
    predictions,
  };
};

/** "1:43:20" or "24:05". */
export const formatRaceTime = (seconds: number): string => {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
