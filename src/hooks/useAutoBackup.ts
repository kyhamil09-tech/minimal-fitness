import { useCallback, useEffect, useRef, useState } from 'react';
import { BackupFolderStatus, FolderBackup, isAndroidApp } from '../lib/native';
import { applyBackup, buildBackup, parseBackup } from '../lib/backup';
import { BackupMeta, backupDue, backupFileName } from '../lib/backupAuto';
import { autoEncryptionOn, decryptWithPassphrase, encryptIfEnabled, isEncryptedBackup } from '../lib/cryptoBackup';
import { connectDrive, disconnectDrive, downloadLatestFromDrive, driveBackupOn, driveLastBackupAt, driveStatus, needsReconnect, uploadToDrive } from '../lib/driveBackup';

const META_KEY = 'kyfit_backup_meta';

const readMeta = (): BackupMeta | null => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || 'null');
  } catch {
    return null;
  }
};

/**
 * Daily automatic backup into a folder the user chose once and/or into the hidden app folder of their own Google Drive (Google only; the
 * Drive copy is always encrypted first, so it needs the backup passphrase). Also runs shortly after a new workout is saved. It runs while
 * the app is open: at launch, when the app comes back to the front, and shortly after the workout count changes.
 */
export function useAutoBackup(workoutCount: number) {
  const [status, setStatus] = useState<BackupFolderStatus | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const [drive, setDrive] = useState({ on: driveBackupOn(), available: true, connected: false, lastAt: driveLastBackupAt(), error: '' });

  const refreshDrive = useCallback(async () => {
    if (!isAndroidApp()) return;
    const s = await driveStatus();
    setDrive((d) => ({ ...d, on: driveBackupOn(), available: s.available, connected: s.connected, lastAt: driveLastBackupAt() }));
  }, []);

  const refresh = useCallback(async () => {
    if (!isAndroidApp()) return;
    try {
      setStatus(await FolderBackup.getStatus());
    } catch {
      // plugin unavailable
    }
  }, []);

  const backupNow = useCallback(async () => {
    if (!isAndroidApp() || busy.current) return;
    busy.current = true;
    setWorking(true);
    setError('');
    try {
      const data = await encryptIfEnabled(JSON.stringify(buildBackup(localStorage)));
      let saved = false;
      if (status?.folder) {
        try {
          setStatus(await FolderBackup.write({ name: backupFileName(), data }));
          saved = true;
        } catch (err: any) {
          setError(err?.message || 'Backup failed.');
        }
      }
      // Drive gets only an encrypted copy: if encryption has been turned off since, nothing readable is ever sent to Google.
      if (driveBackupOn()) {
        if (!autoEncryptionOn()) {
          setDrive((d) => ({ ...d, error: 'Drive backup is paused: turn backup encryption on again so only you can read what Google stores.' }));
        } else {
          try {
            await uploadToDrive(backupFileName(), data);
            saved = true;
            setDrive((d) => ({ ...d, lastAt: driveLastBackupAt(), error: '' }));
          } catch (err: any) {
            setDrive((d) => ({ ...d, error: needsReconnect(err) ? 'Google needs your permission again. Tap Connect Google Drive.' : err?.message || 'Google Drive backup failed.' }));
          }
        }
      }
      if (saved) localStorage.setItem(META_KEY, JSON.stringify({ lastAt: Date.now(), workouts: workoutCount } satisfies BackupMeta));
    } catch (err: any) {
      setError(err?.message || 'Backup failed.');
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }, [workoutCount, status?.folder]);

  const chooseFolder = useCallback(async () => {
    setError('');
    try {
      setStatus(await FolderBackup.chooseFolder());
    } catch (err: any) {
      if (!/no folder/i.test(err?.message || '')) setError(err?.message || 'Could not set the folder.');
      return;
    }
    await backupNow();
  }, [backupNow]);

  const stop = useCallback(async () => {
    setStatus(await FolderBackup.clearFolder());
    try {
      localStorage.removeItem(META_KEY);
    } catch {
      // ignore
    }
  }, []);

  /** Puts a backup's text (encrypted or not) back into the app, then reloads. */
  const restoreFromText = async (file: string) => {
    const data = isEncryptedBackup(file) ? await decryptWithPassphrase(file, window.prompt('This backup is encrypted. Enter its passphrase:') ?? '') : file;
    applyBackup(parseBackup(data), localStorage);
    window.location.reload();
  };

  /** Replaces everything in the app with the newest backup in the folder (the app then reloads). */
  const restoreLatest = useCallback(async () => {
    setError('');
    try {
      const { data: file } = await FolderBackup.readLatest();
      await restoreFromText(file);
    } catch (err: any) {
      setError(err?.message || 'Could not restore.');
    }
  }, []);

  /** Turns on Google Drive backup: asks Google for the one permission, then saves a first backup. Needs backup encryption to be on. */
  const connectGoogleDrive = useCallback(async () => {
    setDrive((d) => ({ ...d, error: '' }));
    if (!autoEncryptionOn()) {
      setDrive((d) => ({ ...d, error: 'Set a backup passphrase first. It encrypts the backup on your phone, so Google stores a file it cannot read.' }));
      return;
    }
    try {
      await connectDrive();
      await refreshDrive();
      await backupNow();
    } catch (err: any) {
      setDrive((d) => ({ ...d, error: err?.message || 'Could not connect Google Drive.' }));
    }
  }, [backupNow, refreshDrive]);

  const disconnectGoogleDrive = useCallback(() => {
    disconnectDrive();
    setDrive((d) => ({ ...d, on: false, error: '' }));
  }, []);

  /** Replaces everything in the app with the newest backup in Google Drive (the app then reloads). */
  const restoreFromGoogleDrive = useCallback(async () => {
    setDrive((d) => ({ ...d, error: '' }));
    try {
      await restoreFromText(await downloadLatestFromDrive());
    } catch (err: any) {
      setDrive((d) => ({ ...d, error: needsReconnect(err) ? 'Google needs your permission again. Tap Connect Google Drive.' : err?.message || 'Could not restore from Google Drive.' }));
    }
  }, []);

  useEffect(() => {
    refresh();
    void refreshDrive();
  }, [refresh, refreshDrive]);

  // Due check: on launch, when the app comes back to the foreground, and shortly after a workout count change.
  useEffect(() => {
    if (!status?.folder && !drive.on) return;
    const check = () => {
      if (backupDue(readMeta(), workoutCount, Date.now())) void backupNow();
    };
    const first = setTimeout(check, 4000);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status?.folder, drive.on, workoutCount, backupNow]);

  return { status, error, working, chooseFolder, backupNow, stop, restoreLatest, refresh, drive, connectGoogleDrive, disconnectGoogleDrive, restoreFromGoogleDrive };
}

export type AutoBackup = ReturnType<typeof useAutoBackup>;