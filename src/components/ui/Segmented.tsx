import React from 'react';
import { ColorPalette } from '../../types/theme';

interface SegmentedProps<T extends string> {
  options: { id: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  theme: ColorPalette;
  ariaLabel: string;
}

export function Segmented<T extends string>({ options, value, onChange, theme, ariaLabel }: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex items-center p-1 bg-black/60 rounded-2xl border border-[#1A1E26] overflow-x-auto no-scrollbar"
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
              active ? 'bg-neutral-900 shadow border border-neutral-700' : 'text-neutral-400 hover:text-white'
            }`}
            style={{ color: active ? theme.primary : undefined }}
          >
            {o.icon}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
