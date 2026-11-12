import React from 'react';
import { WorkoutSession } from '../types/health';
import { BodyEntry, FoodEntry, Goals, MealType, SavedMeal, UnitSystem, UserProfile, WaterEntry } from '../types/tracking';
import { MealPlanState } from '../hooks/useMealPlan';
import { ColorPalette } from '../types/theme';
import { FastPlan } from '../fasting/model';
import { DietPrefs, NO_DIET, normalizeDiet } from './diet';
import { DayNotes, DaySplit } from './model';

export type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'review';

export interface EatReminders {
  on: boolean;
  /** Which of the four are switched on. */
  which: Record<MealKey, boolean>;
  /** "HH:MM" for each. */
  times: Record<MealKey, string>;
}

/** Settings of the Eat side, kept on the phone. */
export interface EatPrefs {
  /** An eating style (see content STYLES): it sets the carbohydrate and fat targets from the calorie and protein goals. */
  style: string;
  /** Show the week as the budget, with what each remaining day can average. */
  flex: boolean;
  /** Add the calories burned in workouts back to the day's budget. */
  activity: boolean;
  /** The calm view: no calorie numbers on Today, only words. Everything is still logged. */
  calm: boolean;
  /** Different calorie targets for rest days and training days. */
  split: DaySplit;
  /** Daily limits to watch, in mg of sodium and g of sugar. 0 means no target. */
  sodiumMg: number;
  sugarG: number;
  /** Foods to leave out of the finder, the ideas and the pantry suggestions. */
  diet: DietPrefs;
  reminders: EatReminders;
}

export const DEFAULT_PREFS: EatPrefs = {
  style: 'balanced',
  flex: false,
  activity: true,
  calm: false,
  split: { on: false, restKcal: 0, trainKcal: 0 },
  sodiumMg: 2300,
  sugarG: 0,
  diet: NO_DIET,
  reminders: {
    on: false,
    which: { breakfast: true, lunch: true, dinner: true, review: false },
    times: { breakfast: '08:00', lunch: '12:30', dinner: '18:30', review: '21:00' },
  },
};

export type AddStart = 'search' | 'scan' | 'recipe' | 'import' | 'create' | 'photo';

/** What every page of the Eat app is given. */
export interface EatCtx {
  /** The palette the food finder and shared sheets use inside Eat. */
  calendarTheme: ColorPalette;
  /** The saved look and how to change it, and the main app's accent for "Match the app". */
  miniLook: import('../hooks/useMiniLook').MiniLookApi;
  appAccent: string;
  name: string;
  profile: UserProfile;
  units: UnitSystem;
  goals: Goals;
  food: FoodEntry[];
  water: WaterEntry[];
  savedMeals: SavedMeal[];
  workouts: WorkoutSession[];
  body: BodyEntry[];
  mealPlan: MealPlanState;
  /** A fast that is running right now, from the Fasting side. */
  fast: { startedAt: number; targetHours: number } | null;
  /** The Fasting plan (for the eating window), and whether Fasting has been used at all. */
  fastPlan: FastPlan;
  fastsUsed: boolean;
  /** A strength or cardio session is planned for today. */
  plannedTraining: boolean;
  /** Logs a weigh-in (the same list Progress reads). */
  onAddBody: (entry: { date: string; weightKg: number }) => void;
  prefs: EatPrefs;
  setPrefs: (p: EatPrefs) => void;
  notes: Record<string, DayNotes>;
  setNotes: React.Dispatch<React.SetStateAction<Record<string, DayNotes>>>;
  /** The day being looked at, and today. */
  date: string;
  today: string;
  setDate: (d: string) => void;
  onAddFood: (date: string, food: Omit<FoodEntry, 'id' | 'date'>) => string | void;
  onDeleteFood: (id: string) => void;
  onUpdateFood: (id: string, patch: Partial<FoodEntry>) => void;
  onAddWater: (date: string, ml: number) => void;
  onDeleteWater: (id: string) => void;
  onSaveMeal: (name: string, items: SavedMeal['items']) => void;
  onDeleteMeal: (id: string) => void;
  onSetGoals: (patch: Partial<Goals>) => void;
  /** Opens the food finder for a meal, optionally straight onto the scanner, a new recipe and so on. */
  openAdd: (meal?: MealType, start?: AddStart) => void;
  openVoice: () => void;
  /** A short note at the bottom with an optional undo. */
  say: (text: string, undo?: () => void) => void;
  openFasting: () => void;
}

/** The stored prefs made whole: anything missing falls back to the default. */
export const normalizeEatPrefs = (stored: Partial<EatPrefs> | null | undefined): EatPrefs => ({
  ...DEFAULT_PREFS,
  ...stored,
  split: { ...DEFAULT_PREFS.split, ...stored?.split },
  diet: normalizeDiet(stored?.diet),
  reminders: {
    ...DEFAULT_PREFS.reminders,
    ...stored?.reminders,
    which: { ...DEFAULT_PREFS.reminders.which, ...stored?.reminders?.which },
    times: { ...DEFAULT_PREFS.reminders.times, ...stored?.reminders?.times },
  },
});
