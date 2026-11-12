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
  /** The same counts for the permissions that only read (used when nothing is sent to Health Connect). */
  readTotal?: number;
  readGrantedCount?: number;
  allReadGranted?: boolean;
  canRead?: boolean;
  canWrite?: boolean;
  /** Granted and total permissions for each feature (activity, heart, sleep, body, nutrition, vitals). */
  groups?: Record<string, { granted: number; total: number; readGranted?: number; readTotal?: number }>;
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
  /** The night's heart rate as five-minute averages: [epoch ms, bpm]. */
  hrSeries?: [number, number][];
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
  /** Asks for the permissions of the named features (all of them when none are named). */
  requestAccess(options?: { groups?: string[]; readOnly?: boolean }): Promise<HcStatus>;
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
  /** A finished breathing session, saved as a mindfulness session. */
  writeMindfulness(options: { id: string; start: number; end: number; title?: string; notes?: string }): Promise<void>;
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
    kind: 'bloodPressure' | 'bloodGlucose' | 'workout' | 'distance' | 'calories' | 'heartRate' | 'weight' | 'bodyFat' | 'nutrition' | 'hydration' | 'sleep' | 'mindfulness';
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
  /** Pins a home-screen shortcut that opens the app, drawn from a base64 PNG (the way a custom-color icon gets onto the home screen). */
  addHomeShortcut(options: { png: string; label?: string }): Promise<{ supported: boolean; requested?: boolean }>;
  /** Height in CSS pixels of the system gesture / navigation strip at the bottom of the screen. */
  getSystemInsets(): Promise<{ bottom: number }>;
  /** Switches the home-screen icon to one of the color presets (see LOGO_PRESETS). */
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

/** Breathing sessions done on the watch while the app was closed: [[endMs, patternId, seconds, bpmStart, bpmEnd], ...], handed over once. */
export const BreatheWatch = registerPlugin<{ takePending(): Promise<{ items: [number, string, number, number, number][] }> }>('BreatheWatch');

/** Reads the text in a photo of a nutrition label, on the phone (the model is inside the app; nothing is sent anywhere). */
export const LabelScan = registerPlugin<{
  read(options: { image: string }): Promise<{ lines: { text: string; left: number; top: number; right: number; bottom: number }[] }>;
  /** Names what is in a photo of a meal (an on-device image model). */
  labels(options: { image: string }): Promise<{ labels: { text: string; confidence: number }[] }>;
}>('LabelScan');

/** Downloads one web page for recipe import (public https addresses only, checked again in native code). */
export const RecipeFetch = registerPlugin<{ fetch(options: { url: string }): Promise<{ html: string; url: string }> }>('RecipeFetch');

/** Reads the clipboard text when the person asks (the web view cannot). */
export const ClipboardRead = registerPlugin<{ read(): Promise<{ text: string }> }>('ClipboardRead');

/** Opens a web page in an in-app overlay (an Android Custom Tab). Only https addresses. */
export const OpenUrl = registerPlugin<{ open(options: { url: string }): Promise<void> }>('OpenUrl');

/** The workout in progress as a notification with a rest countdown, and the launcher's long-press shortcuts. */
export const LiftSession = registerPlugin<{
  sync(options: { active: boolean; title?: string; detail?: string; startedAt?: number; restEndsAt?: number; paused?: boolean; alert?: 'vibrate' | 'sound' | 'both' | 'silent' }): Promise<void>;
  setShortcuts(options: { emptyLabel: string; routines: { id: string; name: string }[] }): Promise<void>;
  /** The numbers on the Lift home-screen widget. */
  widget(options: { week: number; todayId: string; todayName: string }): Promise<void>;
}>('LiftSession');

/** The running fast, handed to Android so the notification and the widget keep counting with the app closed. */
export const Fasting = registerPlugin<{
  sync(options: {
    active: boolean;
    startMs: number;
    goalHours: number;
    protocol: string;
    live: boolean;
    stages: boolean;
    /** The glow card (drawn in the app's colors) instead of the system live update. */
    glow?: boolean;
    /** The app's accent color as #RRGGBB, so the notification matches the color scheme. */
    accent?: string;
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
  /** The exercise library for the watch's picker (see lib/watchStrength buildWatchExercises). */
  sendExercises(options: { json: string }): Promise<void>;
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
    /** The most you can reach, so the watch's heart-rate zones are right when the phone is not there (0 = unknown). */
    maxHr?: number;
    /** Last night, for the watch's sleep screen and complication (sleepMin -1 = none). */
    sleepMin?: number;
    sleepDeep?: number;
    sleepRem?: number;
    sleepLight?: number;
    sleepAwake?: number;
    sleepScore?: number;
    sleepBed?: string;
    sleepWake?: string;
    sleepDate?: string;
    sleepGoalMin?: number;
    /** Today's food, for the watch's Eat tile and complication, and its meal nudge (eatLastMs 0 = unknown). */
    eatEaten?: number;
    eatGoal?: number;
    eatLeft?: number;
    eatP?: number;
    eatPGoal?: number;
    eatLastMs?: number;
    /** The week's sleep debt in minutes (-1 = no nights tracked) and how many nights it is built from. */
    sleepDebtMin?: number;
    sleepDebtNights?: number;
  }): Promise<void>;
}>('Glance');

/** Puts planned workouts and meals into a calendar on the phone (Google account and on-phone calendars only). */
export const DeviceCalendar = registerPlugin<{
  listCalendars(): Promise<{ calendars: { id: string; name: string; account: string; google: boolean }[] }>;
  addEvents(options: { calendarId: string; events: { key: string; title: string; startMs: number; endMs: number; description: string }[] }): Promise<{ added: { key: string; id: number }[] }>;
  removeEvents(options: { ids: number[] }): Promise<{ removed: number }>;
}>('DeviceCalendar');

/** Today's calories for the Eat widget and the Eat Quick Settings tile. */
export const Eat = registerPlugin<{
  sync(options: { eaten: number; goal: number; left: number; proteinG: number; proteinGoal: number }): Promise<void>;
  /** Meals said into the watch since the app last looked: a JSON list of {at, text}, handed over once. */
  takeVoice(): Promise<{ items: string }>;
  /** A short note back to the watch about a meal it sent. */
  sendResult(options: { text: string }): Promise<void>;
}>('Eat');

/** Today's water for the home-screen widget and the watch's Fuel tile, and water added there while the app was closed. */
export const Water = registerPlugin<{
  sync(options: { totalMl: number; goalMl: number; imperial: boolean; step1Ml: number; step2Ml: number; lastMl?: number }): Promise<void>;
  /** [[epoch ms, ml], ...] added from the widget or the watch since the app last looked. They are removed once handed over. */
  takePending(): Promise<{ items: unknown[] }>;
}>('Water');