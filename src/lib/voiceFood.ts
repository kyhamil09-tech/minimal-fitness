import { FoodRecord, Nutrients, amountText, displayName, nutrientsFor } from './foodDb';
import { SearchIndex, searchFoods, tokensOf } from './foodSearch';
import { MealType } from '../types/tracking';

/**
 * Understands what you said about food with its amounts: "2 cups of rice", "100 grams of chicken breast", "half an avocado",
 * "a tablespoon of olive oil", "three slices of pizza". It finds the food in the app's own food database (the same one the search
 * uses), reads the amount and unit, changes the unit into grams using that food's own portions (what a cup, a slice or a spoon of
 * it weighs), and works out calories and macros. Nothing is looked up online.
 */

/** What was asked for: how much, in which unit. The unit is "" when none was said ("two eggs"). */
export interface AmountSpec {
  qty: number;
  unit: string;
}

export interface VoiceItem {
  record: FoodRecord;
  spec: AmountSpec;
  /** What it works out to, in words: "2 cups (316 g)". */
  amount: string;
  /** Grams eaten, when they could be worked out (0 for a food counted only in servings). */
  grams: number;
  nutrients: Nutrients;
  /** True when the unit said had no match in the food's portions, so the usual serving was used instead. */
  approximate: boolean;
  heard: string;
  /** Other foods that fit the words, for a one-tap change. */
  alternatives: FoodRecord[];
}

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, couple: 2, dozen: 12, half: 0.5, quarter: 0.25, third: 1 / 3,
};

interface UnitDef {
  kind: 'weight' | 'volume' | 'count';
  /** Grams, or milliliters, in one of the unit; for a count unit, the label word that finds a matching portion. */
  size: number;
  aliases: string[];
  /** Words a portion's label may use for the same thing. */
  labels?: string[];
}

