import { HealthConnect, isAndroidApp } from './native';
import { decimate } from './geo';
import { BodyEntry, FoodEntry, HealthLogEntry, WaterEntry } from '../types/tracking';
import { SleepLogEntry, WorkoutSession } from '../types/health';
import { parseDateKey, todayKey } from './dates';
import { patternById, type BreathSession } from './breathing';
import { NO_SHARE, SHARE_ITEMS, shareGranted, type ShareId, type ShareMap } from './hcShare';

/**
 * Saves what you log in the app into Health Connect so the Google Health / Fitbit apps see it too.
 * Everything here is best effort: with no Health Connect, no write permission, or a browser, it does nothing
 * and never blocks logging. Records carry the app's own ids, so saving the same entry twice updates it.
 */

let canWriteCache: { at: number; missing: string[]; available: boolean } | null = null;

/** The master switch (Settings > Health Connect). When off, nothing is written to or deleted from Health Connect. */
let enabled = true;

/** The tick boxes (Settings > Health Connect > Choose what to send). A kind that is not ticked is never written. */
let share: ShareMap = { ...NO_SHARE };

export const setHealthWriteEnabled = (on: boolean) => {
  if (enabled === on) return;
  enabled = on;
  canWriteCache = null;
};

export const setHealthShare = (next: ShareMap) => {
  share = { ...next };
};

/** True when sending is on, this kind is ticked, and Android has granted the permissions it needs. */
const canWrite = async (kind: ShareId): Promise<boolean> => {
  if (!enabled || !share[kind] || !isAndroidApp()) return false;
  const now = Date.now();
  if (!canWriteCache || now - canWriteCache.at >= 30_000) {
    try {
      const s = await HealthConnect.status();
      canWriteCache = { at: now, available: s.available, missing: s.missing ?? [] };
    } catch {
      canWriteCache = { at: now, available: false, missing: [] };
    }
  }
  const item = SHARE_ITEMS.find((i) => i.id === kind);
  return !!item && canWriteCache.available && shareGranted(item, canWriteCache.missing);
};

/** Sending is on at all, for removing records you delete (those go regardless of the tick boxes, so nothing stays behind). */
const canRemove = (): boolean => enabled && isAndroidApp();

/** Call after the user changes Health Connect permissions so the next write re-checks. */
export const resetHealthWriteCache = () => {
  canWriteCache = null;
};

const quiet = (p: Promise<unknown>) => p.catch(() => undefined);

/** A time on `date` (local), or just before now when that date is today and the time has not come yet. */
const atHour = (date: string, hour: number): number => {
  const d = parseDateKey(date);
  d.setHours(hour, 0, 0, 0);
  const ms = d.getTime();
  return date === todayKey() ? Math.min(ms, Date.now() - 60_000) : ms;
};

/** Saves a workout to Health Connect. Resolves true only when it really was written, so callers can remember that. */
export const writeWorkoutToHc = async (w: WorkoutSession): Promise<boolean> => {
  if (!w.startedAt || !(await canWrite('workouts'))) return false;
  const seconds = w.durationSec ?? w.durationMinutes * 60;
  if (seconds < 30) return false;
  const sendRoute = await canWrite('workoutRoute');
  const sendHeart = await canWrite('workoutHeart');
  const route = (sendRoute ? (w.track ?? []) : []).map((p) => [p.t, p.lat, p.lng, p.alt ?? null] as [number, number, number, number | null]);
  try {
    await HealthConnect.writeWorkout({
      id: w.id,
      type: w.type,
      start: w.startedAt,
      end: w.startedAt + seconds * 1000,
      live: !w.isManualEntry,
      title: w.title ?? w.planDayTitle ?? undefined,
      notes: w.notes ?? undefined,
      distanceKm: w.distanceKm && w.distanceKm > 0 ? w.distanceKm : undefined,
      kcal: w.caloriesBurned > 0 ? w.caloriesBurned : undefined,
      hr: sendHeart && w.hrFromSensor ? w.hrSeries : undefined,
      route: route.length >= 2 ? decimate(route, 2000) : undefined,
    });
    return true;
  } catch {
    // permission revoked or Health Connect busy: the workout stays unsynced and can be sent later
    return false;
  }
};

export const writeBodyToHc = async (b: BodyEntry): Promise<void> => {
  if (!(await canWrite('body'))) return;
  await quiet(HealthConnect.writeBody({ id: b.id, time: atHour(b.date, 8), weightKg: b.weightKg, bodyFatPct: b.bodyFatPct }));
};

