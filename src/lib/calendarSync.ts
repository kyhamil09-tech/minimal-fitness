import { ActivePlan, MealType, SavedMeal } from '../types/tracking';
import { getPlan } from '../data/plans';
import { planDaysForWeek } from './planBuilder';
import { applyMoves, movesFor } from './planReshuffle';
import { PlannedMeal, mealTotals } from './mealPlan';
import { addDays, parseDateKey, startOfMondayWeek, toDateKey, weekdayIndex } from './dates';

/**
 * Planned workouts and meals as calendar events, and what to add or remove to keep the calendar in step with the plan. The events are
 * written by the phone's own calendar storage (see DeviceCalendarPlugin); this only works out what they should be.
 */

export interface CalEvent {
  /** Stable for the same plan entry ("w:2026-10-22" for a day's workout, "m:<id>" for a planned meal), so a second sync does not double up. */
  key: string;
  title: string;
  start: number;
  end: number;
  description: string;
}

export interface TrackedEvent {
  id: number;
  start: number;
  title: string;
}

const DAY = 86_400_000;

/** A local time on a day, as epoch ms. */
export const atTime = (dateKey: string, hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = parseDateKey(dateKey);
  d.setHours(Number.isFinite(h) ? h : 7, Number.isFinite(m) ? m : 0, 0, 0);
  return d.getTime();
};

const DEFAULT_MINUTES = { strength: 60, cardio: 40, mobility: 20 } as const;

/** One event for each training day of the plan being followed, over the next `days` days (rest days are left out). */
export const workoutEvents = (active: ActivePlan | null | undefined, startTime: string, days: number, today: string): CalEvent[] => {
  if (!active) return [];
  const plan = active.plan ?? getPlan(active.planId);
  if (!plan) return [];
  const out: CalEvent[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const d = parseDateKey(date);
    const week = Math.floor((startOfMondayWeek(d).getTime() - startOfMondayWeek(active.startedAt).getTime()) / (7 * DAY)) + 1;
    if (week < 1) continue;
    const monday = toDateKey(startOfMondayWeek(d));
    const planned = applyMoves(planDaysForWeek(plan, week), movesFor(active.moves, monday)).find((x) => x.day === weekdayIndex(d));
    if (!planned || planned.kind === 'rest') continue;
    const minutes = planned.targetMinutes ?? DEFAULT_MINUTES[planned.kind];
    const start = atTime(date, startTime);
    const bits = [plan.name ? `Plan: ${plan.name}` : '', planned.targetKm ? `Target: ${planned.targetKm} km` : '', `About ${minutes} minutes`].filter(Boolean);
    out.push({ key: `w:${date}`, title: planned.title, start, end: start + minutes * 60_000, description: bits.join('\n') });
  }
  return out;
};

/** One event for each meal planned on the given dates. A meal whose saved meal was deleted is left out. */
export const mealEvents = (plan: PlannedMeal[], meals: SavedMeal[], dates: string[], times: Record<MealType, string>): CalEvent[] => {
  const byId = new Map(meals.map((m) => [m.id, m]));
  const set = new Set(dates);
  const out: CalEvent[] = [];
  for (const p of plan) {
    const m = byId.get(p.savedMealId);
    if (!m || !set.has(p.date)) continue;
    const t = mealTotals(m);
    const start = atTime(p.date, times[p.meal] ?? '12:00');
    out.push({
      key: `m:${p.id}`,
      title: `${p.meal}: ${m.name}`,
      start,
      end: start + 30 * 60_000,
      description: `${m.items.map((i) => i.name).join(', ')}\n${Math.round(t.calories)} kcal, ${Math.round(t.proteinG)} g protein`,
    });
  }
  return out;
};

export interface SyncPlan {
  add: CalEvent[];
  /** Calendar event ids to delete: ones that are no longer planned, or that changed and are being added again. */
  remove: number[];
  /** Keys that were already right. */
  kept: number;
}

/**
 * What to do to bring the calendar in line with `wanted`. `tracked` is what this app added before. Only events inside the range
 * [from, to) are touched, so older events and ones you added yourself are never removed.
 */
export const diffEvents = (tracked: Record<string, TrackedEvent>, wanted: CalEvent[], from: number, to: number, kind?: 'w' | 'm'): SyncPlan => {
  const wantedByKey = new Map(wanted.map((e) => [e.key, e]));
  const add: CalEvent[] = [];
  const remove: number[] = [];
  let kept = 0;
  for (const [key, t] of Object.entries(tracked)) {
    if (kind && !key.startsWith(`${kind}:`)) continue;
    if (t.start < from || t.start >= to) continue;
    const w = wantedByKey.get(key);
    if (!w || w.start !== t.start || w.title !== t.title) remove.push(t.id);
  }
  for (const w of wanted) {
    const t = tracked[w.key];
    if (t && t.start === w.start && t.title === w.title) kept++;
    else add.push(w);
  }
  return { add, remove, kept };
};
