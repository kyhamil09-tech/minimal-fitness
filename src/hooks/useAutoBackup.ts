import { useCallback, useEffect, useRef, useState } from 'react';
import { BackupFolderStatus, FolderBackup, isAndroidApp } from '../lib/native';
import { applyBackup, buildBackup, parseBackup } from '../lib/backup';
import { BackupMeta, backupDue, backupFileName } from '../lib/backupAuto';
import { decryptWithPassphrase, encryptIfEnabled, isEncryptedBackup } from '../lib/cryptoBackup';

const META_KEY = 'kyfit_backup_meta';

const readMeta = (): BackupMeta | null => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || 'null');
  } catch {
    return null;
  }
};

/**
 * Daily automatic backup into a folder the user chose once (it can be a Google Drive folder, so the
 * backup survives an uninstall). Also runs shortly after a new workout is saved.
 */
export function useAutoBackup(workoutCount: number) {
  const [status, setStatus] = useState<BackupFolderStatus | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const busy = useRef(false);

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
      const s = await FolderBackup.write({ name: backupFileName(), data });
      setStatus(s);
      localStorage.setItem(META_KEY, JSON.stringify({ lastAt: Date.now(), workouts: workoutCount } satisfies BackupMeta));
    } catch (err: any) {
      setError(err?.message || 'Backup failed.');
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }, [workoutCount]);

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

  /** Replaces everything in the app with the newest backup in the folder (the app then reloads). */
  const restoreLatest = useCallback(async () => {
    setError('');
    try {
      const { data: file } = await FolderBackup.readLatest();
      const data = isEncryptedBackup(file) ? await decryptWithPassphrase(file, window.prompt('This backup is encrypted. Enter its passphrase:') ?? '') : file;
      const parsed = parseBackup(data);
      applyBackup(parsed, localStorage);
      window.location.reload();
    } catch (err: any) {
      setError(err?.message || 'Could not restore.');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Due check: on launch, when the app comes back to the foreground, and shortly after a workout count change.
  useEffect(() => {
    if (!status?.folder) return;
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
  }, [status?.folder, workoutCount, backupNow]);

  return { status, error, working, chooseFolder, backupNow, stop, restoreLatest, refresh };
}

export type AutoBackup = ReturnType<typeof useAutoBackup>;