import { Routine } from '../types/tracking';

/**
 * Training days for routines ("Push on Monday and Thursday"). Days are numbered 0 = Monday to 6 = Sunday, like the rest of the app.
 */

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Which day of the week (0 = Monday) a date falls on. */
export const dayIndex = (d: Date): number => (d.getDay() + 6) % 7;

/** A clean list of days: whole numbers 0 to 6, once each, in order. */
export const cleanDays = (days: unknown): number[] =>
  Array.isArray(days) ? [...new Set(days.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b) : [];

/** "Mon · Thu", or "Every day" when all seven are picked. */
export const daysText = (days: number[] | undefined): string => {
  const d = cleanDays(days);
  if (d.length === 0) return '';
  return d.length === 7 ? 'Every day' : d.map((i) => DAY_SHORT[i]).join(' · ');
};

/** The routines scheduled for a day. */
export const routinesForDay = (routines: Routine[], day: number): Routine[] => routines.filter((r) => cleanDays(r.days).includes(day));

export interface ReminderDay {
  day: number;
  names: string[];
}

/** One reminder per day that has a routine on it. */
export const reminderPlan = (routines: Routine[]): ReminderDay[] => {
  const out: ReminderDay[] = [];
  for (let day = 0; day < 7; day++) {
    const names = routinesForDay(routines, day).map((r) => r.name);
    if (names.length) out.push({ day, names });
  }
  return out;
};

/** The weekday number Android's scheduler uses (1 = Sunday to 7 = Saturday) for our day (0 = Monday). */
export const androidWeekday = (day: number): number => ((day + 1) % 7) + 1;

export const reminderText = (names: string[]): { title: string; body: string } => ({
  title: names.length === 1 ? `${names[0]} today` : 'Training day',
  body: names.length === 1 ? 'Your workout is scheduled for today. Tap to open the app.' : `Scheduled today: ${names.join(', ')}. Tap to open the app.`,
});
