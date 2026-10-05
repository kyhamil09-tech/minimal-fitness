import { HealthConnect, isAndroidApp } from './native';
import { decimate } from './geo';
import { BodyEntry, FoodEntry, HealthLogEntry, WaterEntry } from '../types/tracking';
import { SleepLogEntry, WorkoutSession } from '../types/health';
import { parseDateKey, todayKey } from './dates';

/**
 * Saves what you log in the app into Health Connect so the Google Health / Fitbit apps see it too.
 * Everything here is best effort: with no Health Connect, no write permission, or a browser, it does nothing
 * and never blocks logging. Records carry the app's own ids, so saving the same entry twice updates it.
 */

let canWriteCache: { at: number; value: boolean } | null = null;

const canWrite = async (): Promise<boolean> => {
  if (!isAndroidApp()) return false;
  const now = Date.now();
  if (canWriteCache && now - canWriteCache.at < 30_000) return canWriteCache.value;
  let value = false;
  try {
    const s = await HealthConnect.status();
    value = s.available && !!s.canWrite;
  } catch {
    value = false;
  }
  canWriteCache = { at: now, value };
  return value;
};

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

export const writeWorkoutToHc = async (w: WorkoutSession): Promise<void> => {
  if (!w.startedAt || !(await canWrite())) return;
  const seconds = w.durationSec ?? w.durationMinutes * 60;
  if (seconds < 30) return;
  const route = (w.track ?? []).map((p) => [p.t, p.lat, p.lng, p.alt ?? null] as [number, number, number, number | null]);
  await quiet(
    HealthConnect.writeWorkout({
      id: w.id,
      type: w.type,
      start: w.startedAt,
      end: w.startedAt + seconds * 1000,
      live: !w.isManualEntry,
      title: w.planDayTitle ?? undefined,
      notes: w.notes ?? undefined,
      distanceKm: w.distanceKm && w.distanceKm > 0 ? w.distanceKm : undefined,
      kcal: w.caloriesBurned > 0 ? w.caloriesBurned : undefined,
      hr: w.hrFromSensor ? w.hrSeries : undefined,
      route: route.length >= 2 ? decimate(route, 2000) : undefined,
    })
  );
};

export const writeBodyToHc = async (b: BodyEntry): Promise<void> => {
  if (!(await canWrite())) return;
  await quiet(HealthConnect.writeBody({ id: b.id, time: atHour(b.date, 8), weightKg: b.weightKg, bodyFatPct: b.bodyFatPct }));
};

const MEAL_HOUR: Record<string, number> = { Breakfast: 8, Lunch: 12, Dinner: 18, Snack: 15 };

export const writeFoodToHc = async (f: FoodEntry): Promise<void> => {
  if (!(await canWrite())) return;
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
  if (!(await canWrite())) return;
  await quiet(HealthConnect.writeHydration({ id: w.id, start: w.date === todayKey() ? Date.now() - 60_000 : atHour(w.date, 12), ml: w.ml }));
};

export const writeSleepToHc = async (s: SleepLogEntry): Promise<void> => {
  // Nights that came from Health Connect are already there.
  if (s.source === 'health-connect' || !(await canWrite())) return;
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
  kind: 'bloodPressure' | 'bloodGlucose' | 'workout' | 'distance' | 'calories' | 'heartRate' | 'weight' | 'bodyFat' | 'nutrition' | 'hydration' | 'sleep',
  ids: string[]
): Promise<void> => {
  if (!(await canWrite())) return;
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
  if (e.imported || !(await canWrite())) return;
  if (e.kind === 'bp' && e.systolic && e.diastolic) {
    await quiet(HealthConnect.writeBloodPressure({ id: e.id, time: e.at, systolic: e.systolic, diastolic: e.diastolic }));
  } else if (e.kind === 'glucose' && e.mgdl) {
    await quiet(HealthConnect.writeBloodGlucose({ id: e.id, time: e.at, mgdl: e.mgdl, relation: e.relation }));
  }
};

export const deleteHealthLogFromHc = async (e: HealthLogEntry): Promise<void> => {
  if (e.imported) return;
  if (e.kind === 'bp') await deleteFromHc('bloodPressure', [e.id]);
  else if (e.kind === 'glucose') await deleteFromHc('bloodGlucose', [e.id]);
};