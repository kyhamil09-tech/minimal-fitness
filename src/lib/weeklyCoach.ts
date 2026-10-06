import type { SleepLogEntry, WorkoutSession } from '../types/health';
import type { WorkoutPlan } from '../types/tracking';
import { addDays, parseDateKey, toDateKey, weekdayIndex } from './dates';
import { plannedDayFor } from './workoutCalendar';
import { buildNutrition } from './nutritionTrends';

/**
 * A short review of one week that ties training, sleep, food and steps together and ends with a few things to do next week.
 * It is rule based and every line says which number it came from, so it can be checked. General guidance, not medical advice.
 */
export interface CoachInput {
  /** First day of the week being reviewed. */
  weekStart: string;
  today: string;
  workouts: WorkoutSession[];
  sleepLogs: SleepLogEntry[];
  food: { date: string; calories: number; proteinG: number; carbsG: number; fatG: number }[];
  /** Steps per day. */
  steps: Record<string, number>;
  goals: { weeklyWorkouts: number; dailySteps: number; dailyCalories: number; dailyProteinG: number };
  plan: { plan: WorkoutPlan | undefined; startedAt: number } | null;
  /** Last week's training load against the usual week (see trainingLoadStatus), when known. */
  loadRatio?: number;
}

export type PillarId = 'training' | 'consistency' | 'sleep' | 'nutrition' | 'steps';
export type PillarStatus = 'good' | 'ok' | 'low' | 'none';

export interface Pillar {
  id: PillarId;
  label: string;
  status: PillarStatus;
  /** 0 to 100, or undefined when there was nothing to judge. */
  score?: number;
  /** One line with the numbers behind it. */
  detail: string;
}

export interface CoachReport {
  from: string;
  to: string;
  /** Days of the week covered (7 for a finished week). */
  days: number;
  /** Overall 0 to 100, or null when there is too little to judge. */
  score: number | null;
  label: string;
  pillars: Pillar[];
  wins: string[];
  focus: string[];
}

const WEIGHTS: Record<PillarId, number> = { training: 0.35, consistency: 0.15, sleep: 0.2, nutrition: 0.15, steps: 0.15 };
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const statusOf = (score: number | undefined): PillarStatus => (score === undefined ? 'none' : score >= 80 ? 'good' : score >= 55 ? 'ok' : 'low');
const hm = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;
const clockOf = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const bedMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  // Minutes after 18:00, so a bedtime just after midnight sorts after one at 23:00.
  return (((h || 0) * 60 + (m || 0) - 18 * 60 + 1440) % 1440);
};

export const WEEK_LABELS = [
  { min: 85, label: 'Excellent week' },
  { min: 70, label: 'Good week' },
  { min: 55, label: 'Decent week' },
  { min: 0, label: 'Room to grow' },
];

