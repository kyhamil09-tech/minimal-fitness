import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

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

export const isNativeApp = isNative;