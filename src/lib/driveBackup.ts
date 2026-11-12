import { Capacitor, registerPlugin } from '@capacitor/core';
import { guardNative } from './netGuard';

/**
 * Backup to the person's own Google Drive, in the app's hidden folder (see GoogleDrivePlugin.java). Google only, and Google's own account
 * permission for one thing: that hidden folder. Every call goes through the same request guard as the rest of the app, so Offline mode
 * blocks it and each call shows in the Privacy screen's request log. The backup arrives here already encrypted.
 */
interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
  size: number;
}

const Native = registerPlugin<{
  status(): Promise<{ available: boolean; connected: boolean }>;
  connect(): Promise<{ connected: boolean }>;
  upload(o: { name: string; data: string }): Promise<{ id?: string }>;
  list(): Promise<{ files: DriveFile[] }>;
  download(o: { id: string }): Promise<{ data: string }>;
  prune(o: { keep: number }): Promise<{ removed: number }>;
}>('GoogleDrive');

const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const API = 'https://www.googleapis.com';

/** Runs one Drive call through the request guard (the plugin adds the "status" the guard looks for). */
const guarded = <T>(path: string, method: string, bytes: number, call: () => Promise<T>): Promise<T & { status: number }> =>
  guardNative(`${API}${path}`, method, bytes, async () => ({ ...(await call()), status: 200 }));

const ON_KEY = 'kyfit_drive_backup';
const LAST_KEY = 'kyfit_drive_backup_last';

/** Whether the person turned Drive backup on. (Google keeps the permission itself; this is only the app's own switch.) */
export const driveBackupOn = (): boolean => {
  try {
    return localStorage.getItem(ON_KEY) === 'on';
  } catch {
    return false;
  }
};

export const setDriveBackupOn = (on: boolean) => {
  try {
    localStorage.setItem(ON_KEY, on ? 'on' : 'off');
  } catch {
    // storage unavailable
  }
};

export const driveLastBackupAt = (): number => {
  try {
    return Number(localStorage.getItem(LAST_KEY)) || 0;
  } catch {
    return 0;
  }
};

const rememberBackup = (at: number) => {
  try {
    localStorage.setItem(LAST_KEY, String(at));
  } catch {
    // storage unavailable
  }
};

/** Whether Google Play services is here and Drive's hidden folder is already allowed. Does not contact Drive. */
export const driveStatus = async (): Promise<{ available: boolean; connected: boolean }> => {
  if (!isAndroid()) return { available: false, connected: false };
  try {
    return await Native.status();
  } catch {
    return { available: false, connected: false };
  }
};

/** Shows Google's own permission screen (when it is needed) and turns Drive backup on. */
export const connectDrive = async (): Promise<void> => {
  if (!isAndroid()) throw new Error('Google Drive backup works in the Android app.');
  await guarded('/drive/v3/files', 'GET', 0, () => Native.connect());
  setDriveBackupOn(true);
};

/** Turns Drive backup off in this app. The files already in Drive stay until they are removed in Google Drive's settings. */
export const disconnectDrive = () => setDriveBackupOn(false);

/** Saves one backup file and removes all but the newest `keep`. */
export const uploadToDrive = async (name: string, data: string, keep = 7): Promise<void> => {
  await guarded('/upload/drive/v3/files', 'POST', data.length, () => Native.upload({ name, data }));
  rememberBackup(Date.now());
  // Housekeeping is best effort: a failure here must not make a saved backup look failed.
  try {
    await guarded('/drive/v3/files', 'DELETE', 0, () => Native.prune({ keep }));
  } catch {
    // older copies stay until the next backup
  }
};

/** The backups in Drive, newest first. */
export const listDriveBackups = async (): Promise<DriveFile[]> => (await guarded('/drive/v3/files', 'GET', 0, () => Native.list())).files;

/** The text of the newest backup in Drive. */
export const downloadLatestFromDrive = async (): Promise<string> => {
  const files = await listDriveBackups();
  if (files.length === 0) throw new Error('There is no backup in your Google Drive yet.');
  return (await guarded('/drive/v3/files', 'GET', 0, () => Native.download({ id: files[0].id }))).data;
};

/** True when a failed Drive call just needs the person to allow Google Drive again. */
export const needsReconnect = (err: unknown): boolean => /connect google drive again|needs_sign_in/i.test(String((err as Error)?.message ?? err ?? ''));
