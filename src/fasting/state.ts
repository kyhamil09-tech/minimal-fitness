import React from 'react';
import { FastingSession, SleepLogEntry, WorkoutSession } from '../types/health';
import { BodyEntry, FoodEntry, UnitSystem } from '../types/tracking';
import { SCREEN_QUESTIONS } from './content';
import { FastExtras, FastPlan } from './model';

/** Settings of the Fasting side, kept on the phone. */
export interface FastPrefs {
  /** The "before you start" questions have been answered. */
  screened: boolean;
  /** Ids of the questions answered yes. */
  flags: string[];
  /** Show the times and the plan, but not stages, percentages, streaks or success rates. */
  gentle: boolean;
  /** Water-and-salts reminders during fasts of 24 hours or more. Unset means on. */
  electrolytes?: boolean;
  /** Metric or US units for water, weight and glucose. Unset: follow the app's own setting. */
  units?: UnitSystem;
}

export const DEFAULT_PREFS: FastPrefs = { screened: false, flags: [], gentle: false };

/** A yes to one of these means fasting is not for you here: starting a fast is switched off. */
export const isBlocked = (p: FastPrefs): boolean => p.flags.some((id) => SCREEN_QUESTIONS.find((q) => q.id === id)?.stop);

/** Fasting is allowed once the questions are answered and none of the stop questions was a yes. */
export const canStart = (p: FastPrefs): boolean => p.screened && !isBlocked(p);

/** What every page of the Fasting app is given. */
export interface FastCtx {
  sessions: FastingSession[];
  setSessions: React.Dispatch<React.SetStateAction<FastingSession[]>>;
  extras: FastExtras;
  setExtras: React.Dispatch<React.SetStateAction<FastExtras>>;
  plan: FastPlan;
  setPlan: (p: FastPlan) => void;
  prefs: FastPrefs;
  setPrefs: (p: FastPrefs) => void;
  sleepLogs: SleepLogEntry[];
  workouts: WorkoutSession[];
  body: BodyEntry[];
  /** Metric or imperial, as chosen here or else as set for the whole app. */
  units: UnitSystem;
  /** Everything logged in Eat, for the meals and the eating window shown here. */
  food: FoodEntry[];
  /** Leaves Fasting for the Eat app. */
  openEat: () => void;
  /** The color the app is in when no stage is showing (from its look). */
  accent: string;
  /** The saved look and how to change it. */
  miniLook: import('../hooks/useMiniLook').MiniLookApi;
  appAccent: string;
  /** Adds water to the day's water log (outside the fast's own record). */
  onAddWater: (ml: number) => void;
  /** Removes a glass from the fast's record and from the day's water log. */
  removeWater: (sessionId: string, index: number) => void;
  /** Removes a logged salt or electrolyte from the fast's record. */
  removeSalt: (sessionId: string, index: number) => void;
  /** Goes to the food log to add a meal. */
  onLogMeal: () => void;
  /** Starts a fast, through the screening and the confirmation for long ones. */
  requestStart: (opts: { targetHours: number; protocolName: string; startedAt?: number }) => void;
}
