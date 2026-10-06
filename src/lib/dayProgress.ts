/**
 * Today's three small quests, shown as a ring around the Home icon: reach your step goal, reach your water goal, and do a workout.
 * Each counts partly as you go (steps and water fill up), a workout is all or nothing, and the ring is the average.
 */
export interface DayProgressInput {
  steps: number;
  stepGoal: number;
  waterMl: number;
  waterGoalMl: number;
  /** At least one workout today. */
  workoutDone: boolean;
}

export interface DayProgress {
  /** 0 to 1. */
  fraction: number;
  /** Quests completed outright, 0 to 3. */
  done: number;
  total: 3;
  steps: boolean;
  water: boolean;
  workout: boolean;
}

const part = (value: number, goal: number): number => (goal > 0 ? Math.max(0, Math.min(1, value / goal)) : 0);

export const dayProgress = (i: DayProgressInput): DayProgress => {
  const steps = part(i.steps, i.stepGoal);
  const water = part(i.waterMl, i.waterGoalMl);
  const workout = i.workoutDone ? 1 : 0;
  return {
    fraction: (steps + water + workout) / 3,
    done: (steps >= 1 ? 1 : 0) + (water >= 1 ? 1 : 0) + workout,
    total: 3,
    steps: steps >= 1,
    water: water >= 1,
    workout: i.workoutDone,
  };
};

/** A short line for the ring's tooltip and screen readers: "2 of 3 goals today: steps and water". */
export const dayProgressText = (p: DayProgress): string => {
  const names = [p.steps && 'steps', p.water && 'water', p.workout && 'a workout'].filter(Boolean) as string[];
  const list = names.length === 0 ? '' : names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return p.done === p.total ? 'All 3 goals done today' : `${p.done} of ${p.total} goals today${list ? `: ${list}` : ''}`;
};
