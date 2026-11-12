import React, { useMemo, useState } from 'react';
import { Car, Undo2 } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { AutomaticData } from '../hooks/useAutomaticData';
import { Removed, stepsInWindow } from '../lib/steps';
import { addDays, todayKey } from '../lib/dates';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toMs = (date: string, time: string) => new Date(`${date}T${time}:00`).getTime();

const dayName = (key: string, today: string) =>
  key === today ? 'Today' : key === addDays(today, -1) ? 'Yesterday' : new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const SOURCE_NAME = { phone: 'phone', watch: 'watch', hc: 'Health Connect' } as const;

const describe = (r: Removed) => {
  const parts = (['phone', 'watch', 'hc'] as const).filter((k) => r[k] !== undefined).map((k) => `${(r[k] ?? 0).toLocaleString()} ${SOURCE_NAME[k]}`);
  return parts.length ? parts.join(' · ') : 'nothing';
};

interface StepPeriodsProps {
  theme: ColorPalette;
  automation: AutomaticData;
}

/** Take the steps counted during a period out of the day, for example a drive that shook the phone's step counter. */
export const StepPeriods: React.FC<StepPeriodsProps> = ({ theme, automation }) => {
  const { stepSamples, stepWindows, addStepWindow, removeStepWindow } = automation;
  const today = todayKey();
  const now = Date.now();
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(() => hhmm(now - 60 * 60_000));
  const [to, setTo] = useState(() => hhmm(now));

  const fromMs = toMs(date, from);
  const toMsV = toMs(date, to);
  const preview = useMemo(() => stepsInWindow(stepSamples, date, fromMs, toMsV), [stepSamples, date, fromMs, toMsV]);
  const hasData = Object.keys(preview).length > 0;
  const total = Math.max(preview.phone ?? 0, preview.watch ?? 0, preview.hc ?? 0);
  const valid = Number.isFinite(fromMs) && Number.isFinite(toMsV) && toMsV > fromMs && toMsV <= Date.now() + 60_000;

  const field = 'w-full px-3 py-2 rounded-xl bg-black/60 border border-neutral-700 text-sm text-white';
  const mine = [...stepWindows].sort((a, b) => b.fromMs - a.fromMs);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Car className="w-4 h-4" style={{ color: theme.primary }} />
        Remove steps from a period
      </div>
      <p className="text-xs text-[#9AA3B2] leading-relaxed">
        Driving can make the phone count steps. Pick the time you were in the car and the steps counted then are taken off that day.
      </p>

      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-3 text-xs text-neutral-400">
          Day
          <select value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`}>
            {Array.from({ length: 7 }, (_, i) => addDays(today, -i)).map((d) => (
              <option key={d} value={d}>
                {dayName(d, today)}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-1 text-xs text-neutral-400">
          From
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} mt-1`} />
        </label>
        <label className="col-span-1 text-xs text-neutral-400">
          To
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={`${field} mt-1`} />
        </label>
        <button
          disabled={!valid || !hasData || total === 0}
          onClick={() => addStepWindow(date, fromMs, toMsV)}
          className="col-span-1 self-end py-2.5 rounded-xl text-xs font-bold text-black disabled:opacity-40"
          style={{ backgroundColor: theme.primary }}
        >
          Remove
        </button>
      </div>

      <p className="text-xs min-h-[1.25rem]" style={{ color: !valid || !hasData ? '#fda4af' : theme.primary }} role="status">
        {!Number.isFinite(fromMs) || !Number.isFinite(toMsV)
          ? 'Choose both times.'
          : toMsV <= fromMs
            ? 'The end must be after the start.'
            : toMsV > Date.now() + 60_000
              ? 'That period has not happened yet.'
              : !hasData
                ? 'No timed step data for that day. It is kept from now on while the Android app runs (about every 15 minutes).'
                : total === 0
                  ? 'No steps were counted in that period.'
                  : `Would take off: ${describe(preview)}.`}
      </p>

      {mine.length > 0 && (
        <ul className="divide-y divide-[#1A1E26] border-t border-[#1A1E26]">
          {mine.map((w) => (
            <li key={w.id} className="py-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-neutral-200">
                  {dayName(w.date, today)} {hhmm(w.fromMs)}–{hhmm(w.toMs)}
                </div>
                <div className="text-xs text-[#9AA3B2]">Removed {describe(w.removed)}</div>
              </div>
              <button
                onClick={() => removeStepWindow(w.id)}
                className="p-2 rounded-lg border border-neutral-700 text-neutral-300 hover:text-white shrink-0"
                aria-label={`Put back the steps from ${dayName(w.date, today)} ${hhmm(w.fromMs)} to ${hhmm(w.toMs)}`}
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