const MEAL_HOUR: Record<string, number> = { Breakfast: 8, Lunch: 12, Dinner: 18, Snack: 15 };

export const writeFoodToHc = async (f: FoodEntry): Promise<void> => {
  if (!(await canWrite('food'))) return;
  await quiet(
    HealthConnect.writeNutrition({
      id: f.id,
      start: atHour(f.date, MEAL_HOUR[f.meal] ?? 12),
      meal: f.meal,
      name: f.name,
      calories: f.calories,
      proteinG: f.proteinG,
      carbsG: f.carbsG,
      fatG: f.fatG,
    })
  );
};

export const writeWaterToHc = async (w: WaterEntry): Promise<void> => {
  if (!(await canWrite('water'))) return;
  await quiet(HealthConnect.writeHydration({ id: w.id, start: w.date === todayKey() ? Date.now() - 60_000 : atHour(w.date, 12), ml: w.ml }));
};

/** Saves a finished breathing session to Health Connect as a mindfulness session (it ended at `at`). */
export const writeBreathingToHc = async (s: BreathSession): Promise<void> => {
  if (s.seconds < 30 || !(await canWrite('breathing'))) return;
  await quiet(HealthConnect.writeMindfulness({ id: s.id, start: s.at - s.seconds * 1000, end: s.at, title: `Breathing: ${patternById(s.patternId).name}` }));
};

export const writeSleepToHc = async (s: SleepLogEntry): Promise<void> => {
  // Nights that came from Health Connect are already there.
  if (s.source === 'health-connect' || !(await canWrite('sleep'))) return;
  const [wh, wm] = s.wakeTime.split(':').map(Number);
  const [bh, bm] = s.bedtime.split(':').map(Number);
  const wake = parseDateKey(s.dateIso);
  wake.setHours(wh, wm, 0, 0);
  const bed = new Date(wake.getTime() - s.durationMinutes * 60_000);
  // Trust the clock times when they agree with the duration, otherwise the duration wins.
  const bedFromClock = parseDateKey(s.dateIso);
  bedFromClock.setHours(bh, bm, 0, 0);
  if (bedFromClock.getTime() > wake.getTime()) bedFromClock.setDate(bedFromClock.getDate() - 1);
  const start = Math.abs(bedFromClock.getTime() - bed.getTime()) < 3 * 3_600_000 ? bedFromClock.getTime() : bed.getTime();
  if (wake.getTime() <= start || wake.getTime() > Date.now()) return;
  await quiet(HealthConnect.writeSleep({ id: s.id, start, end: wake.getTime(), notes: s.notes }));
};

export const deleteFromHc = async (
  kind: 'bloodPressure' | 'bloodGlucose' | 'workout' | 'distance' | 'calories' | 'heartRate' | 'weight' | 'bodyFat' | 'nutrition' | 'hydration' | 'sleep' | 'mindfulness',
  ids: string[]
): Promise<void> => {
  if (!canRemove()) return;
  await quiet(HealthConnect.deleteRecords({ kind, ids }));
};

/** Removes a workout and the distance, calorie and heart-rate records saved with it. */
export const deleteWorkoutFromHc = async (id: string): Promise<void> => {
  await deleteFromHc('workout', [id]);
  await deleteFromHc('distance', [`${id}-dist`]);
  await deleteFromHc('calories', [`${id}-kcal`]);
  await deleteFromHc('heartRate', [`${id}-hr`]);
};

/** Saves a blood-pressure or glucose reading to Health Connect. Medications and symptoms stay in the app. */
export const writeHealthLogToHc = async (e: HealthLogEntry): Promise<void> => {
  if (e.imported) return;
  if (e.kind === 'bp' && e.systolic && e.diastolic) {
    if (!(await canWrite('bloodPressure'))) return;
    await quiet(HealthConnect.writeBloodPressure({ id: e.id, time: e.at, systolic: e.systolic, diastolic: e.diastolic }));
  } else if (e.kind === 'glucose' && e.mgdl) {
    if (!(await canWrite('bloodGlucose'))) return;
    await quiet(HealthConnect.writeBloodGlucose({ id: e.id, time: e.at, mgdl: e.mgdl, relation: e.relation }));
  }
};

export const deleteHealthLogFromHc = async (e: HealthLogEntry): Promise<void> => {
  if (e.imported) return;
  if (e.kind === 'bp') await deleteFromHc('bloodPressure', [e.id]);
  else if (e.kind === 'glucose') await deleteFromHc('bloodGlucose', [e.id]);
};