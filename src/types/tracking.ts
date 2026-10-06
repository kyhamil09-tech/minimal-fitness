export type UnitSystem = 'metric' | 'imperial';
export type Sex = 'male' | 'female' | 'other';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';

export interface UserProfile {
  name: string;
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  units: UnitSystem;
  restingHr: number;
  maxHrOverride?: number;
  onboarded: boolean;
  /** The main goal picked in onboarding (see CORE_GOALS); it only shapes the starting targets. */
  goal?: string;
}

export interface Goals {
  dailySteps: number;
  weeklyWorkouts: number;
  targetWeightKg: number;
  dailyCalories: number;
  dailyProteinG: number;
  dailyWaterMl: number;
  /** Optional target for the calendar month (see lib/monthlyGoal). */
  monthly?: MonthlyGoalSetting | null;
}

export type MuscleGroup =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Arms'
  | 'Legs'
  | 'Glutes'
  | 'Core'
  | 'Full Body';

export interface Exercise {
  id: string;
  name: string;
  muscle: MuscleGroup;
  equipment: 'Barbell' | 'Dumbbell' | 'Machine' | 'Cable' | 'Bodyweight' | 'Kettlebell' | 'Band' | 'Smith Machine' | 'EZ Bar' | 'Trap Bar' | 'Plate' | 'Medicine Ball' | 'Suspension';
  /** Which movement the demo animation plays (see data/motions). */
  pattern?: import('../data/motions').PatternId;
}

export interface SetLog {
  reps: number;
  weightKg: number; // always stored in kg
  done: boolean;
}

export interface ExerciseLog {
  exerciseId: string;
  name: string;
  sets: SetLog[];
  /** Exercises side by side with the same group were done as a superset or circuit (see lib/supersets). */
  group?: string;
}

export interface PlanDay {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday
  title: string;
  kind: 'strength' | 'cardio' | 'mobility' | 'rest';
  exerciseIds?: string[];
  cardioType?: 'Running' | 'Walking' | 'Cycling' | 'HIIT' | 'Mobility';
  targetMinutes?: number;
  /** Distance target for the day, in kilometres. */
  targetKm?: number;
  /** An interval workout from data/intervals to preselect on the Start screen. */
  intervalId?: string;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  description: string;
  weeks: number;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  days: PlanDay[];
  /** Week-by-week schedule for plans that progress (race plans). days is the first week. */
  weekly?: PlanDay[][];
  isCustom?: boolean;
}

export interface ActivePlan {
  planId: string;
  startedAt: number;
  /** The plan itself, for built plans that are not in the built-in list. */
  plan?: WorkoutPlan;
}

export interface Routine {
  id: string;
  name: string;
  exerciseIds: string[];
}

export interface BodyEntry {
  id: string;
  date: string; // YYYY-MM-DD (local)
  weightKg: number;
  bodyFatPct?: number;
  waistCm?: number;
  chestCm?: number;
  hipsCm?: number;
  armCm?: number;
}

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

export interface FoodEntry {
  id: string;
  date: string; // YYYY-MM-DD (local)
  meal: MealType;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Extra detail kept when the food came from the search (older entries lack it). */
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  /** What was eaten in words, e.g. "1 cup (244 g)". */
  amount?: string;
  /** Index into the food groups (see lib/foodDb GROUPS), for the icon. */
  group?: number;
}

/** A group of foods saved to log together in one tap (a usual breakfast, a recipe). */
export interface SavedMeal {
  id: string;
  name: string;
  items: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number }[];
}

export type HealthLogKind = 'bp' | 'glucose' | 'med' | 'symptom';

/** One entry in the Health log: a blood-pressure or glucose reading, a medication taken, or a symptom. */
export interface HealthLogEntry {
  id: string;
  kind: HealthLogKind;
  /** Epoch ms of the reading. */
  at: number;
  systolic?: number;
  diastolic?: number;
  pulse?: number;
  /** Glucose in mg/dL. */
  mgdl?: number;
  relation?: 'fasting' | 'before' | 'after' | 'general';
  /** Medication or symptom name. */
  name?: string;
  dose?: string;
  /** Symptom severity 1-5. */
  severity?: number;
  note?: string;
  /** Came from Health Connect rather than being typed in. */
  imported?: boolean;
}

export interface WaterEntry {
  id: string;
  date: string;
  ml: number;
}

export interface ReminderSettings {
  workoutEnabled: boolean;
  workoutTime: string; // HH:MM
  bedtimeEnabled: boolean;
  bedtimeTime: string; // HH:MM
  hydrationEnabled: boolean;
  hydrationEveryMin: number;
  fastingEnabled: boolean;
  /** A live timer in the notification shade while a fast runs (on unless set to false). */
  fastingLive?: boolean;
  /** An alert each time a fast reaches its next stage (on unless set to false). */
  fastingStages?: boolean;
}

/** A target for the calendar month, shown on Home. Distance is in kilometres. */
export interface MonthlyGoalSetting {
  kind: 'distance' | 'workouts' | 'minutes';
  target: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress: number; // 0..1
  progressLabel: string;
}

export interface RunOptions {
  /** Pause the clock and distance automatically when you stop moving. */
  autoPause: boolean;
  /** Speak lap time and pace every kilometre or mile (Android app). */
  voiceCues: boolean;
  /** Include heart rate in the spoken update. */
  voiceHeartRate: boolean;
  /** Show a live map while a GPS workout runs. */
  liveMap: boolean;
}

export const DEFAULT_RUN_OPTIONS: RunOptions = { autoPause: false, voiceCues: false, voiceHeartRate: true, liveMap: true };
