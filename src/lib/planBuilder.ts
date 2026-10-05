import { PlanDay, WorkoutPlan } from '../types/tracking';

export type RaceGoal = '5k' | '10k' | 'half';
export type PlanLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export interface PlanInput {
  goal: RaceGoal;
  level: PlanLevel;
  /** Running days per week: 3, 4 or 5. */
  daysPerWeek: 3 | 4 | 5;
  /** Total weeks including the race week. */
  weeks: number;
}

export const RACE_INFO: Record<RaceGoal, { label: string; km: number; minWeeks: number; maxWeeks: number }> = {
  '5k': { label: '5K', km: 5, minWeeks: 6, maxWeeks: 16 },
  '10k': { label: '10K', km: 10, minWeeks: 8, maxWeeks: 18 },
  half: { label: 'Half marathon', km: 21.0975, minWeeks: 10, maxWeeks: 20 },
};

/** Long-run distance (km) at the start and at the peak, by goal and level. */
const LONG_RUN: Record<RaceGoal, Record<PlanLevel, [number, number]>> = {
  '5k': { Beginner: [3, 6], Intermediate: [5, 8], Advanced: [6, 10] },
  '10k': { Beginner: [5, 10], Intermediate: [7, 13], Advanced: [9, 16] },
  half: { Beginner: [7, 17], Intermediate: [10, 19], Advanced: [12, 22] },
};

/** Interval workouts (ids from data/intervals) used for the quality day, rotating week to week. */
const QUALITY: Record<RaceGoal, string[]> = {
  '5k': ['5x3', '8x400', '6x800', 'fartlek'],
  '10k': ['5x3', 'tempo20', '6x800', 'fartlek'],
  half: ['tempo20', '5x3', 'fartlek', 'tempo20'],
};

/** Weekdays (0 = Monday) for easy, quality and long runs by number of running days. */
const LAYOUT: Record<3 | 4 | 5, { easy: number[]; quality: number; long: number }> = {
  3: { easy: [1], quality: 3, long: 6 },
  4: { easy: [1, 5], quality: 3, long: 6 },
  5: { easy: [0, 3, 5], quality: 1, long: 6 },
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const km = (n: number) => `${round1(n)} km`;

/**
 * Builds a week-by-week plan: long runs grow toward a peak with a lighter week every fourth week, then a
 * taper and the race on the last Sunday. Quality days alternate interval and tempo sessions.
 */
export const buildRacePlan = (input: PlanInput): WorkoutPlan => {
  const info = RACE_INFO[input.goal];
  const weeks = Math.max(info.minWeeks, Math.min(info.maxWeeks, Math.round(input.weeks)));
  const [start, peak] = LONG_RUN[input.goal][input.level];
  const layout = LAYOUT[input.daysPerWeek];
  const quality = QUALITY[input.goal];
  const buildWeeks = weeks - 1; // the last week is the taper and the race
  const weekly: PlanDay[][] = [];

  for (let w = 1; w <= weeks; w++) {
    const days: PlanDay[] = [];
    const isRace = w === weeks;
    const isCutback = !isRace && w % 4 === 0 && w < buildWeeks - 1;
    const progress = Math.min(1, (w - 1) / Math.max(1, buildWeeks - 2));
    let long = start + (peak - start) * progress;
    if (isCutback) long *= 0.75;
    if (isRace) long = Math.min(long, info.km) * 0.5;
    long = Math.max(start * 0.8, long);
    const easyKm = Math.max(3, long * 0.5);

    const used = new Set<number>();
    layout.easy.forEach((d, i) => {
      used.add(d);
      // Beginners ease in with run / walk intervals during the first weeks.
      const runWalk = input.level === 'Beginner' && w <= 3 && i === 0;
      days.push(
        runWalk
          ? { day: d as PlanDay['day'], title: 'Run / walk', kind: 'cardio', cardioType: 'Running', intervalId: 'run-walk', targetMinutes: 35 }
          : { day: d as PlanDay['day'], title: `Easy run ${km(easyKm)}`, kind: 'cardio', cardioType: 'Running', targetKm: round1(easyKm), targetMinutes: Math.round(easyKm * 6.5) }
      );
    });

    used.add(layout.quality);
    if (isRace) {
      days.push({ day: layout.quality as PlanDay['day'], title: 'Shake-out with strides', kind: 'cardio', cardioType: 'Running', targetMinutes: 20 });
    } else {
      const id = quality[(w - 1) % quality.length];
      const label = id === 'tempo20' ? 'Tempo 20' : id === '5x3' ? '5 x 3 min' : id === '8x400' ? '8 x 400 m' : id === '6x800' ? '6 x 800 m' : 'Fartlek';
      days.push({
        day: layout.quality as PlanDay['day'],
        title: `Quality: ${label}`,
        kind: 'cardio',
        cardioType: 'Running',
        intervalId: id,
        targetMinutes: id === 'tempo20' ? 40 : 45,
      });
    }

    used.add(layout.long);
    days.push(
      isRace
        ? { day: layout.long as PlanDay['day'], title: `Race day: ${info.label}`, kind: 'cardio', cardioType: 'Running', targetKm: round1(info.km), targetMinutes: Math.round(info.km * 6) }
        : { day: layout.long as PlanDay['day'], title: `Long run ${km(long)}`, kind: 'cardio', cardioType: 'Running', targetKm: round1(long), targetMinutes: Math.round(long * 6.5) }
    );

    for (let d = 0; d < 7; d++) {
      if (!used.has(d)) {
        // A light cross-training day between runs on the 5-day layout, rest otherwise.
        days.push(
          d === 4 && input.daysPerWeek < 5
            ? { day: 4, title: 'Mobility', kind: 'mobility', cardioType: 'Mobility', targetMinutes: 15 }
            : { day: d as PlanDay['day'], title: 'Rest', kind: 'rest' }
        );
      }
    }
    weekly.push(days.sort((a, b) => a.day - b.day));
  }

  const longest = Math.max(...weekly.flatMap((wk) => wk.filter((d) => d.title.startsWith('Long run')).map((d) => d.targetKm ?? 0)));
  return {
    id: `plan-${input.goal}-${Date.now()}`,
    name: `${info.label} plan`,
    description: `${weeks} weeks to a ${info.label}: ${input.daysPerWeek} runs a week, long runs building to ${round1(longest)} km, then a taper and race day.`,
    weeks,
    level: input.level,
    days: weekly[0],
    weekly,
    isCustom: true,
  };
};

/** The schedule for a given week (1-based). Plans without a weekly breakdown repeat the same week. */
export const planDaysForWeek = (plan: WorkoutPlan, weekNumber: number): PlanDay[] =>
  plan.weekly && plan.weekly.length > 0 ? plan.weekly[Math.max(0, Math.min(plan.weekly.length - 1, weekNumber - 1))] : plan.days;
