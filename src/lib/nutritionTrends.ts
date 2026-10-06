import { lastNDayKeys } from './dates';

/** A day counts as on target for calories when it lands within this share either side of the goal. */
export const CALORIE_TOLERANCE = 0.1;
/** ...and for protein when it reaches at least this share of the goal. */
export const PROTEIN_MIN_SHARE = 0.9;

export interface NutritionDay {
  date: string;
  /** Something was logged that day. Days with nothing logged are left out of every average. */
  logged: boolean;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface NutritionSummary {
  days: NutritionDay[];
  loggedDays: number;
  avgCalories: number;
  avgProteinG: number;
  avgCarbsG: number;
  avgFatG: number;
  /** Where the calories come from, in whole percent that add up to 100. Null when nothing was logged. */
  split: { protein: number; carbs: number; fat: number } | null;
  /** Average calories minus the goal, for the days that were logged (negative means under). Undefined with no goal or no days. */
  calorieDelta?: number;
  daysOnCalories: number;
  daysOnProtein: number;
}

interface FoodLike {
  date: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Whole percentages of three shares that always add up to 100 (the largest remainders take the rounding). */
export const wholePercents = (parts: [number, number, number]): [number, number, number] | null => {
  const total = parts.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  const exact = parts.map((p) => (p / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]++;
    left--;
  }
  return [floors[0], floors[1], floors[2]];
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** The last `rangeDays` days of food logged, with averages and how many days hit the calorie and protein goals. */
export const buildNutrition = (
  food: FoodLike[],
  goals: { dailyCalories: number; dailyProteinG: number },
  rangeDays: number,
  today: string
): NutritionSummary => {
  const byDate = new Map<string, NutritionDay>();
  for (const f of food) {
    const d = byDate.get(f.date) ?? { date: f.date, logged: true, calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    d.calories += f.calories;
    d.proteinG += f.proteinG;
    d.carbsG += f.carbsG;
    d.fatG += f.fatG;
    byDate.set(f.date, d);
  }
  const days = lastNDayKeys(rangeDays, today).map((date) => byDate.get(date) ?? { date, logged: false, calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const logged = days.filter((d) => d.logged);
  const avgCalories = avg(logged.map((d) => d.calories));
  const avgProteinG = avg(logged.map((d) => d.proteinG));
  const avgCarbsG = avg(logged.map((d) => d.carbsG));
  const avgFatG = avg(logged.map((d) => d.fatG));
  const split = wholePercents([avgProteinG * 4, avgCarbsG * 4, avgFatG * 9]);
  return {
    days,
    loggedDays: logged.length,
    avgCalories,
    avgProteinG,
    avgCarbsG,
    avgFatG,
    split: split ? { protein: split[0], carbs: split[1], fat: split[2] } : null,
    calorieDelta: logged.length > 0 && goals.dailyCalories > 0 ? avgCalories - goals.dailyCalories : undefined,
    daysOnCalories:
      goals.dailyCalories > 0 ? logged.filter((d) => Math.abs(d.calories - goals.dailyCalories) <= goals.dailyCalories * CALORIE_TOLERANCE).length : 0,
    daysOnProtein: goals.dailyProteinG > 0 ? logged.filter((d) => d.proteinG >= goals.dailyProteinG * PROTEIN_MIN_SHARE).length : 0,
  };
};
