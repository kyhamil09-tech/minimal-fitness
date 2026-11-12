import React, { useMemo, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { useT } from '../lib/i18n';
import { Plus, Search } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { Exercise, MuscleGroup, UserProfile } from '../types/tracking';
import { LIBRARY_GROUPS, allExercises, getExercise, isTimedExercise } from '../data/exercises';
import { exerciseEntries, liftRecords } from '../lib/lifting';
import { isWorkingSet, setText, kindInfo, setLabel } from '../lib/sets';
import { formatWeight, kgToDisplay, weightUnit } from '../lib/units';
import { MuscleBadge } from './visuals';
import { Header, MiniLine, Sheet, Stat } from './ui';
import { GuideSheet } from './GuideSheet';
import { ExercisePicker } from './ExercisePicker';

const KIND_COLOR: Record<string, string> = { warmup: 'var(--l-warm)', drop: 'var(--l-drop)', failure: 'var(--l-fail)' };

const dayText = (ms: number): string => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const shortDay = (ms: number): string => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

interface ListProps {
  workouts: WorkoutSession[];
  custom: Exercise[];
  onCustomChange: (list: Exercise[]) => void;
  onOpen: (id: string) => void;
}

/** The Exercises tab: the whole library with a search and muscle filter, and a way to make your own. */
export const LiftExercises: React.FC<ListProps> = ({ workouts, custom, onCustomChange, onOpen }) => {
  const [query, setQuery] = useState('');
  const tr = useT();
  const [filter, setFilter] = useState<'all' | 'done' | 'mine' | MuscleGroup>('all');
  const [creating, setCreating] = useState(false);

  const doneIds = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of workouts) for (const e of w.exercises ?? []) if (e.sets.some((s) => s.done)) m.set(e.exerciseId, Math.max(m.get(e.exerciseId) ?? 0, w.startedAt ?? 0));
    return m;
  }, [workouts]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let items = [...allExercises()];
    if (filter === 'mine') items = items.filter((e) => e.custom);
    else if (filter === 'done') items = items.filter((e) => doneIds.has(e.id));
    else if (filter !== 'all') items = items.filter((e) => e.muscle === filter);
    if (q) items = items.filter((e) => e.name.toLowerCase().includes(q) || e.muscle.toLowerCase().includes(q) || e.equipment.toLowerCase().includes(q));
    return filter === 'done' ? items.sort((a, b) => (doneIds.get(b.id) ?? 0) - (doneIds.get(a.id) ?? 0)) : items.sort((a, b) => a.name.localeCompare(b.name));
    // custom changes the library
  }, [query, filter, doneIds, custom]);

  const chips: { id: typeof filter; label: string }[] = [{ id: 'all', label: tr('lift.ex.all') }, { id: 'done', label: tr('lift.ex.recent') }, { id: 'mine', label: tr('lift.ex.mine') }, ...LIBRARY_GROUPS.map((g) => ({ id: g as MuscleGroup, label: g }))];

  return (
    <>
      <Header
        title={tr('lift.ex.title')}
        right={
          <button type="button" className="l-icon-btn" onClick={() => setCreating(true)} aria-label="Create an exercise">
            <Plus className="h-6 w-6" aria-hidden="true" />
          </button>
        }
      />
      <div className="flex-none space-y-2 px-4 pt-3">
        <div className="relative">
          <Search className="l-dim pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
          <input aria-label="Search exercises" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exercises" className="h-11 w-full pl-9 pr-3 text-sm" />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter">
          {chips.map((c) => (
            <button key={c.id} type="button" className="l-chip" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <ul className="l-scroll !pt-1" aria-label="Exercises">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" className="flex min-h-[56px] w-full items-center justify-between gap-3 border-b py-2 text-left" style={{ borderColor: 'var(--l-line)', background: 'transparent', color: 'var(--l-text)' }} onClick={() => onOpen(e.id)}>
              <span className="flex min-w-0 items-center gap-3">
                <MuscleBadge group={e.muscle} size={36} />
                <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">
                  {e.name}
                  {e.custom && <span className="l-dim ml-2 text-[11px] font-semibold uppercase">Custom</span>}
                </span>
                <span className="l-dim block truncate text-xs">
                  {e.muscle} · {e.equipment}
                </span>
                </span>
              </span>
              {doneIds.has(e.id) && <span className="l-dim shrink-0 text-xs">{shortDay(doneIds.get(e.id) ?? 0)}</span>}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="l-dim py-10 text-center text-sm">{filter === 'done' ? 'Exercises you have logged show up here.' : tr('lift.ex.none')}</li>}
      </ul>
      {creating && (
        <ExercisePicker
          title="Create exercise"
          startCreating
          onCreated={() => setCreating(false)}
          workouts={workouts}
          custom={custom}
          onCustomChange={onCustomChange}
          onClose={() => setCreating(false)}
          onPick={() => setCreating(false)}
        />
      )}
    </>
  );
};

type Metric = 'e1rm' | 'heaviest' | 'volume' | 'hold';

interface DetailProps {
  profile: UserProfile;
  workouts: WorkoutSession[];
  exerciseId: string;
  onBack: () => void;
  onDeleteCustom: (id: string) => void;
  onOpenWorkout: (id: string) => void;
}

/** One exercise: your records, a chart of how it is going, and every time you did it. */
export const LiftExerciseDetail: React.FC<DetailProps> = ({ profile, workouts, exerciseId, onBack, onDeleteCustom, onOpenWorkout }) => {
  const ex = getExercise(exerciseId);
  const units = profile.units;
  const { prefs } = usePrefs();
  const entries = useMemo(() => exerciseEntries(workouts, exerciseId), [workouts, exerciseId, prefs.liftFormula]);
  const rec = useMemo(() => liftRecords(entries), [entries]);
  const timed = isTimedExercise(ex);
  const [metric, setMetric] = useState<Metric>(timed ? 'hold' : 'e1rm');
  const [guide, setGuide] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const unit = weightUnit(units);
  const weight = (kg: number) => formatWeight(kg, units);

  const points = useMemo(() => {
    const oldestFirst = [...entries].reverse();
    return oldestFirst
      .map((e) => {
        const heaviest = Math.max(0, ...e.sets.filter((s) => isWorkingSet(s) && s.reps > 0).map((s) => s.weightKg));
        const value = metric === 'e1rm' ? e.top?.e1rm ?? 0 : metric === 'heaviest' ? heaviest : metric === 'volume' ? e.volumeKg : e.bestSeconds;
        return { label: shortDay(e.at), value: metric === 'hold' ? value : kgToDisplay(value, units, 1) };
      })
      .filter((p) => p.value > 0);
  }, [entries, metric, units]);

  const recordAt = useMemo(() => {
    const out: number[] = [];
    let best = 0;
    points.forEach((p, i) => {
      if (p.value > best + 1e-9) {
        if (best > 0) out.push(i);
        best = p.value;
      }
    });
    return out;
  }, [points]);

  if (!ex) {
    return (
      <>
        <Header title="Exercise" onBack={onBack} />
        <p className="l-dim p-6 text-center text-sm">That exercise is no longer in the library.</p>
      </>
    );
  }

  const metrics: { id: Metric; label: string }[] = timed
    ? [{ id: 'hold', label: 'Longest hold' }]
    : [{ id: 'e1rm', label: 'Est. 1RM' }, { id: 'heaviest', label: 'Heaviest' }, { id: 'volume', label: 'Volume' }];

  return (
    <>
      <Header
        title={ex.name}
        sub={`${ex.muscle} · ${ex.equipment}`}
        onBack={onBack}
        right={
          <button type="button" className="l-btn l-btn-quiet" onClick={() => setGuide(true)}>
            How to
          </button>
        }
      />
      <div className="l-scroll pt-3">
        {entries.length === 0 ? (
          <p className="l-dim py-10 text-center text-sm">You have not logged this exercise yet. Add it to a workout and its records and chart show up here.</p>
        ) : (
          <>
            <h2 className="l-h2 !mt-2">Records</h2>
            <div className="l-card grid grid-cols-2 gap-x-3 gap-y-4 p-4">
              {timed ? (
                <Stat label="Longest hold" value={rec.longestHold ? `${Math.floor(rec.longestHold.seconds / 60)}:${String(rec.longestHold.seconds % 60).padStart(2, '0')}` : '–'} sub={rec.longestHold ? dayText(rec.longestHold.at) : undefined} />
              ) : (
                <>
                  <Stat label="Heaviest weight" value={rec.heaviest ? `${weight(rec.heaviest.weightKg)} × ${rec.heaviest.reps}` : '–'} sub={rec.heaviest ? dayText(rec.heaviest.at) : undefined} />
                  <Stat label="Best estimated 1RM" value={rec.e1rm ? weight(rec.e1rm.value) : '–'} sub={rec.e1rm ? `${weight(rec.e1rm.weightKg)} × ${rec.e1rm.reps}` : undefined} />
                  <Stat label="Best set volume" value={rec.bestSet ? formatWeight(rec.bestSet.volumeKg, units, 0) : '–'} sub={rec.bestSet ? `${weight(rec.bestSet.weightKg)} × ${rec.bestSet.reps}` : undefined} />
                  <Stat label="Most reps" value={rec.mostReps ? `${rec.mostReps.reps}` : '–'} sub={rec.mostReps && rec.mostReps.weightKg > 0 ? `at ${weight(rec.mostReps.weightKg)}` : undefined} />
                </>
              )}
              <Stat label="Sessions" value={rec.sessions} />
              <Stat label="Total sets" value={rec.totalSets} />
            </div>

            <h2 className="l-h2">Progress</h2>
            {metrics.length > 1 && (
              <div className="mb-3 flex gap-2" role="radiogroup" aria-label="What to chart">
                {metrics.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={metric === m.id} className="l-chip" onClick={() => setMetric(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            <div className="l-card p-4">
              <MiniLine points={points} records={recordAt} unit={metric === 'hold' ? ' s' : ` ${unit}`} ariaLabel={`${metrics.find((m) => m.id === metric)?.label ?? ''} for ${ex.name}`} />
            </div>

            <h2 className="l-h2">History</h2>
            <ul className="space-y-2">
              {entries.map((e) => (
                <li key={`${e.workoutId}-${e.at}`}>
                  <button type="button" className="l-card block w-full p-3 text-left" style={{ color: 'var(--l-text)' }} onClick={() => onOpenWorkout(e.workoutId)}>
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="font-semibold">{dayText(e.at)}</span>
                      <span className="l-dim truncate text-xs">{e.title}</span>
                    </div>
                    <ol className="mt-1.5 space-y-0.5 text-sm">
                      {e.sets.map((s, i, all) => {
                        const info = kindInfo(s.kind);
                        return (
                          <li key={i} className="flex gap-2 tabular-nums">
                            <span className="w-5 text-xs font-bold" style={{ color: KIND_COLOR[s.kind ?? ''] ?? 'var(--l-dim)' }}>
                              {setLabel(all, i)}
                            </span>
                            {setText(s, weight)}
                          </li>
                        );
                      })}
                    </ol>
                    {e.note && <p className="l-dim mt-1 text-xs">{e.note}</p>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {ex.custom && (
          <button type="button" className="l-btn l-btn-danger mt-6 w-full" onClick={() => setConfirming(true)}>
            Delete this exercise
          </button>
        )}
        <div className="h-8" />
      </div>
      <GuideSheet exercise={guide ? ex : null} onClose={() => setGuide(false)} />
      <Sheet open={confirming} onClose={() => setConfirming(false)} title="Delete this exercise?">
        <p className="l-dim mb-4 text-sm">“{ex.name}” will leave the library. Workouts that used it keep their sets, and the name stays in your history.</p>
        <div className="flex gap-2">
          <button type="button" className="l-btn flex-1" onClick={() => setConfirming(false)}>
            Keep it
          </button>
          <button type="button" className="l-btn flex-1" style={{ background: 'var(--l-fail)', borderColor: 'var(--l-fail)', color: 'var(--l-on-fail)' }} onClick={() => onDeleteCustom(ex.id)}>
            Delete
          </button>
        </div>
      </Sheet>
    </>
  );
};
