import { registerPlugin } from '@capacitor/core';
import { isAndroidApp } from './native';

/**
 * "Looks like you started a run": Google Play services' activity recognition on this phone tells the app when you start running,
 * cycling or (if you allow it) walking, and after a few minutes of it a notification offers to record. It never starts a workout
 * by itself. See ActivityDetect.java.
 */
const Native = registerPlugin<{
  configure(o: { enabled: boolean; walks: boolean }): Promise<void>;
  status(): Promise<{ enabled: boolean; lastNotifyMs: number }>;
}>('ActivityDetect');

/** Matches the phone's detection to the settings. Called when the app opens and whenever a setting changes. */
export const syncAutoDetect = async (enabled: boolean, walks: boolean): Promise<void> => {
  if (!isAndroidApp()) return;
  try {
    await Native.configure({ enabled, walks: enabled && walks });
  } catch {
    // Play services or the permission is missing: nothing is suggested
  }
};

export const autoDetectStatus = async (): Promise<{ enabled: boolean; lastNotifyMs: number } | null> => {
  if (!isAndroidApp()) return null;
  try {
    return await Native.status();
  } catch {
    return null;
  }
};
