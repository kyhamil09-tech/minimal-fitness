/** A medication or supplement with the times of day it is taken. Kept on the phone only. */
export interface MedReminder {
  id: string;
  name: string;
  dose?: string;
  /** HH:MM, each repeating every day. */
  times: string[];
  enabled: boolean;
}

export interface MedNotice {
  id: number;
  title: string;
  body: string;
  hour: number;
  minute: number;
  name: string;
}

export const MED_ID_BASE = 9600;
/** Notification ids 9600 to 9639. */
export const MED_MAX_NOTICES = 40;

const clean = (hhmm: string): string | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
};

/** Adds a time to a list, keeping it valid, without repeats and in clock order. */
export const addTime = (times: string[], hhmm: string): string[] => {
  const t = clean(hhmm);
  if (!t) return times;
  return [...new Set([...times, t])].sort();
};

/**
 * What to schedule: one daily notice for each time of each enabled medication, capped at the id range. With the name hidden the text
 * says only that a medication is due, so it reads the same on a lock screen in public.
 */
export const medNotices = (meds: MedReminder[], hideName: boolean): MedNotice[] => {
  const out: MedNotice[] = [];
  for (const m of meds) {
    if (!m.enabled) continue;
    for (const t of m.times) {
      const c = clean(t);
      if (!c || out.length >= MED_MAX_NOTICES) continue;
      const [hour, minute] = c.split(':').map(Number);
      const what = hideName ? 'your medication' : `${m.name}${m.dose ? ` (${m.dose})` : ''}`;
      out.push({ id: MED_ID_BASE + out.length, title: hideName ? 'Medication' : m.name, body: `Time for ${what}.`, hour, minute, name: m.name });
    }
  }
  return out;
};
