import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { WatchStrength } from './watchStrength';

export interface WatchStatus {
  /** Google Play services Wearable API is usable on this phone. */
  available: boolean;
  /** A watch is currently paired and reachable over Bluetooth/Wi-Fi. */
  connected: boolean;
  /** Display name of the connected watch, if any. */
  nodeName: string;
  /** The Minimal Fitness app is installed on that watch. */
  watchAppInstalled: boolean;
}

export interface HeartRateSample {
  bpm: number;
  /** Epoch ms on the phone when the sample arrived. */
  ts: number;
}

/** Calories measured by the watch since its exercise started. */
export interface CalorieSample {
  kcal: number;
  ts: number;
}

export type WatchCommandName = 'start' | 'pause' | 'resume' | 'stop' | 'discard' | 'set';

/** A button pressed on the watch's workout screen. */
export interface WatchCommand {
  cmd: WatchCommandName;
  /** Workout type for `start` (e.g. "Running"). */
  type?: string;
  /** For `start` of a Strength session: the routine picked on the watch (see lib/watchStrength). */
  routine?: string;
  /** For `start`: the shoes or bike picked on the watch (an id from lib/watchGear, or "none"). */
  gear?: string;
  /** For `set`: what was pressed on the watch's strength screen. */
  action?: string;
  delta?: number;
  index?: number;
  /** Goal picked on the watch for `start`: kilometres, minutes or kcal. */
  goalType?: 'open' | 'distance' | 'time' | 'calories';
  goalValue?: number;
}

/** What the watch needs to draw the live workout. The watch derives its timer from `startedAt`. */
export interface WatchWorkoutState {
  active: boolean;
  type: string;
  startedAt: number;
  paused: boolean;
  pausedAt: number;
  pausedTotalMs: number;
  /** Preformatted in the user's units, e.g. "3.21 km". Empty when there is no distance. */
  distanceText: string;
  /** Numeric distance so the watch can lap and compare it. */
  distanceKm: number;
  paceText: string;
  /** Phone's estimate; the watch prefers its own measured calories when it has them. */
  kcal: number;
  maxHr: number;
  canPause: boolean;
  /** The user's units, so the watch shows the same miles or kilometres when it records on its own. */
  miles: boolean;
  /** The target this workout was started with (km, minutes or kcal); the watch shows progress toward it. */
  goalType?: 'open' | 'distance' | 'time' | 'calories';
  goalValue?: number;
  /** The current interval step, so the watch can show it and buzz at each change. */
  stepLabel?: string;
  stepKind?: 'warmup' | 'work' | 'recover' | 'cooldown';
  stepIndex?: number;
  stepCount?: number;
  stepDurMs?: number;
  /** Epoch ms when a timed step ends; 0 for distance steps or while paused. */
  stepEndsAt?: number;
  stepFraction?: number;
  stepLeft?: string;
  stepsDone?: boolean;
  /** A short message such as "Speed up" when you drift off a pace or heart-rate target. */
  alertText?: string;
  /** Only on the final inactive message: the workout was thrown away, not saved. */
  discarded?: boolean;
  /** A strength session: the exercise, set, weight and reps on show, so the watch can run the session set by set. */
  strength?: WatchStrength;
}

export interface WatchHeartRatePlugin {
  getStatus(): Promise<WatchStatus>;
  /** Asks the watch app to start measuring (best effort; the watch app can also be started by hand). */
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Pushes the live workout to the watch; `launch` also opens the watch app (use on workout start). */
  sendWorkoutState(options: { json: string; launch: boolean }): Promise<void>;
  addListener(
    eventName: 'heartRate',
    listener: (sample: HeartRateSample) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'calories',
    listener: (sample: CalorieSample) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'watchCommand',
    listener: (command: WatchCommand) => void
  ): Promise<PluginListenerHandle>;
}

/** Native bridge to the Wear OS Data Layer. Only exists inside the Android app. */
export const WatchHeartRate = registerPlugin<WatchHeartRatePlugin>('WatchHeartRate');

export const isWatchSupported = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/** A reading older than this is treated as "no signal". */
export const STALE_AFTER_MS = 12_000;

export const isFresh = (sample: HeartRateSample | null, now: number) =>
  !!sample && sample.bpm > 0 && now - sample.ts <= STALE_AFTER_MS;