const UNITS: UnitDef[] = [
  { kind: 'weight', size: 1, aliases: ['g', 'gram', 'grams', 'gm', 'gms', 'gramme', 'grammes'] },
  { kind: 'weight', size: 1000, aliases: ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'] },
  { kind: 'weight', size: 28.3495, aliases: ['oz', 'ounce', 'ounces'] },
  { kind: 'weight', size: 453.592, aliases: ['lb', 'lbs', 'pound', 'pounds'] },
  { kind: 'volume', size: 1, aliases: ['ml', 'milliliter', 'milliliters', 'milliliter', 'milliliters'] },
  { kind: 'volume', size: 1000, aliases: ['l', 'liter', 'liters', 'liter', 'liters'] },
  { kind: 'volume', size: 240, aliases: ['cup', 'cups'], labels: ['cup'] },
  { kind: 'volume', size: 15, aliases: ['tbsp', 'tablespoon', 'tablespoons', 'tbs', 'tbl'], labels: ['tbsp', 'tablespoon'] },
  { kind: 'volume', size: 5, aliases: ['tsp', 'teaspoon', 'teaspoons'], labels: ['tsp', 'teaspoon'] },
  { kind: 'volume', size: 29.5735, aliases: ['floz'], labels: ['fl oz'] },
  { kind: 'volume', size: 473, aliases: ['pint', 'pints'], labels: ['pint'] },
  { kind: 'volume', size: 240, aliases: ['glass', 'glasses', 'mug', 'mugs'], labels: ['glass', 'cup'] },
  { kind: 'count', size: 0, aliases: ['slice', 'slices'], labels: ['slice'] },
  { kind: 'count', size: 0, aliases: ['piece', 'pieces'], labels: ['piece'] },
  { kind: 'count', size: 0, aliases: ['bowl', 'bowls'], labels: ['bowl'] },
  { kind: 'count', size: 0, aliases: ['scoop', 'scoops'], labels: ['scoop'] },
  { kind: 'count', size: 0, aliases: ['can', 'cans'], labels: ['can'] },
  { kind: 'count', size: 0, aliases: ['bottle', 'bottles'], labels: ['bottle'] },
  { kind: 'count', size: 0, aliases: ['bar', 'bars'], labels: ['bar'] },
  { kind: 'count', size: 0, aliases: ['stick', 'sticks'], labels: ['stick'] },
  { kind: 'count', size: 0, aliases: ['fillet', 'fillets', 'filet'], labels: ['fillet', 'filet'] },
  { kind: 'count', size: 0, aliases: ['patty', 'patties'], labels: ['patty'] },
  { kind: 'count', size: 0, aliases: ['clove', 'cloves'], labels: ['clove'] },
  { kind: 'count', size: 0, aliases: ['wedge', 'wedges'], labels: ['wedge'] },
  { kind: 'count', size: 0, aliases: ['strip', 'strips'], labels: ['strip'] },
  { kind: 'count', size: 0, aliases: ['serving', 'servings', 'portion', 'portions'], labels: ['serving', 'portion'] },
];

const UNIT_BY_ALIAS = new Map<string, UnitDef>();
for (const u of UNITS) for (const a of u.aliases) UNIT_BY_ALIAS.set(a, u);

/** A handful is about 30 g of nuts, berries or snacks. */
const HANDFUL_G = 30;

const FILLER = new Set(['of', 'the', 'some', 'my', 'with', 'for', 'i', 'had', 'have', 'ate', 'eat', 'eaten', 'drank', 'drink', 'log', 'add', 'about', 'around', 'roughly', 'approximately', 'just', 'like', 'um', 'uh', 'plus', 'also', 'then', 'in', 'on', 'at', 'it', 'was', 'were', 'got', 'one', 'small', 'big', 'large', 'medium']);

/** Words people say that the food names spell another way. */
const SAY: Record<string, string> = { toast: 'bread', soda: 'cola', crisps: 'chips', fries: 'french fries', mashed: 'mashed', porridge: 'oatmeal', yoghurt: 'yogurt', biscuits: 'cookies', biscuit: 'cookie' };

export const mealFor = (text: string, now: Date = new Date()): MealType => {
  if (/\bbreakfast\b/.test(text)) return 'Breakfast';
  if (/\blunch\b/.test(text)) return 'Lunch';
  if (/\bdinner\b|\bsupper\b/.test(text)) return 'Dinner';
  if (/\bsnack\b/.test(text)) return 'Snack';
  const h = now.getHours();
  return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snack';
};

/** Splits speech into words and numbers, keeping fractions ("1/2") and decimals ("1.5") whole. */
export const speechTokens = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .match(/\d+\/\d+|\d+(?:\.\d+)?|[a-z]+/g) ?? [];

const numberOf = (t: string): number | null => {
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^\d+\/\d+$/.test(t)) {
    const [a, b] = t.split('/').map(Number);
    return b ? a / b : null;
  }
  return WORD_NUMBERS[t] ?? null;
};

/**
 * Reads the amount at the start (or anywhere) in a phrase: "2", "two and a half", "1 1/2", "half a", "three quarters", "a couple of",
 * then an optional unit. Returns what is left as the food words.
 */
