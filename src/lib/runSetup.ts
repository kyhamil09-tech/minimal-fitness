import type { Lap, WorkoutType } from '../types/health';
import type { TrackPoint } from './geo';
import type { CustomIntervalInput, IntervalStep } from '../data/intervals';
import { kmToDisplay } from './units';

/**
 * What the Run screen remembers between visits and across a crash: the setup you last used (intervals, pace target, cadence beat),
 * the run in progress saved every few seconds so a killed app does not lose it, and each activity's last goal.
 */

export const GPS_TYPES: WorkoutType[] = ['Running', 'Walking', 'Cycling', 'Hiking'];

export type NumericGoal = 'distance' | 'time' | 'calories';
export type GoalType = 'open' | NumericGoal | 'intervals';
/** The target a workout was started with, in metric units: km, minutes or kcal. */
export interface ActiveGoal {
  type: NumericGoal;
  value: number;
}

/** The run in progress, saved every few seconds so a crash or a killed app does not lose it. */
export interface LiveRun {
  v: 1;
  sport: WorkoutType;
  sessionStart: number;
  pausedTotal: number;
  pausedAt: number | null;
  laps: Lap[];
  goal: ActiveGoal | null;
  goalHit: boolean;
  hr: [number, number][];
  geo: { points: TrackPoint[]; distanceKm: number; elevationGainM: number; elevationLossM: number; hr: [number, number][] };
  iv?: { steps: IntervalStep[]; idx: number; sec: number; km: number; done: boolean } | null;
  targets?: { pace?: number; zone?: number } | null;
  savedAt: number;
}
export const SETUP_KEY = 'kyfit_run_setup';
export const DEFAULT_CUSTOM: CustomIntervalInput = { reps: 6, work: 2, workByDistance: false, recoverMin: 1, warmupMin: 5, cooldownMin: 5 };
export interface RunSetup {
  ivChoice?: string;
  custom?: CustomIntervalInput;
  paceOn?: boolean;
  /** Seconds per kilometre. */
  pace?: number;
  zone?: number;
  /** Cadence beat: on, steps per minute, and different tones for left and right foot. */
  beatOn?: boolean;
  bpm?: number;
  alternate?: boolean;
}
export const readSetup = (): RunSetup => {
  try {
    return JSON.parse(localStorage.getItem(SETUP_KEY) || '{}') as RunSetup;
  } catch {
    return {};
  }
};
export const LIVE_RUN_KEY = 'kyfit_live_run';
export const readLiveRun = (): LiveRun | null => {
  try {
    const r = JSON.parse(localStorage.getItem(LIVE_RUN_KEY) || 'null') as LiveRun | null;
    // Only offer runs from the last 12 hours that actually recorded something.
    if (r && r.v === 1 && Date.now() - r.savedAt < 12 * 3600_000 && r.savedAt - r.sessionStart > 60_000) return r;
  } catch {
    // unreadable: ignore
  }
  return null;
};
export const writeLiveRun = (r: LiveRun) => {
  try {
    localStorage.setItem(LIVE_RUN_KEY, JSON.stringify(r));
  } catch {
    // storage full or unavailable
  }
};
export const clearLiveRun = () => {
  try {
    localStorage.removeItem(LIVE_RUN_KEY);
  } catch {
    // ignore
  }
};

export const GOAL_LABELS: Record<GoalType, string> = { open: 'Open', distance: 'Distance', time: 'Time', calories: 'Calories', intervals: 'Intervals' };
export const GOAL_DEFAULTS = { distance: { metric: 5, imperial: 3 }, time: 30, calories: 300 };
export const GOAL_PRESETS = {
  distance: { metric: [1, 3, 5, 10, 21.1], imperial: [1, 2, 3, 5, 10] },
  time: [15, 30, 45, 60],
  calories: [200, 300, 500, 700],
};
export const goalKey = (sport: WorkoutType) => `kyfit_goal_${sport}`;

export const readSavedGoal = (sport: WorkoutType): { type: GoalType; value?: number } => {
  try {
    const raw = localStorage.getItem(goalKey(sport));
    if (raw) return JSON.parse(raw);
  } catch {
    // storage unavailable
  }
  return { type: 'open' };
};

export const goalUnitLabel = (type: GoalType, imperial: boolean) =>
  type === 'distance' ? (imperial ? 'mi' : 'km') : type === 'time' ? 'min' : type === 'calories' ? 'kcal' : '';

export const goalSummary = (g: ActiveGoal, imperial: boolean) =>
  g.type === 'distance'
    ? `${kmToDisplay(g.value, imperial ? 'imperial' : 'metric', 2)} ${imperial ? 'mi' : 'km'}`
    : g.type === 'time'
      ? `${g.value} min`
      : `${g.value} kcal`;

