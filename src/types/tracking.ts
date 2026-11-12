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
  | 'Full Body'
  | 'Warm-up'
  | 'Stretch'
  | 'Cardio';

export interface Exercise {
  id: string;
  name: string;
  muscle: MuscleGroup;
  equipment: 'Barbell' | 'Dumbbell' | 'Machine' | 'Cable' | 'Bodyweight' | 'Kettlebell' | 'Band' | 'Smith Machine' | 'EZ Bar' | 'Trap Bar' | 'Plate' | 'Medicine Ball' | 'Suspension' | 'Other';
  /** Which movement the demo animation plays (see data/motions). */
  pattern?: import('../data/motions').PatternId;
  /** An exercise the person made themselves (see data/exercises). */
  custom?: boolean;
  /** Done for time (a plank) rather than reps. */
  timed?: boolean;
}

export type SetKind = 'normal' | 'warmup' | 'drop' | 'failure';

export interface SetLog {
  reps: number;
  weightKg: number; // always stored in kg
  done: boolean;
  /** Missing means a normal set. */
  kind?: SetKind;
  /** How hard that set was, 1 to 10. */
  rpe?: number;
  /** Seconds held, for timed exercises (reps is 0 then). */
  seconds?: number;
  /**
   * For a bodyweight exercise: what was added to your bodyweight (a belt, a vest) or taken off by help (a machine, a band), in kg.
   * weightKg then holds the load you actually moved (bodyweight plus or minus this), so records and volume work as usual.
   */
  load?: { mode: 'added' | 'assisted'; kg: number };
}

export interface ExerciseLog {
  exerciseId: string;
  name: string;
  sets: SetLog[];
  /** Exercises side by side with the same group were done as a superset or circuit (see lib/supersets). */
  group?: string;
  /** A note on this exercise for this session. */
  note?: string;
}

export interface PlanDay {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday
  title: string;
  kind: 'strength' | 'cardio' | 'mobility' | 'rest';
  exerciseIds?: string[];
  cardioType?: 'Running' | 'Walking' | 'Cycling' | 'HIIT' | 'Mobility';
  targetMinutes?: number;
  /** Distance target for the day, in kilometers. */
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
  /** Sessions moved to another day of a week after a missed day (see lib/planReshuffle). */
  moves?: import('../lib/planReshuffle').PlanMove[];
}

/** One set a routine asks for. Weight is in kg like everywhere else; a timed set carries seconds instead of reps. */
export interface RoutineSet {
  reps: number;
  weightKg: number;
  kind?: SetKind;
  seconds?: number;
}

export interface Routine {
  id: string;
  name: string;
  exerciseIds: string[];
  /** The sets planned for each exercise (by exercise id): how many, and the reps and weight to start from. */
  targets?: Record<string, RoutineSet[]>;
  /** The days it is scheduled for, 0 = Monday to 6 = Sunday. */
  days?: number[];
  /** The folder it is kept in (Lift side), if any. */
  folder?: string;
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
  /** Vitamins and minerals in what was eaten, when the food's source had them (see lib/micros). */
  micros?: import('../lib/micros').Micros;
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
  /** The fasting notification as the glow card (default) rather than the system live update. */
  fastingGlow?: boolean;
  /** An alert each time a fast reaches its next stage (on unless set to false). */
  fastingStages?: boolean;
  /** An evening nudge to keep a streak alive when nothing is logged yet. */
  streakEnabled?: boolean;
  streakTime?: string; // HH:MM
}

/** A target for the calendar month, shown on Home. Distance is in kilometers. */
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
  /** Speak lap time and pace every kilometer or mile (Android app). */
  voiceCues: boolean;
  /** Include heart rate in the spoken update. */
  voiceHeartRate: boolean;
  /** Show a live map while a GPS workout runs. */
  liveMap: boolean;
}

export const DEFAULT_RUN_OPTIONS: RunOptions = { autoPause: true, voiceCues: false, voiceHeartRate: true, liveMap: true };