export const buildCoachReport = (input: CoachInput): CoachReport => {
  const { weekStart, today, goals } = input;
  const fullEnd = addDays(weekStart, 6);
  const to = today < fullEnd ? today : fullEnd;
  const dates: string[] = [];
  for (let d = weekStart; d <= to; d = addDays(d, 1)) dates.push(d);
  const inWeek = new Set(dates);
  const days = dates.length;
  const scale = days / 7;

  const week = input.workouts.filter((w) => w.startedAt && inWeek.has(toDateKey(w.startedAt)));
  const activeDays = new Set(week.map((w) => toDateKey(w.startedAt as number)));
  const wins: string[] = [];
  const focus: string[] = [];

  /* ---- training ---- */
  const target = Math.max(1, goals.weeklyWorkouts);
  const scaledTarget = Math.max(1, Math.round(target * scale));
  let training: Pillar;
  if (days < 3 && week.length === 0) {
    training = { id: 'training', label: 'Training', status: 'none', detail: 'Too early in the week to judge.' };
  } else {
    const planned = dates.map((d) => ({ d, p: plannedDayFor(input.plan?.plan, input.plan?.startedAt, d) })).filter((x) => x.p && x.d <= to);
    const plannedDone = planned.filter((x) => activeDays.has(x.d)).length;
    const ratio = planned.length > 0 ? plannedDone / planned.length : Math.min(1, week.length / scaledTarget);
    const score = clamp(ratio * 100);
    training = {
      id: 'training',
      label: 'Training',
      status: statusOf(score),
      score,
      detail:
        planned.length > 0
          ? `${plannedDone} of ${planned.length} planned days done, ${week.length} workout${week.length === 1 ? '' : 's'} in all`
          : `${week.length} workout${week.length === 1 ? '' : 's'} against a goal of ${scaledTarget}`,
    };
    if (score >= 100) wins.push(planned.length > 0 ? `You did every planned session (${plannedDone} of ${planned.length}).` : `You hit your workout goal: ${week.length} of ${scaledTarget}.`);
    else if (score < 70) {
      const missed = planned.filter((x) => !activeDays.has(x.d) && x.d < today);
      if (planned.length > 0 && missed.length > 0) {
        focus.push(`You missed ${missed.length} planned day${missed.length === 1 ? '' : 's'} (${missed.slice(0, 3).map((m) => m.p!.title).join(', ')}). Put them back into next week before adding anything new.`);
      } else {
        const gap = Math.max(0, scaledTarget - week.length);
        focus.push(`You did ${week.length} workout${week.length === 1 ? '' : 's'} against a goal of ${scaledTarget}. Add ${gap} more${days < 7 ? ' this week' : ' next week'}; short ones count.`);
      }
    }
  }

  /* ---- consistency: spread, not just count ---- */
  let consistency: Pillar;
  if (week.length === 0) {
    consistency = { id: 'consistency', label: 'Consistency', status: days >= 3 ? 'low' : 'none', score: days >= 3 ? 0 : undefined, detail: days >= 3 ? 'No active days this week.' : 'Too early in the week to judge.' };
  } else {
    const sorted = [...activeDays].sort();
    let longestGap = 0;
    for (let i = 1; i < sorted.length; i++) {
      longestGap = Math.max(longestGap, Math.round((parseDateKey(sorted[i]).getTime() - parseDateKey(sorted[i - 1]).getTime()) / 86_400_000) - 1);
    }
    const trailing = Math.round((parseDateKey(to).getTime() - parseDateKey(sorted[sorted.length - 1]).getTime()) / 86_400_000);
    longestGap = Math.max(longestGap, days >= 7 ? trailing : 0);
    const dayTarget = Math.min(5, Math.max(2, Math.round(target * scale)));
    const spread = Math.min(1, activeDays.size / dayTarget);
    const gapPenalty = longestGap >= 4 ? 0.7 : longestGap === 3 ? 0.85 : 1;
    const score = clamp(spread * gapPenalty * 100);
    consistency = {
      id: 'consistency',
      label: 'Consistency',
      status: statusOf(score),
      score,
      detail: `Active on ${activeDays.size} day${activeDays.size === 1 ? '' : 's'}${longestGap >= 2 ? `, longest break ${longestGap} days` : ''}`,
    };
    if (longestGap >= 3) focus.push(`Your longest break was ${longestGap} days. Spreading the same workouts out keeps your fitness and recovery steadier.`);
  }

  /* ---- sleep ---- */
  const nights = new Map<string, SleepLogEntry>();
  for (const l of input.sleepLogs) {
    if (!inWeek.has(l.dateIso)) continue;
    const prev = nights.get(l.dateIso);
    if (!prev || l.durationMinutes > prev.durationMinutes) nights.set(l.dateIso, l);
  }
  const nightList = [...nights.values()];
  let sleep: Pillar;
  if (nightList.length < Math.min(3, days)) {
    sleep = { id: 'sleep', label: 'Sleep', status: 'none', detail: nightList.length === 0 ? 'No nights recorded.' : `Only ${nightList.length} night${nightList.length === 1 ? '' : 's'} recorded.` };
  } else {
    const avg = nightList.reduce((s, l) => s + l.durationMinutes, 0) / nightList.length;
    // 7.5 hours or more is full marks, falling to nothing at 5 hours.
    const score = clamp(((avg - 300) / (450 - 300)) * 100);
    sleep = { id: 'sleep', label: 'Sleep', status: statusOf(score), score, detail: `${hm(avg)} a night over ${nightList.length} nights` };
    if (avg >= 420) wins.push(`You averaged ${hm(avg)} of sleep.`);
    else {
      const bed = nightList.reduce((s, l) => s + bedMinutes(l.bedtime), 0) / nightList.length;
      const avgBed = clockOf(bed + 18 * 60);
      focus.push(`You averaged ${hm(avg)} of sleep. Try going to bed 30 minutes earlier: your usual bedtime was about ${avgBed}, so aim for ${clockOf(bed + 18 * 60 - 30)}.`);
    }
  }

  /* ---- nutrition ---- */
  const n = buildNutrition(input.food, goals, days, to);
  // buildNutrition counts back from `to`, which is the last day of the review, so it covers exactly these days.
  let nutrition: Pillar;
  if (n.loggedDays < Math.min(3, days)) {
    nutrition = { id: 'nutrition', label: 'Nutrition', status: 'none', detail: n.loggedDays === 0 ? 'No food logged.' : `Food logged on only ${n.loggedDays} day${n.loggedDays === 1 ? '' : 's'}.` };
  } else {
    const calRate = goals.dailyCalories > 0 ? n.daysOnCalories / n.loggedDays : 1;
    const proRate = goals.dailyProteinG > 0 ? n.daysOnProtein / n.loggedDays : 1;
    const score = clamp((calRate * 0.6 + proRate * 0.4) * 100);
    nutrition = {
      id: 'nutrition',
      label: 'Nutrition',
      status: statusOf(score),
      score,
      detail: `Calories on target ${n.daysOnCalories} of ${n.loggedDays} days, protein ${n.daysOnProtein} of ${n.loggedDays}`,
    };
    if (score >= 85) wins.push(`Your food matched your targets on most days (calories ${n.daysOnCalories}/${n.loggedDays}, protein ${n.daysOnProtein}/${n.loggedDays}).`);
    else if (goals.dailyProteinG > 0 && n.avgProteinG < goals.dailyProteinG * 0.85) {
      focus.push(`Protein averaged ${Math.round(n.avgProteinG)} g against a goal of ${goals.dailyProteinG} g. Adding a protein food to breakfast is the easiest fix.`);
    } else if (n.calorieDelta !== undefined && Math.abs(n.calorieDelta) > goals.dailyCalories * 0.12) {
      focus.push(`Calories averaged ${Math.abs(Math.round(n.calorieDelta)).toLocaleString()} ${n.calorieDelta < 0 ? 'under' : 'over'} your ${goals.dailyCalories.toLocaleString()} goal. Check whether the goal still fits what you are doing.`);
    }
  }

  /* ---- steps ---- */
  const stepDays = dates.map((d) => input.steps[d]).filter((v): v is number => typeof v === 'number' && v > 0);
  let steps: Pillar;
  if (stepDays.length < Math.min(3, days)) {
    steps = { id: 'steps', label: 'Steps', status: 'none', detail: stepDays.length === 0 ? 'No steps recorded.' : `Steps on only ${stepDays.length} day${stepDays.length === 1 ? '' : 's'}.` };
  } else {
    const avg = stepDays.reduce((a, b) => a + b, 0) / stepDays.length;
    const hit = stepDays.filter((v) => v >= goals.dailySteps).length;
    const score = clamp((avg / Math.max(1, goals.dailySteps)) * 100);
    steps = { id: 'steps', label: 'Steps', status: statusOf(score), score, detail: `${Math.round(avg).toLocaleString()} a day, goal reached on ${hit} of ${stepDays.length} days` };
    if (score >= 100 || hit >= Math.ceil(stepDays.length * 0.7)) wins.push(`You reached your step goal on ${hit} of ${stepDays.length} days.`);
    else if (score < 70) focus.push(`Steps averaged ${Math.round(avg).toLocaleString()} against ${goals.dailySteps.toLocaleString()}. A 15-minute walk after one meal a day closes much of that.`);
  }

  /* ---- load: an overdone week matters more than any of the above ---- */
  if (input.loadRatio !== undefined) {
    if (input.loadRatio > 1.5) focus.unshift(`Your training load was ${input.loadRatio.toFixed(1)} times your usual week. Make next week lighter, with at least one full rest day, before building again.`);
    else if (input.loadRatio >= 0.8 && input.loadRatio <= 1.3 && week.length >= 2) wins.push('Your training load was in a steady range for you.');
    else if (input.loadRatio < 0.6 && week.length > 0) focus.push(`Your load was well under your usual week (${input.loadRatio.toFixed(1)} times). If you felt fine, there is room to do a little more.`);
  }

  // Suggest the days that have worked for you before, for next week's sessions.
  if (training.score !== undefined && training.score < 70 && days >= 7) {
    const counts = Array(7).fill(0) as number[];
    const since = addDays(weekStart, -56);
    for (const w of input.workouts) {
      if (!w.startedAt) continue;
      const k = toDateKey(w.startedAt);
      if (k >= since && k < weekStart) counts[weekdayIndex(w.startedAt)]++;
    }
    const best = counts
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c > 0)
      .sort((a, b) => b.c - a.c || a.i - b.i)
      .slice(0, Math.min(3, target))
      .sort((a, b) => a.i - b.i)
      .map((x) => WEEKDAY_NAMES[x.i]);
    if (best.length > 0) focus.push(`The days you usually train are ${best.join(', ')}. Pencil your sessions in for those.`);
  }

  const pillars = [training, consistency, sleep, nutrition, steps];
  const scored = pillars.filter((p) => p.score !== undefined);
  const weight = scored.reduce((s, p) => s + WEIGHTS[p.id], 0);
  // Need something actually recorded this week (a week with nothing at all may just be a week the app was not used), and at
  // least two areas with a verdict, one of them training or consistency, before an overall score means anything.
  const recorded = week.length > 0 || nightList.length > 0 || n.loggedDays > 0 || stepDays.length > 0;
  const enough = recorded && scored.length >= 2 && scored.some((p) => p.id === 'training' || p.id === 'consistency');
  const score = enough && weight > 0 ? Math.round(scored.reduce((s, p) => s + (p.score as number) * WEIGHTS[p.id], 0) / weight) : null;
  const label = score === null ? 'Not enough data yet' : (WEEK_LABELS.find((l) => score >= l.min) ?? WEEK_LABELS[WEEK_LABELS.length - 1]).label;

  return {
    from: weekStart,
    to,
    days,
    score,
    label,
    pillars,
    wins: wins.slice(0, 3),
    // With nothing recorded there is no honest advice to give, so none is.
    focus: !recorded ? [] : focus.length > 0 ? focus.slice(0, 3) : score !== null ? ['Nothing stands out to fix. Repeat what worked this week.'] : [],
  };
};
