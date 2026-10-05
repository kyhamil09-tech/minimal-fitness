import { Capacitor, registerPlugin } from '@capacitor/core';

/** True inside the Android app, where the native plugins below exist. */
export const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export interface StepsTotals {
  sensor: boolean;
  permission: boolean;
  /** Today's steps from the phone's step counter. */
  phone: number;
  /** Today's steps reported by the watch. */
  watch: number;
  day: string;
}

export const Steps = registerPlugin<{
  start(): Promise<StepsTotals>;
  /** `sensor: false` returns what is stored (the watch's total) without reading the phone's step counter. */
  getToday(options?: { sensor?: boolean }): Promise<StepsTotals>;
  /** Timed samples for the phone and the watch: [epoch ms, steps so far that day], oldest first. */
  history(): Promise<{ phone: [number, number][]; watch: [number, number][] }>;
  /** Stops the background step counting. Today's saved total stays; start() turns it back on. */
  stop(): Promise<void>;
}>('Steps');

export interface HcStatus {
  available: boolean;
  needsUpdate: boolean;
  sleepGranted: boolean;
  stepsGranted: boolean;
  /** How many of the requested read/write permissions are granted. */
  total?: number;
  grantedCount?: number;
  allGranted?: boolean;
  canRead?: boolean;
  canWrite?: boolean;
  /** Permission names still missing, e.g. "WRITE_NUTRITION". */
  missing?: string[];
}

export interface HcSleepSession {
  id: string;
  start: number;
  end: number;
  offsetSeconds: number;
  /** [stage type, start ms, end ms] */
  stages: [number, number, number][];
  /** The app that saved the session (for example the Google Health / Fitbit app). */
  source?: string;
}

/** The overnight readings Health Connect holds for one night (each is missing when not recorded or not shared). */
export interface HcSleepVitals {
  id: string;
  hrAvg?: number;
  hrMin?: number;
  hrMax?: number;
  /** Average overnight HRV (RMSSD, ms) and how many readings it is based on. */
  hrvAvg?: number;
  hrvCount?: number;
  /** Average breaths per minute. */
  respAvg?: number;
  spo2Avg?: number;
  spo2Min?: number;
  /** Skin temperature change against the baseline, °C. */
  skinDelta?: number;
}

/** One day of the fitness numbers Health Connect keeps (each is missing when not recorded or not shared). */
export interface HcFitnessDay {
  date: string;
  hrAvg?: number;
  hrMin?: number;
  hrMax?: number;
  restingHr?: number;
  floors?: number;
  exerciseMin?: number;
  hrvMs?: number;
}

/** A workout another app recorded, as read from Health Connect (see HealthConnectPlugin.readWorkouts). */
export interface HcWorkout {
  id: string;
  /** Health Connect's exercise type number. */
  type: number;
  title: string;
  notes: string;
  start: number;
  end: number;
  /** Package name of the app that recorded it. */
  source: string;
  distanceM?: number;
  totalKcal?: number;
  activeKcal?: number;
  hrAvg?: number;
  hrMax?: number;
  /** [epoch ms, bpm] */
  hr?: [number, number][];
}

export interface HcWorkoutWrite {
  id: string;
  type: string;
  start: number;
  end: number;
  /** Recorded live by this app (true) or logged by hand (false). */
  live: boolean;
  title?: string;
  notes?: string;
  distanceKm?: number;
  kcal?: number;
  /** [epoch ms, bpm] */
  hr?: [number, number][];
  /** [epoch ms, lat, lng, altitude or null] */
  route?: [number, number, number, number | null][];
}

export const HealthConnect = registerPlugin<{
  status(): Promise<HcStatus>;
  requestAccess(): Promise<HcStatus>;
  /** Opens Health Connect's own permission screen (Android stops showing the pop-up after repeated refusals). */
  openSettings(): Promise<void>;
  readSleep(options: { days: number }): Promise<{ sessions: HcSleepSession[] }>;
  /** Overnight heart rate, HRV, breathing, blood oxygen and skin temperature for the given nights (slow: ask for a few at a time). */
  readSleepVitals(options: { nights: { id: string; start: number; end: number }[] }): Promise<{ nights: HcSleepVitals[] }>;
  readSteps(options: { days: number }): Promise<{ days: { date: string; steps: number }[] }>;
  /** Steps in one-hour pieces: [start ms, end ms, steps]. */
  readStepBuckets(options: { days: number }): Promise<{ buckets: [number, number, number][] }>;
  /** Daily heart-rate range, resting heart rate, floors, exercise minutes and HRV, plus the VO2 max history [ms, value]. */
  readFitness(options: { days: number }): Promise<{ days: HcFitnessDay[]; vo2: [number, number][] }>;
  readDaily(options: { days: number }): Promise<{
    days: { date: string; totalKcal: number; activeKcal: number; distanceKm: number; avgHr: number }[];
  }>;
  readHeartRate(options: { hours: number }): Promise<{ samples: [number, number][]; restingBpm: number }>;
  readBody(options: { days: number }): Promise<{
    weights: { id: string; time: number; kg: number; own: boolean }[];
    bodyFat: { time: number; pct: number }[];
    heightCm: number;
  }>;
  readExercise(options: { days: number }): Promise<{
    sessions: { id: string; type: number; title: string; start: number; end: number; source: string; own: boolean }[];
  }>;
  /** Workouts other apps recorded, with distance, calories and heart rate; the newest `max` not in `skip`. */
  readWorkouts(options: { days: number; max: number; skip: string[] }): Promise<{ sessions: HcWorkout[]; remaining: number }>;
  writeWorkout(options: HcWorkoutWrite): Promise<void>;
  writeBody(options: { id: string; time: number; weightKg: number; bodyFatPct?: number }): Promise<void>;
  writeNutrition(options: {
    id: string;
    start: number;
    meal: string;
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }): Promise<void>;
  writeHydration(options: { id: string; start: number; ml: number }): Promise<void>;
  writeSleep(options: {
    id: string;
    start: number;
    end: number;
    title?: string;
    notes?: string;
    stages?: [number, number, number][];
  }): Promise<void>;
  writeBloodPressure(options: { id: string; time: number; systolic: number; diastolic: number }): Promise<void>;
  writeBloodGlucose(options: { id: string; time: number; mgdl: number; relation?: string }): Promise<void>;
  readLogs(options: { days: number }): Promise<{
    bloodPressure: { id: string; time: number; systolic: number; diastolic: number; own: boolean }[];
    glucose: { id: string; time: number; mgdl: number; own: boolean }[];
  }>;
  deleteRecords(options: {
    kind: 'bloodPressure' | 'bloodGlucose' | 'workout' | 'distance' | 'calories' | 'heartRate' | 'weight' | 'bodyFat' | 'nutrition' | 'hydration' | 'sleep';
    ids: string[];
  }): Promise<void>;
}>('HealthConnect');
export interface BackupFolderStatus {
  folder: string | null;
  lastBackupAt: number;
  lastFile: string;
  needsReselect: boolean;
}