export const readAmount = (tokens: string[]): { spec: AmountSpec; rest: string[] } => {
  const t = tokens.slice();
  // Speech recognisers sometimes write the sound of two: "to cups of rice". It only counts as a number when a unit follows.
  for (let i = 0; i < t.length - 1; i++) if ((t[i] === 'to' || t[i] === 'too') && UNIT_BY_ALIAS.has(t[i + 1])) t[i] = '2';
  // Merge "fl oz" and "floz".
  for (let i = 0; i < t.length - 1; i++) if (t[i] === 'fl' && (t[i + 1] === 'oz' || t[i + 1] === 'ounce' || t[i + 1] === 'ounces')) t.splice(i, 2, 'floz');
  let qty: number | null = null;
  let at = -1;
  let end = -1;
  for (let i = 0; i < t.length; i++) {
    const n = numberOf(t[i]);
    if (n === null) continue;
    // "a" and "an" only count as one when a unit follows ("a cup", "an ounce"); otherwise they are just the article.
    if ((t[i] === 'a' || t[i] === 'an') && t[i + 1] === 'couple') continue; // "a couple of": the number is the next word
    if ((t[i] === 'a' || t[i] === 'an') && !UNIT_BY_ALIAS.has(t[i + 1] ?? '')) {
      if (qty === null) {
        qty = 1;
        at = i;
        end = i;
      }
      continue;
    }
    let value = n;
    let j = i;
    // "two hundred", "twenty five"
    while (j + 1 < t.length) {
      const nx = numberOf(t[j + 1]);
      if (nx === null) break;
      if (value >= 20 && value % 10 === 0 && nx < 10 && nx >= 1 && t[j + 1] !== 'a' && t[j + 1] !== 'an') {
        value += nx;
        j++;
      } else if (t[j + 1] === 'hundred' && value < 10) {
        value *= 100;
        j++;
      } else break;
    }
    // "one and a half", "two and a half", "1 and 1/2", "1 1/2", "three quarters"
    let k = j;
    if (t[k + 1] === 'and' && t[k + 2] === 'a' && t[k + 3] === 'half') {
      value += 0.5;
      k += 3;
    } else if (t[k + 1] === 'and' && /^\d+\/\d+$/.test(t[k + 2] ?? '')) {
      value += numberOf(t[k + 2]) ?? 0;
      k += 2;
    } else if (/^\d+\/\d+$/.test(t[k + 1] ?? '') && Number.isInteger(value)) {
      value += numberOf(t[k + 1]) ?? 0;
      k += 1;
    } else if ((t[k + 1] === 'quarters' || t[k + 1] === 'thirds') && value > 0 && value < 10) {
      value = value * (t[k + 1] === 'quarters' ? 0.25 : 1 / 3);
      k += 1;
    } else if (t[k + 1] === 'and' && t[k + 2] === 'a' && t[k + 3] === 'quarter') {
      value += 0.25;
      k += 3;
    }
    // "half a cup", "a half cup": the half stands for one half of the unit that follows
    qty = value;
    at = i;
    end = k;
    break;
  }
  if (qty === null) return { spec: { qty: 1, unit: '' }, rest: t };
  const after = t.slice(end + 1);
  let unit = '';
  let used = 0;
  // "half a cup", "half an ounce": skip the article
  const skip = after[0] === 'a' || after[0] === 'an' ? 1 : 0;
  const cand = after[skip];
  if (cand && UNIT_BY_ALIAS.has(cand)) {
    unit = cand;
    used = skip + 1;
  } else if (cand === 'handful' || cand === 'handfuls') {
    unit = 'handful';
    used = skip + 1;
  }
  const rest = [...t.slice(0, at), ...after.slice(used)];
  return { spec: { qty, unit }, rest };
};

/** "1 cup", "1/2 cup", "2 tbsp", "1 medium", "1 slice (14 g)": the count and the words of a portion label. */
const parseLabel = (label: string): { count: number; words: string[] } => {
  const l = label.toLowerCase();
  const m = /^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/.exec(l);
  let count = 1;
  if (m) {
    const s = m[1].trim();
    if (/^\d+\s+\d+\/\d+$/.test(s)) {
      const [whole, frac] = s.split(/\s+/);
      count = Number(whole) + (numberOf(frac) ?? 0);
    } else count = numberOf(s) ?? 1;
  }
  return { count: count > 0 ? count : 1, words: l.replace(/[(),]/g, ' ').replace(/\bfl\.?\s*oz\b/g, 'fl oz').split(/\s+/).filter(Boolean) };
};

/** Milliliters in one count of a portion label, when it is a measure of volume. */
const labelVolumeMl = (label: string): number | null => {
  const direct = /(\d+(?:\.\d+)?)\s*ml\b/i.exec(label);
  if (direct) return Number(direct[1]);
  const { count, words } = parseLabel(label);
  const joined = words.join(' ');
  for (const u of UNITS) {
    if (u.kind !== 'volume' || !u.labels) continue;
    if (u.labels.some((w) => (w.includes(' ') ? joined.includes(w) : words.includes(w) || words.includes(`${w}s`)))) return u.size * count;
  }
  return null;
};

const cleanName = (label: string) => label.toLowerCase();

