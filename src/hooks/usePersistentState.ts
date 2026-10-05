import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';

export const KEY_PREFIX = 'kyfit_';

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

const writeStored = (key: string, value: unknown) => {
  try {
    localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable (private mode): keep working in memory.
  }
};

/**
 * useState that survives reloads. Values are JSON-serialised into localStorage
 * under a `kyfit_` prefix (which is what Backup & Export collects).
 *
 * A change is written the moment it is made, not after the next screen has drawn, so a crash while drawing
 * (which skips every effect) can never lose a workout or a log entry that was just saved.
 */
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValueState] = useState<T>(() => {
    const fallback = typeof initial === 'function' ? (initial as () => T)() : initial;
    return readStored<T>(key, fallback);
  });

  // The newest value, including changes made earlier in the same event that have not rendered yet.
  const latest = useRef(value);
  latest.current = value;

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      const next = typeof action === 'function' ? (action as (prev: T) => T)(latest.current) : action;
      latest.current = next;
      writeStored(key, next);
      setValueState(next);
    },
    [key]
  );

  // Safety net: also covers a changed `key`.
  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);

  return [value, setValue];
}
