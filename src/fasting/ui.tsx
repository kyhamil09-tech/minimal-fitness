import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, X } from 'lucide-react';
import { useBack, useInertPage } from '../lift/back';
import { isHex, readableOn } from '../lib/colorMath';

/** The full-screen frame of the Fasting side: its own warm, dark look, above everything else in the app. */
/** A stage's own color, as text: all of it on dark backgrounds, a darker version on light ones. */
export const ink = (hue: string): string => `color-mix(in srgb, ${hue} var(--fa-keep), #000)`;

export const FastingShell: React.FC<{ label: string; hue?: string; look?: Record<string, string>; mode?: string; children: React.ReactNode }> = ({ label, hue = '#FF5A2A', look = {}, mode = 'dark', children }) => {
  useInertPage(true);
  return createPortal(
    <div className="fa" data-mode={mode} role="dialog" aria-modal="true" aria-label={label} style={{ ...look, ['--fa-hue' as string]: hue, ['--fa-on-hue' as string]: isHex(hue) ? readableOn(hue, '#1e0a08', '#ffffff') : '#1e0a08' }}>
      {children}
    </div>,
    document.body
  );
};

export const FaHeader: React.FC<{ title?: string; onBack?: () => void; backLabel?: string; right?: React.ReactNode }> = ({ title, onBack, backLabel = 'Back', right }) => (
  <div className="fa-header">
    <div className="flex min-w-0 items-center gap-1">
      {onBack && (
        <button type="button" className="fa-iconbtn -ml-2" onClick={onBack} aria-label={backLabel}>
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </button>
      )}
      {title && <div className="truncate text-base font-bold">{title}</div>}
    </div>
    <div className="flex shrink-0 items-center gap-1">{right}</div>
  </div>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="mb-2 mt-6 flex items-end justify-between gap-3 px-1">
    <h2 className="fa-h2">{children}</h2>
    {right}
  </div>
);

export const FaToggle: React.FC<{ label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, sub, on, onChange }) => (
  <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="fa-toggle">
    <span className="min-w-0">
      <span className="block text-sm font-semibold">{label}</span>
      {sub && <span className="fa-dim block text-xs">{sub}</span>}
    </span>
    <span className="fa-switch" data-on={on} aria-hidden="true">
      <span />
    </span>
  </button>
);

/** A panel that slides up inside the Fasting app. Back and the close button dismiss it. */
export const Sheet: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ open, onClose, title, children }) => {
  useBack(open, onClose);
  if (!open) return null;
  return (
    <div className="fa-sheet-back" onClick={onClose}>
      <div className="fa-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="fa-grabber" aria-hidden="true" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button type="button" className="fa-iconbtn -mr-2" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="fa-sheet-body">{children}</div>
      </div>
    </div>
  );
};

/** The current time, updated every `ms`. */
export const useNow = (ms = 1000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** "13:05:09" for a number of milliseconds. */
export const hms = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

/** "13h 05m" for a number of hours. */
export const hoursText = (hours: number): string => {
  const total = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : h === 0 ? `${m}m` : `${h}h ${pad(m)}m`;
};

export const timeOfDay = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export const dayAndTime = (ms: number): string => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** A value for an `<input type="datetime-local">` in local time. */
export const toLocalInput = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fromLocalInput = (v: string): number => new Date(v).getTime();
