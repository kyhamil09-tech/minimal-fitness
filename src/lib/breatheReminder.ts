import { addDays, parseDateKey, toDateKey } from './dates';

export interface BreatheReminder {
  on: boolean;
  /** HH:MM. */
  time: string;
  /** A gentler note on days after you have skipped a few. */
  nudge: boolean;
}

export const DEFAULT_REMINDER: BreatheReminder = { on: false, time: '19:00', nudge: true };

export interface BreatheNotice {
  date: string;
  at: Date;
  title: string;
  body: string;
}

const DAY = 86_400_000;
const REGULAR = [
  'Two minutes to breathe. Slow in, slower out.',
  'A short pause for yourself. Open Breathe whenever you are ready.',
  'Take a moment to settle. A few slow breaths is enough.',
];
const GENTLE = [
  'It has been a few days. One slow breath is a fine place to start.',
  'No pressure. If you have two minutes, your breathing is waiting.',
];

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return { hour: Number.isFinite(h) ? h : 19, minute: Number.isFinite(m) ? m : 0 };
};

/**
 * The reminders for the next week, one for each day at the chosen time. Today's is dropped when you have already breathed today. On a day
 * that falls two or more days after your last session the note is a gentler one, if that is switched on. The app re-plans each time it
 * opens and whenever a session is saved, so a reminder never nags about something you have just done.
 */
export const planBreatheReminders = (now: number, reminder: BreatheReminder, lastSessionAt: number | null): BreatheNotice[] => {
  if (!reminder.on) return [];
  const { hour, minute } = clock(reminder.time);
  const today = toDateKey(now);
  const lastKey = lastSessionAt ? toDateKey(lastSessionAt) : null;
  const out: BreatheNotice[] = [];
  for (let i = 0; i < 7; i++) {
    const key = addDays(today, i);
    const at = parseDateKey(key);
    at.setHours(hour, minute, 0, 0);
    if (at.getTime() <= now + 60_000) continue;
    if (key === lastKey) continue;
    const since = lastKey ? Math.round((parseDateKey(key).getTime() - parseDateKey(lastKey).getTime()) / DAY) : null;
    const gentle = reminder.nudge && since !== null && since >= 3;
    const pool = gentle ? GENTLE : REGULAR;
    out.push({ date: key, at, title: gentle ? 'Whenever you are ready' : 'Take a breath', body: pool[i % pool.length] });
  }
  return out;
};
