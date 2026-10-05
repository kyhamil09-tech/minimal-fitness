import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Dumbbell, Plus, Search, Trash2, X } from 'lucide-react';
import { Modal, fieldClass } from './ui/Modal';
import { EXERCISES, MUSCLE_GROUPS, getExercise } from '../data/exercises';
import { MuscleGroup, WorkoutPlan } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import {
  DesignedDay,
  GEAR_INFO,
  GOAL_INFO,
  LiftGear,
  LiftGoal,
  LiftLevel,
  LiftSplit,
  SPLIT_INFO,
  buildLiftingPlan,
  clampDays,
  designFromPlan,
  planFromDesign,
} from '../lib/liftingPlan';

type Mode = 'quick' | 'design' | 'routine';
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const emptyWeek = (): DesignedDay[] => Array.from({ length: 7 }, () => ({ title: '', exerciseIds: [] }));

interface Props {
  isOpen: boolean;
  onClose: () => void;
  theme: ColorPalette;
  initialMode?: Mode;
  /** A hand-made plan being changed. */
  editing?: WorkoutPlan | null;
  onCreatePlan: (plan: WorkoutPlan, opts?: { keepStart?: boolean }) => void;
  onSaveRoutine: (name: string, exerciseIds: string[]) => void;
}

/** A searchable list of every exercise; tapping one adds it. */
const ExerciseAdder: React.FC<{ chosen: string[]; onAdd: (id: string) => void; theme: ColorPalette }> = ({ chosen, onAdd, theme }) => {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'All'>('All');
  const list = useMemo(
    () => EXERCISES.filter((e) => (muscle === 'All' || e.muscle === muscle) && (q.trim() === '' || e.name.toLowerCase().includes(q.trim().toLowerCase()))),
    [q, muscle]
  );
  return (
    <div className="rounded-2xl border border-[#1A1E26] bg-black/40 p-3 space-y-2">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input aria-label="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" className={fieldClass + ' !pl-8'} />
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {(['All', ...MUSCLE_GROUPS] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMuscle(m)}
            aria-pressed={muscle === m}
            className="px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap border"
            style={{ background: muscle === m ? theme.primary : 'transparent', color: muscle === m ? 'var(--on-accent)' : '#9aa3b2', borderColor: muscle === m ? 'transparent' : '#1A1E26' }}
          >
            {m}
          </button>
        ))}
      </div>
      <ul className="max-h-52 overflow-y-auto divide-y divide-[#1A1E26]">
        {list.map((e) => {
          const on = chosen.includes(e.id);
          return (
            <li key={e.id}>
              <button onClick={() => !on && onAdd(e.id)} disabled={on} className="w-full text-left py-2 px-1 flex items-center justify-between gap-2 disabled:opacity-40">
                <span className="text-xs text-white truncate">{e.name}</span>
                <span className="text-[10px] font-mono text-neutral-500 shrink-0">{on ? 'Added' : `${e.muscle} · ${e.equipment}`}</span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="py-3 text-center text-xs text-neutral-500">No matches</li>}
      </ul>
    </div>
  );
};

/** The chosen exercises in order, with move up, move down and remove. */
const ExerciseOrder: React.FC<{ ids: string[]; onChange: (ids: string[]) => void }> = ({ ids, onChange }) => {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    const next = ids.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  if (ids.length === 0) return <p className="text-[11px] text-neutral-500">No exercises yet. Add some below.</p>;
  return (
    <ol className="space-y-1.5">
      {ids.map((id, i) => (
        <li key={id} className="flex items-center gap-2 rounded-xl border border-[#1A1E26] bg-black/40 px-2.5 py-1.5">
          <span className="w-5 text-[11px] font-mono text-neutral-500">{i + 1}</span>
          <span className="flex-1 min-w-0 text-xs text-white truncate">{getExercise(id)?.name ?? id}</span>
          <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1 text-neutral-400 disabled:opacity-30">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => move(i, 1)} disabled={i === ids.length - 1} aria-label="Move down" className="p-1 text-neutral-400 disabled:opacity-30">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onChange(ids.filter((x) => x !== id))} aria-label={`Remove ${getExercise(id)?.name ?? id}`} className="p-1 text-neutral-500 hover:text-rose-400">
            <X className="w-3.5 h-3.5" />
          </button>
        </li>
      ))}
    </ol>
  );
};

const Pills = <T extends string | number>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) => (
  <div className="flex gap-2 mt-1.5 flex-wrap" role="group" aria-label={label}>
    {options.map((o) => (
      <button key={String(o.id)} onClick={() => onChange(o.id)} aria-pressed={value === o.id} className="sport-pill !py-2 !text-xs">
        {o.label}
      </button>
    ))}
  </div>
);