export const FolderBackup = registerPlugin<{
  getStatus(): Promise<BackupFolderStatus>;
  chooseFolder(): Promise<BackupFolderStatus>;
  clearFolder(): Promise<BackupFolderStatus>;
  write(options: { name: string; data: string }): Promise<BackupFolderStatus>;
  readLatest(): Promise<{ name: string; data: string }>;
}>('FolderBackup');

export const Diagnostics = registerPlugin<{
  getCrashLog(): Promise<{ log: string }>;
  clearCrashLog(): Promise<void>;
}>('Diagnostics');
export const Launch = registerPlugin<{
  getPendingAction(): Promise<{ action: string | null }>;
  /** Pins a home-screen shortcut that opens the app, drawn from a base64 PNG (the way a custom-colour icon gets onto the home screen). */
  addHomeShortcut(options: { png: string; label?: string }): Promise<{ supported: boolean; requested?: boolean }>;
  /** Height in CSS pixels of the system gesture / navigation strip at the bottom of the screen. */
  getSystemInsets(): Promise<{ bottom: number }>;
  /** Switches the home-screen icon to one of the colour presets (see LOGO_PRESETS). */
  setLauncherIcon(options: { id: string }): Promise<void>;
  getLauncherIcon(): Promise<{ id: string }>;
  getWatchWorkouts(): Promise<{ items: string[] }>;
  ackWatchWorkouts(options: { ids: string[] }): Promise<void>;
  updateWidget(options: {
    steps: number;
    stepGoal: number;
    week: number;
    weekGoal: number;
    streak: number;
    /** Today's readiness, or -1 when there is none yet. */
    readiness?: number;
    readinessLabel?: string;
    /** Share of the monthly goal done, or -1 when no goal is set. */
    monthPct?: number;
    monthLabel?: string;
  }): Promise<void>;
  isIgnoringBatteryOptimizations(): Promise<{ ignoring: boolean }>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
  setKeepScreenOn(options: { on: boolean }): Promise<void>;
}>('Launch');

/** Speech to text done by Android on the phone itself, for logging food and water by voice. */
export const VoiceLog = registerPlugin<{
  available(): Promise<{ available: boolean }>;
  listen(): Promise<{ text: string }>;
  cancel(): Promise<void>;
}>('VoiceLog');

/** Unlock with the phone's own fingerprint, face or screen lock. The app only learns yes or no. */
export const AppLock = registerPlugin<{
  available(): Promise<{ available: boolean }>;
  authenticate(options?: { title?: string }): Promise<{ ok: boolean; message?: string }>;
  setSecure(options: { on: boolean }): Promise<void>;
}>('AppLock');

/** Offline map files you import: kept in the app's private folder and read a piece at a time. */
export const MapPack = registerPlugin<{
  /** Opens the file picker, copies the chosen PMTiles file in and returns it. Rejects with "cancelled" when you back out. */
  importPack(): Promise<{ id: string; name: string; size: number }>;
  list(): Promise<{ packs: { id: string; size: number }[] }>;
  remove(options: { id: string }): Promise<void>;
  read(options: { id: string; offset: number; length: number }): Promise<{ data: string }>;
  addListener(event: 'progress', fn: (p: { copied: number; total: number }) => void): Promise<{ remove: () => Promise<void> }>;
}>('MapPack');

/** The running fast, handed to Android so the notification and the widget keep counting with the app closed. */
export const Fasting = registerPlugin<{
  sync(options: {
    active: boolean;
    startMs: number;
    goalHours: number;
    protocol: string;
    live: boolean;
    stages: boolean;
    lastHours: number;
    lastProtocol: string;
  }): Promise<void>;
}>('Fasting');

/** The few numbers the watch's complications show, sent to the watch over its Bluetooth link. */
export const Glance = registerPlugin<{
  sendAlarm(options: { enabled: boolean; wakeMin: number; windowMin: number }): Promise<void>;
  /** The strength sessions the watch offers when you start Strength there: a JSON list of {id, name, sub}. */
  sendRoutines(options: { json: string }): Promise<void>;
  /** The shoes and bikes the watch offers when you start a run or ride there: a JSON list (see lib/watchGear). */
  sendGear(options: { json: string }): Promise<void>;
  send(options: {
    readiness: number;
    readinessLabel: string;
    stepGoal: number;
    monthPct: number;
    monthText: string;
    monthKind: string;
    fastActive: boolean;
    fastStartMs: number;
    fastGoalHours: number;
  }): Promise<void>;
}>('Glance');