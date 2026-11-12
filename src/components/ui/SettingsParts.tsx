import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** A settings row: icon, title, a line of help, and an optional control on the right. */
export const Row: React.FC<{ icon: React.ReactNode; title: string; sub: React.ReactNode; action?: React.ReactNode }> = ({
  icon,
  title,
  sub,
  action,
}) => (
  <div className="p-4 flex items-start justify-between gap-3">
    <div className="flex items-start gap-3.5 min-w-0">
      <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-xs text-[#9AA3B2] mt-0.5 leading-relaxed">{sub}</div>
      </div>
    </div>
    {action}
  </div>
);

export const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={() => onChange(!on)}
    className="relative w-14 h-8 rounded-full shrink-0 transition-colors"
    style={{
      background: on ? 'var(--accent)' : 'var(--card-2)',
      boxShadow: on ? 'none' : 'inset 0 0 0 2px rgba(255,255,255,0.35)',
    }}
  >
    <span
      className="absolute top-1 w-6 h-6 rounded-full transition-all"
      style={{
        left: on ? 28 : 4,
        background: on ? 'var(--on-accent, #14130F)' : '#fff',
        boxShadow: '0 2px 5px rgba(0,0,0,0.45)',
      }}
    />
  </button>
);

/** A row of pill choices (one selected). */
export function Choice<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex gap-2 flex-wrap" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} onClick={() => onChange(o.id)} aria-pressed={value === o.id} className="sport-pill !py-1.5 !px-3.5 !text-xs">
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A choice that sits under a row's text: its own line with a small label. */
export const ChoiceRow: React.FC<{ title: string; sub?: string; children: React.ReactNode }> = ({ title, sub, children }) => (
  <div className="p-4 space-y-2.5">
    <div>
      <div className="text-sm font-semibold text-white">{title}</div>
      {sub && <div className="text-xs text-[#9AA3B2] mt-0.5 leading-relaxed">{sub}</div>}
    </div>
    {children}
  </div>
);

/** A small heading that splits a long settings group into parts you can scan. */
export const SubHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="px-1 pt-1 text-sm font-bold text-neutral-200">{children}</h3>
);

/**
 * One row of the settings list: an icon, a title and one line saying what is inside. Tapping it opens that part of the settings as its
 * own page, with a Back button (the phone's Back button works too). Other parts of the app can ask for a page to be opened (the
 * On-device badge opens Privacy & data).
 */
export const SettingsGroup: React.FC<{
  id: string;
  title: string;
  summary: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ id, title, summary, icon, children }) => {
  const [open, setOpen] = useState(false);
  const rowRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail === id) setOpen(true);
    };
    window.addEventListener('kyfit-open-settings-group', onOpen);
    return () => window.removeEventListener('kyfit-open-settings-group', onOpen);
  }, [id]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      rowRef.current?.focus();
    };
  }, [open]);
  return (
    <>
      <button
        ref={rowRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex w-full min-h-[64px] items-center gap-3.5 rounded-2xl border px-4 py-3 text-left"
        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--card-2)' }}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-white">{title}</span>
          <span className="block truncate text-xs text-[#A1A1AA]">{summary}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-[#A1A1AA]" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label={title} className="animate-fadeIn fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: 'var(--page-bg)', color: 'var(--ink)' }}>
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b px-4 pb-3" style={{ backgroundColor: 'var(--page-bg)', borderColor: 'var(--hairline)', paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
              <button type="button" onClick={() => setOpen(false)} aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-full border" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline-strong)' }}>
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <h2 className="text-lg font-extrabold">{title}</h2>
            </div>
            <div className="mx-auto max-w-lg space-y-4 px-4 pb-16 pt-4">{children}</div>
          </div>,
          document.body
        )}
    </>
  );
};
