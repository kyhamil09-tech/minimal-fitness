import { zipSync, strToU8 } from 'fflate';
import { BackupFile, parseBackup } from '../src/lib/backup';
import { decryptWithPassphrase, isEncryptedBackup } from '../src/lib/cryptoBackup';
import { FastingSession, SleepLogEntry, WorkoutSession } from '../src/types/health';
import { addDays, toDateKey } from '../src/lib/dates';
import { restingFromBuckets, Buckets } from '../src/lib/ownBuckets';
import { toGpx, trackMovingSeconds } from '../src/lib/workoutStats';

/**
 * Everything the desktop viewer knows, read from a backup file. Nothing here touches the network: the page that uses it has a
 * policy that forbids connections, and the file is read in the browser's memory only.
 */
export interface Model {
  workouts: WorkoutSession[];
  sleep: SleepLogEntry[];
  fasts: FastingSession[];
  /** Per-day numbers the insights engine joins to sleep and training. */
  days: { date: string; restingHr?: number; hrvMs?: number; steps?: number }[];
  today: string;
  firstDay: string;
  exportedAt: string;
}

export const needsPassphrase = (text: string): boolean => isEncryptedBackup(text);

/** Reads a backup file's text, decrypting it first when it is a passphrase-protected one. */
export const readBackupText = async (text: string, passphrase?: string): Promise<BackupFile> => {
  if (isEncryptedBackup(text)) {
    if (!passphrase) throw new Error('This backup is encrypted. Enter its passphrase.');
    return parseBackup(await decryptWithPassphrase(text, passphrase));
  }
  return parseBackup(text);
};

