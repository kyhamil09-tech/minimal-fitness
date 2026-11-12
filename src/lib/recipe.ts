import { FoodRecord } from './foodDb';
import { Micros, addMicros, scaleMicros } from './micros';

/**
 * A recipe: ingredients with their amounts, and how many servings it makes. It turns into one food (per serving) that can be logged
 * like any other, and keeps its ingredients so it can be edited later.
 */

export interface RecipeIngredient {
  name: string;
  /** What was put in, in words ("2 × 1 cup (244 g)"). */
  amount?: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  micros?: Micros;
  /** Index into the food groups, for the icon. */
  group?: number;
}

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
}

export interface RecipeTotals {
  kcal: number;
  p: number;
  c: number;
  f: number;
  fiber: number;
  sugar: number;
  sodium: number;
  micros?: Micros;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Everything the ingredients add up to, for the whole pot. */
export const recipeTotals = (r: Pick<Recipe, 'ingredients'>): RecipeTotals => {
  const t: RecipeTotals = { kcal: 0, p: 0, c: 0, f: 0, fiber: 0, sugar: 0, sodium: 0 };
  for (const i of r.ingredients) {
    t.kcal += i.kcal;
    t.p += i.p;
    t.c += i.c;
    t.f += i.f;
    t.fiber += i.fiber ?? 0;
    t.sugar += i.sugar ?? 0;
    t.sodium += i.sodium ?? 0;
    t.micros = addMicros(t.micros, i.micros);
  }
  return t;
};

/** One serving's share, with the servings clamped to something sensible. */
export const perServing = (r: Pick<Recipe, 'ingredients' | 'servings'>): RecipeTotals => {
  const n = Math.max(0.25, r.servings || 1);
  const t = recipeTotals(r);
  return {
    kcal: Math.round(t.kcal / n),
    p: r1(t.p / n),
    c: r1(t.c / n),
    f: r1(t.f / n),
    fiber: r1(t.fiber / n),
    sugar: r1(t.sugar / n),
    sodium: Math.round(t.sodium / n),
    micros: scaleMicros(t.micros, 1 / n),
  };
};

export const recipeFoodId = (id: string): string => `mine:recipe:${id}`;

/** The recipe as a food (per serving) for My foods. */
export const recipeToRecord = (r: Recipe): FoodRecord => {
  const s = perServing(r);
  return {
    id: recipeFoodId(r.id),
    name: r.name.trim() || 'Recipe',
    group: 16,
    src: 'mine',
    kcal: s.kcal,
    p: s.p,
    c: s.c,
    f: s.f,
    fiber: s.fiber,
    sugar: s.sugar,
    sodium: s.sodium,
    portions: [{ label: '1 serving', g: 1 }],
    perServing: true,
    micros: s.micros,
  };
};
