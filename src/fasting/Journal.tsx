import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { FastingSession } from '../types/health';
import { feelingLabel, feelingTone } from '../lib/fasting';
import { downloadTextFile } from '../lib/backup';
import { parseDateKey, shortWeekday, todayKey } from '../lib/dates';
import { stageAt } from './content';
import { LEVEL_COLORS, addPastFast, buildFastMonth, clampHours, earliestFastMonth, editFast, fastsToCsv, nameForHours, waterText, waterTotalMl } from './model';
import { FastCtx } from './state';
import { SectionTitle, Sheet, dayAndTime, fromLocalInput, hoursText, ink, timeOfDay, toLocalInput } from './ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const H = 3_600_000;

type Editing = { mode: 'edit'; id: string } | { mode: 'add'; date: string } | null;

/**
 * Journal: every fast on a month calendar. A day is colored by the best fast that ended on it (goal met, nearly, or short), and tapping
 * a day shows each fast in full: the times, the stage reached, water and salts, how you felt, hunger waves and notes. Times can be
 * corrected, a forgotten fast can be added, and the whole history can be exported.
 */
export const Journal: React.FC<{ ctx: FastCtx }> = ({ ctx }) => {
  const { sessions, setSessions, extras, setExtras, prefs } = ctx;
  const today = todayKey();
  const now = parseDateKey(today);
  const earliest = useMemo(() => earliestFastMonth(sessions, today), [sessions, today]);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState<Editing>(null);
  const [note, setNote] = useState('');

  const m = useMemo(() => buildFastMonth(sessions, year, month, today), [sessions, year, month, today]);
  const sel = m.cells.find((c) => c.date === selected) ?? m.cells.find((c) => c.inMonth);
  const isThisMonth = year === now.getFullYear() && month === now.getMonth();
  const atEarliest = year * 12 + month <= earliest.year * 12 + earliest.month;
  const s = m.summary;

  const go = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    const next = d.getFullYear() * 12 + d.getMonth();
    if (next > now.getFullYear() * 12 + now.getMonth() || next < earliest.year * 12 + earliest.month) return;
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelected(d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() ? today : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  };
  const nav = 'fa-iconbtn border disabled:opacity-30';

  // the editor's fields
  const target = editing?.mode === 'edit' ? sessions.find((x) => x.id === editing.id) : undefined;
  const [startV, setStartV] = useState('');
  const [endV, setEndV] = useState('');
  const [goalV, setGoalV] = useState(16);
  const [notesV, setNotesV] = useState('');
  const open = (e: Editing) => {
    setNote('');
    if (e?.mode === 'edit') {
      const f = sessions.find((x) => x.id === e.id);
      if (f) {
        setStartV(toLocalInput(f.startTimestamp));
        setEndV(toLocalInput(f.endTimestamp ?? Date.now()));
        setGoalV(f.targetDurationHours);
        setNotesV(f.notes ?? '');
      }
    } else if (e?.mode === 'add') {
      const d = parseDateKey(e.date);
      const end = new Date(d);
      end.setHours(12, 0, 0, 0);
      const start = new Date(end.getTime() - 16 * H);
      setStartV(toLocalInput(start.getTime()));
      setEndV(toLocalInput(end.getTime()));
      setGoalV(16);
      setNotesV('');
    }
    setEditing(e);
  };
  const save = () => {
    if (!editing) return;
    const start = fromLocalInput(startV);
    const end = fromLocalInput(endV);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return setNote('Choose both times.');
    const r =
      editing.mode === 'edit'
        ? editFast(sessions, editing.id, { startTimestamp: start, endTimestamp: end, targetHours: goalV, protocolName: nameForHours(goalV), notes: notesV })
        : addPastFast(sessions, { start, end, targetHours: goalV, protocolName: nameForHours(goalV) });
    if ('error' in r) return setNote(r.error);
    setSessions(r.sessions);
    setEditing(null);
  };
  const remove = () => {
    if (editing?.mode !== 'edit') return;
    setSessions((prev) => prev.filter((x) => x.id !== editing.id));
    setExtras((all) => {
      const { [editing.id]: _gone, ...rest } = all;
      return rest;
    });
    setEditing(null);
  };

  const card = (f: FastingSession) => {
    const hrs = f.actualHours ?? 0;
    const e = extras[f.id];
    const pct = Math.round((hrs / f.targetDurationHours) * 100);
    return (
      <li key={f.id} className="fa-card !p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold">{hoursText(hrs)}</div>
            <div className="fa-dim text-xs">
              {f.fastProtocolName} · {pct}% of {f.targetDurationHours} h
            </div>
          </div>
          <button type="button" className="fa-iconbtn border" style={{ borderColor: 'var(--fa-line)' }} onClick={() => open({ mode: 'edit', id: f.id })} aria-label="Edit this fast">
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed">
          {dayAndTime(f.startTimestamp)} to {f.endTimestamp ? dayAndTime(f.endTimestamp) : 'now'}
        </p>
        {!prefs.gentle && <p className="mt-1 text-xs font-semibold" style={{ color: ink(stageAt(hrs).hue) }}>Reached: {stageAt(hrs).name}</p>}
        {e?.unwell && <p className="fa-note mt-2 !p-2 text-xs">Ended because you felt unwell. It does not count against you.</p>}
        {(waterTotalMl(e) > 0 || (e?.salts.length ?? 0) > 0 || (e?.waves.length ?? 0) > 0) && (
          <p className="fa-dim mt-2 text-xs">
            {[waterTotalMl(e) > 0 ? `${waterText(waterTotalMl(e), ctx.units)} water` : '', (e?.salts.length ?? 0) > 0 ? `${e?.salts.length} salts` : '', (e?.waves.length ?? 0) > 0 ? `${e?.waves.length} hunger wave${e?.waves.length === 1 ? '' : 's'} (${e?.waves.filter((w) => w.rode).length} ridden out)` : ''].filter(Boolean).join(' · ')}
          </p>
        )}
        {(f.checkIns?.length ?? 0) > 0 && (
          <ul className="mt-2 space-y-1">
            {f.checkIns?.map((c) => (
              <li key={c.at} className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="fa-dim w-16 shrink-0 tabular-nums">{timeOfDay(c.at)}</span>
                {c.tags.map((t) => (
                  <span key={t} className="fa-tag" style={{ color: feelingTone(t) === 'good' ? 'var(--fa-good)' : 'var(--fa-warn)' }}>
                    {feelingLabel(t)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
        {f.notes && <p className="mt-2 rounded-xl p-2.5 text-xs" style={{ background: 'rgba(var(--fa-tint),0.05)' }}>"{f.notes}"</p>}
      </li>
    );
  };

  return (
    <div className="fa-scroll">
      <h1 className="fa-h1 mt-3">Journal</h1>
      <p className="fa-dim mt-1 text-sm">Every fast, by the day it ended.</p>

      <section className="fa-card mt-4" aria-label="Fasting calendar">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" style={{ color: 'var(--fa-hue)' }} aria-hidden="true" />
            <h2 className="text-base font-bold">
              {MONTHS[month]} {year}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {!isThisMonth && (
              <button type="button" className="fa-chip !min-h-11" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(today); }}>
                Today
              </button>
            )}
            <button type="button" className={nav} style={{ borderColor: 'var(--fa-line)' }} onClick={() => go(-1)} disabled={atEarliest} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className={nav} style={{ borderColor: 'var(--fa-line)' }} onClick={() => go(1)} disabled={isThisMonth} aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {s.fasts === 0 ? (
          <p className="fa-dim mt-2 text-xs">No fasts finished this month.</p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl px-1 py-2.5" style={{ background: 'rgba(var(--fa-tint),0.05)' }}>
              <div className="text-lg font-extrabold">{s.fasts}</div>
              <div className="fa-dim text-xs">{s.fasts === 1 ? 'fast' : 'fasts'}</div>
            </div>
            <div className="rounded-2xl px-1 py-2.5" style={{ background: 'rgba(var(--fa-tint),0.05)' }}>
              <div className="text-lg font-extrabold">{prefs.gentle ? hoursText(s.avgHours) : `${s.metGoal}/${s.fasts}`}</div>
              <div className="fa-dim text-xs">{prefs.gentle ? 'average' : 'goals met'}</div>
            </div>
            <div className="rounded-2xl px-1 py-2.5" style={{ background: 'rgba(var(--fa-tint),0.05)' }}>
              <div className="text-lg font-extrabold">{s.longest ? hoursText(s.longest.actualHours ?? 0) : '–'}</div>
              <div className="fa-dim text-xs">longest</div>
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-7 gap-1 text-center" role="group" aria-label={`${MONTHS[month]} ${year}, a fast for each day`}>
          {m.cells.slice(0, 7).map((c) => (
            <div key={`h-${c.date}`} className="fa-dim py-1 text-xs font-semibold uppercase tracking-wide" aria-hidden="true">
              {shortWeekday(c.date).slice(0, 2)}
            </div>
          ))}
          {m.cells.map((c) => {
            const active = sel?.date === c.date;
            const color = c.inMonth && c.level ? LEVEL_COLORS[c.level] : undefined;
            const best = c.fasts[0];
            return (
              <button
                key={c.date}
                type="button"
                aria-pressed={active}
                disabled={c.isFuture}
                aria-label={`${parseDateKey(c.date).toLocaleDateString(undefined, { weekday: 'long' })} ${MONTHS[parseDateKey(c.date).getMonth()]} ${c.day}${best ? `, fasted ${hoursText(best.actualHours ?? 0)}` : c.isFuture ? '' : ', no fast ended'}`}
                onClick={() => setSelected(c.date)}
                className="relative flex min-h-[52px] flex-col items-center justify-start rounded-xl px-0.5 pb-1 pt-1 text-xs tabular-nums disabled:opacity-30"
                style={{
                  color: !c.inMonth ? 'var(--fa-faint)' : 'var(--fa-cream)',
                  fontWeight: c.isToday ? 800 : 500,
                  background: color ? `${color}22` : 'rgba(var(--fa-tint),0.03)',
                  border: `1px solid ${active || c.isToday ? 'var(--fa-hue)' : color ? `${color}55` : 'transparent'}`,
                  boxShadow: active ? '0 0 0 1px var(--fa-hue)' : undefined,
                }}
              >
                <span className="leading-none">{c.day}</span>
                {best && c.inMonth && (
                  <span className="mt-1 text-[10px] font-bold leading-none" style={{ color }}>
                    {Math.round(best.actualHours ?? 0)}h
                  </span>
                )}
                {!best && c.covered && c.inMonth && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-white/50" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <ul className="fa-dim mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Color key">
          {(['met', 'near', 'short'] as const).map((l) => (
            <li key={l} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: LEVEL_COLORS[l] }} aria-hidden="true" />
              {l === 'met' ? 'Goal met' : l === 'near' ? 'Over 75%' : 'Under 75%'}
            </li>
          ))}
        </ul>
      </section>

      {sel && (
        <section className="mt-4" aria-live="polite" aria-label="Selected day">
          <div className="flex items-center justify-between gap-2">
            <h2 className="fa-h2">{sel.isToday ? 'Today' : parseDateKey(sel.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
            {!sel.isFuture && (
              <button type="button" className="fa-chip" onClick={() => open({ mode: 'add', date: sel.date })}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add a fast
              </button>
            )}
          </div>
          {sel.fasts.length === 0 ? (
            <p className="fa-dim mt-2 text-sm">{sel.isFuture ? 'Not yet.' : 'No fast ended on this day. If you forgot to track one, add it.'}</p>
          ) : (
            <ul className="mt-2 space-y-2.5">{sel.fasts.map(card)}</ul>
          )}
        </section>
      )}

      <SectionTitle>Your data</SectionTitle>
      <button
        type="button"
        className="fa-btn fa-btn-quiet w-full"
        onClick={() => void downloadTextFile(`fasting-${todayKey()}.csv`, fastsToCsv(sessions, extras, ctx.units), 'text/csv').catch(() => undefined)}
        disabled={!sessions.some((x) => x.isCompleted)}
      >
        <Download className="h-4 w-4" aria-hidden="true" /> Export all fasts (CSV)
      </button>
      <p className="fa-dim mt-2 text-xs">A spreadsheet of every fast with its times, goal, water, salts and hunger waves, to keep or show a doctor.</p>
      <div className="h-6" />

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.mode === 'add' ? 'Add a fast' : 'Edit this fast'}>
        <div className="space-y-3">
          <label className="block text-sm font-semibold" htmlFor="fa-j-start">
            Started
            <input id="fa-j-start" type="datetime-local" className="fa-input mt-1" value={startV} max={toLocalInput(Date.now())} onChange={(e) => setStartV(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold" htmlFor="fa-j-end">
            Ended
            <input id="fa-j-end" type="datetime-local" className="fa-input mt-1" value={endV} max={toLocalInput(Date.now())} onChange={(e) => setEndV(e.target.value)} />
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">Goal</span>
            <span className="flex items-center gap-2">
              <button type="button" className="fa-iconbtn border" style={{ borderColor: 'var(--fa-line)' }} onClick={() => setGoalV(clampHours(goalV - 1))} aria-label="One hour shorter">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="w-14 text-center text-lg font-extrabold tabular-nums">{goalV} h</span>
              <button type="button" className="fa-iconbtn border" style={{ borderColor: 'var(--fa-line)' }} onClick={() => setGoalV(clampHours(goalV + 1))} aria-label="One hour longer">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </span>
          </div>
          <label className="block text-sm font-semibold" htmlFor="fa-j-notes">
            Notes
            <textarea id="fa-j-notes" className="fa-input mt-1" value={notesV} onChange={(e) => setNotesV(e.target.value)} placeholder="How it went" />
          </label>
          {note && (
            <p role="alert" className="text-sm" style={{ color: 'var(--fa-bad)' }}>
              {note}
            </p>
          )}
          <button type="button" className="fa-btn w-full" onClick={save}>
            {editing?.mode === 'add' ? 'Add fast' : 'Save changes'}
          </button>
          {target && (
            <button type="button" className="fa-btn fa-btn-quiet w-full" onClick={remove}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete this fast
            </button>
          )}
        </div>
      </Sheet>
    </div>
  );
};

