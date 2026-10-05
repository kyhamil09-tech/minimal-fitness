import { FastingSession, WorkoutSession } from '../types/health';
import { Achievement, Goals } from '../types/tracking';
import { currentStreak, longestStreak, personalRecords, workoutDateKeys } from './calc';
import { addDays, toDateKey, startOfWeek } from './dates';
import { completedFasts, fastingStats } from './fasting';

export type AwardGroup = 'workout' | 'fasting' | 'weekly';

/** An award has the same shape as an achievement, so the badge story card and the awards list can show both. */
export interface Award extends Achievement {
  group: AwardGroup;
  /** 1 (first steps) to 5 (a long haul): sets how the badge looks and how big the celebration is. */
  tier: 1 | 2 | 3 | 4 | 5;
}

const STREAK_STEPS = [3, 7, 14, 30, 60, 100, 365];
const tierFor = (i: number, n: number): Award['tier'] => Math.min(5, 1 + Math.floor((i * 5) / n)) as Award['tier'];

const award = (id: string, group: AwardGroup, tier: Award['tier'], title: string, description: string, value: number, target: number, unit = ''): Award => ({
  id,
  group,
  tier,
  title,
  description,
  unlocked: value >= target,
  progress: target > 0 ? Math.min(1, value / target) : 0,
  progressLabel: `${Math.min(Math.round(value * 10) / 10, target)}/${target}${unit}`,
});

/** Calendar weeks (by the app's week start) in which at least `goal` workouts were logged, as a streak ending this week or last. */
export const weeklyGoalStreak = (workouts: WorkoutSession[], goal: number, now: number = Date.now()): number => {
  const need = Math.max(1, goal);
  const counts = new Map<string, number>();
  for (const w of workouts) {
    const t = w.startedAt ?? Date.parse(w.timestamp);
    if (!Number.isFinite(t)) continue;
    const k = toDateKey(startOfWeek(t).getTime());
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const thisWeek = toDateKey(startOfWeek(now).getTime());
  // This week counts once it is met; until then the streak carries on from last week (the week is not over).
  let cursor = (counts.get(thisWeek) ?? 0) >= need ? thisWeek : addDays(thisWeek, -7);
  let n = 0;
  while ((counts.get(cursor) ?? 0) >= need) {
    n++;
    cursor = addDays(cursor, -7);
  }
  return n;
};

export interface RewardsInput {
  workouts: WorkoutSession[];
  fasts: FastingSession[];
  goals: Pick<Goals, 'weeklyWorkouts'>;
  today: string;
  now?: number;
}

export const computeRewards = (input: RewardsInput): Award[] => {
  const { workouts, fasts, goals, today } = input;
  const keys = workoutDateKeys(workouts);
  const wkStreak = Math.max(currentStreak(keys, today), longestStreak(keys));
  const fs = fastingStats(fasts, today);
  const done = completedFasts(fasts);
  const longest = fs.longestHours;
  const fastStreak = Math.max(fs.streakDays, longestFastStreak(fasts));
  const weekStreak = weeklyGoalStreak(workouts, goals.weeklyWorkouts, input.now);

  const out: Award[] = [];
  STREAK_STEPS.forEach((n, i) =>
    out.push(award(`wk-streak-${n}`, 'workout', tierFor(i, STREAK_STEPS.length), `${n}-day streak`, `Work out ${n} days in a row`, wkStreak, n, ' days'))
  );
  [2, 4, 8, 12, 26].forEach((n, i, a) =>
    out.push(award(`wk-goal-${n}`, 'weekly', tierFor(i, a.length), `${n} strong weeks`, `Hit your weekly workout goal ${n} weeks running`, weekStreak, n, ' weeks'))
  );
  STREAK_STEPS.forEach((n, i) =>
    out.push(award(`fast-streak-${n}`, 'fasting', tierFor(i, STREAK_STEPS.length), `${n}-day fasting streak`, `Reach your fasting goal ${n} days in a row`, fastStreak, n, ' days'))
  );
  out.push(award('fast-first', 'fasting', 1, 'First fast', 'Finish your first fast', done.length, 1));
  out.push(award('fast-16', 'fasting', 2, 'Sixteen hours', 'Complete a fast of 16 hours or more', longest, 16, ' h'));
  out.push(award('fast-24', 'fasting', 4, 'A full day', 'Complete a fast of 24 hours or more', longest, 24, ' h'));
  out.push(award('fast-goals-10', 'fasting', 3, 'Ten goals met', 'Reach your target on 10 fasts', fs.goalMet, 10));
  out.push(award('fast-goals-50', 'fasting', 5, 'Fifty goals met', 'Reach your target on 50 fasts', fs.goalMet, 50));
  out.push(award('fast-hours-100', 'fasting', 3, '100 hours fasted', 'Fast for 100 hours in total', fs.totalHours, 100, ' h'));
  return out;
};

/** The longest run of consecutive days that each had a fast meeting its goal (fastingStats only returns the current one). */
export const longestFastStreak = (fasts: FastingSession[]): number => {
  const days = new Set<string>();
  for (const s of completedFasts(fasts)) {
    if ((s.actualHours ?? s.targetDurationHours) >= s.targetDurationHours) days.add(toDateKey(s.endTimestamp ?? s.startTimestamp));
  }
  return longestStreak(days);
};

/** Awards unlocked now that were not in `seen`. */
export const newAwards = (awards: Award[], seen: string[]): Award[] => {
  const s = new Set(seen);
  return awards.filter((a) => a.unlocked && !s.has(a.id)).sort((a, b) => b.tier - a.tier);
};

/** The nearest award still to earn in a group: the one to point at. */
export const nextAward = (awards: Award[], group: AwardGroup): Award | null =>
  awards.filter((a) => a.group === group && !a.unlocked).sort((a, b) => b.progress - a.progress)[0] ?? null;

export interface Encouragement {
  title: string;
  body: string;
  /** A bigger moment gets the celebration treatment (haptics, confetti) rather than a quiet toast. */
  big: boolean;
}

/** Same pick all day, so a message does not flicker between renders; different on different days. */
const pick = <T,>(list: T[], seed: string): T => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
};

