import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { Exercise, Routine, RoutineSet, UserProfile } from '../types/tracking';
import { getExercise, isTimedExercise } from '../data/exercises';
import { previousSets } from '../lib/lifting';
import { cleanTargets } from '../lib/routines';
import { cleanDays } from '../lib/liftSchedule';
import { useLang, useT } from '../lib/i18n';
import { useProgressionRules } from '../lib/progressionStore';
import { displayToKg, kgToDisplay, weightUnit } from '../lib/units';
import { ExercisePicker } from './ExercisePicker';
import { useBack } from './back';

interface RowText {
  reps: string;
  weight: string;
  /** Seconds, for a timed exercise. */
  sec?: string;
}

interface EditorProps {
  routine: Routine;
  profile: UserProfile;
  workouts: WorkoutSession[];
  custom: Exercise[];
  onCustomChange: (list: Exercise[]) => void;
  onSave: (r: Routine) => void;
  onClose: () => void;
}

/**
 * Change a routine after it is saved: its name, which exercises are in it and in what order, and for each one how many sets, the reps
 * and the weight to start from, plus an optional automatic increase (see lib/progression).
 */
export const RoutineEditor: React.FC<EditorProps> = ({ routine, profile, workouts, custom, onCustomChange, onSave, onClose }) => {
  const units = profile.units;
  const unit = weightUnit(units);
  const tr = useT();
  const lang = useLang();
  // Monday first; 1 January 2024 was a Monday.
  const dayShort = (i: number) => new Date(2024, 0, 1 + i).toLocaleDateString(lang, { weekday: 'short' });
  const dayLong = (i: number) => new Date(2024, 0, 1 + i).toLocaleDateString(lang, { weekday: 'long' });
  const show = (kg: number) => (kg > 0 ? String(kgToDisplay(kg, units)) : '');
  const [picking, setPicking] = useState(false);
  useBack(!picking, onClose);

  const rowsFor = (id: string): RowText[] => {
    const t = routine.targets?.[id];
    if (t?.length) return t.map((s) => ({ reps: s.reps > 0 ? String(s.reps) : '', weight: show(s.weightKg), ...(s.seconds ? { sec: String(s.seconds) } : {}) }));
    const last = previousSets(workouts, id)?.sets.filter((s) => s.kind !== 'warmup');
    if (last?.length) return last.map((s) => ({ reps: s.reps > 0 ? String(s.reps) : '', weight: show(s.weightKg), ...(s.seconds ? { sec: String(s.seconds) } : {}) }));
    return [{ reps: '', weight: '' }, { reps: '', weight: '' }, { reps: '', weight: '' }];
  };

  const [name, setName] = useState(routine.name);
  const [ids, setIds] = useState<string[]>(routine.exerciseIds);
  const [rows, setRows] = useState<Record<string, RowText[]>>(() => Object.fromEntries(routine.exerciseIds.map((id) => [id, rowsFor(id)])));
  const [rules, setRuleFor] = useProgressionRules();
  const [days, setDays] = useState<number[]>(cleanDays(routine.days));

  const patchRow = (id: string, i: number, patch: Partial<RowText>) => setRows((r) => ({ ...r, [id]: r[id].map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const addSet = (id: string) =>
    setRows((r) => {
      const last = r[id][r[id].length - 1];
      return { ...r, [id]: [...r[id], { reps: last?.reps ?? '', weight: last?.weight ?? '', ...(last?.sec ? { sec: last.sec } : {}) }] };
    });
  const removeSet = (id: string, i: number) => setRows((r) => ({ ...r, [id]: r[id].length > 1 ? r[id].filter((_, j) => j !== i) : r[id] }));
  const move = (i: number, dir: -1 | 1) =>
    setIds((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const remove = (id: string) => setIds((list) => list.filter((x) => x !== id));
  const add = (picked: string[]) => {
    const fresh = picked.filter((id) => !ids.includes(id));
    setIds((list) => [...list, ...fresh]);
    setRows((r) => ({ ...r, ...Object.fromEntries(fresh.map((id) => [id, rowsFor(id)])) }));
    setPicking(false);
  };

  const save = () => {
    const targets: Record<string, RoutineSet[]> = {};
    for (const id of ids) {
      const timed = isTimedExercise(getExercise(id));
      const sets = (rows[id] ?? [])
        .map((r): RoutineSet => ({
          reps: timed ? 0 : Math.max(0, Math.round(parseFloat(r.reps) || 0)),
          weightKg: Math.max(0, displayToKg(parseFloat(r.weight) || 0, units)),
          ...(timed && parseFloat(r.sec ?? '') > 0 ? { seconds: Math.round(parseFloat(r.sec ?? '')) } : {}),
        }));
      // Every row is a set to do, even one still empty: the number of sets is part of the plan.
      if (sets.length) targets[id] = sets;
    }
    onSave({ ...routine, name: name.trim() || routine.name, exerciseIds: ids, targets: cleanTargets(ids, targets), days: days.length ? days : undefined });
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: 'var(--l-bg)' }} role="dialog" aria-modal="true" aria-label={tr('re.title')}>
      <div className="l-header">
        <button type="button" className="l-icon-btn -ml-1" onClick={onClose} aria-label={tr('re.cancel')}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="text-base font-bold">{tr('re.title')}</div>
        <button type="button" className="l-btn l-btn-primary" onClick={save} disabled={ids.length === 0}>
          {tr('common.save')}
        </button>
      </div>
      <div className="l-scroll">
        <label htmlFor="re-name" className="sr-only">
          {tr('re.name')}
        </label>
        <input id="re-name" className="mt-3 h-11 w-full px-3 text-base font-semibold" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />

        <fieldset className="mt-4">
          <legend className="l-dim text-xs font-semibold">{tr('re.days')}</legend>
          <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label={tr('re.days')}>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <button key={i} type="button" className="l-chip" aria-pressed={days.includes(i)} aria-label={dayLong(i)} onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort((a, b) => a - b)))}>
                {dayShort(i)}
              </button>
            ))}
          </div>
          <p className="l-dim mt-1 text-xs">{tr('re.daysNote')}</p>
        </fieldset>

        {ids.map((id, ei) => {
          const ex = getExercise(id);
          const timed = isTimedExercise(ex);
          const rule = rules[id];
          return (
            <section key={id} className="l-card mt-4 p-3" aria-label={ex?.name ?? id}>
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold">{ex?.name ?? id}</div>
                  {ex && (
                    <div className="l-dim text-xs">
                      {ex.muscle} · {ex.equipment}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center">
                  <button type="button" className="l-icon-btn" onClick={() => move(ei, -1)} disabled={ei === 0} aria-label={tr('re.up', { name: ex?.name ?? id })}>
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" className="l-icon-btn" onClick={() => move(ei, 1)} disabled={ei === ids.length - 1} aria-label={tr('re.down', { name: ex?.name ?? id })}>
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" className="l-icon-btn" onClick={() => remove(id)} aria-label={tr('re.remove', { name: ex?.name ?? id })}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="l-dim mt-2 grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2 text-[11px] font-bold uppercase" aria-hidden="true">
                <span className="text-center">{tr('re.set')}</span>
                <span className="text-center">{timed ? `+${unit}` : unit}</span>
                <span className="text-center">{timed ? tr('re.seconds') : tr('re.reps')}</span>
                <span />
              </div>
              {(rows[id] ?? []).map((r, i) => (
                <div key={i} className="mt-1 grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2">
                  <span className="l-dim text-center text-sm font-bold">{i + 1}</span>
                  <input aria-label={tr('re.setWeight', { name: ex?.name ?? id, n: i + 1 })} inputMode="decimal" className="l-num-input" onFocus={(e) => e.target.select()} value={r.weight} placeholder="0" onChange={(e) => patchRow(id, i, { weight: e.target.value })} />
                  {timed ? (
                    <input aria-label={tr('re.setSeconds', { name: ex?.name ?? id, n: i + 1 })} inputMode="numeric" className="l-num-input" onFocus={(e) => e.target.select()} value={r.sec ?? ''} placeholder="30" onChange={(e) => patchRow(id, i, { sec: e.target.value })} />
                  ) : (
                    <input aria-label={tr('re.setReps', { name: ex?.name ?? id, n: i + 1 })} inputMode="numeric" className="l-num-input" onFocus={(e) => e.target.select()} value={r.reps} placeholder="0" onChange={(e) => patchRow(id, i, { reps: e.target.value })} />
                  )}
                  <button type="button" className="l-icon-btn" onClick={() => removeSet(id, i)} disabled={(rows[id] ?? []).length <= 1} aria-label={tr('re.removeSet', { n: i + 1, name: ex?.name ?? id })}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button type="button" className="l-btn mt-2 w-full" onClick={() => addSet(id)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {tr('re.addSet')}
              </button>

              {!timed && (
                <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--l-line)' }}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!rule}
                    className="flex min-h-10 w-full items-center justify-between text-left"
                    style={{ background: 'transparent', border: 0, color: 'var(--l-text)' }}
                    onClick={() => setRuleFor(id, rule ? null : { step: units === 'imperial' ? 5 : 2.5, reps: 8 })}
                  >
                    <span>
                      <span className="block text-sm font-semibold">{tr('re.auto')}</span>
                      <span className="l-dim block text-xs">{tr('re.autoSub')}</span>
                    </span>
                    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: rule ? 'var(--l-fill)' : 'var(--l-s2)', color: rule ? 'var(--l-on-fill)' : 'var(--l-dim-s2)' }}>
                      {rule ? tr('re.on') : tr('re.off')}
                    </span>
                  </button>
                  {rule && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <span>{tr('re.add')}</span>
                      <input aria-label={tr('re.increaseIn', { name: ex?.name ?? id, unit })} inputMode="decimal" className="l-num-input !w-20" onFocus={(e) => e.target.select()} value={String(rule.step)} onChange={(e) => setRuleFor(id, { ...rule, step: parseFloat(e.target.value) || 0 })} />
                      <span>{tr('re.whenReaches', { unit })}</span>
                      <input aria-label={tr('re.repsToReach', { name: ex?.name ?? id })} inputMode="numeric" className="l-num-input !w-16" onFocus={(e) => e.target.select()} value={String(rule.reps)} onChange={(e) => setRuleFor(id, { ...rule, reps: Math.round(parseFloat(e.target.value) || 0) })} />
                      <span>{tr('re.repsWord')}</span>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}

        <button type="button" className="l-btn l-btn-primary mt-4 w-full" onClick={() => setPicking(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {tr('re.addExercise')}
        </button>
        <div className="h-8" />
      </div>
      {picking && <ExercisePicker already={ids} workouts={workouts} custom={custom} onCustomChange={onCustomChange} onPick={add} onClose={() => setPicking(false)} />}
    </div>
  );
};
