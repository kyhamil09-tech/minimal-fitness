import { ActivePlan, PlanDay } from '../types/tracking';
import { getPlan } from '../data/plans';
import { planDaysForWeek } from './planBuilder';
import { applyMoves, movesFor } from './planReshuffle';
import { startOfMondayWeek, toDateKey, weekdayIndex } from './dates';
import { WorkoutType } from '../types/health';

/** The activity a planned day is done with, when it can be recorded from the Run tab (walks, runs, rides, intervals). */
export const plannedSport = (d: PlanDay | undefined): WorkoutType | null => {
  if (!d || d.kind !== 'cardio') return null;
  switch (d.cardioType) {
    case 'Walking':
      return 'Walking';
    case 'Running':
      return 'Running';
    case 'Cycling':
      return 'Cycling';
    case 'HIIT':
      return 'HIIT';
    default:
      return null;
  }
};

/** The big line on Home's Today card: it says what today's planned session is, so a walking plan does not ask "Ready to run?". */
export const planHeadline = (d: PlanDay | undefined): string => {
  if (!d) return 'Ready to run?';
  if (d.kind === 'rest') return 'Rest day';
  if (d.kind === 'strength') return 'Time to lift';
  if (d.kind === 'mobility') return 'Time to stretch';
  switch (d.cardioType) {
    case 'Walking':
      return 'Time for a walk';
    case 'Cycling':
      return 'Time to ride';
    case 'HIIT':
      return 'Ready to sweat?';
    default:
      return 'Ready to run?';
  }
};

/** Whether today's session in the plan being followed is a training one (strength or cardio), after any moves you made. */
export const plannedTrainingToday = (active: ActivePlan | null | undefined, now: number = Date.now()): boolean => {
  if (!active) return false;
  const plan = active.plan ?? getPlan(active.planId);
  if (!plan) return false;
  const week = Math.floor((startOfMondayWeek(now).getTime() - startOfMondayWeek(active.startedAt).getTime()) / (7 * 24 * 3600 * 1000)) + 1;
  const monday = toDateKey(startOfMondayWeek(now));
  const days = applyMoves(planDaysForWeek(plan, Math.max(1, week)), movesFor(active.moves, monday));
  const today = days.find((d) => d.day === weekdayIndex(now));
  return !!today && (today.kind === 'strength' || today.kind === 'cardio');
};
