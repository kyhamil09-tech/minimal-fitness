import { ActivePlan, Routine, UserProfile, WorkoutPlan } from '../types/tracking';
import { getExercise } from '../data/exercises';
import { STRENGTH_TEMPLATES } from '../data/templates';
import { getPlan } from '../data/plans';
import { planDaysForWeek } from './planBuilder';
import { startOfMondayWeek, weekdayIndex } from './dates';
import { incrementKg } from './strengthProgress';
import { kgToDisplay } from './units';
import { afterGroupedSetDone } from './supersets';

/**
 * The strength session as the watch shows it: one exercise and one set at a time, with weight and reps you can change, a Done
 * button, a rest timer, and the other exercises one swipe away. The phone's logger stays the source of truth: the watch sends small
 * commands (done, plus one rep, next exercise...) and the phone answers with the new picture of the session.
 */
export interface StrengthRow {
  reps: string;
  /** In the user's display units. */
  weight: string;
  done: boolean;
}

export interface StrengthItem {
  exerciseId: string;
  name: string;
  rows: StrengthRow[];
  /** Shared by exercises done as a superset or circuit (see lib/supersets). */
  group?: string;
}

export interface WatchStrength {
  /** The exercise on show, and how many there are. */
  ex: number;
  exCount: number;
  name: string;
  /** The set on show (0-based), and how many sets this exercise has. */
  setIdx: number;
  setCount: number;
  reps: number;
  weight: number;
  unit: 'kg' | 'lb';
  /** How much one tap on the weight buttons changes it. */
  step: number;
  /** The set on show is already ticked off. */
  done: boolean;
  sets: { r: number; w: number; d: boolean }[];
  exercises: { n: string; done: number; total: number }[];
  /** Name of the next exercise with sets left, or empty. */
  next: string;
  /** Epoch ms when the rest ends (0 when not resting) and the rest length in seconds. */
  restEndsAt: number;
  restLen: number;
  doneSets: number;
  /** Volume so far, ready to show, e.g. "1,240 kg". */
  volume: string;
}

export type StrengthAction = 'done' | 'reps' | 'weight' | 'addset' | 'delset' | 'next' | 'prev' | 'jump' | 'skiprest' | 'rest';

export interface StrengthCommand {
  action: StrengthAction;
  /** reps: plus or minus one; weight: plus or minus one step; rest: seconds to add or take off. */
  delta?: number;
  /** jump: the exercise to go to. */
  index?: number;
}

export interface StrengthState {
  items: StrengthItem[];
  /** The exercise the watch is on. */
  cursor: number;
}

export type RestChange = { kind: 'start' } | { kind: 'skip' } | { kind: 'adjust'; seconds: number } | null;

const num = (s: string) => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : 0;
};

const clean = (v: number) => String(Math.round(v * 100) / 100);

/** The set to work on: the first one not ticked off, or the last when all are. */
export const currentSetIndex = (rows: StrengthRow[]): number => {
  const i = rows.findIndex((r) => !r.done);
  return i >= 0 ? i : Math.max(0, rows.length - 1);
};

/** The weight change for one tap on the watch, in display units. */
export const weightStep = (exerciseId: string, units: UserProfile['units']): number => kgToDisplay(incrementKg(getExercise(exerciseId)?.equipment, units), units, 1);

const clampIndex = (i: number, n: number) => Math.max(0, Math.min(Math.max(0, n - 1), Math.round(i)));

/** When a whole exercise is ticked off, move on to the next one that still has sets (or an earlier one), else stay. */
const nextWithSets = (items: StrengthItem[], from: number): number => {
  for (let i = from + 1; i < items.length; i++) if (items[i].rows.some((r) => !r.done)) return i;
  for (let i = 0; i < from; i++) if (items[i].rows.some((r) => !r.done)) return i;
  return from;
};

