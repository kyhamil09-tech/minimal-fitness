import type { ExerciseLog } from './tracking';
import type { TrackPoint } from '../lib/geo';

export type TabId =
  | 'today'
  | 'exercise'
  | 'nutrition'
  | 'sleep'
  | 'fasting'
  | 'healthlog'
  | 'progress'
  /** Stands for Progress opened on its Vitals section (live heart rate and the daily fitness numbers). */
  | 'health'
  | 'settings';

export type MetricKey =
  | 'steps'
  | 'sleep'
  | 'live_hr'
  | 'active_calories'
  | 'movement_distance';

export interface MetricConfig {
  id: MetricKey;
  label: string;
  category: 'Recovery' | 'Activity' | 'Cardio';
  description: string;
  defaultVisible: boolean;
}

export type WorkoutType =
  | 'Walking'
  | 'Running'
  | 'Cycling'
  | 'Rowing'
  | 'Hiking'
  | 'Strength'
  | 'Calisthenics'
  | 'HIIT'
  | 'Core'
  | 'Mobility'
  | 'Treadmill'
  | 'IndoorCycling'
  | 'Elliptical'
  | 'Yoga';

export interface WorkoutSession {
  id: string;
  type: WorkoutType;
  timestamp: string;
  durationMinutes: number;
  distanceKm?: number;
  avgHeartRate: number;
  caloriesBurned: number;
  isManualEntry?: boolean;
  perceivedExertion?: number; // RPE 1-10
  notes?: string;
  cardioLoadPoints?: number;
  /** Epoch ms when the workout started. Older records may only have `timestamp`. */
  startedAt?: number;
  /** Distance/route came from the device GPS (not an estimate). */
  gpsTracked?: boolean;
  route?: [number, number][];
  /** Timestamped GPS track (cumulative distance + altitude); enables splits, pace and the map. */
  track?: TrackPoint[];
  /** Heart-rate readings as [epoch ms, bpm], about one per 5 s. */
  hrSeries?: [number, number][];
  /** Exact length of the session in seconds (durationMinutes is rounded). */
  durationSec?: number;
  maxHeartRate?: number;
  /** Laps marked with the lap button during the workout. */
  laps?: Lap[];
  elevationLossM?: number;
  elevationGainM?: number;
  /** Heart rate came from a live sensor (Pixel Watch or Bluetooth) rather than an estimate. */
  hrFromSensor?: boolean;
  exercises?: ExerciseLog[];
  planDayTitle?: string;
  /** Steps per minute from the phone's step sensor (average and highest while moving). */
  cadenceAvg?: number;
  cadenceMax?: number;
  /** What cadenceAvg and cadenceMax count: steps per minute (default) or rowing strokes per minute. */
  cadenceKind?: 'steps' | 'strokes' | 'rpm';
  /** From a Bluetooth power meter: average, highest, normalised, and best 20-minute watts. */
  avgPowerW?: number;
  maxPowerW?: number;
  normPowerW?: number;
  bestPower20W?: number;
  /** Seconds spent in each of six power zones (see POWER_ZONES), when your threshold power was known. */
  powerZoneSec?: number[];
  /** The threshold power the load and zones were worked out with. */
  ftpW?: number;
  /** Time the workout was paused, in seconds (the duration does not include it). */
  pausedSec?: number;
  /** Where the climb and descent came from: the phone's barometer, or GPS altitude. */
  elevationFrom?: 'barometer' | 'gps';
  /** The pair of shoes worn (see Gear on the Run tab). */
  shoeId?: string;
  /** Set when the workout came from a file or another app's export rather than being recorded here ("Strava archive", "GPX file"). */
  importedFrom?: string;
  /** Saved to Health Connect. Missing when it was never sent (Health Connect off, no permission, or recorded before it was on). */
  syncedToHc?: boolean;
}

export interface Lap {
  n: number;
  /** Epoch ms when the lap button was pressed. */
  t: number;
  /** Cumulative distance at that moment, km. */
  distanceKm: number;
  /** Seconds since the previous lap (or the start). */
  splitSec: number;
}

export interface QuickWorkoutTemplate {
  id: string;
  title: string;
  category: 'Core' | 'Walking' | 'Mobility' | 'HIIT' | 'Strength';
  durationMinutes: number;
  estimatedCalories: number;
  estimatedCardioLoad: number;
  rpe: number;
  description: string;
}

export interface FastingSession {
  id: string;
  startTimeIso: string;
  startTimestamp: number;
  endTimeIso?: string;
  endTimestamp?: number;
  targetDurationHours: number;
  isCompleted: boolean;
  actualHours?: number;
  fastProtocolName: string; // e.g. "16:8 Standard", "18:6 Warrior", "20:4 OMAD", "14:10 Gentle", "Custom"
  notes?: string;
  /** How you felt along the way: a tap-to-choose check-in with tags, each stamped with the time. */
  checkIns?: FastingCheckIn[];
}

/** One "how do you feel" check-in during a fast. */
export interface FastingCheckIn {
  /** Epoch ms of the check-in. */
  at: number;
  /** Ids of the feeling tags chosen (see FEELING_TAGS in lib/fasting). */
  tags: string[];
}

export interface FastingStageInfo {
  name: string;
  hourRange: string;
  description: string;
  physiologicalMarker: string;
  isActive: boolean;
}

export interface SleepLogEntry {
  id: string;
  dateIso: string; // YYYY-MM-DD
  displayDate: string; // e.g. "Fri, Oct 2"
  bedtime: string; // e.g. "23:15"
  wakeTime: string; // e.g. "07:15"
  durationMinutes: number;
  qualityRating: number; // 1-5
  notes?: string;
  isManualEntry: boolean;
  /** Where the night came from. Missing means logged by hand. 'sensors' is the app's own estimate from the watch. */
  source?: 'manual' | 'health-connect' | 'sleep-api' | 'sensors' | 'import';
  deepSleepMinutes: number;
  remSleepMinutes: number;
  lightSleepMinutes: number;
  awakeMinutes: number;
  efficiencyScore: number; // 0-100%
  /** The night's timeline and overnight readings, when a watch or the app's own sensors supplied them. */
  detail?: SleepDetail;
}

/** Sleep stage codes used in {@link SleepDetail.segments}. */
export type SleepStageCode = 0 | 1 | 2 | 3; // 0 awake, 1 light, 2 deep, 3 REM

export interface SleepDetail {
  startMs: number;
  endMs: number;
  /** In time order: [stage code, start ms, end ms]. */
  segments: [SleepStageCode, number, number][];
  /** Times you woke up during the night (not counting falling asleep or the final waking). */
  awakenings: number;
  inBedMinutes: number;
  /** Overnight readings; each is missing when it was not recorded or not shared. */
  hrAvg?: number;
  hrMin?: number;
  hrMax?: number;
  /** Heart rate variability (RMSSD, ms). */
  hrvMs?: number;
  /** Breaths per minute. */
  respRate?: number;
  spo2Avg?: number;
  spo2Min?: number;
  /** Skin temperature change against the personal baseline, in °C. */
  skinDelta?: number;
  /** Where the stages came from: measured by the watch and supplied through Health Connect, or estimated by this app. */
  stagesFrom: 'measured' | 'estimated';
  /** When the overnight readings above were last looked up in Health Connect (they arrive after the stages). */
  vitalsAt?: number;
}

export interface SleepStage {
  name: 'Deep' | 'REM' | 'Light' | 'Awake';
  durationMinutes: number;
  percentage: number;
  color: string;
}