const KIND: Record<string, string> = { Running: 'run', Walking: 'walk', Cycling: 'ride', Hiking: 'hike', Swimming: 'swim', Strength: 'strength session' };

/**
 * A short, warm message for a workout you just finished. It names something true about it (a first, a streak, a record, the
 * weekly goal, a comeback) and never scolds: a missed day is not mentioned, a return after a break is celebrated.
 */
export const afterWorkout = (workout: WorkoutSession, all: WorkoutSession[], goals: Pick<Goals, 'weeklyWorkouts'>, today: string): Encouragement => {
  const with_ = all.some((w) => w.id === workout.id) ? all : [workout, ...all];
  const before = with_.filter((w) => w.id !== workout.id);
  const kind = KIND[workout.type] ?? 'workout';
  const keys = workoutDateKeys(with_);
  const streak = currentStreak(keys, today);
  const seed = `${today}-${workout.id}`;

  if (before.length === 0) return { title: 'First one done', body: `Your first ${kind} is in the log. Everything starts here.`, big: true };

  const prevPr = personalRecords(before);
  const nowPr = personalRecords(with_);
  const newLift = Object.keys(nowPr).find((id) => (workout.exercises ?? []).some((e) => e.exerciseId === id) && (!prevPr[id] || nowPr[id].oneRepMax > prevPr[id].oneRepMax + 0.01));
  if (newLift) return { title: 'New personal record', body: `${nowPr[newLift].name} is a new best. That is real progress.`, big: true };

  if ([7, 14, 30, 60, 100, 365].includes(streak)) return { title: `${streak} days in a row`, body: `${streak} straight days of moving. That is a habit now.`, big: true };

  const goal = Math.max(1, goals.weeklyWorkouts);
  const weekCount = weeklyCount(with_, workout);
  if (weekCount === goal) return { title: 'Weekly goal done', body: `${goal} of ${goal} this week. Anything more is a bonus.`, big: true };

  const last = Math.max(0, ...before.map((w) => w.startedAt ?? Date.parse(w.timestamp)).filter((t) => Number.isFinite(t)));
  const at = workout.startedAt ?? Date.parse(workout.timestamp);
  if (Number.isFinite(at) && last > 0 && at - last > 6 * 24 * 3600 * 1000) {
    return { title: 'Welcome back', body: pick([`Great to see you out there. Starting again is the hardest part and you did it.`, `You showed up again. That is what counts.`], seed), big: false };
  }
  if (streak >= 3) return { title: `${streak} days running`, body: `That is ${streak} days in a row. Keep it easy and keep it going.`, big: false };
  if (weekCount > 0 && weekCount < goal) return { title: `${weekCount} of ${goal} this week`, body: `${goal - weekCount} to go for the weekly goal. You are on track.`, big: false };
  return {
    title: 'Nice work',
    body: pick(
      [`Another ${kind} in the bank.`, `Done is better than perfect. Well done.`, `Your future self says thanks.`, `Small steps, steady progress.`],
      seed
    ),
    big: false,
  };
};

const weeklyCount = (all: WorkoutSession[], w: WorkoutSession): number => {
  const at = w.startedAt ?? Date.parse(w.timestamp);
  const start = startOfWeek(Number.isFinite(at) ? at : Date.now()).getTime();
  const end = start + 7 * 24 * 3600 * 1000;
  return all.filter((x) => {
    const t = x.startedAt ?? Date.parse(x.timestamp);
    return Number.isFinite(t) && t >= start && t < end;
  }).length;
};

/** A message for a fast you just finished. Falling short is met with kindness: any fast is a fast. */
export const afterFast = (fasts: FastingSession[], today: string): Encouragement | null => {
  const done = completedFasts(fasts);
  const last = done[0];
  if (!last) return null;
  const hours = Math.round((last.actualHours ?? last.targetDurationHours) * 10) / 10;
  const met = (last.actualHours ?? last.targetDurationHours) >= last.targetDurationHours;
  const st = fastingStats(fasts, today);
  if (done.length === 1) return { title: 'First fast done', body: `${hours} hours. You have started something good.`, big: true };
  if (met && [3, 7, 14, 30, 60, 100].includes(st.streakDays)) return { title: `${st.streakDays}-day fasting streak`, body: `Goal met ${st.streakDays} days running. That takes steady discipline.`, big: true };
  if (met && hours >= (st.longestHours ?? 0)) return { title: 'Longest fast yet', body: `${hours} hours, your longest so far.`, big: true };
  if (met) return { title: 'Goal reached', body: `${hours} hours, target met${st.streakDays > 1 ? `, ${st.streakDays} days in a row` : ''}. Nicely done.`, big: false };
  return { title: 'Every hour counts', body: `${hours} hours is a real fast. Your body still got the benefit, and tomorrow is a fresh start.`, big: false };
};
