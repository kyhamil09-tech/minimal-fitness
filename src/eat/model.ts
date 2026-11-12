import { FoodEntry, MealType } from '../types/tracking';
import { addDays, lastNDayKeys, parseDateKey, startOfWeek, toDateKey } from '../lib/dates';
import { dayMicros, scaleMicros } from '../lib/micros';
import { EatStyle, MEALS, REMIND_TEXT, STARTERS } from './content';
import type { MealKey } from './state';

/**
 * The logic of the Eat app: totals and targets, the ring on the plate, the week's flexible budget, the line of encouragement, what to eat
 * to close a gap, editing a logged food, and the numbers for Insights. Plain arithmetic on the food log, so it is easy to test; the
 * screens only draw what this says. Nothing here judges: a day over its plan is reported as a fact, and the week is what balances.
 */

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ---------------------------------------------------------------------------------------------
// Totals and targets
// ---------------------------------------------------------------------------------------------

export interface DayTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  count: number;
}

export const dayTotals = (entries: FoodEntry[]): DayTotals =>
  entries.reduce<DayTotals>(
    (t, e) => ({
      calories: t.calories + e.calories,
      proteinG: t.proteinG + e.proteinG,
      carbsG: t.carbsG + e.carbsG,
      fatG: t.fatG + e.fatG,
      fiberG: t.fiberG + (e.fiberG ?? 0),
      sugarG: t.sugarG + (e.sugarG ?? 0),
      sodiumMg: t.sodiumMg + (e.sodiumMg ?? 0),
      count: t.count + 1,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0, count: 0 }
  );

export interface MacroTargets {
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

/** Grams of each macro for a calorie goal and a protein goal: what is left after protein is split by the style. */
export const macroTargets = (calories: number, proteinG: number, style: EatStyle): MacroTargets => {
  const cal = Math.max(0, calories);
  const protein = Math.max(0, proteinG);
  const rest = Math.max(0, cal - protein * 4);
  let carbsG = (rest * (1 - style.fatShare)) / 4;
  let fatG = (rest * style.fatShare) / 9;
  if (style.carbCapG !== undefined && carbsG > style.carbCapG) {
    carbsG = style.carbCapG;
    fatG = (rest - carbsG * 4) / 9;
  }
  return {
    proteinG: Math.round(protein),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
    fiberG: style.fiberG ?? Math.round((14 * cal) / 1000),
  };
};

/** Protein to suggest when a style is applied: its g per kg, else the current goal. */
export const proteinForStyle = (style: EatStyle, weightKg: number, current: number): number =>
  style.proteinPerKg && weightKg > 0 ? Math.round(style.proteinPerKg * weightKg) : current;

// ---------------------------------------------------------------------------------------------
// The plate: a ring that fills with the day's calories, in the colors of the macros
// ---------------------------------------------------------------------------------------------

export interface PlateSegment {
  key: 'p' | 'c' | 'f';
  /** Where it starts and ends along the ring, 0 to 1. */
  from: number;
  to: number;
}

export interface Plate {
  segments: PlateSegment[];
  /** How much of the ring is filled, 0 to 1. */
  fill: number;
  /** How far past the budget the day is, as a share of the budget, 0 to 1 (the second, thinner ring). */
  over: number;
}

export const plate = (t: Pick<DayTotals, 'calories' | 'proteinG' | 'carbsG' | 'fatG'>, budget: number): Plate => {
  if (!(budget > 0) || !(t.calories > 0)) return { segments: [], fill: 0, over: 0 };
  const ratio = t.calories / budget;
  const fill = clamp01(ratio);
  const over = clamp01(ratio - 1);
  const kcal = { p: t.proteinG * 4, c: t.carbsG * 4, f: t.fatG * 9 };
  const total = kcal.p + kcal.c + kcal.f;
  if (!(total > 0)) return { segments: [{ key: 'c', from: 0, to: fill }], fill, over };
  let at = 0;
  const segments = (['p', 'c', 'f'] as const).map((key) => {
    const to = at + (kcal[key] / total) * fill;
    const s: PlateSegment = { key, from: at, to };
    at = to;
    return s;
  });
  return { segments, fill, over };
};

// ---------------------------------------------------------------------------------------------
// The week as the budget: a day over is balanced by the days around it
// ---------------------------------------------------------------------------------------------

export interface WeekDay {
  date: string;
  calories: number;
  logged: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export interface WeekBudget {
  weekStart: string;
  days: WeekDay[];
  /** Seven days of the daily goal. */
  allowance: number;
  /** Eaten so far. Past days with nothing logged count as the goal, so a day not logged never creates calories to spend. */
  eaten: number;
  left: number;
  /** Days still to eat in, today included. */
  daysLeft: number;
  /** What each of those days can average to land the week on its allowance. */
  perDay: number;
}

export const weekBudget = (food: Pick<FoodEntry, 'date' | 'calories'>[], dailyGoal: number, today: string): WeekBudget => {
  const weekStart = toDateKey(startOfWeek(parseDateKey(today)));
  const byDate = new Map<string, number>();
  for (const f of food) byDate.set(f.date, (byDate.get(f.date) ?? 0) + f.calories);
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    return { date, calories: Math.round(byDate.get(date) ?? 0), logged: byDate.has(date), isToday: date === today, isFuture: date > today };
  });
  let eaten = 0;
  for (const d of days) {
    if (d.isFuture) continue;
    eaten += d.logged || d.isToday ? d.calories : dailyGoal;
  }
  const allowance = dailyGoal * 7;
  const left = allowance - eaten;
  const daysLeft = days.filter((d) => d.date >= today).length;
  return { weekStart, days, allowance, eaten: Math.round(eaten), left: Math.round(left), daysLeft, perDay: daysLeft > 0 ? Math.round(left / daysLeft) : 0 };
};

// ---------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------

export const greeting = (hour: number): string => (hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 22 ? 'Good evening' : 'Late night');

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export interface NoteInput {
  hour: number;
  date: string;
  eaten: number;
  goal: number;
  proteinG: number;
  proteinGoal: number;
  entries: number;
}

/** One line for the top of the day. Several wordings for each situation, picked by the date so it does not flicker. */
export const dayNote = (i: NoteInput): string => {
  const pick = (lines: string[]) => lines[hash(i.date) % lines.length];
  if (i.entries === 0) {
    if (i.hour < 11) return pick(['A fresh plate. Start with something you love.', 'Morning. The table is set and nothing is owed.', 'Breakfast is a fine place to begin.']);
    if (i.hour < 16) return pick(['Nothing logged yet. A quick scan or a tap on your usuals gets you going.', 'Lunch is a good moment to log. It takes ten seconds.']);
    return pick(['Nothing logged yet today. Add what you remember; the rest can be a rough guess.', 'A blank day is fine. Log what you can, honestly, and move on.']);
  }
  const ratio = i.goal > 0 ? i.eaten / i.goal : 0;
  if (ratio > 1.1) return pick(['A little past your plan, and that is allowed. The week still balances.', 'Fuller than planned. Fearless eaters do not flinch: tomorrow is a fresh plate.', 'Over by a bit. Enjoy it; your week has room.']);
  if (ratio >= 0.9) return pick(['Right on the mark. Elegant.', 'You landed the day well. Good eating.', 'That is a well-composed day.']);
  const proteinShort = i.proteinGoal > 0 && i.proteinG < i.proteinGoal * 0.7;
  if (i.hour >= 17 && proteinShort) return pick([`Protein is ${Math.round(i.proteinGoal - i.proteinG)} g shy. A good dinner could close it.`, 'Plenty of room left, and protein is the thing to find. See ideas below.']);
  if (ratio < 0.4 && i.hour >= 15) return pick(['Eating well matters as much as eating less. Do not skip dinner on principle.', 'A light day so far. Make the next meal a proper one.']);
  return pick(['Steady. Keep going at your own pace.', 'A good start. The rest of the day has room.', 'Nicely paced so far.']);
};

// ---------------------------------------------------------------------------------------------
// Closing a gap: foods from your own log, then typical ones
// ---------------------------------------------------------------------------------------------

export interface Gap {
  kcal: number;
  proteinG: number;
  fiberG: number;
}

export type NewFoodEntry = Omit<FoodEntry, 'id' | 'date'>;

export interface Idea {
  entry: NewFoodEntry;
  /** Why it was picked: "+24 g protein". */
  why: string;
  /** True for a typical value, false for something you have logged before. */
  typical: boolean;
}

const whyOf = (e: NewFoodEntry, gap: Gap): string => {
  const parts: string[] = [];
  if (gap.proteinG > 5 && e.proteinG >= 8) parts.push(`${Math.round(e.proteinG)} g protein`);
  if (gap.fiberG > 3 && (e.fiberG ?? 0) >= 3) parts.push(`${Math.round(e.fiberG ?? 0)} g fiber`);
  return parts.length > 0 ? parts.join(', ') : `${Math.round(e.proteinG)} g protein`;
};

/**
 * Up to `max` foods that fit what is left of the day and help with what is short (protein, fiber). Foods you have logged in the last
 * 60 days come first, the ones you eat often scoring a little higher; typical foods fill the rest. Foods already logged today are skipped.
 */
export const fillIdeas = (food: FoodEntry[], today: string, gap: Gap, max = 4, fits: (e: { name: string; group?: number }) => boolean = () => true): Idea[] => {
  if (gap.kcal < 90) return [];
  const needP = clamp01(gap.proteinG / 30);
  const needF = clamp01(gap.fiberG / 10);
  if (needP === 0 && needF === 0) return [];
  const since = addDays(today, -60);
  const eatenToday = new Set(food.filter((f) => f.date === today).map((f) => f.name.toLowerCase()));
  const ceiling = Math.max(gap.kcal * 1.05, 120);
  const groups = new Map<string, { latest: FoodEntry; count: number }>();
  for (const f of food) {
    if (f.date < since || f.date >= today || f.calories < 40) continue;
    const g = groups.get(f.name.toLowerCase());
    if (!g) groups.set(f.name.toLowerCase(), { latest: f, count: 1 });
    else {
      g.count++;
      if (f.date >= g.latest.date) g.latest = f;
    }
  }
  const score = (e: NewFoodEntry, count: number) => needP * e.proteinG + needF * (e.fiberG ?? 0) * 2 + Math.log2(1 + count);
  const useful = (e: NewFoodEntry) => (needP > 0 && e.proteinG >= 8) || (needF > 0 && (e.fiberG ?? 0) >= 3);
  const own: Idea[] = [...groups.values()]
    .map((g) => {
      const { id: _id, date: _date, ...entry } = g.latest;
      return { entry: entry as NewFoodEntry, count: g.count };
    })
    .filter((x) => x.entry.calories <= ceiling && useful(x.entry) && !eatenToday.has(x.entry.name.toLowerCase()) && fits(x.entry))
    .sort((a, b) => score(b.entry, b.count) - score(a.entry, a.count))
    .map((x) => ({ entry: x.entry, why: whyOf(x.entry, gap), typical: false }));
  const out = own.slice(0, max);
  if (out.length < max) {
    const have = new Set(out.map((o) => o.entry.name.toLowerCase()));
    const typical: Idea[] = STARTERS.map((s) => ({
      entry: { meal: 'Snack' as MealType, name: s.name, calories: s.calories, proteinG: s.proteinG, carbsG: s.carbsG, fatG: s.fatG, fiberG: s.fiberG, amount: s.amount, group: s.group },
      why: '',
      typical: true,
    }))
      .filter((x) => x.entry.calories <= ceiling && useful(x.entry) && !have.has(x.entry.name.toLowerCase()) && !eatenToday.has(x.entry.name.toLowerCase()) && fits(x.entry))
      .sort((a, b) => score(b.entry, 0) - score(a.entry, 0))
      .map((x) => ({ ...x, why: whyOf(x.entry, gap) }));
    out.push(...typical.slice(0, max - out.length));
  }
  return out;
};

// ---------------------------------------------------------------------------------------------
// Changing a logged food
// ---------------------------------------------------------------------------------------------

const fmt = (n: number) => String(Math.round(n * 100) / 100);

const parseLeading = (s: string): { value: number; rest: string } | null => {
  const m = /^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?\s*(.*)$/.exec(s) ?? null;
  if (m && m[2]) return { value: Number(m[1]) + Number(m[2]) / Number(m[3]), rest: m[4] };
  const fr = /^(\d+)\/(\d+)\s*(.*)$/.exec(s);
  if (fr) return { value: Number(fr[1]) / Number(fr[2]), rest: fr[3] };
  return m ? { value: Number(m[1]), rest: m[4] } : null;
};

/** "1 cup (244 g)" times 1.5 is "1.5 cup (366 g)". Text with no number up front becomes "1.5 x text". */
export const scaleAmountText = (amount: string | undefined, k: number): string | undefined => {
  if (!amount) return amount;
  const lead = parseLeading(amount.trim());
  const scaled = (rest: string) => rest.replace(/\((\d+(?:\.\d+)?)\s?(g|ml|oz|fl oz)\)/g, (_m, n: string, u: string) => `(${Math.round(Number(n) * k * 10) / 10} ${u})`);
  if (lead) return `${fmt(lead.value * k)}${lead.rest ? ' ' : ''}${scaled(lead.rest)}`.trim();
  return `${fmt(k)} x ${scaled(amount)}`;
};

/** The fields of a logged food that change when you eat a different amount of it. */
export const scaleEntry = (e: FoodEntry, k: number): Partial<FoodEntry> => ({
  calories: Math.round(e.calories * k),
  proteinG: r1(e.proteinG * k),
  carbsG: r1(e.carbsG * k),
  fatG: r1(e.fatG * k),
  fiberG: e.fiberG !== undefined ? r1(e.fiberG * k) : undefined,
  sugarG: e.sugarG !== undefined ? r1(e.sugarG * k) : undefined,
  sodiumMg: e.sodiumMg !== undefined ? Math.round(e.sodiumMg * k) : undefined,
  micros: scaleMicros(e.micros, k),
  amount: scaleAmountText(e.amount, k),
});

// ---------------------------------------------------------------------------------------------
// When you ate: the time is kept in the entry's id (f-<epoch ms>-xxxx), trusted only if it is on the entry's own day
// ---------------------------------------------------------------------------------------------

export const entryTime = (e: Pick<FoodEntry, 'id' | 'date'>): number | null => {
  const m = /^f-(\d{12,14})-/.exec(e.id);
  if (!m) return null;
  const ms = Number(m[1]);
  return toDateKey(ms) === e.date ? ms : null;
};

export interface EatingWindow {
  first: number;
  last: number;
  hours: number;
}

/** First and last logged bite of a day, when at least two foods were logged on the day itself. */
export const eatingWindow = (entries: FoodEntry[]): EatingWindow | null => {
  const times = entries.map(entryTime).filter((t): t is number => t !== null).sort((a, b) => a - b);
  if (times.length < 2) return null;
  return { first: times[0], last: times[times.length - 1], hours: Math.round(((times[times.length - 1] - times[0]) / 3_600_000) * 10) / 10 };
};

// ---------------------------------------------------------------------------------------------
// Streaks and patterns
// ---------------------------------------------------------------------------------------------

/** Days in a row with something logged, counting back from today (or from yesterday while today is still empty). */
export const loggingStreak = (food: Pick<FoodEntry, 'date'>[], today: string): number => {
  const days = new Set(food.map((f) => f.date));
  let day = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
};

export interface WeekdayAvg {
  /** 0 = Monday ... 6 = Sunday. */
  weekday: number;
  avg: number;
  days: number;
}

/** Average calories on each weekday over the last `range` days, logged days only. */
export const weekdayAverages = (food: Pick<FoodEntry, 'date' | 'calories'>[], today: string, range = 56): WeekdayAvg[] => {
  const keys = new Set(lastNDayKeys(range, today));
  const perDay = new Map<string, number>();
  for (const f of food) if (keys.has(f.date)) perDay.set(f.date, (perDay.get(f.date) ?? 0) + f.calories);
  const sums = Array.from({ length: 7 }, () => ({ total: 0, days: 0 }));
  for (const [date, cal] of perDay) {
    if (cal < 300) continue;
    const wd = (parseDateKey(date).getDay() + 6) % 7;
    sums[wd].total += cal;
    sums[wd].days++;
  }
  return sums.map((s, weekday) => ({ weekday, avg: s.days > 0 ? Math.round(s.total / s.days) : 0, days: s.days }));
};

/** Weekend (Sat, Sun) against weekday averages, or null if either has fewer than 3 days. */
export const weekendGap = (avgs: WeekdayAvg[]): { weekday: number; weekend: number; diff: number } | null => {
  const wk = avgs.slice(0, 5);
  const we = avgs.slice(5);
  const wkDays = wk.reduce((s, a) => s + a.days, 0);
  const weDays = we.reduce((s, a) => s + a.days, 0);
  if (wkDays < 3 || weDays < 3) return null;
  const weekday = Math.round(wk.reduce((s, a) => s + a.avg * a.days, 0) / wkDays);
  const weekend = Math.round(we.reduce((s, a) => s + a.avg * a.days, 0) / weDays);
  return { weekday, weekend, diff: weekend - weekday };
};

export interface MealShare {
  meal: MealType;
  kcal: number;
  pct: number;
}

/** Where the calories of the last `range` days come from, by meal, in whole percent. */
export const mealShares = (food: FoodEntry[], today: string, range = 14): MealShare[] => {
  const keys = new Set(lastNDayKeys(range, today));
  const kcal: Record<string, number> = { Breakfast: 0, Lunch: 0, Dinner: 0, Snack: 0 };
  for (const f of food) if (keys.has(f.date)) kcal[f.meal] = (kcal[f.meal] ?? 0) + f.calories;
  const total = MEALS.reduce((s, m) => s + kcal[m], 0);
  return MEALS.map((meal) => ({ meal, kcal: Math.round(kcal[meal]), pct: total > 0 ? Math.round((kcal[meal] / total) * 100) : 0 }));
};

export interface TopFood {
  name: string;
  count: number;
  avgKcal: number;
}

export const topFoods = (food: FoodEntry[], today: string, range = 30, n = 6): TopFood[] => {
  const keys = new Set(lastNDayKeys(range, today));
  const m = new Map<string, { name: string; count: number; kcal: number }>();
  for (const f of food) {
    if (!keys.has(f.date)) continue;
    const k = f.name.toLowerCase();
    const g = m.get(k) ?? { name: f.name, count: 0, kcal: 0 };
    g.count++;
    g.kcal += f.calories;
    m.set(k, g);
  }
  return [...m.values()]
    .sort((a, b) => b.count - a.count || b.kcal - a.kcal)
    .slice(0, n)
    .map((g) => ({ name: g.name, count: g.count, avgKcal: Math.round(g.kcal / g.count) }));
};

export interface DayNotes {
  note?: string;
  feel?: string[];
}

export const feelingCounts = (notes: Record<string, DayNotes>, today: string, range = 30): { id: string; n: number }[] => {
  const keys = new Set(lastNDayKeys(range, today));
  const m = new Map<string, number>();
  for (const [date, v] of Object.entries(notes)) {
    if (!keys.has(date)) continue;
    for (const f of v.feel ?? []) m.set(f, (m.get(f) ?? 0) + 1);
  }
  return [...m.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n);
};

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

const csv = (v: string | number | undefined): string => {
  const s = v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const foodToCsv = (food: FoodEntry[]): string => {
  const head = ['date', 'meal', 'food', 'amount', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg'];
  const rows = [...food]
    .sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1))
    .map((f) => [f.date, f.meal, f.name, f.amount, Math.round(f.calories), r1(f.proteinG), r1(f.carbsG), r1(f.fatG), f.fiberG, f.sugarG, f.sodiumMg].map(csv).join(','));
  return [head.join(','), ...rows].join('\n');
};

// ---------------------------------------------------------------------------------------------
// Longer views
// ---------------------------------------------------------------------------------------------

export interface WindowAverage {
  days: number;
  /** Minutes after midnight. */
  firstMin: number;
  lastMin: number;
}

/** The typical first and last bite over the last `range` days, from days that have a window (see eatingWindow). Needs 3 such days. */
export const windowAverage = (food: FoodEntry[], today: string, range = 14): WindowAverage | null => {
  const keys = lastNDayKeys(range, today);
  const byDate = new Map<string, FoodEntry[]>();
  for (const f of food) {
    if (!keys.includes(f.date)) continue;
    byDate.set(f.date, [...(byDate.get(f.date) ?? []), f]);
  }
  const mins = (ms: number) => {
    const d = new Date(ms);
    return d.getHours() * 60 + d.getMinutes();
  };
  const wins = [...byDate.values()].map(eatingWindow).filter((w): w is EatingWindow => w !== null);
  if (wins.length < 3) return null;
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return { days: wins.length, firstMin: avg(wins.map((w) => mins(w.first))), lastMin: avg(wins.map((w) => mins(w.last))) };
};

export interface MicroAverage {
  id: string;
  label: string;
  /** Average share of the daily value on the days whose foods listed any vitamins or minerals. */
  pct: number;
}

/** Vitamins and minerals over the last `range` days, lowest first. Only days with at least one food that lists them count. */
export const microAverages = (food: FoodEntry[], today: string, range = 14): { days: number; rows: MicroAverage[] } => {
  const keys = new Set(lastNDayKeys(range, today));
  const byDate = new Map<string, FoodEntry[]>();
  for (const f of food) if (keys.has(f.date)) byDate.set(f.date, [...(byDate.get(f.date) ?? []), f]);
  const sums = new Map<string, { label: string; pct: number }>();
  let days = 0;
  for (const entries of byDate.values()) {
    const { rows, known } = dayMicros(entries);
    if (known === 0) continue;
    days++;
    for (const r of rows) {
      const s = sums.get(r.def.id) ?? { label: r.def.label, pct: 0 };
      s.pct += r.pct;
      sums.set(r.def.id, s);
    }
  }
  if (days === 0) return { days: 0, rows: [] };
  const rows = [...sums.entries()].map(([id, s]) => ({ id, label: s.label, pct: Math.round(s.pct / days) })).sort((a, b) => a.pct - b.pct);
  return { days, rows };
};

// ---------------------------------------------------------------------------------------------
// Reminders: when to nudge, and what to say
// ---------------------------------------------------------------------------------------------

export interface ReminderSlot {
  /** Notification id offset: 0 breakfast, 1 lunch, 2 dinner, 3 review. */
  slot: number;
  hour: number;
  minute: number;
  title: string;
  body: string;
}

export const reminderSlots = (r: { on: boolean; which: Record<MealKey, boolean>; times: Record<MealKey, string> }): ReminderSlot[] => {
  if (!r.on) return [];
  const keys: MealKey[] = ['breakfast', 'lunch', 'dinner', 'review'];
  const out: ReminderSlot[] = [];
  keys.forEach((k, slot) => {
    if (!r.which[k]) return;
    const m = /^(\d{1,2}):(\d{2})$/.exec(r.times[k] ?? '');
    if (!m) return;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour > 23 || minute > 59) return;
    out.push({ slot, hour, minute, title: REMIND_TEXT[k].title, body: REMIND_TEXT[k].body });
  });
  return out;
};

