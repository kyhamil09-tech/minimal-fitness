import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { AppLock, isAndroidApp } from '../lib/native';

/** How long you can be away before the app asks again. */
const GRACE_MS = 30_000;

interface Props {
  enabled: boolean;
  hideInRecents: boolean;
}

/**
 * Covers the app until you unlock with the phone's own fingerprint, face or screen lock. It locks when the app opens and when you
 * come back after more than 30 seconds away, but never while a workout is recording, so a run is not interrupted.
 */
export const AppLockGate: React.FC<Props> = ({ enabled, hideInRecents }) => {
  const [locked, setLocked] = useState(enabled && isAndroidApp());
  const [note, setNote] = useState('');
  const hiddenAt = useRef<number | null>(null);
  const asking = useRef(false);

  const unlock = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    setNote('');
    try {
      const r = await AppLock.authenticate({ title: 'Unlock Minimal Fitness' });
      if (r.ok) setLocked(false);
      else setNote('Not unlocked. Tap to try again.');
    } catch {
      setNote('Could not ask for your unlock. Tap to try again.');
    } finally {
      asking.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isAndroidApp()) return;
    void AppLock.setSecure({ on: hideInRecents }).catch(() => undefined);
  }, [hideInRecents]);

  useEffect(() => {
    if (!enabled || !isAndroidApp()) {
      setLocked(false);
      return;
    }
    const onChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      const recording = !!document.querySelector('[aria-label="Workout in progress"]');
      if (away > GRACE_MS && !recording) setLocked(true);
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [enabled]);

  // Ask straight away whenever it becomes locked.
  useEffect(() => {
    if (locked) void unlock();
  }, [locked, unlock]);

  if (!locked) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center gap-4 px-8 text-center" role="dialog" aria-label="App locked">
      <Lock className="w-10 h-10 text-neutral-400" />
      <div className="text-lg font-bold text-white">Minimal Fitness is locked</div>
      <button type="button" onClick={() => void unlock()} className="px-6 py-3 rounded-full text-sm font-extrabold text-black" style={{ backgroundColor: 'var(--accent)' }}>
        Unlock
      </button>
      {note && <p className="text-xs text-neutral-400" role="status">{note}</p>}
    </div>
  );
};
