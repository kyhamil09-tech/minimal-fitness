import { registerPlugin } from '@capacitor/core';
import { isAndroidApp } from './native';

/**
 * "Looks like you started a run": Google Play services' activity recognition on this phone tells the app when you start running,
 * cycling or (if you allow it) walking, and after a few minutes of it a notification offers to record. It never starts a workout
 * by itself. The same on-device recognition says when you get into a vehicle and out again; those drives are kept so the steps a
 * car shakes into the counter can be taken off the day. See ActivityDetect.java and DriveLog.java.
 */
const Native = registerPlugin<{
  configure(o: { enabled: boolean; walks: boolean }): Promise<void>;
  status(): Promise<{ enabled: boolean; lastNotifyMs: number }>;
  configureDrive(o: { on: boolean }): Promise<void>;
  drives(): Promise<{ drives: number[][]; on: boolean; open: number }>;
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

/** Switches the phone's noticing of drives on or off to match the setting. */
export const syncDriveDetect = async (on: boolean): Promise<void> => {
  if (!isAndroidApp()) return;
  try {
    await Native.configureDrive({ on });
  } catch {
    // Play services or the permission is missing: drives can still be taken out by hand
  }
};

/** Drives the phone noticed, as [start, end] in epoch ms, oldest first. `open` is when one still going began (0 when none is). */
export const readDrives = async (): Promise<{ drives: [number, number][]; open: number } | null> => {
  if (!isAndroidApp()) return null;
  try {
    const r = await Native.drives();
    return { drives: (r.drives ?? []).map((d) => [d[0], d[1]] as [number, number]), open: r.open ?? 0 };
  } catch {
    return null;
  }
};
