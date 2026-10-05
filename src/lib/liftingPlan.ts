import { PlanDay, WorkoutPlan } from '../types/tracking';
import { getExercise } from '../data/exercises';

export type LiftSplit = 'fullbody' | 'upperlower' | 'ppl' | 'bro';
export type LiftGoal = 'strength' | 'muscle' | 'general';
export type LiftGear = 'gym' | 'dumbbells' | 'bodyweight';
export type LiftLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export interface LiftingPlanInput {
  split: LiftSplit;
  /** Lifting days per week, 2 to 6. */
  daysPerWeek: number;
  goal: LiftGoal;
  gear: LiftGear;
  level: LiftLevel;
  /** Weeks in the plan, 4 to 16. */
  weeks: number;
}

export const SPLIT_INFO: Record<LiftSplit, { label: string; blurb: string; minDays: number; maxDays: number }> = {
  fullbody: { label: 'Full body', blurb: 'Every session trains the whole body. Best for 2 to 4 days a week and for beginners.', minDays: 2, maxDays: 4 },
  upperlower: { label: 'Upper / Lower', blurb: 'Alternate upper-body and lower-body days. A balanced choice for 3 to 5 days.', minDays: 2, maxDays: 5 },
  ppl: { label: 'Push / Pull / Legs', blurb: 'Pushing muscles, pulling muscles, then legs. Built for 3 to 6 days.', minDays: 3, maxDays: 6 },
  bro: { label: 'Body-part split', blurb: 'One main muscle group a day: chest, back, legs, shoulders, arms. For 4 to 6 days.', minDays: 4, maxDays: 6 },
};

export const GOAL_INFO: Record<LiftGoal, { label: string; blurb: string }> = {
  strength: { label: 'Get stronger', blurb: 'Fewer exercises, the big lifts first. Aim for 3 to 6 heavy reps.' },
  muscle: { label: 'Build muscle', blurb: 'More exercises and more variety. Aim for 8 to 12 reps.' },
  general: { label: 'General fitness', blurb: 'A balanced week with a walk on a rest day.' },
};

export const GEAR_INFO: Record<LiftGear, string> = { gym: 'Full gym', dumbbells: 'Dumbbells at home', bodyweight: 'Bodyweight only' };

type Slot =
  | 'squat' | 'hinge' | 'quad' | 'ham' | 'calves'
  | 'hpush' | 'vpush' | 'lateral' | 'triceps'
  | 'hpull' | 'vpull' | 'reardelt' | 'biceps' | 'traps' | 'core';

