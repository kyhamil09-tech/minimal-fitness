import { TrackPoint } from './geo';
import { WorkoutSession } from '../types/health';
import { Drift, cardiacDrift, efficiencyFactor, minettiCost } from './efficiency';
import { trackMovingSeconds } from './workoutStats';
import { median } from './robust';

/**
 * How much harder than the flat a track was, on average, from its slopes (Minetti cost, weighted by distance). Altitude is smoothed
 * over about 60 m first, because GPS and barometer altitude jump a few metres and would otherwise look like cliffs. 1.0 is flat;
 * a hilly run is above 1, so its flat-equivalent speed is higher than the speed you actually ran.
 */
export const trackEffortFactor = (track: TrackPoint[]): number => {
  const pts = track.filter((p) => p.alt !== undefined);
  if (pts.length < 6) return 1;
  const smooth = pts.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - 3); k <= Math.min(pts.length - 1, i + 3); k++) {
      s += pts[k].alt as number;
      n++;
    }
    return s / n;
  });
  let weighted = 0;
  let dist = 0;
  const flat = minettiCost(0);
  // Compare points about 60 m apart so a slope has room to show.
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    while (j < pts.length - 1 && pts[j].d - pts[i].d < 0.06) j++;
    if (j <= i) continue;
    const d = pts[j].d - pts[i].d;
    if (d < 0.03) continue;
    const grade = Math.max(-0.2, Math.min(0.2, (smooth[j] - smooth[i]) / (d * 1000)));
    weighted += (d * minettiCost(grade)) / flat;
    dist += d;
    i = j - 1;
  }
  return dist > 0 ? weighted / dist : 1;
};

export interface WorkoutEfficiency {
  workoutId: string;
  at: number;
  /** Metres per minute per beat per minute at the pace actually run. */
  ef: number;
  /** The same on flat ground: a fairer number to compare between a hilly run and a flat one. */
  adjustedEf: number;
  drift?: Drift;
  minutes: number;
}

const ELIGIBLE = new Set(['Running', 'Walking', 'Hiking', 'Treadmill']);

/** Efficiency of one workout, or null without a track, heart-rate readings and at least 20 minutes of moving. */
export const workoutEfficiency = (w: WorkoutSession): WorkoutEfficiency | null => {
  if (!ELIGIBLE.has(w.type)) return null;
  const track = w.track;
  const hr = w.hrSeries;
  if (!track || track.length < 10 || !hr || hr.length < 20) return null;
  const moving = trackMovingSeconds(track);
  const dist = (track[track.length - 1].d - track[0].d) * 1000;
  if (moving < 20 * 60 || dist < 1500) return null;
  const hrs = hr.map(([, b]) => b);
  const avgHr = hrs.reduce((a, b) => a + b, 0) / hrs.length;
  const speed = dist / moving;
  const factor = trackEffortFactor(track);
  return {
    workoutId: w.id,
    at: w.startedAt ?? 0,
    ef: efficiencyFactor(speed, avgHr),
    adjustedEf: efficiencyFactor(speed * factor, avgHr),
    drift: cardiacDrift(track, hr) ?? undefined,
    minutes: Math.round(moving / 60),
  };
};

export interface EfficiencyTrend {
  history: WorkoutEfficiency[];
  /** Median adjusted efficiency of the latest 3 runs against the 3 before them, in percent (needs 6 runs). */
  changePct?: number;
  latest?: WorkoutEfficiency;
  /** The latest workout that has a drift reading. */
  latestDrift?: WorkoutEfficiency;
}

export const efficiencyTrend = (workouts: WorkoutSession[]): EfficiencyTrend => {
  const history = workouts
    .map(workoutEfficiency)
    .filter((e): e is WorkoutEfficiency => e !== null)
    .sort((a, b) => a.at - b.at);
  const latest = history[history.length - 1];
  const withDrift = history.filter((h) => h.drift);
  let changePct: number | undefined;
  if (history.length >= 6) {
    const recent = median(history.slice(-3).map((h) => h.adjustedEf));
    const before = median(history.slice(-6, -3).map((h) => h.adjustedEf));
    if (before > 0) changePct = Math.round(((recent - before) / before) * 1000) / 10;
  }
  return { history, changePct, latest, latestDrift: withDrift[withDrift.length - 1] };
};
