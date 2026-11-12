import { SleepLogEntry, WorkoutSession } from '../../types/health';
import { Exercise, UserProfile } from '../../types/tracking';
import { customExercises } from '../../data/exercises';
import { parseLiftCsv } from './liftCsv';
import { activityToWorkout } from './convert';
import { parseFit } from './fitActivity';
import { looksLikeNike, parseFitbitExercise, parseFitbitSleep, parseNikeActivity } from './jsonExports';
import { ImportProgress, ParsedActivity } from './types';
import { parseGpx, parseTcx } from './xmlActivities';
import { blobChunks, gunzip, readZip } from './zipReader';

export interface ImportOutcome {
  workouts: WorkoutSession[];
  nights: SleepLogEntry[];
  /** Files that held no usable activity, with the reason in plain words. */
  skipped: { name: string; reason: string }[];
  filesSeen: number;
  /** Exercises made for names from a Hevy or Strong file that the library does not have. They are saved when the import is applied. */
  exercises: Exercise[];
  /** What a Hevy or Strong file held, for the preview. */
  lift?: { source: string; matched: number; created: number };
}

/** Strava's numeric activity types, found in <type> of some older GPX exports. */
const STRAVA_NUMERIC: Record<string, string> = { '1': 'Ride', '4': 'Hike', '9': 'Run', '10': 'Walk', '11': 'Workout', '17': 'VirtualRide', '18': 'EBikeRide', '21': 'Rowing' };

const base = (name: string) => name.replace(/\\/g, '/').split('/').pop() ?? name;

/** A small CSV reader (quotes, commas and newlines inside quotes) for Strava's activities.csv. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
};

interface StravaMeta {
  type?: string;
  name?: string;
}

/** Strava's activities.csv: the activity type and name for each file in the archive, by file name. */
export const stravaMeta = (csv: string): Map<string, StravaMeta> => {
  const rows = parseCsv(csv);
  const out = new Map<string, StravaMeta>();
  if (rows.length < 2) return out;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const file = head.indexOf('filename');
  const type = head.indexOf('activity type');
  const name = head.indexOf('activity name');
  if (file < 0) return out;
  for (const r of rows.slice(1)) {
    const f = (r[file] ?? '').trim();
    if (!f) continue;
    out.set(base(f).replace(/\.gz$/i, ''), { type: type >= 0 ? r[type]?.trim() : undefined, name: name >= 0 ? r[name]?.trim() : undefined });
  }
  return out;
};

const WANTED = /\.(gpx|tcx|fit|json)(\.gz)?$/i;
const SKIP = /(^|\/)(__MACOSX|\.)|\/\._/;

/**
 * Reads files you drop in (a Strava or Google Takeout zip, a Nike export, or loose GPX / TCX / FIT / JSON files) and returns the
 * workouts and nights found. Nothing is added to the app here: the caller shows a preview first. Everything happens on the phone.
 */