/** The exercises that can fill each slot, best first, for each kind of equipment. Variety comes from rotating through them. */
const POOLS: Record<LiftGear, Record<Slot, string[]>> = {
  gym: {
    squat: ['squat', 'front-squat', 'leg-press', 'hack-squat'],
    hinge: ['rdl', 'deadlift', 'hip-thrust', 'good-morning'],
    quad: ['leg-press', 'leg-extension', 'bulgarian-split-squat', 'lunge'],
    ham: ['leg-curl', 'seated-leg-curl', 'rdl', 'stiff-leg-deadlift'],
    calves: ['calf-raise', 'seated-calf-raise', 'calf-raise'],
    hpush: ['bench-press', 'incline-db-press', 'chest-press-machine', 'db-bench-press', 'incline-bench-press'],
    vpush: ['ohp', 'db-shoulder-press', 'machine-shoulder-press', 'arnold-press'],
    lateral: ['lateral-raise', 'cable-lateral-raise', 'front-raise'],
    triceps: ['tricep-pushdown', 'skull-crusher', 'overhead-tricep-ext', 'dip'],
    hpull: ['barbell-row', 'seated-row', 'db-row', 't-bar-row', 'chest-supported-row'],
    vpull: ['pull-up', 'lat-pulldown', 'close-grip-pulldown', 'chin-up'],
    reardelt: ['face-pull', 'rear-delt-fly', 'reverse-pec-deck'],
    biceps: ['barbell-curl', 'db-curl', 'hammer-curl', 'cable-curl', 'incline-db-curl'],
    traps: ['barbell-shrug', 'db-shrug', 'face-pull'],
    core: ['plank', 'hanging-leg-raise', 'cable-crunch', 'ab-wheel', 'crunch'],
  },
  dumbbells: {
    squat: ['goblet-squat', 'db-goblet-squat', 'sumo-squat', 'lunge'],
    hinge: ['db-rdl', 'db-hip-thrust', 'single-leg-rdl', 'db-swing'],
    quad: ['bulgarian-split-squat', 'lunge', 'step-up', 'reverse-lunge'],
    ham: ['db-rdl', 'single-leg-rdl', 'db-hip-thrust'],
    calves: ['db-calf-raise', 'single-leg-calf-raise'],
    hpush: ['db-bench-press', 'incline-db-press', 'floor-press', 'db-fly', 'push-up'],
    vpush: ['db-shoulder-press', 'arnold-press', 'seated-db-press', 'kb-press'],
    lateral: ['lateral-raise', 'front-raise'],
    triceps: ['overhead-tricep-ext', 'db-skull-crusher', 'tricep-kickback', 'diamond-push-up'],
    hpull: ['db-row', 'db-bent-row', 'chest-supported-row'],
    vpull: ['pull-up', 'db-row', 'chin-up'],
    reardelt: ['rear-delt-fly', 'db-shrug'],
    biceps: ['db-curl', 'hammer-curl', 'incline-db-curl', 'concentration-curl'],
    traps: ['db-shrug', 'rear-delt-fly'],
    core: ['plank', 'dead-bug', 'russian-twist', 'crunch'],
  },
  bodyweight: {
    squat: ['bodyweight-squat', 'split-squat', 'jump-squat', 'pistol-squat'],
    hinge: ['glute-bridge', 'single-leg-bridge', 'superman', 'frog-pump'],
    quad: ['split-squat', 'reverse-lunge', 'wall-sit', 'bodyweight-squat'],
    ham: ['single-leg-bridge', 'glute-bridge', 'frog-pump'],
    calves: ['single-leg-calf-raise'],
    hpush: ['push-up', 'decline-push-up', 'wide-push-up', 'diamond-push-up', 'incline-push-up'],
    vpush: ['pike-push-up', 'decline-push-up', 'push-up'],
    lateral: ['pike-push-up', 'incline-push-up'],
    triceps: ['diamond-push-up', 'bench-dip', 'dip'],
    hpull: ['inverted-row', 'superman', 'suspension-row'],
    vpull: ['pull-up', 'chin-up', 'inverted-row'],
    reardelt: ['superman', 'inverted-row', 'suspension-row'],
    biceps: ['chin-up', 'inverted-row'],
    traps: ['superman', 'inverted-row'],
    core: ['plank', 'crunch', 'dead-bug', 'mountain-climber', 'lying-leg-raise'],
  },
};

/** Extra work to top a session up when a thin pool (bodyweight shoulders, say) cannot fill every slot. */
const FILLERS: Record<LiftGear, string[]> = {
  gym: ['plank', 'cable-crunch', 'face-pull', 'calf-raise', 'hanging-leg-raise'],
  dumbbells: ['plank', 'db-curl', 'lateral-raise', 'db-calf-raise', 'russian-twist'],
  bodyweight: ['plank', 'push-up', 'glute-bridge', 'crunch', 'bodyweight-squat', 'superman'],
};

type Session = 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'chest' | 'back' | 'shoulders' | 'arms';

