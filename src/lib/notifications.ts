import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ReminderDay, androidWeekday, reminderText } from './liftSchedule';
import { addDays, parseDateKey, todayKey } from './dates';
import type { LangCode } from './languages';
import { noteText, planNotes, readNoteState, weeklyText, writeNoteState } from './encouragement';
import { planStreakSaver } from './streakSaver';
import { BreatheReminder, planBreatheReminders } from './breatheReminder';
import { FastPlan, planFastReminders } from '../fasting/model';
import { MED_ID_BASE, MED_MAX_NOTICES, MedReminder, medNotices } from './medReminders';

const isNative = () => Capacitor.isNativePlatform();

export const notificationsSupported = () =>
  isNative() || (typeof window !== 'undefined' && 'Notification' in window);

export const notificationPermission = (): NotificationPermission | 'unsupported' => {
  // On Android the real state is async; the Reminders dialog asks for it explicitly.
  if (isNative()) return 'default';
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
};

export const requestNotificationPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (isNative()) {
    const res = await LocalNotifications.requestPermissions();
    return res.display === 'granted' ? 'granted' : 'denied';
  }
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
};

/** Asks Android for notification permission once, if it has not been decided yet (the fasting timer needs it). */
export const ensureNotificationPermission = async (): Promise<void> => {
  if (!isNative()) return;
  try {
    const p = await LocalNotifications.checkPermissions();
    if (p.display === 'prompt' || p.display === 'prompt-with-rationale') await LocalNotifications.requestPermissions();
  } catch {
    // no permission API: nothing to ask
  }
};

let nativeId = 1;

/** Shows a notification: native on Android, otherwise via the service worker / Notification API. */
export const notify = async (title: string, body: string, tag?: string) => {
  try {
    if (isNative()) {
      await LocalNotifications.schedule({
        notifications: [{ id: nativeId++ % 2147483000, title, body, extra: { tag } }],
      });
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, { body, tag, icon: '/icon.svg', badge: '/icon.svg' });
        return;
      }
    }
    new Notification(title, { body, tag, icon: '/icon.svg' });
  } catch {
    // Some mobile browsers only allow the SW path; nothing more to do.
  }
};

// ---- Reminders scheduled with Android itself, so they fire when the app is closed ----

const ID_WORKOUT = 9001;
const ID_BEDTIME = 9002;
const ID_FAST = 9200;
const ID_HYDRATION_BASE = 9100;
const MAX_HYDRATION = 16;

const parseClock = (hhmm: string): { hour: number; minute: number } => {
  const [h, m] = hhmm.split(':').map(Number);
  return { hour: Number.isFinite(h) ? h : 8, minute: Number.isFinite(m) ? m : 0 };
};

export interface ScheduledReminderInput {
  workoutEnabled: boolean;
  workoutTime: string;
  bedtimeEnabled: boolean;
  bedtimeTime: string;
  hydrationEnabled: boolean;
  hydrationEveryMin: number;
  fastingEnabled: boolean;
  /** When the running fast reaches its goal (epoch ms), or null when no fast is running. */
  fastEndsAt: number | null;
  fastGoalHours: number;
}

/**
 * Replaces every scheduled reminder with the current settings. Daily reminders repeat on their own, so they
 * keep firing with the app closed or after a restart. Does nothing outside the Android app.
 */
export const syncScheduledReminders = async (s: ScheduledReminderInput): Promise<void> => {
  if (!isNative()) return;
  try {
    const hydrationIds = Array.from({ length: MAX_HYDRATION }, (_, i) => ID_HYDRATION_BASE + i);
    await LocalNotifications.cancel({
      notifications: [ID_WORKOUT, ID_BEDTIME, ID_FAST, ...hydrationIds].map((id) => ({ id })),
    });
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;

    const list: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = [];
    if (s.workoutEnabled) {
      list.push({
        id: ID_WORKOUT,
        title: 'Time to move',
        body: 'Your scheduled workout starts now. Tap to set a goal and go.',
        schedule: { on: parseClock(s.workoutTime), allowWhileIdle: true },
        extra: { tag: 'workout' },
      });
    }
    if (s.bedtimeEnabled) {
      list.push({
        id: ID_BEDTIME,
        title: 'Wind down',
        body: 'Bedtime is coming up. Put the screens away.',
        schedule: { on: parseClock(s.bedtimeTime), allowWhileIdle: true },
        extra: { tag: 'bedtime' },
      });
    }
    if (s.hydrationEnabled) {
      const step = Math.max(30, s.hydrationEveryMin);
      let i = 0;
      for (let minute = 8 * 60; minute < 21 * 60 && i < MAX_HYDRATION; minute += step, i++) {
        list.push({
          id: ID_HYDRATION_BASE + i,
          title: 'Drink some water',
          body: 'Tap to log a glass and keep your hydration on track.',
          schedule: { on: { hour: Math.floor(minute / 60), minute: minute % 60 }, allowWhileIdle: true },
          extra: { tag: 'hydration' },
        });
      }
    }
    if (s.fastingEnabled && s.fastEndsAt && s.fastEndsAt > Date.now()) {
      list.push({
        id: ID_FAST,
        title: 'Fast complete',
        body: `You reached your ${s.fastGoalHours}h goal.`,
        schedule: { at: new Date(s.fastEndsAt), allowWhileIdle: true },
        extra: { tag: 'fasting' },
      });
    }
    if (list.length > 0) await LocalNotifications.schedule({ notifications: list });
  } catch {
    // Scheduling is best effort; the in-app reminders below still cover an open app.
  }
};

