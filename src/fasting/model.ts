import { FastingSession, SleepLogEntry, WorkoutSession } from '../types/health';
import { BodyEntry, UnitSystem } from '../types/tracking';
import { displayToMl, mlToDisplay, volumeUnit } from '../lib/units';
import { addDays, parseDateKey, startOfWeek, toDateKey } from '../lib/dates';
import { MAX_FAST_HOURS, PROTOCOLS, STAGES, protocolById } from './content';

/**
 * The logic of the Fasting app: what is logged during a fast (water, salts, ketones, hunger waves), the plan and the eating window, the
 * reminders, the calendar, editing a fast, the numbers for Insights and the experimental Lab. All plain arithmetic on the saved fasts, so it
 * is easy to test; the screens only draw what this says. The fasts themselves stay in the same list the widgets and the watch read.
 */

const H = 3_600_000;
const MIN = 60_000;

// ---------------------------------------------------------------------------------------------
// What is logged during a fast
// ---------------------------------------------------------------------------------------------

export interface FastExtra {
  water: { at: number; ml: number }[];
  salts: { at: number; label: string }[];
  ketones: { at: number; mmol: number }[];
  glucose: { at: number; mgdl: number }[];
  waves: { at: number; rode: boolean }[];
  note?: string;
  /** The fast was ended because of feeling unwell: it is kept but not counted against you. */
  unwell?: boolean;
}

export type FastExtras = Record<string, FastExtra>;

export const emptyExtra = (): FastExtra => ({ water: [], salts: [], ketones: [], glucose: [], waves: [] });

export const withExtra = (all: FastExtras, id: string, change: (e: FastExtra) => FastExtra): FastExtras => ({ ...all, [id]: change({ ...emptyExtra(), ...(all[id] ?? {}) }) });

export const waterTotalMl = (e: FastExtra | undefined): number => (e?.water ?? []).reduce((s, w) => s + w.ml, 0);

/** Takes one logged glass out of a fast's record (by its place in the list). Nothing else changes. */
export const removeWater = (all: FastExtras, id: string, index: number): FastExtras =>
  all[id] ? withExtra(all, id, (e) => ({ ...e, water: e.water.filter((_, i) => i !== index) })) : all;

/** Takes one logged salt or electrolyte out of a fast's record. */
export const removeSalt = (all: FastExtras, id: string, index: number): FastExtras =>
  all[id] ? withExtra(all, id, (e) => ({ ...e, salts: e.salts.filter((_, i) => i !== index) })) : all;

// ---- Units: everything is stored in ml, kg and mg/dL; these only change what is shown and typed.

/** "250 ml" or "8 fl oz". */
export const waterText = (ml: number, u: UnitSystem): string => `${mlToDisplay(ml, u)} ${volumeUnit(u)}`;

/** The three quick amounts: 250 / 500 / 750 ml, or 8 / 16 / 24 fl oz. */
export const waterAmounts = (u: UnitSystem): { ml: number; label: string }[] =>
  (u === 'imperial' ? [8, 16, 24] : [250, 500, 750]).map((v) => ({ ml: displayToMl(v, u), label: `${v} ${volumeUnit(u)}` }));

/** Glucose is kept as mg/dL; metric shows mmol/L, as most of the world's meters do. */
export const glucoseUnit = (u: UnitSystem): string => (u === 'imperial' ? 'mg/dL' : 'mmol/L');
export const glucoseToDisplay = (mgdl: number, u: UnitSystem): number => (u === 'imperial' ? Math.round(mgdl) : Math.round((mgdl / 18.0182) * 10) / 10);
export const glucoseFromDisplay = (v: number, u: UnitSystem): number => (u === 'imperial' ? v : v * 18.0182);

export const hungerStats = (all: FastExtras): { total: number; rode: number } => {
  let total = 0;
  let rode = 0;
  for (const e of Object.values(all)) for (const w of e.waves ?? []) {
    total++;
    if (w.rode) rode++;
  }
  return { total, rode };
};

