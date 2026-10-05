import { WorkoutSession } from '../types/health';
import { Exercise, ExerciseLog, MuscleGroup, UnitSystem } from '../types/tracking';
import { getExercise, MUSCLE_GROUPS } from '../data/exercises';
import { estimateOneRepMax } from './calc';
import { addDays, toDateKey } from './dates';
import { KG_PER_LB } from './units';

/**
 * The progression layer for lifting: what to try next on each exercise (double progression), the estimated one-rep max over time,
 * hard sets per muscle group each week, and a plate calculator. Everything is worked out from the sets you have logged.
 */

export interface LiftSession {
  at: number;
  /** The set with the highest estimated one-rep max that day. */
  top: { weightKg: number; reps: number };
  e1rm: number;
  sets: { weightKg: number; reps: number }[];
}

const doneSets = (log: ExerciseLog) => log.sets.filter((s) => s.done && s.reps > 0);

/** Every session of one exercise, oldest first. */
export const liftHistory = (workouts: WorkoutSession[], exerciseId: string): LiftSession[] => {
  const out: LiftSession[] = [];
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      if (ex.exerciseId !== exerciseId) continue;
      const sets = doneSets(ex).map((s) => ({ weightKg: s.weightKg, reps: s.reps }));
      if (!sets.length) continue;
      const scored = sets.map((s) => ({ s, e: s.weightKg > 0 ? estimateOneRepMax(s.weightKg, s.reps) : 0 }));
      const best = scored.reduce((a, b) => (b.e > a.e ? b : a));
      out.push({ at: w.startedAt ?? 0, top: best.s, e1rm: best.e, sets });
    }
  }
  return out.sort((a, b) => a.at - b.at);
};

/** Exercises with at least one weighted session, most recently trained first. */
export const trainedLifts = (workouts: WorkoutSession[]): { exerciseId: string; name: string; sessions: number; lastAt: number }[] => {
  const map = new Map<string, { exerciseId: string; name: string; sessions: number; lastAt: number }>();
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      if (!doneSets(ex).some((s) => s.weightKg > 0)) continue;
      const cur = map.get(ex.exerciseId) ?? { exerciseId: ex.exerciseId, name: ex.name, sessions: 0, lastAt: 0 };
      cur.sessions += 1;
      cur.lastAt = Math.max(cur.lastAt, w.startedAt ?? 0);
      map.set(ex.exerciseId, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
};

export type SuggestionKind = 'weight' | 'reps' | 'repeat' | 'deload' | 'first';

export interface Suggestion {
  kind: SuggestionKind;
  weightKg: number;
  reps: number;
  /** One plain sentence on why. */
  reason: string;
}

/** Reps you work between: heavy barbell lifts sit lower than machines and dumbbells. */
export const repRange = (equipment: Exercise['equipment'] | undefined): [number, number] => (equipment === 'Barbell' ? [5, 8] : [8, 12]);

/** The smallest sensible jump for the equipment, in kg (5 lb for a barbell in pounds, 2.5 kg in kilograms). */
export const incrementKg = (equipment: Exercise['equipment'] | undefined, units: UnitSystem): number => {
  const small = equipment === 'Dumbbell' || equipment === 'Kettlebell';
  if (units === 'imperial') return (small ? 5 : 5) * KG_PER_LB;
  return small ? 2 : 2.5;
};

/** Rounds to the nearest step so a suggestion lands on weights that exist (2.5 kg or 5 lb). */
export const roundToStep = (kg: number, units: UnitSystem, stepKg?: number): number => {
  const step = stepKg ?? (units === 'imperial' ? 2.5 * KG_PER_LB : 1.25);
  return Math.round(kg / step) * step;
};

const fmt = (kg: number, units: UnitSystem) => {
  const v = units === 'imperial' ? kg / KG_PER_LB : kg;
  return `${Math.round(v * 10) / 10} ${units === 'imperial' ? 'lb' : 'kg'}`;
};

/**
 * Double progression: stay at a weight until every working set reaches the top of the rep range, then add the smallest jump and
 * start again at the bottom. Three sessions in a row at the same weight with no extra reps suggests a lighter, fresher restart.
 */
export const suggestNext = (history: LiftSession[], exerciseId: string, units: UnitSystem): Suggestion | null => {
  const ex = getExercise(exerciseId);
  const [lo, hi] = repRange(ex?.equipment);
  const inc = incrementKg(ex?.equipment, units);
  const last = history[history.length - 1];
  if (!last) return null;
  const weights = last.sets.map((s) => s.weightKg);
  const topW = Math.max(...weights);

  // Bodyweight work: add a rep rather than weight.
  if (topW <= 0) {
    const reps = Math.min(...last.sets.map((s) => s.reps));
    return { kind: 'reps', weightKg: 0, reps: reps + 1, reason: `Last time your lowest set was ${reps} reps. Aim for ${reps + 1}.` };
  }

  const atTop = last.sets.filter((s) => s.weightKg === topW);
  const minReps = Math.min(...atTop.map((s) => s.reps));

  const sameWeight = history.slice(-3).filter((h) => Math.max(...h.sets.map((s) => s.weightKg)) === topW);
  if (sameWeight.length === 3) {
    const bestRepsEach = sameWeight.map((h) => Math.max(...h.sets.filter((s) => s.weightKg === topW).map((s) => s.reps)));
    if (bestRepsEach[2] <= bestRepsEach[0] && minReps < hi) {
      const lighter = roundToStep(topW * 0.9, units, inc / 2);
      return { kind: 'deload', weightKg: lighter, reps: hi, reason: `Three sessions at ${fmt(topW, units)} without more reps. Restart near ${fmt(lighter, units)} for ${hi} reps and build back up.` };
    }
  }

  if (minReps >= hi) {
    const next = topW + inc;
    return { kind: 'weight', weightKg: next, reps: lo, reason: `You got ${minReps} reps on every set at ${fmt(topW, units)}. Add weight: ${fmt(next, units)} for ${lo}.` };
  }
  const target = Math.min(hi, Math.max(minReps + 1, lo));
  return { kind: 'repeat', weightKg: topW, reps: target, reason: `Last time ${fmt(topW, units)} × ${minReps}. Try ${target} reps at the same weight.` };
};

export interface E1rmPoint {
  at: number;
  e1rm: number;
}

export const e1rmSeries = (history: LiftSession[]): E1rmPoint[] => history.filter((h) => h.e1rm > 0).map((h) => ({ at: h.at, e1rm: h.e1rm }));

/** Change in estimated 1RM between the first and latest of the last {@code n} sessions, in percent. */
export const e1rmChangePct = (history: LiftSession[], n = 6): number | null => {
  const pts = e1rmSeries(history).slice(-n);
  if (pts.length < 3) return null;
  const first = pts[0].e1rm;
  return first > 0 ? Math.round(((pts[pts.length - 1].e1rm - first) / first) * 1000) / 10 : null;
};

// ---------------------------------------------------------------------------------------------
// Weekly sets per muscle group
// ---------------------------------------------------------------------------------------------

export interface WeekSets {
  /** Monday of the week. */
  week: string;
  sets: Record<MuscleGroup, number>;
}

const mondayKey = (ms: number): string => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateKey(d);
};

