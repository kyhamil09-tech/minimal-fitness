/**
 * Stroke rate for rowing from the phone's accelerometer. The phone, in a pocket or on an arm, moves once per stroke, so the
 * strongest repeating rhythm in the movement over the last few seconds is the stroke rate. Native code supplies the movement
 * strength at a steady rate; this finds the rhythm (the same idea as cadence from steps).
 */
export interface StrokeReading {
  spm: number;
  /** How regular the rhythm is, 0 to 1. Low values mean it is a guess. */
  strength: number;
}

/**
 * The movement along the direction the phone moves most (its principal axis), as one signed signal. Rowing swings the
 * phone back and forth once per stroke, so this signal has the stroke rhythm in it, whichever way the phone sits. Using the
 * overall strength instead would count the drive and the recovery separately and double the rate.
 */
export const principalAxis = (x: number[], y: number[], z: number[]): number[] => {
  const n = Math.min(x.length, y.length, z.length);
  if (n === 0) return [];
  const mean = (a: number[]) => a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mx = mean(x);
  const my = mean(y);
  const mz = mean(z);
  const c = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < n; i++) {
    const v = [x[i] - mx, y[i] - my, z[i] - mz];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) c[a][b] += v[a] * v[b];
  }
  let axis = [1, 1, 1];
  for (let k = 0; k < 40; k++) {
    const next = [0, 1, 2].map((a) => c[a][0] * axis[0] + c[a][1] * axis[1] + c[a][2] * axis[2]);
    const len = Math.hypot(next[0], next[1], next[2]);
    if (len < 1e-12) break;
    axis = next.map((v) => v / len);
  }
  return Array.from({ length: n }, (_, i) => (x[i] - mx) * axis[0] + (y[i] - my) * axis[1] + (z[i] - mz) * axis[2]);
};

const MIN_SPM = 15;
const MAX_SPM = 43;
const MIN_STRENGTH = 0.3;

/** Strokes per minute from movement samples taken {@code fs} times a second, or null when no clear rhythm is found. */
export const strokeRate = (samples: number[], fs: number): StrokeReading | null => {
  const n = samples.length;
  if (n < fs * 8 || fs <= 0) return null;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const x = samples.map((v) => v - mean);
  const energy = x.reduce((a, b) => a + b * b, 0);
  if (energy / n < 1e-4) return null; // not moving

  const minLag = Math.max(2, Math.floor((fs * 60) / MAX_SPM));
  const maxLag = Math.min(Math.floor(n / 2), Math.ceil((fs * 60) / MIN_SPM));
  if (maxLag <= minLag + 2) return null;
  const r = new Array<number>(maxLag + 2).fill(0);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag];
    r[lag] = s / energy;
  }
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) best = Math.max(best, r[lag]);
  if (best < MIN_STRENGTH) return null;

  // The first clear peak is the stroke itself; later ones are whole multiples of it.
  for (let lag = minLag; lag <= maxLag; lag++) {
    const isPeak = r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1];
    if (isPeak && r[lag] >= best * 0.85) {
      // Refine between samples with a parabola through the peak.
      const denom = r[lag - 1] - 2 * r[lag] + r[lag + 1];
      const shift = denom !== 0 ? (0.5 * (r[lag - 1] - r[lag + 1])) / denom : 0;
      const spm = Math.round((fs * 60) / (lag + Math.max(-0.5, Math.min(0.5, shift))));
      return { spm, strength: Math.round(r[lag] * 100) / 100 };
    }
  }
  return null;
};

/** Average and highest of the readings taken while rowing. */
export const summarizeStrokes = (readings: number[]): { avg: number; max: number } | null => {
  const r = readings.filter((n) => n >= MIN_SPM && n <= MAX_SPM);
  if (r.length < 5) return null;
  return { avg: Math.round(r.reduce((s, n) => s + n, 0) / r.length), max: Math.max(...r) };
};