// ---------------------------------------------------------------------------------------------
// The plan and the eating window
// ---------------------------------------------------------------------------------------------

export interface FastPlan {
  /** The everyday protocol (an id from PROTOCOLS), or 'custom'. */
  protocolId: string;
  customHours: number;
  /** When the eating window opens each day, HH:MM. */
  eatStart: string;
  /** Monday first: a protocol id for each day, or null for a day off. Null for every day means the everyday protocol is used. */
  weekly: (string | null)[] | null;
  remindStart: boolean;
  remindClose: boolean;
  /** How long before the window closes to say so. */
  closeMinutes: number;
  /** 5:2 style: two low-calorie days a week (about 500 calories), normal eating the other five. Independent of the timed fasts. */
  fiveTwo?: FiveTwo;
}

export interface FiveTwo {
  on: boolean;
  /** The two weekdays, Monday = 0. */
  days: number[];
  /** Calories on those days. */
  kcal: number;
}

export const DEFAULT_PLAN: FastPlan = { protocolId: '16-8', customHours: 16, eatStart: '12:00', weekly: null, remindStart: false, remindClose: false, closeMinutes: 30 };

export const clampHours = (h: number): number => Math.min(MAX_FAST_HOURS, Math.max(8, Math.round(h * 2) / 2));

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return { hour: Number.isFinite(h) ? h : 12, minute: Number.isFinite(m) ? m : 0 };
};

export const hoursOfPlanDay = (plan: FastPlan, weekdayIdx: number): number | null => {
  const id = plan.weekly ? plan.weekly[weekdayIdx] : plan.protocolId;
  if (id === null || id === undefined) return null;
  if (id === 'custom') return clampHours(plan.customHours);
  return protocolById(id)?.fastHours ?? clampHours(plan.customHours);
};

const dayStart = (d: Date, hhmm: string): number => {
  const { hour, minute } = clock(hhmm);
  const x = new Date(d);
  x.setHours(hour, minute, 0, 0);
  return x.getTime();
};

/** Monday = 0. */
const weekdayOf = (ms: number) => (new Date(ms).getDay() + 6) % 7;

export interface EatingState {
  state: 'eating' | 'fasting' | 'off';
  /** When the eating window opens or closes next (for 'eating': it closes; for 'fasting': it opens). */
  nextAt: number | null;
  windowStart: number | null;
  windowEnd: number | null;
  eatHours: number;
}

/**
 * Where the day is in the plan: eating, fasting, or a day off. The window opens at the chosen time and lasts 24 hours minus the day's fast.
 * Fasts of a day or more have no window of their own: they are a fast that starts when the window of the day closes.
 */
export const eatingState = (plan: FastPlan, now: number): EatingState => {
  const d = new Date(now);
  const idx = weekdayOf(now);
  const hours = hoursOfPlanDay(plan, idx);
  if (hours === null) return { state: 'off', nextAt: null, windowStart: null, windowEnd: null, eatHours: 24 };
  const eatHours = Math.max(0, 24 - hours);
  const open = dayStart(d, plan.eatStart);
  const close = open + eatHours * H;
  if (eatHours > 0 && now >= open && now < close) return { state: 'eating', nextAt: close, windowStart: open, windowEnd: close, eatHours };
  if (now < open) return { state: 'fasting', nextAt: open, windowStart: open, windowEnd: close, eatHours };
  // After the window closed: the next one opens tomorrow, if tomorrow is not a day off.
  const tomorrow = new Date(d);
  tomorrow.setDate(d.getDate() + 1);
  const tHours = hoursOfPlanDay(plan, weekdayOf(tomorrow.getTime()));
  const tOpen = dayStart(tomorrow, plan.eatStart);
  return { state: 'fasting', nextAt: tHours === null ? null : tOpen, windowStart: open, windowEnd: close, eatHours };
};