const emptySets = (): Record<MuscleGroup, number> => Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0])) as Record<MuscleGroup, number>;

/** Completed sets of weighted or bodyweight work per muscle group for the last {@code weeks} weeks, oldest first. */
export const weeklySets = (workouts: WorkoutSession[], today: string, weeks = 8): WeekSets[] => {
  const thisMonday = mondayKey(new Date(today + 'T12:00:00').getTime());
  const out: WeekSets[] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ week: addDays(thisMonday, -7 * i), sets: emptySets() });
  const by = new Map(out.map((w) => [w.week, w]));
  for (const w of workouts) {
    if (!w.startedAt) continue;
    const row = by.get(mondayKey(w.startedAt));
    if (!row) continue;
    for (const ex of w.exercises ?? []) {
      const g = getExercise(ex.exerciseId)?.muscle;
      if (g) row.sets[g] += doneSets(ex).length;
    }
  }
  return out;
};

export type VolumeBand = 'low' | 'good' | 'high';

/** About 10 to 20 hard sets a week per muscle is the range most lifters grow in; fewer than 6 is maintenance at best. */
export const volumeBand = (sets: number): VolumeBand => (sets < 6 ? 'low' : sets <= 20 ? 'good' : 'high');

// ---------------------------------------------------------------------------------------------
// Plate calculator
// ---------------------------------------------------------------------------------------------

export const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
export const PLATES_LB = [45, 35, 25, 10, 5, 2.5];
export const BAR_KG = 20;
export const BAR_LB = 45;

export interface PlateResult {
  /** Plates on each side, heaviest first, in display units. */
  perSide: number[];
  /** What the loaded bar weighs, in display units. */
  loaded: number;
  /** How far the loaded bar is below the target (the target cannot be made exactly with these plates). */
  short: number;
}

/** Greedy loading, which is exact for the plate sets above. Works in display units (kg or lb). */
export const plateBreakdown = (target: number, bar: number, plates: number[]): PlateResult => {
  let left = Math.max(0, (target - bar) / 2);
  const perSide: number[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (left + 1e-9 >= p) {
      perSide.push(p);
      left -= p;
    }
  }
  const loaded = bar + perSide.reduce((s, p) => s + p, 0) * 2;
  return { perSide, loaded: Math.round(loaded * 100) / 100, short: Math.round(Math.max(0, target - loaded) * 100) / 100 };
};
