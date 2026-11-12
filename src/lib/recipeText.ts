import { FoodRecord, displayName, nutrientsFor } from './foodDb';
import type { RecipeIngredient } from './recipe';

/**
 * Turning the ingredient list of a recipe, pasted as text, into foods. Each line ("2 cups all-purpose flour, sifted") is split into an
 * amount, a unit and a name; the name is matched to a food in the app's own list; the amount becomes grams using that food's own
 * portion sizes where it has them. It all happens on the phone from text you pasted: no web page is fetched.
 */

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅕': 0.2 };

export type Unit = 'g' | 'kg' | 'oz' | 'lb' | 'ml' | 'l' | 'floz' | 'cup' | 'tbsp' | 'tsp' | 'each';

const UNIT_WORDS: [RegExp, Unit][] = [
  [/^(kilograms?|kilos?|kgs?)\b/i, 'kg'],
  [/^(grams?|grammes?|gm|g)\b/i, 'g'],
  [/^(ounces?|oz)\b\.?/i, 'oz'],
  [/^(pounds?|lbs?|lb)\b\.?/i, 'lb'],
  [/^(milliliters?|milliliters?|mls?)\b/i, 'ml'],
  [/^(liters?|liters?|l)\b/i, 'l'],
  [/^(fl\.?\s*oz|fluid ounces?)\b/i, 'floz'],
  [/^(cups?|c)\b\.?/i, 'cup'],
  [/^(tablespoons?|tbsps?|tbs|tbl|T)\b\.?/, 'tbsp'],
  [/^(teaspoons?|tsps?|t)\b\.?/, 'tsp'],
  [/^(pinch(?:es)?|dash(?:es)?)\b/i, 'tsp'],
];

const EACH_WORDS = /^(cloves?|slices?|cans?|tins?|sticks?|pieces?|packages?|packets?|bunch(?:es)?|heads?|sprigs?|stalks?|ears?|fillets?|breasts?|thighs?|cubes?|sheets?|leaves|leaf|knobs?|links?|strips?|rashers?|handfuls?)\b/i;

const SIZE_WORDS = /\b(extra[- ]large|large|medium|small|jumbo)\b/i;

const PREP = /\b(finely|roughly|thinly|freshly|coarsely|lightly|firmly|loosely|chopped|diced|minced|sliced|grated|shredded|melted|softened|peeled|crushed|cubed|divided|packed|sifted|beaten|drained|rinsed|halved|quartered|trimmed|cooked|uncooked|optional|room temperature|at room temp|for serving|for garnish|to taste|plus more|or more|as needed|about)\b/gi;

export interface ParsedLine {
  raw: string;
  /** The amount, 0 when the line has none ("salt, to taste"). */
  qty: number;
  unit: Unit | null;
  size?: string;
  /** The words to look the food up by. */
  name: string;
  /** True when the line says "to taste" or has no amount: it is left out of the totals unless chosen. */
  noAmount: boolean;
}

const toNumber = (s: string): number => {
  let t = s.trim();
  let total = 0;
  for (const [ch, v] of Object.entries(FRACTIONS)) {
    if (t.includes(ch)) {
      total += v;
      t = t.replace(ch, ' ');
    }
  }
  for (const part of t.split(/\s+/).filter(Boolean)) {
    const frac = /^(\d+)\/(\d+)$/.exec(part);
    if (frac) total += parseInt(frac[1], 10) / (parseInt(frac[2], 10) || 1);
    else {
      const n = parseFloat(part.replace(',', '.'));
      if (Number.isFinite(n)) total += n;
    }
  }
  return total;
};

const QTY = /^((?:\d+(?:[.,]\d+)?(?:\s*[½¼¾⅓⅔⅛⅜⅝⅞⅕])?|[½¼¾⅓⅔⅛⅜⅝⅞⅕])(?:\s+\d+\/\d+)?|\d+\/\d+)(?:\s*(?:-|–|—|to)\s*((?:\d+(?:[.,]\d+)?|\d+\/\d+)(?:\s+\d+\/\d+)?))?/;

/** One line of an ingredient list. */
export const parseIngredientLine = (line: string): ParsedLine => {
  let rest = line.replace(/^[\s•\-*▢☐□✓·]+/, '').replace(/\s+/g, ' ').trim();
  const raw = rest;
  let qty = 0;
  const q = QTY.exec(rest);
  if (q) {
    qty = toNumber(q[1]);
    if (q[2]) qty = (qty + toNumber(q[2])) / 2;
    rest = rest.slice(q[0].length).trim();
  }
  let unit: Unit | null = null;
  // "2 (14 oz) cans tomatoes": the size in brackets multiplies the count
  const bracket = /^\((\d+(?:[.,]\d+)?)\s*(oz|ounces?|g|grams?|ml|lb|lbs|pounds?)\b[^)]*\)\s*/i.exec(rest);
  if (bracket && qty > 0) {
    const size = parseFloat(bracket[1].replace(',', '.'));
    const u = UNIT_WORDS.find(([re]) => re.test(bracket[2]));
    if (u) {
      qty *= size;
      unit = u[1];
      rest = rest.slice(bracket[0].length).replace(EACH_WORDS, '').trim();
    }
  }
  let size: string | undefined;
  if (unit === null && qty > 0) {
    const sz = SIZE_WORDS.exec(rest);
    if (sz && sz.index === 0) {
      size = sz[1].toLowerCase();
      rest = rest.slice(sz[0].length).trim();
    }
    const hit = UNIT_WORDS.find(([re]) => re.test(rest));
    if (hit) {
      unit = hit[1];
      rest = rest.replace(hit[0], '').trim();
    } else if (EACH_WORDS.test(rest)) {
      unit = 'each';
      rest = rest.replace(EACH_WORDS, '').trim();
    } else if (qty > 0) {
      unit = 'each';
    }
  }
  const noAmount = qty === 0 || /\bto taste\b/i.test(raw);
  const name = rest
    .replace(/^of\s+/i, '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/,|;| - /)[0]
    .replace(PREP, ' ')
    .replace(SIZE_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { raw, qty, unit, size, name, noAmount };
};

/** The servings a recipe says it makes ("Serves 4", "Makes 12 muffins", "Yield: 6 servings"), or undefined. */
export const parseServings = (text: string): number | undefined => {
  const m = /\b(?:serves|servings?|makes|yields?|yield)\b\s*:?\s*(\d+)(?:\s*(?:-|to)\s*(\d+))?/i.exec(text);
  if (!m) return undefined;
  const lo = parseInt(m[1], 10);
  const hi = m[2] ? parseInt(m[2], 10) : lo;
  const n = Math.round((lo + hi) / 2);
  return n >= 1 && n <= 60 ? n : undefined;
};

const ML: Record<string, number> = { ml: 1, l: 1000, floz: 29.5735, cup: 240, tbsp: 14.7868, tsp: 4.92892 };
const G: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };

