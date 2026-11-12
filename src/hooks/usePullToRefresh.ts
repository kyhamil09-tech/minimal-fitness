import { RefObject, useEffect, useRef, useState } from 'react';

/** How far the finger has to pull, in pixels after the drag is eased, before letting go refreshes. */
export const PULL_TRIGGER = 64;
const PULL_MAX = 96;
/** Touches that start on these are never a pull: they are dragging a map, a slider or a field. */
const IGNORE = '.leaflet-container, canvas, input, textarea, select, [data-no-pull]';

export interface PullState {
  /** How far the indicator is pulled down, 0 when idle. */
  pull: number;
  /** True while the refresh itself is running. */
  busy: boolean;
}

/**
 * Pull-to-refresh for a scrolling box: drag down while it is scrolled to the very top, let go past the trigger distance, and
 * `onRefresh` runs. Drags that begin on a map, a field or a slider are left alone, and so is anything that is not a clean
 * downward pull. The page keeps its own overscroll glow off while pulling (the touchmove is cancelled only for a real pull).
 */
export const usePullToRefresh = (box: RefObject<HTMLElement | null>, onRefresh: () => Promise<unknown> | void, enabled = true): PullState => {
  const [state, setState] = useState<PullState>({ pull: 0, busy: false });
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  const busyRef = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (!el || !enabled) return undefined;
    let startY = 0;
    let startX = 0;
    let tracking = false;
    let pulling = false;
    let current = 0;

    const reset = () => {
      tracking = false;
      pulling = false;
      current = 0;
      setState((s) => (s.pull === 0 ? s : { ...s, pull: 0 }));
    };

    const onStart = (e: TouchEvent) => {
      tracking = false;
      pulling = false;
      if (busyRef.current || e.touches.length !== 1 || el.scrollTop > 0) return;
      const target = e.target as Element | null;
      if (target?.closest?.(IGNORE)) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      tracking = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (!pulling) {
        // Wait for a clearly downward drag, so sideways swipes between tabs and ordinary scrolling are not disturbed.
        if (dy < 10 || dx > dy * 0.8 || el.scrollTop > 0) {
          if (dy < -4 || el.scrollTop > 0) tracking = false;
          return;
        }
        pulling = true;
      }
      if (el.scrollTop > 0) {
        reset();
        return;
      }
      // Eased: the further you pull, the harder it resists.
      current = Math.min(PULL_MAX, dy * 0.5);
      if (e.cancelable) e.preventDefault();
      setState({ pull: current, busy: false });
    };

    const onEnd = async () => {
      if (!pulling) {
        tracking = false;
        return;
      }
      const go = current >= PULL_TRIGGER;
      tracking = false;
      pulling = false;
      if (!go) {
        reset();
        return;
      }
      busyRef.current = true;
      setState({ pull: PULL_TRIGGER * 0.75, busy: true });
      const started = Date.now();
      try {
        await refresh.current();
      } catch {
        // a failed refresh just stops; the screens keep showing what they had
      }
      // Show the spinner long enough to be seen, even when the refresh was instant.
      const left = 700 - (Date.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      busyRef.current = false;
      setState({ pull: 0, busy: false });
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', reset);
    };
  }, [box, enabled]);

  return state;
};
