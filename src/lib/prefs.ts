import { DEFAULT_BAR_KG, DEFAULT_BAR_LB, DEFAULT_PLATES_KG, DEFAULT_PLATES_LB, PLATE_CATALOG_KG, PLATE_CATALOG_LB, sanitizePlates } from './gear';
import { createContext, useContext } from 'react';
import { WorkoutType } from '../types/health';
import type { ZoneMethod } from './calc';
import { STEP_SOURCES, type StepSource } from './steps';
import { NO_SHARE, sanitizeShare, type ShareMap } from './hcShare';
import { LANGUAGE_CODES, type Language } from './languages';

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
  /** Ask "are you okay?" when a GPS workout has not moved for a while. */
  safetyCheck: boolean;
  safetyCheckMin: number;
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
  /** Say each interval step out loud (Run, Walk...), whether or not the running updates are on. */
  intervalVoice: boolean;
  /** Seconds before a step ends to say and buzz what is coming next (0 = no warning). */
  intervalWarnSec: number;
  /** Count 3, 2, 1 in the last seconds of a step. */
  intervalCountdown: boolean;
  /** The text-to-speech voice for the cues; empty uses the best one installed. */
  intervalVoiceName: string;
  /** Cadence beat loudness, 20 to 100. */
  beatVolume: number;
  beatSound: 'click' | 'wood' | 'beep';
  /** Bigger text across the app. */
  largeText: boolean;
  /** Turn off slide and fade animations. */
  reduceMotion: boolean;
  /** Heart-rate zones as a share of your max heart rate, or of your heart-rate reserve (uses resting heart rate). */
  zoneMethod: ZoneMethod;
  /** Soft drifting color behind the screens: never, for a few seconds after a tab change, or all the time. */
  glow: 'off' | 'tabs' | 'always';
  /** Frosted, see-through cards and bars (needs the background glow behind them to look its best). */
  liquidGlass: boolean;
  /** Ask for your fingerprint, face or screen lock when the app opens or comes back after a short while away. */
  appLock: boolean;
  /** Blank the app in the recent-apps list and block screenshots. */
  hideInRecents: boolean;
  /** Functional threshold power in watts for power-based load; 0 works it out from your best rides. */
  ftpW: number;
  /** Bring workouts other apps saved to Health Connect (Google Health / Fitbit and others) into the workout list. */
  importHcWorkouts: boolean;
  /** The logo shown in the app: its shape and its two colors (the home-screen icon is chosen separately, from the presets). */
  logoStyle: 'sport' | 'ring' | 'badge' | 'mark';
  logoBg: string;
  logoInk: string;
  /** A light tick when you tap buttons and choices, and a small pulse when something is finished. */
  uiHaptics: boolean;
  /** Offer to record a run or ride when the phone notices you started one (never starts by itself). */
  detectWorkouts: boolean;
  /** The same for walks, which are much more frequent, so it is its own switch. */
  detectWalks: boolean;
  /** Take the steps counted while you are driving off the day, using the phone's own noticing of when you are in a vehicle. */
  autoDriveSteps: boolean;
  /** Wheel rollout in millimetres, for speed from a wheel sensor (2105 is a common road tire). */
  wheelMm: number;
  /** Which source counts your steps: the best of all, only the phone, only the watch, or only Health Connect. */
  stepSource: StepSource;
  /** Which tracker's sleep to show when more than one saved the same night: 'auto' (the best measured) or a tracker's package name. */
  sleepSource: string;
  /** Which tracker may fill in the parts of a night the main one missed: 'auto' (any other), 'none', or a tracker's package name. */
  sleepSecondary: string;
  /** Master switch for Health Connect: when off the app neither reads from it nor writes to it, and never asks for permission. */
  useHealthConnect: boolean;
  /** Also save your workouts, meals, water, weight and sleep to Health Connect. Off by default: the app only receives. */
  writeHealthConnect: boolean;
  /** Which kinds of data may be saved to Health Connect when sending is on (see lib/hcShare.ts). */
  hcShare: ShareMap;
  /** The app's language: 'auto' follows the phone. */
  language: Language;
  /** Friends and challenges (no accounts, share by short codes). Off until switched on. */
  challengesOn: boolean;
  /** The Lift side's look: dark, light, or follow the phone. */
  liftTheme: 'dark' | 'light' | 'auto';
  /** Show an effort (RPE) box on every set in the Lift side. */
  liftRpe: boolean;
  /** The effort (RPE) a set should land at: the weights suggested for the next set aim for it. */
  liftTargetRpe: number;
  /** Rest timer after a set, in seconds (0 = off). */
  liftRest: number;
  /** Open the app on the Lift side. */
  startInLift: boolean;
  /** The barbell and plates you have, per unit (see lib/gear). */
  liftBarKg: number;
  liftBarLb: number;
  liftPlatesKg: number[];
  liftPlatesLb: number[];
  /** What happens when a rest ends: a buzz, a beep, both, or nothing (the notification stays quiet too). */
  liftRestAlert: 'vibrate' | 'sound' | 'both' | 'silent';
  /** Keep the screen on while a workout is open. */
  liftKeepAwake: boolean;
  /** A reminder on the days a routine is scheduled, at this time (HH:MM). */
  liftRemind: boolean;
  liftRemindTime: string;
  /** A kind note each day, and a weekly review notification (see lib/encouragement). */
  coachDaily: boolean;
  coachDailyTime: string;
  coachWeekly: boolean;
  /** 0 = Monday .. 6 = Sunday. */
  coachWeeklyDay: number;
  coachWeeklyTime: string;
  /** Workouts a week the Home ring counts toward. */
  liftWeekGoal: number;
  /** How a one-rep max is estimated from a lighter set when no effort (RPE) was logged. */
  liftFormula: 'epley' | 'brzycki';
}

