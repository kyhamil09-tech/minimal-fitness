import { Exercise, MuscleGroup, Routine, RoutineSet } from '../types/tracking';
import { getExercise } from '../data/exercises';
import { LIBRARY_GROUPS, allExercises } from '../data/exercises';
import { addCustomExercise } from './lifting';
import { cleanDays } from './liftSchedule';
import { makeId } from './ids';

/**
 * Sharing a routine as text: a readable list for the person, and a code that another phone can read back in. The code carries the name,
 * the days, the exercises (with the ones you made yourself, so they exist on the other phone) and the planned sets. Nothing is uploaded:
 * it is just text you send however you like.
 */

const PREFIX = 'KYFIT-ROUTINE-1:';
const CODE_RE = /KYFIT-ROUTINE-1:[A-Za-z0-9_-]+/;
const MAX_EXERCISES = 40;
const MAX_SETS = 30;

const B64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const unB64 = (s: string): string => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

type Row = [number, number, number?, string?];

interface Wire {
  v: 1;
  n: string;
  d?: number[];
  e: { i: string; n: string; m?: string; q?: string; c?: 1; t?: 1; s: Row[] }[];
}

export const encodeRoutine = (r: Pick<Routine, 'name' | 'exerciseIds' | 'targets' | 'days'>): string => {
  const e: Wire['e'] = [];
  for (const id of r.exerciseIds) {
    const ex = getExercise(id);
    if (!ex) continue;
    const sets = (r.targets?.[id] ?? []).map((s): Row => [s.reps, Math.round(s.weightKg * 100) / 100, ...(s.seconds || s.kind ? [s.seconds ?? 0] : []), ...(s.kind && s.kind !== 'normal' ? [s.kind] : [])] as Row);
    e.push({ i: ex.id, n: ex.name, ...(ex.custom ? { m: ex.muscle, q: ex.equipment, c: 1 as const } : {}), ...(ex.timed ? { t: 1 as const } : {}), s: sets });
  }
  const wire: Wire = { v: 1, n: r.name, ...(r.days?.length ? { d: cleanDays(r.days) } : {}), e };
  return PREFIX + B64(JSON.stringify(wire));
};

export interface DecodedRoutine {
  name: string;
  days: number[];
  exercises: { id: string; name: string; muscle?: MuscleGroup; equipment?: Exercise['equipment']; custom: boolean; timed: boolean; sets: RoutineSet[] }[];
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const nonNeg = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0);

/** Finds a routine code in pasted text and reads it. Returns null when there is none or it is not valid. */
export const decodeRoutine = (text: string): DecodedRoutine | null => {
  const m = CODE_RE.exec(text);
  if (!m) return null;
  try {
    const w = JSON.parse(unB64(m[0].slice(PREFIX.length))) as Wire;
    if (!w || w.v !== 1 || !Array.isArray(w.e)) return null;
    const exercises: DecodedRoutine['exercises'] = [];
    for (const x of w.e.slice(0, MAX_EXERCISES)) {
      const id = str(x?.i, 80);
      const name = str(x?.n, 60);
      if (!id || !name) continue;
      const sets: RoutineSet[] = (Array.isArray(x.s) ? x.s.slice(0, MAX_SETS) : []).map((row) => {
        const kind = typeof row?.[3] === 'string' && ['warmup', 'drop', 'failure'].includes(row[3]) ? (row[3] as RoutineSet['kind']) : undefined;
        const seconds = nonNeg(row?.[2], 7200);
        return { reps: Math.round(nonNeg(row?.[0], 1000)), weightKg: nonNeg(row?.[1], 2000), ...(seconds ? { seconds: Math.round(seconds) } : {}), ...(kind ? { kind } : {}) };
      });
      const muscle = LIBRARY_GROUPS.includes(x.m as MuscleGroup) ? (x.m as MuscleGroup) : undefined;
      exercises.push({ id, name, muscle, equipment: typeof x.q === 'string' ? (x.q as Exercise['equipment']) : undefined, custom: x.c === 1, timed: x.t === 1, sets });
    }
    const name = str(w.n, 60);
    if (!name || exercises.length === 0) return null;
    return { name, days: cleanDays(w.d), exercises };
  } catch {
    return null;
  }
};

/**
 * Turns a decoded routine into one of yours. An exercise the app knows is used as it is; one with the same name is matched by name; one
 * you do not have is added as an exercise of your own. Returns the routine and the updated list of your own exercises.
 */
export const importRoutine = (d: DecodedRoutine, custom: Exercise[]): { routine: Routine; custom: Exercise[] } => {
  let list = custom;
  const ids: string[] = [];
  const targets: Record<string, RoutineSet[]> = {};
  for (const x of d.exercises) {
    let id: string | undefined;
    if (getExercise(x.id) && (!x.custom || getExercise(x.id)?.name.toLowerCase() === x.name.toLowerCase())) id = x.id;
    if (!id) id = allExercises().concat(list).find((e) => e.name.toLowerCase() === x.name.toLowerCase())?.id;
    if (!id) {
      const made = addCustomExercise(list, { name: x.name, muscle: x.muscle ?? 'Full Body', equipment: x.equipment ?? 'Other', timed: x.timed });
      if ('error' in made) continue;
      list = made.list;
      id = made.exercise.id;
    }
    if (ids.includes(id)) continue;
    ids.push(id);
    if (x.sets.length) targets[id] = x.sets;
  }
  const routine: Routine = { id: makeId('r'), name: d.name, exerciseIds: ids, ...(Object.keys(targets).length ? { targets } : {}), ...(d.days.length ? { days: d.days } : {}) };
  return { routine, custom: list };
};

/** The message to send: a readable list, then the code. */
export const routineShareText = (r: Pick<Routine, 'name' | 'exerciseIds' | 'targets' | 'days'>, show: (kg: number) => string): string => {
  const lines = [`${r.name} (a Minimal Fitness routine)`, ''];
  for (const id of r.exerciseIds) {
    const ex = getExercise(id);
    if (!ex) continue;
    const t = r.targets?.[id];
    const first = t?.[0];
    const same = !!t && t.every((s) => s.reps === first?.reps && s.weightKg === first?.weightKg);
    const detail = !t?.length ? '' : first?.seconds && same ? ` ${t.length} × ${first.seconds} s` : same && first ? ` ${t.length} × ${first.reps}${first.weightKg > 0 ? ` at ${show(first.weightKg)}` : ''}` : ` ${t.length} sets`;
    lines.push(`• ${ex.name}${detail}`);
  }
  lines.push('', 'To add it: in Minimal Fitness open Lift, tap Import a routine and paste this message.', '', encodeRoutine(r));
  return lines.join('\n');
};
