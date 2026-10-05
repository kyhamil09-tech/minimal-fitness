import { useEffect, useRef } from 'react';
import { WatchCommand, WatchHeartRate, WatchWorkoutState, isWatchSupported } from '../lib/watch';

const REFRESH_MS = 3000;

let discardNext = false;
/** Call just before ending a workout without saving it, so the watch discards its copy too. */
export const markWatchWorkoutDiscarded = () => {
  discardNext = true;
};

const send = (state: WatchWorkoutState, launch: boolean) => {
  WatchHeartRate.sendWorkoutState({ json: JSON.stringify(state), launch }).catch(() => {
    // No watch in range: the phone workout carries on by itself.
  });
};

/**
 * Mirrors the phone's live workout to the watch: pushes immediately when it starts, pauses,
 * resumes or changes, refreshes distance/pace/calories every few seconds, and tells the watch
 * when the workout is over. Pass `null` while no workout is running.
 *
 * `launch` should be true when the phone started the workout (it opens the watch app so the
 * watch can start its sensors); false when the watch started it and is already open.
 */
export function useWatchWorkoutSync(state: WatchWorkoutState | null, launch: boolean) {
  const latest = useRef(state);
  latest.current = state;
  const wasActive = useRef(false);
  const lastKey = useRef('');

  const active = state !== null;
  // Fields that change what the watch shows structurally; distance etc. ride the interval.
  const key = state
    ? `${state.type}|${state.startedAt}|${state.paused}|${state.pausedTotalMs}|${state.stepIndex ?? -1}|${state.stepsDone ?? false}|${state.alertText ?? ''}|${state.strength ? JSON.stringify(state.strength) : ''}`
    : '';

  useEffect(() => {
    if (!isWatchSupported()) return;
    if (state) {
      const first = !wasActive.current;
      if (first || key !== lastKey.current) send(state, first && launch);
      wasActive.current = true;
      lastKey.current = key;
    } else if (wasActive.current) {
      wasActive.current = false;
      lastKey.current = '';
      const wasDiscarded = discardNext;
      discardNext = false;
      send(
        {
          active: false,
          type: '',
          startedAt: 0,
          paused: false,
          pausedAt: 0,
          pausedTotalMs: 0,
          distanceText: '',
          distanceKm: 0,
          paceText: '',
          kcal: 0,
          maxHr: 0,
          canPause: false,
          miles: false,
          discarded: wasDiscarded,
        },
        false
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key]);

  useEffect(() => {
    if (!active || !isWatchSupported()) return;
    const id = setInterval(() => {
      if (latest.current) send(latest.current, false);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [active]);
}

/** Calls `handler` for every button pressed on the watch's workout screen. */
export function useWatchCommands(handler: (command: WatchCommand) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!isWatchSupported()) return;
    let cancelled = false;
    let remove: (() => Promise<void>) | undefined;
    WatchHeartRate.addListener('watchCommand', (c) => ref.current(c)).then((h) => {
      if (cancelled) h.remove();
      else remove = () => h.remove();
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);
}
