import type { FoodRecord } from './foodDb';
import { MICROS, Micros, hasMicros } from './micros';

/**
 * A second place to look for a barcode: the US government's FoodData Central branded-foods list (public domain, about 1.9 million
 * US products). It is only asked when the person taps for it after Open Food Facts had no answer, and it is sent the barcode digits
 * and nothing else. USDA's shared "DEMO_KEY" has a small allowance per phone; a free key of your own (api.data.gov) lifts it.
 */

const SEARCH = 'https://api.nal.usda.gov/fdc/v1/foods/search';
export const KEY_STORE = 'ky_secret_fdc_key';
export const DEMO_KEY = 'DEMO_KEY';

export const getFdcKey = (store: Pick<Storage, 'getItem'> = localStorage): string => {
  try {
    const k = (store.getItem(KEY_STORE) ?? '').trim();
    return /^[A-Za-z0-9]{20,60}$/.test(k) ? k : DEMO_KEY;
  } catch {
    return DEMO_KEY;
  }
};

export const hasOwnKey = (): boolean => getFdcKey() !== DEMO_KEY;

/** Barcodes compared without leading zeros, so a 12-digit UPC and its 13-digit EAN form match. */
const stripZeros = (s: string): string => s.replace(/\D/g, '').replace(/^0+/, '');

interface FdcNutrient {
  nutrientNumber?: string | number;
  nutrientId?: number;
  value?: number;
}

interface FdcFood {
  fdcId?: number;
  description?: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: FdcNutrient[];
}

const nutrientValue = (list: FdcNutrient[], number: number): number => {
  const hit = list.find((n) => Number(n.nutrientNumber) === number);
  const v = Number(hit?.value);
  return Number.isFinite(v) ? v : 0;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

const titleCase = (s: string): string => s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/** One branded food from FoodData Central as a food record (its numbers are per 100 g). Null when it has no calories or no name. */
export const fdcRecord = (f: FdcFood): FoodRecord | null => {
  const list = f.foodNutrients ?? [];
  let kcal = nutrientValue(list, 208);
  if (!kcal) kcal = nutrientValue(list, 957) || nutrientValue(list, 958);
  const name = (f.description ?? '').trim();
  if (!name || !(kcal > 0)) return null;
  let sodium = nutrientValue(list, 307);
  const micros: Micros = {};
  for (const m of MICROS) {
    const v = nutrientValue(list, m.fnddsNo);
    if (v > 0) micros[m.id] = Math.round(v * 100) / 100;
  }
  const brand = (f.brandName || f.brandOwner || '').trim();
  const grams = f.servingSize && /^g/i.test(f.servingSizeUnit ?? 'g') ? f.servingSize : f.servingSize && /^ml/i.test(f.servingSizeUnit ?? '') ? f.servingSize : 0;
  const portions: FoodRecord['portions'] = [];
  if (grams > 0) {
    const text = (f.householdServingFullText ?? '').trim();
    portions.push({ label: text && text.length <= 28 ? `1 serving (${text})` : `1 serving (${grams} g)`, g: grams });
  }
  sodium = Math.round(sodium);
  return {
    id: `fdc:${f.fdcId ?? name}`,
    name: titleCase(name),
    group: 0,
    src: 'usda',
    kcal: Math.round(kcal),
    p: r1(nutrientValue(list, 203)),
    c: r1(nutrientValue(list, 205)),
    f: r1(nutrientValue(list, 204)),
    fiber: r1(nutrientValue(list, 291)),
    sugar: r1(nutrientValue(list, 269)),
    sodium,
    portions,
    brand: brand ? titleCase(brand) : undefined,
    barcode: f.gtinUpc ? String(f.gtinUpc) : undefined,
    ...(hasMicros(micros) ? { micros } : {}),
  };
};

/** The result for a barcode out of a search response: the product whose barcode matches, or null. */
export const pickByBarcode = (json: unknown, code: string): FoodRecord | null => {
  const foods = (json as { foods?: FdcFood[] } | null)?.foods;
  if (!Array.isArray(foods)) return null;
  const want = stripZeros(code);
  const hit = foods.find((f) => f.gtinUpc && stripZeros(String(f.gtinUpc)) === want);
  return hit ? fdcRecord(hit) : null;
};

export class UsdaLimitError extends Error {
  constructor() {
    super("USDA's shared allowance for this lookup is used up for now. Try again later, or add a free key of your own.");
  }
}

/** Looks a barcode up in the USDA branded foods. Only the digits are sent. */
export const lookupUsda = async (code: string, key: string = getFdcKey(), signal?: AbortSignal): Promise<FoodRecord | null> => {
  const clean = code.replace(/\D/g, '');
  if (clean.length < 6) throw new Error('Enter the digits printed under the barcode.');
  const url = `${SEARCH}?query=${encodeURIComponent(clean)}&dataType=Branded&pageSize=10&api_key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal });
  if (res.status === 429) throw new UsdaLimitError();
  if (res.status === 403) throw new Error('USDA did not accept the key. Check it, or clear it to use the shared one.');
  if (!res.ok) throw new Error('The USDA food service is unavailable right now.');
  return pickByBarcode(await res.json(), clean);
};