export interface FastNotice {
  at: Date;
  title: string;
  body: string;
}

/** Reminders for the next week: a note when the window is about to close, and one when it is time to start the fast. */
export const planFastReminders = (now: number, plan: FastPlan, active: boolean): FastNotice[] => {
  if (!plan.remindStart && !plan.remindClose) return [];
  const out: FastNotice[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const hours = hoursOfPlanDay(plan, weekdayOf(d.getTime()));
    if (hours === null) continue;
    const open = dayStart(d, plan.eatStart);
    const closeAt = open + Math.max(0, 24 - hours) * H;
    if (plan.remindClose && closeAt - plan.closeMinutes * MIN > now + MIN && !(i === 0 && active)) {
      out.push({ at: new Date(closeAt - plan.closeMinutes * MIN), title: 'Eating window closing', body: `Your window closes in ${plan.closeMinutes} minutes. A good time for a last meal or snack.` });
    }
    if (plan.remindStart && closeAt > now + MIN && !(i === 0 && active)) {
      out.push({ at: new Date(closeAt), title: 'Time to start your fast', body: `Your ${hours}-hour fast starts now. Open Fasting and tap Start when you are ready.` });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 14);
};

// ---------------------------------------------------------------------------------------------
// Editing the fasts
// ---------------------------------------------------------------------------------------------

export const MAX_LOGGED_HOURS = 96;

export interface FastPatch {
  startTimestamp?: number;
  endTimestamp?: number;
  targetHours?: number;
  protocolName?: string;
  notes?: string;
}

/** Changes a finished fast's times or details. Fails with a sentence when the times do not make sense. */
export const editFast = (sessions: FastingSession[], id: string, patch: FastPatch): { sessions: FastingSession[] } | { error: string } => {
  const cur = sessions.find((s) => s.id === id);
  if (!cur) return { error: 'That fast was not found.' };
  const start = patch.startTimestamp ?? cur.startTimestamp;
  const end = patch.endTimestamp ?? cur.endTimestamp;
  const target = patch.targetHours ?? cur.targetDurationHours;
  if (!(target >= 1 && target <= MAX_FAST_HOURS)) return { error: `The goal can be 1 to ${MAX_FAST_HOURS} hours.` };
  if (cur.isCompleted || patch.endTimestamp !== undefined) {
    if (end === undefined || end <= start) return { error: 'The fast has to end after it starts.' };
    if ((end - start) / H > MAX_LOGGED_HOURS) return { error: `A fast can be at most ${MAX_LOGGED_HOURS} hours.` };
    if (end > Date.now() + MIN) return { error: 'The end cannot be in the future.' };
  }
  if (start > Date.now() + MIN) return { error: 'The start cannot be in the future.' };
  const next = sessions.map((s) => {
    if (s.id !== id) return s;
    const done = end !== undefined && (s.isCompleted || patch.endTimestamp !== undefined);
    return {
      ...s,
      startTimestamp: start,
      startTimeIso: new Date(start).toISOString(),
      targetDurationHours: target,
      fastProtocolName: patch.protocolName ?? s.fastProtocolName,
      notes: patch.notes !== undefined ? patch.notes.trim() || undefined : s.notes,
      ...(done ? { isCompleted: true, endTimestamp: end, endTimeIso: new Date(end as number).toISOString(), actualHours: Math.round(((end as number) - start) / H * 100) / 100 } : {}),
    };
  });
  return { sessions: next };
};

/** A fast you forgot to track, added after the fact. */
export const addPastFast = (sessions: FastingSession[], input: { start: number; end: number; targetHours: number; protocolName: string }): { sessions: FastingSession[] } | { error: string } => {
  const id = `fast-${input.start}`;
  if (sessions.some((s) => s.id === id)) return { error: 'There is already a fast that starts at that time.' };
  const created: FastingSession = {
    id,
    startTimeIso: new Date(input.start).toISOString(),
    startTimestamp: input.start,
    targetDurationHours: input.targetHours,
    isCompleted: true,
    fastProtocolName: input.protocolName,
    endTimestamp: input.end,
    endTimeIso: new Date(input.end).toISOString(),
    actualHours: 0,
  };
  const r = editFast([created, ...sessions], id, { startTimestamp: input.start, endTimestamp: input.end });
  return 'error' in r ? r : { sessions: r.sessions.sort((a, b) => b.startTimestamp - a.startTimestamp) };
};

// ---------------------------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------------------------

export type DayLevel = 'met' | 'near' | 'short';

export const LEVEL_COLORS: Record<DayLevel, string> = { met: '#86EFAC', near: '#FDE047', short: '#FCA5A5' };

const hoursOf = (s: FastingSession) => s.actualHours ?? s.targetDurationHours;
const ratioOf = (s: FastingSession) => hoursOf(s) / Math.max(1, s.targetDurationHours);
const endKey = (s: FastingSession) => toDateKey(s.endTimestamp ?? s.startTimestamp);

export const levelOf = (ratio: number): DayLevel => (ratio >= 1 ? 'met' : ratio >= 0.75 ? 'near' : 'short');

export interface FastCell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  /** Fasts that ended this day, longest first. */
  fasts: FastingSession[];
  level?: DayLevel;
  /** A fast was running on this day (started earlier or ends later). */
  covered: boolean;
}

