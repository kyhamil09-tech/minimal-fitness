import { WorkoutSession } from '../../types/health';
import { Exercise, ExerciseLog, MuscleGroup, SetKind, SetLog } from '../../types/tracking';
import { allExercises } from '../../data/exercises';
import { estimateCalories } from '../calc';
import { KG_PER_LB } from '../units';
import { hasWork, kindOf } from '../sets';

/**
 * Reads the CSV that Hevy and Strong export (Settings > Export data in either app) into workouts with their exercises and sets, and writes
 * the same Hevy layout back out. Names are matched to this app's exercise library; ones it does not know become exercises of your own.
 * Weights in a Strong file carry no unit, so the caller says which one the file uses; Hevy says it in the column name.
 */

export type LiftFormat = 'hevy' | 'strong';

export interface LiftCsvResult {
  format: LiftFormat;
  workouts: WorkoutSession[];
  /** Exercises made for names the library does not have (not yet saved anywhere). */
  created: Exercise[];
  matched: number;
  /** Rows that were not a set (rest timers, blanks) or could not be read. */
  skippedRows: number;
}

// ----- Reading the table -----

/** The same small CSV reader the other importers use, kept here so this file stands alone. */
export const readCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
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

const lowerHead = (rows: string[][]): string[] => (rows[0] ?? []).map((h) => h.trim().toLowerCase());

/** Which app's export this is, from its column names (null when it is neither). */
export const detectLiftCsv = (rows: string[][]): LiftFormat | null => {
  const h = lowerHead(rows);
  if (h.includes('exercise_title') && h.includes('set_index')) return 'hevy';
  if (h.includes('exercise name') && h.includes('set order')) return 'strong';
  return null;
};

// ----- Times -----

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** "12 Oct 2026, 08:00", "2026-10-12 08:00:00", "2026-10-12T08:00:00Z" or anything the browser reads; NaN when not a date. */
export const parseWhen = (raw: string): number => {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (m) {
    let h = Number(m[4]);
    if (m[7]) h = (h % 12) + (/p/i.test(m[7]) ? 12 : 0);
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon === undefined) return NaN;
    return new Date(Number(m[3]), mon, Number(m[1]), h, Number(m[5]), Number(m[6] ?? 0)).getTime();
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)).getTime();
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
};

/** "1h 5m", "45m", "1h", "90s" or plain seconds, in seconds. */
export const parseDuration = (raw: string): number => {
  const s = raw.trim().toLowerCase();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0;
  for (const [, n, u] of s.matchAll(/(\d+(?:\.\d+)?)\s*(h|m|s)/g)) total += Number(n) * (u === 'h' ? 3600 : u === 'm' ? 60 : 1);
  return Math.round(total);
};

// ----- Matching names to the library -----

const STOP = new Set(['the', 'a', 'an', 'with', 'of', 'and']);
const EQUIPMENT = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'ez', 'bar', 'kettlebell', 'band', 'bodyweight', 'trap', 'plate', 'suspension', 'medicine', 'ball', 'weighted']);

const singular = (t: string): string => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);

const tokensOf = (name: string): string[] =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !STOP.has(t))
    .map(singular);

const keyOf = (tokens: string[]): string => [...tokens].sort().join(' ');

/** Names other apps use for exercises this library calls something else. The right side is the library's name. */
const ALIASES: [string[], string][] = [
  [['squat', 'squat barbell', 'barbell squat', 'back squat barbell'], 'Back Squat'],
  [['overhead press', 'overhead press barbell', 'shoulder press barbell', 'military press', 'standing military press'], 'Overhead Press'],
  [['bent over row', 'bent over row barbell', 'barbell bent over row'], 'Barbell Row'],
  [['incline bench press dumbbell', 'dumbbell incline bench press'], 'Incline Dumbbell Press'],
  [['bicep curl', 'bicep curl dumbbell', 'dumbbell bicep curl'], 'Dumbbell Curl'],
  [['bicep curl barbell', 'barbell bicep curl'], 'Barbell Curl'],
  [['shoulder press dumbbell', 'overhead press dumbbell', 'dumbbell overhead press'], 'Dumbbell Shoulder Press'],
  [['row dumbbell', 'single arm dumbbell row', 'dumbbell row'], 'One-Arm Dumbbell Row'],
  [['seated cable row', 'cable row', 'seated row cable', 'seated row'], 'Seated Cable Row'],
  [['tricep pushdown cable', 'triceps pushdown cable', 'tricep pushdown'], 'Triceps Pushdown'],
  [['lunge dumbbell', 'walking lunge dumbbell'], 'Walking Lunge'],
];