const RECIPES: Record<Session, Slot[]> = {
  full: ['squat', 'hpush', 'hpull', 'hinge', 'vpush', 'core'],
  upper: ['hpush', 'hpull', 'vpush', 'vpull', 'biceps', 'triceps'],
  lower: ['squat', 'hinge', 'quad', 'ham', 'calves', 'core'],
  push: ['hpush', 'vpush', 'hpush', 'lateral', 'triceps', 'triceps'],
  pull: ['vpull', 'hpull', 'hpull', 'reardelt', 'biceps', 'biceps'],
  legs: ['squat', 'hinge', 'quad', 'ham', 'calves', 'core'],
  chest: ['hpush', 'hpush', 'hpush', 'triceps', 'core'],
  back: ['vpull', 'hpull', 'hpull', 'reardelt', 'biceps'],
  shoulders: ['vpush', 'lateral', 'lateral', 'reardelt', 'traps'],
  arms: ['biceps', 'triceps', 'biceps', 'triceps', 'core'],
};

const SESSION_NAMES: Record<Session, string> = {
  full: 'Full body', upper: 'Upper body', lower: 'Lower body', push: 'Push', pull: 'Pull', legs: 'Legs',
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms',
};

const CYCLES: Record<LiftSplit, Session[]> = {
  fullbody: ['full', 'full', 'full', 'full', 'full', 'full'],
  upperlower: ['upper', 'lower', 'upper', 'lower', 'upper', 'lower'],
  ppl: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
  bro: ['chest', 'back', 'legs', 'shoulders', 'arms', 'legs'],
};

/** Weekdays (0 = Monday) for the lifting days, spread out so there is rest between hard days. */
const WEEKDAYS: Record<number, number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Picks the exercise for a slot that is not already in the session, rotating through the pool by `offset`. */
const pick = (pool: string[], offset: number, used: Set<string>): string | null => {
  for (let i = 0; i < pool.length; i++) {
    const id = pool[(offset + i) % pool.length];
    if (!used.has(id) && getExercise(id)) {
      used.add(id);
      return id;
    }
  }
  return null;
};

/** How many exercises a session has: the big lifts only for strength, more variety for muscle, a lighter day for beginners. */
const sessionSize = (goal: LiftGoal, level: LiftLevel, recipe: Slot[]): number => {
  const base = goal === 'strength' ? 4 : goal === 'muscle' ? 6 : 5;
  return Math.min(recipe.length, level === 'Beginner' ? Math.min(base, 5) : level === 'Advanced' ? base + (goal === 'muscle' ? 0 : 1) : base);
};

export const clampDays = (split: LiftSplit, days: number): number => Math.max(SPLIT_INFO[split].minDays, Math.min(SPLIT_INFO[split].maxDays, Math.round(days)));

/** The exercises for one session of a split, rotating the choices by `n` so repeated sessions are not identical. */
export const sessionExercises = (session: Session, input: Pick<LiftingPlanInput, 'goal' | 'gear' | 'level'>, n: number): string[] => {
  const recipe = RECIPES[session];
  const used = new Set<string>();
  const out: string[] = [];
  const size = sessionSize(input.goal, input.level, recipe);
  recipe.forEach((slot, i) => {
    if (out.length >= size) return;
    // The first exercise of a session (the main lift) rotates only every other repeat so strength work stays consistent.
    const offset = i === 0 ? Math.floor(n / 2) : n + i;
    const id = pick(POOLS[input.gear][slot], offset, used);
    if (id) out.push(id);
  });
  // A thin pool can leave a session short: top it up so no day is a token two-exercise workout.
  const minimum = Math.min(4, size);
  for (let i = 0; out.length < minimum && i < FILLERS[input.gear].length; i++) {
    const id = pick(FILLERS[input.gear], i, used);
    if (id) out.push(id);
  }
  return out;
};

