import React from 'react';
import { X } from 'lucide-react';
import { UnitSystem } from '../types/tracking';
import { FastExtra, waterText } from './model';
import { timeOfDay } from './ui';

/**
 * What you have logged in this fast, newest first, each with a button to take it back: a glass of water or a salt added by a mistaken
 * tap, or in the wrong size.
 */
export const IntakeList: React.FC<{
  extra: FastExtra | undefined;
  units: UnitSystem;
  onRemoveWater: (index: number) => void;
  onRemoveSalt: (index: number) => void;
}> = ({ extra, units, onRemoveWater, onRemoveSalt }) => {
  const rows = [
    ...(extra?.water ?? []).map((w, index) => ({ kind: 'water' as const, index, at: w.at, text: waterText(w.ml, units) })),
    ...(extra?.salts ?? []).map((s, index) => ({ kind: 'salt' as const, index, at: s.at, text: s.label })),
  ].sort((a, b) => b.at - a.at);
  if (rows.length === 0) return <p className="fa-dim text-xs">Nothing logged in this fast yet.</p>;
  return (
    <ul className="space-y-1.5" aria-label="Logged in this fast">
      {rows.map((r) => (
        <li key={`${r.kind}-${r.index}`} className="flex items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-sm" style={{ background: 'rgba(var(--fa-tint),0.05)' }}>
          <span className="min-w-0 truncate">
            {r.text} <span className="fa-dim text-xs">· {timeOfDay(r.at)}</span>
          </span>
          <button
            type="button"
            className="fa-iconbtn shrink-0"
            onClick={() => (r.kind === 'water' ? onRemoveWater(r.index) : onRemoveSalt(r.index))}
            aria-label={`Remove ${r.text}, logged at ${timeOfDay(r.at)}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
};
