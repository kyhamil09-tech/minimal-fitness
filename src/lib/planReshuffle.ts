import { PlanDay } from '../types/tracking';
import { isHardDay } from './planAdapt';

/** A session moved to another day of one week of the plan. `week` is that week's Monday as a date key; days are 0 = Monday. */
export interface PlanMove {
  week: string;
  from: number;
  to: number;
}

const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const dayName = (i: number) => NAMES[i] ?? '';

export const movesFor = (moves: PlanMove[] | undefined, week: string): PlanMove[] => (moves ?? []).filter((m) => m.week === week);

/** The week with each move applied: the session leaves its day (which becomes rest) and takes the day it was moved to. */
export const applyMoves = (days: PlanDay[], moves: PlanMove[]): PlanDay[] => {
  let out = days.map((d) => ({ ...d }));
  for (const m of moves) {
    const src = out.find((d) => d.day === m.from);
    if (!src || src.kind === 'rest') continue;
    const moved: PlanDay = { ...src, day: m.to as PlanDay['day'], title: `${src.title} (from ${dayName(m.from)})` };
    out = out.filter((d) => d.day !== m.from && d.day !== m.to);
    out.push({ day: m.from as PlanDay['day'], title: `Rest (moved to ${dayName(m.to)})`, kind: 'rest' }, moved);
  }
  return out.sort((a, b) => a.day - b.day);
};

export interface Reshuffle {
  missed: PlanDay;
  /** The day it could move to, or null when the advice is to let it go. */
  to: number | null;
  title: string;
  message: string;
}

/**
 * After a missed key session (the hardest one earlier this week that was not done), suggests where it could go: a rest day later in
 * the week that does not come straight after another hard day, so it never stacks two hard days. When there is no such day it says to
 * let it go. A missed easy day is left alone: no card. It only suggests; the person decides.
 */
export const planReshuffle = (days: PlanDay[], doneDays: number[], todayIdx: number): Reshuffle | null => {
  const missed = days
    .filter((d) => d.day < todayIdx && d.kind !== 'rest' && d.kind !== 'mobility' && !doneDays.includes(d.day) && isHardDay(d))
    .sort((a, b) => b.day - a.day)[0];
  if (!missed) return null;
  const byDay = new Map(days.map((d) => [d.day, d]));
  const slot = days
    .filter((d) => d.day >= todayIdx && d.kind === 'rest')
    .sort((a, b) => a.day - b.day)
    .find((d) => {
      const before = byDay.get((d.day - 1) as PlanDay['day']);
      const after = byDay.get((d.day + 1) as PlanDay['day']);
      // Not straight after, or straight before, another hard session. A hard day earlier in the week that was missed is not a session.
      const hardBefore = !!before && isHardDay(before) && (before.day >= todayIdx || doneDays.includes(before.day));
      return !hardBefore && !(after && isHardDay(after));
    });
  if (slot) {
    return {
      missed,
      to: slot.day,
      title: `Move ${missed.title} to ${dayName(slot.day)}?`,
      message: `You missed ${dayName(missed.day)}. ${dayName(slot.day)} is a rest day with no hard session next to it, so it fits without stacking two hard days.`,
    };
  }
  return {
    missed,
    to: null,
    title: `Let ${dayName(missed.day)}'s ${missed.title} go?`,
    message: 'There is no rest day to put it on without piling hard days together. Carrying on with the rest of the week as planned is the better choice; one missed session changes very little.',
  };
};
