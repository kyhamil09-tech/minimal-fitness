import { useEffect, useRef } from 'react';
import { ReminderSettings, WaterEntry, Goals } from '../types/tracking';
import { FastingSession } from '../types/health';
import { isNativeApp, notify, syncScheduledReminders } from '../lib/notifications';
import { todayKey } from '../lib/dates';
import { readStored } from './usePersistentState';

interface Args {
  settings: ReminderSettings;
  water: WaterEntry[];
  goals: Goals;
  fastingSessions?: FastingSession[];
}

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Fires reminders while the app is open (or installed and running in the background).
 * A web app cannot be woken by the OS on a schedule without a push server, so these
 * are best-effort and intentionally local-only.
 */
export function useReminders({ settings, water, goals, fastingSessions = [] }: Args) {
  const fired = useRef<Record<string, string>>({});
  const lastHydration = useRef<number>(Date.now());
  const waterRef = useRef({ water, goals });
  waterRef.current = { water, goals };

  // In the Android app the reminders are handed to Android's scheduler, so they fire with the app closed.
  const activeFast = fastingSessions.find((s) => !s.isCompleted);
  const fastEndsAt = activeFast ? activeFast.startTimestamp + activeFast.targetDurationHours * 3600_000 : null;
  const fastGoal = activeFast?.targetDurationHours ?? 0;
  useEffect(() => {
    if (!isNativeApp()) return;
    void syncScheduledReminders({
      workoutEnabled: settings.workoutEnabled,
      workoutTime: settings.workoutTime,
      bedtimeEnabled: settings.bedtimeEnabled,
      bedtimeTime: settings.bedtimeTime,
      hydrationEnabled: settings.hydrationEnabled,
      hydrationEveryMin: settings.hydrationEveryMin,
      fastingEnabled: settings.fastingEnabled,
      fastEndsAt,
      fastGoalHours: fastGoal,
    });
  }, [settings, fastEndsAt, fastGoal]);

  useEffect(() => {
    // The browser version still fires reminders itself while the page is open.
    if (isNativeApp()) return;
    const once = (id: string, stamp: string, fn: () => void) => {
      if (fired.current[id] === stamp) return;
      fired.current[id] = stamp;
      fn();
    };

    const tick = () => {
      const now = new Date();
      const day = todayKey();
      const clock = hhmm(now);

      if (settings.workoutEnabled && clock === settings.workoutTime) {
        once('workout', `${day}-${clock}`, () =>
          notify('Time to move', 'Your scheduled workout starts now.', 'workout')
        );
      }
      if (settings.bedtimeEnabled && clock === settings.bedtimeTime) {
        once('bedtime', `${day}-${clock}`, () =>
          notify('Wind down', 'Bedtime is coming up. Put the screens away.', 'bedtime')
        );
      }

      if (settings.hydrationEnabled) {
        const h = now.getHours();
        const sinceMin = (Date.now() - lastHydration.current) / 60000;
        if (h >= 8 && h < 21 && sinceMin >= settings.hydrationEveryMin) {
          lastHydration.current = Date.now();
          const { water: w, goals: g } = waterRef.current;
          const drunk = w.filter((e) => e.date === day).reduce((s, e) => s + e.ml, 0);
          if (drunk < g.dailyWaterMl) {
            notify(
              'Drink some water',
              `${Math.round(drunk)} of ${g.dailyWaterMl} ml so far today.`,
              'hydration'
            );
          }
        }
      }

      if (settings.fastingEnabled) {
        const sessions = readStored<FastingSession[]>('fasting_sessions', []);
        const active = sessions.find((s) => !s.isCompleted);
        if (active) {
          const hours = (Date.now() - active.startTimestamp) / 3600000;
          if (hours >= active.targetDurationHours) {
            once('fast-' + active.id, active.id, () =>
              notify('Fast complete', `You reached your ${active.targetDurationHours}h goal.`, 'fasting')
            );
          }
        }
      }
    };

    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [settings]);
}
