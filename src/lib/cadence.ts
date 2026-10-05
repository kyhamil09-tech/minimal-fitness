import { Capacitor, registerPlugin } from '@capacitor/core';
import { principalAxis, strokeRate } from './strokeRate';

/** Live cadence from the phone's step sensor (Android). Needs the phone on you and the physical-activity permission. */
interface CadencePlugin {
  start(): Promise<{ available: boolean }>;
  read(): Promise<{ spm: number; steps: number }>;
  stop(): Promise<void>;
  /** Rowing: raw phone movement on three axes, 25 readings a second over the last 24 seconds. */
  startStroke(): Promise<{ available: boolean }>;
  readStroke(): Promise<{ x: number[]; y: number[]; z: number[]; fs: number }>;
  stopStroke(): Promise<void>;
}

const Native = registerPlugin<CadencePlugin>('Cadence');
const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const startCadence = async (): Promise<boolean> => {
  if (!isAndroid()) return false;
  try {
    return (await Native.start()).available;
  } catch {
    return false;
  }
};

export const readCadence = async (): Promise<{ spm: number; steps: number }> => {
  if (!isAndroid()) return { spm: 0, steps: 0 };
  try {
    return await Native.read();
  } catch {
    return { spm: 0, steps: 0 };
  }
};

export const stopCadence = async (): Promise<void> => {
  if (isAndroid()) await Native.stop().catch(() => {});
};

/** Average and highest of the readings taken while moving (zeros are ignored). */
export const summarizeCadence = (readings: number[]): { avg: number; max: number } | null => {
  const r = readings.filter((n) => n >= 60 && n <= 260);
  if (r.length < 5) return null;
  return { avg: Math.round(r.reduce((s, n) => s + n, 0) / r.length), max: Math.max(...r) };
};

/** Rowing stroke rate from the phone's movement (Android). Needs the phone on you: a pocket or an armband. */
export const startStrokes = async (): Promise<boolean> => {
  if (!isAndroid()) return false;
  try {
    return (await Native.startStroke()).available;
  } catch {
    return false;
  }
};

/** The current stroke rate in strokes per minute, or 0 while there is no clear rhythm. */
export const readStrokeRate = async (): Promise<number> => {
  if (!isAndroid()) return 0;
  try {
    const w = await Native.readStroke();
    return strokeRate(principalAxis(w.x, w.y, w.z), w.fs)?.spm ?? 0;
  } catch {
    return 0;
  }
};

export const stopStrokes = async (): Promise<void> => {
  if (isAndroid()) await Native.stopStroke().catch(() => {});
};