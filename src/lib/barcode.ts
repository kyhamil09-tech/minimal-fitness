import type { FoodRecord } from './foodDb';
import { offMicros } from './micros';

export interface BarcodeProduct {
  name: string;
  per100g: { calories: number; proteinG: number; carbsG: number; fatG: number };
  servingG?: number;
}

/** Pure mapper so the parsing can be tested without network access. */
export const mapOpenFoodFacts = (json: any): BarcodeProduct | null => {
  if (!json || json.status === 0 || !json.product) return null;
  const p = json.product;
  const n = p.nutriments || {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
  let kcal = num(n['energy-kcal_100g']);
  if (!kcal && n['energy_100g']) kcal = num(n['energy_100g']) / 4.184; // kJ -> kcal
  if (!kcal && !n['proteins_100g'] && !n['carbohydrates_100g'] && !n['fat_100g']) return null;
  return {
    name: String(p.product_name || 'Scanned product').trim() || 'Scanned product',
    per100g: {
      calories: Math.round(kcal),
      proteinG: Math.round(num(n['proteins_100g']) * 10) / 10,
      carbsG: Math.round(num(n['carbohydrates_100g']) * 10) / 10,
      fatG: Math.round(num(n['fat_100g']) * 10) / 10,
    },
    servingG: num(p.serving_quantity) || undefined,
  };
};

/**
 * Looks a barcode up on Open Food Facts. This is the ONLY network request the app can make;
 * only the barcode number is sent, and only when the user presses "Look up".
 */
export const lookupBarcode = async (code: string, signal?: AbortSignal): Promise<BarcodeProduct | null> => {
  const clean = code.replace(/\D/g, '');
  if (clean.length < 6) throw new Error('Enter the digits printed under the barcode.');
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=product_name,nutriments,serving_quantity`,
    { signal }
  );
  if (!res.ok && res.status !== 404) throw new Error('Lookup service is unavailable right now.');
  return mapOpenFoodFacts(await res.json());
};

/** Pure mapper for a text search result list. Products without nutrition or a name are skipped. */
export const mapSearchResults = (json: any): BarcodeProduct[] => {
  const list: any[] = Array.isArray(json?.products) ? json.products : [];
  const out: BarcodeProduct[] = [];
  for (const p of list) {
    const mapped = mapOpenFoodFacts({ status: 1, product: p });
    const name = String(p?.product_name || '').trim();
    if (!mapped || !name || mapped.per100g.calories <= 0) continue;
    const brand = String(p?.brands || '').split(',')[0].trim();
    out.push({ ...mapped, name: brand ? `${name} (${brand})` : name });
    if (out.length >= 20) break;
  }
  return out;
};

// ---- Packaged foods as full food records (fiber, sugar, sodium, serving size, brand) ----

const FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size';

/** One Open Food Facts product as a food record, or null when it has no name or no nutrition. */
export const offRecord = (p: any): FoodRecord | null => {
  const mapped = mapOpenFoodFacts({ status: 1, product: p });
  const name = String(p?.product_name || '').trim();
  if (!mapped || !name) return null;
  const n = p.nutriments || {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
  const brand = String(p?.brands || '').split(',')[0].trim();
  let sodiumMg = num(n['sodium_100g']) * 1000;
  if (!sodiumMg && n['salt_100g']) sodiumMg = num(n['salt_100g']) * 400;
  const portions: FoodRecord['portions'] = [];
  const g = num(p.serving_quantity);
  if (g > 0) {
    const text = String(p.serving_size || '').trim();
    portions.push({ label: text && text.length <= 28 ? `1 serving (${text})` : '1 serving', g });
  }
  return {
    id: `off:${p.code ?? name}`,
    name,
    group: 0,
    src: 'off',
    kcal: mapped.per100g.calories,
    p: mapped.per100g.proteinG,
    c: mapped.per100g.carbsG,
    f: mapped.per100g.fatG,
    fiber: Math.round(num(n['fiber_100g']) * 10) / 10,
    sugar: Math.round(num(n['sugars_100g']) * 10) / 10,
    sodium: Math.round(sodiumMg),
    portions,
    brand: brand || undefined,
    barcode: p.code ? String(p.code) : undefined,
    micros: offMicros(n),
  };
};

/** Pure mapper for a search result list as food records (up to 30; items with no calories are skipped). */
export const mapPackagedResults = (json: any): FoodRecord[] => {
  const list: any[] = Array.isArray(json?.products) ? json.products : [];
  const out: FoodRecord[] = [];
  const seen = new Set<string>();
  for (const p of list) {
    const r = offRecord(p);
    if (!r || r.kcal <= 0) continue;
    const key = `${r.name.toLowerCase()}|${r.brand ?? ''}|${r.kcal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= 30) break;
  }
  return out;
};

/** Searches packaged foods on Open Food Facts, most scanned first. Only the words you typed are sent, and only when you ask. */
export const searchPackaged = async (query: string, signal?: AbortSignal): Promise<FoodRecord[]> => {
  const q = query.trim();
  if (q.length < 2) throw new Error('Type at least two letters.');
  const res = await fetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=40&sort_by=unique_scans_n&fields=${FIELDS}`,
    { signal }
  );
  if (!res.ok) throw new Error('The food service is unavailable right now.');
  return mapPackagedResults(await res.json());
};

/**
 * The numbers to try for a scanned or typed barcode, in order. US products carry a 12-digit UPC, which Open Food Facts keeps as a
 * 13-digit code with a 0 in front, so that form goes first.
 */
export const barcodeCandidates = (code: string): string[] => {
  const clean = code.replace(/\D/g, '');
  return clean.length === 12 ? [`0${clean}`, clean] : [clean];
};

/** Looks a barcode up as a food record. Only the number is sent. */
export const lookupPackaged = async (code: string, signal?: AbortSignal): Promise<FoodRecord | null> => {
  const clean = code.replace(/\D/g, '');
  if (clean.length < 6) throw new Error('Enter the digits printed under the barcode.');
  for (const candidate of barcodeCandidates(clean)) {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${candidate}.json?fields=${FIELDS}`, { signal });
    if (!res.ok && res.status !== 404) throw new Error('The food service is unavailable right now.');
    const json = await res.json();
    if (json && json.status !== 0 && json.product) return offRecord({ ...json.product, code: candidate });
  }
  return null;
};

/** Searches Open Food Facts by name. Only the words you typed are sent, and only when you press Search. */
export const searchFoods = async (query: string, signal?: AbortSignal): Promise<BarcodeProduct[]> => {
  const q = query.trim();
  if (q.length < 3) throw new Error('Type at least three letters.');
  const res = await fetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30&fields=product_name,brands,nutriments,serving_quantity`,
    { signal }
  );
  if (!res.ok) throw new Error('Search service is unavailable right now.');
  return mapSearchResults(await res.json());
};