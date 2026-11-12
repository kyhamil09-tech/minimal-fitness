import { ExerciseLog, UnitSystem } from '../types/tracking';
import { WorkoutSession } from '../types/health';
import { isWorkingSet } from './sets';
import { KG_PER_LB } from './units';

/**
 * Multi-week programs. A program is a rotation of workouts (A and B, or Push Pull Legs...) with a rule for what to lift each time and
 * how that changes from one session to the next:
 *  - linear: the same sets and reps every time, a little more weight after each session you complete (add 2.5 kg, 3 fails in a row take
 *    10% off);
 *  - 5/3/1: main lifts worked from a training max in a four-week wave (5s, 3s, 5/3/1, then a lighter week), the training max going up
 *    when the cycle ends;
 *  - double progression: a range of reps (8 to 12); when every set reaches the top, the weight goes up and the reps start again.
 * Everything here is plain arithmetic on what the person logged. Weights are kept in kg like everywhere else.
 */

export type Scheme =
  | { kind: 'linear'; sets: number; reps: number; inc: number; incLb: number }
  | { kind: 'five31'; part: 'upper' | 'lower' }
  | { kind: 'double'; sets: number; min: number; max: number; inc: number; incLb: number };

export interface ProgramExercise {
  id: string;
  scheme: Scheme;
}

export interface ProgramDay {
  name: string;
  exercises: ProgramExercise[];
}

export interface ProgramDef {
  id: string;
  name: string;
  blurb: string;
  level: 'Beginner' | 'Intermediate';
  /** Workouts in a week; the days rotate through {@link days} in order. */
  sessionsPerWeek: number;
  /** Weeks before the pattern starts again (4 for 5/3/1). */
  cycleWeeks: number;
  /** Which weeks of the cycle (0 = first) are lighter. */
  deloadWeeks: number[];
  /** What the main lifts are asked for at the start: a weight you can work with, or a training max. */
  setup: 'start' | 'max';
  days: ProgramDay[];
}

export interface ProgramState {
  programId: string;
  startedAt: number;
  /** Workouts finished or skipped so far: the next one is number `done`. */
  done: number;
  /** Per exercise: the working weight, or the training max for 5/3/1 lifts (kg). */
  weights: Record<string, number>;
  /** Linear lifts: failed sessions in a row. */
  fails: Record<string, number>;
}

const lin = (id: string, sets: number, reps: number, inc = 2.5, incLb = 5): ProgramExercise => ({ id, scheme: { kind: 'linear', sets, reps, inc, incLb } });
const dbl = (id: string, sets: number, min: number, max: number, inc = 2.5, incLb = 5): ProgramExercise => ({ id, scheme: { kind: 'double', sets, min, max, inc, incLb } });
const five = (id: string, part: 'upper' | 'lower'): ProgramExercise => ({ id, scheme: { kind: 'five31', part } });

