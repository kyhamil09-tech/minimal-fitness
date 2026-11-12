import { WorkoutSession } from '../types/health';
import { MuscleGroup } from '../types/tracking';
import { MUSCLE_GROUPS, getExercise } from '../data/exercises';
import { estimateOneRepMax } from './calc';
import { isWorkingSet, workingVolumeKg, hasWork } from './sets';
import { liftingWorkouts } from './lifting';

/**
 * Numbers for the Lift side's History and Profile: the calendar, streaks, badges, the strength total and where the volume goes.
 * Everything is worked out from the workouts already on the phone.
 */

const DAY = 24 * 3600 * 1000;

export const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const whenOf = (w: WorkoutSession): number => w.startedAt ?? Date.parse(w.timestamp);

/** The lifting workouts on each local day. */
export const workoutsByDay = (workouts: WorkoutSession[]): Map<string, WorkoutSession[]> => {
  const by = new Map<string, WorkoutSession[]>();
  for (const w of liftingWorkouts(workouts)) {
    const k = dayKey(whenOf(w));
    by.set(k, [...(by.get(k) ?? []), w]);
  }
  return by;
};

export interface CalendarCell {
  key: string;
  day: number;
  inMonth: boolean;
  count: number;
}

/** A month as rows of seven days starting on Monday, with the number of workouts on each day. */
export const monthGrid = (year: number, month: number, by: Map<string, WorkoutSession[]>): CalendarCell[][] => {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const rows: CalendarCell[][] = [];
  const cur = new Date(start);
  for (let r = 0; r < 6; r++) {
    const row: CalendarCell[] = [];
    for (let c = 0; c < 7; c++) {
      const key = dayKey(cur.getTime());
      row.push({ key, day: cur.getDate(), inMonth: cur.getMonth() === month, count: by.get(key)?.length ?? 0 });
      cur.setDate(cur.getDate() + 1);
    }
    rows.push(row);
    if (cur.getFullYear() * 12 + cur.getMonth() > year * 12 + month) break;
  }
  return rows;
};

const mondayOf = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
};

export interface Streak {
  /** Weeks in a row with at least `perWeek` workouts, counting this week once it has them (a week still in progress never breaks it). */
  current: number;
  best: number;
}

/** The weekly streak: consecutive Monday-to-Sunday weeks with at least `perWeek` lifting workouts. */
export const weeklyStreak = (workouts: WorkoutSession[], now: number, perWeek = 2): Streak => {
  const counts = new Map<number, number>();
  for (const w of liftingWorkouts(workouts)) {
    const wk = Math.round(mondayOf(whenOf(w)) / DAY);
    counts.set(wk, (counts.get(wk) ?? 0) + 1);
  }
  const thisWeek = Math.round(mondayOf(now) / DAY);
  const meets = (wk: number) => (counts.get(wk) ?? 0) >= perWeek;
  let current = 0;
  let wk = meets(thisWeek) ? thisWeek : thisWeek - 7;
  while (meets(wk)) {
    current++;
    wk -= 7;
  }
  let best = 0;
  let run = 0;
  let prev = -1;
  for (const w of [...counts.keys()].sort((a, b) => a - b)) {
    if (!meets(w)) {
      run = 0;
      prev = -1;
      continue;
    }
    run = prev >= 0 && w - prev === 7 ? run + 1 : 1;
    prev = w;
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current) };
};

/** The run of days ending today (or yesterday) with a workout on each. */
export const dayStreak = (by: Map<string, WorkoutSession[]>, now: number): number => {
  let t = now;
  if (!by.has(dayKey(t))) t -= DAY;
  let n = 0;
  while (by.has(dayKey(t))) {
    n++;
    t -= DAY;
  }
  return n;
};

/** Working volume per muscle group over the last `days` days (kg). */
export const muscleVolume = (workouts: WorkoutSession[], now: number, days = 30): Record<MuscleGroup, number> => {
  const since = now - days * DAY;
  const out = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0])) as Record<MuscleGroup, number>;
  for (const w of workouts) {
    if ((w.startedAt ?? 0) < since) continue;
    for (const ex of w.exercises ?? []) {
      const g = getExercise(ex.exerciseId)?.muscle;
      if (g && g in out) out[g] += workingVolumeKg({ ...ex, sets: ex.sets.filter(hasWork) });
    }
  }
  return out;
};

/** The four lifts that make up the strength total. */
export const BIG_LIFTS: { id: string; label: string }[] = [
  { id: 'squat', label: 'Squat' },
  { id: 'bench-press', label: 'Bench press' },
  { id: 'deadlift', label: 'Deadlift' },
  { id: 'ohp', label: 'Overhead press' },
];

export interface StrengthScore {
  lifts: { id: string; label: string; e1rmKg: number }[];
  /** The sum of the best estimated one-rep maxes (kg). */
  totalKg: number;
  /** How many of the four have been done. */
  done: number;
}

export const strengthScore = (workouts: WorkoutSession[]): StrengthScore => {
  const best: Record<string, number> = {};
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      if (!BIG_LIFTS.some((b) => b.id === ex.exerciseId)) continue;
      for (const s of ex.sets) {
        if (!isWorkingSet(s) || s.weightKg <= 0 || s.reps <= 0) continue;
        best[ex.exerciseId] = Math.max(best[ex.exerciseId] ?? 0, estimateOneRepMax(s.weightKg, s.reps, s.rpe));
      }
    }
  }
  const lifts = BIG_LIFTS.map((b) => ({ ...b, e1rmKg: best[b.id] ?? 0 }));
  return { lifts, totalKg: lifts.reduce((n, l) => n + l.e1rmKg, 0), done: lifts.filter((l) => l.e1rmKg > 0).length };
};

