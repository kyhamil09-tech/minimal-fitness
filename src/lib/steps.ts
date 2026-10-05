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

/**
 * Steps taken out of each source for one day (the periods you removed, such as a drive). A source that is missing here had no
 * timed data for a removed period, so it cannot be corrected.
 */
export type Removed = { phone?: number; watch?: number; hc?: number };

const SOURCE_KEYS = ['phone', 'watch', 'hc'] as const;

/** One day's steps for the chosen source. History from before sources were separated counts under every choice. */
export const resolveDay = (day: DaySteps | undefined, source: StepSource, removed?: Removed): number => {
  if (!day) return 0;
  const old = clean(day.old);
  const phone = Math.max(0, clean(day.phone) - clean(removed?.phone));
  const watch = Math.max(0, clean(day.watch) - clean(removed?.watch));
  const hc = Math.max(0, clean(day.hc) - clean(removed?.hc));
  switch (source) {
    case 'phone':
      return Math.max(old, phone);
    case 'watch':
      return Math.max(old, watch);
    case 'health-connect':
      return Math.max(old, hc);
    default: {
      // After a period was taken out, a source that could not be corrected for it would win the "highest" rule with the
      // very steps that were removed, so only the corrected sources count that day.
      const corrected = removed && SOURCE_KEYS.some((k) => removed[k] !== undefined);
      const use = (k: keyof Removed, n: number) => (corrected && removed?.[k] === undefined ? 0 : n);
      return Math.max(old, use('phone', phone), use('watch', watch), use('hc', hc));
    }
  }
};

/** "Steps so far that day" at a moment, oldest first. */
export type StepSample = [number, number];
export interface StepSamples {
  phone: StepSample[];
  watch: StepSample[];
  hc: StepSample[];
}
export const NO_SAMPLES: StepSamples = { phone: [], watch: [], hc: [] };

/** A period of one day whose steps you took out, and how many that took from each source. */
export interface StepWindow {
  id: string;
  date: string;
  fromMs: number;
  toMs: number;
  removed: Removed;
}

const dayStartMs = (date: string) => new Date(`${date}T00:00:00`).getTime();
const dayEndMs = (date: string) => dayStartMs(date) + 24 * 3_600_000;

/** Steps counted so far at time `t` on `date`, read between the samples (the day starts at zero). */
export const stepsAt = (samples: StepSample[], date: string, t: number): number => {
  const start = dayStartMs(date);
  const end = dayEndMs(date);
  const rows = samples.filter(([ms]) => ms >= start && ms < end).sort((a, b) => a[0] - b[0]);
  if (rows.length === 0) return 0;
  if (t <= start) return 0;
  const first = rows[0];
  if (t <= first[0]) return first[0] === start ? first[1] : (first[1] * (t - start)) / (first[0] - start);
  const last = rows[rows.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < rows.length; i++) {
    const [t1, v1] = rows[i];
    if (t <= t1) {
      const [t0, v0] = rows[i - 1];
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return last[1];
};

/** How many steps each source counted between two times of a day. A source with no samples that day is left out. */
export const stepsInWindow = (samples: StepSamples, date: string, fromMs: number, toMs: number): Removed => {
  const out: Removed = {};
  const lo = Math.min(fromMs, toMs);
  const hi = Math.max(fromMs, toMs);
  for (const key of ['phone', 'watch', 'hc'] as const) {
    const start = dayStartMs(date);
    const end = dayEndMs(date);
    if (!samples[key].some(([ms]) => ms >= start && ms < end)) continue;
    out[key] = Math.max(0, Math.round(stepsAt(samples[key], date, hi) - stepsAt(samples[key], date, lo)));
  }
  return out;
};

/** Turns hourly Health Connect pieces ([start, end, steps]) into "so far that day" samples. */
export const bucketsToSamples = (buckets: [number, number, number][]): StepSample[] => {
  const out: StepSample[] = [];
  let day = '';
  let total = 0;
  for (const [start, end, n] of [...buckets].sort((a, b) => a[0] - b[0])) {
    const d = new Date(start);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (key !== day) {
      day = key;
      total = 0;
    }
    total += clean(n);
    out.push([end, total]);
  }
  return out;
};

/** Keeps samples from the last `days` days. */
export const trimSamples = (samples: StepSamples, now: number, days = 15): StepSamples => {
  const cutoff = now - days * 86_400_000;
  const keep = (rows: StepSample[]) => rows.filter(([ms]) => ms >= cutoff);
  return { phone: keep(samples.phone), watch: keep(samples.watch), hc: keep(samples.hc) };
};

/** The windows added up per day. */
export const removedByDate = (windows: StepWindow[]): Record<string, Removed> => {
  const out: Record<string, Removed> = {};
  const byDate = new Map<string, StepWindow[]>();
  for (const w of windows) byDate.set(w.date, [...(byDate.get(w.date) ?? []), w]);
  for (const [date, list] of byDate) {
    const cur: Removed = {};
    // A source counts only if every period that day could be corrected for it.
    for (const key of SOURCE_KEYS) {
      if (list.every((w) => w.removed[key] !== undefined)) cur[key] = list.reduce((s, w) => s + (w.removed[key] ?? 0), 0);
    }
    out[date] = cur;
  }
  return out;
};

/**
 * Daily totals for the whole log. A number you set for a day (`overrides`, 0 included) beats every source, which is how a day
 * is corrected or deleted; removing the override returns the day to the automatic count.
 */
export const resolveSteps = (
  by: StepsBySource,
  source: StepSource,
  overrides: Record<string, number>,
  windows: StepWindow[] = []
): Record<string, number> => {
  const out: Record<string, number> = {};
  const removed = removedByDate(windows);
  for (const date of Object.keys(by)) {
    const n = resolveDay(by[date], source, removed[date]);
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