export const PROGRAMS: ProgramDef[] = [
  {
    id: 'linear-5x5',
    name: 'Linear 5×5',
    blurb: 'Two workouts, A and B, three times a week. Five sets of five on the big lifts, a little more weight every session you complete. The classic way to start.',
    level: 'Beginner',
    sessionsPerWeek: 3,
    cycleWeeks: 12,
    deloadWeeks: [],
    setup: 'start',
    days: [
      { name: 'Workout A', exercises: [lin('squat', 5, 5, 2.5), lin('bench-press', 5, 5, 2.5), lin('barbell-row', 5, 5, 2.5)] },
      { name: 'Workout B', exercises: [lin('squat', 5, 5, 2.5), lin('ohp', 5, 5, 2.5), lin('deadlift', 1, 5, 5, 10)] },
    ],
  },
  {
    id: 'five31',
    name: '5/3/1',
    blurb: 'Four lifts, one a day, four days a week. Each lift follows a four-week wave (sets of 5, then 3, then 5/3/1, then a lighter week) from a training max that goes up each cycle.',
    level: 'Intermediate',
    sessionsPerWeek: 4,
    cycleWeeks: 4,
    deloadWeeks: [3],
    setup: 'max',
    days: [
      { name: 'Overhead press', exercises: [five('ohp', 'upper'), dbl('chin-up', 3, 8, 12), dbl('lateral-raise', 3, 10, 15, 1, 2.5)] },
      { name: 'Deadlift', exercises: [five('deadlift', 'lower'), dbl('leg-curl', 3, 10, 15), dbl('hanging-leg-raise', 3, 8, 15, 0, 0)] },
      { name: 'Bench press', exercises: [five('bench-press', 'upper'), dbl('db-row', 3, 8, 12), dbl('tricep-pushdown', 3, 10, 15)] },
      { name: 'Squat', exercises: [five('squat', 'lower'), dbl('leg-press', 3, 10, 15, 5, 10), dbl('cable-crunch', 3, 10, 15)] },
    ],
  },
  {
    id: 'ppl-6',
    name: 'Push Pull Legs ×2',
    blurb: 'Six days: push, pull and legs, twice a week. Three sets in a rep range on every exercise; when you hit the top of the range on every set, the weight goes up. A lighter sixth week every cycle.',
    level: 'Intermediate',
    sessionsPerWeek: 6,
    cycleWeeks: 6,
    deloadWeeks: [5],
    setup: 'start',
    days: [
      { name: 'Push', exercises: [dbl('bench-press', 3, 6, 10), dbl('ohp', 3, 8, 12), dbl('incline-db-press', 3, 8, 12), dbl('lateral-raise', 3, 10, 15, 1, 2.5), dbl('tricep-pushdown', 3, 10, 15)] },
      { name: 'Pull', exercises: [dbl('barbell-row', 3, 6, 10), dbl('lat-pulldown', 3, 8, 12), dbl('seated-row', 3, 8, 12), dbl('face-pull', 3, 12, 20, 2.5, 5), dbl('db-curl', 3, 8, 12, 1, 2.5)] },
      { name: 'Legs', exercises: [dbl('squat', 3, 6, 10, 2.5, 5), dbl('rdl', 3, 8, 12), dbl('leg-press', 3, 10, 15, 5, 10), dbl('leg-curl', 3, 10, 15), dbl('calf-raise', 3, 10, 15)] },
      { name: 'Push', exercises: [dbl('ohp', 3, 6, 10), dbl('db-bench-press', 3, 8, 12), dbl('chest-dip', 3, 8, 12, 2.5, 5), dbl('lateral-raise', 3, 10, 15, 1, 2.5), dbl('skull-crusher', 3, 10, 15, 1, 2.5)] },
      { name: 'Pull', exercises: [dbl('pull-up', 3, 6, 10, 2.5, 5), dbl('db-row', 3, 8, 12), dbl('lat-pulldown', 3, 10, 15), dbl('face-pull', 3, 12, 20, 2.5, 5), dbl('hammer-curl', 3, 8, 12, 1, 2.5)] },
      { name: 'Legs', exercises: [dbl('front-squat', 3, 6, 10), dbl('hip-thrust', 3, 8, 12, 5, 10), dbl('bulgarian-split-squat', 3, 8, 12, 2.5, 5), dbl('leg-extension', 3, 10, 15), dbl('calf-raise', 3, 10, 15)] },
    ],
  },
  {
    id: 'upper-lower-4',
    name: 'Upper / Lower',
    blurb: 'Four days: upper, lower, upper, lower. Rep ranges with double progression, and a lighter fourth week every cycle. A good middle ground if six days is too many.',
    level: 'Intermediate',
    sessionsPerWeek: 4,
    cycleWeeks: 4,
    deloadWeeks: [3],
    setup: 'start',
    days: [
      { name: 'Upper A', exercises: [dbl('bench-press', 4, 5, 8), dbl('barbell-row', 4, 6, 10), dbl('ohp', 3, 8, 12), dbl('lat-pulldown', 3, 8, 12), dbl('tricep-pushdown', 3, 10, 15), dbl('db-curl', 3, 10, 15, 1, 2.5)] },
      { name: 'Lower A', exercises: [dbl('squat', 4, 5, 8, 2.5, 5), dbl('rdl', 3, 8, 12), dbl('leg-press', 3, 10, 15, 5, 10), dbl('leg-curl', 3, 10, 15), dbl('calf-raise', 4, 10, 15)] },
      { name: 'Upper B', exercises: [dbl('ohp', 4, 5, 8), dbl('pull-up', 4, 5, 10, 2.5, 5), dbl('incline-db-press', 3, 8, 12), dbl('seated-row', 3, 8, 12), dbl('lateral-raise', 3, 10, 15, 1, 2.5), dbl('hammer-curl', 3, 10, 15, 1, 2.5)] },
      { name: 'Lower B', exercises: [dbl('deadlift', 3, 4, 6, 5, 10), dbl('front-squat', 3, 6, 10), dbl('bulgarian-split-squat', 3, 8, 12), dbl('hip-thrust', 3, 8, 12, 5, 10), dbl('hanging-leg-raise', 3, 8, 15, 0, 0)] },
    ],
  },
  {
    id: 'full-body-3',
    name: 'Full body ×3',
    blurb: 'Three full-body workouts a week, A and B alternating, in rep ranges you grow into. Short, simple and easy to keep up. A lighter fourth week every cycle.',
    level: 'Beginner',
    sessionsPerWeek: 3,
    cycleWeeks: 4,
    deloadWeeks: [3],
    setup: 'start',
    days: [
      { name: 'Full body A', exercises: [dbl('squat', 3, 8, 12, 2.5, 5), dbl('bench-press', 3, 8, 12), dbl('barbell-row', 3, 8, 12), dbl('cable-crunch', 3, 10, 15)] },
      { name: 'Full body B', exercises: [dbl('rdl', 3, 8, 12), dbl('ohp', 3, 8, 12), dbl('lat-pulldown', 3, 8, 12), dbl('lunge', 3, 8, 12, 2.5, 5)] },
    ],
  },
];