const ID_LIFT_BASE = 9300;

/**
 * One weekly reminder for each day that has a routine scheduled (see lib/liftSchedule). They repeat by themselves, so they fire with
 * the app closed. With reminders switched off, or nothing scheduled, it only clears the old ones.
 */
export const syncLiftReminders = async (on: boolean, time: string, plan: ReminderDay[]): Promise<void> => {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: Array.from({ length: 7 }, (_, i) => ({ id: ID_LIFT_BASE + i })) });
    if (!on || plan.length === 0) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;
    const { hour, minute } = parseClock(time);
    await LocalNotifications.schedule({
      notifications: plan.map((p) => {
        const t = reminderText(p.names);
        return { id: ID_LIFT_BASE + p.day, title: t.title, body: t.body, schedule: { on: { weekday: androidWeekday(p.day), hour, minute }, allowWhileIdle: true }, extra: { tag: 'lift' } };
      }),
    });
  } catch {
    // best effort
  }
};

const ID_COACH_DAILY = 9400;
const COACH_DAYS = 14;
const ID_COACH_WEEKLY = 9420;
const COACH_WEEKS = 4;

export interface CoachNotesInput {
  dailyOn: boolean;
  dailyTime: string;
  weeklyOn: boolean;
  /** 0 = Monday .. 6 = Sunday. */
  weeklyDay: number;
  weeklyTime: string;
  /** The language the notes are written in. */
  lang: LangCode;
}

const at = (dateKey: string, hhmm: string): Date => {
  const { hour, minute } = parseClock(hhmm);
  const d = parseDateKey(dateKey);
  d.setHours(hour, minute, 0, 0);
  return d;
};

/**
 * Schedules the next two weeks of kind daily notes, each with its own text, and the next four weekly review notifications. Android
 * fires them with the app closed; each time the app opens they are topped up. Does nothing outside the Android app.
 */
export const syncCoachNotes = async (s: CoachNotesInput): Promise<void> => {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [...Array.from({ length: COACH_DAYS }, (_, i) => ID_COACH_DAILY + i), ...Array.from({ length: COACH_WEEKS }, (_, i) => ID_COACH_WEEKLY + i)].map((id) => ({ id })),
    });
    if (!s.dailyOn && !s.weeklyOn) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;
    const now = Date.now();
    const today = todayKey();
    const list: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = [];

    // The weekly review's dates come first: on those days the review is the only coach notification, so there is at most one a day.
    const weeklyDates: string[] = [];
    if (s.weeklyOn) {
      const first = parseDateKey(today);
      const ahead = (s.weeklyDay - ((first.getDay() + 6) % 7) + 7) % 7;
      for (let i = 0; weeklyDates.length < COACH_WEEKS && i < 6; i++) {
        const k = addDays(today, ahead + i * 7);
        if (at(k, s.weeklyTime).getTime() > now + 60_000) weeklyDates.push(k);
      }
    }
    if (s.dailyOn) {
      const dates: string[] = [];
      for (let i = 0; dates.length < COACH_DAYS && i < COACH_DAYS + 7; i++) {
        const k = addDays(today, i);
        if (weeklyDates.includes(k)) continue;
        if (at(k, s.dailyTime).getTime() > now + 60_000) dates.push(k);
      }
      const state = planNotes(readNoteState(), dates, today);
      writeNoteState(state);
      dates.forEach((k, i) => {
        const t = noteText(state.byDate[k], s.lang);
        list.push({ id: ID_COACH_DAILY + i, title: t.title, body: t.body, schedule: { at: at(k, s.dailyTime), allowWhileIdle: true }, extra: { tag: 'coach-daily' } });
      });
    }
    weeklyDates.forEach((k, n) => {
      const t = weeklyText(k, s.lang);
      list.push({ id: ID_COACH_WEEKLY + n, title: t.title, body: t.body, schedule: { at: at(k, s.weeklyTime), allowWhileIdle: true }, extra: { tag: 'coach-weekly' } });
    });
    if (list.length > 0) await LocalNotifications.schedule({ notifications: list });
  } catch {
    // best effort
  }
};

const ID_STREAK = 9500;

/**
 * The evening streak nudges (see lib/streakSaver). Called again whenever the streak or today's activity changes, so a nudge for a day
 * that has since been done is cancelled. Does nothing outside the Android app.
 */
export const syncStreakSaver = async (on: boolean, time: string, streak: number, doneToday: boolean): Promise<void> => {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: [ID_STREAK, ID_STREAK + 1].map((id) => ({ id })) });
    if (!on) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;
    const plan = planStreakSaver(Date.now(), todayKey(), time, streak, doneToday);
    if (plan.length === 0) return;
    await LocalNotifications.schedule({
      notifications: plan.map((n, i) => ({ id: ID_STREAK + i, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true }, extra: { tag: 'streak' } })),
    });
  } catch {
    // best effort
  }
};

