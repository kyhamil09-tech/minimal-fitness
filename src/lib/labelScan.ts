import { MICROS, Micros, MicroId } from './micros';

/**
 * Reading a nutrition facts label from a photo. The phone's own text recognition turns the picture into pieces of text with their
 * positions (nothing is sent anywhere); this puts the pieces back into rows and finds the numbers: calories, fat, carbohydrate, fiber,
 * sugar, protein, sodium (or salt) and the vitamins and minerals a label lists. It is a best effort, so the person checks every number
 * before it is saved.
 */

export interface TextLine {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Puts recognized pieces of text back into rows: pieces at the same height are joined left to right. */
export const rowsFromLines = (lines: TextLine[]): string[] => {
  const sorted = [...lines].filter((l) => l.text.trim()).sort((a, b) => (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
  const rows: TextLine[][] = [];
  for (const l of sorted) {
    const mid = (l.top + l.bottom) / 2;
    const last = rows[rows.length - 1];
    const lastMid = last ? last.reduce((s, x) => s + (x.top + x.bottom) / 2, 0) / last.length : 0;
    const height = Math.max(1, l.bottom - l.top);
    if (last && Math.abs(mid - lastMid) < height * 0.6) last.push(l);
    else rows.push([l]);
  }
  return rows.map((r) => r.sort((a, b) => a.left - b.left).map((x) => x.text.trim()).join(' '));
};

export interface ParsedLabel {
  /** What the numbers are for: one serving, or 100 g. */
  basis: 'serving' | '100g';
  servingText?: string;
  servingG?: number;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  satFatG?: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  micros: Micros;
  /** Names of the things that were found, for telling the person what to check. */
  found: string[];
}

/** Common slips of text recognition inside a number: a letter O for a zero, an S for a five (before a unit). */
const tidy = (row: string): string =>
  row
    .toLowerCase()
    .replace(/[|]/g, ' ')
    .replace(/\bsg\b/g, '5g')
    .replace(/\bog\b/g, '0g')
    .replace(/(\d)o(?=\d)/g, '$10')
    .replace(/(?<=\d)o\b/g, '0')
    .replace(/\s+/g, ' ')
    .trim();

/** The first number in a piece of text, with a comma allowed as the decimal mark, and the unit right after it. */
const firstNumber = (s: string): { value: number; unit: string } | null => {
  const m = /(\d+(?:[.,]\d+)?)\s*(kcal|kj|mcg|µg|μg|ug|mg|g|iu|ml|%)?/.exec(s);
  if (!m) return null;
  const value = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(value) ? { value, unit: (m[2] ?? '').replace(/[µμ]g|ug/, 'mcg') } : null;
};

const toGrams = (n: { value: number; unit: string }): number => (n.unit === 'mg' ? n.value / 1000 : n.unit === 'mcg' ? n.value / 1_000_000 : n.value);

const MICRO_NAMES: { id: MicroId; re: RegExp }[] = [
  { id: 'vitD', re: /vitamin d/ },
  { id: 'calcium', re: /calcium/ },
  { id: 'iron', re: /\biron\b/ },
  { id: 'potassium', re: /potassium/ },
  { id: 'vitC', re: /vitamin c/ },
  { id: 'vitA', re: /vitamin a/ },
  { id: 'vitE', re: /vitamin e/ },
  { id: 'vitK', re: /vitamin k/ },
  { id: 'b6', re: /vitamin b-?6/ },
  { id: 'b12', re: /vitamin b-?12/ },
  { id: 'folate', re: /folate|folic/ },
  { id: 'magnesium', re: /magnesium/ },
  { id: 'zinc', re: /\bzinc\b/ },
];

export const parseLabel = (rows: string[]): ParsedLabel => {
  const out: ParsedLabel = { basis: 'serving', micros: {}, found: [] };
  const lines = rows.map(tidy).filter(Boolean);
  const all = lines.join(' \n ');
  const per100 = all.search(/per\s*100\s*(g|ml)|pro\s*100\s*g|pour\s*100\s*g|per\s*100g/);
  const perServing = all.search(/per\s*serving|serving size|par portion|pro portion/);
  if (per100 >= 0 && (perServing < 0 || per100 < perServing)) out.basis = '100g';

  for (const row of lines) {
    // serving size
    if (/serving size|portion size|serving:/.test(row) && !out.servingText) {
      const text = row.replace(/^.*?(serving size|portion size|serving):?\s*/, '').trim();
      if (text) {
        out.servingText = text.replace(/\s*\(.*$/, '').trim() || text;
        const g = /(\d+(?:[.,]\d+)?)\s*g\b/.exec(text);
        if (g) out.servingG = parseFloat(g[1].replace(',', '.'));
      }
      continue;
    }
    if (/servings? per|amount per|% daily|daily value|\*/.test(row) && !/calories|energy/.test(row)) continue;

    const after = (re: RegExp) => {
      const m = re.exec(row);
      return m ? row.slice(m.index + m[0].length) : null;
    };

    if (out.kcal === undefined) {
      const k = /(\d+(?:[.,]\d+)?)\s*kcal/.exec(row);
      if (k) {
        out.kcal = Math.round(parseFloat(k[1].replace(',', '.')));
        out.found.push('calories');
        continue;
      }
      const cal = after(/\bcalories\b/);
      if (cal !== null) {
        const n = firstNumber(cal);
        if (n && n.unit !== '%') {
          out.kcal = Math.round(n.value);
          out.found.push('calories');
          continue;
        }
      }
      const kj = /(\d+(?:[.,]\d+)?)\s*kj/.exec(row);
      if (kj && /energy|energie/.test(row)) {
        out.kcal = Math.round(parseFloat(kj[1].replace(',', '.')) / 4.184);
        out.found.push('calories');
        continue;
      }
    }

    const grab = (re: RegExp, set: (g: number) => void, name: string, current: number | undefined, exclude?: RegExp): boolean => {
      if (current !== undefined || (exclude && exclude.test(row))) return false;
      const rest = after(re);
      if (rest === null) return false;
      const n = firstNumber(rest);
      if (!n || n.unit === '%' || n.unit === 'kcal') return false;
      set(Math.round(toGrams(n) * 10) / 10);
      out.found.push(name);
      return true;
    };

    if (/saturat|trans|polyunsat|monounsat|of which/.test(row) && !/sugars/.test(row)) {
      grab(/saturat(?:ed|es)(?: fat)?/, (g) => (out.satFatG = g), 'saturated fat', out.satFatG);
      continue;
    }
    if (/added sugars?/.test(row) && !/total sugars/.test(row)) continue;
    if (grab(/total fat|\bfat\b/, (g) => (out.fatG = g), 'fat', out.fatG, /fatty/)) continue;
    if (grab(/total carbohydrates?|carbohydrates?|carbs?/, (g) => (out.carbsG = g), 'carbohydrate', out.carbsG)) continue;
    if (grab(/dietary fib(?:er|re)|fib(?:er|re)/, (g) => (out.fiberG = g), 'fiber', out.fiberG)) continue;
    if (grab(/total sugars?|of which sugars?|sugars?/, (g) => (out.sugarG = g), 'sugar', out.sugarG)) continue;
    if (grab(/protein/, (g) => (out.proteinG = g), 'protein', out.proteinG)) continue;
    if (out.sodiumMg === undefined && /sodium/.test(row)) {
      const n = firstNumber(after(/sodium/) ?? '');
      if (n && n.unit !== '%') {
        out.sodiumMg = Math.round(n.unit === 'g' ? n.value * 1000 : n.value);
        out.found.push('sodium');
        continue;
      }
    }
    if (out.sodiumMg === undefined && /\bsalt\b/.test(row)) {
      const n = firstNumber(after(/\bsalt\b/) ?? '');
      if (n && n.unit !== '%') {
        // salt is 40% sodium
        out.sodiumMg = Math.round((n.unit === 'mg' ? n.value / 1000 : n.value) * 400);
        out.found.push('sodium (from salt)');
        continue;
      }
    }

    for (const m of MICRO_NAMES) {
      if (out.micros[m.id] !== undefined || !m.re.test(row)) continue;
      const rest = after(m.re);
      const n = rest === null ? null : firstNumber(rest);
      const def = MICROS.find((d) => d.id === m.id)!;
      if (!n || n.unit === '%' || n.unit === 'kcal' || n.unit === 'g' && def.unit !== 'mg') continue;
      let v = n.value;
      if (def.unit === 'mg') v = n.unit === 'mcg' ? n.value / 1000 : n.unit === 'g' ? n.value * 1000 : n.value;
      else v = n.unit === 'mg' ? n.value * 1000 : n.value;
      if (m.id === 'vitD' && n.unit === 'iu') v = n.value * 0.025;
      if (v > 0 && v <= def.dv * 40) {
        out.micros[m.id] = Math.round(v * 100) / 100;
        out.found.push(def.label.toLowerCase());
      }
      break;
    }
  }
  return out;
};

/** How many of the main numbers were read (of calories, protein, carbohydrate, fat). */
export const mainFound = (p: ParsedLabel): number => [p.kcal, p.proteinG, p.carbsG, p.fatG].filter((v) => v !== undefined).length;
