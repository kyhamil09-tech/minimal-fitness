import { CORE_GOALS, CoreGoal } from '../data/vibes';
import { DEFAULT_GOALS, DEFAULT_PROFILE, suggestedGoals } from '../data/defaults';
import { Goals, Sex, UnitSystem, UserProfile } from '../types/tracking';
import { tdee } from './calc';

export interface OnboardingAnswers {
  goal: CoreGoal['id'] | null;
  name: string;
  units: UnitSystem;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
}

export const DEFAULT_ANSWERS: OnboardingAnswers = {
  goal: null,
  name: '',
  units: 'metric',
  sex: 'other',
  age: DEFAULT_PROFILE.age,
  heightCm: DEFAULT_PROFILE.heightCm,
  weightKg: DEFAULT_PROFILE.weightKg,
};

const round5 = (n: number) => Math.round(n / 5) * 5;

/** What each goal changes about the starting targets. Everything stays editable in Profile & goals afterwards. */
const BY_GOAL: Record<CoreGoal['id'], { steps: number; weekly: number; activity: UserProfile['activityLevel']; protein: number; calories: number }> = {
  run: { steps: 9000, weekly: 4, activity: 'active', protein: 1.6, calories: 0 },
  strength: { steps: 7500, weekly: 4, activity: 'moderate', protein: 2.0, calories: 150 },
  lose: { steps: 10000, weekly: 4, activity: 'light', protein: 1.8, calories: -400 },
  move: { steps: 8000, weekly: 3, activity: 'light', protein: 1.6, calories: 0 },
  sleep: { steps: 7000, weekly: 3, activity: 'light', protein: 1.6, calories: 0 },
  balance: { steps: 8000, weekly: 3, activity: 'moderate', protein: 1.6, calories: 0 },
};

/** Turns the few answers into a saved profile, daily and weekly targets, and the tab to open on the first day. */
export const buildFromAnswers = (a: OnboardingAnswers): { profile: UserProfile; goals: Goals; startTab: 'today' | 'exercise' | 'sleep' } => {
  const rule = a.goal ? BY_GOAL[a.goal] : null;
  const profile: UserProfile = {
    ...DEFAULT_PROFILE,
    name: a.name.trim().slice(0, 30),
    age: Math.min(100, Math.max(10, Math.round(a.age))),
    sex: a.sex,
    heightCm: Math.min(250, Math.max(100, a.heightCm)),
    weightKg: Math.min(300, Math.max(30, a.weightKg)),
    units: a.units,
    activityLevel: rule?.activity ?? DEFAULT_PROFILE.activityLevel,
    onboarded: true,
    goal: a.goal ?? undefined,
  };
  const base = suggestedGoals(profile, { dailySteps: rule?.steps ?? DEFAULT_GOALS.dailySteps, weeklyWorkouts: rule?.weekly ?? DEFAULT_GOALS.weeklyWorkouts });
  const maintenance = tdee(profile);
  const goals: Goals = {
    ...base,
    dailyCalories: Math.max(1400, round5(maintenance + (rule?.calories ?? 0))),
    dailyProteinG: Math.round(profile.weightKg * (rule?.protein ?? 1.6)),
    targetWeightKg: a.goal === 'lose' ? Math.round(profile.weightKg * 0.94 * 2) / 2 : profile.weightKg,
  };
  const startTab = (CORE_GOALS.find((g) => g.id === a.goal)?.start ?? 'today') as 'today' | 'exercise' | 'sleep';
  return { profile, goals, startTab };
};