const get = <T>(b: BackupFile, key: string, fallback: T): T => {
  const raw = b.data[`kyfit_${key}`];
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const startMs = (w: WorkoutSession): number | undefined => w.startedAt ?? (Date.parse(w.timestamp) || undefined);

export const buildModel = (b: BackupFile, now: Date = new Date()): Model => {
  const workouts = get<WorkoutSession[]>(b, 'workouts', [])
    .map((w) => ({ ...w, startedAt: startMs(w) }))
    .filter((w) => w.startedAt)
    .sort((a, c) => (a.startedAt as number) - (c.startedAt as number));
  const sleep = get<SleepLogEntry[]>(b, 'sleep_logs', []).sort((a, c) => a.dateIso.localeCompare(c.dateIso));
  const fasts = get<FastingSession[]>(b, 'fasting_sessions', []);
  const steps = get<Record<string, number>>(b, 'steps', {});
  const ownSteps = get<Buckets>(b, 'own_steps', {});
  const ownHr = get<Buckets>(b, 'own_hr', {});

  const keys = new Set<string>([...Object.keys(steps), ...Object.keys(ownSteps), ...Object.keys(ownHr)]);
  const days = [...keys].sort().map((date) => {
    const own = ownSteps[date]?.reduce((s, v) => s + v, 0);
    return { date, steps: Math.max(steps[date] ?? 0, own ?? 0) || undefined, restingHr: restingFromBuckets(ownHr[date]) };
  });

  const stamps = [
    ...workouts.map((w) => w.startedAt as number),
    ...sleep.map((l) => Date.parse(l.dateIso)),
    ...Object.keys(steps).map((k) => Date.parse(k)),
  ].filter((t) => Number.isFinite(t));
  const first = stamps.length ? Math.min(...stamps) : now.getTime();
  return { workouts, sleep, fasts, days, today: toDateKey(now), firstDay: toDateKey(first), exportedAt: b.exportedAt };
};

export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** The mean of each point and the ones before it, over at most {@code n} points. */
export const rollingMean = (pts: [number, number][], n: number): [number, number][] =>
  pts.map(([x], i) => {
    const win = pts.slice(Math.max(0, i - n + 1), i + 1);
    return [x, win.reduce((s, p) => s + p[1], 0) / win.length];
  });

export interface DayTotal {
  km: number;
  min: number;
  load: number;
  count: number;
  names: string[];
}

export const dayTotals = (workouts: WorkoutSession[]): Map<string, DayTotal> => {
  const out = new Map<string, DayTotal>();
  for (const w of workouts) {
    const key = toDateKey(w.startedAt as number);
    const t = out.get(key) ?? { km: 0, min: 0, load: 0, count: 0, names: [] };
    t.km += w.distanceKm ?? 0;
    t.min += w.durationMinutes || 0;
    t.load += w.cardioLoadPoints ?? 0;
    t.count += 1;
    t.names.push(w.type);
    out.set(key, t);
  }
  return out;
};

/** Monday keys of every week in the range, with the sum of {@code pick} over the days of that week. */
export const weeklySums = (totals: Map<string, DayTotal>, from: string, to: string, pick: (t: DayTotal) => number): { week: string; value: number }[] => {
  const d = new Date(from + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  let key = toDateKey(d);
  const out: { week: string; value: number }[] = [];
  while (key <= to) {
    let v = 0;
    for (let i = 0; i < 7; i++) {
      const t = totals.get(addDays(key, i));
      if (t) v += pick(t);
    }
    out.push({ week: key, value: v });
    key = addDays(key, 7);
  }
  return out;
};

export const movingSec = (w: WorkoutSession): number => {
  const total = w.durationSec ?? w.durationMinutes * 60;
  if (w.track && w.track.length > 2) {
    const m = trackMovingSeconds(w.track);
    if (m > 60 && m <= total * 1.05) return m;
  }
  return total;
};

/** Seconds per km over the moving time, or null when there is no distance. */
export const paceSecPerKm = (w: WorkoutSession): number | null => (w.distanceKm && w.distanceKm > 0.05 ? movingSec(w) / w.distanceKm : null);

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header: string[], rows: unknown[][]) => [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');

export const sleepToCsv = (logs: SleepLogEntry[]): string =>
  csv(
    ['date', 'bedtime', 'wake', 'duration_min', 'deep_min', 'rem_min', 'light_min', 'awake_min', 'efficiency', 'hrv_ms', 'resting_hr_min', 'source'],
    logs.map((l) => [l.dateIso, l.bedtime, l.wakeTime, l.durationMinutes, l.deepSleepMinutes, l.remSleepMinutes, l.lightSleepMinutes, l.awakeMinutes, l.efficiencyScore, l.detail?.hrvMs ?? '', l.detail?.hrMin ?? '', l.source ?? 'manual'])
  );

export const dailyToCsv = (m: Model): string => {
  const totals = dayTotals(m.workouts);
  const sleepBy = new Map(m.sleep.map((l) => [l.dateIso, l]));
  const dayBy = new Map(m.days.map((d) => [d.date, d]));
  const keys = [...new Set([...totals.keys(), ...sleepBy.keys(), ...dayBy.keys()])].sort();
  return csv(
    ['date', 'workouts', 'distance_km', 'active_min', 'load', 'steps', 'resting_hr', 'sleep_min', 'hrv_ms'],
    keys.map((k) => {
      const t = totals.get(k);
      const d = dayBy.get(k);
      const s = sleepBy.get(k);
      return [k, t?.count ?? 0, t ? Math.round(t.km * 100) / 100 : '', t?.min ?? '', t?.load ?? '', d?.steps ?? '', d?.restingHr ?? '', s?.durationMinutes ?? '', s?.detail?.hrvMs ?? ''];
    })
  );
};

const stamp = (w: WorkoutSession) => toDateKey(w.startedAt as number);

/** One GPX file per workout that has a route, zipped. Returns null when none have one. */
export const gpxZip = (workouts: WorkoutSession[]): Uint8Array | null => {
  const files: Record<string, Uint8Array> = {};
  for (const w of workouts) {
    if (!(w.track && w.track.length > 1) && !(w.route && w.route.length > 1)) continue;
    files[`${stamp(w)}-${w.type}-${w.id.replace(/[^\w-]/g, '')}.gpx`] = strToU8(toGpx(w));
  }
  return Object.keys(files).length ? zipSync(files) : null;
};