export interface FastMonth {
  year: number;
  month: number;
  cells: FastCell[];
  summary: { fasts: number; metGoal: number; avgHours: number; longest: FastingSession | null; totalHours: number };
}

export const buildFastMonth = (sessions: FastingSession[], year: number, month: number, today: string): FastMonth => {
  const done = sessions.filter((s) => s.isCompleted);
  const byEnd = new Map<string, FastingSession[]>();
  for (const s of done) byEnd.set(endKey(s), [...(byEnd.get(endKey(s)) ?? []), s]);
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells: FastCell[] = [];
  for (let date = toDateKey(startOfWeek(first)); ; date = addDays(date, 1)) {
    const d = parseDateKey(date);
    if (d > last && cells.length % 7 === 0) break;
    const fasts = (byEnd.get(date) ?? []).sort((a, b) => hoursOf(b) - hoursOf(a));
    const noon = parseDateKey(date).getTime() + 12 * H;
    cells.push({
      date,
      day: d.getDate(),
      inMonth: d.getMonth() === month && d.getFullYear() === year,
      isToday: date === today,
      isFuture: date > today,
      fasts,
      level: fasts.length ? levelOf(Math.max(...fasts.map(ratioOf))) : undefined,
      covered: done.some((s) => s.startTimestamp <= noon && (s.endTimestamp ?? 0) >= noon),
    });
  }
  const inMonth = cells.filter((c) => c.inMonth).flatMap((c) => c.fasts);
  return {
    year,
    month,
    cells,
    summary: {
      fasts: inMonth.length,
      metGoal: inMonth.filter((s) => ratioOf(s) >= 1).length,
      avgHours: inMonth.length ? Math.round((inMonth.reduce((a, s) => a + hoursOf(s), 0) / inMonth.length) * 10) / 10 : 0,
      longest: inMonth.length ? inMonth.reduce((b, s) => (hoursOf(s) > hoursOf(b) ? s : b)) : null,
      totalHours: Math.round(inMonth.reduce((a, s) => a + hoursOf(s), 0) * 10) / 10,
    },
  };
};

export const earliestFastMonth = (sessions: FastingSession[], today: string): { year: number; month: number } => {
  const keys = sessions.filter((s) => s.isCompleted).map(endKey).sort();
  const d = parseDateKey(keys[0] ?? today);
  return { year: d.getFullYear(), month: d.getMonth() };
};

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

