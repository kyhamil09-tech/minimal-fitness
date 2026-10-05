import { WorkoutSession } from '../types/health';
import { effortShare } from './calc';

export interface Vo2Estimate {
  /** ml of oxygen per kg of body weight per minute. */
  value: number;
  /** How many runs it is based on. */
  runs: number;
  /** The newest run used. */
  at: number;
}

type RunLike = Pick<WorkoutSession, 'type' | 'startedAt' | 'durationSec' | 'durationMinutes' | 'distanceKm' | 'avgHeartRate' | 'hrFromSensor' | 'elevationGainM'>;

const DAY = 86_400_000;

/** VO2 max implied by one steady run: the oxygen the pace needs, divided by how much of your heart-rate range you used. */
export const vo2FromRun = (run: RunLike, maxHr: number, restHr: number): number | null => {
  const seconds = run.durationSec ?? run.durationMinutes * 60;
  const km = run.distanceKm ?? 0;
  if (run.type !== 'Running' || !run.hrFromSensor || km < 2.5 || seconds < 12 * 60) return null;
  const metresPerMin = (km * 1000) / (seconds / 60);
  if (metresPerMin < 110 || metresPerMin > 300) return null; // slower than a jog, or not a believable pace
  const share = effortShare(run.avgHeartRate, maxHr, restHr, 'reserve');
  if (!(share >= 0.55 && share <= 0.95)) return null; // too easy or too hard to infer anything from
  const grade = Math.max(0, (run.elevationGainM ?? 0) / (km * 1000));
  const needed = 0.2 * metresPerMin + 0.9 * metresPerMin * grade + 3.5; // ACSM running equation
  const vo2max = (needed - 3.5) / share + 3.5;
  return Number.isFinite(vo2max) ? vo2max : null;
};

/**
 * An estimate of VO2 max from your recent runs (the median of up to five from the last 90 days), for when your watch has not
 * given one. It is rougher than a lab test or a watch's own number: it assumes a flat, steady effort at a sensor-measured
 * heart rate, and is shown as an estimate.
 */
export const estimateVo2Max = (workouts: RunLike[], maxHr: number, restHr: number, now = Date.now()): Vo2Estimate | null => {
  const used = workouts
    .filter((w) => w.startedAt && now - (w.startedAt as number) <= 90 * DAY)
    .sort((a, b) => (b.startedAt as number) - (a.startedAt as number))
    .map((w) => ({ at: w.startedAt as number, v: vo2FromRun(w, maxHr, restHr) }))
    .filter((r): r is { at: number; v: number } => r.v !== null)
    .slice(0, 5);
  if (used.length === 0) return null;
  const sorted = used.map((r) => r.v).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { value: Math.round(Math.min(75, Math.max(20, median)) * 10) / 10, runs: used.length, at: used[0].at };
};