export const getProgram = (id: string): ProgramDef | undefined => PROGRAMS.find((p) => p.id === id);

/** The 5/3/1 wave: percent of the training max and the reps for each of the three sets, by week of the cycle. The last set of weeks 1 to 3 is "as many as you can". */
const WAVE: { pct: number[]; reps: number[]; plus: boolean }[] = [
  { pct: [65, 75, 85], reps: [5, 5, 5], plus: true },
  { pct: [70, 80, 90], reps: [3, 3, 3], plus: true },
  { pct: [75, 85, 95], reps: [5, 3, 1], plus: true },
  { pct: [40, 50, 60], reps: [5, 5, 5], plus: false },
];

/** The lighter week: this much of the usual weight, and half the sets. */
const DELOAD_WEIGHT = 0.8;

/** A weight rounded to the nearest plate jump (2.5 kg, or 5 lb for imperial), kept in kg. */
export const roundLoad = (kg: number, units: UnitSystem): number => {
  if (!(kg > 0)) return 0;
  if (units === 'imperial') {
    const lb = Math.round(kg / KG_PER_LB / 5) * 5;
    return Math.round(lb * KG_PER_LB * 100) / 100;
  }
  return Math.round(kg / 2.5) * 2.5;
};

export interface SessionInfo {
  /** 0-based number of this workout in the program. */
  index: number;
  /** 1-based week since the start. */
  week: number;
  /** 0-based week within the cycle. */
  cycleWeek: number;
  /** 1-based cycle. */
  cycle: number;
  day: ProgramDay;
  deload: boolean;
}

export const sessionInfo = (def: ProgramDef, done: number): SessionInfo => {
  const week0 = Math.floor(done / def.sessionsPerWeek);
  const cycleWeek = week0 % def.cycleWeeks;
  return {
    index: done,
    week: week0 + 1,
    cycleWeek,
    cycle: Math.floor(week0 / def.cycleWeeks) + 1,
    day: def.days[done % def.days.length],
    deload: def.deloadWeeks.includes(cycleWeek),
  };
};

