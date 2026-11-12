import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, X } from 'lucide-react';
import { useBack, useInertPage } from './back';
import { useLiftScheme } from './theme';

/** The Lift side's full-screen root. Drawn outside the main page, so the main app's themes and light-mode filter do not touch it. */
export const LiftShell: React.FC<{ label: string; children: React.ReactNode; z?: number }> = ({ label, children, z }) => {
  const scheme = useLiftScheme();
  useInertPage(true);
  return createPortal(
    <div className="lift" data-scheme={scheme} role="dialog" aria-modal="true" aria-label={label} style={z ? { zIndex: z } : undefined}>
      {children}
    </div>,
    document.body
  );
};

/** A bar across the top: an optional back arrow, a title, and actions on the right. */
export const Header: React.FC<{ title: string; onBack?: () => void; backLabel?: string; right?: React.ReactNode; sub?: string }> = ({ title, onBack, backLabel = 'Back', right, sub }) => (
  <div className="l-header">
    <div className="flex min-w-0 items-center gap-1">
      {onBack && (
        <button type="button" className="l-icon-btn -ml-1" onClick={onBack} aria-label={backLabel}>
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </button>
      )}
      <div className="min-w-0">
        <div className="truncate text-base font-bold">{title}</div>
        {sub && <div className="l-dim truncate text-xs">{sub}</div>}
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-1">{right}</div>
  </div>
);

/** A panel that slides up over the screen. The back button closes it. */
export const Sheet: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ open, onClose, title, children }) => {
  useBack(open, onClose);
  if (!open) return null;
  return (
    <div className="l-sheet-back" onClick={onClose}>
      <div className="l-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="l-grabber" aria-hidden="true" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button type="button" className="l-icon-btn -mr-2" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

/** A number with a small label under it. */
export const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
  <div className="min-w-0">
    <div className="l-stat-big truncate text-lg">{value}</div>
    <div className="l-dim truncate text-xs">{label}</div>
    {sub && <div className="l-dim truncate text-[11px]">{sub}</div>}
  </div>
);

export interface Point {
  label: string;
  value: number;
}

/**
 * A line chart you can touch: press or drag along it to read each point (date and value), and points that were records are ringed.
 * It still says what it shows to a screen reader, and the points are listed for them below.
 */
export const MiniLine: React.FC<{ points: Point[]; unit?: string; ariaLabel: string; format?: (v: number) => string; records?: number[] }> = ({ points, unit = '', ariaLabel, format, records = [] }) => {
  const W = 320;
  const H = 120;
  const PAD = 10;
  const [at, setAt] = React.useState<number | null>(null);
  if (points.length < 2) return <p className="l-dim py-6 text-center text-sm">Two sessions draw the chart.</p>;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const fmt = format ?? ((v: number) => String(Math.round(v * 10) / 10));
  const last = points[points.length - 1];
  const shown = at ?? points.length - 1;
  const sel = points[shown];
  const isRecord = records.includes(shown);
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setAt(Math.max(0, Math.min(points.length - 1, Math.round(((px - PAD) / (W - PAD * 2)) * (points.length - 1)))));
  };
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between" aria-live="polite">
        <span className="text-lg font-bold tabular-nums">
          {fmt(sel.value)}
          {unit}
        </span>
        <span className="l-dim text-xs">
          {sel.label}
          {isRecord ? ' · record' : ''}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ touchAction: 'pan-y' }}
        role="img"
        aria-label={`${ariaLabel}. Latest ${fmt(last.value)}${unit}, from ${fmt(points[0].value)}${unit}.`}
        onPointerDown={pick}
        onPointerMove={(e) => {
          if (e.buttons || e.pointerType === 'touch') pick(e);
        }}
        onPointerLeave={() => setAt(null)}
      >
        <defs>
          <linearGradient id="l-line-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--l-accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--l-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L${x(points.length - 1).toFixed(1)} ${H - PAD} L${x(0).toFixed(1)} ${H - PAD} Z`} fill="url(#l-line-fill)" stroke="none" />
        <path d={path} fill="none" stroke="var(--l-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {at !== null && <line x1={x(at)} x2={x(at)} y1={PAD} y2={H - PAD} stroke="var(--l-line)" strokeWidth="1.5" strokeDasharray="3 3" />}
        {points.map((p, i) => (
          <g key={i}>
            {records.includes(i) && <circle cx={x(i)} cy={y(p.value)} r="7" fill="none" stroke="var(--l-accent)" strokeWidth="1.5" />}
            <circle cx={x(i)} cy={y(p.value)} r={i === shown ? 5 : 2.5} fill="var(--l-accent)" />
          </g>
        ))}
      </svg>
      <div className="l-dim mt-1 flex justify-between text-[11px]">
        <span>{points[0].label}</span>
        <span>
          {fmt(lo)}–{fmt(hi)}
          {unit}
        </span>
        <span>{last.label}</span>
      </div>
      {records.length > 0 && (
        <div className="l-dim mt-1 flex items-center gap-1.5 text-[11px]">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--l-accent)" strokeWidth="1.5" />
            <circle cx="7" cy="7" r="2.5" fill="var(--l-accent)" />
          </svg>
          A ringed point was a new best
        </div>
      )}
    </div>
  );
};

/** Vertical bars with a label under each. */
export const MiniBars: React.FC<{ bars: { label: string; value: number }[]; ariaLabel: string }> = ({ bars, ariaLabel }) => {
  const top = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div role="img" aria-label={`${ariaLabel}: ${bars.map((b) => `${b.label} ${b.value}`).join(', ')}`}>
      <div className="flex h-24 items-end gap-2" aria-hidden="true">
        {bars.map((b, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end">
            <div className="text-[11px] font-semibold tabular-nums">{b.value || ''}</div>
            <div className="w-full rounded-t-lg" style={{ height: `${Math.max(3, (b.value / top) * 72)}px`, background: b.value ? 'linear-gradient(180deg, var(--l-accent), color-mix(in srgb, var(--l-accent) 45%, transparent))' : 'var(--l-s2)' }} />
          </div>
        ))}
      </div>
      <div className="l-dim mt-1 flex gap-2 text-[11px]" aria-hidden="true">
        {bars.map((b, i) => (
          <div key={i} className="flex-1 text-center">
            {b.label}
          </div>
        ))}
      </div>
    </div>
  );
};

/** The colors of a donut's slices: the one amber, then cooler and neutral tones so the slices can still be told apart. */
export const DONUT_COLORS = ['#ffb300', '#7ab8ff', '#c58bff', '#ff6b5e', '#ffd54f', '#8e8e93', '#5fd0a5', '#e8e8ec'];

/** A ring split into slices, with the total in the middle. Says what it shows to a screen reader. */
export const Donut: React.FC<{ slices: { label: string; value: number }[]; center: string; ariaLabel: string; format: (v: number) => string }> = ({ slices, center, ariaLabel, format }) => {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const R = 48;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0" role="img" aria-label={`${ariaLabel}: ${slices.filter((s) => s.value > 0).map((s) => `${s.label} ${total ? Math.round((s.value / total) * 100) : 0} percent`).join(', ')}`}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--l-s2)" strokeWidth="16" />
        {total > 0 &&
          slices.map((s, i) => {
            const len = (s.value / total) * C;
            const el = s.value > 0 ? <circle key={s.label} cx="60" cy="60" r={R} fill="none" stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" /> : null;
            offset += len;
            return el;
          })}
        <text x="60" y="64" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--l-text)">
          {center}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-sm" aria-hidden="true">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length], opacity: s.value > 0 ? 1 : 0.35 }} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="l-dim tabular-nums">{format(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