// ---------------------------------------------------------------------------------------------
// A suggested share of the day for each meal, and the calm view's words
// ---------------------------------------------------------------------------------------------

/** How a day's calories are usually spread: a guide in the meal headers, not a rule. */
export const MEAL_SPLIT: Record<MealType, number> = { Breakfast: 0.25, Lunch: 0.33, Dinner: 0.32, Snack: 0.1 };

export const mealBudget = (dailyGoal: number, meal: MealType): number => Math.round((Math.max(0, dailyGoal) * MEAL_SPLIT[meal]) / 10) * 10;

export const SODIUM_LIMIT_MG = 2300;

/** What the plate says in place of numbers when the calm view is on. */
export const calmWord = (eaten: number, budget: number): string => {
  const r = budget > 0 ? eaten / budget : 0;
  return r < 0.08 ? 'A fresh plate' : r < 0.85 ? 'Room to enjoy' : r <= 1.05 ? 'Nicely full' : 'Past the plan, and that is okay';
};

// ---------------------------------------------------------------------------------------------
// Rest days and training days
// ---------------------------------------------------------------------------------------------

export interface DaySplit {
  on: boolean;
  /** Calories on a rest day and on a training day. */
  restKcal: number;
  trainKcal: number;
}

/** Sensible starting numbers for the two targets, from the single one. */
export const splitDefaults = (goal: number): DaySplit => ({ on: true, restKcal: Math.max(800, Math.round((goal - 100) / 10) * 10), trainKcal: Math.round((goal + 250) / 10) * 10 });

