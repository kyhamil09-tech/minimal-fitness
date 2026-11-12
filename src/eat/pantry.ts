import { tokensOf } from '../lib/foodSearch';
import { DietPrefs, avoidWords, fitsDiet } from './diet';

/**
 * The pantry: what is in your kitchen, and what you could make from it. Your own saved meals and recipes come first, then a short list of
 * simple ideas with typical numbers. Matching is by the words of the ingredient, so "2 large eggs" matches "eggs" in your pantry. Salt,
 * pepper, oil and water are taken for granted.
 */

export interface MealIdea {
  id: string;
  name: string;
  ingredients: string[];
  minutes: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  /** Index into the food groups, for the icon. */
  group: number;
  vegetarian: boolean;
  vegan: boolean;
  glutenFree: boolean;
  dairyFree: boolean;
  nutFree: boolean;
}

const idea = (
  id: string,
  name: string,
  minutes: number,
  ingredients: string[],
  n: [number, number, number, number, number],
  group: number,
  flags: string
): MealIdea => ({
  id, name, ingredients, minutes, calories: n[0], proteinG: n[1], carbsG: n[2], fatG: n[3], fiberG: n[4], group,
  vegetarian: flags.includes('V'), vegan: flags.includes('N'), glutenFree: flags.includes('G'), dairyFree: flags.includes('D'), nutFree: flags.includes('T'),
});

// Flags: V vegetarian, N vegan, G gluten-free, D dairy-free, T nut-free. Numbers are typical for one serving: kcal, protein, carbs, fat, fiber.
export const IDEAS: MealIdea[] = [
  idea('omelet', 'Veggie omelet', 10, ['eggs', 'bell pepper', 'onion', 'cheese', 'butter'], [340, 22, 6, 25, 2], 2, 'VGT'),
  idea('tuna-bowl', 'Tuna salad bowl', 10, ['canned tuna', 'mixed greens', 'cucumber', 'olive oil', 'lemon'], [290, 32, 8, 14, 3], 5, 'GDT'),
  idea('oats', 'Overnight oats', 5, ['oats', 'milk', 'yogurt', 'banana', 'honey'], [380, 16, 62, 8, 7], 6, 'VT'),
  idea('chicken-rice', 'Chicken and rice bowl', 25, ['chicken breast', 'rice', 'broccoli', 'soy sauce', 'olive oil'], [520, 42, 55, 12, 4], 4, 'DT'),
  idea('lentil-soup', 'Lentil soup', 30, ['lentils', 'onion', 'carrot', 'celery', 'canned tomatoes', 'vegetable stock'], [310, 20, 50, 3, 16], 10, 'VNGDT'),
  idea('spaghetti', 'Spaghetti with tomato sauce', 20, ['pasta', 'canned tomatoes', 'garlic', 'olive oil', 'parmesan'], [560, 20, 88, 14, 6], 6, 'VT'),
  idea('bean-tacos', 'Black bean tacos', 15, ['black beans', 'corn tortillas', 'avocado', 'salsa', 'lime'], [430, 16, 62, 14, 17], 10, 'VNGDT'),
  idea('parfait', 'Greek yogurt parfait', 5, ['greek yogurt', 'berries', 'granola', 'honey'], [300, 20, 42, 6, 5], 1, 'VT'),
  idea('pb-toast', 'Peanut butter banana toast', 5, ['bread', 'peanut butter', 'banana'], [380, 13, 50, 16, 7], 7, 'VND'),
  idea('egg-rice', 'Egg fried rice', 15, ['rice', 'eggs', 'peas', 'carrot', 'soy sauce', 'green onion'], [460, 18, 62, 14, 5], 6, 'VDT'),
  idea('chickpea-curry', 'Chickpea curry', 30, ['chickpeas', 'canned tomatoes', 'onion', 'coconut milk', 'curry powder', 'rice'], [520, 17, 76, 17, 14], 10, 'VNGDT'),
  idea('salmon-veg', 'Salmon with potatoes and broccoli', 30, ['salmon', 'potatoes', 'broccoli', 'olive oil', 'lemon'], [540, 36, 38, 26, 7], 5, 'GDT'),
  idea('cottage-fruit', 'Cottage cheese and fruit', 3, ['cottage cheese', 'pineapple'], [200, 24, 18, 4, 1], 1, 'VGT'),
  idea('hummus-wrap', 'Hummus veggie wrap', 8, ['hummus', 'tortilla', 'cucumber', 'spinach', 'tomato'], [380, 12, 52, 14, 9], 7, 'VNDT'),
  idea('shakshuka', 'Shakshuka', 25, ['eggs', 'canned tomatoes', 'onion', 'bell pepper', 'cumin'], [300, 18, 22, 15, 5], 2, 'VGDT'),
  idea('turkey-sandwich', 'Turkey sandwich', 5, ['bread', 'turkey', 'lettuce', 'tomato', 'mustard'], [380, 28, 40, 10, 5], 4, 'DT'),
  idea('tofu-stir-fry', 'Tofu and vegetable stir-fry', 20, ['tofu', 'broccoli', 'bell pepper', 'rice', 'soy sauce'], [450, 24, 56, 14, 6], 10, 'VNDT'),
  idea('banana-pancakes', 'Banana oat pancakes', 15, ['banana', 'oats', 'eggs'], [320, 14, 50, 8, 6], 6, 'VDT'),
  idea('avocado-toast', 'Avocado toast with egg', 8, ['bread', 'avocado', 'eggs'], [360, 14, 28, 22, 9], 2, 'VDT'),
  idea('quinoa-salad', 'Quinoa and chickpea salad', 20, ['quinoa', 'cucumber', 'tomato', 'chickpeas', 'olive oil', 'lemon'], [420, 15, 56, 15, 11], 6, 'VNGDT'),
];

