import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, X } from 'lucide-react';
import { useBack, useInertPage } from '../lift/back';
import { Plate } from './model';

/** The full-screen frame of the Eat side: a deep plum look with pomegranate and champagne, above everything else in the app. */
export const EatShell: React.FC<{ label: string; look?: Record<string, string>; mode?: string; children: React.ReactNode }> = ({ label, look = {}, mode = 'dark', children }) => {
  useInertPage(true);
  return createPortal(
    <div className="ea" data-mode={mode} role="dialog" aria-modal="true" aria-label={label} style={look}>
      {children}
    </div>,
    document.body
  );
};

export const EaHeader: React.FC<{ title?: string; onBack?: () => void; backLabel?: string; right?: React.ReactNode }> = ({ title, onBack, backLabel = 'Back', right }) => (
  <div className="ea-header">
    <div className="flex min-w-0 items-center gap-1">
      {onBack && (
        <button type="button" className="ea-iconbtn -ml-2" onClick={onBack} aria-label={backLabel}>
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </button>
      )}
      {title && <div className="ea-brand truncate">{title}</div>}
    </div>
    <div className="flex shrink-0 items-center gap-1">{right}</div>
  </div>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode; eyebrow?: string }> = ({ children, right, eyebrow }) => (
  <div className="mb-2.5 mt-7 flex items-end justify-between gap-3 px-1">
    <div>
      {eyebrow && <div className="ea-eyebrow">{eyebrow}</div>}
      <h2 className="ea-h2">{children}</h2>
    </div>
    {right}
  </div>
);

/** A thin gold rule with a small diamond: the quiet separator the app uses instead of boxes. */
export const Ornament: React.FC = () => <div className="ea-orn" aria-hidden="true" />;

export const EaToggle: React.FC<{ label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, sub, on, onChange }) => (
  <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="ea-toggle">
    <span className="min-w-0">
      <span className="block text-sm font-semibold">{label}</span>
      {sub && <span className="ea-dim block text-xs">{sub}</span>}
    </span>
    <span className="ea-switch" data-on={on} aria-hidden="true">
      <span />
    </span>
  </button>
);

/** A panel that slides up inside the Eat app. Back and the close button dismiss it. */
export const Sheet: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ open, onClose, title, children }) => {
  useBack(open, onClose);
  if (!open) return null;
  return (
    <div className="ea-sheet-back" onClick={onClose}>
      <div className="ea-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="ea-grabber" aria-hidden="true" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="ea-h2 !text-xl">{title}</h2>
          <button type="button" className="ea-iconbtn -mr-2" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="ea-sheet-body">{children}</div>
      </div>
    </div>
  );
};

const SIZE = 236;
const C = SIZE / 2;
const R = 98;
const CIRC = 2 * Math.PI * R;
const R2 = 82;
const CIRC2 = 2 * Math.PI * R2;
const COLORS = { p: 'var(--ea-p)', c: 'var(--ea-c)', f: 'var(--ea-f)' } as const;

/**
 * The plate: a ring that fills with the day's calories in the colors of protein, carbs and fat, a thinner champagne ring inside it that
 * grows if the day goes past its plan, and the number that matters in the middle (children).
 */
export const PlateRing: React.FC<{ plate: Plate; label: string; children: React.ReactNode }> = ({ plate, label, children }) => (
  <div className="ea-plate" style={{ width: SIZE, height: SIZE }}>
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label}>
      <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(var(--ea-tint),0.09)" strokeWidth="16" />
      {plate.segments.map((s) => {
        const len = Math.max(0, (s.to - s.from) * CIRC);
        return (
          <circle
            key={s.key}
            className="ea-seg"
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke={COLORS[s.key]}
            strokeWidth="16"
            strokeDasharray={`${len} ${CIRC - len}`}
            strokeDashoffset={-s.from * CIRC}
            transform={`rotate(-90 ${C} ${C})`}
          />
        );
      })}
      <circle cx={C} cy={C} r={R2} fill="none" stroke="rgba(var(--ea-gold-rgb),0.10)" strokeWidth="4" />
      {plate.over > 0 && (
        <circle
          className="ea-seg"
          cx={C}
          cy={C}
          r={R2}
          fill="none"
          stroke="var(--ea-c)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${plate.over * CIRC2} ${CIRC2}`}
          transform={`rotate(-90 ${C} ${C})`}
        />
      )}
      <circle cx={C} cy={C} r="70" fill="var(--ea-plate)" stroke="rgba(var(--ea-gold-rgb),0.28)" strokeWidth="1" />
      <circle cx={C} cy={C} r="62" fill="none" stroke="rgba(var(--ea-gold-rgb),0.10)" strokeWidth="1" />
    </svg>
    <div className="ea-plate-mid">{children}</div>
  </div>
);

export const MacroBar: React.FC<{ label: string; value: number; target: number; unit?: string; color: string }> = ({ label, value, target, unit = 'g', color }) => {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = target > 0 && value > target;
  return (
    <div className="ea-macro">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="ea-dim tabular-nums text-xs">
          <span style={{ color: over ? 'var(--ea-c)' : 'var(--ea-text)' }} className="font-bold">
            {Math.round(value)}
          </span>
          {target > 0 ? ` / ${Math.round(target)}` : ''} {unit}
        </span>
      </div>
      <div className="ea-track" aria-hidden="true">
        <div className="ea-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
};

export const num = (n: number): string => Math.round(n).toLocaleString();

export const timeOfDay = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** The current time, refreshed every `ms`. */
export const useNow = (ms = 60_000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
};

/** "13h 05m" for a number of hours. */
export const hoursText = (hours: number): string => {
  const total = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
};