export const DEFAULT_PREFS: AppPrefs = {
  swipeTabs: true,
  keepScreenOn: true,
  startCountdown: false,
  voiceMode: 'distance',
  voiceDistance: 1,
  voiceMinutes: 5,
  safetyCheck: false,
  safetyCheckMin: 5,
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
  intervalVoice: true,
  intervalWarnSec: 10,
  intervalCountdown: true,
  intervalVoiceName: '',
  beatVolume: 80,
  beatSound: 'click',
  largeText: false,
  reduceMotion: false,
  glow: 'tabs',
  zoneMethod: 'reserve',
  liquidGlass: false,
  appLock: false,
  hideInRecents: false,
  ftpW: 0,
  importHcWorkouts: true,
  logoStyle: 'sport',
  logoBg: '#101112',
  logoInk: '#FF5500',
  uiHaptics: true,
  detectWorkouts: true,
  detectWalks: false,
  autoDriveSteps: true,
  wheelMm: 2105,
  stepSource: 'auto',
  sleepSource: 'auto',
  sleepSecondary: 'auto',
  useHealthConnect: true,
  writeHealthConnect: false,
  hcShare: { ...NO_SHARE },
  language: 'auto',
  challengesOn: false,
  liftTheme: 'dark',
  liftRpe: false,
  liftTargetRpe: 8,
  liftRest: 90,
  startInLift: false,
  liftFormula: 'epley',
  liftBarKg: DEFAULT_BAR_KG,
  liftBarLb: DEFAULT_BAR_LB,
  liftPlatesKg: [...DEFAULT_PLATES_KG],
  liftPlatesLb: [...DEFAULT_PLATES_LB],
  liftRestAlert: 'vibrate',
  liftKeepAwake: false,
  liftRemind: false,
  liftRemindTime: '18:00',
  coachDaily: false,
  coachDailyTime: '08:30',
  coachWeekly: false,
  coachWeeklyDay: 6,
  coachWeeklyTime: '18:00',
  liftWeekGoal: 3,
};

