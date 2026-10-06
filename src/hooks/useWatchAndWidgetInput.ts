import { Dispatch, MutableRefObject, SetStateAction, useEffect } from 'react';
import { FastingSession, TabId, WorkoutSession, WorkoutType } from '../types/health';
import { UserProfile } from '../types/tracking';
import { Launch, isAndroidApp } from '../lib/native';
import { endFast, lastProtocol, startFast } from '../lib/fasting';
import { WatchWorkoutPayload, fillTrackFromWatch, mergeWatchWorkouts, watchWorkoutToSession } from '../lib/watchImport';

/**
 * What the home-screen widgets and notifications ask the app to do. A button on a widget opens the app with an action, and this
 * carries it out: start a workout, open a tab, or start or end a fast. Does nothing in a browser.
 */
export function useWidgetLaunchActions(opts: {
  setCurrentTab: (tab: TabId) => void;
  setLaunchRequest: (r: { type: WorkoutType; nonce: number }) => void;
  setFastingSessions: Dispatch<SetStateAction<FastingSession[]>>;
}) {
  const { setCurrentTab, setLaunchRequest, setFastingSessions } = opts;
  // A home-screen widget button can open the app straight into a workout.
  useEffect(() => {
    if (!isAndroidApp()) return;
    const collect = async () => {
      try {
        const { action } = await Launch.getPendingAction();
        const type = action?.startsWith('start:') ? (action.slice(6) as WorkoutType) : null;
        if (type) {
          setCurrentTab('exercise');
          setLaunchRequest({ type, nonce: Date.now() });
        } else if (action === 'open:water') {
          // The water widget: open Food & water.
          setCurrentTab('nutrition');
        } else if (action === 'open:fasting' || action === 'fast:start' || action === 'fast:end') {
          // The fasting widget and notification: open the tab, and start or end the fast when a button asked for it.
          setCurrentTab('fasting');
          if (action === 'fast:start') {
            setFastingSessions((prev) => {
              if (prev.some((s) => !s.isCompleted)) return prev;
              const next = lastProtocol(prev);
              return startFast(prev, { targetHours: next.hours, protocolName: next.name });
            });
          } else if (action === 'fast:end') {
            setFastingSessions((prev) => endFast(prev));
          }
        }
      } catch {
        // widget bridge unavailable
      }
    };
    collect();
    const onVisible = () => document.visibilityState === 'visible' && collect();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Workouts the watch recorded arrive over Bluetooth: ones recorded on its own (phone left behind) are added to the log, and the
 * route of one both devices recorded fills gaps in the phone's route.
 */
export function useWatchWorkoutImport(opts: {
  profile: UserProfile;
  workoutsRef: MutableRefObject<WorkoutSession[]>;
  setWorkouts: Dispatch<SetStateAction<WorkoutSession[]>>;
  /** Saves workouts to Health Connect (a ref, because this runs on a timer and needs the newest version). */
  sendToHcRef: MutableRefObject<(list: WorkoutSession[]) => Promise<number>>;
}) {
  const { profile, workoutsRef, setWorkouts, sendToHcRef } = opts;
  useEffect(() => {
    if (!isAndroidApp() || !profile.onboarded) return;
    const importNow = async () => {
      try {
        const { items } = await Launch.getWatchWorkouts();
        if (items.length === 0) return;
        const sessions: WorkoutSession[] = [];
        const done: string[] = [];
        for (const raw of items) {
          try {
            const payload = JSON.parse(raw) as WatchWorkoutPayload;
            if (payload.shared) {
              // The watch's route for a workout the phone recorded too: fill gaps in the phone's route with it.
              const fill = fillTrackFromWatch(workoutsRef.current, payload);
              if (fill.filled > 0) setWorkouts(fill.workouts);
              // The phone may not have saved its copy yet: try again on the next check, for up to half an hour.
              if (fill.matched || Date.now() - (payload.startedAt + payload.durationSec * 1000) > 30 * 60_000) done.push(String(payload.id));
              continue;
            }
            const session = watchWorkoutToSession(payload, profile);
            if (session) sessions.push(session);
            done.push(String(payload.id));
          } catch {
            // a corrupt file is skipped
          }
        }
        if (sessions.length > 0) {
          setWorkouts((prev) => mergeWatchWorkouts(prev, sessions));
          // Workouts the watch recorded on its own are not in Health Connect yet.
          void sendToHcRef.current(sessions);
        }
        if (done.length > 0) await Launch.ackWatchWorkouts({ ids: done });
      } catch {
        // bridge unavailable
      }
    };
    importNow();
    const timer = setInterval(importNow, 120_000);
    const onVisible = () => document.visibilityState === 'visible' && importNow();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.onboarded]);
}
