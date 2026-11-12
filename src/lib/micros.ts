/**
 * Vitamins and minerals. A food carries them when its source has them (packaged foods from Open Food Facts, foods you type in, and the
 * USDA list once it is rebuilt with them); a day's total only adds up what is known, and says so. Daily values are the US label
 * reference amounts for adults, a common yardstick, not advice for any one person.
 */

export type MicroId = 'vitC' | 'vitD' | 'vitA' | 'vitE' | 'vitK' | 'b6' | 'b12' | 'folate' | 'calcium' | 'iron' | 'magnesium' | 'potassium' | 'zinc';

export interface MicroDef {
  id: MicroId;
  label: string;
  unit: 'mg' | 'µg';
  /** Daily value, in {@link unit}. */
  dv: number;
  /** Open Food Facts name (amounts there are in grams per 100 g). */
  off: string;
  /** USDA nutrient id (SR Legacy) and number (FNDDS survey foods), used by tools/build-food-db.mjs. */
  usdaId: number;
  fnddsNo: number;
}

export const MICROS: MicroDef[] = [
  { id: 'vitC', label: 'Vitamin C', unit: 'mg', dv: 90, off: 'vitamin-c', usdaId: 1162, fnddsNo: 401 },
  { id: 'vitD', label: 'Vitamin D', unit: 'µg', dv: 20, off: 'vitamin-d', usdaId: 1114, fnddsNo: 328 },
  { id: 'vitA', label: 'Vitamin A', unit: 'µg', dv: 900, off: 'vitamin-a', usdaId: 1106, fnddsNo: 320 },
  { id: 'vitE', label: 'Vitamin E', unit: 'mg', dv: 15, off: 'vitamin-e', usdaId: 1109, fnddsNo: 323 },
  { id: 'vitK', label: 'Vitamin K', unit: 'µg', dv: 120, off: 'vitamin-k', usdaId: 1185, fnddsNo: 430 },
  { id: 'b6', label: 'Vitamin B6', unit: 'mg', dv: 1.7, off: 'vitamin-b6', usdaId: 1175, fnddsNo: 415 },
  { id: 'b12', label: 'Vitamin B12', unit: 'µg', dv: 2.4, off: 'vitamin-b12', usdaId: 1178, fnddsNo: 418 },
  { id: 'folate', label: 'Folate', unit: 'µg', dv: 400, off: 'vitamin-b9', usdaId: 1190, fnddsNo: 435 },
  { id: 'calcium', label: 'Calcium', unit: 'mg', dv: 1300, off: 'calcium', usdaId: 1087, fnddsNo: 301 },
  { id: 'iron', label: 'Iron', unit: 'mg', dv: 18, off: 'iron', usdaId: 1089, fnddsNo: 303 },
  { id: 'magnesium', label: 'Magnesium', unit: 'mg', dv: 420, off: 'magnesium', usdaId: 1090, fnddsNo: 304 },
  { id: 'potassium', label: 'Potassium', unit: 'mg', dv: 4700, off: 'potassium', usdaId: 1092, fnddsNo: 306 },
  { id: 'zinc', label: 'Zinc', unit: 'mg', dv: 11, off: 'zinc', usdaId: 1095, fnddsNo: 309 },
];

/** The order the USDA file stores them in (a fixed list of numbers per food). */
export const MICRO_ORDER: MicroId[] = MICROS.map((m) => m.id);

export type Micros = Partial<Record<MicroId, number>>;

const r2 = (n: number) => Math.round(n * 100) / 100;

export const hasMicros = (m: Micros | undefined): boolean => !!m && MICRO_ORDER.some((id) => (m[id] ?? 0) > 0);

export const scaleMicros = (m: Micros | undefined, k: number): Micros | undefined => {
  if (!m) return undefined;
  const out: Micros = {};
  for (const id of MICRO_ORDER) if ((m[id] ?? 0) > 0) out[id] = r2((m[id] as number) * k);
  return hasMicros(out) ? out : undefined;
};

export const addMicros = (a: Micros | undefined, b: Micros | undefined): Micros | undefined => {
  if (!a) return b;
  if (!b) return a;
  const out: Micros = {};
  for (const id of MICRO_ORDER) {
    const v = (a[id] ?? 0) + (b[id] ?? 0);
    if (v > 0) out[id] = r2(v);
  }
  return out;
};

/** From Open Food Facts nutriments (grams per 100 g) to the units above, per 100 g. */
export const offMicros = (nutriments: Record<string, unknown> | undefined): Micros | undefined => {
  if (!nutriments) return undefined;
  const out: Micros = {};
  for (const m of MICROS) {
    const raw = nutriments[`${m.off}_100g`];
    const g = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(g) || g <= 0) continue;
    // grams -> milligrams or micrograms
    const v = m.unit === 'mg' ? g * 1000 : g * 1_000_000;
    // A value far above anything a food holds is a data slip (an amount in the wrong unit): leave it out.
    if (v > m.dv * 40) continue;
    out[m.id] = r2(v);
  }
  return hasMicros(out) ? out : undefined;
};

/** From the USDA file's fixed list of numbers (0 or missing means not known). */
export const microsFromList = (list: unknown): Micros | undefined => {
  if (!Array.isArray(list)) return undefined;
  const out: Micros = {};
  MICRO_ORDER.forEach((id, i) => {
    const v = Number(list[i]);
    if (Number.isFinite(v) && v > 0) out[id] = v;
  });
  return hasMicros(out) ? out : undefined;
};

export interface MicroRow {
  def: MicroDef;
  amount: number;
  /** Percent of the daily value (can pass 100). */
  pct: number;
}

/** The day's vitamins and minerals from the entries that carry them, and how many entries had none. */
export const dayMicros = (entries: { micros?: Micros }[]): { rows: MicroRow[]; known: number; unknown: number } => {
  let total: Micros | undefined;
  let known = 0;
  for (const e of entries) {
    if (hasMicros(e.micros)) {
      total = addMicros(total, e.micros);
      known++;
    }
  }
  const rows = MICROS.map((def) => {
    const amount = total?.[def.id] ?? 0;
    return { def, amount, pct: Math.round((amount / def.dv) * 100) };
  });
  return { rows, known, unknown: entries.length - known };
};

export const microText = (def: MicroDef, amount: number): string => `${amount >= 100 ? Math.round(amount) : r2(amount)} ${def.unit}`;
