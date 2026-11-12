import React, { useEffect, useMemo, useState } from 'react';
import { GrabHandle } from '../ui/GrabHandle';
import { X } from 'lucide-react';
import { BarChart, EmptyState, LineChart } from '../ui/charts';
import { SleepLogEntry } from '../../types/health';
import { shortMonthDay, shortWeekday } from '../../lib/dates';
import { lastNights } from '../../lib/sleepMetrics';
import { Segmented } from '../ui/Segmented';

export interface SleepMetricDef {
  id: string;
  title: string;
  unit: string;
  color: string;
  icon: React.ReactNode;
  digits: number;
  pick: (l: SleepLogEntry) => number | undefined;
  chart: 'bar' | 'line';
  explain: string;
}

const RANGES = [7, 14, 30] as const;

/** A night-by-night history of one sleep number, opened by tapping its tile on the Sleep screen. */
export const SleepMetricSheet: React.FC<{ def: SleepMetricDef; logs: SleepLogEntry[]; onClose: () => void }> = ({ def, logs, onClose }) => {
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nights = useMemo(() => lastNights(logs, range), [logs, range]);
  const rows = nights.map((l) => ({ date: l.dateIso, value: def.pick(l) })).filter((r): r is { date: string; value: number } => r.value !== undefined);
  const values = rows.map((r) => r.value);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  const lo = values.length ? Math.min(...values) : undefined;
  const hi = values.length ? Math.max(...values) : undefined;
  const latest = rows.length ? rows[rows.length - 1] : undefined;
  const fmt = (v: number | undefined) => (v === undefined ? '—' : v.toFixed(def.digits));
  const label = (d: string) => (range <= 7 ? shortWeekday(d) : String(Number(d.slice(8, 10))));
  const cell = 'rounded-2xl bg-black/40 border border-[#1A1E26] p-3';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={def.title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-[32px] border border-b-0 border-[#1A1E26] bg-[#0B0D11] px-5 pb-8 pt-0 text-white shadow-2xl">
        <GrabHandle onClose={onClose} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: `${def.color}22`, color: def.color }}>
              {def.icon}
            </span>
            <h2 className="text-base font-bold">{def.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-300 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="hero-num text-[3rem] leading-none">{fmt(latest?.value)}</span>
          <span className="text-sm text-[#9AA3B2]">{def.unit}</span>
          {latest && <span className="ml-auto text-xs text-[#9AA3B2]">{shortMonthDay(latest.date)}</span>}
        </div>

        <Segmented<string>
          className="mt-4"
          ariaLabel="Time range"
          size="sm"
          semantics="group"
          value={String(range)}
          onChange={(id) => setRange(Number(id) as typeof range)}
          options={RANGES.map((n) => ({ id: String(n), label: `${n} nights` }))}
        />

        <div className="mt-3">
          {rows.length === 0 ? (
            <EmptyState title={`No ${def.title.toLowerCase()} in the last ${range} nights`} hint="It appears once your watch shares it through Health Connect." />
          ) : def.chart === 'bar' ? (
            <BarChart
              data={nights.map((l, i) => ({ label: label(l.dateIso), value: def.pick(l) ?? 0, highlight: i === nights.length - 1 }))}
              color={def.color}
              ariaLabel={`${def.title} per night`}
            />
          ) : (
            <LineChart points={rows.map((r) => ({ label: shortMonthDay(r.date), value: r.value }))} color={def.color} unit={' ' + def.unit} ariaLabel={`${def.title} per night`} />
          )}
        </div>

        {rows.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ['Average', avg],
                ['Lowest', lo],
                ['Highest', hi],
              ] as const
            ).map(([name, v]) => (
              <div key={name} className={cell}>
                <div className="stat-label">{name}</div>
                <div className="mt-1 text-lg font-bold tabular-nums">{fmt(v)}</div>
                <div className="text-xs text-neutral-400">{def.unit}</div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs leading-relaxed text-neutral-400">{def.explain}</p>
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">For general information, not medical advice.</p>
      </div>
    </div>
  );
};