interface Conversion {
  grams: number;
  /** Servings for foods counted by serving (their numbers are per serving, not per 100 g). */
  servings: number;
  approximate: boolean;
}

/** Works out how much of the food was eaten, from the amount and unit said and the food's own portions. */
export const convert = (r: FoodRecord, spec: AmountSpec): Conversion => {
  const def = spec.unit ? UNIT_BY_ALIAS.get(spec.unit) : undefined;
  const portions = r.portions.length > 0 ? r.portions : [{ label: '100 g', g: 100 }];
  const first = portions[0];
  const gramsOfPortion = (p: { label: string; g: number }) => (r.perServing ? 0 : p.g / parseLabel(p.label).count);

  // The usual portion: "two eggs", "a banana", or an amount whose unit the food has no portion for.
  const firstCount = (() => {
    const c = parseLabel(first.label).count;
    return c > 0 && c <= 12 ? c : 1;
  })();
  const usual = (approx: boolean): Conversion =>
    r.perServing
      ? { grams: 0, servings: spec.qty / firstCount, approximate: approx }
      : { grams: Math.round(spec.qty * gramsOfPortion(first)), servings: 0, approximate: approx };

  if (spec.unit === 'handful') return r.perServing ? usual(true) : { grams: Math.round(spec.qty * HANDFUL_G), servings: 0, approximate: false };
  if (!def) return usual(false);

  if (def.kind === 'weight') {
    // Weighed foods convert exactly. A food whose numbers are per serving has no weight to compare, so its serving stands in.
    if (r.perServing) return usual(true);
    return { grams: Math.round(spec.qty * def.size), servings: 0, approximate: false };
  }

  if (def.kind === 'volume') {
    const ml = spec.qty * def.size;
    // A portion measured in volume ("1 cup") says how much a milliliter of this food weighs.
    for (const p of portions) {
      const pm = labelVolumeMl(p.label);
      if (!pm) continue;
      if (r.perServing) return { grams: 0, servings: ml / pm, approximate: false };
      return { grams: Math.round((ml / pm) * p.g), servings: 0, approximate: false };
    }
    // Drinks and other liquids: a milliliter weighs about a gram.
    if (!r.perServing && /\b(milk|juice|water|coffee|tea|soda|cola|beer|wine|broth|soup|oil|smoothie|drink)\b/i.test(r.name)) {
      return { grams: Math.round(ml), servings: 0, approximate: false };
    }
    return usual(true);
  }

  // A counted unit: slice, piece, bowl, scoop... finds the portion that uses the same word.
  const hit = portions.find((p) => (def.labels ?? []).some((w) => cleanName(p.label).includes(w)));
  if (hit) {
    return r.perServing ? { grams: 0, servings: spec.qty / parseLabel(hit.label).count, approximate: false } : { grams: Math.round(spec.qty * gramsOfPortion(hit)), servings: 0, approximate: false };
  }
  return usual(true);
};

const nutrientsOf = (r: FoodRecord, c: Conversion): Nutrients =>
  r.perServing ? nutrientsFor(r, 'p0', c.servings) : nutrientsFor(r, 'g', c.grams);

const amountOf = (r: FoodRecord, spec: AmountSpec, c: Conversion): string => {
  const q = Number.isInteger(spec.qty) ? String(spec.qty) : String(Math.round(spec.qty * 100) / 100);
  const said = spec.unit ? `${q} ${spec.unit}` : q === '1' ? '' : `${q} ×`;
  if (r.perServing) return c.approximate || !spec.unit ? amountText(r, 'p0', c.servings) : `${said} (${Math.round(c.servings * 100) / 100} × ${r.portions[0]?.label ?? 'serving'})`;
  const g = `${c.grams} g`;
  if (!spec.unit || spec.unit === 'g') return spec.unit === 'g' ? g : `${said} (${g})`.trim();
  return `${said} (${g})`;
};

/** Builds the logged item for a food record and the amount said. */
export const itemFor = (r: FoodRecord, spec: AmountSpec, heard: string, alternatives: FoodRecord[] = []): VoiceItem => {
  const c = convert(r, spec);
  return { record: r, spec, amount: amountOf(r, spec, c), grams: c.grams, nutrients: nutrientsOf(r, c), approximate: c.approximate, heard, alternatives };
};

