import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Dumbbell, Lock, Pencil, Search, Share2, Trophy } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { RoutineSet, UserProfile } from '../types/tracking';
import { targetsFromLogs } from '../lib/routines';
import { liftingWorkouts, logsToRepeat, workoutTotals } from '../lib/lifting';
import { kindInfo, setLabel, setText } from '../lib/sets';
import { formatWeight } from '../lib/units';
import { getExercise } from '../data/exercises';
import { useT } from '../lib/i18n';
import { EmptyState } from './visuals';
import { badges, dayKey, dayStreak, monthGrid, weeklyStreak, workoutsByDay } from '../lib/liftStats';
import { Header, Sheet, Stat } from './ui';
import type { StartOptions } from './LiftHome';
import { LiftShareSheet } from './LiftShareSheet';

const KIND_COLOR: Record<string, string> = { warmup: 'var(--l-warm)', drop: 'var(--l-drop)', failure: 'var(--l-fail)' };

const clock = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${Math.max(1, m)} min`;
};

const dateLine = (ms: number): string => `${new Date(ms).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

interface HistoryProps {
  profile: UserProfile;
  workouts: WorkoutSession[];
  onOpen: (id: string) => void;
  onOpenImport: () => void;
}

type HistoryView = 'log' | 'calendar' | 'awards';

const matches = (w: WorkoutSession, q: string): boolean => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if ((w.title ?? w.planDayTitle ?? '').toLowerCase().includes(needle)) return true;
  if ((w.notes ?? '').toLowerCase().includes(needle)) return true;
  return (w.exercises ?? []).some((e) => e.name.toLowerCase().includes(needle) || (e.note ?? '').toLowerCase().includes(needle));
};

