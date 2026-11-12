import type { FoodRecord } from './foodDb';
import { barcodeCandidates } from './barcode';

/**
 * Packaged foods you have scanned or logged, kept on the phone so the same barcode works with no signal the next time. Nothing is sent
 * anywhere to do this: it only remembers what was already looked up.
 */

const KEY = 'kyfit_barcode_cache';
const MAX = 400;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

type Cache = Record<string, { rec: FoodRecord; at: number }>;

const read = (store: Store): Cache => {
  try {
    const raw = JSON.parse(store.getItem(KEY) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Cache) : {};
  } catch {
    return {};
  }
};

/** The remembered food for a scanned or typed code, or null. */
export const cachedBarcode = (code: string, store: Store = localStorage): FoodRecord | null => {
  const cache = read(store);
  for (const c of barcodeCandidates(code)) {
    const hit = cache[c];
    if (hit?.rec?.name) return hit.rec;
  }
  return null;
};

/** Remembers a food under its barcode (the newest {@link MAX} are kept). */
export const rememberBarcode = (rec: FoodRecord, store: Store = localStorage, now: number = Date.now()): void => {
  if (!rec.barcode) return;
  try {
    const cache = read(store);
    cache[rec.barcode.replace(/\D/g, '')] = { rec, at: now };
    const keys = Object.keys(cache);
    if (keys.length > MAX) {
      keys
        .sort((a, b) => cache[a].at - cache[b].at)
        .slice(0, keys.length - MAX)
        .forEach((k) => delete cache[k]);
    }
    store.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage full: it just will not be remembered
  }
};

export const cachedCount = (store: Store = localStorage): number => Object.keys(read(store)).length;
