import { Capacitor, registerPlugin } from '@capacitor/core';

/** A steady click to pace your steps. Native on Android (keeps going with the screen off); Web Audio in a browser. */
interface MetronomePlugin {
  start(options: { bpm: number; alternate: boolean; volume: number; tone: number }): Promise<void>;
  setBpm(options: { bpm: number }): Promise<void>;
  stop(): Promise<void>;
}

const Native = registerPlugin<MetronomePlugin>('Metronome');
const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export type BeatSound = 'click' | 'wood' | 'beep';
const TONE_INDEX: Record<BeatSound, number> = { click: 0, wood: 1, beep: 2 };
const TONE_FREQ: Record<BeatSound, [number, number, number]> = { click: [1100, 780, 0.04], wood: [820, 610, 0.06], beep: [1500, 1050, 0.07] };

export const MIN_BPM = 120;
export const MAX_BPM = 210;
export const clampBpm = (bpm: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));

// ---- browser fallback: schedule clicks slightly ahead on the audio clock so they stay even ----
let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let beatCount = 0;
let webBpm = 170;
let webAlternate = false;
let webVolume = 0.8;
let webTone: BeatSound = 'click';

const click = (when: number, freq: number, length: number) => {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(Math.max(0.05, webVolume), when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + length + 0.01);
};

const webSchedule = () => {
  if (!ctx) return;
  while (nextTime < ctx.currentTime + 0.25) {
    const [hi, lo, len] = TONE_FREQ[webTone];
    click(nextTime, webAlternate && beatCount % 2 === 1 ? lo : hi, len);
    beatCount++;
    nextTime += 60 / webBpm;
  }
};

export const startBeat = async (bpm: number, alternate = false, volume = 0.8, sound: BeatSound = 'click'): Promise<void> => {
  const b = clampBpm(bpm);
  if (isAndroid()) {
    await Native.start({ bpm: b, alternate, volume, tone: TONE_INDEX[sound] }).catch(() => {});
    return;
  }
  webVolume = volume;
  webTone = sound;
  if (typeof window === 'undefined') return;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  stopBeat();
  ctx = new Ctor();
  void ctx.resume();
  webBpm = b;
  webAlternate = alternate;
  beatCount = 0;
  nextTime = ctx.currentTime + 0.1;
  timer = setInterval(webSchedule, 50);
  webSchedule();
};

export const setBeatBpm = async (bpm: number): Promise<void> => {
  const b = clampBpm(bpm);
  if (isAndroid()) {
    await Native.setBpm({ bpm: b }).catch(() => {});
    return;
  }
  webBpm = b;
};

export const stopBeat = async (): Promise<void> => {
  if (isAndroid()) {
    await Native.stop().catch(() => {});
    return;
  }
  if (timer) clearInterval(timer);
  timer = null;
  if (ctx) void ctx.close().catch(() => {});
  ctx = null;
};