/** Daily medication and supplement reminders, one for each time. They repeat by themselves, so they fire with the app closed. */
export const syncMedReminders = async (meds: MedReminder[], hideName: boolean): Promise<void> => {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: Array.from({ length: MED_MAX_NOTICES }, (_, i) => ({ id: MED_ID_BASE + i })) });
    const list = medNotices(meds, hideName);
    if (list.length === 0) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const asked = await LocalNotifications.requestPermissions();
      if (asked.display !== 'granted') return;
    }
    await LocalNotifications.schedule({
      notifications: list.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { on: { hour: n.hour, minute: n.minute }, allowWhileIdle: true }, extra: { tag: 'medication' } })),
    });
  } catch {
    // best effort
  }
};

const ID_BREATHE = 9700;

/** The daily breathing reminder for the next week (see lib/breatheReminder). Replaced whenever a session is saved or the app opens. */
export const syncBreatheReminder = async (reminder: BreatheReminder, lastSessionAt: number | null): Promise<void> => {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: Array.from({ length: 8 }, (_, i) => ({ id: ID_BREATHE + i })) });
    const plan = planBreatheReminders(Date.now(), reminder, lastSessionAt);
    if (plan.length === 0) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const asked = await LocalNotifications.requestPermissions();
      if (asked.display !== 'granted') return;
    }
    await LocalNotifications.schedule({
      notifications: plan.map((p, i) => ({ id: ID_BREATHE + i, title: p.title, body: p.body, schedule: { at: p.at, allowWhileIdle: true }, extra: { tag: 'breathe' } })),
    });
  } catch {
    // best effort
  }
};

const ID_FASTPLAN = 9800;

/** The fasting plan's reminders for the next week: when the eating window is about to close, and when it is time to start the fast. */
export const syncFastPlanReminders = async (plan: FastPlan, fastRunning: boolean): Promise<void> => {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: Array.from({ length: 16 }, (_, i) => ({ id: ID_FASTPLAN + i })) });
    const list = planFastReminders(Date.now(), plan, fastRunning);
    if (list.length === 0) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const asked = await LocalNotifications.requestPermissions();
      if (asked.display !== 'granted') return;
    }
    await LocalNotifications.schedule({
      notifications: list.map((p, i) => ({ id: ID_FASTPLAN + i, title: p.title, body: p.body, schedule: { at: p.at, allowWhileIdle: true }, extra: { tag: 'fastplan' } })),
    });
  } catch {
    // best effort
  }
};

const ID_EAT = 9900;

/** The Eat app's daily log reminders (breakfast, lunch, dinner, an evening look-back), each repeating at its own time. */
export const syncEatReminders = async (slots: { slot: number; hour: number; minute: number; title: string; body: string }[]): Promise<void> => {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: Array.from({ length: 4 }, (_, i) => ({ id: ID_EAT + i })) });
    if (slots.length === 0) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const asked = await LocalNotifications.requestPermissions();
      if (asked.display !== 'granted') return;
    }
    await LocalNotifications.schedule({
      notifications: slots.map((s) => ({ id: ID_EAT + s.slot, title: s.title, body: s.body, schedule: { on: { hour: s.hour, minute: s.minute }, allowWhileIdle: true }, extra: { tag: 'eat' } })),
    });
  } catch {
    // best effort
  }
};

const ID_ELECTROLYTE = 9830;

/** Water-and-salts reminders for the fast that is running (see fasting/model electrolyteNotices). Replaced whenever the fast or the setting changes. */
export const syncFastElectrolytes = async (notices: { at: Date; title: string; body: string }[]): Promise<void> => {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: Array.from({ length: 6 }, (_, i) => ({ id: ID_ELECTROLYTE + i })) });
    if (notices.length === 0) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const asked = await LocalNotifications.requestPermissions();
      if (asked.display !== 'granted') return;
    }
    await LocalNotifications.schedule({
      notifications: notices.slice(0, 6).map((n, i) => ({ id: ID_ELECTROLYTE + i, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true }, extra: { tag: 'fast-electrolytes' } })),
    });
  } catch {
    // best effort
  }
};

const ID_WINDDOWN = 9910;

/** The nightly wind-down nudge (see lib/sleepPlan): a notification a little before bed that opens a short Breathe session. */
export const syncWindDown = async (on: boolean, hour: number, minute: number): Promise<void> => {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: ID_WINDDOWN }] });
    if (!on) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const asked = await LocalNotifications.requestPermissions();
      if (asked.display !== 'granted') return;
    }
    await LocalNotifications.schedule({
      notifications: [{ id: ID_WINDDOWN, title: 'Time to wind down', body: 'A few minutes of slow breathing will ease you toward sleep. Tap to start.', schedule: { on: { hour, minute }, allowWhileIdle: true }, extra: { tag: 'winddown' } }],
    });
  } catch {
    // best effort
  }
};

export const isNativeApp = isNative;