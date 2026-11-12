import type { WorkoutSession } from '../types/health';
import type { PlanDay, WorkoutPlan } from '../types/tracking';
import { addDays, startOfMondayWeek, startOfWeek, toDateKey, weekdayIndex, parseDateKey } from './dates';
import { planDaysForWeek } from './planBuilder';
import { PlanMove, applyMoves, movesFor } from './planReshuffle';
import { workoutDateKey } from './calc';

export interface CalendarWorkout {
  id: string;
  type: WorkoutSession['type'];
  minutes: number;
  distanceKm?: number;
  startedAt?: number;
}

export interface CalendarCell {
  date: string;
  /** Day of the month, 1 to 31. */
  day: number;
  /** Belongs to the month on show (the grid also shows a few days of the months either side). */
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  workouts: CalendarWorkout[];
  /** What the training plan asks for that day. Rest days are not listed. */
  planned?: PlanDay;
  /** Planned for a day that has passed, with nothing recorded that day. */
  missed: boolean;
}

export interface CalendarMonth {
  year: number;
  /** 0 = January. */
  month: number;
  cells: CalendarCell[];
  summary: {
    workouts: number;
    activeDays: number;
    minutes: number;
    distanceKm: number;
    /** Planned days in the month that have passed, and how many of them have a workout. */
    plannedPast: number;
    plannedDone: number;
  };
}

/** The plan day for a date, or undefined when no plan is running, the date is outside it, or the day is a rest day. */
export const plannedDayFor = (plan: WorkoutPlan | undefined, startedAt: number | undefined, date: string, moves?: PlanMove[]): PlanDay | undefined => {
  if (!plan || startedAt === undefined) return undefined;
  const d = parseDateKey(date);
  const week = Math.round((startOfMondayWeek(d).getTime() - startOfMondayWeek(startedAt).getTime()) / (7 * 86_400_000)) + 1;
  if (week < 1 || week > plan.weeks) return undefined;
  const weekKey = toDateKey(startOfMondayWeek(d));
  const day = applyMoves(planDaysForWeek(plan, week), movesFor(moves, weekKey)).find((p) => p.day === weekdayIndex(d));
  return day && day.kind !== 'rest' ? day : undefined;
};

/** Everything the month view needs: a grid of whole weeks, the workouts and planned days on each date, and a summary. */
export const buildMonth = (
  year: number,
  month: number,
  workouts: WorkoutSession[],
  plan: { plan: WorkoutPlan | undefined; startedAt: number; moves?: PlanMove[] } | null,
  today: string
): CalendarMonth => {
  const byDate = new Map<string, CalendarWorkout[]>();
  for (const w of workouts) {
    const key = workoutDateKey(w);
    if (!key) continue;
    const list = byDate.get(key) ?? [];
    list.push({ id: w.id, type: w.type, minutes: w.durationMinutes, distanceKm: w.distanceKm, startedAt: w.startedAt });
    byDate.set(key, list);
  }

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const gridStart = toDateKey(startOfWeek(first));
  const cells: CalendarCell[] = [];
  for (let date = gridStart; ; date = addDays(date, 1)) {
    const d = parseDateKey(date);
    // Stop once a whole week past the end of the month has been drawn.
    if (d > last && cells.length % 7 === 0) break;
    const ws = (byDate.get(date) ?? []).sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
    const planned = plannedDayFor(plan?.plan, plan?.startedAt, date, plan?.moves);
    cells.push({
      date,
      day: d.getDate(),
      inMonth: d.getMonth() === month && d.getFullYear() === year,
      isToday: date === today,
      isFuture: date > today,
      workouts: ws,
      planned,
      missed: !!planned && date < today && ws.length === 0,
    });
  }

  const inMonth = cells.filter((c) => c.inMonth);
  const plannedPast = inMonth.filter((c) => c.planned && c.date <= today);
  return {
    year,
    month,
    cells,
    summary: {
      workouts: inMonth.reduce((s, c) => s + c.workouts.length, 0),
      activeDays: inMonth.filter((c) => c.workouts.length > 0).length,
      minutes: inMonth.reduce((s, c) => s + c.workouts.reduce((m, w) => m + w.minutes, 0), 0),
      distanceKm: inMonth.reduce((s, c) => s + c.workouts.reduce((m, w) => m + (w.distanceKm ?? 0), 0), 0),
      plannedPast: plannedPast.length,
      plannedDone: plannedPast.filter((c) => c.workouts.length > 0).length,
    },
  };
};
