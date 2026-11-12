/**
 * The barbell and plates you actually have, so the plate calculator and the warm-up sets use them. Kept per unit (a 15 kg bar and a
 * 35 lb bar are different bars), in the person's own units.
 */

/** Plates a gym can have, heaviest first. */
export const PLATE_CATALOG_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
export const PLATE_CATALOG_LB = [55, 45, 35, 25, 10, 5, 2.5, 1.25];

/** The usual set of plates, and the usual bar. */
export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
export const DEFAULT_PLATES_LB = [45, 35, 25, 10, 5, 2.5];
export const DEFAULT_BAR_KG = 20;
export const DEFAULT_BAR_LB = 45;

/** Bars to pick from in one tap; any weight from 0 to 60 can be typed. */
export const BAR_CHOICES_KG = [10, 15, 20];
export const BAR_CHOICES_LB = [25, 35, 45];

/** A stored plate list: only plates from the catalog, heaviest first, at least one (else the usual set). */
export const sanitizePlates = (raw: unknown, catalog: number[], fallback: number[]): number[] => {
  if (!Array.isArray(raw)) return [...fallback];
  const picked = catalog.filter((p) => raw.some((x) => Number(x) === p));
  return picked.length ? picked : [...fallback];
};

export interface Gear {
  bar: number;
  plates: number[];
}

export const gearFor = (unit: 'kg' | 'lb', p: { liftBarKg: number; liftBarLb: number; liftPlatesKg: number[]; liftPlatesLb: number[] }): Gear =>
  unit === 'lb' ? { bar: p.liftBarLb, plates: p.liftPlatesLb } : { bar: p.liftBarKg, plates: p.liftPlatesKg };