/** The warning times offered for an interval step change, in seconds (0 = off). */
export const WARN_CHOICES = [0, 5, 10, 15, 20, 30] as const;

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
  const oldLogo = raw.logoStyle === 'ring' && String(raw.logoBg).toUpperCase() === '#30633F' && String(raw.logoInk).toUpperCase() === '#FFFFFF';
  return {
    swipeTabs: bool(raw.swipeTabs, d.swipeTabs),
    keepScreenOn: bool(raw.keepScreenOn, d.keepScreenOn),
    startCountdown: bool(raw.startCountdown, d.startCountdown),
    voiceMode: pick(raw.voiceMode, ['distance', 'time'] as const, d.voiceMode),
    voiceDistance: num(raw.voiceDistance, 0.25, 10, d.voiceDistance),
    voiceMinutes: num(raw.voiceMinutes, 1, 30, d.voiceMinutes),
    safetyCheck: bool(raw.safetyCheck, d.safetyCheck),
    safetyCheckMin: num(raw.safetyCheckMin, 2, 30, d.safetyCheckMin),
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
    intervalVoice: bool(raw.intervalVoice, d.intervalVoice),
    intervalWarnSec: (WARN_CHOICES as readonly number[]).includes(raw.intervalWarnSec as number) ? (raw.intervalWarnSec as number) : d.intervalWarnSec,
    intervalCountdown: bool(raw.intervalCountdown, d.intervalCountdown),
    intervalVoiceName: typeof raw.intervalVoiceName === 'string' && raw.intervalVoiceName.length < 120 ? raw.intervalVoiceName : d.intervalVoiceName,
    beatVolume: num(raw.beatVolume, 20, 100, d.beatVolume),
    beatSound: pick(raw.beatSound, ['click', 'wood', 'beep'] as const, d.beatSound),
    largeText: bool(raw.largeText, d.largeText),
    reduceMotion: bool(raw.reduceMotion, d.reduceMotion),
    glow: pick(raw.glow, ['off', 'tabs', 'always'] as const, d.glow),
    zoneMethod: pick(raw.zoneMethod, ['max', 'reserve'] as const, d.zoneMethod),
    liquidGlass: bool(raw.liquidGlass, d.liquidGlass),
    appLock: bool(raw.appLock, d.appLock),
    hideInRecents: bool(raw.hideInRecents, d.hideInRecents),
    ftpW: num(raw.ftpW, 0, 600, d.ftpW),
    importHcWorkouts: bool(raw.importHcWorkouts, d.importHcWorkouts),
    // Anyone still on the first logo (the green ring) gets the new default; a logo someone chose themselves is kept.
    logoStyle: oldLogo ? d.logoStyle : pick(raw.logoStyle, ['sport', 'ring', 'badge', 'mark'] as const, d.logoStyle),
    logoBg: oldLogo ? d.logoBg : typeof raw.logoBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.logoBg) ? raw.logoBg : d.logoBg,
    logoInk: oldLogo ? d.logoInk : typeof raw.logoInk === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.logoInk) ? raw.logoInk : d.logoInk,
    uiHaptics: bool(raw.uiHaptics, d.uiHaptics),
    detectWorkouts: bool(raw.detectWorkouts, d.detectWorkouts),
    detectWalks: bool(raw.detectWalks, d.detectWalks),
    autoDriveSteps: bool(raw.autoDriveSteps, d.autoDriveSteps),
    wheelMm: num(raw.wheelMm, 1200, 2400, d.wheelMm),
    stepSource: pick(raw.stepSource, STEP_SOURCES, d.stepSource),
    sleepSource: typeof raw.sleepSource === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(raw.sleepSource) ? raw.sleepSource : d.sleepSource,
    sleepSecondary: typeof raw.sleepSecondary === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(raw.sleepSecondary) ? raw.sleepSecondary : d.sleepSecondary,
    useHealthConnect: bool(raw.useHealthConnect, d.useHealthConnect),
    writeHealthConnect: bool(raw.writeHealthConnect, d.writeHealthConnect),
    hcShare: sanitizeShare(raw.hcShare, raw.writeHealthConnect === true),
    language: pick(raw.language, LANGUAGE_CODES, d.language),
    challengesOn: bool(raw.challengesOn, d.challengesOn),
    liftTheme: pick(raw.liftTheme, ['dark', 'light', 'auto'] as const, d.liftTheme),
    liftRpe: bool(raw.liftRpe, d.liftRpe),
    liftTargetRpe: [7, 7.5, 8, 8.5, 9].includes(raw.liftTargetRpe as number) ? (raw.liftTargetRpe as number) : d.liftTargetRpe,
    liftRest: [0, 30, 45, 60, 90, 120, 180, 240].includes(raw.liftRest as number) ? (raw.liftRest as number) : d.liftRest,
    startInLift: bool(raw.startInLift, d.startInLift),
    liftFormula: raw.liftFormula === 'brzycki' ? 'brzycki' : 'epley',
    liftBarKg: num(raw.liftBarKg, 0, 60, d.liftBarKg),
    liftBarLb: num(raw.liftBarLb, 0, 135, d.liftBarLb),
    liftPlatesKg: sanitizePlates(raw.liftPlatesKg, PLATE_CATALOG_KG, DEFAULT_PLATES_KG),
    liftPlatesLb: sanitizePlates(raw.liftPlatesLb, PLATE_CATALOG_LB, DEFAULT_PLATES_LB),
    liftRestAlert: pick(raw.liftRestAlert, ['vibrate', 'sound', 'both', 'silent'] as const, d.liftRestAlert),
    liftKeepAwake: bool(raw.liftKeepAwake, d.liftKeepAwake),
    liftRemind: bool(raw.liftRemind, d.liftRemind),
    liftWeekGoal: num(raw.liftWeekGoal, 1, 7, d.liftWeekGoal),
    coachDaily: bool(raw.coachDaily, d.coachDaily),
    coachWeekly: bool(raw.coachWeekly, d.coachWeekly),
    coachWeeklyDay: num(raw.coachWeeklyDay, 0, 6, d.coachWeeklyDay),
    coachDailyTime: typeof raw.coachDailyTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.coachDailyTime) ? raw.coachDailyTime : d.coachDailyTime,
    coachWeeklyTime: typeof raw.coachWeeklyTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.coachWeeklyTime) ? raw.coachWeeklyTime : d.coachWeeklyTime,
    liftRemindTime: typeof raw.liftRemindTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.liftRemindTime) ? raw.liftRemindTime : d.liftRemindTime,
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

/** Voice update spacing in kilometers for the native coach. */
export const voiceStepKm = (prefs: AppPrefs, imperial: boolean) => prefs.voiceDistance * (imperial ? 1.609344 : 1);
