/**
 * Warm-up sets for a working weight: 50%, 70% and 90% of it for 5, 3 and 1 reps, each rounded to the nearest plate jump and never lighter
 * than the empty bar. Sets that come out the same, or as heavy as the work, are dropped. All numbers are in the person's own units.
 */

export interface WarmupSet {
  weight: number;
  reps: number;
}

const STEPS: { pct: number; reps: number }[] = [
  { pct: 0.5, reps: 5 },
  { pct: 0.7, reps: 3 },
  { pct: 0.9, reps: 1 },
];

/** The smallest jump the plates allow in each side's pair: 2.5 kg or 5 lb. */
export const plateJump = (unit: 'kg' | 'lb'): number => (unit === 'lb' ? 5 : 2.5);

export const warmupSets = (working: number, bar: number, unit: 'kg' | 'lb'): WarmupSet[] => {
  if (!(working > bar * 1.2)) return [];
  const jump = plateJump(unit);
  const out: WarmupSet[] = [];
  for (const s of STEPS) {
    const w = Math.max(bar, Math.round((working * s.pct) / jump) * jump);
    if (w <= 0 || w >= working - 1e-9) continue;
    if (out.some((o) => o.weight === w)) continue;
    out.push({ weight: w, reps: s.reps });
  }
  return out;
};
