/** Pace and heart-rate targets for a run: pure checks the live screen calls once a second. */

export type TargetVerdict = 'ok' | 'slow' | 'fast' | 'low' | 'high' | null;

/** Pace in seconds per kilometer from a speed in m/s, or null when standing still. */
export const paceSecPerKm = (speedMs: number | null): number | null =>
  speedMs !== null && speedMs > 0.5 ? 1000 / speedMs : null;

/**
 * Compares your pace with a target (seconds per km) allowing `toleranceSec` either side.
 * 'slow' means you are behind the target pace, 'fast' means you are ahead of it.
 */
export const paceVerdict = (speedMs: number | null, targetSecPerKm: number, toleranceSec = 10): TargetVerdict => {
  const pace = paceSecPerKm(speedMs);
  if (pace === null) return null;
  if (pace > targetSecPerKm + toleranceSec) return 'slow';
  if (pace < targetSecPerKm - toleranceSec) return 'fast';
  return 'ok';
};

/** Heart-rate zone (1-5) from the percentage of max heart rate, or 0 without a reading. */
export const zoneFor = (bpm: number, maxHr: number): number => {
  if (bpm <= 0 || maxHr <= 0) return 0;
  const pct = bpm / maxHr;
  return pct < 0.6 ? 1 : pct < 0.7 ? 2 : pct < 0.8 ? 3 : pct < 0.9 ? 4 : 5;
};

/** 'low' when below the target zone, 'high' when above it, null without a reading. */
export const zoneVerdict = (bpm: number, maxHr: number, targetZone: number): TargetVerdict => {
  const z = zoneFor(bpm, maxHr);
  if (z === 0) return null;
  if (z < targetZone) return 'low';
  if (z > targetZone) return 'high';
  return 'ok';
};

/** Wording spoken for a verdict. */
export const verdictMessage = (v: TargetVerdict, gapSecPerKm?: number, miles = false): string => {
  if ((v === 'slow' || v === 'fast') && gapSecPerKm !== undefined) {
    const gap = Math.round((miles ? gapSecPerKm * 1.609344 : gapSecPerKm) / 5) * 5;
    if (gap >= 5) {
      const how = `${gap} seconds per ${miles ? 'mile' : 'kilometer'}`;
      return v === 'slow' ? `Speed up, you are ${how} behind` : `Slow down, you are ${how} ahead`;
    }
  }
  return v === 'slow' ? 'Speed up' : v === 'fast' ? 'Slow down' : v === 'high' ? 'Heart rate high, ease off' : v === 'low' ? 'Heart rate low, pick it up' : '';
};

/** How far off the target pace you are, in seconds per km (positive means slower than target); null while standing still. */
export const paceGapSec = (speedMs: number | null, targetSecPerKm: number): number | null => {
  const pace = paceSecPerKm(speedMs);
  return pace === null ? null : pace - targetSecPerKm;
};

/** Formats seconds per km as m:ss. */
export const formatPaceSec = (sec: number): string => {
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