const WorkoutCard: React.FC<{ w: WorkoutSession; units: UserProfile['units']; onOpen: (id: string) => void }> = ({ w, units, onOpen }) => {
  const t = workoutTotals(w);
  const lines = (w.exercises ?? []).filter((e) => e.sets.some((s) => s.done)).slice(0, 3);
  return (
    <li>
      <button type="button" className="l-card block w-full p-3 text-left" style={{ color: 'var(--l-text)' }} onClick={() => onOpen(w.id)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold">{w.title || w.planDayTitle || 'Workout'}</div>
            <div className="l-dim text-xs">{new Date(w.startedAt ?? 0).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          </div>
          <div className="l-dim shrink-0 text-right text-xs tabular-nums">
            <div>{clock(w.durationSec ?? w.durationMinutes * 60)}</div>
            <div>{formatWeight(t.volumeKg, units, 0)}</div>
          </div>
        </div>
        <ul className="mt-2 space-y-0.5 text-xs">
          {lines.map((e) => (
            <li key={e.exerciseId} className="flex justify-between gap-2">
              <span className="truncate">
                {e.sets.filter((s) => s.done).length} × {e.name}
              </span>
            </li>
          ))}
          {(w.exercises ?? []).length > 3 && <li className="l-dim">+{(w.exercises ?? []).length - 3} more</li>}
        </ul>
      </button>
    </li>
  );
};

const Calendar: React.FC<{ workouts: WorkoutSession[]; units: UserProfile['units']; onOpen: (id: string) => void }> = ({ workouts, units, onOpen }) => {
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [picked, setPicked] = useState<string | null>(dayKey(today.getTime()));
  const by = useMemo(() => workoutsByDay(workouts), [workouts]);
  const grid = useMemo(() => monthGrid(cursor.y, cursor.m, by), [cursor, by]);
  const shift = (d: number) =>
    setCursor((c) => {
      const n = new Date(c.y, c.m + d, 1);
      return { y: n.getFullYear(), m: n.getMonth() };
    });
  const title = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const inMonth = grid.flat().filter((c) => c.inMonth && c.count > 0).length;
  const dayList = picked ? (by.get(picked) ?? []) : [];
  return (
    <div>
      <div className="mt-3 flex items-center justify-between">
        <button type="button" className="l-icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="text-center">
          <div className="text-base font-bold">{title}</div>
          <div className="l-dim text-xs">
            {inMonth} training day{inMonth === 1 ? '' : 's'}
          </div>
        </div>
        <button type="button" className="l-icon-btn" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="l-dim mt-2 grid grid-cols-7 text-center text-[11px] font-bold" aria-hidden="true">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="mt-1 flex flex-col gap-1" role="grid" aria-label={`Workouts in ${title}`}>
        {grid.map((week, wi) => (
          <div key={wi} role="row" className="grid grid-cols-7 gap-1">
            {week.map((c) => (
          <button
            key={c.key}
            type="button"
            role="gridcell"
            aria-selected={picked === c.key}
            aria-label={`${new Date(c.key + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${c.count ? `, ${c.count} workout${c.count === 1 ? '' : 's'}` : ''}`}
            onClick={() => setPicked(c.key)}
            className="flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-semibold tabular-nums"
            style={{
              background: c.count ? 'var(--l-fill)' : c.inMonth ? 'var(--l-s1)' : 'transparent',
              color: c.count ? 'var(--l-on-fill)' : c.inMonth ? 'var(--l-text)' : 'var(--l-dim)',
              border: picked === c.key ? '2px solid var(--l-text)' : '2px solid transparent',
            }}
          >
            {c.day}
          </button>
            ))}
          </div>
        ))}
      </div>
      <div aria-live="polite">
        {picked && dayList.length === 0 && <p className="l-dim mt-4 text-center text-sm">No workout on {new Date(picked + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.</p>}
        {dayList.length > 0 && (
          <ul className="mt-4 space-y-2">
            {dayList.map((w) => (
              <WorkoutCard key={w.id} w={w} units={units} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const Awards: React.FC<{ workouts: WorkoutSession[] }> = ({ workouts }) => {
  const tr = useT();
  const now = Date.now();
  const streak = useMemo(() => weeklyStreak(workouts, now, 2), [workouts]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => dayStreak(workoutsByDay(workouts), now), [workouts]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => badges(workouts, now), [workouts]); // eslint-disable-line react-hooks/exhaustive-deps
  const earned = list.filter((b) => b.earned).length;
  return (
    <div>
      <div className="l-card mt-3 grid grid-cols-3 gap-2 p-4 text-center">
        <Stat label={tr('lift.hist.weekStreak')} value={streak.current} />
        <Stat label={tr('lift.hist.bestStreak')} value={streak.best} />
        <Stat label={tr('lift.hist.dayStreak')} value={days} />
      </div>
      <h2 className="l-h2">
        {tr('lift.hist.badges')}{' '}
        <span className="l-dim text-sm font-normal">
          {earned} of {list.length}
        </span>
      </h2>
      <ul className="grid grid-cols-2 gap-2" aria-label="Badges">
        {list.map((b) => (
          <li key={b.id} className="l-card p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: b.earned ? 'var(--l-fill)' : 'var(--l-s2)', color: b.earned ? 'var(--l-on-fill)' : 'var(--l-dim-s2)' }} aria-hidden="true">
                {b.earned ? <Trophy className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </span>
              <span className="min-w-0 text-sm font-bold leading-tight">{b.title}</span>
            </div>
            <p className="l-dim mt-1 text-[11px] leading-snug">{b.detail}</p>
            {!b.earned && (
              <div className="l-bar mt-2" role="progressbar" aria-label={`${b.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(b.progress * 100)}>
                <span style={{ width: `${Math.round(b.progress * 100)}%` }} />
              </div>
            )}
            <span className="sr-only">{b.earned ? 'Earned' : `${Math.round(b.progress * 100)} percent`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** The History tab: the logbook (every workout, newest first, searchable), a calendar of training days, and streaks and badges. */
export const LiftHistory: React.FC<HistoryProps> = ({ profile, workouts, onOpen, onOpenImport }) => {
  const tr = useT();
  const [view, setView] = useState<HistoryView>('log');
  const [query, setQuery] = useState('');
  const all = liftingWorkouts(workouts);
  const list = all.filter((w) => matches(w, query));
  const months: { label: string; items: WorkoutSession[] }[] = [];
  for (const w of list) {
    const label = new Date(w.startedAt ?? 0).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const last = months[months.length - 1];
    if (last && last.label === label) last.items.push(w);
    else months.push({ label, items: [w] });
  }
  const views: { id: HistoryView; label: string }[] = [
    { id: 'log', label: tr('lift.hist.logbook') },
    { id: 'calendar', label: tr('lift.hist.calendar') },
    { id: 'awards', label: tr('lift.hist.awards') },
  ];
  return (
    <>
      <Header title={tr('lift.hist.title')} sub={all.length ? `${all.length} ${tr('lift.prof.workouts').toLowerCase()}` : undefined} />
      <div className="l-scroll">
        {all.length === 0 ? (
          <EmptyState
            icon={<Dumbbell className="h-7 w-7" />}
            title={tr('lift.hist.none')}
            text="Finish a workout and it shows up here. Coming from Hevy or Strong? Bring your history across."
            action={
              <button type="button" className="l-btn" onClick={onOpenImport}>
                Import from Hevy or Strong
              </button>
            }
          />
        ) : (
          <>
            <div className="mt-3 flex gap-2" role="group" aria-label="History views">
              {views.map((v) => (
                <button key={v.id} type="button" className="l-chip flex-1" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
                  {v.label}
                </button>
              ))}
            </div>
            {view === 'log' && (
              <>
                <div className="relative mt-3">
                  <Search className="l-dim pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
                  <input aria-label="Search your workouts" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('lift.hist.search')} className="h-11 w-full pl-9 pr-3 text-sm" />
                </div>
                {months.length === 0 && <p className="l-dim py-10 text-center text-sm">No workout matches “{query.trim()}”.</p>}
                {months.map((m) => (
                  <section key={m.label} aria-label={m.label}>
                    <h2 className="l-h2">{m.label}</h2>
                    <ul className="space-y-2">
                      {m.items.map((w) => (
                        <WorkoutCard key={w.id} w={w} units={profile.units} onOpen={onOpen} />
                      ))}
                    </ul>
                  </section>
                ))}
              </>
            )}
            {view === 'calendar' && <Calendar workouts={workouts} units={profile.units} onOpen={onOpen} />}
            {view === 'awards' && <Awards workouts={workouts} />}
          </>
        )}
      </div>
    </>
  );
};

interface DetailProps {
  profile: UserProfile;
  workout: WorkoutSession;
  /** Every workout, to tell which sets were records on the share picture. */
  all: WorkoutSession[];
  onBack: () => void;
  onStart: (ids: string[], opts?: StartOptions) => void;
  onUpdate: (w: WorkoutSession) => void;
  onDelete: (id: string) => void;
  onSaveRoutine: (name: string, ids: string[], folder?: string, targets?: Record<string, RoutineSet[]>) => void;
  onOpenExercise: (id: string) => void;
}

/** One finished workout: its sets, notes and totals, with repeat, save as routine, edit and delete. */
export const LiftWorkoutDetail: React.FC<DetailProps> = ({ profile, workout, all, onBack, onStart, onUpdate, onDelete, onSaveRoutine, onOpenExercise }) => {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [title, setTitle] = useState(workout.title ?? workout.planDayTitle ?? '');
  const [notes, setNotes] = useState(workout.notes ?? '');
  const [routineName, setRoutineName] = useState(workout.title ?? workout.planDayTitle ?? '');
  const t = workoutTotals(workout);
  const units = profile.units;
  const logs = (workout.exercises ?? []).filter((e) => e.sets.some((s) => s.done));
  const weight = (kg: number) => formatWeight(kg, units);

  return (
    <>
      <Header
        title={workout.title || workout.planDayTitle || 'Workout'}
        onBack={onBack}
        right={
          <>
            <button type="button" className="l-icon-btn" onClick={() => setSharing(true)} aria-label="Share workout as a picture">
              <Share2 className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" className="l-icon-btn" onClick={() => setEditing(true)} aria-label="Edit name and notes">
              <Pencil className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        }
      />
      <div className="l-scroll pt-3">
        <p className="l-dim text-sm">{dateLine(workout.startedAt ?? 0)}</p>
        <div className="l-card mt-3 grid grid-cols-4 gap-2 p-3 text-center">
          <Stat label="Time" value={clock(workout.durationSec ?? workout.durationMinutes * 60)} />
          <Stat label="Volume" value={formatWeight(t.volumeKg, units, 0)} />
          <Stat label="Sets" value={t.sets} />
          <Stat label="Energy" value={`${workout.caloriesBurned}`} sub="kcal" />
        </div>
        {workout.notes && <p className="mt-3 text-sm">{workout.notes}</p>}
        {workout.avgHeartRate > 0 && workout.hrFromSensor && (
          <p className="l-dim mt-2 text-xs">
            Average heart rate {workout.avgHeartRate} bpm{workout.maxHeartRate ? `, up to ${workout.maxHeartRate}` : ''}
          </p>
        )}

        {logs.map((e) => (
          <section key={e.exerciseId} className="mt-5" aria-label={e.name}>
            <button type="button" className="text-left text-base font-bold" style={{ color: 'var(--l-accent)', background: 'transparent', border: 0, padding: 0 }} onClick={() => getExercise(e.exerciseId) && onOpenExercise(e.exerciseId)}>
              {e.name}
            </button>
            {e.note && <p className="l-dim mt-0.5 text-xs">{e.note}</p>}
            <ol className="mt-2 space-y-1">
              {e.sets
                .filter((s) => s.done)
                .map((s, i, done) => {
                  const info = kindInfo(s.kind);
                  return (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold" style={{ background: 'var(--l-s2)', color: KIND_COLOR[s.kind ?? ''] ?? 'var(--l-text)' }} aria-label={info.label}>
                        {setLabel(done, i)}
                      </span>
                      <span className="tabular-nums">{setText(s, weight)}</span>
                      {s.rpe ? <span className="l-dim text-xs">RPE {s.rpe}</span> : null}
                    </li>
                  );
                })}
            </ol>
          </section>
        ))}

        <div className="mt-6 space-y-2">
          <button type="button" className="l-btn l-btn-primary w-full" onClick={() => onStart(logsToRepeat(workout).map((l) => l.exerciseId), { title: workout.title || workout.planDayTitle, logs: logsToRepeat(workout) })}>
            Repeat workout
          </button>
          <button type="button" className="l-btn w-full" onClick={() => setSaving(true)}>
            Save as routine
          </button>
          <button type="button" className="l-btn l-btn-danger w-full" onClick={() => setConfirming(true)}>
            Delete workout
          </button>
        </div>
        <div className="h-8" />
      </div>

      <LiftShareSheet open={sharing} onClose={() => setSharing(false)} workout={workout} others={all} units={units} />

      <Sheet open={editing} onClose={() => setEditing(false)} title="Name and notes">
        <label htmlFor="ld-title" className="l-dim text-xs font-semibold">
          Title
        </label>
        <input id="ld-title" className="mb-3 mt-1 h-11 w-full px-3 text-base" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        <label htmlFor="ld-notes" className="l-dim text-xs font-semibold">
          Notes
        </label>
        <textarea id="ld-notes" className="mt-1 w-full p-3 text-sm" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button
          type="button"
          className="l-btn l-btn-primary mt-3 w-full"
          onClick={() => {
            onUpdate({ ...workout, title: title.trim() || undefined, notes: notes.trim() || undefined });
            setEditing(false);
          }}
        >
          Save
        </button>
      </Sheet>

      <Sheet open={saving} onClose={() => setSaving(false)} title="Save as routine">
        <label htmlFor="ld-routine" className="sr-only">
          Routine name
        </label>
        <input id="ld-routine" className="h-11 w-full px-3 text-base" value={routineName} onChange={(e) => setRoutineName(e.target.value)} placeholder="Routine name" />
        <button
          type="button"
          className="l-btn l-btn-primary mt-3 w-full"
          disabled={!routineName.trim()}
          onClick={() => {
            onSaveRoutine(routineName.trim(), logs.map((l) => l.exerciseId), undefined, targetsFromLogs(logs));
            setSaving(false);
          }}
        >
          Save routine
        </button>
      </Sheet>

      <Sheet open={confirming} onClose={() => setConfirming(false)} title="Delete this workout?">
        <p className="l-dim mb-4 text-sm">It will be removed from your history and from your records. This cannot be undone.</p>
        <div className="flex gap-2">
          <button type="button" className="l-btn flex-1" onClick={() => setConfirming(false)}>
            Keep it
          </button>
          <button type="button" className="l-btn flex-1" style={{ background: 'var(--l-fail)', borderColor: 'var(--l-fail)', color: 'var(--l-on-fail)' }} onClick={() => onDelete(workout.id)}>
            Delete
          </button>
        </div>
      </Sheet>
    </>
  );
};
