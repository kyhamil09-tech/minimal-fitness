import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { WorkoutSession } from '../types/health';

/** Every key this app writes to localStorage starts with one of these. */
export const STORAGE_PREFIXES = ['kyfit_', 'aegis_'];

export interface BackupFile {
  app: 'ky-fitness';
  version: 1;
  exportedAt: string;
  data: Record<string, string>;
  /** Progress photos, added by a manual backup only (they are large, so automatic backups leave them out). */
  photos?: { id: string; date: string; pose: 'front' | 'side' | 'back' | 'other'; note?: string; data: string }[];
}

const POSES = new Set(['front', 'side', 'back', 'other']);

const isAppKey = (k: string) => STORAGE_PREFIXES.some((p) => k.startsWith(p));

export const buildBackup = (storage: Pick<Storage, 'length' | 'key' | 'getItem'>): BackupFile => {
  const data: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && isAppKey(k)) {
      const v = storage.getItem(k);
      if (v !== null) data[k] = v;
    }
  }
  return { app: 'ky-fitness', version: 1, exportedAt: new Date().toISOString(), data };
};

/** Parses and validates a backup. Throws a readable Error on bad input. */
export const parseBackup = (text: string): BackupFile => {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!raw || raw.app !== 'ky-fitness' || typeof raw.data !== 'object' || raw.data === null) {
    throw new Error('That file is not a Minimal Fitness backup.');
  }
  if (raw.version !== 1) throw new Error(`Unsupported backup version: ${String(raw.version)}`);
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.data)) {
    // Only our own keys, and only string values (values are stored as-is, some are plain strings).
    if (!isAppKey(k) || typeof v !== 'string') continue;
    data[k] = v;
  }
  const photos: NonNullable<BackupFile['photos']> = [];
  if (Array.isArray(raw.photos)) {
    for (const p of raw.photos) {
      if (p && typeof p.id === 'string' && typeof p.date === 'string' && POSES.has(p.pose) && typeof p.data === 'string' && p.data.startsWith('data:image/')) {
        photos.push({ id: p.id, date: p.date, pose: p.pose, note: typeof p.note === 'string' ? p.note : undefined, data: p.data });
      }
    }
  }
  return { app: 'ky-fitness', version: 1, exportedAt: String(raw.exportedAt || ''), data, ...(photos.length ? { photos } : {}) };
};

export const applyBackup = (
  backup: BackupFile,
  storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>
): number => {
  clearAppData(storage);
  let n = 0;
  for (const [k, v] of Object.entries(backup.data)) {
    storage.setItem(k, v);
    n++;
  }
  return n;
};

export const clearAppData = (storage: Pick<Storage, 'length' | 'key' | 'removeItem'>) => {
  const toRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && isAppKey(k)) toRemove.push(k);
  }
  toRemove.forEach((k) => storage.removeItem(k));
};

/** Keys and sign-in tokens (kept out of backups and exports). Removed by Erase all data. */
export const clearSecrets = (storage: Pick<Storage, 'length' | 'key' | 'removeItem'>) => {
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith('ky_secret_')) doomed.push(k);
  }
  doomed.forEach((k) => storage.removeItem(k));
};

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const workoutsToCsv = (workouts: WorkoutSession[]): string => {
  const header = [
    'date',
    'type',
    'duration_min',
    'distance_km',
    'avg_hr',
    'calories',
    'rpe',
    'gps_tracked',
    'notes',
  ];
  const rows = workouts.map((w) =>
    [
      w.startedAt ? new Date(w.startedAt).toISOString() : w.timestamp,
      w.type,
      w.durationMinutes,
      w.distanceKm ?? '',
      w.avgHeartRate,
      w.caloriesBurned,
      w.perceivedExertion ?? '',
      w.gpsTracked ? 'yes' : 'no',
      w.notes ?? '',
    ]
      .map(csvCell)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
};

export const downloadTextFile = async (filename: string, text: string, mime = 'application/json') => {
  // Android WebViews can't save blob downloads, so write to cache and open the share sheet instead.
  if (Capacitor.isNativePlatform()) {
    const written = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: filename, url: written.uri, dialogTitle: 'Save or send your export' });
    return;
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