/** Builds a week-by-week lifting plan: your split on the days you choose, a lighter deload week every fourth week. */
export const buildLiftingPlan = (input: LiftingPlanInput, now: number = Date.now()): WorkoutPlan => {
  const days = clampDays(input.split, input.daysPerWeek);
  const weeks = Math.max(4, Math.min(16, Math.round(input.weeks)));
  const sessions = CYCLES[input.split].slice(0, days);
  const weekdays = WEEKDAYS[days] ?? WEEKDAYS[6];

  const week = (w: number): PlanDay[] => {
    const deload = weeks >= 4 && w % 4 === 0;
    const seen: Record<string, number> = {};
    const total: Record<string, number> = {};
    for (const s of sessions) total[s] = (total[s] ?? 0) + 1;
    const out: PlanDay[] = [];
    sessions.forEach((s, i) => {
      const nth = (seen[s] = (seen[s] ?? -1) + 1);
      const name = SESSION_NAMES[s] + (total[s] > 1 ? ` ${LETTERS[nth]}` : '');
      out.push({
        day: weekdays[i] as PlanDay['day'],
        title: deload ? `${name} (deload)` : name,
        kind: 'strength',
        exerciseIds: sessionExercises(s, input, nth + Math.floor((w - 1) / 4)),
      });
    });
    const used = new Set<number>(out.map((d) => d.day));
    for (let d = 0; d < 7; d++) {
      if (used.has(d)) continue;
      out.push(
        input.goal === 'general' && d === 5
          ? { day: 5, title: 'Easy walk', kind: 'cardio', cardioType: 'Walking', targetMinutes: 30 }
          : { day: d as PlanDay['day'], title: 'Rest', kind: 'rest' }
      );
    }
    return out.sort((a, b) => a.day - b.day);
  };

  const weekly = Array.from({ length: weeks }, (_, i) => week(i + 1));
  const info = SPLIT_INFO[input.split];
  return {
    id: `plan-lift-${input.split}-${now}`,
    name: `${info.label}, ${days} days`,
    description: `${weeks} weeks of ${info.label.toLowerCase()} training, ${days} days a week (${GEAR_INFO[input.gear].toLowerCase()}). ${GOAL_INFO[input.goal].blurb} Every fourth week is a deload: use about 60% of your usual weight.`,
    weeks,
    level: input.level,
    days: weekly[0],
    weekly,
    isCustom: true,
  };
};

/** The pieces a hand-made plan is built from: for each weekday, a title and exercises, or a rest day. */
export interface DesignedDay {
  /** Empty exercises means a rest day. */
  title: string;
  exerciseIds: string[];
}

/** Turns a hand-made week into a plan that repeats. Days without exercises are rest days. */
export const planFromDesign = (name: string, weeks: number, week: DesignedDay[], now: number = Date.now(), id?: string): WorkoutPlan => {
  const days: PlanDay[] = Array.from({ length: 7 }, (_, d) => {
    const w = week[d];
    const ids = (w?.exerciseIds ?? []).filter((x) => !!getExercise(x));
    return ids.length > 0
      ? { day: d as PlanDay['day'], title: (w.title || '').trim() || 'Strength', kind: 'strength' as const, exerciseIds: ids }
      : { day: d as PlanDay['day'], title: 'Rest', kind: 'rest' as const };
  });
  const lifting = days.filter((d) => d.kind === 'strength').length;
  const clean = name.trim() || 'My lifting plan';
  return {
    id: id ?? `plan-lift-custom-${now}`,
    name: clean,
    description: `${lifting} lifting day${lifting === 1 ? '' : 's'} a week, designed by you.`,
    weeks: Math.max(1, Math.min(52, Math.round(weeks))),
    level: 'Intermediate',
    days,
    isCustom: true,
  };
};

/** Turns a plan's week back into the editor's rows, so a hand-made plan can be changed later. */
export const designFromPlan = (plan: WorkoutPlan): DesignedDay[] =>
  Array.from({ length: 7 }, (_, d) => {
    const day = plan.days.find((x) => x.day === (d as PlanDay['day']));
    return day && day.kind === 'strength' ? { title: day.title, exerciseIds: day.exerciseIds ?? [] } : { title: '', exerciseIds: [] };
  });
