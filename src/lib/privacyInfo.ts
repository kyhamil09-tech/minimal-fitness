import { registerPlugin } from '@capacitor/core';
import { isAndroidApp } from './native';

/** Facts from Android itself (see PrivacyPlugin.java). */
export interface AndroidPrivacyInfo {
  permissions: { name: string; granted: boolean }[];
  backupAllowed: boolean;
  cleartextAllowed: boolean;
  debuggable: boolean;
  /** Bytes Android counted this app sending and receiving since the phone started; -1 when not reported. */
  txBytes: number;
  rxBytes: number;
  /** When that count started (the phone's last start). */
  countedSince: number;
  version: string;
  /** Whether Google Play services is on this phone. */
  playServices?: boolean;
}

const Native = registerPlugin<{ info(): Promise<AndroidPrivacyInfo> }>('Privacy');

export const readAndroidPrivacyInfo = async (): Promise<AndroidPrivacyInfo | null> => {
  if (!isAndroidApp()) return null;
  try {
    return await Native.info();
  } catch {
    return null;
  }
};

export const formatBytes = (n: number): string => {
  if (!(n >= 0)) return 'not reported';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const FRIENDLY: Record<string, string> = {
  INTERNET: 'Internet, only for the services listed above',
  ACCESS_NETWORK_STATE: 'See whether you are online',
  ACCESS_FINE_LOCATION: 'Precise location, for GPS workouts',
  ACCESS_COARSE_LOCATION: 'Approximate location, for the weather',
  ACCESS_BACKGROUND_LOCATION: 'Location while the screen is off during a workout',
  ACTIVITY_RECOGNITION: 'Step counter, sleep detection, and noticing when you start a run, ride or walk, all on this phone',
  BLUETOOTH_SCAN: 'Find heart-rate straps and cycling sensors',
  BLUETOOTH_CONNECT: 'Talk to heart-rate straps, cycling power and cadence sensors, and the watch',
  POST_NOTIFICATIONS: 'Show reminders and the workout notification',
  FOREGROUND_SERVICE: 'Keep recording a workout with the screen off',
  FOREGROUND_SERVICE_LOCATION: 'Keep the GPS route recording with the screen off',
  FOREGROUND_SERVICE_HEALTH: 'Keep the heart-rate link running',
  WAKE_LOCK: 'Keep the phone awake during a workout',
  VIBRATE: 'Buzz for goals and intervals',
  CAMERA: 'Scan food barcodes (the picture is never saved or sent)',
  RECORD_AUDIO: "Voice logging with Android's on-device recogniser (never an online one; nothing is recorded or saved)",
  USE_BIOMETRIC: 'Unlock the app with your fingerprint, face or screen lock',
  USE_FINGERPRINT: 'Unlock the app with your fingerprint',
  RECEIVE_BOOT_COMPLETED: 'Restore reminders after a restart',
  SCHEDULE_EXACT_ALARM: 'Fire reminders on time',
  USE_EXACT_ALARM: 'Fire reminders on time',
  REQUEST_IGNORE_BATTERY_OPTIMIZATIONS: 'Ask to stay running during long workouts',
  READ_EXTERNAL_STORAGE: 'Pick a backup file',
  WRITE_EXTERNAL_STORAGE: 'Save a backup file',
};

export interface PermissionGroup {
  label: string;
  granted: boolean;
}

/** Turns Android permission names into plain sentences; all Health Connect permissions become one line. */
export const describePermissions = (perms: { name: string; granted: boolean }[]): PermissionGroup[] => {
  const out: PermissionGroup[] = [];
  const health = perms.filter((p) => p.name.startsWith('android.permission.health.'));
  if (health.length > 0) {
    const have = health.filter((p) => p.granted).length;
    out.push({ label: `Health Connect: ${have} of ${health.length} read and write permissions granted (your data stays in Health Connect on this phone)`, granted: have > 0 });
  }
  for (const p of perms) {
    if (p.name.startsWith('android.permission.health.')) continue;
    const key = p.name.replace(/^.*\./, '');
    if (!p.name.startsWith('android.permission.') && !p.name.startsWith('com.kyfitness')) continue;
    out.push({ label: FRIENDLY[key] ?? key.toLowerCase().replace(/_/g, ' '), granted: p.granted });
  }
  return out;
};

export interface LocalDataSummary {
  totalBytes: number;
  groups: { label: string; bytes: number }[];
}

const GROUPS: { label: string; match: RegExp }[] = [
  { label: 'Workouts and routes', match: /^kyfit_(workouts|live_run|shoes|routines|plans?|active_plan)/ },
  { label: 'Sleep, heart rate and watch readings', match: /^kyfit_(sleep|hc_vitals|own_|auto_steps|watch)/ },
  { label: 'Food, water and fasting', match: /^kyfit_(food|water|fasting|saved_meals|fav_foods|my_foods|recipes|barcode_cache|health_log|body)/ },
];

/** How much this app keeps on the phone, from the saved keys (name to size in characters, about one byte each). */
export const summarizeLocalData = (sizes: Record<string, number>): LocalDataSummary => {
  const groups = GROUPS.map((g) => ({ label: g.label, bytes: 0 }));
  let other = 0;
  let total = 0;
  for (const [key, size] of Object.entries(sizes)) {
    if (!key.startsWith('kyfit_')) continue;
    total += size;
    const i = GROUPS.findIndex((g) => g.match.test(key));
    if (i >= 0) groups[i].bytes += size;
    else other += size;
  }
  return { totalBytes: total, groups: [...groups, { label: 'Settings and everything else', bytes: other }] };
};

/** Reads the size of every saved key the app owns. */
export const readLocalDataSizes = (): Record<string, number> => {
  const out: Record<string, number> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('kyfit_')) out[key] = key.length + (localStorage.getItem(key)?.length ?? 0);
    }
  } catch {
    // storage unavailable
  }
  return out;
};
