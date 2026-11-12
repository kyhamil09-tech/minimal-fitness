import { MealType } from '../types/tracking';

/**
 * The words and fixed lists of the Eat app: eating styles, how a day feels, the voice of the notes. The tone is warm and a little bold:
 * it never scolds, never shows going over as a failure, and keeps the numbers honest.
 */

export const MEALS: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export const MEAL_HINT: Record<MealType, string> = {
  Breakfast: 'The first plate of the day',
  Lunch: 'Midday, with a fork and a minute',
  Dinner: 'The long table',
  Snack: 'Small things, honestly counted',
};

export interface EatStyle {
  id: string;
  name: string;
  line: string;
  /** Share of the calories left after protein that comes from fat (the rest is carbohydrate). */
  fatShare: number;
  /** An upper limit on carbohydrate, g a day, for the lowest-carb styles. */
  carbCapG?: number;
  /** Protein to suggest, g per kg of body weight, when the style is applied. */
  proteinPerKg?: number;
  /** Fiber to aim for, g a day. Unset: 14 g for every 1,000 kcal. */
  fiberG?: number;
}

export const STYLES: EatStyle[] = [
  { id: 'balanced', name: 'Balanced', line: 'A bit of everything. Carbs, fat and protein all get a seat.', fatShare: 0.35 },
  { id: 'protein', name: 'High protein', line: 'Protein first: good for training and for staying full.', fatShare: 0.38, proteinPerKg: 2 },
  { id: 'mediterranean', name: 'Mediterranean', line: 'Olive oil, fish, beans, vegetables, whole grains.', fatShare: 0.42, fiberG: 30 },
  { id: 'plant', name: 'Plant-forward', line: 'Mostly plants: beans, grains, nuts, fruit and lots of fiber.', fatShare: 0.3, fiberG: 35 },
  { id: 'lowcarb', name: 'Lower carb', line: 'Fewer carbs, more fat and protein, still real food.', fatShare: 0.58, proteinPerKg: 1.8 },
  { id: 'keto', name: 'Keto', line: 'Very low carb. Talk to a doctor first if you take medicine or have a condition.', fatShare: 0.85, carbCapG: 30, proteinPerKg: 1.6 },
];

export const styleById = (id: string | undefined): EatStyle => STYLES.find((s) => s.id === id) ?? STYLES[0];

export const FEELINGS: { id: string; label: string }[] = [
  { id: 'satisfied', label: 'Satisfied' },
  { id: 'energized', label: 'Energized' },
  { id: 'calm', label: 'Calm' },
  { id: 'hungry', label: 'Hungry' },
  { id: 'stuffed', label: 'Stuffed' },
  { id: 'cravings', label: 'Cravings' },
];

/** Foods with typical values, offered when your own history is too short to suggest from. Approximate, from common reference data. */
export interface Starter {
  name: string;
  amount: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  group: number;
}

export const STARTERS: Starter[] = [
  { name: 'Greek yogurt, plain nonfat', amount: '3/4 cup (170 g)', calories: 100, proteinG: 17, carbsG: 6, fatG: 1, fiberG: 0, group: 1 },
  { name: 'Eggs', amount: '2 large', calories: 143, proteinG: 13, carbsG: 1, fatG: 10, fiberG: 0, group: 2 },
  { name: 'Cottage cheese', amount: '1/2 cup (113 g)', calories: 92, proteinG: 12, carbsG: 5, fatG: 3, fiberG: 0, group: 1 },
  { name: 'Chicken breast, cooked', amount: '100 g', calories: 165, proteinG: 31, carbsG: 0, fatG: 4, fiberG: 0, group: 4 },
  { name: 'Tuna, canned in water', amount: '1 can, drained (142 g)', calories: 120, proteinG: 27, carbsG: 0, fatG: 1, fiberG: 0, group: 5 },
  { name: 'Salmon, baked', amount: '100 g', calories: 206, proteinG: 22, carbsG: 0, fatG: 12, fiberG: 0, group: 5 },
  { name: 'Lentils, cooked', amount: '1 cup (198 g)', calories: 230, proteinG: 18, carbsG: 40, fatG: 1, fiberG: 16, group: 10 },
  { name: 'Black beans, cooked', amount: '1 cup (172 g)', calories: 227, proteinG: 15, carbsG: 41, fatG: 1, fiberG: 15, group: 10 },
  { name: 'Edamame, shelled', amount: '1 cup (155 g)', calories: 188, proteinG: 18, carbsG: 14, fatG: 8, fiberG: 8, group: 10 },
  { name: 'Almonds', amount: '1 oz (28 g)', calories: 164, proteinG: 6, carbsG: 6, fatG: 14, fiberG: 4, group: 10 },
  { name: 'Raspberries', amount: '1 cup (123 g)', calories: 64, proteinG: 2, carbsG: 15, fatG: 1, fiberG: 8, group: 8 },
  { name: 'Apple', amount: '1 medium', calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3, fiberG: 4.4, group: 8 },
  { name: 'Oats, dry', amount: '1/2 cup (40 g)', calories: 150, proteinG: 5, carbsG: 27, fatG: 3, fiberG: 4, group: 6 },
  { name: 'Broccoli, cooked', amount: '1 cup (156 g)', calories: 55, proteinG: 4, carbsG: 11, fatG: 1, fiberG: 5, group: 9 },
  { name: 'Whey protein shake', amount: '1 scoop (30 g)', calories: 120, proteinG: 24, carbsG: 3, fatG: 2, fiberG: 0, group: 14 },
];

export const REMIND_TEXT: Record<'breakfast' | 'lunch' | 'dinner' | 'review', { title: string; body: string; label: string }> = {
  breakfast: { title: 'Breakfast?', body: 'Log it while it is fresh. One tap from your usual.', label: 'Breakfast' },
  lunch: { title: 'Lunch o’clock', body: 'A moment at the table, then a moment in the log.', label: 'Lunch' },
  dinner: { title: 'Dinner time', body: 'Log it now, enjoy it fully. No homework later.', label: 'Dinner' },
  review: { title: 'How did today eat?', body: 'Anything missing from the log? A quick look takes a minute.', label: 'Evening look-back' },
};
