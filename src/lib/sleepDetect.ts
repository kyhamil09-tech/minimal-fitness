import { Capacitor, registerPlugin } from '@capacitor/core';
import { SleepLogEntry } from '../types/health';

/**
 * Sleep detected by this phone through Google Play services' Sleep API: bedtime and wake time with no Google
 * health app needed. It does not measure sleep stages, so the stage split on these nights is an estimate.
 */
export interface SleepSegment {
  start: number;
  end: number;
  /** 0 = detected normally, 1 = the phone had missing data for the period. */
  status: number;
}

interface SleepDetectPlugin {
  start(): Promise<{ started: boolean }>;
  stop(): Promise<void>;
  read(): Promise<{ segments: SleepSegment[] }>;
  /** The phone's own readings every ten minutes: [time ms, confidence you are asleep, motion, light], each 0 to 100. */
  readClassify(): Promise<{ events: [number, number, number, number][] }>;
}

const Native = registerPlugin<SleepDetectPlugin>('SleepDetect');
const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const ON_KEY = 'kyfit_sleep_detect';

export const sleepDetectEnabled = (): boolean => {
  try {
    return localStorage.getItem(ON_KEY) !== 'false';
  } catch {
    return true;
  }
};
export const setSleepDetectEnabled = (on: boolean) => {
  try {
    localStorage.setItem(ON_KEY, String(on));
  } catch {
    // storage unavailable
  }
};

export const startSleepDetect = async (): Promise<boolean> => {
  if (!isAndroid()) return false;
  try {
    return (await Native.start()).started;
  } catch {
    return false;
  }
};
export const stopSleepDetect = async (): Promise<void> => {
  if (isAndroid()) await Native.stop().catch(() => {});
};
export const readSleepSegments = async (): Promise<SleepSegment[]> => {
  if (!isAndroid()) return [];
  try {
    return (await Native.read()).segments;
  } catch {
    return [];
  }
};

/** The phone's motion and light readings through the night (empty when unavailable). */
export const readClassifyEvents = async (): Promise<[number, number, number, number][]> => {
  if (!isAndroid()) return [];
  try {
    return (await Native.readClassify()).events;
  } catch {
    return [];
  }
};

const MIN_NIGHT_MIN = 90;
const pad = (n: number) => String(n).padStart(2, '0');
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const rating = (min: number) => (min >= 420 ? 4 : min >= 390 ? 4 : min >= 360 ? 3 : min >= 300 ? 2 : 1);

/** Turns detected sleep periods into log entries. Naps and periods with missing data are skipped. */
export const segmentsToLogs = (segments: SleepSegment[]): SleepLogEntry[] => {
  const byDate = new Map<string, SleepLogEntry>();
  for (const s of segments) {
    const minutes = Math.round((s.end - s.start) / 60000);
    if (s.status !== 0 || minutes < MIN_NIGHT_MIN || minutes > 16 * 60) continue;
    const dateIso = dayKey(s.end);
    const deep = Math.round(minutes * 0.2);
    const rem = Math.round(minutes * 0.22);
    const light = minutes - deep - rem;
    const log: SleepLogEntry = {
      id: `sleepapi-${s.start}`,
      dateIso,
      displayDate: new Date(`${dateIso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      bedtime: clock(s.start),
      wakeTime: clock(s.end),
      durationMinutes: minutes,
      qualityRating: rating(minutes),
      notes: 'Detected by your phone. Times only: the stage split is an estimate.',
      isManualEntry: true,
      source: 'sleep-api',
      deepSleepMinutes: deep,
      remSleepMinutes: rem,
      lightSleepMinutes: light,
      awakeMinutes: 0,
      efficiencyScore: 90,
    };
    const prev = byDate.get(dateIso);
    if (!prev || log.durationMinutes > prev.durationMinutes) byDate.set(dateIso, log);
  }
  return [...byDate.values()];
};

const DISMISSED_KEY = 'kyfit_sleep_dismissed';
const dismissed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]') as string[];
  } catch {
    return [];
  }
};
export const isDismissedSleep = (id: string): boolean => dismissed().includes(id);

/** Remember a detected night you deleted so it does not come back on the next sync. */
export const dismissSleepId = (id: string) => {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed(), id].slice(-200)));
  } catch {
    // storage unavailable
  }
};

/** Adds detected nights without touching anything already logged for the same date (a watch or hand entry wins). */
export const mergeDetectedSleep = (existing: SleepLogEntry[], detected: SleepLogEntry[]): SleepLogEntry[] => {
  const taken = new Set(existing.filter((l) => l.source !== 'sleep-api').map((l) => l.dateIso));
  const ids = new Set(existing.map((l) => l.id));
  const gone = new Set(dismissed());
  const add = detected.filter((l) => !taken.has(l.dateIso) && !ids.has(l.id) && !gone.has(l.id));
  if (add.length === 0) return existing;
  return [...existing, ...add].sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0));
};