const csv = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every fast as a CSV (start, end, goal and actual hours, protocol, how it went), for a spreadsheet or a doctor. */
export const fastsToCsv = (sessions: FastingSession[], extras: FastExtras, units: UnitSystem = 'metric'): string => {
  const head = ['start', 'end', 'goal_hours', 'actual_hours', 'goal_met', 'protocol', units === 'imperial' ? 'water_fl_oz' : 'water_ml', 'salts', 'hunger_waves', 'feelings_logged', 'ended_unwell', 'notes'];
  const rows = [...sessions]
    .filter((s) => s.isCompleted)
    .sort((a, b) => a.startTimestamp - b.startTimestamp)
    .map((s) => {
      const e = extras[s.id];
      return [
        new Date(s.startTimestamp).toISOString(),
        s.endTimestamp ? new Date(s.endTimestamp).toISOString() : '',
        s.targetDurationHours,
        s.actualHours ?? '',
        hoursOf(s) >= s.targetDurationHours ? 'yes' : 'no',
        s.fastProtocolName,
        mlToDisplay(waterTotalMl(e), units),
        e?.salts.length ?? 0,
        e?.waves.length ?? 0,
        s.checkIns?.length ?? 0,
        e?.unwell ? 'yes' : 'no',
        s.notes ?? e?.note ?? '',
      ].map(csv).join(',');
    });
  return [head.join(','), ...rows].join('\n');
};

// ---------------------------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------------------------

/** Hours spent in each stage across all finished fasts. */
export const stageHours = (sessions: FastingSession[]): { id: string; name: string; hours: number }[] =>
  STAGES.map((st) => ({
    id: st.id,
    name: st.name,
    hours: Math.round(
      sessions.filter((s) => s.isCompleted).reduce((sum, s) => sum + Math.max(0, Math.min(hoursOf(s), st.to) - st.from), 0) * 10
    ) / 10,
  }));

export interface StartSpread {
  avgStart: string;
  stdMin: number;
  label: 'Very steady' | 'Fairly steady' | 'Varied';
  n: number;
}

/** How consistent the time you start fasting is. Times near midnight are averaged around the clock, not across it. */
export const startSpread = (sessions: FastingSession[]): StartSpread | null => {
  const pts = sessions.filter((s) => s.isCompleted).slice(0, 30).map((s) => {
    const d = new Date(s.startTimestamp);
    return (d.getHours() * 60 + d.getMinutes()) / 1440 * 2 * Math.PI;
  });
  if (pts.length < 4) return null;
  const sx = pts.reduce((a, t) => a + Math.cos(t), 0) / pts.length;
  const sy = pts.reduce((a, t) => a + Math.sin(t), 0) / pts.length;
  const r = Math.min(1, Math.hypot(sx, sy));
  let mean = Math.atan2(sy, sx);
  if (mean < 0) mean += 2 * Math.PI;
  const minutes = Math.round((mean / (2 * Math.PI)) * 1440) % 1440;
  const stdMin = Math.round(Math.sqrt(-2 * Math.log(Math.max(r, 1e-6))) * (1440 / (2 * Math.PI)));
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return { avgStart: `${hh}:${mm}`, stdMin, label: stdMin < 45 ? 'Very steady' : stdMin < 90 ? 'Fairly steady' : 'Varied', n: pts.length };
};

export interface ProtocolRow {
  name: string;
  count: number;
  met: number;
  rate: number;
}

export const byProtocol = (sessions: FastingSession[]): ProtocolRow[] => {
  const m = new Map<string, { count: number; met: number }>();
  for (const s of sessions.filter((x) => x.isCompleted)) {
    const cur = m.get(s.fastProtocolName) ?? { count: 0, met: 0 };
    m.set(s.fastProtocolName, { count: cur.count + 1, met: cur.met + (ratioOf(s) >= 1 ? 1 : 0) });
  }
  return [...m.entries()].map(([name, v]) => ({ name, ...v, rate: Math.round((v.met / v.count) * 100) })).sort((a, b) => b.count - a.count);
};

