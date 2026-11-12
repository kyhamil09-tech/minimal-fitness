import { FoodRecord } from './foodDb';

/** A word the image model gives that says nothing about which food it is. */
const GENERIC = new Set([
  'food', 'dish', 'cuisine', 'ingredient', 'meal', 'recipe', 'tableware', 'plate', 'dishware', 'fast food', 'produce', 'natural foods', 'staple food',
  'superfood', 'baked goods', 'snack', 'comfort food', 'finger food', 'junk food', 'whole food', 'vegetarian food', 'vegan nutrition', 'garnish',
  'breakfast', 'lunch', 'dinner', 'brunch', 'platter', 'bowl', 'cup', 'fork', 'spoon', 'knife', 'table', 'cutlery', 'kitchen', 'restaurant',
  'drink', 'beverage', 'cooking', 'cookware and bakeware', 'serveware', 'leaf vegetable', 'root vegetable', 'dessert', 'sweetness', 'cake decorating',
]);

export interface PhotoLabel {
  text: string;
  confidence: number;
}

export interface PhotoSuggestion {
  label: string;
  confidence: number;
  foods: FoodRecord[];
}

/**
 * Turns what the image model saw into foods to pick from: each useful word (not "food", "dish", "plate" and the like) is looked up in the
 * app's own food list, a few matches each, never the same food twice. It only suggests; the person picks and sets the amount.
 */
export const suggestFoods = (labels: PhotoLabel[], find: (q: string) => FoodRecord[], perLabel = 3, maxLabels = 8): PhotoSuggestion[] => {
  const seenFood = new Set<string>();
  const seenLabel = new Set<string>();
  const out: PhotoSuggestion[] = [];
  for (const l of [...labels].sort((a, b) => b.confidence - a.confidence)) {
    const key = l.text.trim().toLowerCase();
    if (!key || GENERIC.has(key) || seenLabel.has(key)) continue;
    seenLabel.add(key);
    const foods: FoodRecord[] = [];
    for (const f of find(key)) {
      if (seenFood.has(f.id)) continue;
      seenFood.add(f.id);
      foods.push(f);
      if (foods.length >= perLabel) break;
    }
    if (foods.length > 0) out.push({ label: l.text, confidence: l.confidence, foods });
    if (out.length >= maxLabels) break;
  }
  return out;
};
