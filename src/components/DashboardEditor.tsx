import React, { useEffect } from 'react';
import { GrabHandle } from './ui/GrabHandle';
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, X } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { DEFAULT_LAYOUT, DashboardLayout, WIDGETS, WidgetId, moveWidget, toggleWidget } from '../lib/dashboardLayout';

interface DashboardEditorProps {
  theme: ColorPalette;
  layout: DashboardLayout;
  onChange: (layout: DashboardLayout) => void;
  onClose: () => void;
}

/** Choose which tiles Home shows and in what order. Changes apply at once. */
export const DashboardEditor: React.FC<DashboardEditorProps> = ({ theme, layout, onChange, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const info = new Map(WIDGETS.map((w) => [w.id, w]));
  const isDefault = layout.hidden.length === 0 && layout.order.every((id, i) => id === DEFAULT_LAYOUT.order[i]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Customize Home"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-[32px] border border-b-0 border-[#1A1E26] bg-[#0B0D11] px-5 pb-8 pt-0 text-white shadow-2xl">
        <GrabHandle onClose={onClose} />
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">Customize Home</h2>
            <p className="mt-0.5 text-xs text-[#9AA3B2]">Show what you use, hide the rest, and put it in your order.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-300 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="mt-4 space-y-2">
          {layout.order.map((id: WidgetId, i) => {
            const w = info.get(id)!;
            const shown = !layout.hidden.includes(id);
            return (
              <li key={id} className="flex items-center gap-2 rounded-2xl border border-[#1A1E26] bg-black/40 px-3 py-2.5" >
                <button
                  onClick={() => onChange(toggleWidget(layout, id))}
                  aria-pressed={shown}
                  aria-label={`${shown ? 'Hide' : 'Show'} ${w.label}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={shown ? { background: `${theme.primary}22`, color: theme.primary } : { background: 'rgba(255,255,255,0.06)', color: '#7E889B' }}
                >
                  {shown ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{w.label}</div>
                  <div className="truncate text-xs text-[#9AA3B2]">{shown ? w.hint : `Hidden. ${w.hint}`}</div>
                </div>
                <button
                  onClick={() => onChange(moveWidget(layout, id, -1))}
                  disabled={i === 0}
                  aria-label={`Move ${w.label} up`}
                  className="rounded-full p-2 text-neutral-300 disabled:opacity-25"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onChange(moveWidget(layout, id, 1))}
                  disabled={i === layout.order.length - 1}
                  aria-label={`Move ${w.label} down`}
                  className="rounded-full p-2 text-neutral-300 disabled:opacity-25"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>

        <button
          onClick={() => onChange(DEFAULT_LAYOUT)}
          disabled={isDefault}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-700 py-2.5 text-xs font-semibold text-neutral-100 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset to the standard layout
        </button>
        <p className="mt-3 text-xs leading-relaxed text-neutral-400">
          Tip: on Home, press and hold any tile, then drag it where you want it. The run button and reminders always stay on top. Cards such as Last activity also need something to show.
        </p>
      </div>
    </div>
  );
};