/** A training day is one with a workout of at least 15 minutes logged, or (today only) a planned strength or cardio session. */
export const isTrainingDay = (workouts: { timestamp: string; startedAt?: number; durationMinutes: number }[], date: string, today: string, plannedToday: boolean): boolean => {
  const done = workouts.some((w) => w.durationMinutes >= 15 && toDateKey(w.startedAt ?? Date.parse(w.timestamp)) === date);
  return done || (date === today && plannedToday);
};

/** The calorie goal for a day: the single goal, or the rest-day or training-day one when the split is on. */
export const dayGoal = (baseGoal: number, split: DaySplit | undefined, training: boolean): number => {
  if (!split?.on) return baseGoal;
  const v = training ? split.trainKcal : split.restKcal;
  return v >= 800 ? v : baseGoal;
};

// ---------------------------------------------------------------------------------------------
// Fasting and eating, side by side
// ---------------------------------------------------------------------------------------------

/** A logged food that is more than a sip: it is what "breaks" a fast. Water, black coffee and tea are far below this. */
export const BREAKS_FAST_KCAL = 50;
export const breaksFast = (e: { calories: number }): boolean => e.calories >= BREAKS_FAST_KCAL;

/** When the latest food was logged within the last `hours`, from the time kept in each entry's id. Null when none is recent. */
export const lastMealTime = (food: FoodEntry[], now: number, hours = 18): number | null => {
  let best: number | null = null;
  for (const f of food) {
    const t = entryTime(f);
    if (t === null || t > now || now - t > hours * 3_600_000) continue;
    if (best === null || t > best) best = t;
  }
  return best;
};

