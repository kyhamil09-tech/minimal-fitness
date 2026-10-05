import React, { useState } from 'react';
import { Droplet, X } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { CycleStatus } from '../lib/cycle';
import { shortMonthDay } from '../lib/dates';

const PHASE_COLOR = { menstrual: '#FB7185', follicular: '#6EE7B7', ovulation: '#FBBF24', luteal: '#A78BFA' } as const;

/** Where you are in your cycle, from the period dates you log. Only shown when cycle tracking is on; the dates never leave the phone. */
export const CycleCard: React.FC<{ theme: ColorPalette; status: CycleStatus | null; starts: string[]; onLogStart: (date: string) => void; onRemove: (date: string) => void; onTurnOff?: () => void }> = ({ theme, status, starts, onLogStart, onRemove, onTurnOff }) => {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [date, setDate] = useState(todayKey);
  const color = status ? PHASE_COLOR[status.phase] : theme.primary;
  return (
    <section className="rounded-[28px] border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center justify-between">
        <span className="stat-label flex items-center gap-1.5">
          <Droplet className="w-3.5 h-3.5" style={{ color }} /> Cycle
        </span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11px] font-bold text-neutral-400 hover:text-white">
          {open ? 'Close' : 'Log a period'}
        </button>
      </div>
      {status ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="hero-num text-[2.4rem]" style={{ color }}>Day {status.day}</span>
            <span className="text-sm font-bold text-white">{status.label}</span>
          </div>
          <p className="text-[12px] text-neutral-300 mt-1 leading-relaxed">{status.tip}</p>
          <p className="text-[11px] text-neutral-500 mt-1.5">
            Next period expected around {shortMonthDay(status.nextPeriod)} ({status.daysToNext} day{status.daysToNext === 1 ? '' : 's'}) · {status.personal ? `your usual ${status.cycleLength}-day cycle` : 'based on a 28-day cycle until you have logged 3'}
          </p>
        </>
      ) : (
        <p className="text-sm text-neutral-300 mt-2 leading-relaxed">Log the first day of your last period and this shows where you are in your cycle, with training notes for each phase.</p>
      )}
      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input type="date" value={date} max={todayKey} onChange={(e) => setDate(e.target.value)} aria-label="First day of the period" className="flex-1 min-w-0 px-3 py-2 text-sm" />
            <button type="button" onClick={() => { onLogStart(date); setOpen(false); }} className="px-4 rounded-xl text-sm font-bold text-black" style={{ backgroundColor: theme.primary }}>
              Save
            </button>
          </div>
          {starts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[...starts].slice(-6).reverse().map((s) => (
                <span key={s} className="flex items-center gap-1 text-[11px] rounded-full glass-chip px-2.5 py-1 text-neutral-300">
                  {shortMonthDay(s)}
                  <button type="button" onClick={() => onRemove(s)} aria-label={`Remove ${s}`} className="text-neutral-500 hover:text-rose-400">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="text-[10px] text-neutral-600 mt-3 leading-relaxed">Stored only on this phone. An estimate from your own dates: not medical advice and not for contraception.</p>
      {onTurnOff && (
        <button type="button" onClick={onTurnOff} className="mt-2 text-[11px] font-bold text-neutral-400 underline">
          Turn off cycle tracking (your logged dates stay saved)
        </button>
      )}
    </section>
  );
};