export interface SmartResult {
  water: { ml: number; heard: string }[];
  foods: VoiceItem[];
  unmatched: string[];
  meal: MealType;
}

const WATER_ML: Record<string, number> = { glass: 250, glasses: 250, bottle: 500, bottles: 500 };

/** Picks the food that fits the words, preferring one whose portions can answer the unit that was asked for. */
const pick = (ix: SearchIndex, words: string[], spec: AmountSpec, boost?: (r: FoodRecord) => number): { best: FoodRecord; others: FoodRecord[] } | null => {
  const query = words.map((w) => SAY[w] ?? w).join(' ');
  if (!query.trim()) return null;
  const found = searchFoods(ix, query, { limit: 8, boost });
  if (found.length === 0) return null;
  const scored = found.map((r, i) => {
    let s = -i * 0.35;
    const c = convert(r, spec);
    if (!c.approximate) s += 1.2;
    return { r, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return { best: scored[0].r, others: scored.slice(1, 5).map((x) => x.r) };
};

/** True when every word you said is in the food's name (as a word or the start of one). */
const covers = (r: FoodRecord, words: string[]): boolean => {
  const name = tokensOf(r.name);
  return words.every((w) => name.some((n) => n === w || n.startsWith(w) || w.startsWith(n)));
};

/** Understands a spoken sentence about food and water against the food database. */
export const parseSmart = (transcript: string, ix: SearchIndex, now: Date = new Date(), boost?: (r: FoodRecord) => number): SmartResult => {
  const text = transcript.toLowerCase().replace(/[.,;!?]/g, ' , ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const out: SmartResult = { water: [], foods: [], unmatched: [], meal: mealFor(text, now) };

  const handle = (seg: string, canSplit: boolean) => {
    const tokens = speechTokens(seg).filter((t) => !['breakfast', 'lunch', 'dinner', 'supper', 'snack'].includes(t));
    if (tokens.length === 0) return;
    const { spec, rest } = readAmount(tokens);
    const words = rest.filter((t) => !FILLER.has(t) && numberOf(t) === null && !UNIT_BY_ALIAS.has(t) && t !== 'handful' && t !== 'handfuls');

    if (words.length === 1 && words[0] === 'water') {
      const def = spec.unit ? UNIT_BY_ALIAS.get(spec.unit) : undefined;
      const ml = def?.kind === 'volume' ? spec.qty * (WATER_ML[spec.unit] ?? def.size) : spec.unit === '' ? spec.qty * 250 : 0;
      if (ml > 0 && ml <= 5000) out.water.push({ ml: Math.round(ml), heard: seg });
      else out.unmatched.push(seg);
      return;
    }
    if (words.length === 0) return;

    const found = spec.qty > 0 && spec.qty <= 5000 ? pick(ix, words, spec, boost) : null;
    // "mac and cheese" is one food; "two eggs and bacon" is two. Keep it whole when one food holds every word, else split at "and".
    if (canSplit && seg.includes(' and ') && !(found && covers(found.best, words))) {
      for (const part of seg.split(' and ')) handle(part.trim(), false);
      return;
    }
    if (!found) {
      out.unmatched.push(seg);
      return;
    }
    out.foods.push(itemFor(found.best, spec, seg, found.others));
  };

  for (const seg of text.split(/ , | plus | then | also /).map((x) => x.trim()).filter(Boolean)) handle(seg, true);
  return out;
};

/** The entry to save for an item, in the diary's own shape. */
export const entryFor = (item: VoiceItem, meal: MealType) => {
  const n = item.nutrients;
  return {
    meal,
    name: displayName(item.record),
    calories: n.kcal,
    proteinG: n.p,
    carbsG: n.c,
    fatG: n.f,
    fiberG: n.fiber || undefined,
    sugarG: n.sugar || undefined,
    sodiumMg: n.sodium || undefined,
    amount: item.amount,
    group: item.record.group,
  };
};
