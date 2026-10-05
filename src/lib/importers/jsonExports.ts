import { SleepDetail, SleepLogEntry, SleepStageCode } from '../../types/health';
import { ParsedActivity, ParsedPoint } from './types';

/**
 * Readers for the JSON exports: Nike Run Club's activity files and Fitbit's Google Takeout (sleep and exercise). The Nike layout is
 * the one its app and API use (an activity with summaries and per-metric value lists); it is read defensively because the export
 * is not documented. Anything that does not look right is skipped rather than guessed at.
 */

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => {
  const x = typeof v === 'string' ? Number(v) : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
};

export const looksLikeNike = (j: unknown): boolean => isObj(j) && Array.isArray(j.metrics) && (j.start_epoch_ms !== undefined || j.summaries !== undefined);

/** One Nike Run Club activity: summaries (distance, calories) and metric streams (latitude, longitude, elevation, heart rate). */
export const parseNikeActivity = (j: Json, key = 'nike.json'): ParsedActivity | null => {
  const start = num(j.start_epoch_ms);
  if (!start) return null;
  const end = num(j.end_epoch_ms);
  const summaries = Array.isArray(j.summaries) ? j.summaries.filter(isObj) : [];
  const summary = (name: string) => {
    const s = summaries.find((x) => x.metric === name);
    return s ? { value: num(s.value), unit: String(s.unit ?? '') } : undefined;
  };
  const metrics = Array.isArray(j.metrics) ? j.metrics.filter(isObj) : [];
  const series = (type: string): { t: number; v: number }[] => {
    const m = metrics.find((x) => x.type === type);
    if (!m || !Array.isArray(m.values)) return [];
    return m.values
      .filter(isObj)
      .map((x) => ({ t: num(x.start_epoch_ms) ?? 0, v: num(x.value) ?? NaN }))
      .filter((x) => x.t > 0 && Number.isFinite(x.v));
  };
  const lat = series('latitude');
  const lng = series('longitude');
  const ele = series('elevation');
  const hrS = series('heart_rate');
  const points: ParsedPoint[] = [];
  const nearest = (list: { t: number; v: number }[], t: number): number | undefined => {
    if (!list.length) return undefined;
    let lo = 0;
    let hi = list.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    const a = list[Math.max(0, lo - 1)];
    const b = list[lo];
    return Math.abs(a.t - t) <= Math.abs(b.t - t) ? a.v : b.v;
  };
  const count = Math.min(lat.length, lng.length);
  for (let i = 0; i < count; i++) {
    if (Math.abs(lat[i].v) > 90 || Math.abs(lng[i].v) > 180) continue;
    points.push({ t: lat[i].t, lat: lat[i].v, lng: lng[i].v, alt: nearest(ele, lat[i].t), hr: nearest(hrS, lat[i].t) });
  }
  const dist = summary('distance');
  const km = dist?.value === undefined ? undefined : /mi/i.test(dist.unit) ? dist.value * 1.609344 : /^m$/i.test(dist.unit) ? dist.value / 1000 : dist.value;
  const calories = summary('calories')?.value;
  const activeMs = num(j.active_duration_ms);
  const type = String(j.type ?? j.activity_type ?? 'run');
  if (points.length < 2 && !km && !activeMs) return null;
  return {
    source: 'nike',
    key: String(j.id ?? key),
    sport: type,
    start,
    elapsedSec: end && end > start ? (end - start) / 1000 : undefined,
    movingSec: activeMs ? activeMs / 1000 : undefined,
    distanceKm: km,
    calories,
    points,
    hr: hrS.length ? hrS.map((x): [number, number] => [x.t, x.v]) : undefined,
  };
};