// ---------------------------------------------------------------------------------------------
// Lab: patterns from your own data, plainly worded
// ---------------------------------------------------------------------------------------------

export interface GroupStat {
  n: number;
  avg: number;
}

export interface MealToBed {
  /** At least three hours between starting the fast (the last meal) and going to bed. */
  longGap: GroupStat & { avgQuality: number };
  shortGap: GroupStat & { avgQuality: number };
  diffMin: number;
}

const bedtimeMs = (log: SleepLogEntry, startMs: number): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(log.bedtime ?? '');
  if (!m) return null;
  const startDay = new Date(startMs);
  const bed = new Date(startDay);
  bed.setHours(Number(m[1]), Number(m[2]), 0, 0);
  // A bedtime after midnight is the next calendar day.
  if (Number(m[1]) < 12 && startDay.getHours() >= 12) bed.setDate(bed.getDate() + 1);
  return bed.getTime();
};

/**
 * Sleep on nights after a long gap between the last meal (the start of a fast) and bed, against nights after a short gap. Needs enough
 * nights on both sides, and says "pattern" not "cause".
 */
export const mealToBed = (sessions: FastingSession[], sleepLogs: SleepLogEntry[], minEach = 3): MealToBed | null => {
  const byWake = new Map<string, SleepLogEntry>();
  for (const l of sleepLogs) if (l.durationMinutes >= 120 && (!byWake.has(l.dateIso) || l.durationMinutes > (byWake.get(l.dateIso) as SleepLogEntry).durationMinutes)) byWake.set(l.dateIso, l);
  const longG: SleepLogEntry[] = [];
  const shortG: SleepLogEntry[] = [];
  for (const s of sessions.filter((x) => x.isCompleted)) {
    const d = new Date(s.startTimestamp);
    if (d.getHours() < 17) continue; // a fast that starts in the evening is "the last meal of the day"
    const wake = toDateKey(new Date(d.getHours() >= 12 ? d.getTime() + 24 * H : d.getTime()));
    const log = byWake.get(wake);
    if (!log) continue;
    const bed = bedtimeMs(log, s.startTimestamp);
    if (bed === null) continue;
    const gap = (bed - s.startTimestamp) / H;
    if (gap < 0 || gap > 12) continue;
    (gap >= 3 ? longG : shortG).push(log);
  }
  if (longG.length < minEach || shortG.length < minEach) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const stat = (xs: SleepLogEntry[]) => ({ n: xs.length, avg: Math.round(mean(xs.map((x) => x.durationMinutes))), avgQuality: Math.round(mean(xs.map((x) => x.qualityRating)) * 10) / 10 });
  const a = stat(longG);
  const b = stat(shortG);
  return { longGap: a, shortGap: b, diffMin: a.avg - b.avg };
};

export interface FastedWorkouts {
  fasted: GroupStat & { avgHr: number };
  fed: GroupStat & { avgHr: number };
}

/** Workouts done 12 or more hours into a fast, against the rest. Compared on length and average heart rate. */
export const fastedWorkouts = (sessions: FastingSession[], workouts: WorkoutSession[], minEach = 3): FastedWorkouts | null => {
  const fasted: WorkoutSession[] = [];
  const fed: WorkoutSession[] = [];
  for (const w of workouts) {
    const t = w.startedAt;
    if (!t || w.type === 'Strength' || !(w.durationMinutes >= 10)) continue;
    const inFast = sessions.find((s) => s.startTimestamp <= t && t <= (s.endTimestamp ?? Date.now()));
    (inFast && (t - inFast.startTimestamp) / H >= 12 ? fasted : fed).push(w);
  }
  if (fasted.length < minEach || fed.length < minEach) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const stat = (xs: WorkoutSession[]) => ({ n: xs.length, avg: Math.round(mean(xs.map((x) => x.durationMinutes))), avgHr: Math.round(mean(xs.filter((x) => x.avgHeartRate > 0).map((x) => x.avgHeartRate)) || 0) });
  return { fasted: stat(fasted), fed: stat(fed) };
};

