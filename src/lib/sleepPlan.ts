import { SleepLogEntry } from '../types/health';
import { addDays } from './dates';
import { lastNights } from './sleepMetrics';

/**
 * The sleep goal, how far behind it you are this week (sleep debt), and the wind-down that starts a few minutes of Breathe before bed.
 * Rough guides, not medical advice: how much sleep a person needs differs, and one short night is not a debt that has to be repaid.
 */

export interface SleepPrefs {
  /** Minutes of sleep to aim for each night. */
  goalMin: number;
  windDown: {
    on: boolean;
    /** The bedtime to wind down toward, "HH:MM". */
    bed: string;
    /** How many minutes before bed the nudge comes. */
    lead: number;
  };
}

export const DEFAULT_SLEEP_PREFS: SleepPrefs = { goalMin: 480, windDown: { on: false, bed: '22:30', lead: 30 } };
export const GOAL_RANGE = { min: 300, max: 720, step: 15 };

/** The stored value made whole: missing or silly parts fall back to the defaults. */
export const normalizeSleepPrefs = (raw: Partial<SleepPrefs> | null | undefined): SleepPrefs => {
  const goal = Number(raw?.goalMin);
  const w = raw?.windDown;
  const bed = typeof w?.bed === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(w.bed) ? w.bed : DEFAULT_SLEEP_PREFS.windDown.bed;
  const lead = Number(w?.lead);
  return {
    goalMin: Number.isFinite(goal) && goal >= GOAL_RANGE.min && goal <= GOAL_RANGE.max ? Math.round(goal / GOAL_RANGE.step) * GOAL_RANGE.step : DEFAULT_SLEEP_PREFS.goalMin,
    windDown: { on: w?.on === true, bed, lead: [15, 30, 45, 60].includes(lead) ? lead : DEFAULT_SLEEP_PREFS.windDown.lead },
  };
};

export interface SleepDebt {
  /** Nights in the last `nights` days that have a log. */
  logged: number;
  /** Minutes short of the goal, added up over the logged nights that fell short. */
  debtMin: number;
  /** Minutes beyond the goal on the nights that went over. */
  surplusMin: number;
  /** Logged nights that fell short by 30 minutes or more. */
  shortNights: number;
  avgMin: number;
  /** Per night, oldest first, for a small chart. */
  nights: { date: string; minutes: number; goalMin: number }[];
}

/** Sleep debt over the last `days` days up to `today`: only nights that were logged count, so a night you did not track is not a debt. */
export const sleepDebt = (logs: SleepLogEntry[], goalMin: number, today: string, days = 7): SleepDebt => {
  const since = addDays(today, -(days - 1));
  const nights = lastNights(logs, 400).filter((l) => l.dateIso >= since && l.dateIso <= today && l.durationMinutes > 0);
  let debt = 0;
  let surplus = 0;
  let short = 0;
  for (const n of nights) {
    const diff = goalMin - n.durationMinutes;
    if (diff > 0) debt += diff;
    else surplus += -diff;
    if (diff >= 30) short++;
  }
  const total = nights.reduce((s, n) => s + n.durationMinutes, 0);
  return {
    logged: nights.length,
    debtMin: Math.round(debt),
    surplusMin: Math.round(surplus),
    shortNights: short,
    avgMin: nights.length ? Math.round(total / nights.length) : 0,
    nights: nights.map((n) => ({ date: n.dateIso, minutes: n.durationMinutes, goalMin })),
  };
};

/** A gentle way to win some back: spread over the next three nights, about half of the debt, never more than an hour a night. */
export const repayPerNight = (debtMin: number): number => Math.min(60, Math.round(debtMin / 2 / 3 / 5) * 5);

/** The bedtime you usually keep, from the last `n` nights with a bedtime ("HH:MM"), or null with fewer than three. */
export const typicalBedtime = (logs: SleepLogEntry[], n = 14): string | null => {
  const beds = lastNights(logs, n)
    .map((l) => l.bedtime)
    .filter((b) => /^\d{1,2}:\d{2}$/.test(b))
    .map((b) => {
      const [h, m] = b.split(':').map(Number);
      return (h * 60 + m - 18 * 60 + 1440) % 1440; // minutes after 18:00, so 23:30 and 00:30 average sensibly
    });
  if (beds.length < 3) return null;
  const avg = Math.round(beds.reduce((a, b) => a + b, 0) / beds.length);
  const t = (avg + 18 * 60) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** When the wind-down nudge goes off: `lead` minutes before `bed`, as an hour and minute. */
export const windDownAt = (bed: string, lead: number): { hour: number; minute: number } => {
  const [h, m] = bed.split(':').map(Number);
  const t = (((h * 60 + m - lead) % 1440) + 1440) % 1440;
  return { hour: Math.floor(t / 60), minute: t % 60 };
};

export const hoursMin = (min: number): string => {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