export interface PlannedSet {
  reps: number;
  weightKg: number;
  /** The last set of a 5/3/1 week: as many reps as possible. */
  plus?: boolean;
}

export interface PlannedExercise {
  exerciseId: string;
  sets: PlannedSet[];
  /** A short line of advice for this exercise this time. */
  note: string;
}

const planExercise = (def: ProgramDef, state: ProgramState, info: SessionInfo, ex: ProgramExercise, units: UnitSystem): PlannedExercise => {
  const base = state.weights[ex.id] ?? 0;
  const s = ex.scheme;
  if (s.kind === 'five31') {
    const w = WAVE[Math.min(info.cycleWeek, WAVE.length - 1)];
    const sets = w.pct.map((p, i): PlannedSet => ({ reps: w.reps[i], weightKg: roundLoad((base * p) / 100, units), ...(w.plus && i === 2 ? { plus: true } : {}) }));
    return { exerciseId: ex.id, sets, note: info.deload ? 'Lighter week: keep it easy.' : 'Last set: as many good reps as you can.' };
  }
  const deload = info.deload;
  const w = deload ? roundLoad(base * DELOAD_WEIGHT, units) : base;
  if (s.kind === 'linear') {
    const n = deload ? Math.max(1, Math.ceil(s.sets / 2)) : s.sets;
    return { exerciseId: ex.id, sets: Array.from({ length: n }, () => ({ reps: s.reps, weightKg: w })), note: `${n} × ${s.reps}. Finish every rep and the weight goes up next time.` };
  }
  const n = deload ? Math.max(1, Math.ceil(s.sets / 2)) : s.sets;
  return { exerciseId: ex.id, sets: Array.from({ length: n }, () => ({ reps: s.min, weightKg: w })), note: `${n} × ${s.min}–${s.max}. Reach ${s.max} on every set and the weight goes up next time.` };
};

/** What to lift in the next workout. */
export const planSession = (def: ProgramDef, state: ProgramState, units: UnitSystem): { info: SessionInfo; exercises: PlannedExercise[] } => {
  const info = sessionInfo(def, state.done);
  return { info, exercises: info.day.exercises.map((e) => planExercise(def, state, info, e, units)) };
};

/** The planned workout as the sets the workout screen opens with. */
export const plannedLogs = (exercises: PlannedExercise[], nameOf: (id: string) => string): ExerciseLog[] =>
  exercises.map((e) => ({
    exerciseId: e.exerciseId,
    name: nameOf(e.exerciseId),
    sets: e.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg, done: false })),
    // The 5/3/1 top set is open-ended: say so on the exercise.
    ...(e.sets.some((s) => s.plus) ? { note: 'Last set: as many good reps as you can.' } : {}),
  }));

/** The lifts that need a starting weight or training max (the main lifts, not the accessories). */
export const setupExercises = (def: ProgramDef): string[] => {
  const out: string[] = [];
  for (const d of def.days) for (const e of d.exercises) if ((e.scheme.kind === 'linear' || e.scheme.kind === 'five31') && !out.includes(e.id)) out.push(e.id);
  return out;
};

/** A first guess at a starting weight from a lift's best estimated one-rep max (kg): 90% as a training max, or 65% to start linear lifts. */
export const suggestStart = (def: ProgramDef, e1rmKg: number, units: UnitSystem): number => (e1rmKg > 0 ? roundLoad(e1rmKg * (def.setup === 'max' ? 0.9 : 0.65), units) : 0);

export const startProgram = (def: ProgramDef, weights: Record<string, number>, now: number = Date.now()): ProgramState => ({ programId: def.id, startedAt: now, done: 0, weights: { ...weights }, fails: {} });

const cycleSessions = (def: ProgramDef) => def.sessionsPerWeek * def.cycleWeeks;