/** Applies one command from the watch to the session. Returns the new session and what to do with the rest timer. */
export const applyStrengthCommand = (state: StrengthState, cmd: StrengthCommand, units: UserProfile['units']): { state: StrengthState; rest: RestChange } => {
  const { items } = state;
  if (items.length === 0) return { state, rest: null };
  const ex = clampIndex(state.cursor, items.length);
  const item = items[ex];
  const setIdx = currentSetIndex(item.rows);
  const withRows = (rows: StrengthRow[]): StrengthItem[] => items.map((it, i) => (i === ex ? { ...it, rows } : it));
  const edit = (patch: (r: StrengthRow) => StrengthRow): StrengthItem[] => withRows(item.rows.map((r, i) => (i === setIdx ? patch(r) : r)));

  switch (cmd.action) {
    case 'done': {
      if (item.rows.length === 0) return { state, rest: null };
      const nowDone = !item.rows[setIdx].done;
      const next = edit((r) => ({ ...r, done: nowDone }));
      // In a superset or circuit the next exercise of the round comes up with no rest; rest comes after the last one.
      const grouped = nowDone ? afterGroupedSetDone(next, ex, setIdx) : null;
      if (grouped) return { state: { items: next, cursor: grouped.cursor }, rest: grouped.rest ? { kind: 'start' } : { kind: 'skip' } };
      let cursor = ex;
      if (nowDone && next[ex].rows.every((r) => r.done)) cursor = nextWithSets(next, ex);
      return { state: { items: next, cursor }, rest: nowDone ? { kind: 'start' } : { kind: 'skip' } };
    }
    case 'reps': {
      const v = Math.max(1, Math.min(99, Math.round(num(item.rows[setIdx]?.reps ?? '0') + (cmd.delta ?? 0))));
      return { state: { items: edit((r) => ({ ...r, reps: String(v) })), cursor: ex }, rest: null };
    }
    case 'weight': {
      const step = weightStep(item.exerciseId, units);
      const v = Math.max(0, Math.min(999, num(item.rows[setIdx]?.weight ?? '0') + (cmd.delta ?? 0) * step));
      return { state: { items: edit((r) => ({ ...r, weight: clean(v) })), cursor: ex }, rest: null };
    }
    case 'addset': {
      const last = item.rows[item.rows.length - 1];
      return { state: { items: withRows([...item.rows, { reps: last?.reps || '8', weight: last?.weight || '', done: false }]), cursor: ex }, rest: null };
    }
    case 'delset': {
      if (item.rows.length <= 1) return { state, rest: null };
      let drop = -1;
      for (let i = item.rows.length - 1; i >= 0; i--) {
        if (!item.rows[i].done) {
          drop = i;
          break;
        }
      }
      if (drop < 0) drop = item.rows.length - 1;
      return { state: { items: withRows(item.rows.filter((_, i) => i !== drop)), cursor: ex }, rest: null };
    }
    case 'next':
      return { state: { items, cursor: clampIndex(ex + 1, items.length) }, rest: null };
    case 'prev':
      return { state: { items, cursor: clampIndex(ex - 1, items.length) }, rest: null };
    case 'jump':
      return { state: { items, cursor: clampIndex(cmd.index ?? ex, items.length) }, rest: null };
    case 'skiprest':
      return { state, rest: { kind: 'skip' } };
    case 'rest':
      return { state, rest: { kind: 'adjust', seconds: Math.round(cmd.delta ?? 0) } };
    default:
      return { state, rest: null };
  }
};