// ---------------------------------------------------------------------------------------------
// What the widget, the Quick Settings tile and the watch show
// ---------------------------------------------------------------------------------------------

export interface EatSummary {
  eaten: number;
  /** Today's calories to eat, with activity added back when that is on. */
  goal: number;
  left: number;
  proteinG: number;
  proteinGoal: number;
  /** When the latest food of today was logged (epoch ms), or 0 when it cannot be told. */
  lastFoodMs: number;
}

export const eatSummary = (a: {
  food: FoodEntry[];
  today: string;
  goalKcal: number;
  proteinGoal: number;
  split?: DaySplit;
  training: boolean;
  burnedKcal: number;
  activity: boolean;
  /** A 5:2 low-calorie day: its calories replace the goal, and activity is not added back. */
  lowKcal?: number | null;
}): EatSummary => {
  const todays = a.food.filter((f) => f.date === a.today);
  const t = dayTotals(todays);
  const goal = a.lowKcal ? a.lowKcal : dayGoal(a.goalKcal, a.split, a.training) + (a.activity ? Math.max(0, Math.round(a.burnedKcal)) : 0);
  const last = todays.map(entryTime).filter((x): x is number => x !== null).sort((x, y) => y - x)[0] ?? 0;
  return { eaten: Math.round(t.calories), goal: Math.round(goal), left: Math.round(goal - t.calories), proteinG: Math.round(t.proteinG), proteinGoal: Math.round(a.proteinGoal), lastFoodMs: last };
};
