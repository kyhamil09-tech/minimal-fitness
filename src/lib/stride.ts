import { WorkoutSession } from '../types/health';

/**
 * Step length, and distance without GPS. Step length is how far one step takes you. It is worked out from your own outdoor runs
 * (distance from GPS divided by the steps the phone counted), grows with speed, and is then used to turn the steps counted on a
 * treadmill into a distance. A treadmill's own display can correct it, and the correction is remembered.
 */

export interface StepModel {
  /** Step length in meters = base + perKmh * speed (km/h). */
  base: number;
  perKmh: number;
  /** Outdoor workouts the model was learned from; 0 means it is only a guess from height. */
  samples: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Step length from height alone: about 0.41 of height walking at 5 km/h, rising to about 0.6 at 12 km/h. */
export const heightModel = (heightCm: number): StepModel => {
  const h = clamp(heightCm || 170, 120, 220) / 100;
  return { base: 0.28 * h, perKmh: 0.0267 * h, samples: 0 };
};

/** One outdoor measurement: how fast you moved and how long each step was. Null when the workout cannot give one. */
export const stepSample = (w: WorkoutSession): { speedKmh: number; stepM: number } | null => {
  if (w.cadenceKind !== 'steps' || !w.cadenceAvg || !w.gpsTracked || !w.distanceKm) return null;
  const sec = w.durationSec ?? w.durationMinutes * 60;
  const moving = sec - (w.pausedSec ?? 0);
  if (moving < 300 || w.distanceKm < 0.8) return null;
  const steps = (w.cadenceAvg * moving) / 60;
  const stepM = (w.distanceKm * 1000) / steps;
  const speedKmh = w.distanceKm / (moving / 3600);
  if (stepM < 0.35 || stepM > 1.6 || speedKmh < 2 || speedKmh > 25) return null;
  return { speedKmh, stepM };
};

/** Learns the model from outdoor workouts: a straight line through the samples when there are enough and they span some speeds, else the average. */
export const learnStepModel = (workouts: WorkoutSession[], heightCm: number): StepModel => {
  const fallback = heightModel(heightCm);
  const s = workouts.map(stepSample).filter((x): x is { speedKmh: number; stepM: number } => x !== null);
  if (s.length < 3) return fallback;
  const n = s.length;
  const mx = s.reduce((a, p) => a + p.speedKmh, 0) / n;
  const my = s.reduce((a, p) => a + p.stepM, 0) / n;
  const sxx = s.reduce((a, p) => a + (p.speedKmh - mx) ** 2, 0);
  const sxy = s.reduce((a, p) => a + (p.speedKmh - mx) * (p.stepM - my), 0);
  // With a narrow spread of speeds a slope would be noise: keep the height's slope and shift it to pass through the average.
  if (n < 6 || sxx < 8) return { base: my - fallback.perKmh * mx, perKmh: fallback.perKmh, samples: n };
  const perKmh = clamp(sxy / sxx, 0, 0.12);
  return { base: my - perKmh * mx, perKmh, samples: n };
};

export const stepLengthAt = (m: StepModel, speedKmh: number): number => clamp(m.base + m.perKmh * speedKmh, 0.35, 1.6);

/**
 * Distance covered from the steps counted. Speed and step length depend on each other, so it settles in a few rounds. `cal` is the
 * remembered correction from the treadmill's own display (1 means no correction).
 */
export const distanceFromSteps = (steps: number, movingSec: number, model: StepModel, cal = 1): number => {
  if (steps <= 0 || movingSec <= 0) return 0;
  let speed = 8;
  for (let i = 0; i < 6; i++) speed = (steps * stepLengthAt(model, speed) * cal * 3.6) / movingSec;
  return Math.round(((steps * stepLengthAt(model, speed) * cal) / 1000) * 1000) / 1000;
};

/** The new correction after a treadmill showed `shownKm` where the estimate said `estimatedKm`: halfway to the new ratio each time, kept sensible. */
export const nextCalibration = (cal: number, estimatedKm: number, shownKm: number): number => {
  if (!(estimatedKm > 0.05) || !(shownKm > 0.05)) return cal;
  const ratio = clamp(shownKm / (estimatedKm / cal), 0.6, 1.6);
  return Math.round(clamp(cal * 0.4 + ratio * 0.6, 0.6, 1.6) * 1000) / 1000;
};

const KEY = 'kyfit_treadmill_cal';
export const readCalibration = (): number => {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v >= 0.6 && v <= 1.6 ? v : 1;
  } catch {
    return 1;
  }
};
export const writeCalibration = (v: number) => {
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    // storage unavailable
  }
};

/** Step length in meters for a finished GPS workout, for showing next to cadence. */
export const workoutStepLength = (w: WorkoutSession): number | null => {
  const s = stepSample({ ...w, gpsTracked: w.gpsTracked ?? !!w.route });
  return s ? Math.round(s.stepM * 100) / 100 : null;
};