/** Make a weight-lifting plan (quick build or by hand) or a single routine. */
export const LiftingBuilder: React.FC<Props> = ({ isOpen, onClose, theme, initialMode = 'quick', editing = null, onCreatePlan, onSaveRoutine }) => {
  const [mode, setMode] = useState<Mode>(initialMode);

  // quick build
  const [split, setSplit] = useState<LiftSplit>('ppl');
  const [days, setDays] = useState(4);
  const [goal, setGoal] = useState<LiftGoal>('muscle');
  const [gear, setGear] = useState<LiftGear>('gym');
  const [level, setLevel] = useState<LiftLevel>('Intermediate');
  const [weeks, setWeeks] = useState(12);

  // design
  const [name, setName] = useState('');
  const [designWeeks, setDesignWeeks] = useState(8);
  const [week, setWeek] = useState<DesignedDay[]>(emptyWeek());
  const [openDay, setOpenDay] = useState<number | null>(null);

  // routine
  const [routineName, setRoutineName] = useState('');
  const [routineIds, setRoutineIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setMode('design');
      setName(editing.name);
      setDesignWeeks(editing.weeks);
      setWeek(designFromPlan(editing));
      setOpenDay(null);
    } else {
      setMode(initialMode);
      setName('');
      setDesignWeeks(8);
      setWeek(emptyWeek());
      setOpenDay(null);
    }
    setRoutineName('');
    setRoutineIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const d = clampDays(split, days);
  const preview = useMemo(() => buildLiftingPlan({ split, daysPerWeek: d, goal, gear, level, weeks }, 0), [split, d, goal, gear, level, weeks]);
  const lifting = preview.days.filter((x) => x.kind === 'strength');

  const setDay = (i: number, patch: Partial<DesignedDay>) => setWeek((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const designLifting = week.filter((x) => x.exerciseIds.length > 0).length;

  const quickCreate = () => {
    onCreatePlan(buildLiftingPlan({ split, daysPerWeek: d, goal, gear, level, weeks }));
    onClose();
  };
  const customize = () => {
    setName(preview.name);
    setDesignWeeks(preview.weeks);
    setWeek(designFromPlan(preview));
    setOpenDay(null);
    setMode('design');
  };
  const designCreate = () => {
    if (designLifting === 0) return;
    onCreatePlan(planFromDesign(name, designWeeks, week, Date.now(), editing?.id), editing ? { keepStart: true } : undefined);
    onClose();
  };
  const routineCreate = () => {
    if (!routineName.trim() || routineIds.length === 0) return;
    onSaveRoutine(routineName.trim(), routineIds);
    onClose();
  };

  const modes: { id: Mode; label: string }[] = editing ? [{ id: 'design', label: 'Edit plan' }] : [{ id: 'quick', label: 'Quick build' }, { id: 'design', label: 'Design my own' }, { id: 'routine', label: 'One routine' }];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? `Edit ${editing.name}` : 'Lifting plans'} icon={<Dumbbell className="w-4 h-4" style={{ color: theme.primary }} />}>
      <div className="space-y-4">
        {modes.length > 1 && (
          <div className="grid gap-1 p-1 rounded-xl border border-[#1A1E26] bg-black/40" style={{ gridTemplateColumns: `repeat(${modes.length}, 1fr)` }} role="tablist" aria-label="How to make it">
            {modes.map((m) => (
              <button
                key={m.id}
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => setMode(m.id)}
                className="py-2 rounded-lg text-[11px] font-bold"
                style={{ background: mode === m.id ? theme.primary : 'transparent', color: mode === m.id ? 'var(--on-accent)' : '#9aa3b2' }}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {mode === 'quick' && (
          <div className="space-y-4">
            <div>
              <span className="stat-label">Split</span>
              <Pills value={split} label="Split" onChange={(s) => { setSplit(s); setDays(clampDays(s, days)); }} options={(Object.keys(SPLIT_INFO) as LiftSplit[]).map((s) => ({ id: s, label: SPLIT_INFO[s].label }))} />
              <p className="text-[11px] text-neutral-500 mt-1.5">{SPLIT_INFO[split].blurb}</p>
            </div>
            <div>
              <span className="stat-label">Days a week</span>
              <Pills value={d} label="Days a week" onChange={setDays} options={[2, 3, 4, 5, 6].filter((n) => n >= SPLIT_INFO[split].minDays && n <= SPLIT_INFO[split].maxDays).map((n) => ({ id: n, label: String(n) }))} />
            </div>
            <div>
              <span className="stat-label">Goal</span>
              <Pills value={goal} label="Goal" onChange={setGoal} options={(Object.keys(GOAL_INFO) as LiftGoal[]).map((g) => ({ id: g, label: GOAL_INFO[g].label }))} />
              <p className="text-[11px] text-neutral-500 mt-1.5">{GOAL_INFO[goal].blurb}</p>
            </div>
            <div>
              <span className="stat-label">Equipment</span>
              <Pills value={gear} label="Equipment" onChange={setGear} options={(Object.keys(GEAR_INFO) as LiftGear[]).map((g) => ({ id: g, label: GEAR_INFO[g] }))} />
            </div>
            <div>
              <span className="stat-label">Experience</span>
              <Pills value={level} label="Experience" onChange={setLevel} options={(['Beginner', 'Intermediate', 'Advanced'] as LiftLevel[]).map((l) => ({ id: l, label: l }))} />
            </div>
            <div>
              <span className="stat-label">Weeks</span>
              <div className="flex items-center gap-4 mt-1.5">
                <button onClick={() => setWeeks(Math.max(4, weeks - 1))} aria-label="Fewer weeks" className="w-10 h-10 rounded-full glass-chip text-white text-lg font-bold">−</button>
                <span className="hero-num text-[2.4rem]">{weeks}</span>
                <button onClick={() => setWeeks(Math.min(16, weeks + 1))} aria-label="More weeks" className="w-10 h-10 rounded-full glass-chip text-white text-lg font-bold">+</button>
              </div>
            </div>

            <div>
              <span className="stat-label">Your week</span>
              <ul className="mt-1.5 divide-y divide-[#1A1E26] rounded-2xl border border-[#1A1E26] overflow-hidden">
                {preview.days.map((x) => (
                  <li key={x.day} className="px-3 py-2 bg-black/40">
                    <div className="text-xs font-semibold text-white flex gap-2">
                      <span className="font-mono text-neutral-500 w-8">{DAY_NAMES[x.day].slice(0, 3)}</span>
                      <span className="truncate">{x.title}</span>
                    </div>
                    {x.kind === 'strength' && (
                      <div className="text-[10px] text-[#7E889B] ml-10 leading-snug">{(x.exerciseIds ?? []).map((id) => getExercise(id)?.name).filter(Boolean).join(' · ')}</div>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-neutral-500 mt-1.5">{lifting.length} lifting days. The exercises rotate a little from week to week, and every fourth week is a lighter deload. The logger suggests your weights from what you lifted last time.</p>
            </div>

            <div className="flex gap-2">
              <button onClick={quickCreate} className="flex-1 py-3 rounded-full text-sm font-extrabold" style={{ background: theme.primary, color: 'var(--on-accent)' }}>
                Start this plan
              </button>
              <button onClick={customize} className="px-4 py-3 rounded-full glass-chip text-xs font-bold text-neutral-200">
                Customize first
              </button>
            </div>
          </div>
        )}

        {mode === 'design' && (
          <div className="space-y-4">
            <label className="block">
              <span className="stat-label">Plan name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My lifting plan" aria-label="Plan name" className={fieldClass + ' mt-1'} />
            </label>
            <div>
              <span className="stat-label">Weeks</span>
              <div className="flex items-center gap-4 mt-1.5">
                <button onClick={() => setDesignWeeks(Math.max(1, designWeeks - 1))} aria-label="Fewer weeks" className="w-10 h-10 rounded-full glass-chip text-white text-lg font-bold">−</button>
                <span className="hero-num text-[2.4rem]">{designWeeks}</span>
                <button onClick={() => setDesignWeeks(Math.min(52, designWeeks + 1))} aria-label="More weeks" className="w-10 h-10 rounded-full glass-chip text-white text-lg font-bold">+</button>
              </div>
            </div>
            <div className="space-y-2">
              <span className="stat-label">Your week (tap a day to add exercises)</span>
              {week.map((day, i) => {
                const on = day.exerciseIds.length > 0;
                const isOpen = openDay === i;
                return (
                  <div key={i} className="rounded-2xl border" style={{ borderColor: isOpen ? theme.primary : '#1A1E26', background: 'rgba(0,0,0,0.35)' }}>
                    <button onClick={() => setOpenDay(isOpen ? null : i)} aria-expanded={isOpen} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left">
                      <span className="min-w-0">
                        <span className="text-xs font-bold text-white">{DAY_NAMES[i]}</span>
                        <span className="block text-[11px] text-[#7E889B] truncate">{on ? `${day.title || 'Strength'} · ${day.exerciseIds.length} exercises` : 'Rest day'}</span>
                      </span>
                      <Plus className={`w-4 h-4 shrink-0 text-neutral-400 transition-transform ${isOpen ? 'rotate-45' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 space-y-3">
                        <input value={day.title} onChange={(e) => setDay(i, { title: e.target.value })} placeholder="Day name, e.g. Push" aria-label={`${DAY_NAMES[i]} name`} className={fieldClass} />
                        <ExerciseOrder ids={day.exerciseIds} onChange={(ids) => setDay(i, { exerciseIds: ids })} />
                        <ExerciseAdder chosen={day.exerciseIds} onAdd={(id) => setDay(i, { exerciseIds: [...day.exerciseIds, id] })} theme={theme} />
                        {on && (
                          <button onClick={() => setDay(i, { title: '', exerciseIds: [] })} className="text-[11px] font-bold text-neutral-500 hover:text-rose-400 flex items-center gap-1">
                            <Trash2 className="w-3.5 h-3.5" /> Make this a rest day
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={designCreate}
              disabled={designLifting === 0}
              className="w-full py-3 rounded-full text-sm font-extrabold disabled:opacity-40"
              style={{ background: theme.primary, color: 'var(--on-accent)' }}
            >
              {editing ? 'Save changes' : 'Start this plan'}
            </button>
            {designLifting === 0 && <p className="text-[11px] text-neutral-500 text-center">Add exercises to at least one day.</p>}
          </div>
        )}

        {mode === 'routine' && (
          <div className="space-y-4">
            <p className="text-[11px] text-[#7E889B]">A routine is one saved workout you can start any time, on the phone or from your watch.</p>
            <label className="block">
              <span className="stat-label">Routine name</span>
              <input value={routineName} onChange={(e) => setRoutineName(e.target.value)} placeholder="e.g. Chest and triceps" aria-label="Routine name" className={fieldClass + ' mt-1'} />
            </label>
            <ExerciseOrder ids={routineIds} onChange={setRoutineIds} />
            <ExerciseAdder chosen={routineIds} onAdd={(id) => setRoutineIds((p) => [...p, id])} theme={theme} />
            <button onClick={routineCreate} disabled={!routineName.trim() || routineIds.length === 0} className="w-full py-3 rounded-full text-sm font-extrabold disabled:opacity-40" style={{ background: theme.primary, color: 'var(--on-accent)' }}>
              Save routine
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
