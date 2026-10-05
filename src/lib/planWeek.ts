import { PlanDay } from '../types/tracking';
import { LoadStatus } from './trainingLoad';
import { isHardDay } from './planAdapt';

export type DayChange = 'keep' | 'trim' | 'easy' | 'rest';

export interface WeekDayAdvice {
  day: PlanDay['day'];
  title: string;
  change: DayChange;
  note: string;
  targetMinutes?: number;
  targetKm?: number;
}

export interface WeekAdvice {
  tone: 'good' | 'info' | 'warn';
  title: string;
  message: string;
  /** Minutes still planned for the rest of the week, and what is suggested instead. */
  plannedMinutes: number;
  suggestedMinutes: number;
  days: WeekDayAdvice[];
}

const r1 = (v: number | undefined, f: number) => (v === undefined ? undefined : Math.round(v * f * 10) / 10);

/** Minutes a day asks for: its time target, or a rough guess from distance (6 min a km) when only distance is set. */
const minutesOf = (d: Pick<PlanDay, 'targetMinutes' | 'targetKm' | 'kind'>): number => (d.kind === 'rest' ? 0 : d.targetMinutes ?? Math.round((d.targetKm ?? 0) * 6) ?? 0);

export interface WeekInput {
  /** This week's planned days. */
  days: PlanDay[];
  /** Weekday indexes (0 = Monday) already trained this week. */
  doneDays: number[];
  /** Today's weekday index. */
  todayIdx: number;
  /** How this week's load compares with your usual week (see trainingLoadStatus). */
  load: Pick<LoadStatus, 'id' | 'ratio'> | null;
  /** Readiness scores for the last few mornings, newest last. Missing days are fine. */
  readiness: number[];
}

/**
 * Looks at the days still ahead in the week's plan and how recovered and loaded you are, and suggests how to adjust them:
 * hard days softened or swapped when you are run down or ramping up fast, a lighter week made a little fuller when you are
 * fresh and have trained less than usual. Rest days are never filled in. It only suggests; the plan itself is not changed.
 */
export const adaptWeek = (input: WeekInput): WeekAdvice | null => {
  const ahead = input.days
    .filter((d) => d.day >= input.todayIdx && !input.doneDays.includes(d.day) && d.kind !== 'rest')
    .sort((a, b) => a.day - b.day);
  if (ahead.length === 0) return null;

  const plannedMinutes = ahead.reduce((s, d) => s + minutesOf(d), 0);
  // A trend, not one night: with two or more mornings the last three are averaged, and the latest counts double so a recovery shows.
  const recent = input.readiness.slice(-3);
  const avgReady = recent.length
    ? (recent.reduce((s, v) => s + v, 0) + recent[recent.length - 1]) / (recent.length + 1)
    : null;
  const status = input.load?.id ?? 'none';
  const ratio = input.load?.ratio ?? 1;

  const days: WeekDayAdvice[] = [];
  let tone: WeekAdvice['tone'] = 'good';
  let title = 'The rest of your week looks right';
  let message = 'Your load and recovery fit the plan. Go as written.';

  const tired = avgReady !== null && avgReady < 50;
  const ramping = status === 'overreaching' || status === 'high';

  if (ramping || tired) {
    tone = 'warn';
    // Soften the hardest remaining day first, then trim the others; keep at least one rest-like day by turning the second hard day easy.
    const hard = ahead.filter(isHardDay);
    const factor = status === 'overreaching' || (avgReady !== null && avgReady < 35) ? 0.65 : 0.8;
    for (const d of ahead) {
      const idx = hard.indexOf(d);
      if (idx === 0 && (status === 'overreaching' || (avgReady !== null && avgReady < 35))) {
        days.push({ day: d.day, title: d.title, change: 'rest', note: 'Take this one off, or do an easy walk.' });
      } else if (idx >= 0) {
        days.push({ day: d.day, title: d.title, change: 'easy', note: 'Do it at an easy effort and shorter.', targetMinutes: r1(d.targetMinutes, 0.6), targetKm: r1(d.targetKm, 0.6) });
      } else {
        days.push({ day: d.day, title: d.title, change: 'trim', note: 'Keep it, a little shorter.', targetMinutes: r1(d.targetMinutes, factor), targetKm: r1(d.targetKm, factor) });
      }
    }
    title = ramping ? 'Ease the rest of the week' : 'Recovery is low, go lighter';
    message = ramping
      ? 'Your load is well above your usual week. Softening the hard days now protects the weeks that follow.'
      : `Readiness has averaged ${Math.round(avgReady ?? 0)} over the last few mornings. Lighter days now mean better ones later.`;
  } else if ((status === 'detraining' || ratio < 0.8) && avgReady !== null && avgReady >= 70) {
    tone = 'info';
    // Fresh and behind your usual load: offer a little more on the easiest remaining training day.
    const easiest = [...ahead].filter((d) => !isHardDay(d)).sort((a, b) => minutesOf(b) - minutesOf(a))[0] ?? ahead[0];
    for (const d of ahead) {
      days.push(
        d.day === easiest.day
          ? { day: d.day, title: d.title, change: 'keep', note: 'You are fresh: add about 10 minutes at an easy effort if you feel like it.', targetMinutes: r1(d.targetMinutes, 1.15), targetKm: r1(d.targetKm, 1.15) }
          : { day: d.day, title: d.title, change: 'keep', note: 'As planned.' }
      );
    }
    title = 'Room for a little more';
    message = 'You are recovered and have trained less than usual this week. An extra easy stretch would hold your fitness.';
  } else {
    for (const d of ahead) days.push({ day: d.day, title: d.title, change: 'keep', note: 'As planned.' });
  }

  const suggestedMinutes = days.reduce((s, a, i) => {
    if (a.change === 'rest') return s;
    return s + (a.targetMinutes ?? minutesOf(ahead[i]));
  }, 0);
  return { tone, title, message, plannedMinutes, suggestedMinutes: Math.round(suggestedMinutes), days };
};
