import type { MealType, SavedMeal } from '../types/tracking';
import { addDays } from './dates';

/** One saved meal planned for a meal slot of a day. */
export interface PlannedMeal {
  id: string;
  date: string;
  meal: MealType;
  savedMealId: string;
  /** When it was logged as eaten, so it is not logged twice by accident. */
  loggedAt?: number;
}

export const MEAL_ORDER: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export interface Macros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** The seven dates of the week that starts on `weekStart`. */
export const weekDates = (weekStart: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

export const mealTotals = (meal: SavedMeal): Macros =>
  meal.items.reduce<Macros>(
    (t, i) => ({ calories: t.calories + i.calories, proteinG: t.proteinG + i.proteinG, carbsG: t.carbsG + i.carbsG, fatG: t.fatG + i.fatG }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );

export const plannedIn = (plan: PlannedMeal[], date: string, meal: MealType): PlannedMeal[] =>
  plan.filter((p) => p.date === date && p.meal === meal);

export const addPlanned = (plan: PlannedMeal[], date: string, meal: MealType, savedMealId: string, id: string): PlannedMeal[] => [
  ...plan,
  { id, date, meal, savedMealId },
];

export const removePlanned = (plan: PlannedMeal[], id: string): PlannedMeal[] => plan.filter((p) => p.id !== id);

export const markLogged = (plan: PlannedMeal[], id: string, at: number): PlannedMeal[] => plan.map((p) => (p.id === id ? { ...p, loggedAt: at } : p));

/** Planned calories and macros for a day. Meals that were since deleted from the saved list count for nothing. */
export const plannedDayTotals = (plan: PlannedMeal[], meals: SavedMeal[], date: string): Macros => {
  const byId = new Map(meals.map((m) => [m.id, m]));
  return plan
    .filter((p) => p.date === date)
    .reduce<Macros>(
      (t, p) => {
        const m = byId.get(p.savedMealId);
        if (!m) return t;
        const x = mealTotals(m);
        return { calories: t.calories + x.calories, proteinG: t.proteinG + x.proteinG, carbsG: t.carbsG + x.carbsG, fatG: t.fatG + x.fatG };
      },
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
    );
};

/** Copies every planned meal of one week to the same weekdays of another (not marked as logged). Existing meals there are kept. */
export const copyWeek = (plan: PlannedMeal[], fromStart: string, toStart: string, newId: () => string): PlannedMeal[] => {
  const from = weekDates(fromStart);
  const to = weekDates(toStart);
  const added: PlannedMeal[] = [];
  for (const p of plan) {
    const i = from.indexOf(p.date);
    if (i < 0) continue;
    const exists = plan.some((q) => q.date === to[i] && q.meal === p.meal && q.savedMealId === p.savedMealId);
    if (!exists) added.push({ id: newId(), date: to[i], meal: p.meal, savedMealId: p.savedMealId });
  }
  return added.length ? [...plan, ...added] : plan;
};

export interface GroceryItem {
  /** Same food written differently ("Greek  yogurt", "greek yogurt") shares one key. */
  key: string;
  /** How it was first written. */
  name: string;
  /** How many times it appears across the planned meals. */
  count: number;
  /** The saved meals that use it. */
  meals: string[];
}

export const groceryKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Everything the planned meals of the given dates call for, one line per food, alphabetical. */
export const groceryList = (plan: PlannedMeal[], meals: SavedMeal[], dates: string[]): GroceryItem[] => {
  const byId = new Map(meals.map((m) => [m.id, m]));
  const inWeek = new Set(dates);
  const map = new Map<string, GroceryItem>();
  for (const p of plan) {
    if (!inWeek.has(p.date)) continue;
    const meal = byId.get(p.savedMealId);
    if (!meal) continue;
    for (const item of meal.items) {
      const key = groceryKey(item.name);
      if (!key) continue;
      const cur = map.get(key) ?? { key, name: item.name.trim(), count: 0, meals: [] };
      cur.count += 1;
      if (!cur.meals.includes(meal.name)) cur.meals.push(meal.name);
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export interface ExtraItem {
  id: string;
  name: string;
}

/** Plain text of the list for sharing: ticked items are marked, counts above one are shown. */
export const groceryText = (title: string, items: GroceryItem[], extras: ExtraItem[], checked: Record<string, boolean>): string => {
  const lines = [title];
  for (const i of items) lines.push(`${checked[i.key] ? '[x]' : '[ ]'} ${i.name}${i.count > 1 ? ` x${i.count}` : ''}`);
  for (const e of extras) lines.push(`${checked[`extra:${e.id}`] ? '[x]' : '[ ]'} ${e.name}`);
  return lines.join('\n');
};
