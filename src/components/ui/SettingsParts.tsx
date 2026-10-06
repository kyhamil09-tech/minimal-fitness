import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

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
        <div className="text-xs text-[#7E889B] mt-0.5 leading-relaxed">{sub}</div>
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
      background: on ? 'var(--accent)' : 'rgba(255,255,255,0.22)',
      boxShadow: on
        ? '0 0 0 2px var(--accent), 0 0 14px 3px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 30px 8px color-mix(in srgb, var(--accent) 28%, transparent)'
        : 'inset 0 0 0 2px rgba(255,255,255,0.45)',
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
      {sub && <div className="text-xs text-[#7E889B] mt-0.5 leading-relaxed">{sub}</div>}
    </div>
    {children}
  </div>
);

/** A small heading that splits a long settings group into parts you can scan. */
export const SubHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-[#7E889B]">{children}</h3>
);

const OPEN_KEY = 'kyfit_settings_open';

const readOpen = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
};

/** A collapsible group of settings. Which groups are open is remembered. */
export const SettingsGroup: React.FC<{
  id: string;
  title: string;
  summary: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ id, title, summary, icon, defaultOpen = false, children }) => {
  const [open, setOpen] = useState<boolean>(() => readOpen()[id] ?? defaultOpen);
  const ref = React.useRef<HTMLElement>(null);
  // Other parts of the app can ask for a group to be opened (the On-device badge opens Privacy & data).
  React.useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) return;
      setOpen(true);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify({ ...readOpen(), [id]: true }));
      } catch {
        // storage unavailable
      }
      setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    };
    window.addEventListener('kyfit-open-settings-group', onOpen);
    return () => window.removeEventListener('kyfit-open-settings-group', onOpen);
  }, [id]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify({ ...readOpen(), [id]: next }));
    } catch {
      // storage unavailable
    }
  };
  return (
    <section ref={ref} className="rounded-[26px] border border-[#1A1E26] bg-[#0B0D11] overflow-hidden">
      <button onClick={toggle} aria-expanded={open} className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-neutral-800 bg-neutral-900">{icon}</span>
          <span className="min-w-0">
            <span className="block gh-title !text-[1.25rem] truncate">{title}</span>
            <span className="block text-[11px] text-[#7E889B] mt-0.5 truncate">{summary}</span>
          </span>
        </span>
        <ChevronDown className={`w-5 h-5 text-neutral-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-3 pb-4 space-y-4 border-t border-[#1A1E26] pt-4">{children}</div>}
    </section>
  );
};
