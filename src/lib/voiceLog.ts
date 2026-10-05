import { FOOD_DATABASE, FoodItem } from '../data/foods';
import { MealType } from '../types/tracking';

/**
 * Turns what you said ("two eggs and a banana", "500 ml of water") into food and water entries, using only the foods database
 * already inside the app. Nothing is looked up online. Anything it cannot match is handed back so you can add it by hand.
 */

export interface VoiceFood {
  item: FoodItem;
  /** Servings of the item's serving size. */
  qty: number;
  heard: string;
}

export interface VoiceResult {
  water: { ml: number; heard: string }[];
  foods: VoiceFood[];
  unmatched: string[];
  meal: MealType;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  couple: 2, half: 0.5, dozen: 12,
};

const STOP = new Set(['of', 'the', 'some', 'my', 'with', 'for', 'i', 'had', 'have', 'ate', 'drank', 'drink', 'eat', 'log', 'add', 'and', 'then', 'also', 'about', 'around', 'slice', 'slices', 'piece', 'pieces', 'cup', 'cups', 'bowl', 'bowls', 'serving', 'servings', 'glass', 'glasses', 'bottle', 'bottles', 'g', 'gram', 'grams']);

const SYNONYMS: Record<string, string> = { toast: 'bread', coffee: 'coffee', oats: 'oatmeal', porridge: 'oatmeal', yoghurt: 'yogurt', fries: 'french', crisps: 'chips', soda: 'cola', biscuit: 'cookie', biscuits: 'cookie', cookies: 'cookie' };

const singular = (w: string) => (w.length > 3 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('oes') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

const ML = { ml: 1, milliliter: 1, milliliters: 1, millilitre: 1, millilitres: 1, l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000, oz: 29.5735, ounce: 29.5735, ounces: 29.5735, glass: 250, glasses: 250, cup: 240, cups: 240, bottle: 500, bottles: 500 } as Record<string, number>;

const amount = (token: string | undefined): number | null => {
  if (!token) return null;
  if (/^\d+(\.\d+)?$/.test(token)) return Number(token);
  if (/^\d+\/\d+$/.test(token)) {
    const [a, b] = token.split('/').map(Number);
    return b ? a / b : null;
  }
  return NUMBER_WORDS[token] ?? null;
};

const nameWords = (name: string) => new Set(name.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).map(singular));

/** The food that fits the words, or null. Every word must appear in the food's name; the shortest name wins. */
export const matchFood = (words: string[]): FoodItem | null => {
  const q = words.map((w) => singular(SYNONYMS[w] ?? w)).filter((w) => w.length > 1);
  if (q.length === 0) return null;
  let best: { item: FoodItem; score: number } | null = null;
  for (const item of FOOD_DATABASE) {
    const have = nameWords(item.name);
    if (!q.every((w) => have.has(w))) continue;
    // fewer extra words in the name means a closer match; a name starting with the first word is better still
    const score = 100 - have.size * 3 + (item.name.toLowerCase().startsWith(q[0]) ? 5 : 0);
    if (!best || score > best.score) best = { item, score };
  }
  return best ? best.item : null;
};

export const mealFor = (text: string, now: Date = new Date()): MealType => {
  if (/\bbreakfast\b/.test(text)) return 'Breakfast';
  if (/\blunch\b/.test(text)) return 'Lunch';
  if (/\bdinner\b|\bsupper\b/.test(text)) return 'Dinner';
  if (/\bsnack\b/.test(text)) return 'Snack';
  const h = now.getHours();
  return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snack';
};

export const parseVoice = (transcript: string, now: Date = new Date()): VoiceResult => {
  const text = transcript.toLowerCase().replace(/[.,;!?]/g, ' , ').replace(/\s+/g, ' ').trim();
  const result: VoiceResult = { water: [], foods: [], unmatched: [], meal: mealFor(text, now) };
  const segments = text.split(/ , | and | plus | then | also /).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const tokens = seg.split(' ').filter(Boolean);
    const clean = tokens.filter((t) => !['breakfast', 'lunch', 'dinner', 'supper', 'snack', 'for', 'i', 'had', 'ate', 'drank', 'log', 'add'].includes(t));
    if (clean.length === 0) continue;
    // Water: "500 ml water", "a glass of water", "two bottles of water", "water"
    if (clean.includes('water')) {
      const idx = clean.findIndex((t) => amount(t) !== null);
      const num = idx >= 0 ? (amount(clean[idx]) as number) : 1;
      const unitToken = clean.slice(idx >= 0 ? idx + 1 : 0).find((t) => ML[t] !== undefined);
      const ml = Math.round(num * (unitToken ? ML[unitToken] : 250));
      if (ml > 0 && ml <= 5000) result.water.push({ ml, heard: seg });
      continue;
    }
    const qIdx = clean.findIndex((t) => amount(t) !== null);
    const qty = qIdx >= 0 ? (amount(clean[qIdx]) as number) : 1;
    const words = clean.filter((t, i) => i !== qIdx && !STOP.has(t) && amount(t) === null);
    const item = matchFood(words);
    if (item && qty > 0 && qty <= 20) result.foods.push({ item, qty, heard: seg });
    else result.unmatched.push(seg);
  }
  return result;
};
