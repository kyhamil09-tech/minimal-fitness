import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { ActivePlan, UnitSystem } from '../types/tracking';
import { WorkoutSession } from '../types/health';
import { getPlan } from '../data/plans';
import { buildMonth } from '../lib/workoutCalendar';
import { distanceUnit, kmToDisplay } from '../lib/units';
import { parseDateKey, shortWeekday, todayKey } from '../lib/dates';

interface WorkoutCalendarProps {
  theme: ColorPalette;
  units: UnitSystem;
  workouts: WorkoutSession[];
  activePlan: ActivePlan | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const clock = (ms?: number) => (ms ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');

/** A month of workouts: what you did, what the plan asked for, and the planned days that slipped by. */
export const WorkoutCalendar: React.FC<WorkoutCalendarProps> = ({ theme, units, workouts, activePlan }) => {
  const today = todayKey();
  const now = parseDateKey(today);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState(today);

  const plan = useMemo(
    () => (activePlan ? { plan: activePlan.plan ?? getPlan(activePlan.planId), startedAt: activePlan.startedAt } : null),
    [activePlan]
  );
  const m = useMemo(() => buildMonth(year, month, workouts, plan, today), [year, month, workouts, plan, today]);
  const sel = m.cells.find((c) => c.date === selected);

  const go = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    // Keep the detail panel on a day that is on show.
    setSelected(d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() ? today : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  };
  const isThisMonth = year === now.getFullYear() && month === now.getMonth();
  const nav = 'rounded-full p-2 text-neutral-300 hover:text-white border border-neutral-800';
  const s = m.summary;

  return (
    <section className="rounded-3xl border p-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }} aria-label="Workout calendar">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" style={{ color: theme.primary }} />
          <h2 className="text-base font-bold text-white">
            {MONTHS[month]} {year}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          {!isThisMonth && (
            <button
              onClick={() => {
                setYear(now.getFullYear());
                setMonth(now.getMonth());
                setSelected(today);
              }}
              className="rounded-full border border-neutral-800 px-2.5 py-1 text-[11px] font-semibold text-neutral-300 hover:text-white"
            >
              Today
            </button>
          )}
          <button onClick={() => go(-1)} className={nav} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => go(1)} className={nav} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-[#7E889B]">
        {s.workouts === 0
          ? 'No workouts recorded this month.'
          : `${s.workouts} workout${s.workouts === 1 ? '' : 's'} on ${s.activeDays} day${s.activeDays === 1 ? '' : 's'} · ${Math.round(s.minutes)} min${
              s.distanceKm > 0 ? ` · ${kmToDisplay(s.distanceKm, units, 1)} ${distanceUnit(units)}` : ''
            }`}
        {s.plannedPast > 0 && ` · plan ${s.plannedDone} of ${s.plannedPast} days done`}
      </p>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`${MONTHS[month]} ${year}`}>
        {m.cells.slice(0, 7).map((c) => (
          <div key={`h-${c.date}`} className="py-1 text-[10px] font-semibold uppercase tracking-wide text-[#7E889B]" role="columnheader">
            {shortWeekday(c.date).slice(0, 2)}
          </div>
        ))}
        {m.cells.map((c) => {
          const active = c.date === selected;
          const done = c.workouts.length > 0;
          return (
            <button
              key={c.date}
              role="gridcell"
              aria-selected={active}
              aria-label={`${MONTHS[parseDateKey(c.date).getMonth()]} ${c.day}${done ? `, ${c.workouts.length} workout${c.workouts.length === 1 ? '' : 's'}` : ''}${c.planned ? `, planned ${c.planned.title}` : ''}${c.missed ? ', missed' : ''}`}
              onClick={() => setSelected(c.date)}
              className="relative flex aspect-square flex-col items-center justify-center rounded-xl text-xs tabular-nums"
              style={{
                opacity: c.inMonth ? 1 : 0.35,
                color: c.isToday ? theme.primary : '#E5E7EB',
                fontWeight: c.isToday ? 800 : 500,
                background: active ? `${theme.primary}22` : 'transparent',
                border: `1px solid ${active ? theme.primary : 'transparent'}`,
              }}
            >
              {c.day}
              <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                {c.workouts.slice(0, 3).map((w) => (
                  <span key={w.id} className="h-1.5 w-1.5 rounded-full" style={{ background: theme.primary }} />
                ))}
                {c.missed && <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#F28B82' }} />}
                {c.planned && !done && !c.missed && (
                  <span className="h-1.5 w-1.5 rounded-full border" style={{ borderColor: theme.primary, background: 'transparent' }} />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#7E889B]">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: theme.primary }} /> Workout
        </span>
        {plan && (
          <>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full border" style={{ borderColor: theme.primary }} /> Planned
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#F28B82' }} /> Missed
            </span>
          </>
        )}
      </div>

      {sel && (
        <div className="mt-3 rounded-2xl border border-[#1A1E26] bg-black/30 p-3" aria-live="polite">
          <div className="text-xs font-semibold text-white">
            {sel.isToday ? 'Today' : parseDateKey(sel.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          {sel.planned && (
            <div className="mt-1.5 text-[11px] text-neutral-300">
              <span className="font-semibold" style={{ color: sel.missed ? '#F28B82' : theme.primary }}>
                {sel.missed ? 'Missed: ' : 'Planned: '}
              </span>
              {sel.planned.title}
              {sel.planned.targetMinutes ? ` · ${sel.planned.targetMinutes} min` : ''}
              {sel.planned.targetKm ? ` · ${kmToDisplay(sel.planned.targetKm, units, 1)} ${distanceUnit(units)}` : ''}
            </div>
          )}
          {sel.workouts.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {sel.workouts.map((w) => (
                <li key={w.id} className="flex items-baseline justify-between gap-2 text-xs text-neutral-200">
                  <span className="font-semibold">
                    {w.type}
                    <span className="ml-1.5 font-normal text-[#7E889B]">{clock(w.startedAt)}</span>
                  </span>
                  <span className="tabular-nums text-neutral-300">
                    {w.minutes} min{w.distanceKm ? ` · ${kmToDisplay(w.distanceKm, units, 2)} ${distanceUnit(units)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[11px] text-[#7E889B]">
              {sel.isFuture ? (sel.planned ? 'Still to come.' : 'Nothing planned.') : sel.planned ? 'Nothing recorded.' : 'Nothing recorded this day.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
