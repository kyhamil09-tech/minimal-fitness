import React, { useEffect, useRef, useState } from 'react';

/** How long the glow stays up after a tab change, and how long it takes to fade away (matches the CSS). */
const BURST_MS = 5200;
const FADE_OUT_MS = 2000;

interface BatteryManagerLike {
  level: number;
  charging: boolean;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
}

/** True when the battery is at 20% or less and not charging (where supported). */
const useLowBattery = (): boolean => {
  const [low, setLow] = useState(false);
  useEffect(() => {
    let manager: BatteryManagerLike | null = null;
    let cancelled = false;
    const update = () => manager && setLow(manager.level <= 0.2 && !manager.charging);
    try {
      const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
      void nav
        .getBattery?.()
        .then((m) => {
          if (cancelled) return;
          manager = m;
          update();
          m.addEventListener('levelchange', update);
          m.addEventListener('chargingchange', update);
        })
        .catch(() => undefined);
    } catch {
      // battery status unavailable
    }
    return () => {
      cancelled = true;
      manager?.removeEventListener('levelchange', update);
      manager?.removeEventListener('chargingchange', update);
    };
  }, []);
  return low;
};

/**
 * A very soft, slowly drifting glow in the theme colours behind the screens.
 *
 * - `tabs`: fades in on every tab change, drifts for a few seconds, fades out and removes itself.
 * - `always`: stays on, drifting slowly with a reduced update rate. Falls back to `tabs` on a low battery.
 *
 * Only transform and opacity ever animate, so it never repaints. It is hidden during a live workout
 * (see index.css) and is not rendered at all when the glow is off or Reduce motion is on.
 */
export const AuroraGlow: React.FC<{ mode: 'off' | 'tabs' | 'always'; burstKey: number; still?: boolean }> = ({ mode, burstKey, still }) => {
  const lowBattery = useLowBattery();
  // Liquid glass needs colour behind it: when the glow is off it shows a still, non-moving version (no battery cost).
  const effective: 'off' | 'tabs' | 'always' | 'still' = mode === 'off' && still ? 'still' : mode === 'always' && lowBattery ? 'tabs' : mode;
  const [mounted, setMounted] = useState(false);
  const [on, setOn] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    clear();
    let cancelled = false;
    const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    const fadeOut = () => {
      setOn(false);
      later(() => setMounted(false), FADE_OUT_MS + 150);
    };
    if (effective === 'off') {
      fadeOut();
    } else {
      setMounted(true);
      // Two frames so the element is painted at opacity 0 first and the fade-in actually transitions.
      requestAnimationFrame(() => requestAnimationFrame(() => !cancelled && setOn(true)));
      if (effective === 'tabs') later(fadeOut, BURST_MS);
    }
    return () => {
      cancelled = true;
      clear();
    };
  }, [effective, burstKey]);

  if (!mounted) return null;
  return (
    <div
      className={`aurora ${effective === 'always' ? 'aurora-always' : effective === 'still' ? 'aurora-still' : 'aurora-burst'}`}
      data-on={on}
      aria-hidden="true"
    >
      <i className="blob b1" />
      <i className="blob b2" />
      <i className="blob b3" />
      <i className="blob b4" />
      <i className="ribbon r1" />
      <i className="ribbon r2" />
      <i className="dust d1" />
      <i className="dust d2" />
    </div>
  );
};
