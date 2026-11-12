import { FastingCheckIn, FastingSession } from '../types/health';
import { addDays, toDateKey } from './dates';

/** The stages of a fast, by hours since the last meal. */
export const FAST_STAGES = [
  { id: 'fed', name: 'Fed & anabolic', short: 'Fed', from: 0, to: 4 },
  { id: 'early', name: 'Early fasting', short: 'Early', from: 4, to: 12 },
  { id: 'fat', name: 'Fat burning', short: 'Fat burn', from: 12, to: 16 },
  { id: 'ketosis', name: 'Ketosis & cell repair', short: 'Ketosis', from: 16, to: 20 },
  { id: 'deep', name: 'Deep ketosis', short: 'Deep', from: 20, to: Infinity },
] as const;

export type FastStageId = (typeof FAST_STAGES)[number]['id'];

export const stageIndexAt = (hours: number): number => {
  const i = FAST_STAGES.findIndex((s) => hours >= s.from && hours < s.to);
  return i < 0 ? FAST_STAGES.length - 1 : i;
};

/** The feelings you can tap while fasting. Tone only decides the color and how the summary groups them. */
export const FEELING_TAGS = [
  { id: 'energetic', label: 'Energetic', tone: 'good' },
  { id: 'focused', label: 'Focused', tone: 'good' },
  { id: 'calm', label: 'Calm', tone: 'good' },
  { id: 'clear', label: 'Clear-headed', tone: 'good' },
  { id: 'hungry', label: 'Hungry', tone: 'bad' },
  { id: 'craving', label: 'Cravings', tone: 'bad' },
  { id: 'headache', label: 'Headache', tone: 'bad' },
  { id: 'tired', label: 'Tired', tone: 'bad' },
  { id: 'dizzy', label: 'Dizzy', tone: 'bad' },
  { id: 'irritable', label: 'Irritable', tone: 'bad' },
  { id: 'nauseous', label: 'Nauseous', tone: 'bad' },
  { id: 'cold', label: 'Cold', tone: 'bad' },
] as const;

export type FeelingTagId = (typeof FEELING_TAGS)[number]['id'];

const TAG_IDS = new Set<string>(FEELING_TAGS.map((t) => t.id));
export const feelingLabel = (id: string) => FEELING_TAGS.find((t) => t.id === id)?.label ?? id;
export const feelingTone = (id: string): 'good' | 'bad' => FEELING_TAGS.find((t) => t.id === id)?.tone ?? 'bad';

/** Hours into the fast at a moment in time. */
export const hoursInto = (session: Pick<FastingSession, 'startTimestamp'>, at: number) => Math.max(0, (at - session.startTimestamp) / 3_600_000);

/** The protocol and length of the most recent fast, for the next one (a widget's start button uses it). */
export const lastProtocol = (sessions: FastingSession[]): { hours: number; name: string } => {
  const last = [...sessions].sort((a, b) => b.startTimestamp - a.startTimestamp)[0];
  return last ? { hours: last.targetDurationHours, name: last.fastProtocolName } : { hours: 16, name: '16:8 Standard' };
};

/** Starts a fast now, and drops any unfinished one (only one fast runs at a time). */
export const startFast = (sessions: FastingSession[], opts: { targetHours: number; protocolName: string; now?: number }): FastingSession[] => {
  const start = opts.now ?? Date.now();
  const session: FastingSession = {
    id: `fast-${start}`,
    startTimeIso: new Date(start).toISOString(),
    startTimestamp: start,
    targetDurationHours: opts.targetHours,
    isCompleted: false,
    fastProtocolName: opts.protocolName,
  };
  return [session, ...sessions.filter((s) => s.isCompleted)];
};

/** Ends the running fast and records how long it lasted. */
export const endFast = (sessions: FastingSession[], now: number = Date.now()): FastingSession[] =>
  sessions.map((s) =>
    s.isCompleted
      ? s
      : {
          ...s,
          endTimeIso: new Date(now).toISOString(),
          endTimestamp: now,
          isCompleted: true,
          actualHours: parseFloat(((now - s.startTimestamp) / 3_600_000).toFixed(1)),
        },
  );

