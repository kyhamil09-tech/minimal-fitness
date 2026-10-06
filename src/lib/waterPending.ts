import { toDateKey } from './dates';

/** Water added from the widget or the watch while the app was closed, ready to go into the log. */
export interface PendingWater {
  date: string;
  ml: number;
}

const MAX_ML = 2000;

/**
 * Checks what the phone's widget and watch handed over ([[epoch ms, ml], ...]) before it is logged: anything malformed, in the
 * future, older than two days, or an implausible amount is dropped. Each entry is filed under the day it was drunk, not the day it
 * was picked up.
 */
export const sanitizePendingWater = (raw: unknown, now: number): PendingWater[] => {
  if (!Array.isArray(raw)) return [];
  const out: PendingWater[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const [at, ml] = row;
    if (typeof at !== 'number' || typeof ml !== 'number' || !Number.isFinite(at) || !Number.isFinite(ml)) continue;
    if (ml <= 0 || ml > MAX_ML) continue;
    if (at > now + 60_000 || now - at > 2 * 86_400_000) continue;
    out.push({ date: toDateKey(at), ml: Math.round(ml) });
  }
  return out;
};

/** What the widget's two buttons add: a small and a large drink, in ml. */
export const waterButtonAmounts = (imperial: boolean): [number, number] => (imperial ? [237, 473] : [250, 500]);
