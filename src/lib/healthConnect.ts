import { HcSleepSession, HcSleepVitals } from './native';
import { SleepDetail, SleepLogEntry } from '../types/health';
import { countAwakenings, toSegments } from './sleepMetrics';
import { pickNight } from './sleepSources';

// Health Connect sleep stage codes
const AWAKE = new Set([1, 3, 7]); // awake, out of bed, awake in bed
const LIGHT = new Set([2, 4]); // generic "sleeping" counts as light
const DEEP = 5;
const REM = 6;

/** Sessions shorter than this are naps and are not logged as a night. */
const MIN_NIGHT_MIN = 90;

const pad = (n: number) => String(n).padStart(2, '0');

/** Formats an epoch time as the wall clock of the phone that recorded it. */
const localParts = (ms: number, offsetSeconds: number) => {
  const d = new Date(ms + offsetSeconds * 1000);
  return { date: d.toISOString().slice(0, 10), time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`, weekday: d.getUTCDay() };
};

const estimateRating = (asleepMin: number, efficiency: number) =>
  asleepMin >= 420 && efficiency >= 90 ? 5 : asleepMin >= 390 && efficiency >= 85 ? 4 : asleepMin >= 360 ? 3 : asleepMin >= 300 ? 2 : 1;

/** Turns one Health Connect sleep session into a log entry with measured stages. Null for naps. */
export const sessionToLog = (s: HcSleepSession): SleepLogEntry | null => {
  const inBedMin = Math.round((s.end - s.start) / 60000);
  let awake = 0;
  let light = 0;
  let deep = 0;
  let rem = 0;
  for (const [type, from, to] of s.stages) {
    const m = Math.round((to - from) / 60000);
    if (AWAKE.has(type)) awake += m;
    else if (LIGHT.has(type)) light += m;
    else if (type === DEEP) deep += m;
    else if (type === REM) rem += m;
  }
  const hasStages = s.stages.length > 0 && light + deep + rem > 0;
  const asleep = hasStages ? light + deep + rem : inBedMin;
  if (asleep < MIN_NIGHT_MIN) return null;

  const start = localParts(s.start, s.offsetSeconds);
  const end = localParts(s.end, s.offsetSeconds);
  const efficiency = inBedMin > 0 ? Math.min(100, Math.round((asleep / inBedMin) * 100)) : 0;
  const segments = hasStages ? toSegments(s.stages) : [];
  const detail: SleepDetail = {
    startMs: s.start,
    endMs: s.end,
    segments,
    awakenings: countAwakenings(segments),
    inBedMinutes: inBedMin,
    stagesFrom: 'measured',
  };
  return {
    id: `hc-${s.id}`,
    dateIso: end.date,
    displayDate: new Date(`${end.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    bedtime: start.time,
    wakeTime: end.time,
    durationMinutes: asleep,
    qualityRating: estimateRating(asleep, efficiency),
    notes: 'Imported from Health Connect',
    isManualEntry: !hasStages,
    source: 'health-connect',
    originApp: s.source,
    deepSleepMinutes: deep,
    remSleepMinutes: rem,
    lightSleepMinutes: hasStages ? light : Math.round(asleep * 0.55),
    awakeMinutes: hasStages ? awake : Math.max(0, inBedMin - asleep),
    efficiencyScore: efficiency,
    detail,
  };
};

const VITAL_FIELDS = ['hrSeries', 'hrAvg', 'hrMin', 'hrMax', 'hrvMs', 'respRate', 'spo2Avg', 'spo2Min', 'skinDelta'] as const;

/** Adds the overnight readings Health Connect had for a night, and notes when they were looked up. */
export const applyVitals = (log: SleepLogEntry, v: HcSleepVitals, now = Date.now()): SleepLogEntry => {
  if (!log.detail) return log;
  return {
    ...log,
    detail: {
      ...log.detail,
      hrAvg: v.hrAvg,
      hrMin: v.hrMin,
      hrMax: v.hrMax,
      hrSeries: v.hrSeries,
      hrvMs: v.hrvAvg,
      respRate: v.respAvg,
      spo2Avg: v.spo2Avg,
      spo2Min: v.spo2Min,
      skinDelta: v.skinDelta,
      vitalsAt: now,
    },
  };
};

/**
 * Imported nights whose overnight readings still need a look-up, newest first, at most {@code limit}. A night is asked about once
 * it has ended; the newest nights are asked again for a while because the watch can add readings after you wake up.
 */
export const nightsNeedingVitals = (logs: SleepLogEntry[], now = Date.now(), limit = 3, withinDays = 14): { id: string; start: number; end: number }[] => {
  const cutoff = now - withinDays * 86_400_000;
  return logs
    .filter((l) => l.source === 'health-connect' && l.detail && l.detail.endMs > cutoff && l.detail.endMs < now)
    .filter((l) => {
      const at = l.detail!.vitalsAt;
      if (!at) return true;
      const fresh = now - l.detail!.endMs < 18 * 3_600_000;
      return fresh && now - at > 90 * 60_000;
    })
    .sort((a, b) => b.detail!.endMs - a.detail!.endMs)
    .slice(0, limit)
    .map((l) => ({ id: l.id.replace(/^hc-/, ''), start: l.detail!.startMs, end: l.detail!.endMs }));
};

/** Puts looked-up readings onto the matching imported nights. */
export const applyVitalsToLogs = (logs: SleepLogEntry[], results: HcSleepVitals[], now = Date.now()): SleepLogEntry[] => {
  if (results.length === 0) return logs;
  const byId = new Map(results.map((r) => [`hc-${r.id}`, r]));
  return logs.map((l) => (byId.has(l.id) ? applyVitals(l, byId.get(l.id)!, now) : l));
};
/**
 * Adds imported nights to the log: earlier imports are refreshed, and a night you logged by hand is never
 * overwritten. Newest night first. When several trackers saved the same night, one version is shown and the rest are kept as
 * alternates: the one you switched to by hand, else the tracker preferred in Settings, else the best measured (see sleepSources.ts).
 */
export const mergeImportedSleep = (existing: SleepLogEntry[], imported: SleepLogEntry[], opts: { preferred?: string; secondary?: string } = {}): SleepLogEntry[] => {
  const earlier = new Map<string, SleepLogEntry>();
  for (const l of existing) {
    earlier.set(l.id, l);
    for (const a of l.alternates ?? []) if (!earlier.has(a.id)) earlier.set(a.id, a);
  }
  // A refreshed import has only the stages: keep the overnight readings already looked up for the same night.
  imported = imported.map((l) => {
    const old = earlier.get(l.id);
    if (!old?.detail || !l.detail) return l;
    const carry: Partial<SleepDetail> = { vitalsAt: old.detail.vitalsAt };
    for (const k of VITAL_FIELDS) if (old.detail[k] !== undefined) (carry as Record<string, unknown>)[k] = old.detail[k];
    return { ...l, detail: { ...l.detail, ...carry } };
  });
  const importedIds = new Set(imported.map((l) => l.id));
  // Nights detected by the phone are replaced by the watch's measured ones; only hand-logged nights are protected.
  const automatic = (l: SleepLogEntry) => l.source === 'health-connect' || l.source === 'sleep-api' || l.source === 'sensors' || l.source === 'import';
  const manualDates = new Set(existing.filter((l) => !automatic(l)).map((l) => l.dateIso));
  const keep = existing.filter((l) => !(l.source === 'health-connect' && importedIds.has(l.id)));
  const fresh = imported.filter((l) => !manualDates.has(l.dateIso));
  // Several imported sessions ending the same day (two trackers): one is shown, the others are kept beside it.
  const groups = new Map<string, SleepLogEntry[]>();
  for (const l of fresh) groups.set(l.dateIso, [...(groups.get(l.dateIso) ?? []), l]);
  const byDate = new Map<string, SleepLogEntry>();
  for (const [date, group] of groups) {
    const pinnedApp = existing.find((l) => l.dateIso === date && l.pinned)?.originApp;
    byDate.set(date, pickNight(group, opts.preferred, pinnedApp, opts.secondary));
  }
  const importedKeys = new Set([...byDate.values()].map((l) => l.dateIso));
  const kept = keep.filter((l) => !(automatic(l) && importedKeys.has(l.dateIso)));
  return [...kept, ...byDate.values()].sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0));
};

/** Steps for a day from all sources: the highest wins, since every source can only under-count. */
export const bestSteps = (...sources: (number | undefined | null)[]): number =>
  Math.max(0, ...sources.map((n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0)));