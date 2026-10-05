import { Capacitor } from '@capacitor/core';
import { Launch } from './native';

let lock: { release: () => Promise<void> } | null = null;

/** Keeps the screen on (true) or lets it sleep normally again (false). Native on Android, Wake Lock in a browser. */
export const keepScreenOn = async (on: boolean): Promise<void> => {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    await Launch.setKeepScreenOn({ on }).catch(() => {});
    return;
  }
  try {
    if (on) {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
      lock = (await nav.wakeLock?.request('screen')) ?? null;
    } else if (lock) {
      await lock.release();
      lock = null;
    }
  } catch {
    // not available or refused
  }
};