export interface WeekRow {
  weekStart: string;
  fastedHours: number;
  fasts: number;
  avgWeightKg: number | null;
}

/** Each of the last few weeks: hours fasted, and the average weight logged that week. For looking at, not for a verdict. */
export const weeklyWeight = (sessions: FastingSession[], body: BodyEntry[], today: string, weeks = 8): WeekRow[] => {
  const out: WeekRow[] = [];
  const thisWeek = toDateKey(startOfWeek(parseDateKey(today)));
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(thisWeek, -7 * i);
    const to = addDays(from, 7);
    const fs = sessions.filter((s) => s.isCompleted && endKey(s) >= from && endKey(s) < to);
    const w = body.filter((b) => b.date >= from && b.date < to);
    out.push({
      weekStart: from,
      fastedHours: Math.round(fs.reduce((a, s) => a + hoursOf(s), 0) * 10) / 10,
      fasts: fs.length,
      avgWeightKg: w.length ? Math.round((w.reduce((a, b) => a + b.weightKg, 0) / w.length) * 10) / 10 : null,
    });
  }
  return out;
};

export interface CircadianSuggestion {
  eatStart: string;
  eatEnd: string;
  fastHours: number;
  medianWake: string;
  medianBed: string;
}

const toMin = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fmtMin = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

/**
 * An eating window that follows your day, from your own sleep: it opens about an hour and a half after you wake and closes about three
 * hours before you go to bed, never longer than twelve hours or shorter than six. Experimental: it rests on the idea that eating
 * earlier in the day suits the body clock, which is plausible but not settled.
 */
export const circadianSuggestion = (sleepLogs: SleepLogEntry[]): CircadianSuggestion | null => {
  const recent = [...sleepLogs].filter((l) => l.durationMinutes >= 180).sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1)).slice(0, 14);
  if (recent.length < 5) return null;
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const wake = median(recent.map((l) => toMin(l.wakeTime)).filter((v): v is number => v !== null));
  // A bedtime after midnight is counted as late evening, so 00:30 becomes 24:30.
  const bed = median(recent.map((l) => toMin(l.bedtime)).filter((v): v is number => v !== null).map((v) => (v < 12 * 60 ? v + 1440 : v)));
  if (!Number.isFinite(wake) || !Number.isFinite(bed)) return null;
  const open = wake + 90;
  let close = bed - 180;
  if (close - open > 12 * 60) close = open + 12 * 60;
  if (close - open < 6 * 60) return null;
  const eatHours = (close - open) / 60;
  return { eatStart: fmtMin(open), eatEnd: fmtMin(close), fastHours: clampHours(24 - eatHours), medianWake: fmtMin(wake), medianBed: fmtMin(bed) };
};

/** If you start at `startMs` for `hours`: when it ends, and how much of it falls while you are asleep (given bed and wake times). */
export const whatIf = (startMs: number, hours: number, bed?: string, wake?: string): { endsAt: number; asleepHours: number | null } => {
  const endsAt = startMs + hours * H;
  const b = bed ? toMin(bed) : null;
  const w = wake ? toMin(wake) : null;
  if (b === null || w === null) return { endsAt, asleepHours: null };
  let asleep = 0;
  for (let day = -1; day <= Math.ceil(hours / 24) + 1; day++) {
    const base = new Date(startMs);
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + day);
    const from = base.getTime() + b * MIN;
    const to = base.getTime() + (w <= b ? w + 1440 : w) * MIN;
    asleep += Math.max(0, Math.min(endsAt, to) - Math.max(startMs, from));
  }
  return { endsAt, asleepHours: Math.round((asleep / H) * 10) / 10 };
};

