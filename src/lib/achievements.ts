import { WorkoutSession } from '../types/health';
import { Achievement, BodyEntry, FoodEntry, Goals, WaterEntry } from '../types/tracking';
import {
  currentStreak,
  longestStreak,
  personalRecords,
  summarize,
  workoutDateKeys,
  workoutsInWeek,
} from './calc';
import { addDays } from './dates';

export interface AchievementInput {
  workouts: WorkoutSession[];
  body: BodyEntry[];
  food: FoodEntry[];
  water: WaterEntry[];
  goals: Goals;
  today: string;
  now?: number;
}

const make = (
  id: string,
  title: string,
  description: string,
  value: number,
  target: number,
  unit = ''
): Achievement => ({
  id,
  title,
  description,
  unlocked: value >= target,
  progress: target > 0 ? Math.min(1, value / target) : 0,
  progressLabel: `${Math.min(Math.round(value * 10) / 10, target)}/${target}${unit}`,
});

export const computeAchievements = (input: AchievementInput): Achievement[] => {
  const { workouts, body, food, water, goals, today } = input;
  const keys = workoutDateKeys(workouts);
  const streak = Math.max(currentStreak(keys, today), longestStreak(keys));
  const totals = summarize(workouts);
  const prCount = Object.keys(personalRecords(workouts)).length;
  const week = workoutsInWeek(workouts, input.now);

  // Hydration: days in the last 7 where the water goal was hit.
  const waterByDay: Record<string, number> = {};
  for (const w of water) waterByDay[w.date] = (waterByDay[w.date] || 0) + w.ml;
  let hydrationDays = 0;
  for (let i = 0; i < 7; i++) {
    if ((waterByDay[addDays(today, -i)] || 0) >= goals.dailyWaterMl) hydrationDays++;
  }

  const foodDays = new Set(food.map((f) => f.date)).size;
  const strengthSessions = workouts.filter((w) => (w.exercises || []).length > 0).length;

  return [
    make('first-workout', 'First Step', 'Log your first workout', totals.count, 1),
    make('streak-3', 'Warming Up', 'Work out 3 days in a row', streak, 3, ' days'),
    make('streak-7', 'Week Warrior', 'Work out 7 days in a row', streak, 7, ' days'),
    make('workouts-10', 'Consistent', 'Complete 10 workouts', totals.count, 10),
    make('workouts-50', 'Dedicated', 'Complete 50 workouts', totals.count, 50),
    make(
      'weekly-goal',
      'Weekly Goal Crusher',
      `Hit ${goals.weeklyWorkouts} workouts this week`,
      week.length,
      Math.max(1, goals.weeklyWorkouts)
    ),
    make('distance-50', 'Distance Club', 'Cover 50 km in tracked workouts', totals.distanceKm, 50, ' km'),
    make('strength-5', 'Iron Habit', 'Log 5 strength sessions with sets', strengthSessions, 5),
    make('pr-hunter', 'PR Hunter', 'Set records on 5 different lifts', prCount, 5),
    make('hydrated-7', 'Well Hydrated', 'Hit your water goal on 5 of the last 7 days', hydrationDays, 5, ' days'),
    make('food-7', 'Mindful Eater', 'Log food on 7 different days', foodDays, 7, ' days'),
    make('body-5', 'Tracking Progress', 'Log your body measurements 5 times', body.length, 5),
  ];
};
