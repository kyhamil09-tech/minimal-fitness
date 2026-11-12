import { SleepLogEntry } from '../types/health';
import { addDays, toDateKey } from './dates';

/** One caffeinated or alcoholic drink, logged by hand. Kept on the phone only. */
export interface DrinkEntry {
  id: string;
  /** Epoch ms. */
  at: number;
  kind: 'caffeine' | 'alcohol';
  label: string;
  /** Caffeine in mg, or alcohol in standard drinks. */
  amount: number;
}

/** Usual amounts for one serving. Caffeine varies a lot by brand and size, so these are round typical figures. */
export const DRINK_PRESETS: { kind: DrinkEntry['kind']; label: string; amount: number }[] = [
  { kind: 'caffeine', label: 'Coffee', amount: 95 },
  { kind: 'caffeine', label: 'Espresso', amount: 64 },
  { kind: 'caffeine', label: 'Tea', amount: 47 },
  { kind: 'caffeine', label: 'Energy drink', amount: 80 },
  { kind: 'caffeine', label: 'Cola', amount: 34 },
  { kind: 'alcohol', label: 'Beer', amount: 1 },
  { kind: 'alcohol', label: 'Wine', amount: 1 },
  { kind: 'alcohol', label: 'Spirit', amount: 1 },
];

/** A common adult ceiling for caffeine in a day (Health Canada, EFSA and the FDA agree on about this). */
export const CAFFEINE_DAILY_MG = 400;
/** Caffeine taken after this hour is the kind that tends to cost sleep. */
export const LATE_HOUR = 15;

export interface DayTotals {
  caffeineMg: number;
  lateCaffeineMg: number;
  alcoholDrinks: number;
}

export const dayTotals = (entries: DrinkEntry[], key: string): DayTotals => {
  const out: DayTotals = { caffeineMg: 0, lateCaffeineMg: 0, alcoholDrinks: 0 };
  for (const e of entries) {
    if (toDateKey(e.at) !== key) continue;
    if (e.kind === 'caffeine') {
      out.caffeineMg += e.amount;
      if (new Date(e.at).getHours() >= LATE_HOUR) out.lateCaffeineMg += e.amount;
    } else {
      out.alcoholDrinks += e.amount;
    }
  }
  return out;
};

export interface NightEffect {
  id: 'alcohol' | 'caffeine';
  label: string;
  nWith: number;
  nWithout: number;
  withMin: number;
  withoutMin: number;
  /** Minutes of sleep with it minus without it (negative: less sleep). */
  diffMin: number;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
/** At least this many nights on each side before a comparison is shown. */
export const MIN_NIGHTS = 3;

/**
 * Sleep on the nights after an evening with alcohol, or with late caffeine, against the other nights. A plain comparison of averages from
 * your own log, not a cause: it only appears once there are enough nights on both sides.
 */
export const nightEffects = (entries: DrinkEntry[], sleep: SleepLogEntry[]): NightEffect[] => {
  const byNight = new Map<string, number>();
  for (const l of sleep) if (l.durationMinutes >= 120) byNight.set(l.dateIso, Math.max(byNight.get(l.dateIso) ?? 0, l.durationMinutes));
  const tests: { id: NightEffect['id']; label: string; flag: (t: DayTotals) => boolean }[] = [
    { id: 'alcohol', label: 'After an evening with alcohol', flag: (t) => t.alcoholDrinks > 0 },
    { id: 'caffeine', label: `After caffeine past ${LATE_HOUR}:00`, flag: (t) => t.lateCaffeineMg >= 50 },
  ];
  const out: NightEffect[] = [];
  for (const test of tests) {
    const withIt: number[] = [];
    const without: number[] = [];
    for (const [night, minutes] of byNight) (test.flag(dayTotals(entries, addDays(night, -1))) ? withIt : without).push(minutes);
    if (withIt.length >= MIN_NIGHTS && without.length >= MIN_NIGHTS) {
      const a = mean(withIt);
      const b = mean(without);
      out.push({ id: test.id, label: test.label, nWith: withIt.length, nWithout: without.length, withMin: Math.round(a), withoutMin: Math.round(b), diffMin: Math.round(a - b) });
    }
  }
  return out;
};