/** Taken for granted: they never count as missing. */
export const STAPLES = ['salt', 'pepper', 'water', 'oil', 'olive oil', 'vegetable oil', 'sugar', 'spice', 'spices', 'cumin', 'curry powder', 'butter', 'garlic', 'vinegar', 'stock', 'vegetable stock'];

/** Quick-add chips for the pantry. */
export const COMMON_PANTRY = ['eggs', 'rice', 'pasta', 'oats', 'canned tomatoes', 'black beans', 'chickpeas', 'lentils', 'onion', 'chicken breast', 'canned tuna', 'bread', 'milk', 'cheese', 'yogurt', 'banana', 'spinach', 'broccoli', 'potatoes', 'avocado'];

const NOISE = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'with', 'to', 'taste', 'cup', 'cups', 'tbsp', 'tsp', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons', 'g', 'kg', 'oz', 'lb', 'lbs', 'ml', 'l', 'pinch', 'fresh', 'chopped', 'sliced', 'diced', 'cooked', 'canned', 'can', 'tin', 'large', 'small', 'medium', 'whole', 'ground', 'frozen', 'dried', 'raw', 'some', 'little', 'bit', 'handful', 'clove', 'cloves', 'piece', 'pieces', 'slice', 'slices']);

const singular = (t: string): string => {
  if (t.length <= 3) return t;
  if (t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (/(ch|sh|x|z|s)es$/.test(t) && !t.endsWith('ses')) return t.slice(0, -2);
  if (t.endsWith('oes')) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
};

/** The words that carry the meaning of an ingredient line: "2 large eggs" becomes ["egg"]. */
export const coreWords = (s: string): string[] => tokensOf(s).filter((t) => !/^\d/.test(t) && !NOISE.has(t)).map(singular);

/** Whether a pantry item covers an ingredient: all the words of one are in the other. */
export const covers = (pantryItem: string, ingredient: string): boolean => {
  const a = coreWords(pantryItem);
  const b = coreWords(ingredient);
  if (a.length === 0 || b.length === 0) return false;
  const inB = a.every((w) => b.includes(w));
  const inA = b.every((w) => a.includes(w));
  return inB || inA;
};

export const isStaple = (ingredient: string): boolean => STAPLES.some((s) => covers(s, ingredient) && coreWords(ingredient).length <= coreWords(s).length + 0);

export interface Candidate {
  kind: 'saved' | 'recipe' | 'idea';
  id: string;
  name: string;
  ingredients: string[];
  /** For an idea, the diet flags it carries. Saved meals and recipes are checked by the names of their ingredients. */
  idea?: MealIdea;
}

export interface Ranked {
  candidate: Candidate;
  have: string[];
  missing: string[];
  /** 0 to 1: the share of ingredients you have. */
  score: number;
}

const ideaFits = (i: MealIdea, d: DietPrefs): boolean => {
  if (d.vegan && !i.vegan) return false;
  if (d.vegetarian && !i.vegetarian) return false;
  if (d.glutenFree && !i.glutenFree) return false;
  if (d.dairyFree && !i.dairyFree) return false;
  if (d.nutFree && !i.nutFree) return false;
  return avoidWords(d).length === 0 || i.ingredients.every((ing) => fitsDiet({ name: ing }, { ...d, vegetarian: false, vegan: false, glutenFree: false, dairyFree: false, nutFree: false }));
};

/**
 * What you could make: the candidates that fit your diet and that you have at least half the ingredients for (or are short of two or fewer),
 * best first. Your own meals and recipes win ties over the built-in ideas.
 */
export const rankMeals = (pantry: string[], candidates: Candidate[], diet: DietPrefs, max = 12): Ranked[] => {
  const out: Ranked[] = [];
  for (const c of candidates) {
    const ingredients = c.ingredients.filter((i) => i.trim() && !isStaple(i));
    if (ingredients.length === 0) continue;
    const fits = c.idea ? ideaFits(c.idea, diet) : ingredients.every((i) => fitsDiet({ name: i }, diet));
    if (!fits) continue;
    const have: string[] = [];
    const missing: string[] = [];
    for (const ing of ingredients) (pantry.some((p) => covers(p, ing)) ? have : missing).push(ing);
    if (have.length === 0) continue;
    const score = have.length / ingredients.length;
    if (score < 0.5 && missing.length > 2) continue;
    out.push({ candidate: c, have, missing, score });
  }
  const rank = (k: Candidate['kind']) => (k === 'idea' ? 1 : 0);
  return out.sort((a, b) => b.score - a.score || a.missing.length - b.missing.length || rank(a.candidate.kind) - rank(b.candidate.kind) || a.candidate.name.localeCompare(b.candidate.name)).slice(0, max);
};

/** The pantry list cleaned up: trimmed, lower-cased, no duplicates, at most 80 items. */
export const addToPantry = (pantry: string[], item: string): string[] => {
  const clean = item.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
  if (!clean || pantry.some((p) => p === clean)) return pantry;
  return [...pantry, clean].slice(0, 80);
};
