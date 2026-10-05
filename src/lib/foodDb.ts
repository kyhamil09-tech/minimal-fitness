import { FOOD_DATABASE } from '../data/foods';

/**
 * The food database the search runs over. About 13,000 everyday foods come from the US government's USDA FoodData Central (public
 * domain; see tools/build-food-db.mjs), each with calories, protein, carbs, fat, fibre, sugar, sodium per 100 g and its usual portions
 * ("1 cup", "1 slice"). A small hand-picked list of the most common foods sits in front of them, packaged foods you look up online
 * are turned into the same shape, and so are the foods you make yourself.
 */
export type FoodSource = 'curated' | 'fndds' | 'sr' | 'off' | 'mine';

export interface Portion {
  label: string;
  /** Grams in one of this portion. */
  g: number;
}

export interface FoodRecord {
  id: string;
  name: string;
  /** Index into {@link GROUPS}. */
  group: number;
  src: FoodSource;
  /** Per 100 g, or per serving when {@link perServing} is set. */
  kcal: number;
  p: number;
  c: number;
  f: number;
  fiber: number;
  sugar: number;
  /** Milligrams. */
  sodium: number;
  portions: Portion[];
  /** The numbers are for one serving (the portions list holds that serving's name) rather than 100 g. */
  perServing?: boolean;
  brand?: string;
  barcode?: string;
}

export const GROUPS = ['Other', 'Dairy', 'Eggs', 'Meat', 'Poultry', 'Fish and seafood', 'Grains and pasta', 'Bread and baking', 'Fruit', 'Vegetables', 'Beans, nuts and seeds', 'Oils, sauces and spices', 'Sweets and desserts', 'Snacks', 'Drinks', 'Alcohol', 'Meals and dishes'] as const;

type Raw = [string, number, number, number, number, number, number, number, number, number, [string, number][]];

const fromRaw = (r: Raw, i: number): FoodRecord => ({
  id: `usda:${i}`,
  name: r[0],
  group: r[1],
  src: r[2] === 1 ? 'fndds' : 'sr',
  kcal: r[3],
  p: r[4],
  c: r[5],
  f: r[6],
  fiber: r[7],
  sugar: r[8],
  sodium: r[9],
  portions: r[10].map(([label, g]) => ({ label, g })),
});

let usda: Promise<FoodRecord[]> | null = null;

/** Loads the USDA foods the first time they are needed (a separate chunk, so the app starts as fast as before). */
export const loadUsda = (): Promise<FoodRecord[]> => {
  usda ??= import('../data/usda/foods.json').then((m) => (m.default as unknown as { foods: Raw[] }).foods.map(fromRaw));
  return usda;
};

/** Keywords that tell which group a hand-picked food belongs to. */
const guessGroup = (name: string): number => {
  const n = name.toLowerCase();
  const rules: [RegExp, number][] = [
    [/egg/, 2], [/chicken|turkey/, 4], [/salmon|tuna|shrimp|fish|cod/, 5], [/beef|pork|bacon|steak|ham|sausage|lamb/, 3],
    [/milk|yogurt|cheese|cottage|butter/, 1], [/bread|bagel|tortilla|muffin|toast|cake|cookie/, 7], [/rice|pasta|oat|cereal|quinoa|noodle|granola/, 6],
    [/apple|banana|berr|orange|grape|mango|pineapple|melon|peach|pear|fruit|avocado/, 8], [/broccoli|spinach|carrot|salad|tomato|potato|pepper|onion|lettuce|vegetable|corn|bean sprout/, 9],
    [/bean|lentil|chickpea|almond|nut|peanut|seed|tofu|hummus/, 10], [/oil|sauce|dressing|mayo|ketchup|mustard|jam|honey|syrup/, 11],
    [/chocolate|candy|ice cream|sweet|dessert|sugar/, 12], [/chip|popcorn|cracker|bar|pretzel/, 13], [/juice|coffee|tea|soda|water|smoothie|drink|shake/, 14],
    [/beer|wine|vodka|whiskey/, 15], [/pizza|burger|sandwich|soup|burrito|taco|stir|sushi|wrap|curry|lasagna/, 16],
  ];
  return rules.find(([re]) => re.test(n))?.[1] ?? 0;
};

