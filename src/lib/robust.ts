/**
 * Robust statistics. Sensor data has spikes and bad days; the mean and standard deviation are thrown off by them, so these use
 * the median and the median absolute deviation (MAD), which a few wild values barely move.
 */

export const median = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Spread as a robust "standard deviation": the MAD scaled by 1.4826 so it matches the standard deviation for normal data. */
export const madScale = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const med = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - med)));
};

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export const stdev = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

/** How many robust standard deviations {@code x} is from the usual of {@code baseline}. {@code floor} stops a very steady baseline from exaggerating small moves. */
export const robustZ = (x: number, baseline: number[], floor = 0): number => {
  if (baseline.length < 3) return 0;
  const scale = Math.max(madScale(baseline), floor, 1e-9);
  return (x - median(baseline)) / scale;
};

/**
 * Hampel filter: a reading that sits more than {@code nSigmas} robust deviations from the median of its neighbours is a spike
 * (a strap slipping, an optical sensor locking onto cadence) and is replaced by that median. {@code minScale} keeps a very
 * steady stretch from flagging normal wobble.
 */
export const hampel = (values: number[], halfWindow = 4, nSigmas = 3, minScale = 2): { values: number[]; replaced: number } => {
  const out = values.slice();
  let replaced = 0;
  for (let i = 0; i < values.length; i++) {
    const from = Math.max(0, i - halfWindow);
    const to = Math.min(values.length - 1, i + halfWindow);
    const win = values.slice(from, to + 1);
    if (win.length < 5) continue;
    const med = median(win);
    const scale = Math.max(madScale(win), minScale);
    if (Math.abs(values[i] - med) > nSigmas * scale) {
      out[i] = med;
      replaced++;
    }
  }
  return { values: out, replaced };
};

/** Exponentially weighted moving average; {@code alpha} near 1 follows the data closely, near 0 smooths a lot. */
export const ewma = (xs: number[], alpha: number): number[] => {
  const out: number[] = [];
  let prev = NaN;
  for (const x of xs) {
    prev = Number.isNaN(prev) ? x : prev + alpha * (x - prev);
    out.push(prev);
  }
  return out;
};

/**
 * One-sided CUSUM change detector on standardised readings (z-scores). It adds up small, steady drifts that no single day
 * would flag, such as a resting heart rate creeping up for a week. {@code k} is the slack (half the shift worth noticing, in
 * deviations) and {@code h} the alarm level. Returns the running sums and the first index that crossed {@code h}, if any.
 */
export const cusumUp = (zs: number[], k = 0.5, h = 4): { sums: number[]; alarmAt: number | null } => {
  const sums: number[] = [];
  let s = 0;
  let alarmAt: number | null = null;
  zs.forEach((z, i) => {
    s = Math.max(0, s + z - k);
    sums.push(s);
    if (alarmAt === null && s > h) alarmAt = i;
  });
  return { sums, alarmAt };
};

/** Welch's t statistic and degrees of freedom for two independent groups (unequal variances allowed). */
export const welch = (a: number[], b: number[]): { t: number; df: number; diff: number } | null => {
  if (a.length < 2 || b.length < 2) return null;
  const va = stdev(a) ** 2 / a.length;
  const vb = stdev(b) ** 2 / b.length;
  const se = Math.sqrt(va + vb);
  const diff = mean(a) - mean(b);
  if (se === 0) return diff === 0 ? null : { t: diff > 0 ? Infinity : -Infinity, df: a.length + b.length - 2, diff };
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  return { t: diff / se, df, diff };
};

/**
 * Two-sided p-value for a t statistic, from the Student t distribution (regularised incomplete beta function).
 * Accurate to a few digits, which is plenty for deciding whether a pattern is worth showing.
 */
export const tPValue = (t: number, df: number): number => {
  if (!Number.isFinite(t)) return 0;
  const x = df / (df + t * t);
  return betaInc(df / 2, 0.5, x);
};

const lgamma = (z: number): number => {
  // Lanczos approximation
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
};

/** Regularised incomplete beta I_x(a, b) by continued fraction (Numerical Recipes). */
const betaInc = (a: number, b: number, x: number): number => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betaCf(a, b, x)) / a;
  return 1 - (bt * betaCf(b, a, 1 - x)) / b;
};

const betaCf = (a: number, b: number, x: number): number => {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
};
