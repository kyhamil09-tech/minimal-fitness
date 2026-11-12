import React, { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';

/** The five heart-rate zones as the live screen shows them: a color that means the zone and nothing else. */
export const ZONE_COLORS: Record<number, string> = { 1: '#94A3B8', 2: '#00E5FF', 3: '#10B981', 4: '#FF5500', 5: '#F43F5E' };

interface ZoneProps {
  bpm: number | null;
  zone: number;
  name: string;
  /** Whether a live sensor is giving the reading. */
  live: boolean;
}

/** Heart rate with its zone: the number, a zone label in the zone's color, and a five-part track that fills up to the zone. */
export const ZoneRibbon: React.FC<ZoneProps> = ({ bpm, zone, name, live }) => {
  const color = live ? ZONE_COLORS[zone] ?? ZONE_COLORS[1] : '#52525B';
  return (
    <div className="rounded-2xl border p-3.5" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }} aria-label={live ? `Heart rate ${bpm} beats per minute, zone ${zone}, ${name}` : 'Heart rate: no sensor connected'}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Heart className={`h-4 w-4 ${live ? 'animate-pulse' : ''}`} style={{ color, fill: color }} aria-hidden="true" />
          <span className="hero-num text-[2rem] leading-none">{live && bpm ? bpm : '--'}</span>
          <span className="text-xs font-bold uppercase tracking-wider text-[#A1A1AA]">bpm</span>
        </div>
        <span className="rounded-md px-2 py-1 text-xs font-extrabold uppercase tracking-wider" style={{ backgroundColor: color, color: live ? '#09090B' : '#D4D4D8' }}>
          {live ? `Z${zone} · ${name}` : 'No sensor'}
        </span>
      </div>
      <div className="grid h-2 w-full grid-cols-5 gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((z) => (
          <div key={z} className="h-full rounded-full transition-opacity duration-500" style={{ backgroundColor: ZONE_COLORS[z], opacity: live && zone >= z ? 1 : 0.18 }} />
        ))}
      </div>
    </div>
  );
};

/** How far through the current mile or kilometer you are, as a bar. */
export const SplitRuler: React.FC<{ fraction: number; label: string }> = ({ fraction, label }) => {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <div className="mx-auto mt-4 w-full max-w-xs" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="mb-1.5 flex justify-between text-xs font-bold uppercase tracking-wider text-[#A1A1AA]">
        <span>{label}</span>
        <span className="text-white">{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full p-0.5" style={{ backgroundColor: 'var(--card-2)' }}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--accent), #FFB300)' }} />
      </div>
    </div>
  );
};

/** One number with a label above it, in a carbon card. */
export const LiveStat: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
  <div className="rounded-2xl border px-3.5 py-3" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }}>
    <div className="text-xs font-bold uppercase tracking-wider text-[#A1A1AA]">{label}</div>
    <div className="hero-num mt-1 text-[2.1rem] leading-none">{value}</div>
    {sub && <div className="mt-1 text-xs font-semibold text-[#A1A1AA]">{sub}</div>}
  </div>
);

interface HoldProps {
  /** Called once the button has been held for `ms`. A keyboard or screen-reader activation does it at once. */
  onHold: () => void;
  ms?: number;
  label: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  children: React.ReactNode;
  /** The ring that fills while held. */
  ringColor?: string;
}

/**
 * A button you press and hold, with a ring that fills while you do, so it cannot be set off by a stray touch (finishing a run, unlocking
 * the screen). Activating it from a keyboard or a screen reader acts at once, since holding is not possible there.
 */
export const HoldButton: React.FC<HoldProps> = ({ onHold, ms = 800, label, className, style, disabled, children, ringColor = 'currentColor' }) => {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const stop = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const start = () => {
    if (disabled) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      onHold();
    }, ms);
  };
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={`relative ${className ?? ''}`}
      style={style}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // A real touch or click has pointer events (handled above); a keyboard or assistive-technology activation has none.
        if (e.detail === 0 && !disabled) onHold();
      }}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="none" stroke={ringColor} strokeWidth="5" strokeLinecap="round" strokeDasharray="289" strokeDashoffset={holding ? 0 : 289} style={{ transition: holding ? `stroke-dashoffset ${ms}ms linear` : 'stroke-dashoffset 0.2s ease-out', opacity: holding ? 1 : 0 }} />
      </svg>
      {children}
    </button>
  );
};