interface Index {
  exact: Map<string, Exercise>;
  noEquip: Map<string, Exercise[]>;
  alias: Map<string, Exercise>;
}

const buildIndex = (list: Exercise[]): Index => {
  const exact = new Map<string, Exercise>();
  const noEquip = new Map<string, Exercise[]>();
  for (const e of list) {
    const t = tokensOf(e.name);
    if (!exact.has(keyOf(t))) exact.set(keyOf(t), e);
    const k = keyOf(t.filter((x) => !EQUIPMENT.has(x)));
    noEquip.set(k, [...(noEquip.get(k) ?? []), e]);
  }
  const alias = new Map<string, Exercise>();
  for (const [names, target] of ALIASES) {
    const hit = exact.get(keyOf(tokensOf(target)));
    if (hit) for (const n of names) alias.set(keyOf(tokensOf(n)), hit);
  }
  return { exact, noEquip, alias };
};

/** The library exercise a name from another app means, or null. Only a clear single match is accepted. */
export const matchExercise = (name: string, index: Index): Exercise | null => {
  const t = tokensOf(name);
  if (!t.length) return null;
  const k = keyOf(t);
  const direct = index.exact.get(k) ?? index.alias.get(k);
  if (direct) return direct;
  const bare = t.filter((x) => !EQUIPMENT.has(x));
  if (!bare.length) return null;
  const candidates = index.noEquip.get(keyOf(bare)) ?? [];
  if (candidates.length === 1) return candidates[0];
  // Several kinds of the same lift: take the one whose equipment the name mentions.
  const mentioned = candidates.filter((c) => tokensOf(c.equipment).every((eq) => t.includes(eq)));
  return mentioned.length === 1 ? mentioned[0] : null;
};

const MUSCLE_GUESS: [RegExp, MuscleGroup][] = [
  [/bench|chest|fly|flye|pec|push[- ]?up|crossover|dip/i, 'Chest'],
  [/row|pull[- ]?up|chin[- ]?up|pulldown|lat |deadlift|shrug|back ext|hyperext/i, 'Back'],
  [/shoulder|overhead|lateral raise|front raise|rear delt|face pull|arnold|upright/i, 'Shoulders'],
  [/curl|tricep|bicep|skull|pushdown|forearm|kickback/i, 'Arms'],
  [/hip thrust|glute|bridge|kickback/i, 'Glutes'],
  [/squat|lunge|leg |calf|quad|hamstring|step[- ]?up|rdl|romanian/i, 'Legs'],
  [/crunch|plank|\bab\b|abs|sit[- ]?up|core|twist|woodchop|leg raise/i, 'Core'],
];

export const guessMuscle = (name: string): MuscleGroup => MUSCLE_GUESS.find(([re]) => re.test(name))?.[1] ?? 'Full Body';

const guessEquipment = (name: string): Exercise['equipment'] => {
  const t = tokensOf(name);
  if (t.includes('barbell')) return 'Barbell';
  if (t.includes('dumbbell')) return 'Dumbbell';
  if (t.includes('cable')) return 'Cable';
  if (t.includes('smith')) return 'Smith Machine';
  if (t.includes('kettlebell')) return 'Kettlebell';
  if (t.includes('machine') || t.includes('assisted')) return 'Machine';
  if (t.includes('band')) return 'Band';
  if (t.includes('ez')) return 'EZ Bar';
  if (t.includes('trap')) return 'Trap Bar';
  if (t.includes('bodyweight')) return 'Bodyweight';
  return 'Other';
};

const slug = (s: string): string => tokensOf(s).join('-').slice(0, 40) || 'exercise';

// ----- Rows to workouts -----

interface Row {
  key: string;
  title: string;
  start: number;
  end: number;
  durationSec: number;
  description: string;
  exercise: string;
  superset: string;
  exNote: string;
  kind: SetKind;
  weightKg: number;
  reps: number;
  seconds: number;
  rpe?: number;
}

