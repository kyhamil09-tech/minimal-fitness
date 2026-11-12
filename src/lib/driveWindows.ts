import { toDateKey } from './dates';

/**
 * Turns drives the phone noticed (Android's activity recognition says when you got into a vehicle and when you got out) into the
 * periods whose steps are taken off the day. A car shakes the phone and the wrist, and both count it as walking.
 */
export interface DriveWindow {
  /** The drive's start time, which identifies the drive. */
  key: number;
  date: string;
  fromMs: number;
  toMs: number;
}

/** A drive shorter than this shakes too few steps to matter, and is more likely a mistake in the detection. */
export const MIN_DRIVE_MS = 90_000;

const nextMidnight = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
};

/**
 * The periods to take out for drives not dealt with yet, one per day a drive touches (steps are kept per day). Left out: a drive
 * already dealt with (even if you put its steps back), one too short, one that has not ended, and any stretch you already took out by hand.
 */
export const planDriveWindows = (
  drives: readonly (readonly [number, number])[],
  handled: readonly number[],
  existing: readonly { date: string; fromMs: number; toMs: number }[],
  now = Date.now()
): DriveWindow[] => {
  const done = new Set(handled);
  const out: DriveWindow[] = [];
  for (const [start, end] of drives) {
    if (!(end > start) || end - start < MIN_DRIVE_MS || end > now + 60_000 || done.has(start)) continue;
    let from = start;
    while (from < end) {
      const stop = Math.min(end, nextMidnight(from));
      const date = toDateKey(from);
      const overlaps = existing.some((w) => w.date === date && w.fromMs < stop && w.toMs > from);
      if (stop - from >= 1000 && !overlaps) out.push({ key: start, date, fromMs: from, toMs: stop });
      from = stop;
    }
  }
  return out;
};