/** Fitbit exercise-*.json: a list of activities with a start, a duration in ms, calories and (sometimes) distance and average heart rate. */
export const parseFitbitExercise = (list: unknown, key = 'exercise.json'): ParsedActivity[] => {
  if (!Array.isArray(list)) return [];
  const out: ParsedActivity[] = [];
  for (const x of list) {
    if (!isObj(x)) continue;
    const start = Date.parse(String(x.startTime ?? ''));
    const duration = num(x.duration) ?? num(x.activeDuration);
    if (!Number.isFinite(start) || !duration) continue;
    const dist = num(x.distance);
    const unit = String(x.distanceUnit ?? 'Kilometer');
    out.push({
      source: 'fitbit',
      key: `fb-${x.logId ?? start}`,
      name: typeof x.activityName === 'string' ? x.activityName : undefined,
      sport: typeof x.activityName === 'string' ? x.activityName : undefined,
      start,
      elapsedSec: duration / 1000,
      movingSec: (num(x.activeDuration) ?? duration) / 1000,
      distanceKm: dist === undefined ? undefined : /mile/i.test(unit) ? dist * 1.609344 : dist,
      calories: num(x.calories),
      avgHr: num(x.averageHeartRate),
      ascentM: num(x.elevationGain),
      points: [],
    });
  }
  void key;
  return out;
};

const LEVEL: Record<string, SleepStageCode> = { wake: 0, awake: 0, restless: 0, light: 1, asleep: 1, deep: 2, rem: 3 };

const localDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Fitbit sleep-*.json: each entry is one sleep with its stage minutes and a timeline. Naps shorter than 90 minutes are left out. */
export const parseFitbitSleep = (list: unknown): SleepLogEntry[] => {
  if (!Array.isArray(list)) return [];
  const out: SleepLogEntry[] = [];
  for (const x of list) {
    if (!isObj(x)) continue;
    const startMs = Date.parse(String(x.startTime ?? ''));
    const endMs = Date.parse(String(x.endTime ?? ''));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    const asleepMin = num(x.minutesAsleep) ?? 0;
    const inBed = num(x.timeInBed) ?? Math.round((endMs - startMs) / 60000);
    if (asleepMin < 90) continue;
    const levels = isObj(x.levels) ? x.levels : {};
    const summary = isObj(levels.summary) ? levels.summary : {};
    const minutesOf = (k: string) => (isObj(summary[k]) ? num((summary[k] as Json).minutes) ?? 0 : 0);
    const staged = x.type === 'stages' || isObj(summary.deep);
    const data = Array.isArray(levels.data) ? levels.data.filter(isObj) : [];
    const segments: [SleepStageCode, number, number][] = [];
    for (const d of data) {
      const t = Date.parse(String(d.dateTime ?? ''));
      const secs = num(d.seconds);
      const code = LEVEL[String(d.level ?? '').toLowerCase()];
      if (!Number.isFinite(t) || !secs || code === undefined) continue;
      const last = segments[segments.length - 1];
      if (last && last[0] === code && Math.abs(t - last[2]) < 60_000) last[2] = t + secs * 1000;
      else segments.push([code, t, t + secs * 1000]);
    }
    const deep = staged ? minutesOf('deep') : 0;
    const rem = staged ? minutesOf('rem') : 0;
    const light = staged ? minutesOf('light') : Math.round(asleepMin * 0.6);
    const awake = staged ? minutesOf('wake') : num(x.minutesAwake) ?? Math.max(0, inBed - asleepMin);
    const awakenings = segments.length ? segments.slice(1, -1).filter((s) => s[0] === 0 && s[2] - s[1] >= 120_000).length : num(x.awakeCount) ?? 0;
    const detail: SleepDetail = { startMs, endMs, segments: staged ? segments : [], awakenings, inBedMinutes: inBed, stagesFrom: 'measured' };
    const date = typeof x.dateOfSleep === 'string' ? x.dateOfSleep : localDate(endMs);
    out.push({
      id: `import-fb-${x.logId ?? startMs}`,
      dateIso: date,
      displayDate: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      bedtime: hhmm(startMs),
      wakeTime: hhmm(endMs),
      durationMinutes: asleepMin,
      qualityRating: asleepMin >= 420 ? 4 : asleepMin >= 360 ? 3 : 2,
      notes: 'Imported from Fitbit',
      isManualEntry: !staged,
      source: 'import',
      deepSleepMinutes: deep,
      remSleepMinutes: rem,
      lightSleepMinutes: light,
      awakeMinutes: awake,
      efficiencyScore: num(x.efficiency) ?? (inBed > 0 ? Math.min(100, Math.round((asleepMin / inBed) * 100)) : 0),
      detail: staged ? detail : { ...detail, segments: [] },
    });
  }
  return out;
};
