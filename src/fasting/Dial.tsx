import React from 'react';
import { hoursText, hms, ink } from './ui';

const TAU = Math.PI * 2;

/** An angle for a time of day: midnight at the top, going clockwise. */
const angleOf = (ms: number): number => {
  const d = new Date(ms);
  return ((d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60) / 1440) * TAU - Math.PI / 2;
};

const pt = (cx: number, cy: number, r: number, a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });

/** An arc along the ring between two angles going clockwise (a full lap when they are a day apart). */
const arc = (cx: number, cy: number, r: number, from: number, sweep: number): string => {
  const s = Math.min(sweep, TAU - 0.0001);
  if (s <= 0) return '';
  const a = pt(cx, cy, r, from);
  const b = pt(cx, cy, r, from + s);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${s > Math.PI ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
};

export interface DialProps {
  size?: number;
  now: number;
  hue: string;
  /** A running fast. */
  fast?: { start: number; targetHours: number } | null;
  /** The eating window of the plan, drawn as a pale arc, when no fast is running. */
  window?: { start: number; end: number } | null;
  /** The text under the clock. */
  caption?: string;
  /** Hide the numbers (gentle mode shows the times but not the percentage). */
  percent?: boolean;
}

/**
 * The clock face for a fast. The outer ring is the 24-hour day with midnight at the top; the running fast is an arc that grows from the
 * moment it began, with a mark where the goal falls. With no fast, the eating window of the plan is shown instead. In the middle, the
 * elapsed time in a serif face, and the goal.
 */
export const Dial: React.FC<DialProps> = ({ size = 300, now, hue, fast, window: eat, caption, percent = true }) => {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 16;
  const stroke = 14;
  const elapsedMs = fast ? Math.max(0, now - fast.start) : 0;
  const hours = elapsedMs / 3_600_000;
  const pct = fast ? Math.round((hours / fast.targetHours) * 100) : 0;
  const ticks = Array.from({ length: 24 }, (_, h) => h);
  const startA = fast ? angleOf(fast.start) : 0;
  const sweepNow = (Math.min(hours, 24) / 24) * TAU;
  const targetSweep = fast ? (Math.min(fast.targetHours, 24) / 24) * TAU : 0;
  const flag = fast ? pt(cx, cy, R, startA + targetSweep) : null;
  const nowA = angleOf(now);
  const head = pt(cx, cy, R, nowA);
  const over = fast ? hours >= fast.targetHours : false;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }} role="img" aria-label={fast ? `Fasting for ${hoursText(hours)} of ${fast.targetHours} hours` : 'No fast running'}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(var(--fa-tint),0.08)" strokeWidth={stroke} />
        {ticks.map((h) => {
          const a = (h / 24) * TAU - Math.PI / 2;
          const major = h % 6 === 0;
          const p1 = pt(cx, cy, R - stroke / 2 - 3, a);
          const p2 = pt(cx, cy, R - stroke / 2 - (major ? 11 : 6), a);
          return <line key={h} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={major ? 'rgba(var(--fa-tint),0.55)' : 'rgba(var(--fa-tint),0.22)'} strokeWidth={major ? 2 : 1} />;
        })}
        {[0, 6, 12, 18].map((h) => {
          const p = pt(cx, cy, R - stroke / 2 - 24, (h / 24) * TAU - Math.PI / 2);
          return (
            <text key={h} x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fill="rgba(var(--fa-tint),0.6)">
              {h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}
            </text>
          );
        })}
        {fast && <path d={arc(cx, cy, R, startA, targetSweep)} fill="none" stroke={hue} strokeOpacity="0.22" strokeWidth={stroke} strokeLinecap="round" />}
        {fast && <path d={arc(cx, cy, R, startA, sweepNow)} fill="none" stroke={hue} strokeWidth={stroke} strokeLinecap="round" />}
        {!fast && eat && <path d={arc(cx, cy, R, angleOf(eat.start), ((eat.end - eat.start) / 86_400_000) * TAU)} fill="none" stroke="var(--fa-cream)" strokeOpacity="0.5" strokeWidth={stroke} strokeLinecap="round" />}
        {flag && (
          <g>
            <circle cx={flag.x} cy={flag.y} r="7" fill="var(--fa-flag)" stroke={over ? 'var(--fa-good)' : 'var(--fa-cream)'} strokeWidth="2" />
            <circle cx={flag.x} cy={flag.y} r="2.5" fill={over ? 'var(--fa-good)' : 'var(--fa-cream)'} />
          </g>
        )}
        <circle cx={head.x} cy={head.y} r="6" fill="var(--fa-cream)" stroke="var(--fa-flag)" strokeWidth="2.5" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {fast ? (
          <>
            <div className="fa-serif text-[2.6rem] leading-none" style={{ textShadow: `0 0 26px ${hue}55` }}>
              {hms(elapsedMs)}
            </div>
            <div className="fa-dim mt-1.5 text-xs">
              {over ? 'goal reached' : `of ${fast.targetHours} h goal`}
              {percent && ` · ${pct}%`}
            </div>
          </>
        ) : (
          <>
            <div className="fa-serif text-3xl leading-none">Ready</div>
            <div className="fa-dim mt-1.5 max-w-[11rem] text-xs">{caption ?? 'Start when you finish eating'}</div>
          </>
        )}
        {fast && caption && <div className="mt-1 max-w-[12rem] text-xs font-semibold" style={{ color: ink(hue) }}>{caption}</div>}
      </div>
    </div>
  );
};
