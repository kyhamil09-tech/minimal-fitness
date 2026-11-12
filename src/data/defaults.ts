import { Goals, ReminderSettings, UserProfile } from '../types/tracking';
import { tdee } from '../lib/calc';

export const DEFAULT_PROFILE: UserProfile = {
  name: '',
  age: 30,
  sex: 'other',
  heightCm: 175,
  weightKg: 75,
  activityLevel: 'moderate',
  units: 'metric',
  restingHr: 55,
  onboarded: false,
};

export const suggestedGoals = (p: UserProfile, prior?: Partial<Goals>): Goals => ({
  dailySteps: prior?.dailySteps ?? 10000,
  weeklyWorkouts: prior?.weeklyWorkouts ?? 4,
  targetWeightKg: prior?.targetWeightKg ?? p.weightKg,
  dailyCalories: prior?.dailyCalories ?? tdee(p),
  dailyProteinG: prior?.dailyProteinG ?? Math.round(p.weightKg * 1.6),
  dailyWaterMl: prior?.dailyWaterMl ?? Math.round(p.weightKg * 35),
});

export const DEFAULT_GOALS: Goals = suggestedGoals(DEFAULT_PROFILE);

export const DEFAULT_REMINDERS: ReminderSettings = {
  workoutEnabled: false,
  workoutTime: '18:00',
  bedtimeEnabled: false,
  bedtimeTime: '22:30',
  hydrationEnabled: false,
  hydrationEveryMin: 90,
  fastingEnabled: false,
  streakEnabled: false,
  streakTime: '19:30',
};
