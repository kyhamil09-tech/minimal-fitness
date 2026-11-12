import React, { useEffect, useRef, useState } from 'react';
import { BreathPattern, PHASE_WORDS, circleScale, phaseAt } from '../lib/breathing';

/** The glowing circle that grows as you breathe in and shrinks as you breathe out, with softer rings that follow it. */
export const Orb: React.FC<{
  pattern: BreathPattern;
  /** Seconds into the session. */
  t: number;
  hue: string;
  size: number;
  reduce?: boolean;
  /** 0 to 1 around the outside, for how far through the session you are. Left out in previews. */
  progress?: number;
  /** The text in the middle: the phase and the seconds left in it. */
  label?: boolean;
}> = ({ pattern, t, hue, size, reduce = false, progress, label = true }) => {
  const pt = phaseAt(pattern, t);
  const s = reduce ? 0.75 : circleScale(pattern, t);
  const R = size / 2 - 6;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${PHASE_WORDS[pt.kind]}, ${pt.left}`}>
      {progress !== undefined && (
        <svg className="absolute inset-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="3" />
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={hue} strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, progress))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </svg>
      )}
      {[1.12, 0.96].map((k, i) => (
        <div
          key={k}
          className="absolute rounded-full"
          aria-hidden="true"
          style={{
            inset: size * 0.08,
            border: `1.5px solid ${hue}`,
            opacity: 0.16 + i * 0.1,
            transform: `scale(${Math.max(0.3, s * k - 0.02)})`,
          }}
        />
      ))}
      <div
        className="absolute rounded-full"
        aria-hidden="true"
        style={{
          inset: size * 0.08,
          background: `radial-gradient(circle at 50% 38%, ${hue}cc 0%, ${hue}55 48%, ${hue}1a 78%)`,
          boxShadow: `0 0 ${Math.round(20 + 60 * s)}px ${hue}66, inset 0 0 ${Math.round(18 + 30 * s)}px ${hue}44`,
          transform: `scale(${s})`,
        }}
      />
      {label && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
          <div className="text-xl font-extrabold tracking-wide" style={{ color: '#fff', textShadow: '0 1px 12px rgba(0,0,0,0.4)' }}>
            {PHASE_WORDS[pt.kind]}
          </div>
          <div className="mt-0.5 text-4xl font-black tabular-nums" style={{ color: '#fff', textShadow: '0 1px 12px rgba(0,0,0,0.4)' }}>
            {pt.left}
          </div>
        </div>
      )}
    </div>
  );
};

/** A clock that runs while `running`, about thirty times a second, from the moment it started. Returns seconds. */
export const useBreathClock = (running: boolean, resetKey: unknown = 0): number => {
  const [t, setT] = useState(0);
  const base = useRef(0);
  const startAt = useRef(0);
  useEffect(() => {
    base.current = 0;
    setT(0);
  }, [resetKey]);
  useEffect(() => {
    if (!running) return undefined;
    startAt.current = performance.now();
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 33) return;
      last = ts;
      setT(base.current + (performance.now() - startAt.current) / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      base.current += (performance.now() - startAt.current) / 1000;
    };
  }, [running]);
  return t;
};
