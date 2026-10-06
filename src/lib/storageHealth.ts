/**
 * How full the app's browser storage is. Browsers allow about 5 million characters per site; going over makes saves fail. The app
 * keeps going from memory when that happens, so without a warning the loss would be silent until the app was closed.
 */
export const APPROX_LIMIT_CHARS = 5_000_000;
export const WARN_AT = 0.8;
export const FULL_AT = 0.95;

const PREFIXES = ['kyfit_', 'aegis_'];
const isAppKey = (k: string) => PREFIXES.some((p) => k.startsWith(p));

export const STORAGE_FULL_EVENT = 'kyfit-storage-full';

let writeFailed = false;

/** Called when a save was refused by the browser. */
export const noteWriteFailed = (key: string) => {
  writeFailed = true;
  try {
    window.dispatchEvent(new CustomEvent(STORAGE_FULL_EVENT, { detail: key }));
  } catch {
    // not in a browser
  }
};

export const hasWriteFailed = () => writeFailed;
export const clearWriteFailed = () => {
  writeFailed = false;
};

type Reader = Pick<Storage, 'length' | 'key' | 'getItem'>;

/** Characters used by the app's own entries (key and value). */
export const usedChars = (storage: Reader): number => {
  let total = 0;
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (!k || !isAppKey(k)) continue;
    total += k.length + (storage.getItem(k)?.length ?? 0);
  }
  return total;
};

/** The entries taking the most room, biggest first, with the `kyfit_` prefix removed. */
export const biggestEntries = (storage: Reader, count = 3): { key: string; chars: number }[] => {
  const rows: { key: string; chars: number }[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (!k || !isAppKey(k)) continue;
    rows.push({ key: k.replace(/^(kyfit_|aegis_)/, ''), chars: k.length + (storage.getItem(k)?.length ?? 0) });
  }
  return rows.sort((a, b) => b.chars - a.chars).slice(0, count);
};

export type StorageLevel = 'ok' | 'warn' | 'full';

export const storageLevel = (fraction: number, failed: boolean): StorageLevel =>
  failed || fraction >= FULL_AT ? 'full' : fraction >= WARN_AT ? 'warn' : 'ok';

export interface StorageUsage {
  used: number;
  limit: number;
  fraction: number;
  level: StorageLevel;
}

export const storageUsage = (storage: Reader, failed = writeFailed): StorageUsage => {
  const used = usedChars(storage);
  const fraction = used / APPROX_LIMIT_CHARS;
  return { used, limit: APPROX_LIMIT_CHARS, fraction, level: storageLevel(fraction, failed) };
};

/** "3.2 MB" from a character count. */
export const megabytes = (chars: number): string => `${(chars / 1_000_000).toFixed(1)} MB`;
