/** Where a day's steps come from. 'auto' takes the highest of every source, since each one can only under-count. */
export type StepSource = 'auto' | 'phone' | 'watch' | 'health-connect';

export const STEP_SOURCES: readonly StepSource[] = ['auto', 'phone', 'watch', 'health-connect'];

/** What each source counted for one day. `old` is history saved before sources were kept apart. */
export interface DaySteps {
  phone?: number;
  watch?: number;
  hc?: number;
  old?: number;
}

export type StepsBySource = Record<string, DaySteps>;

const clean = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

/** A counter only goes up during a day, so a source keeps the highest value it has reported. */
export const recordSource = (by: StepsBySource, date: string, source: keyof DaySteps, value: number | undefined | null): StepsBySource => {
  const v = clean(value);
  if (v === 0) return by;
  const day = by[date] ?? {};
  if ((day[source] ?? 0) >= v) return by;
  return { ...by, [date]: { ...day, [source]: v } };
};

/** One day's steps for the chosen source. History from before sources were separated counts under every choice. */
export const resolveDay = (day: DaySteps | undefined, source: StepSource): number => {
  if (!day) return 0;
  const old = clean(day.old);
  switch (source) {
    case 'phone':
      return Math.max(old, clean(day.phone));
    case 'watch':
      return Math.max(old, clean(day.watch));
    case 'health-connect':
      return Math.max(old, clean(day.hc));
    default:
      return Math.max(old, clean(day.phone), clean(day.watch), clean(day.hc));
  }
};

/**
 * Daily totals for the whole log. A number you set for a day (`overrides`, 0 included) beats every source, which is how a day
 * is corrected or deleted; removing the override returns the day to the automatic count.
 */
export const resolveSteps = (by: StepsBySource, source: StepSource, overrides: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const date of Object.keys(by)) {
    const n = resolveDay(by[date], source);
    if (n > 0) out[date] = n;
  }
  for (const [date, n] of Object.entries(overrides)) out[date] = clean(n);
  return out;
};

/** Moves the old "highest ever seen" totals into the per-source record. Today is left out, because its source is unknown. */
export const migrateOldSteps = (old: Record<string, number>, by: StepsBySource, today: string): StepsBySource => {
  let next = by;
  for (const [date, n] of Object.entries(old)) {
    if (date >= today) continue;
    next = recordSource(next, date, 'old', n);
  }
  return next;
};

export const usesPhone = (s: StepSource) => s === 'auto' || s === 'phone';
export const usesHealthConnect = (s: StepSource) => s === 'auto' || s === 'health-connect';

export const STEP_SOURCE_LABEL: Record<StepSource, string> = {
  auto: 'Best of all',
  phone: 'Phone',
  watch: 'Watch',
  'health-connect': 'Health Connect',
};

export const STEP_SOURCE_HELP: Record<StepSource, string> = {
  auto: 'Uses whichever source counted the most. Good if you sometimes leave the phone behind.',
  phone: "Counts with this phone's own step counter. The watch and Health Connect are ignored.",
  watch: 'Counts what the watch reports. The phone’s counter is switched off to save battery.',
  'health-connect': 'Counts what other apps saved to Health Connect. The phone’s own counter is switched off.',
};
