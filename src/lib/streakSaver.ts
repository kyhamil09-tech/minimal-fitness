import { addDays, parseDateKey } from './dates';

export interface StreakNudge {
  /** The day the nudge is for, as a date key. */
  date: string;
  at: Date;
  title: string;
  body: string;
}

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return { hour: Number.isFinite(h) ? h : 19, minute: Number.isFinite(m) ? m : 30 };
};

/**
 * The evening "keep your streak" nudges for today and tomorrow. Today's only goes out when nothing is logged yet and there is a streak
 * to keep; tomorrow's is a gentle one that the app cancels or replaces the next time it opens and sees that day done. Nudges whose time
 * has passed are left out.
 */
export const planStreakSaver = (now: number, today: string, time: string, streak: number, doneToday: boolean): StreakNudge[] => {
  const { hour, minute } = clock(time);
  const at = (key: string) => {
    const d = parseDateKey(key);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const out: StreakNudge[] = [];
  if (!doneToday && streak >= 1) {
    const t = at(today);
    if (t.getTime() > now + 60_000) {
      out.push({
        date: today,
        at: t,
        title: `${streak}-day streak`,
        body: streak >= 7 ? `Do not lose ${streak} days now. Even ten minutes of walking counts.` : 'A short walk or a quick workout keeps it going. There is still time tonight.',
      });
    }
  }
  const tomorrow = addDays(today, 1);
  const t2 = at(tomorrow);
  if (t2.getTime() > now + 60_000) {
    out.push({
      date: tomorrow,
      at: t2,
      title: 'Keep it going',
      body: 'Nothing logged yet today. A short walk keeps your streak alive.',
    });
  }
  return out;
};
