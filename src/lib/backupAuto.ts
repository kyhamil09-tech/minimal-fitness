/** Backup timing rules, kept separate from the UI so they can be tested. */
export const BACKUP_PREFIX = 'ky-fitness-backup-';

export const backupFileName = (now: Date = new Date()) =>
  `${BACKUP_PREFIX}${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.json`;

export interface BackupMeta {
  lastAt: number;
  /** Workout count at the last backup, so a new workout triggers a fresh one soon after it is saved. */
  workouts: number;
}

const DAY = 24 * 3600 * 1000;

/** A backup is due once a day, or shortly after the workout count changed. */
export const backupDue = (meta: BackupMeta | null, workouts: number, now: number): boolean => {
  if (!meta || meta.lastAt === 0) return true;
  if (now - meta.lastAt >= DAY) return true;
  return workouts !== meta.workouts && now - meta.lastAt >= 60_000;
};