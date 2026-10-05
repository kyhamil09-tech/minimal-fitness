import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Fix } from './geo';

/** Native recorder (see GpsTrackerPlugin.java): keeps sampling while the phone's screen is off. */
interface GpsTrackerPlugin {
  start(options: {
    gps: boolean;
    cues?: boolean;
    unit?: 'km' | 'mi';
    cueHr?: boolean;
    everyKm?: number;
    everyMin?: number;
    sayDistance?: boolean;
    sayTime?: boolean;
    sayPace?: boolean;
    saver?: boolean;
  }): Promise<void>;
  setPaused(options: { paused: boolean }): Promise<void>;
  speak(options: { text: string }): Promise<void>;
  getSamples(options: { fixFrom: number; hrFrom: number }): Promise<{
    /** [epoch ms, lat, lng, altitude | null, accuracy | null] */
    fixes: (number | null)[][];
    fixTotal: number;
    /** [epoch ms, bpm] */
    hr: number[][];
    hrTotal: number;
    /** True once any altitude in this workout came from the phone's barometer. */
    baro?: boolean;
  }>;
  stop(): Promise<void>;
}

const Tracker = registerPlugin<GpsTrackerPlugin>('GpsTracker');

export const hasNativeTracker = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const requestLocationPermission = async (): Promise<boolean> => {
  try {
    const status = await Geolocation.requestPermissions();
    return status.location === 'granted' || status.coarseLocation === 'granted';
  } catch {
    return false;
  }
};

export interface SampleCursor {
  fix: number;
  hr: number;
}

export interface SessionOptions {
  /** Speak lap time, pace and heart rate every kilometre or mile (needs GPS). */
  cues?: boolean;
  unit?: 'km' | 'mi';
  cueHr?: boolean;
  /** Distance between spoken updates in kilometres (ignored when everyMin is set). */
  everyKm?: number;
  /** Minutes between spoken updates instead of a distance. */
  everyMin?: number;
  sayDistance?: boolean;
  sayTime?: boolean;
  sayPace?: boolean;
  /** Record the GPS track every 5 seconds instead of every second. */
  saver?: boolean;
}

export const startNativeSession = (gps: boolean, options: SessionOptions = {}) => Tracker.start({ gps, ...options });

export const setNativePaused = (paused: boolean) => Tracker.setPaused({ paused }).catch(() => {});

export const speakNative = (text: string) => Tracker.speak({ text }).catch(() => {});

export const stopNativeSession = () => Tracker.stop().catch(() => {});

/** Everything recorded since `cursor`, plus the advanced cursor. */
export const readNativeSamples = async (cursor: SampleCursor) => {
  const r = await Tracker.getSamples({ fixFrom: cursor.fix, hrFrom: cursor.hr });
  const fixes: Fix[] = r.fixes.map((row) => ({
    ts: row[0] as number,
    lat: row[1] as number,
    lng: row[2] as number,
    alt: row[3] as number | null,
    acc: row[4] as number | null,
  }));
  const hr: [number, number][] = r.hr.map((row) => [row[0], row[1]]);
  return { fixes, hr, barometer: !!r.baro, cursor: { fix: r.fixTotal, hr: r.hrTotal } };
};
