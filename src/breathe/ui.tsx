import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { useInertPage } from '../lift/back';

/** The full-screen frame of the Breathe side: its own dark, calm look, above everything else in the app. */
export const BreatheShell: React.FC<{ label: string; hue?: string; children: React.ReactNode }> = ({ label, hue = '#5EEAD4', children }) => {
  useInertPage(true);
  return createPortal(
    <div className="br" role="dialog" aria-modal="true" aria-label={label} style={{ ['--br-hue' as string]: hue }}>
      {children}
    </div>,
    document.body
  );
};

/** The bar across the top of a page: a back arrow, an optional title, and anything on the right. */
export const BrHeader: React.FC<{ title?: string; onBack?: () => void; backLabel?: string; right?: React.ReactNode }> = ({ title, onBack, backLabel = 'Back', right }) => (
  <div className="br-header">
    <div className="flex min-w-0 items-center gap-1">
      {onBack && (
        <button type="button" className="br-icon-btn -ml-2" onClick={onBack} aria-label={backLabel}>
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
    <h2 className="br-h2">{children}</h2>
    {right}
  </div>
);

/** A little switch row, for the cues. */
export const BrToggle: React.FC<{ label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, sub, on, onChange }) => (
  <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="br-toggle">
    <span className="min-w-0 text-left">
      <span className="block text-sm font-semibold">{label}</span>
      {sub && <span className="br-dim block text-xs">{sub}</span>}
    </span>
    <span className="br-switch" data-on={on} aria-hidden="true">
      <span />
    </span>
  </button>
);

export const clock = (sec: number): string => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, Math.round(sec) % 60)).padStart(2, '0')}`;
