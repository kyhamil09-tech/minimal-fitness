import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';

import { noteWriteFailed } from '../lib/storageHealth';

export const KEY_PREFIX = 'kyfit_';

/** Turns a value into what is stored, and back. Used where part of a value is squeezed before it is written (see lib/storageCodec). */
export interface StorageCodec<T> {
  encode: (value: T) => unknown;
  decode: (raw: unknown) => T;
}

export function readStored<T>(key: string, fallback: T, codec?: StorageCodec<T>): T {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return codec ? codec.decode(parsed) : (parsed as T);
  } catch {
    return fallback;
  }
}

const writeStored = <T,>(key: string, value: T, codec?: StorageCodec<T>) => {
  try {
    localStorage.setItem(KEY_PREFIX + key, JSON.stringify(codec ? codec.encode(value) : value));
  } catch {
    // Storage full or unavailable (private mode): keep working in memory, and say so, so the person can back up before it is lost.
    noteWriteFailed(key);
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
  initial: T | (() => T),
  codec?: StorageCodec<T>
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValueState] = useState<T>(() => {
    const fallback = typeof initial === 'function' ? (initial as () => T)() : initial;
    return readStored<T>(key, fallback, codec);
  });

  // The newest value, including changes made earlier in the same event that have not rendered yet.
  const latest = useRef(value);
  latest.current = value;

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      const next = typeof action === 'function' ? (action as (prev: T) => T)(latest.current) : action;
      latest.current = next;
      writeStored(key, next, codec);
      setValueState(next);
    },
    // The codec is a constant defined outside the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  // Safety net: also covers a changed `key`.
  useEffect(() => {
    writeStored(key, value, codec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  return [value, setValue];
}
