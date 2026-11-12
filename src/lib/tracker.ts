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
    /** Speak interval cues (Run, Walk, the warning and the countdown) even when the running updates are off. */
    intervalCues?: boolean;
    /** The voice chosen in Settings (empty for the best one installed). */
    voice?: string;
    /** The activity, so a walker resumes at a gentler speed than a runner. */
    sport?: string;
    /** Pause the workout by itself when you stop (decided natively, so it works with the screen off). */
    autoPause?: boolean;
  }): Promise<void>;
  setPaused(options: { paused: boolean }): Promise<void>;
  speak(options: { text: string; cue?: boolean; flush?: boolean }): Promise<void>;
  vibrate(options: { pattern: number[] }): Promise<void>;
  listVoices(): Promise<{ voices: { name: string; quality: number; online: boolean; locale: string }[]; auto: string }>;
  previewVoice(options: { name: string; text?: string }): Promise<void>;
  openVoiceSettings(): Promise<void>;
  getSamples(options: { fixFrom: number; hrFrom: number; pauseFrom?: number }): Promise<{
    /** [epoch ms, lat, lng, altitude | null, accuracy | null] */
    fixes: (number | null)[][];
    fixTotal: number;
    /** [epoch ms, bpm] */
    hr: number[][];
    hrTotal: number;
    /** True once any altitude in this workout came from the phone's barometer. */
    baro?: boolean;
    /** When the workout paused itself and carried on: [epoch ms, 1 paused | 0 resumed] */
    pauses?: number[][];
    pauseTotal?: number;
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
  /** How many automatic pause changes have been read (0 when none have). */
  pause?: number;
}

export interface SessionOptions {
  /** Speak lap time, pace and heart rate every kilometer or mile (needs GPS). */
  cues?: boolean;
  unit?: 'km' | 'mi';
  cueHr?: boolean;
  /** Distance between spoken updates in kilometers (ignored when everyMin is set). */
  everyKm?: number;
  /** Minutes between spoken updates instead of a distance. */
  everyMin?: number;
  sayDistance?: boolean;
  sayTime?: boolean;
  sayPace?: boolean;
  /** Record the GPS track every 5 seconds instead of every second. */
  saver?: boolean;
  /** Speak interval cues even when the running updates are off. */
  intervalCues?: boolean;
  /** The voice chosen in Settings (empty for the best one installed). */
  voice?: string;
  /** The activity ("Walking", "Running"...), so the track can tell a real move from a GPS glitch for that sport. */
  sport?: string;
  /** Pause the workout by itself when you stop moving, and carry on when you move again. */
  autoPause?: boolean;
}

export const startNativeSession = (gps: boolean, options: SessionOptions = {}) => Tracker.start({ gps, ...options });

export const setNativePaused = (paused: boolean) => Tracker.setPaused({ paused }).catch(() => {});

export const speakNative = (text: string) => Tracker.speak({ text }).catch(() => {});

/** Speaks an interval cue (Run, Walk, the warning, 3-2-1). With `flush` it cuts off what is still being said, for a countdown number. */
export const speakCue = (text: string, flush = false) => Tracker.speak({ text, cue: true, flush }).catch(() => {});

/** Vibrates the phone, also with the screen off. In a browser it falls back to the page's own vibration. */
export const vibrateNative = (pattern: number[]) => {
  if (hasNativeTracker()) return Tracker.vibrate({ pattern }).catch(() => {});
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // vibration unsupported
  }
  return Promise.resolve();
};

export interface VoiceChoice {
  name: string;
  quality: number;
  online: boolean;
  locale: string;
}

/** The text-to-speech voices installed for your language, best first, and the one used when none is chosen. */
export const listVoices = async (): Promise<{ voices: VoiceChoice[]; auto: string }> => {
  try {
    return await Tracker.listVoices();
  } catch {
    return { voices: [], auto: '' };
  }
};

export const previewVoice = (name: string, text?: string) => Tracker.previewVoice({ name, text }).catch(() => {});

export const openVoiceSettings = () => Tracker.openVoiceSettings().catch(() => {});

export const stopNativeSession = () => Tracker.stop().catch(() => {});

/** Everything recorded since `cursor`, plus the advanced cursor. */
export const readNativeSamples = async (cursor: SampleCursor) => {
  const r = await Tracker.getSamples({ fixFrom: cursor.fix, hrFrom: cursor.hr, pauseFrom: cursor.pause ?? 0 });
  const fixes: Fix[] = r.fixes.map((row) => ({
    ts: row[0] as number,
    lat: row[1] as number,
    lng: row[2] as number,
    alt: row[3] as number | null,
    acc: row[4] as number | null,
    speed: (row[5] ?? null) as number | null,
    bearing: (row[6] ?? null) as number | null,
  }));
  const hr: [number, number][] = r.hr.map((row) => [row[0], row[1]]);
  /** [time, true when the workout paused itself, false when it carried on], oldest first. */
  const pauses: [number, boolean][] = (r.pauses ?? []).map((row) => [row[0], row[1] === 1]);
  return { fixes, hr, pauses, barometer: !!r.baro, cursor: { fix: r.fixTotal, hr: r.hrTotal, pause: r.pauseTotal ?? cursor.pause ?? 0 } };
};
