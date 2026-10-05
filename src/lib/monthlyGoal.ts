import { WorkoutSession } from '../types/health';
import type { MonthlyGoalSetting, UnitSystem } from '../types/tracking';
import { KM_PER_MI, distanceUnit } from './units';

/** A target for the calendar month: kilometres covered, workouts done, or minutes moving. Distance is stored in km. */
export type MonthlyGoal = MonthlyGoalSetting;
export type MonthlyGoalKind = MonthlyGoal['kind'];

export interface MonthProgress {
  kind: MonthlyGoalKind;
  target: number;
  done: number;
  /** 0 to 100 (capped). */
  pct: number;
  /** Share of the month that has passed, 0 to 100. */
  monthPct: number;
  daysLeft: number;
  daysInMonth: number;
  /** Where you are heading at the pace so far (same unit as the goal). */
  projected: number;
  state: 'done' | 'ahead' | 'on-track' | 'behind';
  /** What is left per remaining day to still make it (same unit), 0 once reached. */
  perDayNeeded: number;
}

type GoalWorkout = Pick<WorkoutSession, 'startedAt' | 'timestamp' | 'durationMinutes' | 'distanceKm'>;

const startMs = (w: GoalWorkout) => (w.startedAt ?? new Date(w.timestamp).getTime()) || 0;

/** Total toward the goal for the month containing {@code now}. */
export const monthTotal = (workouts: GoalWorkout[], kind: MonthlyGoalKind, now: number): number => {
  const d = new Date(now);
  const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  let total = 0;
  for (const w of workouts) {
    const t = startMs(w);
    if (!(t >= from && t < to)) continue;
    if (kind === 'workouts') total += 1;
    else if (kind === 'minutes') total += w.durationMinutes || 0;
    else total += w.distanceKm || 0;
  }
  return total;
};

export const monthProgress = (workouts: GoalWorkout[], goal: MonthlyGoal, now: number = Date.now()): MonthProgress => {
  const d = new Date(now);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const day = d.getDate();
  const done = monthTotal(workouts, goal.kind, now);
  const target = Math.max(0.01, goal.target);
  const pct = Math.min(100, Math.round((done / target) * 100));
  const monthPct = Math.round((day / daysInMonth) * 100);
  const daysLeft = daysInMonth - day;
  const projected = day > 0 ? (done / day) * daysInMonth : done;
  const state: MonthProgress['state'] =
    done >= target ? 'done' : pct >= monthPct + 8 ? 'ahead' : pct >= monthPct - 8 ? 'on-track' : 'behind';
  const remaining = Math.max(0, target - done);
  return {
    kind: goal.kind,
    target: goal.target,
    done,
    pct,
    monthPct,
    daysLeft,
    daysInMonth,
    projected,
    state,
    perDayNeeded: remaining > 0 ? remaining / Math.max(1, daysLeft + 1) : 0,
  };
};

/** A number toward the goal, as the user reads it: distance in their own unit, the rest as whole numbers. */
export const formatGoalValue = (kind: MonthlyGoalKind, v: number, units: UnitSystem): string => {
  if (kind === 'distance') {
    const d = units === 'imperial' ? v / KM_PER_MI : v;
    return `${d >= 100 ? Math.round(d) : Math.round(d * 10) / 10}`;
  }
  return `${Math.round(v)}`;
};

export const goalUnit = (kind: MonthlyGoalKind, units: UnitSystem): string => (kind === 'distance' ? distanceUnit(units) : kind === 'workouts' ? 'workouts' : 'min');

/** "62 / 100 km". */
export const goalSummary = (p: MonthProgress, units: UnitSystem): string =>
  `${formatGoalValue(p.kind, p.done, units)} / ${formatGoalValue(p.kind, p.target, units)} ${goalUnit(p.kind, units)}`;

export const KIND_LABEL: Record<MonthlyGoalKind, string> = {
  distance: 'Distance',
  workouts: 'Workouts',
  minutes: 'Active minutes',
};

/** Sensible starting targets for the goal picker (distance in km). */
export const SUGGESTED_TARGETS: Record<MonthlyGoalKind, number[]> = {
  distance: [50, 100, 150, 200],
  workouts: [8, 12, 16, 20],
  minutes: [300, 600, 900, 1200],
};

export const sanitizeMonthlyGoal = (raw: unknown): MonthlyGoal | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<MonthlyGoal>;
  if (r.kind !== 'distance' && r.kind !== 'workouts' && r.kind !== 'minutes') return null;
  if (typeof r.target !== 'number' || !Number.isFinite(r.target) || r.target <= 0) return null;
  return { kind: r.kind, target: Math.min(100000, r.target) };
};
