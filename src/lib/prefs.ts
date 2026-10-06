import { createContext, useContext } from 'react';
import { WorkoutType } from '../types/health';
import type { ZoneMethod } from './calc';
import { STEP_SOURCES, type StepSource } from './steps';

/** Everything in Settings that is a simple choice, kept in one saved object. */
export interface AppPrefs {
  /** Swipe left or right to change tabs. */
  swipeTabs: boolean;
  /** Keep the screen on while a workout is running. */
  keepScreenOn: boolean;
  /** Count 3, 2, 1 before a workout starts. */
  startCountdown: boolean;
  /** Spoken updates by distance or by time. */
  voiceMode: 'distance' | 'time';
  /** Distance between spoken updates, in your distance unit (km or mi). */
  voiceDistance: number;
  /** Minutes between spoken updates when announcing by time. */
  voiceMinutes: number;
  voiceSayDistance: boolean;
  voiceSayTime: boolean;
  voiceSayPace: boolean;
  weekStart: 'mon' | 'sun';
  /** The screen the app opens on. */
  defaultTab: 'today' | 'exercise';
  /** Activity preselected on the Start screen, or the one you used last. */
  defaultSport: 'last' | WorkoutType;
  /** Record the GPS track less often to save battery. */
  gpsSaver: boolean;
  /** Buzz when a goal is reached. */
  hapticsGoals: boolean;
  /** Buzz and count at the start and at each interval step. */
  hapticsSteps: boolean;
  /** Buzz for pace and heart-rate alerts. */
  hapticsAlerts: boolean;
  /** Cadence beat loudness, 20 to 100. */
  beatVolume: number;
  beatSound: 'click' | 'wood' | 'beep';
  /** Bigger text across the app. */
  largeText: boolean;
  /** Turn off slide and fade animations. */
  reduceMotion: boolean;
  /** Heart-rate zones as a share of your max heart rate, or of your heart-rate reserve (uses resting heart rate). */
  zoneMethod: ZoneMethod;
  /** Soft drifting colour behind the screens: never, for a few seconds after a tab change, or all the time. */
  glow: 'off' | 'tabs' | 'always';
  /** Frosted, see-through cards and bars (needs the background glow behind them to look its best). */
  liquidGlass: boolean;
  /** Ask for your fingerprint, face or screen lock when the app opens or comes back after a short while away. */
  appLock: boolean;
  /** Blank the app in the recent-apps list and block screenshots. */
  hideInRecents: boolean;
  /** Manual cycle tracking with phase notes, stored only on this phone. */
  cycleTracking: boolean;
  /** Functional threshold power in watts for power-based load; 0 works it out from your best rides. */
  ftpW: number;
  /** Bring workouts other apps saved to Health Connect (Google Health / Fitbit and others) into the workout list. */
  importHcWorkouts: boolean;
  /** The logo shown in the app: its shape and its two colours (the home-screen icon is chosen separately, from the presets). */
  logoStyle: 'ring' | 'badge' | 'mark';
  logoBg: string;
  logoInk: string;
  /** A light tick when you tap buttons and choices, and a small pulse when something is finished. */
  uiHaptics: boolean;
  /** Offer to record a run or ride when the phone notices you started one (never starts by itself). */
  detectWorkouts: boolean;
  /** The same for walks, which are much more frequent, so it is its own switch. */
  detectWalks: boolean;
  /** Wheel rollout in millimetres, for speed from a wheel sensor (2105 is a common road tyre). */
  wheelMm: number;
  /** Which source counts your steps: the best of all, only the phone, only the watch, or only Health Connect. */
  stepSource: StepSource;
  /** Master switch for Health Connect: when off the app neither reads from it nor writes to it, and never asks for permission. */
  useHealthConnect: boolean;
}

export const DEFAULT_PREFS: AppPrefs = {
  swipeTabs: true,
  keepScreenOn: true,
  startCountdown: false,
  voiceMode: 'distance',
  voiceDistance: 1,
  voiceMinutes: 5,
  voiceSayDistance: false,
  voiceSayTime: true,
  voiceSayPace: true,
  weekStart: 'mon',
  defaultTab: 'today',
  defaultSport: 'last',
  gpsSaver: false,
  hapticsGoals: true,
  hapticsSteps: true,
  hapticsAlerts: true,
  beatVolume: 80,
  beatSound: 'click',
  largeText: false,
  reduceMotion: false,
  glow: 'tabs',
  zoneMethod: 'reserve',
  liquidGlass: false,
  appLock: false,
  hideInRecents: false,
  cycleTracking: false,
  ftpW: 0,
  importHcWorkouts: true,
  logoStyle: 'ring',
  logoBg: '#30633F',
  logoInk: '#FFFFFF',
  uiHaptics: true,
  detectWorkouts: true,
  detectWalks: false,
  wheelMm: 2105,
  stepSource: 'auto',
  useHealthConnect: true,
};