/** The picture of the session sent to the watch, or null while there are no exercises yet. */
export const buildWatchStrength = (
  state: StrengthState,
  opts: { units: UserProfile['units']; restEndsAt: number; restLen: number; volume: string }
): WatchStrength | null => {
  const { items } = state;
  if (items.length === 0) return null;
  const ex = clampIndex(state.cursor, items.length);
  const item = items[ex];
  const setIdx = currentSetIndex(item.rows);
  const row = item.rows[setIdx];
  const nextIdx = nextWithSets(items, ex);
  return {
    ex,
    exCount: items.length,
    name: item.name,
    setIdx,
    setCount: item.rows.length,
    reps: Math.round(num(row?.reps ?? '0')),
    weight: num(row?.weight ?? '0'),
    unit: opts.units === 'imperial' ? 'lb' : 'kg',
    step: weightStep(item.exerciseId, opts.units),
    done: !!row?.done,
    sets: item.rows.map((r) => ({ r: Math.round(num(r.reps)), w: num(r.weight), d: r.done })),
    exercises: items.map((it) => ({ n: it.name, done: it.rows.filter((r) => r.done).length, total: it.rows.length })),
    next: nextIdx !== ex ? items[nextIdx].name : ex + 1 < items.length ? items[ex + 1].name : '',
    restEndsAt: opts.restEndsAt,
    restLen: opts.restLen,
    doneSets: items.reduce((n, it) => n + it.rows.filter((r) => r.done).length, 0),
    volume: opts.volume,
  };
};

/* ---------- routines offered on the watch ---------- */

export interface WatchRoutine {
  /** plan:<weekday>, r:<routine id> or t:<template id>. */
  id: string;
  name: string;
  sub: string;
  ids: string[];
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Which week of the plan it is (1-based), counting calendar weeks from the one it began in. */
export const currentPlanWeek = (active: ActivePlan, now: number = Date.now()): number =>
  Math.floor((startOfMondayWeek(now).getTime() - startOfMondayWeek(active.startedAt).getTime()) / (7 * 24 * 3600 * 1000)) + 1;

/**
 * The strength sessions to offer on the watch, most useful first: today's day of the active plan, the rest of this week's strength
 * days, your own routines, then the starter templates. The same list is rebuilt on the phone when the watch picks one by id.
 */
export const buildWatchRoutines = (opts: { routines: Routine[]; activePlan: ActivePlan | null; now?: number }): WatchRoutine[] => {
  const out: WatchRoutine[] = [];
  const count = (ids: string[]) => `${ids.length} exercise${ids.length === 1 ? '' : 's'}`;
  const plan: WorkoutPlan | undefined = opts.activePlan ? opts.activePlan.plan ?? getPlan(opts.activePlan.planId) : undefined;
  if (plan && opts.activePlan) {
    const today = weekdayIndex(opts.now ?? Date.now());
    const days = planDaysForWeek(plan, currentPlanWeek(opts.activePlan, opts.now))
      .filter((d) => d.kind === 'strength' && (d.exerciseIds?.length ?? 0) > 0 && d.day >= today)
      .sort((a, b) => a.day - b.day)
      .slice(0, 3);
    for (const d of days) {
      const ids = (d.exerciseIds ?? []).filter((id) => !!getExercise(id));
      if (ids.length === 0) continue;
      out.push({ id: `plan:${d.day}`, name: d.day === today ? `Today: ${d.title}` : `${DAYS[d.day]}: ${d.title}`, sub: `${plan.name}, ${count(ids)}`, ids });
    }
  }
  for (const r of opts.routines) {
    const ids = r.exerciseIds.filter((id) => !!getExercise(id));
    if (ids.length > 0) out.push({ id: `r:${r.id}`, name: r.name, sub: count(ids), ids });
  }
  for (const t of STRENGTH_TEMPLATES) out.push({ id: `t:${t.id}`, name: t.name, sub: count(t.exerciseIds), ids: t.exerciseIds });
  return out.slice(0, 14);
};

/** What the watch gets: names only, and the id to send back. */
export const watchRoutinesJson = (list: WatchRoutine[]): string => JSON.stringify(list.map(({ id, name, sub }) => ({ id, name, sub })));

export const resolveWatchRoutine = (id: string, list: WatchRoutine[]): WatchRoutine | null => list.find((r) => r.id === id) ?? null;