/** Adds a check-in to the running fast (or to the session with the given id). Unknown tags are dropped; no tags adds nothing. */
export const addCheckIn = (sessions: FastingSession[], tags: string[], at: number = Date.now(), sessionId?: string): FastingSession[] => {
  const clean = [...new Set(tags.filter((t) => TAG_IDS.has(t)))];
  if (clean.length === 0) return sessions;
  const entry: FastingCheckIn = { at, tags: clean };
  return sessions.map((s) => ((sessionId ? s.id === sessionId : !s.isCompleted) ? { ...s, checkIns: [...(s.checkIns ?? []), entry].sort((a, b) => a.at - b.at) } : s));
};

export const removeCheckIn = (sessions: FastingSession[], sessionId: string, at: number): FastingSession[] =>
  sessions.map((s) => (s.id === sessionId ? { ...s, checkIns: (s.checkIns ?? []).filter((c) => c.at !== at) } : s));

export interface StageFeelings {
  stageId: FastStageId;
  name: string;
  short: string;
  /** Check-ins that fell in this stage, across every fast. */
  checkIns: number;
  /** Tags in this stage with how many check-ins had them, most common first. */
  tags: { id: string; count: number; share: number }[];
}

/**
 * Which feelings show up at which stage of a fast, across all your fasts. A tag's share is the part of that stage's
 * check-ins that included it, so "Hungry 80%" at the fat-burning stage means four of five check-ins there said hungry.
 */
export const feelingMap = (sessions: FastingSession[]): StageFeelings[] => {
  const perStage = FAST_STAGES.map(() => ({ n: 0, tags: new Map<string, number>() }));
  for (const s of sessions) {
    for (const c of s.checkIns ?? []) {
      const bucket = perStage[stageIndexAt(hoursInto(s, c.at))];
      bucket.n++;
      for (const t of c.tags) bucket.tags.set(t, (bucket.tags.get(t) ?? 0) + 1);
    }
  }
  return FAST_STAGES.map((st, i) => ({
    stageId: st.id,
    name: st.name,
    short: st.short,
    checkIns: perStage[i].n,
    tags: [...perStage[i].tags.entries()]
      .map(([id, count]) => ({ id, count, share: Math.round((count / perStage[i].n) * 100) }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
  }));
};

/** The total number of check-ins in all the fasts. */
export const checkInCount = (sessions: FastingSession[]) => sessions.reduce((n, s) => n + (s.checkIns?.length ?? 0), 0);

export interface FastingStats {
  total: number;
  goalMet: number;
  /** Share of completed fasts that reached their target, 0-100. */
  successRate: number;
  avgHours: number;
  longestHours: number;
  totalHours: number;
  /** Consecutive days (ending today or yesterday) with at least one fast that met its goal. */
  streakDays: number;
}

const hoursOf = (s: FastingSession) => s.actualHours ?? s.targetDurationHours;
const metGoal = (s: FastingSession) => hoursOf(s) >= s.targetDurationHours;
const endKey = (s: FastingSession) => toDateKey(s.endTimestamp ?? s.startTimestamp);

export const completedFasts = (sessions: FastingSession[]) =>
  sessions.filter((s) => s.isCompleted).sort((a, b) => (b.endTimestamp ?? 0) - (a.endTimestamp ?? 0));

export const fastingStats = (sessions: FastingSession[], todayKeyStr: string): FastingStats => {
  const done = completedFasts(sessions);
  const hours = done.map(hoursOf);
  const goalMet = done.filter(metGoal).length;
  const metDays = new Set(done.filter(metGoal).map(endKey));
  // The streak may end today or yesterday (today's fast might not be done yet).
  let cursor = metDays.has(todayKeyStr) ? todayKeyStr : addDays(todayKeyStr, -1);
  let streak = 0;
  while (metDays.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return {
    total: done.length,
    goalMet,
    successRate: done.length ? Math.round((goalMet / done.length) * 100) : 0,
    avgHours: done.length ? Number((hours.reduce((a, b) => a + b, 0) / done.length).toFixed(1)) : 0,
    longestHours: done.length ? Math.max(...hours) : 0,
    totalHours: Number(hours.reduce((a, b) => a + b, 0).toFixed(1)),
    streakDays: streak,
  };
};

/** Hours fasted per day for the last `days` days (a fast counts on the day it ended). */
export const fastingByDay = (sessions: FastingSession[], todayKeyStr: string, days = 14) => {
  const totals = new Map<string, number>();
  for (const s of completedFasts(sessions)) totals.set(endKey(s), (totals.get(endKey(s)) ?? 0) + hoursOf(s));
  const out: { key: string; hours: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = addDays(todayKeyStr, -i);
    out.push({ key, hours: Number((totals.get(key) ?? 0).toFixed(1)) });
  }
  return out;
};