const KEY = 'kyfit_prefs';

/** Reads saved preferences, filling anything missing or invalid with the defaults. */
export const readPrefs = (): AppPrefs => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<AppPrefs>;
    return sanitizePrefs(raw);
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const writePrefs = (prefs: AppPrefs) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable
  }
};

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** Keeps stored values inside their allowed ranges (older versions or a restored backup may differ). */
export const sanitizePrefs = (raw: Partial<AppPrefs>): AppPrefs => {
  const d = DEFAULT_PREFS;
  return {
    swipeTabs: bool(raw.swipeTabs, d.swipeTabs),
    keepScreenOn: bool(raw.keepScreenOn, d.keepScreenOn),
    startCountdown: bool(raw.startCountdown, d.startCountdown),
    voiceMode: pick(raw.voiceMode, ['distance', 'time'] as const, d.voiceMode),
    voiceDistance: num(raw.voiceDistance, 0.25, 10, d.voiceDistance),
    voiceMinutes: num(raw.voiceMinutes, 1, 30, d.voiceMinutes),
    voiceSayDistance: bool(raw.voiceSayDistance, d.voiceSayDistance),
    voiceSayTime: bool(raw.voiceSayTime, d.voiceSayTime),
    voiceSayPace: bool(raw.voiceSayPace, d.voiceSayPace),
    weekStart: pick(raw.weekStart, ['mon', 'sun'] as const, d.weekStart),
    defaultTab: pick(raw.defaultTab, ['today', 'exercise'] as const, d.defaultTab),
    defaultSport: typeof raw.defaultSport === 'string' && raw.defaultSport ? (raw.defaultSport as AppPrefs['defaultSport']) : d.defaultSport,
    gpsSaver: bool(raw.gpsSaver, d.gpsSaver),
    hapticsGoals: bool(raw.hapticsGoals, d.hapticsGoals),
    hapticsSteps: bool(raw.hapticsSteps, d.hapticsSteps),
    hapticsAlerts: bool(raw.hapticsAlerts, d.hapticsAlerts),
    beatVolume: num(raw.beatVolume, 20, 100, d.beatVolume),
    beatSound: pick(raw.beatSound, ['click', 'wood', 'beep'] as const, d.beatSound),
    largeText: bool(raw.largeText, d.largeText),
    reduceMotion: bool(raw.reduceMotion, d.reduceMotion),
    glow: pick(raw.glow, ['off', 'tabs', 'always'] as const, d.glow),
    zoneMethod: pick(raw.zoneMethod, ['max', 'reserve'] as const, d.zoneMethod),
    liquidGlass: bool(raw.liquidGlass, d.liquidGlass),
    appLock: bool(raw.appLock, d.appLock),
    hideInRecents: bool(raw.hideInRecents, d.hideInRecents),
    cycleTracking: bool(raw.cycleTracking, d.cycleTracking),
    ftpW: num(raw.ftpW, 0, 600, d.ftpW),
    importHcWorkouts: bool(raw.importHcWorkouts, d.importHcWorkouts),
    logoStyle: pick(raw.logoStyle, ['ring', 'badge', 'mark'] as const, d.logoStyle),
    logoBg: typeof raw.logoBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.logoBg) ? raw.logoBg : d.logoBg,
    logoInk: typeof raw.logoInk === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.logoInk) ? raw.logoInk : d.logoInk,
    uiHaptics: bool(raw.uiHaptics, d.uiHaptics),
    detectWorkouts: bool(raw.detectWorkouts, d.detectWorkouts),
    detectWalks: bool(raw.detectWalks, d.detectWalks),
    wheelMm: num(raw.wheelMm, 1200, 2400, d.wheelMm),
    stepSource: pick(raw.stepSource, STEP_SOURCES, d.stepSource),
    useHealthConnect: bool(raw.useHealthConnect, d.useHealthConnect),
  };
};

export interface PrefsContextValue {
  prefs: AppPrefs;
  setPrefs: (patch: Partial<AppPrefs>) => void;
}

export const PrefsContext = createContext<PrefsContextValue>({ prefs: DEFAULT_PREFS, setPrefs: () => undefined });
export const usePrefs = () => useContext(PrefsContext);

/** Vibrates only when the matching preference is on. */
export const buzz = (enabled: boolean, pattern: number | number[]) => {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // vibration unsupported
  }
};

/** Voice update spacing in kilometres for the native coach. */
export const voiceStepKm = (prefs: AppPrefs, imperial: boolean) => prefs.voiceDistance * (imperial ? 1.609344 : 1);
