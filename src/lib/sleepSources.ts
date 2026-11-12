import { SleepLogEntry } from '../types/health';
import { Segment, countAwakenings } from './sleepMetrics';

/**
 * Sleep from more than one tracker. Health Connect holds what every tracker app shares, so one night can arrive twice: from a watch
 * and from a ring or band. The app shows one version of each night and keeps the others beside it so you can switch.
 *
 * Which version is the base: a night you switched by hand stays as you left it; otherwise your main tracker (Settings); otherwise the
 * best measured one. Then, when another tracker covers parts of the night the base does not (the watch came off at 6:44, the band
 * kept going to 8:34), the night is stitched together: the base's stages where it has them, and the other tracker for the rest.
 * The secondary tracker setting says which tracker may fill in: any other ("auto"), only one you name, or none.
 */

const MIN = 60_000;
/** Two records are the same night when they overlap by at least this much. */
const OVERLAP_MS = 30 * MIN;
/** A tracker that starts or ends this much outside the best record extends the night. */
const EXTEND_MS = 15 * MIN;
/** Suffixes for the versions kept beside a stitched night, so the original can be shown again. */
const SOLO = '~solo';
const COMBINED = '~combined';
const stripSuffix = (id: string) => id.replace(/~(solo|combined)$/, '');

const KNOWN: Record<string, string> = {
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.google.android.apps.wear.companion': 'Pixel Watch',
  'com.google.android.wearable.app': 'Wear OS',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.ouraring.oura': 'Oura',
  'com.withings.wiscale2': 'Withings',
  'com.whoop.android': 'WHOOP',
  'fi.polar.polarflow': 'Polar Flow',
  'com.huawei.health': 'Huawei Health',
  'com.northcube.sleepcycle': 'Sleep Cycle',
  'com.kyfitness.app': 'This app',
};

/** A readable name for the app that saved a night: known trackers by name, otherwise the last part of the package name. */
export const sourceName = (pkg?: string): string => {
  if (!pkg) return 'Unknown app';
  if (KNOWN[pkg]) return KNOWN[pkg];
  const last = pkg.split('.').filter(Boolean).pop() ?? pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
};

const hasStages = (l: SleepLogEntry) => !!l.detail && l.detail.segments.length > 0;

/** True when `a` is the better record of a night than `b`: measured stages first, then the longer one. */
const better = (a: SleepLogEntry, b: SleepLogEntry) => {
  if (hasStages(a) !== hasStages(b)) return hasStages(a);
  return a.durationMinutes > b.durationMinutes;
};

const plain = (l: SleepLogEntry): SleepLogEntry => {
  const { alternates: _a, pinned: _p, ...rest } = l;
  return rest;
};

/** Which of one night's records is the best base. `pinnedApp` is the tracker you picked for this night by hand, `preferred` the one in Settings. */
export const chooseVersion = (candidates: SleepLogEntry[], preferred?: string, pinnedApp?: string): SleepLogEntry => {
  const byApp = (app?: string) => (app && app !== 'auto' ? candidates.filter((c) => c.originApp === app) : []);
  const pool = byApp(pinnedApp).length > 0 ? byApp(pinnedApp) : byApp(preferred).length > 0 ? byApp(preferred) : candidates;
  return pool.reduce((best, c) => (better(c, best) ? c : best));
};

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** `v`'s stretch from `from` to `to` as stage segments; time it has no stages for is counted as light sleep. */
const stretchOf = (v: SleepLogEntry, from: number, to: number): Segment[] => {
  const inside = (v.detail?.segments ?? [])
    .filter((s) => s[2] > from && s[1] < to)
    .map((s): Segment => [s[0], Math.max(s[1], from), Math.min(s[2], to)])
    .sort((a, b) => a[1] - b[1]);
  const out: Segment[] = [];
  let cursor = from;
  for (const s of inside) {
    if (s[1] > cursor) out.push([1, cursor, s[1]]);
    out.push(s);
    cursor = Math.max(cursor, s[2]);
  }
  if (cursor < to) out.push([1, cursor, to]);
  return out;
};

/**
 * Stitches a night together when another tracker covers time the best record does not: for example the watch came off at 6:44 and
 * the band recorded until 8:34. The best record's stages are kept; the stretches only the other tracker saw are added from it (its
 * stages when it has them, light sleep otherwise). Returns the best record untouched when nothing sticks out by more than 15 minutes.
 */