/** How many times a lift's best estimated one-rep max was beaten (the first time an exercise is done does not count). */
export const recordCount = (workouts: WorkoutSession[]): number => {
  const best: Record<string, number> = {};
  let n = 0;
  for (const w of [...liftingWorkouts(workouts)].reverse()) {
    const todays: Record<string, number> = {};
    for (const ex of w.exercises ?? []) {
      for (const s of ex.sets) {
        if (!isWorkingSet(s) || s.weightKg <= 0 || s.reps <= 0) continue;
        todays[ex.exerciseId] = Math.max(todays[ex.exerciseId] ?? 0, estimateOneRepMax(s.weightKg, s.reps, s.rpe));
      }
    }
    for (const [id, e] of Object.entries(todays)) {
      if (best[id] !== undefined && e > best[id] + 0.01) n++;
      best[id] = Math.max(best[id] ?? 0, e);
    }
  }
  return n;
};

export interface Badge {
  id: string;
  title: string;
  detail: string;
  earned: boolean;
  /** 0 to 1 toward earning it. */
  progress: number;
}

const make = (id: string, title: string, detail: string, have: number, need: number): Badge => ({ id, title, detail, earned: have >= need, progress: Math.min(1, need > 0 ? have / need : 1) });

export const badges = (workouts: WorkoutSession[], now: number): Badge[] => {
  const list = liftingWorkouts(workouts);
  const volume = list.reduce((n, w) => n + (w.exercises ?? []).reduce((m, ex) => m + workingVolumeKg({ ...ex, sets: ex.sets.filter(hasWork) }), 0), 0);
  const streak = weeklyStreak(workouts, now).best;
  const prs = recordCount(workouts);
  const total = strengthScore(workouts).totalKg;
  return [
    make('first', 'First workout', 'Log your first lifting workout', list.length, 1),
    make('w10', '10 workouts', 'Ten lifting workouts logged', list.length, 10),
    make('w25', '25 workouts', 'Twenty-five workouts logged', list.length, 25),
    make('w50', '50 workouts', 'Fifty workouts logged', list.length, 50),
    make('w100', '100 workouts', 'A hundred workouts logged', list.length, 100),
    make('w250', '250 workouts', 'Two hundred and fifty workouts logged', list.length, 250),
    make('v10', '10 tonnes', 'Lift 10,000 kg in total', volume, 10_000),
    make('v100', '100 tonnes', 'Lift 100,000 kg in total', volume, 100_000),
    make('v1000', '1,000 tonnes', 'Lift 1,000,000 kg in total', volume, 1_000_000),
    make('s4', '4-week streak', 'Two or more workouts a week for 4 weeks running', streak, 4),
    make('s8', '8-week streak', 'Two or more workouts a week for 8 weeks running', streak, 8),
    make('s12', '12-week streak', 'Two or more workouts a week for 12 weeks running', streak, 12),
    make('pr1', 'First record', 'Beat your best on a lift', prs, 1),
    make('pr10', '10 records', 'Beat your best ten times', prs, 10),
    make('pr50', '50 records', 'Beat your best fifty times', prs, 50),
    make('t300', '300 kg total', 'Squat, bench, deadlift and press add up to 300 kg', total, 300),
    make('t500', '500 kg total', 'Squat, bench, deadlift and press add up to 500 kg', total, 500),
  ];
};

/** Lifting volume (kg) since this week's Monday. */
export const weekVolumeKg = (workouts: WorkoutSession[], now: number): number => {
  const monday = mondayOf(now) - 12 * 3600 * 1000;
  return liftingWorkouts(workouts)
    .filter((w) => whenOf(w) >= monday)
    .reduce((n, w) => n + (w.exercises ?? []).reduce((m, ex) => m + workingVolumeKg({ ...ex, sets: ex.sets.filter(hasWork) }), 0), 0);
};

/** "Today", "Yesterday", "3 days ago", "2 weeks ago". */
export const daysAgoText = (ms: number, now: number): string => {
  const days = Math.max(0, Math.round((new Date(now).setHours(12, 0, 0, 0) - new Date(ms).setHours(12, 0, 0, 0)) / DAY));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  return `${Math.round(days / 7)} weeks ago`;
};

export interface RecordEvent {
  at: number;
  exerciseId: string;
  name: string;
  weightKg: number;
  reps: number;
  /** The new best estimated one-rep max and the one it beat (kg). */
  e1rmKg: number;
  previousKg: number;
}

/** Each time a lift's best estimated one-rep max was beaten, newest first (the first time an exercise is done is not a record). */
export const recordEvents = (workouts: WorkoutSession[]): RecordEvent[] => {
  const best: Record<string, number> = {};
  const out: RecordEvent[] = [];
  for (const w of [...liftingWorkouts(workouts)].reverse()) {
    const todays: Record<string, { e: number; weightKg: number; reps: number; name: string }> = {};
    for (const ex of w.exercises ?? []) {
      for (const s of ex.sets) {
        if (!isWorkingSet(s) || s.weightKg <= 0 || s.reps <= 0) continue;
        const e = estimateOneRepMax(s.weightKg, s.reps, s.rpe);
        if (!todays[ex.exerciseId] || e > todays[ex.exerciseId].e) todays[ex.exerciseId] = { e, weightKg: s.weightKg, reps: s.reps, name: ex.name };
      }
    }
    for (const [id, t] of Object.entries(todays)) {
      if (best[id] !== undefined && t.e > best[id] + 0.01) out.push({ at: whenOf(w), exerciseId: id, name: t.name, weightKg: t.weightKg, reps: t.reps, e1rmKg: t.e, previousKg: best[id] });
      best[id] = Math.max(best[id] ?? 0, t.e);
    }
  }
  return out.reverse();
};
