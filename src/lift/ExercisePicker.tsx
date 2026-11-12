import React, { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { Exercise, MuscleGroup } from '../types/tracking';
import { LIBRARY_GROUPS, MUSCLE_GROUPS, allExercises } from '../data/exercises';
import { addCustomExercise, liftingWorkouts } from '../lib/lifting';
import { LibEntry, entryEquipment, entryGroup, libraryLoaded, loadLibrary, norm, searchLibrary } from '../lib/exerciseLib';
import { useBack } from './back';
import { MuscleBadge } from './visuals';
import { Sheet } from './ui';
import { useT } from '../lib/i18n';

const EQUIPMENT: Exercise['equipment'][] = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Smith Machine', 'EZ Bar', 'Trap Bar', 'Band', 'Plate', 'Other'];

interface ExercisePickerProps {
  /** Exercises that are already in the workout (shown ticked and not added twice). */
  already?: string[];
  workouts: WorkoutSession[];
  custom: Exercise[];
  onCustomChange: (list: Exercise[]) => void;
  /** The exercises chosen, in the order they were ticked. */
  onPick: (ids: string[]) => void;
  onClose: () => void;
  title?: string;
  /** Open straight to the form for making an exercise of your own. */
  startCreating?: boolean;
  /** Called with the new exercise's id once it is made. */
  onCreated?: (id: string) => void;
  /** One exercise only: tapping it chooses it straight away (used to swap an exercise). */
  single?: boolean;
}

/** The exercise list: search, filter by muscle, tick several, and make an exercise of your own when yours is not there. */
export const ExercisePicker: React.FC<ExercisePickerProps> = ({ already = [], workouts, custom, onCustomChange, onPick, onClose, title = 'Add exercise', startCreating = false, onCreated, single = false }) => {
  const [query, setQuery] = useState('');
  const tr = useT();
  const [filter, setFilter] = useState<'all' | 'recent' | 'mine' | 'library' | MuscleGroup>('all');
  const [lib, setLib] = useState<LibEntry[] | null>(libraryLoaded());
  const [libError, setLibError] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [creating, setCreating] = useState(startCreating);
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup>('Chest');
  const [equipment, setEquipment] = useState<Exercise['equipment']>('Barbell');
  const [timed, setTimed] = useState(false);
  const [error, setError] = useState('');
  useBack(!creating, onClose);

  const recentIds = useMemo(() => {
    const seen: string[] = [];
    for (const w of liftingWorkouts(workouts).slice(0, 12)) for (const ex of w.exercises ?? []) if (!seen.includes(ex.exerciseId)) seen.push(ex.exerciseId);
    return seen;
  }, [workouts]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let items = [...allExercises()];
    if (filter === 'mine') items = items.filter((e) => e.custom);
    else if (filter === 'recent') items = recentIds.map((id) => items.find((e) => e.id === id)).filter((e): e is Exercise => !!e);
    else if (filter !== 'all') items = items.filter((e) => e.muscle === filter);
    if (q) items = items.filter((e) => e.name.toLowerCase().includes(q) || e.muscle.toLowerCase().includes(q) || e.equipment.toLowerCase().includes(q));
    if (filter !== 'recent') items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
    // `custom` changes when an exercise is made, which changes allExercises()
  }, [query, filter, recentIds, custom]);

  // The library of about 870 more exercises is read the first time it is opened.
  useEffect(() => {
    if (filter !== 'library' || lib) return;
    let alive = true;
    loadLibrary()
      .then((l) => alive && setLib(l))
      .catch(() => alive && setLibError(true));
    return () => {
      alive = false;
    };
  }, [filter, lib]);

  const libList = useMemo(() => {
    if (filter !== 'library' || !lib) return [];
    const have = new Set(allExercises().map((e) => norm(e.name)));
    return searchLibrary(lib, query, have);
    // allExercises() changes when an exercise is made
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, lib, query, custom]);

  /** Adds a library exercise to your own list (so it can be logged like any other) and picks it. */
  const useLibraryEntry = (e: LibEntry) => {
    const r = addCustomExercise(custom, { name: e.n, muscle: entryGroup(e), equipment: entryEquipment(e), timed: e.c === 'stretching' });
    if ('error' in r) {
      setError(r.error);
      return;
    }
    onCustomChange(r.list);
    if (single) onPick([r.exercise.id]);
    else setPicked((p) => [...p, r.exercise.id]);
    onCreated?.(r.exercise.id);
  };

  const toggle = (id: string) => (single ? onPick([id]) : setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])));

  const create = () => {
    const r = addCustomExercise(custom, { name, muscle, equipment, timed });
    if ('error' in r) {
      setError(r.error);
      return;
    }
    onCustomChange(r.list);
    setPicked((p) => [...p, r.exercise.id]);
    setCreating(false);
    onCreated?.(r.exercise.id);
    setName('');
    setTimed(false);
    setError('');
    setFilter('all');
    setQuery('');
  };

  const chips: { id: typeof filter; label: string }[] = [
    { id: 'all', label: tr('lift.ex.all') },
    { id: 'recent', label: tr('lift.ex.recent') },
    { id: 'mine', label: tr('lift.ex.mine') },
    { id: 'library', label: tr('lift.ex.library') },
    ...LIBRARY_GROUPS.map((g) => ({ id: g as MuscleGroup, label: g })),
  ];

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: 'var(--l-bg)' }}>
      <div className="l-header">
        <button type="button" className="l-icon-btn -ml-1" onClick={onClose} aria-label="Cancel">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="text-base font-bold">{title}</div>
        {single ? (
          <span aria-hidden="true" className="w-10" />
        ) : (
          <button type="button" className="l-btn l-btn-primary" disabled={picked.length === 0} onClick={() => onPick(picked)}>
            Add{picked.length > 0 ? ` (${picked.length})` : ''}
          </button>
        )}
      </div>
      <div className="flex-none space-y-2 px-4 pt-3">
        <div className="relative">
          <Search className="l-dim pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
          <input aria-label="Search exercises" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('lift.ex.search')} className="h-11 w-full pl-9 pr-3 text-sm" />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by muscle">
          {chips.map((c) => (
            <button key={c.id} type="button" className="l-chip" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <button type="button" className="l-btn l-btn-quiet !justify-start !px-0" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create exercise
        </button>
      </div>
      {filter === 'library' && (
        <ul className="l-scroll !pt-1" aria-label="Library exercises">
          {!lib && !libError && <li className="l-dim py-10 text-center text-sm">Opening the library…</li>}
          {libError && <li className="py-10 text-center text-sm" role="alert">The library could not be opened.</li>}
          {libList.map((e) => (
            <li key={e.n}>
              <button
                type="button"
                onClick={() => useLibraryEntry(e)}
                className="flex min-h-[56px] w-full items-center gap-3 border-b py-2 text-left"
                style={{ borderColor: 'var(--l-line)', background: 'transparent', color: 'var(--l-text)' }}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border" style={{ borderColor: 'var(--l-line)' }} aria-hidden="true">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{e.n}</span>
                  <span className="l-dim block truncate text-xs">
                    {entryGroup(e)} · {entryEquipment(e)} · {e.p.slice(0, 2).join(', ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {lib && libList.length === 0 && <li className="l-dim py-10 text-center text-sm">No library exercise matches.</li>}
          {lib && libList.length >= 80 && <li className="l-dim py-3 text-center text-xs">Showing the first 80. Search to narrow it down.</li>}
          {error && (
            <li role="alert" className="py-2 text-sm" style={{ color: 'var(--l-fail)' }}>
              {error}
            </li>
          )}
        </ul>
      )}
      <ul className="l-scroll !pt-1" aria-label="Exercises" hidden={filter === 'library'}>
        {(filter === 'library' ? [] : list).map((e) => {
          const there = already.includes(e.id);
          const on = picked.includes(e.id) || there;
          return (
            <li key={e.id}>
              <button
                type="button"
                disabled={there}
                onClick={() => toggle(e.id)}
                aria-pressed={on}
                className="flex min-h-[56px] w-full items-center gap-3 border-b py-2 text-left disabled:opacity-50"
                style={{ borderColor: 'var(--l-line)', background: 'transparent', color: 'var(--l-text)' }}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border" style={{ borderColor: on ? 'var(--l-fill)' : 'var(--l-line)', background: on ? 'var(--l-fill)' : 'transparent', color: 'var(--l-on-fill)' }} aria-hidden="true">
                  {on && <Check className="h-4 w-4" strokeWidth={3} />}
                </span>
                <MuscleBadge group={e.muscle} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">
                    {e.name}
                    {e.custom && <span className="l-dim ml-2 text-[11px] font-semibold uppercase">Custom</span>}
                  </span>
                  <span className="l-dim block truncate text-xs">
                    {e.muscle} · {e.equipment}
                    {there ? ' · already in this workout' : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && (
          <li className="py-10 text-center">
            <p className="l-dim text-sm">{filter === 'recent' ? 'Nothing here until you have done a workout.' : 'No exercises match.'}</p>
            <button type="button" className="l-btn l-btn-primary mt-4" onClick={() => { setName(query.trim()); setCreating(true); }}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create {query.trim() ? `“${query.trim()}”` : 'an exercise'}
            </button>
          </li>
        )}
      </ul>

      <Sheet open={creating} onClose={() => { setCreating(false); setError(''); }} title="Create exercise">
        <div className="space-y-4">
          <div>
            <label htmlFor="ce-name" className="l-dim text-xs font-semibold">
              Name
            </label>
            <input id="ce-name" className="mt-1 h-11 w-full px-3 text-sm" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Zercher squat" autoComplete="off" />
          </div>
          <fieldset>
            <legend className="l-dim text-xs font-semibold">Muscle</legend>
            <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Muscle">
              {MUSCLE_GROUPS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={muscle === m} className="l-chip" onClick={() => setMuscle(m)}>
                  {m}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="l-dim text-xs font-semibold">Equipment</legend>
            <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Equipment">
              {EQUIPMENT.map((q) => (
                <button key={q} type="button" role="radio" aria-checked={equipment === q} className="l-chip" onClick={() => setEquipment(q)}>
                  {q}
                </button>
              ))}
            </div>
          </fieldset>
          <button type="button" role="switch" aria-checked={timed} onClick={() => setTimed((v) => !v)} className="flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-left" style={{ borderColor: 'var(--l-line)', background: 'transparent', color: 'var(--l-text)' }}>
            <span>
              <span className="block text-sm font-semibold">Done for time</span>
              <span className="l-dim block text-xs">Log seconds held (a plank) instead of reps</span>
            </span>
            <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: timed ? 'var(--l-fill)' : 'var(--l-s2)', color: timed ? 'var(--l-on-fill)' : 'var(--l-dim-s2)' }}>
              {timed ? 'On' : 'Off'}
            </span>
          </button>
          {error && (
            <p role="alert" className="text-sm" style={{ color: 'var(--l-fail)' }}>
              {error}
            </p>
          )}
          <button type="button" className="l-btn l-btn-primary w-full" onClick={create}>
            Create exercise
          </button>
        </div>
      </Sheet>
    </div>
  );
};
