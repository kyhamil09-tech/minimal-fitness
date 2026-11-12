import { Dispatch, MutableRefObject, SetStateAction, useEffect, useRef } from 'react';
import { FastingSession, TabId, WorkoutSession, WorkoutType } from '../types/health';
import { UserProfile } from '../types/tracking';
import { Launch, isAndroidApp } from '../lib/native';
import { endFast, lastProtocol, startFast } from '../lib/fasting';
import { WatchHeartRate } from '../lib/watch';
import { WatchWorkoutPayload, fillTrackFromWatch, mergeWatchWorkouts, watchWorkoutToSession } from '../lib/watchImport';

/**
 * What the home-screen widgets and notifications ask the app to do. A button on a widget opens the app with an action, and this
 * carries it out: start a workout, open a tab, or start or end a fast. Does nothing in a browser.
 */
export function useWidgetLaunchActions(opts: {
  setCurrentTab: (tab: TabId) => void;
  setLaunchRequest: (r: { type: WorkoutType; nonce: number }) => void;
  setFastingSessions: Dispatch<SetStateAction<FastingSession[]>>;
  /** A launcher shortcut asked for a lifting workout: "lift:empty" or "lift:routine:<id>". */
  onLiftAction?: (action: string) => void;
  /** The Breathe tile, widget or shortcut: 'open', 'start' (your usual session) or 'drift' (the sleep one). */
  onBreathe?: (action: string) => void;
  /** The Fasting tile: 'toggle' starts your usual fast or ends the one running. */
  onFasting?: (action: string) => void;
  /** The Eat widget and tile: 'open:eat' opens Eat, 'eat:add' opens the food finder, 'eat:scan' the barcode scanner. */
  onEat?: (action: string) => void;
}) {
  const { setCurrentTab, setLaunchRequest, setFastingSessions } = opts;
  const liftAction = useRef(opts.onLiftAction);
  liftAction.current = opts.onLiftAction;
  const breatheAction = useRef(opts.onBreathe);
  breatheAction.current = opts.onBreathe;
  const fastingAction = useRef(opts.onFasting);
  fastingAction.current = opts.onFasting;
  const eatAction = useRef(opts.onEat);
  eatAction.current = opts.onEat;
  // Start or end a fast from the watch's home screen. The time is when it was pressed, not when the phone heard about it.
  useEffect(() => {
    if (!isAndroidApp()) return;
    let handle: { remove: () => Promise<void> } | undefined;
    let cancelled = false;
    WatchHeartRate.addListener('watchCommand', (c) => {
      if (c.cmd !== 'fast') return;
      const at = c.at && c.at > 0 && Math.abs(Date.now() - c.at) < 10 * 60_000 ? c.at : Date.now();
      if (c.action === 'start') {
        setFastingSessions((prev) => {
          if (prev.some((s) => !s.isCompleted)) return prev;
          const next = lastProtocol(prev);
          return startFast(prev, { targetHours: next.hours, protocolName: next.name, now: at });
        });
      } else if (c.action === 'end') {
        setFastingSessions((prev) => endFast(prev, at));
      }
    })
      .then((h) => (cancelled ? h.remove() : void (handle = h)))
      .catch(() => {});
    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, [setFastingSessions]);

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
        } else if (action?.startsWith('lift:')) {
          liftAction.current?.(action);
        } else if (action === 'open:run' || action === 'run:toggle') {
          // The Quick Settings tile while a run is recording opens the live screen; the notification's Pause / resume button also lands
          // here and is passed on to the Run screen once it has opened.
          setCurrentTab('exercise');
          if (action === 'run:toggle') window.setTimeout(() => window.dispatchEvent(new CustomEvent('kyfit-run-command', { detail: 'toggle' })), 400);
        } else if (action === 'fast:toggle') {
          fastingAction.current?.('toggle');
        } else if (action === 'open:breathe' || action === 'breathe:start' || action === 'breathe:drift') {
          breatheAction.current?.(action === 'open:breathe' ? 'open' : action === 'breathe:start' ? 'start' : 'drift');
        } else if (action === 'open:eat' || action === 'eat:add' || action === 'eat:scan') {
          eatAction.current?.(action);
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