/** Ketone readings during fasts as hours into the fast against mmol/L, for a chart. */
export const ketoneSeries = (sessions: FastingSession[], extras: FastExtras): { hours: number; mmol: number }[] =>
  sessions
    .flatMap((s) => (extras[s.id]?.ketones ?? []).map((k) => ({ hours: Math.round(((k.at - s.startTimestamp) / H) * 10) / 10, mmol: k.mmol })))
    .filter((p) => p.hours >= 0)
    .sort((a, b) => a.hours - b.hours);

export const glucoseSeries = (sessions: FastingSession[], extras: FastExtras): { hours: number; mgdl: number }[] =>
  sessions
    .flatMap((s) => (extras[s.id]?.glucose ?? []).map((g) => ({ hours: Math.round(((g.at - s.startTimestamp) / H) * 10) / 10, mgdl: g.mgdl })))
    .filter((p) => p.hours >= 0)
    .sort((a, b) => a.hours - b.hours);

/** The fast's protocol options for a custom goal: the nearest preset below it, for a name in the history. */
export const nameForHours = (hours: number): string => {
  const exact = PROTOCOLS.find((p) => p.fastHours === hours);
  return exact ? exact.name : `${hours}h custom`;
};

// ---------------------------------------------------------------------------------------------
// 5:2 days and electrolyte reminders
// ---------------------------------------------------------------------------------------------

export const DEFAULT_FIVE_TWO: FiveTwo = { on: false, days: [0, 3], kcal: 500 };
export const FIVE_TWO_KCAL = [500, 600, 700];

/** The two days must be different weekdays; they are better apart than side by side. */
export const normalizeFiveTwo = (f: Partial<FiveTwo> | undefined): FiveTwo => {
  const days = [...new Set((f?.days ?? DEFAULT_FIVE_TWO.days).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b).slice(0, 2);
  const kcal = FIVE_TWO_KCAL.includes(f?.kcal as number) ? (f?.kcal as number) : DEFAULT_FIVE_TWO.kcal;
  return { on: f?.on === true, days: days.length === 2 ? days : DEFAULT_FIVE_TWO.days, kcal };
};

/** Two chosen days sit side by side (Sunday and Monday count as side by side). */
export const fiveTwoAdjacent = (days: number[]): boolean => days.length === 2 && (Math.abs(days[0] - days[1]) === 1 || Math.abs(days[0] - days[1]) === 6);

/** The calories for a date when it is a low-calorie day in the plan, else null. */
export const lowDayKcal = (plan: FastPlan | undefined, date: string): number | null => {
  const f = plan?.fiveTwo;
  if (!f || !f.on) return null;
  const d = new Date(`${date}T12:00:00`);
  const idx = (d.getDay() + 6) % 7;
  return normalizeFiveTwo(f).days.includes(idx) ? normalizeFiveTwo(f).kcal : null;
};

export interface ElectrolyteNotice {
  at: Date;
  title: string;
  body: string;
}

/** Longer fasts: the fast must be at least this long for the reminders to apply, the first comes after 8 hours, then every 4. */
export const ELECTROLYTE_MIN_GOAL_HOURS = 24;

export const electrolyteNotices = (startMs: number, goalHours: number, nowMs: number): ElectrolyteNotice[] => {
  if (goalHours < ELECTROLYTE_MIN_GOAL_HOURS) return [];
  const out: ElectrolyteNotice[] = [];
  const end = startMs + goalHours * H;
  for (let h = 8; h < goalHours && out.length < 6; h += 4) {
    const at = startMs + h * H;
    if (at <= nowMs + MIN || at >= end) continue;
    out.push({
      at: new Date(at),
      title: 'Water and salts check',
      body: `You are about ${h} hours in. Sip some water, and if you use salts, now is a good time. Stop and eat if you feel unwell.`,
    });
  }
  return out;
};
