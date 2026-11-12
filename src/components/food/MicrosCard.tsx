import React from 'react';
import { ChevronDown } from 'lucide-react';
import { FoodEntry } from '../../types/tracking';
import { dayMicros, microText } from '../../lib/micros';

/**
 * Vitamins and minerals for the day, as a share of the usual daily value. It only adds up foods whose source listed them (packaged foods
 * and ones you typed in), and says how many it could not count, so a low bar can mean "not known" rather than "not eaten".
 */
export const MicrosCard: React.FC<{ entries: FoodEntry[]; accent: string }> = ({ entries, accent }) => {
  if (entries.length === 0) return null;
  const { rows, known, unknown } = dayMicros(entries);
  const shown = rows.filter((r) => r.amount > 0);
  return (
    <details className="rounded-3xl border" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4" style={{ color: 'var(--ink)' }}>
        <span>
          <span className="block text-sm font-extrabold">Vitamins and minerals</span>
          <span className="block text-xs" style={{ color: 'var(--ink-dim)' }}>
            {known === 0 ? 'None of today’s foods list them' : `Counted from ${known} of ${entries.length} food${entries.length === 1 ? '' : 's'}`}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" style={{ color: 'var(--ink-dim)' }} />
      </summary>
      <div className="space-y-2.5 px-5 pb-5">
        {shown.length === 0 ? (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
            Foods you log from the built-in list, packaged foods you scan and foods you create can carry vitamins and minerals. A quick-add calorie entry does not.
          </p>
        ) : (
          shown.map((r) => (
            <div key={r.def.id}>
              <div className="flex justify-between text-xs font-mono">
                <span style={{ color: 'var(--ink-dim)' }}>{r.def.label}</span>
                <span style={{ color: 'var(--ink)' }}>
                  {microText(r.def, r.amount)} · {r.pct}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--hairline)' }} role="progressbar" aria-label={`${r.def.label}, ${r.pct} percent of the daily value`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, r.pct)}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.pct)}%`, backgroundColor: accent }} />
              </div>
            </div>
          ))
        )}
        {shown.length > 0 && unknown > 0 && (
          <p className="pt-1 text-xs leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
            {unknown} food{unknown === 1 ? '' : 's'} had no vitamin data, so the totals are at least this much. Daily values are the usual label amounts for adults, not advice for you.
          </p>
        )}
      </div>
    </details>
  );
};
