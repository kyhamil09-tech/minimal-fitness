import type { FoodEntry, MealType } from '../types/tracking';
import { addDays } from './dates';

/**
 * Speed-ups for logging food: the foods you eat most (to log in one tap), which meal it is likely to be, and yesterday's meals to repeat.
 * All of it is worked out from your own log on the phone.
 */

/** The meal that fits a time of day: breakfast to 10:30, lunch to 15:00, dinner to 21:00, then snack. */
export const mealForHour = (hour: number): MealType => (hour < 10.5 ? 'Breakfast' : hour < 15 ? 'Lunch' : hour < 21 ? 'Dinner' : 'Snack');

export const mealNow = (now: Date = new Date()): MealType => mealForHour(now.getHours() + now.getMinutes() / 60);

export interface QuickFood {
  /** Same food, same amount. */
  key: string;
  entry: Omit<FoodEntry, 'id' | 'date' | 'meal'>;
  /** The meal you usually have it at. */
  meal: MealType;
  /** How much of the time it is at that meal, 0 to 1. */
  share: number;
  count: number;
  lastDate: string;
}

const keyOf = (f: Pick<FoodEntry, 'name' | 'amount'>): string => `${f.name.trim().toLowerCase()}|${(f.amount ?? '').trim().toLowerCase()}`;

const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000);

/**
 * The foods you log most, newest habits first: how often in the last `days` days, with a little extra for the recent ones so
 * something you have eaten every day this week beats something you had three times last month.
 */
export const quickFoods = (food: FoodEntry[], today: string, max = 8, days = 45): QuickFood[] => {
  const groups = new Map<string, { sample: FoodEntry; count: number; last: string; meals: Map<MealType, number> }>();
  for (const f of food) {
    const age = daysBetween(f.date, today);
    if (age < 0 || age > days || f.calories <= 0) continue;
    const k = keyOf(f);
    const g = groups.get(k) ?? { sample: f, count: 0, last: f.date, meals: new Map() };
    g.count++;
    if (f.date >= g.last) {
      g.last = f.date;
      g.sample = f;
    }
    g.meals.set(f.meal, (g.meals.get(f.meal) ?? 0) + 1);
    groups.set(k, g);
  }
  const scored = [...groups.entries()].map(([key, g]) => {
    const age = Math.max(0, daysBetween(g.last, today));
    const score = g.count + 3 / (1 + age / 7);
    const [meal, atMeal] = [...g.meals.entries()].sort((a, b) => b[1] - a[1])[0];
    const { id: _id, date: _date, meal: _meal, ...entry } = g.sample;
    void _id;
    void _date;
    void _meal;
    return { key, entry, meal, share: atMeal / g.count, count: g.count, lastDate: g.last, score };
  });
  return scored.sort((a, b) => b.score - a.score || (a.lastDate < b.lastDate ? 1 : -1)).slice(0, max).map(({ score: _s, ...rest }) => (void _s, rest));
};

/**
 * The meal a one-tap food goes in: the one you usually have it at when that is a clear habit (three or more times, at least 70% at the
 * same meal), otherwise the meal for the time of day.
 */
export const mealForQuick = (q: Pick<QuickFood, 'meal' | 'share' | 'count'>, now: Date = new Date()): MealType => (q.count >= 3 && q.share >= 0.7 ? q.meal : mealNow(now));

/** What was eaten on `date`, ready to log again (optionally just one meal). */
export const entriesToRepeat = (food: FoodEntry[], date: string, meal?: MealType): Omit<FoodEntry, 'id' | 'date'>[] =>
  food
    .filter((f) => f.date === date && (!meal || f.meal === meal))
    .map(({ id: _id, date: _date, ...rest }) => (void _id, void _date, rest));

/** The day before `date`, and a short summary of what was eaten then. */
export const yesterdayOf = (date: string): string => addDays(date, -1);

export const summarize = (items: Pick<FoodEntry, 'calories'>[]): { count: number; kcal: number } => ({ count: items.length, kcal: Math.round(items.reduce((s, i) => s + i.calories, 0)) });
