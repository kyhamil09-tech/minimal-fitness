import { addDays, parseDateKey, shortMonth, shortMonthDay, shortWeekday } from './dates';

export type TrendRange = '7d' | '30d' | '1y';

export interface Bucket {
  id: string;
  label: string;
}

export interface DayValue {
  key: string; // YYYY-MM-DD
  value: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Builds chart buckets ending today: 7 days, 30 days, or 12 calendar months. */
export const makeBuckets = (range: TrendRange, today: string): { buckets: Bucket[]; bucketOf: (key: string) => string } => {
  if (range === '1y') {
    const t = parseDateKey(today);
    const buckets: Bucket[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
      const id = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      buckets.push({ id, label: shortMonth(`${id}-01`) });
    }
    return { buckets, bucketOf: (key) => key.slice(0, 7) };
  }
  const n = range === '7d' ? 7 : 30;
  const buckets: Bucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = addDays(today, -i);
    buckets.push({ id: key, label: range === '7d' ? shortWeekday(key) : shortMonthDay(key).replace(/^\w+ /, '') });
  }
  return { buckets, bucketOf: (key) => key };
};

/** Collapses several entries on the same day into one value per day. */
export const groupByDay = (items: DayValue[]): DayValue[] => {
  const map = new Map<string, number>();
  for (const it of items) map.set(it.key, (map.get(it.key) || 0) + it.value);
  return [...map.entries()].map(([key, value]) => ({ key, value }));
};

/**
 * Aggregates per-day values into buckets.
 * `sum`: total in the bucket. `avg`: mean across days that have data (0 if none).
 */
export const aggregate = (
  days: DayValue[],
  range: TrendRange,
  today: string,
  mode: 'sum' | 'avg'
): { id: string; label: string; value: number }[] => {
  const { buckets, bucketOf } = makeBuckets(range, today);
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const d of groupByDay(days)) {
    const id = bucketOf(d.key);
    sums.set(id, (sums.get(id) || 0) + d.value);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return buckets.map((b) => {
    const s = sums.get(b.id) || 0;
    const c = counts.get(b.id) || 0;
    return { ...b, value: mode === 'sum' ? s : c > 0 ? s / c : 0 };
  });
};