export const combineNight = (best: SleepLogEntry, others: SleepLogEntry[]): SleepLogEntry => {
  const d = best.detail;
  if (!d || d.segments.length === 0) return best;
  const same = others.filter((o) => o.detail && Math.min(d.endMs, o.detail.endMs) - Math.max(d.startMs, o.detail.startMs) >= OVERLAP_MS);
  if (same.length === 0) return best;
  const earliest = Math.min(d.startMs, ...same.map((o) => o.detail!.startMs));
  const latest = Math.max(d.endMs, ...same.map((o) => o.detail!.endMs));
  const start = d.startMs - earliest > EXTEND_MS ? earliest : d.startMs;
  const end = latest - d.endMs > EXTEND_MS ? latest : d.endMs;
  if (start === d.startMs && end === d.endMs) return best;

  // The tracker that saw the most of a stretch supplies it.
  const supplier = (from: number, to: number) =>
    same.reduce((top, o) => {
      const seen = (x: SleepLogEntry) => Math.max(0, Math.min(to, x.detail!.endMs) - Math.max(from, x.detail!.startMs));
      return seen(o) > seen(top) ? o : top;
    }, same[0]);
  const used = new Set<SleepLogEntry>();
  const segments: Segment[] = [];
  if (start < d.startMs) {
    const s = supplier(start, d.startMs);
    used.add(s);
    segments.push(...stretchOf(s, start, d.startMs));
  }
  segments.push(...d.segments);
  if (end > d.endMs) {
    const s = supplier(d.endMs, end);
    used.add(s);
    segments.push(...stretchOf(s, d.endMs, end));
  }

  const minutes = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const [code, from, to] of segments) minutes[code] += (to - from) / MIN;
  const awake = Math.round(minutes[0]);
  const light = Math.round(minutes[1]);
  const deep = Math.round(minutes[2]);
  const rem = Math.round(minutes[3]);
  const asleep = light + deep + rem;
  const inBed = Math.round((end - start) / MIN);
  const apps = [best.originApp, ...[...used].map((o) => o.originApp)].filter((a): a is string => !!a);
  return {
    ...best,
    bedtime: clock(start),
    wakeTime: clock(end),
    durationMinutes: asleep,
    deepSleepMinutes: deep,
    remSleepMinutes: rem,
    lightSleepMinutes: light,
    awakeMinutes: awake,
    efficiencyScore: inBed > 0 ? Math.min(100, Math.round((asleep / inBed) * 100)) : 0,
    mergedFrom: [...new Set(apps)],
    detail: { ...d, startMs: start, endMs: end, segments, inBedMinutes: inBed, awakenings: countAwakenings(segments) },
  };
};

/**
 * The version of one night to show, with the other versions kept as alternates (including the best record on its own, when the shown
 * one was stitched). A hand-picked tracker or a preferred one shows that tracker's own record; otherwise the night is stitched.
 */
export const pickNight = (raw: SleepLogEntry[], preferred?: string, pinnedApp?: string, secondary = 'auto'): SleepLogEntry => {
  const winner = chooseVersion(raw, preferred, pinnedApp);
  const others = raw.filter((r) => r.id !== winner.id).map(plain);
  const fillers = secondary === 'none' ? [] : secondary === 'auto' ? others : others.filter((o) => o.originApp === secondary);
  const shown = pinnedApp ? plain(winner) : combineNight(plain(winner), fillers);
  const alternates = [...others, ...(shown.mergedFrom ? [{ ...plain(winner), id: winner.id + SOLO }] : [])];
  return { ...shown, alternates: alternates.length ? alternates : undefined, pinned: pinnedApp && winner.originApp === pinnedApp ? true : undefined };
};

/** Shows `altId` for this night and keeps what was shown as an alternate. A night you switched to by hand stays on it at later syncs. */
export const swapVersion = (log: SleepLogEntry, altId: string, pin = true): SleepLogEntry => {
  const alt = (log.alternates ?? []).find((a) => a.id === altId);
  if (!alt) return log;
  const leaving = log.mergedFrom ? { ...plain(log), id: log.id + COMBINED } : plain(log);
  const others = [leaving, ...(log.alternates ?? []).filter((a) => a.id !== altId)];
  return { ...plain(alt), id: stripSuffix(alt.id), alternates: others, pinned: pin && !alt.mergedFrom ? true : undefined };
};

/** One night's own records, as the trackers saved them (the stitched version left out). */
const rawVersions = (l: SleepLogEntry): SleepLogEntry[] =>
  [l, ...(l.alternates ?? [])].filter((v) => !v.mergedFrom).map((v) => ({ ...plain(v), id: stripSuffix(v.id) }));

/** Re-picks the shown version of every night that has alternates, for a changed preference. Nights you picked by hand are left alone. */
export const applyPreference = (logs: SleepLogEntry[], preferred: string, secondary = 'auto'): SleepLogEntry[] => {
  let changed = false;
  const out = logs.map((l) => {
    if (!l.alternates?.length || l.pinned) return l;
    const next = pickNight(rawVersions(l), preferred, undefined, secondary);
    if (next.id === l.id && (next.mergedFrom ?? []).join() === (l.mergedFrom ?? []).join()) return l;
    changed = true;
    return next;
  });
  return changed ? out : logs;
};

/** The trackers seen in the log, with how many nights each recorded, most first. */
export const sourcesIn = (logs: SleepLogEntry[]): { app: string; name: string; nights: number }[] => {
  const counts = new Map<string, number>();
  for (const l of logs) {
    for (const v of [l, ...(l.alternates ?? [])]) {
      if (v.originApp && !v.mergedFrom) counts.set(v.originApp, (counts.get(v.originApp) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([app, nights]) => ({ app, name: sourceName(app), nights }));
};

/** A short name for one version of a night, for its switch button. */
export const versionName = (l: SleepLogEntry): string =>
  l.mergedFrom && l.mergedFrom.length > 1 ? 'Combined' : sourceName(l.originApp);

/** Where a night came from, in words. */
export const nightSourceLabel = (l: SleepLogEntry): string => {
  if (l.mergedFrom && l.mergedFrom.length > 1) return `Combined from ${l.mergedFrom.map(sourceName).join(' and ')}`;
  if (l.originApp) return `Recorded by ${sourceName(l.originApp)}`;
  if (l.source === 'sensors') return 'Estimated by this app from your watch';
  if (l.source === 'sleep-api') return 'Detected by your phone';
  if (l.source === 'import') return 'Imported from a file';
  return 'Logged by you';
};