const num = (s: string | undefined): number => {
  const n = Number((s ?? '').replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const hevyKind = (s: string): SetKind => {
  const v = s.trim().toLowerCase();
  return v === 'warmup' || v === 'warm_up' || v === 'warm-up' ? 'warmup' : v === 'dropset' || v === 'drop' || v === 'drop_set' ? 'drop' : v === 'failure' ? 'failure' : 'normal';
};

const strongKind = (s: string): SetKind | 'rest' | 'bad' => {
  const v = s.trim().toUpperCase();
  if (/^\d+$/.test(v)) return 'normal';
  if (v === 'W') return 'warmup';
  if (v === 'D') return 'drop';
  if (v === 'F') return 'failure';
  if (v === 'REST TIMER') return 'rest';
  return 'bad';
};

const toRows = (rows: string[][], format: LiftFormat, unit: 'kg' | 'lb'): { rows: Row[]; skipped: number } => {
  const h = lowerHead(rows);
  const col = (...names: string[]) => names.map((n) => h.indexOf(n)).find((i) => i >= 0) ?? -1;
  const out: Row[] = [];
  let skipped = 0;
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const cTitle = col('title', 'workout name');
  const cStart = col('start_time', 'date');
  const cEnd = col('end_time');
  const cDur = col('duration');
  const cDesc = col('description', 'workout notes');
  const cEx = col('exercise_title', 'exercise name');
  const cSuper = col('superset_id');
  const cExNote = col('exercise_notes', 'notes');
  const cSet = col('set_type', 'set order');
  const cKg = col('weight_kg');
  const cLb = col('weight_lbs', 'weight_lb');
  const cWeight = col('weight');
  const cReps = col('reps');
  const cSecs = col('duration_seconds', 'seconds');
  const cRpe = col('rpe');
  for (const r of rows.slice(1)) {
    const exercise = get(r, cEx);
    const start = parseWhen(get(r, cStart));
    if (!exercise || !Number.isFinite(start)) {
      skipped++;
      continue;
    }
    let kind: SetKind;
    if (format === 'hevy') kind = hevyKind(get(r, cSet));
    else {
      const k = strongKind(get(r, cSet));
      if (k === 'rest') {
        skipped++;
        continue;
      }
      kind = k === 'bad' ? 'normal' : k;
    }
    let weightKg = 0;
    if (cKg >= 0) weightKg = num(get(r, cKg));
    else if (cLb >= 0) weightKg = num(get(r, cLb)) * KG_PER_LB;
    else weightKg = num(get(r, cWeight)) * (unit === 'lb' ? KG_PER_LB : 1);
    const reps = Math.round(num(get(r, cReps)));
    const seconds = Math.round(num(get(r, cSecs)));
    if (reps <= 0 && seconds <= 0) {
      skipped++;
      continue;
    }
    const title = get(r, cTitle) || 'Workout';
    const end = cEnd >= 0 ? parseWhen(get(r, cEnd)) : NaN;
    const rpe = num(get(r, cRpe));
    out.push({
      key: `${title}|${start}`,
      title,
      start,
      end,
      durationSec: cDur >= 0 ? parseDuration(get(r, cDur)) : 0,
      description: get(r, cDesc),
      exercise,
      superset: get(r, cSuper),
      exNote: get(r, cExNote),
      kind,
      weightKg: Math.round(weightKg * 1000) / 1000,
      reps,
      seconds,
      rpe: rpe >= 1 && rpe <= 10 ? rpe : undefined,
    });
  }
  return { rows: out, skipped };
};

/** Turns a Hevy or Strong export into workouts. Returns null when the text is neither. `known` is your own exercises already saved. */
export const parseLiftCsv = (text: string, opts: { unit: 'kg' | 'lb'; weightKg?: number; known?: Exercise[] }): LiftCsvResult | null => {
  const table = readCsv(text);
  const format = detectLiftCsv(table);
  if (!format) return null;
  const { rows, skipped } = toRows(table, format, opts.unit);
  const index = buildIndex([...(opts.known ?? []), ...allExercises()]);
  const created = new Map<string, Exercise>();
  const taken = new Set([...index.exact.values()].map((e) => e.id));
  let matched = 0;
  const resolve = (name: string): Exercise => {
    const hit = matchExercise(name, index);
    if (hit) {
      matched++;
      return hit;
    }
    const k = keyOf(tokensOf(name));
    const made = created.get(k);
    if (made) return made;
    let id = `custom-${slug(name)}`;
    for (let n = 2; taken.has(id); n++) id = `custom-${slug(name)}-${n}`;
    taken.add(id);
    const ex: Exercise = { id, name: name.replace(/\s+/g, ' ').trim().slice(0, 60), muscle: guessMuscle(name), equipment: guessEquipment(name), custom: true };
    created.set(k, ex);
    return ex;
  };

  const byWorkout = new Map<string, Row[]>();
  for (const r of rows) byWorkout.set(r.key, [...(byWorkout.get(r.key) ?? []), r]);

  const workouts: WorkoutSession[] = [];
  for (const list of byWorkout.values()) {
    const first = list[0];
    const logs = new Map<string, ExerciseLog & { superset: string }>();
    for (const r of list) {
      const ex = resolve(r.exercise);
      const cur = logs.get(ex.id) ?? { exerciseId: ex.id, name: ex.name, sets: [] as SetLog[], superset: r.superset };
      const set: SetLog = { reps: r.seconds > 0 && r.reps <= 0 ? 0 : r.reps, weightKg: r.weightKg, done: true };
      if (r.kind !== 'normal') set.kind = r.kind;
      if (r.rpe) set.rpe = r.rpe;
      if (set.reps <= 0 && r.seconds > 0) set.seconds = r.seconds;
      cur.sets.push(set);
      if (r.exNote && !cur.note) cur.note = r.exNote.slice(0, 500);
      logs.set(ex.id, cur);
    }
    const exercises: ExerciseLog[] = [...logs.values()].map(({ superset, ...rest }) => ({ ...rest, ...(superset ? { group: `ss-${superset}` } : {}) }));
    // A superset needs two or more exercises sharing the id; a lone one is just an exercise.
    const counts = new Map<string, number>();
    for (const e of exercises) if (e.group) counts.set(e.group, (counts.get(e.group) ?? 0) + 1);
    for (const e of exercises) if (e.group && (counts.get(e.group) ?? 0) < 2) delete e.group;
    const sets = exercises.reduce((n, e) => n + e.sets.filter(hasWork).length, 0);
    const seconds = first.durationSec || (Number.isFinite(first.end) && first.end > first.start ? Math.round((first.end - first.start) / 1000) : 0) || sets * 150;
    const minutes = Math.max(1, Math.round(seconds / 60));
    workouts.push({
      id: `imp-lift-${format}-${first.start}`,
      type: 'Strength',
      timestamp: new Date(first.start).toISOString(),
      startedAt: first.start,
      durationMinutes: minutes,
      durationSec: seconds,
      avgHeartRate: 0,
      caloriesBurned: Math.round(estimateCalories('Strength', minutes, opts.weightKg ?? 75)),
      isManualEntry: true,
      notes: first.description ? first.description.slice(0, 500) : undefined,
      title: first.title,
      exercises,
      importedFrom: format === 'hevy' ? 'Hevy export' : 'Strong export',
    });
  }
  workouts.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  return { format, workouts, created: [...created.values()], matched, skippedRows: skipped };
};

// ----- Writing the Hevy layout -----

const q = (s: string | number): string => {
  const t = String(s);
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

const hevyWhen = (ms: number): string => {
  const d = new Date(ms);
  const mon = Object.keys(MONTHS)[d.getMonth()];
  return `${d.getDate()} ${mon[0].toUpperCase()}${mon.slice(1)} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const HEVY_HEADER = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe';

/** Your lifting workouts in Hevy's export layout (weights in kg), so they can be read by Hevy-compatible tools or kept as a plain file. */
export const toHevyCsv = (workouts: WorkoutSession[]): string => {
  const lines = [HEVY_HEADER];
  const groups = new Map<string, number>();
  for (const w of [...workouts].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))) {
    const start = w.startedAt ?? Date.parse(w.timestamp);
    if (!Number.isFinite(start)) continue;
    const end = start + (w.durationSec ?? w.durationMinutes * 60) * 1000;
    for (const ex of w.exercises ?? []) {
      const sets = ex.sets.filter(hasWork);
      if (!sets.length) continue;
      let superset = '';
      if (ex.group) {
        if (!groups.has(`${w.id}|${ex.group}`)) groups.set(`${w.id}|${ex.group}`, groups.size);
        superset = String(groups.get(`${w.id}|${ex.group}`));
      }
      sets.forEach((s, i) => {
        const kind = kindOf(s);
        lines.push(
          [
            q(w.title || w.planDayTitle || 'Workout'),
            q(hevyWhen(start)),
            q(hevyWhen(end)),
            q(w.notes ?? ''),
            q(ex.name),
            superset,
            q(ex.note ?? ''),
            i,
            kind === 'drop' ? 'dropset' : kind,
            s.weightKg > 0 ? Math.round(s.weightKg * 100) / 100 : '',
            s.reps > 0 ? s.reps : '',
            '',
            (s.seconds ?? 0) > 0 ? s.seconds : '',
            s.rpe ?? '',
          ].join(',')
        );
      });
    }
  }
  return lines.join('\n') + '\n';
};
