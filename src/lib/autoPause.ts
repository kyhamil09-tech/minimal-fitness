import { haversineKm } from './geo';

/**
 * Decides when a workout should pause itself because you have stopped, and resume when you move again. The Android app does this natively
 * (AutoPauseDetector.java, because the web view is asleep whenever the screen is off); this copy is for a browser, where the page is
 * the only thing running, and has the same rules so the two behave alike. Keep them in step.
 *
 * Stopped means slower than 0.7 m/s for 6 seconds in a row; moving again means faster than the resume speed for 2 seconds in a row.
 * A walker resumes at a gentler speed than a runner, or a slow walk would never un-pause. With no speed from the receiver, speed is
 * worked out from how far the position moved over the last few seconds, and anything inside the accuracy circle is standing still.
 * A manual pause or resume always wins: while paused by hand it does nothing, and after resuming by hand it starts over.
 */
export const AUTO_PAUSE = {
  stillMs: 6000,
  movingMs: 2000,
  /** No pausing while the first position settles. */
  warmupMs: 10_000,
  pauseBelow: 0.7,
  resumeAboveRun: 1.4,
  resumeAboveWalk: 1.0,
} as const;

const TRAIL_MS = 6000;
const MIN_TRAIL_MS = 3000;

export type AutoPauseAction = 'pause' | 'resume' | null;

/** The sports where people move slowly enough that the resume speed has to be lower. */
export const isWalkLike = (sport?: string): boolean => sport === 'Walking' || sport === 'Hiking';

export class AutoPauseDetector {
  private autoPaused = false;
  private manualPaused = false;
  private stillSince = -1;
  private movingSince = -1;
  private trail: { ts: number; p: [number, number] }[] = [];
  private readonly resumeAbove: number;

  constructor(private readonly opts: { enabled: boolean; walkLike: boolean; beganAt: number }) {
    this.resumeAbove = opts.walkLike ? AUTO_PAUSE.resumeAboveWalk : AUTO_PAUSE.resumeAboveRun;
  }

  get isAutoPaused(): boolean {
    return this.autoPaused;
  }

  /** You paused or resumed by hand: stand down, and start over from here. */
  setManualPaused(paused: boolean) {
    this.manualPaused = paused;
    this.autoPaused = false;
    this.stillSince = -1;
    this.movingSince = -1;
  }

  /** A position reading; `speed` is the receiver's own speed in m/s, or null when it has none. */
  onFix(ts: number, lat: number, lng: number, accuracy: number | null, speed: number | null): AutoPauseAction {
    const last = this.trail[this.trail.length - 1];
    if (last && ts <= last.ts) return null;
    this.trail.push({ ts, p: [lat, lng] });
    while (this.trail.length > 1 && ts - this.trail[0].ts > TRAIL_MS) this.trail.shift();
    return this.onSpeed(ts, speed ?? this.displacementSpeed(accuracy));
  }

  /** A speed reading in m/s (null when unknown, which changes nothing). */
  onSpeed(ts: number, speed: number | null): AutoPauseAction {
    if (!this.opts.enabled || this.manualPaused || speed === null || !Number.isFinite(speed) || ts - this.opts.beganAt < AUTO_PAUSE.warmupMs) return null;
    if (!this.autoPaused) {
      this.movingSince = -1;
      if (speed < AUTO_PAUSE.pauseBelow) {
        if (this.stillSince < 0) this.stillSince = ts;
        if (ts - this.stillSince >= AUTO_PAUSE.stillMs) {
          this.autoPaused = true;
          this.stillSince = -1;
          return 'pause';
        }
      } else {
        this.stillSince = -1;
      }
    } else {
      this.stillSince = -1;
      if (speed >= this.resumeAbove) {
        if (this.movingSince < 0) this.movingSince = ts;
        if (ts - this.movingSince >= AUTO_PAUSE.movingMs) {
          this.autoPaused = false;
          this.movingSince = -1;
          return 'resume';
        }
      } else {
        this.movingSince = -1;
      }
    }
    return null;
  }

  private displacementSpeed(accuracy: number | null): number | null {
    const a = this.trail[0];
    const b = this.trail[this.trail.length - 1];
    if (!a || !b) return null;
    const span = b.ts - a.ts;
    if (span < MIN_TRAIL_MS) return null;
    const d = haversineKm(a.p, b.p) * 1000;
    if (d <= Math.max(3, accuracy ?? 0)) return 0;
    return d / (span / 1000);
  }
}
