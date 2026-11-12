import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Star } from 'lucide-react';
import { ColorPalette } from '../../types/theme';
import { SleepLogEntry } from '../../types/health';
import { Hypnogram } from '../ui/charts';
import { STAGE_COLORS, sleepScore } from '../../lib/sleepMetrics';
import { LEVEL_COLORS, LEVEL_EDGES, SleepLevel, buildSleepMonth, earliestMonth, hoursShort, hoursText } from '../../lib/sleepCalendar';
import { parseDateKey, shortWeekday, todayKey } from '../../lib/dates';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const LEVEL_WORDS: Record<SleepLevel, string> = { poor: 'Well short', short: 'A little short', good: 'On target', long: 'A long one' };

/**
 * Sleep history as a month calendar: every night is a colored day (how it compares with your goal) with the hours on it, the month's
 * numbers above, and the picked night's full detail below. A day with nothing on it can be filled in from here, so gaps can be
 * back-filled. Nights are filed under the day you woke up.
 */
export const SleepCalendar: React.FC<{
  theme: ColorPalette;
  logs: SleepLogEntry[];
  /** Hours of sleep you aim for, in minutes. */
  goalMin?: number;
  /** Opens the manual entry for a date (the day you woke up). */
  onLogNight: (date: string) => void;
}> = ({ theme, logs, goalMin = 480, onLogNight }) => {
  const today = todayKey();
  const now = parseDateKey(today);
  const earliest = useMemo(() => earliestMonth(logs, today), [logs, today]);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState(today);

  const m = useMemo(() => buildSleepMonth(logs, year, month, goalMin, today), [logs, year, month, goalMin, today]);
  const sel = m.cells.find((c) => c.date === selected) ?? m.cells.find((c) => c.inMonth);
  const isThisMonth = year === now.getFullYear() && month === now.getMonth();
  const atEarliest = year * 12 + month <= earliest.year * 12 + earliest.month;

  const go = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    const next = d.getFullYear() * 12 + d.getMonth();
    if (next > now.getFullYear() * 12 + now.getMonth() || next < earliest.year * 12 + earliest.month) return;
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    // Keep the detail panel on a day that is on show: today, or the last night of that month with data, or the 1st.
    const isNow = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    setSelected(isNow ? today : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  };
  const nav = 'inline-flex h-11 w-11 items-center justify-center rounded-full border border-neutral-800 text-neutral-300 disabled:opacity-30';
  const s = m.summary;
  const edge = (f: number) => hoursText(Math.round(goalMin * f));

  const score = sel?.log ? sleepScore(sel.log, goalMin) : null;
  const log = sel?.log;

  return (
    <section className="rounded-3xl border p-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }} aria-label="Sleep calendar">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-indigo-400" aria-hidden="true" />
          <h2 className="text-base font-bold text-white">
            {MONTHS[month]} {year}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          {!isThisMonth && (
            <button
              type="button"
              onClick={() => {
                setYear(now.getFullYear());
                setMonth(now.getMonth());
                setSelected(today);
              }}
              className="min-h-11 rounded-full border border-neutral-800 px-3 text-xs font-semibold text-neutral-300"
            >
              Today
            </button>
          )}
          <button type="button" onClick={() => go(-1)} disabled={atEarliest} className={nav} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => go(1)} disabled={isThisMonth} className={nav} aria-label="Next month">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {s.nights === 0 ? (
        <p className="mt-2 text-xs text-[#9AA3B2]">No nights recorded this month. Tap a day to add one.</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl glass-inset px-1 py-2.5">
            <div className="text-lg font-extrabold text-white">{hoursText(s.avgMin)}</div>
            <div className="text-xs text-[#9AA3B2]">average</div>
          </div>
          <div className="rounded-2xl glass-inset px-1 py-2.5">
            <div className="text-lg font-extrabold text-white">{s.nights}</div>
            <div className="text-xs text-[#9AA3B2]">{s.nights === 1 ? 'night' : 'nights'}</div>
          </div>
          <div className="rounded-2xl glass-inset px-1 py-2.5">
            <div className="text-lg font-extrabold text-white">{s.avgScore ?? '–'}</div>
            <div className="text-xs text-[#9AA3B2]">{s.avgScore === null ? 'no score' : 'avg score'}</div>
          </div>
        </div>
      )}
      {s.nights > 0 && s.best && s.shortest && s.nights > 1 && (
        <p className="mt-2 text-xs text-[#9AA3B2]">
          Longest {hoursText(s.best.minutes)} on {parseDateKey(s.best.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · shortest {hoursText(s.shortest.minutes)} on{' '}
          {parseDateKey(s.shortest.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          {s.shortNights > 0 ? ` · ${s.shortNights} short ${s.shortNights === 1 ? 'night' : 'nights'}` : ''}
        </p>
      )}

      <div className="mt-3 grid grid-cols-7 gap-1 text-center" role="group" aria-label={`${MONTHS[month]} ${year}, a night for each day`}>
        {m.cells.slice(0, 7).map((c) => (
          <div key={`h-${c.date}`} className="py-1 text-xs font-semibold uppercase tracking-wide text-[#9AA3B2]" aria-hidden="true">
            {shortWeekday(c.date).slice(0, 2)}
          </div>
        ))}
        {m.cells.map((c) => {
          const active = sel?.date === c.date;
          // A day from the next or last month is only a placeholder here: a plain muted number, no night on it.
          const color = c.inMonth && c.level ? LEVEL_COLORS[c.level] : undefined;
          return (
            <button
              key={c.date}
              type="button"
              aria-pressed={active}
              disabled={c.isFuture}
              aria-label={`${parseDateKey(c.date).toLocaleDateString(undefined, { weekday: 'long' })} ${MONTHS[parseDateKey(c.date).getMonth()]} ${c.day}${c.log ? `, slept ${hoursText(c.log.durationMinutes)}, ${LEVEL_WORDS[c.level as SleepLevel].toLowerCase()}` : c.isFuture ? '' : ', no sleep recorded'}`}
              onClick={() => setSelected(c.date)}
              className="relative flex min-h-[52px] flex-col items-center justify-start rounded-xl px-0.5 pb-1 pt-1 text-xs tabular-nums disabled:opacity-30"
              style={{
                color: !c.inMonth ? '#8B93A1' : '#E5E7EB',
                fontWeight: c.isToday ? 800 : 500,
                background: color ? `${color}26` : 'rgba(255,255,255,0.025)',
                border: `1px solid ${active || c.isToday ? theme.primary : color ? `${color}55` : 'transparent'}`,
                boxShadow: active ? `0 0 0 1px ${theme.primary}` : undefined,
              }}
            >
              <span className="leading-none">{c.day}</span>
              {c.log && c.inMonth && (
                <span className="mt-1 text-[10px] font-bold leading-none" style={{ color }}>
                  {hoursShort(c.log.durationMinutes)}
                </span>
              )}
              {c.records > 1 && c.inMonth && <span className="absolute right-1 top-1 h-1 w-1 rounded-full bg-white/70" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#9AA3B2]" aria-label="Color key">
        {(['poor', 'short', 'good', 'long'] as SleepLevel[]).map((l) => (
          <li key={l} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: LEVEL_COLORS[l] }} aria-hidden="true" />
            {l === 'poor' ? `Under ${edge(LEVEL_EDGES.poor)}` : l === 'short' ? `Under ${edge(LEVEL_EDGES.short)}` : l === 'good' ? 'On target' : `Over ${edge(LEVEL_EDGES.good)}`}
          </li>
        ))}
      </ul>

      {sel && (
        <div className="mt-3 rounded-2xl border border-[#1A1E26] bg-black/30 p-3.5" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold text-white">{sel.isToday ? 'This morning' : parseDateKey(sel.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            {!sel.isFuture && (
              <button type="button" onClick={() => onLogNight(sel.date)} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-neutral-800 px-3 text-xs font-semibold text-neutral-200">
                <Plus className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
                {log ? 'Add another' : 'Log this night'}
              </button>
            )}
          </div>

          {!log ? (
            <p className="mt-2 text-xs text-[#9AA3B2]">{sel.isFuture ? 'Not yet.' : 'No sleep recorded for the night ending this day. Your watch fills these in after it syncs, or you can log it yourself.'}</p>
          ) : (
            <div className="mt-2 space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-2xl font-extrabold text-white">{hoursText(log.durationMinutes)}</div>
                  <div className="font-mono text-xs text-[#9AA3B2]">
                    {log.bedtime} to {log.wakeTime}
                    {log.isManualEntry ? ' · logged by hand' : ''}
                  </div>
                </div>
                <div className="text-right">
                  {score && (
                    <div className="text-sm font-bold text-white">
                      {score.score} <span className="text-xs font-semibold text-[#9AA3B2]">{score.label}</span>
                    </div>
                  )}
                  <div className="mt-0.5 flex justify-end gap-0.5" role="img" aria-label={`Quality ${log.qualityRating} of 5`}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} className={`h-3 w-3 ${i < log.qualityRating ? 'fill-amber-400 text-amber-400' : 'text-neutral-800'}`} aria-hidden="true" />
                    ))}
                  </div>
                  <div className="mt-1 text-xs font-semibold" style={{ color: LEVEL_COLORS[sel.level as SleepLevel] }}>
                    {LEVEL_WORDS[sel.level as SleepLevel]}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center font-mono">
                {[
                  { label: 'Deep', value: log.deepSleepMinutes, color: theme.sleepStages.deep },
                  { label: 'REM', value: log.remSleepMinutes, color: theme.sleepStages.rem },
                  { label: 'Light', value: log.lightSleepMinutes, color: theme.sleepStages.light },
                  { label: 'Awake', value: log.awakeMinutes, color: '#A1A1AA' },
                ].map((st) => (
                  <div key={st.label} className="rounded-xl border border-neutral-900 bg-black/60 p-2">
                    <span className="block text-xs font-bold" style={{ color: st.color }}>
                      {st.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-white">{Math.round(st.value)}m</span>
                  </div>
                ))}
              </div>

              {log.detail && log.detail.segments.length > 0 && (
                <Hypnogram segments={log.detail.segments} startMs={log.detail.startMs} endMs={log.detail.endMs} colors={STAGE_COLORS} ariaLabel={`Sleep stages for ${log.displayDate}`} />
              )}
              {log.detail && (log.detail.hrAvg || log.detail.hrvMs || log.detail.respRate || log.detail.spo2Avg) && (
                <p className="font-mono text-xs text-neutral-300">
                  {[
                    log.detail.hrAvg ? `HR ${log.detail.hrAvg} bpm` : '',
                    log.detail.hrvMs ? `HRV ${Math.round(log.detail.hrvMs)} ms` : '',
                    log.detail.respRate ? `${log.detail.respRate} br/min` : '',
                    log.detail.spo2Avg ? `SpO2 ${Math.round(log.detail.spo2Avg)}%` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {log.notes && <p className="rounded-xl border border-neutral-900 bg-neutral-950 p-2.5 text-xs text-neutral-300">"{log.notes}"</p>}
              {sel.records > 1 && <p className="text-xs text-[#9AA3B2]">{sel.records} records for this night. The longest is shown; the Sources card above lets you pick another.</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