export const importFiles = async (files: File[], profile: UserProfile, onProgress?: (p: ImportProgress) => void, options: { liftUnit?: 'kg' | 'lb' } = {}): Promise<ImportOutcome> => {
  const outcome: ImportOutcome = { workouts: [], nights: [], skipped: [], filesSeen: 0, exercises: [] };
  const liftUnit = options.liftUnit ?? (profile.units === 'imperial' ? 'lb' : 'kg');
  const seenKeys = new Set<string>();
  let meta = new Map<string, StravaMeta>();
  const report = (current?: string) => onProgress?.({ seen: outcome.filesSeen, workouts: outcome.workouts.length, nights: outcome.nights.length, current });
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  const addActivities = (acts: ParsedActivity[], name: string, m?: StravaMeta) => {
    if (acts.length === 0) {
      outcome.skipped.push({ name, reason: 'No activity found in the file' });
      return;
    }
    for (const a of acts) {
      if (m?.type) a.sport = m.type;
      else if (a.sport && STRAVA_NUMERIC[a.sport]) a.sport = STRAVA_NUMERIC[a.sport];
      if (m?.name) a.name = m.name;
      const w = activityToWorkout(a, profile);
      if (!w) {
        outcome.skipped.push({ name, reason: 'Not a supported activity (surfing, sailing and wheeled skating have no place here yet) or too short' });
        continue;
      }
      if (seenKeys.has(w.id)) continue;
      seenKeys.add(w.id);
      outcome.workouts.push(w);
    }
  };

  const ingest = async (rawName: string, data: Uint8Array) => {
    outcome.filesSeen++;
    let name = rawName;
    let bytes = data;
    try {
      if (/\.gz$/i.test(name)) {
        bytes = gunzip(bytes);
        name = name.replace(/\.gz$/i, '');
      }
      const lower = name.toLowerCase();
      const m = meta.get(base(name));
      if (lower.endsWith('.gpx')) addActivities(parseGpx(new TextDecoder().decode(bytes), base(name)), rawName, m);
      else if (lower.endsWith('.tcx')) addActivities(parseTcx(new TextDecoder().decode(bytes), base(name)), rawName, m);
      else if (lower.endsWith('.fit')) addActivities(parseFit(bytes, base(name)), rawName, m);
      else if (lower.endsWith('.json')) {
        const json = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        const list = Array.isArray(json) ? json : [json];
        const first = list[0] as Record<string, unknown> | undefined;
        if (looksLikeNike(first)) {
          const acts = list.map((j, i) => parseNikeActivity(j as Record<string, unknown>, `${base(name)}#${i}`)).filter((a): a is ParsedActivity => a !== null);
          addActivities(acts, rawName);
        } else if (first && ('levels' in first || 'minutesAsleep' in first)) {
          const nights = parseFitbitSleep(list);
          outcome.nights.push(...nights);
        } else if (first && 'activityName' in first && 'startTime' in first) {
          addActivities(parseFitbitExercise(list, base(name)), rawName);
        }
        // other JSON (profile, settings) is not an activity: ignored without comment
      }
    } catch (e) {
      outcome.skipped.push({ name: rawName, reason: e instanceof Error ? e.message : 'Could not read the file' });
    }
    if (outcome.filesSeen % 8 === 0) {
      report(rawName);
      await tick();
    }
  };

  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      // First pass: Strava's activities.csv, which names the sport of each file. Second pass: the activities themselves.
      await readZip(blobChunks(file), (n) => /(^|\/)activities\.csv$/i.test(n), (e) => {
        meta = stravaMeta(new TextDecoder().decode(e.data));
      });
      await readZip(blobChunks(file), (n) => WANTED.test(n) && !SKIP.test(n), (e) => ingest(e.name, e.data));
    } else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (/activities\.csv$/i.test(file.name)) meta = stravaMeta(new TextDecoder().decode(bytes));
      else if (/\.csv$/i.test(file.name)) {
        outcome.filesSeen++;
        // A lifting export from Hevy or Strong: workouts with their exercises and sets.
        const lift = parseLiftCsv(new TextDecoder().decode(bytes), { unit: liftUnit, weightKg: profile.weightKg, known: customExercises() });
        if (!lift) outcome.skipped.push({ name: file.name, reason: 'Not a Hevy or Strong lifting export' });
        else {
          outcome.workouts.push(...lift.workouts);
          for (const e of lift.created) if (!outcome.exercises.some((x) => x.id === e.id)) outcome.exercises.push(e);
          outcome.lift = { source: lift.format === 'hevy' ? 'Hevy' : 'Strong', matched: (outcome.lift?.matched ?? 0) + lift.matched, created: outcome.exercises.length };
          if (lift.skippedRows > 0) outcome.skipped.push({ name: file.name, reason: `${lift.skippedRows} rows were not sets (rest timers or blanks) and were left out` });
        }
      } else await ingest(file.name, bytes);
    }
    report(file.name);
  }
  report();
  return outcome;
};