export interface Amount {
  grams: number;
  /** True when the grams are a guess (no portion sizes to go by). */
  approx: boolean;
  /** Set when the food is per serving and cannot be weighed: the number of servings. */
  servings?: number;
}

/** What a parsed line comes to in grams of a given food, using the food's own portion sizes where it has them. */
const amountRaw = (rec: FoodRecord, p: Pick<ParsedLine, 'qty' | 'unit' | 'size' | 'name'>): Amount => {
  const qty = p.qty > 0 ? p.qty : 1;
  // A per-serving food cannot be weighed: a weight or volume of it is taken as one serving, flagged as a guess, rather than as hundreds.
  if (rec.perServing) return p.unit && (G[p.unit] || ML[p.unit]) ? { grams: 0, approx: true, servings: 1 } : { grams: 0, approx: true, servings: qty };
  if (p.unit && G[p.unit]) return { grams: qty * G[p.unit], approx: false };
  if (p.unit && ML[p.unit]) {
    const ml = qty * ML[p.unit];
    // Each portion that is a volume gives grams per milliliter; the one in the unit asked for is the best guide.
    const found: { gPerMl: number; same: boolean }[] = [];
    for (const por of rec.portions) {
      const m = /^(\d+(?:[.,]\d+)?|\d*\s*\d+\/\d+)?\s*(fl oz|cup|tbsp|tablespoon|tsp|teaspoon|ml|liter)s?\b/i.exec(por.label.trim());
      if (!m) continue;
      const n = m[1] ? toNumber(m[1]) || 1 : 1;
      const unit = m[2].toLowerCase();
      const kind: Unit = unit === 'fl oz' ? 'floz' : unit === 'cup' ? 'cup' : unit === 'tbsp' || unit === 'tablespoon' ? 'tbsp' : unit === 'tsp' || unit === 'teaspoon' ? 'tsp' : unit === 'liter' ? 'l' : 'ml';
      found.push({ gPerMl: por.g / (n * ML[kind]), same: kind === p.unit });
    }
    const best = found.find((x) => x.same) ?? found[0];
    if (best) return { grams: best.gPerMl * ml, approx: false };
    return { grams: ml, approx: true };
  }
  // a count: 2 eggs, 3 cloves, 1 large onion
  const word = (p.size ?? '').toLowerCase();
  const bySize = word ? rec.portions.find((x) => x.label.toLowerCase().includes(word)) : undefined;
  const por = bySize ?? rec.portions.find((x) => !/\b(cup|tbsp|tsp|oz|ml|g)\b/i.test(x.label)) ?? rec.portions[0];
  return por ? { grams: qty * por.g, approx: !bySize && !!word } : { grams: qty * 100, approx: true };
};

export const amountFor = (rec: FoodRecord, p: Pick<ParsedLine, 'qty' | 'unit' | 'size' | 'name'>): Amount => {
  const a = amountRaw(rec, p);
  return { ...a, grams: Math.round(a.grams * 100) / 100 };
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The ingredient for a recipe from a line and the food chosen for it. */
export const toIngredient = (rec: FoodRecord, p: ParsedLine, amount: Amount): RecipeIngredient => {
  const n = amount.servings !== undefined ? nutrientsFor(rec, 'p0', amount.servings) : nutrientsFor(rec, 'g', amount.grams);
  return {
    name: displayName(rec),
    amount: p.raw,
    kcal: n.kcal,
    p: n.p,
    c: n.c,
    f: n.f,
    fiber: n.fiber || undefined,
    sugar: n.sugar || undefined,
    sodium: n.sodium || undefined,
    micros: n.micros,
    group: rec.group,
  };
};

/** The lines of a pasted recipe that look like ingredients: everything with a letter in it, minus obvious headings and steps. */
export const ingredientLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && l.length < 140 && /[a-zA-Z]/.test(l))
    .filter((l) => !/^(ingredients?|directions?|instructions?|method|steps?|notes?|nutrition|prep time|cook time|total time|serves|servings?|makes|yield)\b.{0,3}:?\s*\d*\s*$/i.test(l))
    .filter((l) => !/^\d+\.\s+[A-Z].{40,}/.test(l));

export { r1 as roundTenth };
