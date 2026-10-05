import React, { useEffect, useRef, useState } from 'react';

/** A number that counts up to its value in a short ease-out the first time it shows, and glides when it changes. */
export const CountUp: React.FC<{ value: number; ms?: number; format?: (n: number) => string }> = ({ value, ms = 700, format }) => {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    // Respect Reduce motion: no counting, just the number.
    if (document.documentElement.classList.contains('reduce-motion') || !Number.isFinite(value)) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      const v = a + (value - a) * e;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  const n = Math.round(shown);
  return <>{format ? format(n) : n.toLocaleString()}</>;
};