/** Moves to the next workout; at the end of a 5/3/1 cycle the training maxes go up. */
const advance = (def: ProgramDef, state: ProgramState, units: UnitSystem): ProgramState => {
  const next: ProgramState = { ...state, done: state.done + 1, weights: { ...state.weights }, fails: { ...state.fails } };
  if (next.done % cycleSessions(def) === 0) {
    for (const d of def.days)
      for (const e of d.exercises) {
        if (e.scheme.kind !== 'five31' || !(next.weights[e.id] > 0)) continue;
        const kg = e.scheme.part === 'upper' ? 2.5 : 5;
        const lb = e.scheme.part === 'upper' ? 5 : 10;
        next.weights[e.id] = units === 'imperial' ? roundLoad(next.weights[e.id] + lb * KG_PER_LB, units) : next.weights[e.id] + kg;
      }
  }
  return next;
};

/** Skips a workout: nothing changes except which one is next. */
export const skipSession = (def: ProgramDef, state: ProgramState, units: UnitSystem): ProgramState => advance(def, state, units);

/** Dumbbells and cables move in small steps: round to half a kilo (or a pound) rather than to a barbell plate jump. */
const finer = (kg: number, units: UnitSystem): number => (units === 'imperial' ? Math.round(Math.round(kg / KG_PER_LB) * KG_PER_LB * 100) / 100 : Math.round(kg * 2) / 2);

const incOf = (s: { inc: number; incLb: number }, units: UnitSystem): number => (units === 'imperial' ? s.incLb * KG_PER_LB : s.inc);

/**
 * Applies a finished workout: linear lifts go up after a completed session (and drop 10% after three misses in a row), double lifts go
 * up once every set reached the top of the range (otherwise they stay at what was actually lifted).
 */
export const completeSession = (def: ProgramDef, state: ProgramState, workout: Pick<WorkoutSession, 'exercises'>, units: UnitSystem): ProgramState => {
  const plan = planSession(def, state, units);
  const next = advance(def, state, units);
  for (const planned of plan.exercises) {
    const ex = plan.info.day.exercises.find((e) => e.id === planned.exerciseId);
    const log = workout.exercises?.find((l) => l.exerciseId === planned.exerciseId);
    if (!ex || !log) continue;
    const work = log.sets.filter((s) => isWorkingSet(s) && s.reps > 0);
    if (work.length === 0) continue;
    const top = Math.max(...work.map((s) => s.weightKg));
    const s = ex.scheme;
    if (s.kind === 'linear') {
      const target = planned.sets[0];
      const ok = work.length >= planned.sets.length && work.every((x) => x.reps >= target.reps) && top >= target.weightKg - 0.01;
      if (plan.info.deload) continue;
      if (ok) {
        next.weights[ex.id] = roundLoad(target.weightKg + incOf(s, units), units);
        next.fails[ex.id] = 0;
      } else {
        const fails = (state.fails[ex.id] ?? 0) + 1;
        if (fails >= 3) {
          next.weights[ex.id] = roundLoad(target.weightKg * 0.9, units);
          next.fails[ex.id] = 0;
        } else next.fails[ex.id] = fails;
      }
    } else if (s.kind === 'double') {
      if (plan.info.deload) continue;
      const ok = work.length >= planned.sets.length && work.every((x) => x.reps >= s.max);
      const base = top > 0 ? top : state.weights[ex.id] ?? 0;
      next.weights[ex.id] = ok && base > 0 && incOf(s, units) > 0 ? finer(base + incOf(s, units), units) : base;
    }
  }
  return next;
};

/** "Week 2 · Workout B", or for a repeating cycle "Cycle 2 · Week 3". */
export const progressText = (def: ProgramDef, state: ProgramState): string => {
  const i = sessionInfo(def, state.done);
  return def.cycleWeeks <= 4 ? `Cycle ${i.cycle} · Week ${i.cycleWeek + 1} of ${def.cycleWeeks}` : `Week ${i.week} of ${def.cycleWeeks}`;
};

export const sessionsTotal = (def: ProgramDef): number => def.sessionsPerWeek * def.cycleWeeks;