/** The hand-picked everyday foods, shown first. Their numbers are per serving. */
export const curatedFoods = (): FoodRecord[] =>
  FOOD_DATABASE.map((f, i) => {
    const base = { id: `curated:${i}`, name: f.name, group: guessGroup(f.name), src: 'curated' as const, fiber: 0, sugar: 0, sodium: 0 };
    // "170 g" and "100 g" servings can be weighed, so those are stored per 100 g and can be logged in grams, ounces or servings.
    const grams = /^(\d+(?:\.\d+)?)\s*g$/.exec(f.serving.trim());
    if (grams && parseFloat(grams[1]) > 0) {
      const g = parseFloat(grams[1]);
      const k = 100 / g;
      const r1 = (n: number) => Math.round(n * k * 10) / 10;
      return { ...base, kcal: Math.round(f.calories * k), p: r1(f.proteinG), c: r1(f.carbsG), f: r1(f.fatG), portions: [{ label: `1 serving (${g} g)`, g }] };
    }
    return { ...base, kcal: f.calories, p: f.proteinG, c: f.carbsG, f: f.fatG, portions: [{ label: f.serving, g: 1 }], perServing: true };
  });

export interface Nutrients {
  kcal: number;
  p: number;
  c: number;
  f: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export type UnitKey = 'g' | 'oz' | `p${number}`;

const OZ = 28.3495;

/** How much of the record's per-100 g (or per-serving) numbers one unit amount is. */
export const factorFor = (r: FoodRecord, unit: UnitKey, qty: number): number => {
  if (r.perServing) return Math.max(0, qty);
  const grams = unit === 'g' ? qty : unit === 'oz' ? qty * OZ : qty * (r.portions[Number(unit.slice(1))]?.g ?? 100);
  return Math.max(0, grams) / 100;
};

export const gramsFor = (r: FoodRecord, unit: UnitKey, qty: number): number =>
  r.perServing ? 0 : unit === 'g' ? qty : unit === 'oz' ? qty * OZ : qty * (r.portions[Number(unit.slice(1))]?.g ?? 100);

const r1 = (n: number) => Math.round(n * 10) / 10;

export const nutrientsFor = (r: FoodRecord, unit: UnitKey, qty: number): Nutrients => {
  const k = factorFor(r, unit, qty);
  return { kcal: Math.round(r.kcal * k), p: r1(r.p * k), c: r1(r.c * k), f: r1(r.f * k), fiber: r1(r.fiber * k), sugar: r1(r.sugar * k), sodium: Math.round(r.sodium * k) };
};

/** The amount a food opens with: its first portion (a cup, a slice, a serving), or 100 g when it has none. */
export const defaultAmount = (r: FoodRecord): { unit: UnitKey; qty: number } =>
  r.portions.length > 0 ? { unit: 'p0', qty: 1 } : { unit: 'g', qty: 100 };

export const unitLabel = (r: FoodRecord, unit: UnitKey): string => (unit === 'g' ? 'g' : unit === 'oz' ? 'oz' : r.portions[Number(unit.slice(1))]?.label ?? 'portion');

/** "1 cup (244 g)", "150 g", "2 servings": what was eaten, in words. */
export const amountText = (r: FoodRecord, unit: UnitKey, qty: number): string => {
  const q = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100);
  if (r.perServing) return qty === 1 ? r.portions[0]?.label ?? '1 serving' : `${q} × ${r.portions[0]?.label ?? 'serving'}`;
  if (unit === 'g') return `${q} g`;
  if (unit === 'oz') return `${q} oz (${Math.round(gramsFor(r, unit, qty))} g)`;
  const g = Math.round(gramsFor(r, unit, qty));
  // Portion labels start with a count ("1 cup"), so a quantity of 1 reads as the label itself.
  return qty === 1 ? `${unitLabel(r, unit)} (${g} g)` : `${q} × ${unitLabel(r, unit)} (${g} g)`;
};

/** Where the entry goes in the diary: the food name, its brand if any. */
export const displayName = (r: FoodRecord): string => (r.brand && !r.name.toLowerCase().includes(r.brand.toLowerCase()) ? `${r.name} (${r.brand})` : r.name);
