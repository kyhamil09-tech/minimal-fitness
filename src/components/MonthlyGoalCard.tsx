import React, { useState } from 'react';
import { Target, Pencil, X } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { UnitSystem } from '../types/tracking';
import { WorkoutSession } from '../types/health';
import { KIND_LABEL, MonthlyGoal, MonthlyGoalKind, SUGGESTED_TARGETS, formatGoalValue, goalUnit, monthProgress } from '../lib/monthlyGoal';
import { KM_PER_MI } from '../lib/units';

interface Props {
  theme: ColorPalette;
  workouts: WorkoutSession[];
  units: UnitSystem;
  goal: MonthlyGoal | null | undefined;
  onChange: (goal: MonthlyGoal | null) => void;
}

const STATE_TEXT = {
  done: 'Goal reached. Nice work.',
  ahead: 'Ahead of pace',
  'on-track': 'On track',
  behind: 'Behind pace',
} as const;
const STATE_COLOR = { done: '#6EE7B7', ahead: '#6EE7B7', 'on-track': '#8AB4F8', behind: '#FBBF24' } as const;

const show = formatGoalValue;
const unitFor = goalUnit;

/** The month's target with a progress bar, a mark for where you should be by today, and a short verdict. */
export const MonthlyGoalCard: React.FC<Props> = ({ theme, workouts, units, goal, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<MonthlyGoalKind>(goal?.kind ?? 'distance');
  const [text, setText] = useState('');

  const startEdit = () => {
    setKind(goal?.kind ?? 'distance');
    setText(goal ? show(goal.kind, goal.target, units) : '');
    setEditing(true);
  };

  const save = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    const target = kind === 'distance' && units === 'imperial' ? value * KM_PER_MI : value;
    onChange({ kind, target });
    setEditing(false);
  };

  const presets = SUGGESTED_TARGETS[kind].map((km) => (kind === 'distance' && units === 'imperial' ? Math.round(km / KM_PER_MI / 5) * 5 : km));

  const header = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4" style={{ color: theme.primary }} />
        <span className="stat-label">{new Date().toLocaleDateString(undefined, { month: 'long' })} goal</span>
      </div>
      {goal && !editing && (
        <button type="button" onClick={startEdit} aria-label="Change monthly goal" className="text-neutral-400 hover:text-white p-1">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      {editing && (
        <button type="button" onClick={() => setEditing(false)} aria-label="Close" className="text-neutral-400 hover:text-white p-1">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  if (editing) {
    return (
      <section className="rounded-[28px] border p-5 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
        {header}
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(KIND_LABEL) as MonthlyGoalKind[]).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setText(''); }} className="sport-pill !py-1.5 !px-3.5 !text-xs">
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {presets.map((p) => (
            <button key={p} type="button" onClick={() => save(p)} className="px-3.5 py-1.5 rounded-full glass-chip text-xs font-bold text-white">
              {p} {unitFor(kind, units)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Your own target (${unitFor(kind, units)})`}
            aria-label="Monthly target"
            className="flex-1 min-w-0 px-3 py-2 text-sm"
          />
          <button type="button" onClick={() => save(Number(text))} disabled={!(Number(text) > 0)} className="px-4 rounded-xl text-sm font-bold text-black disabled:opacity-40" style={{ backgroundColor: theme.primary }}>
            Save
          </button>
        </div>
        {goal && (
          <button type="button" onClick={() => { onChange(null); setEditing(false); }} className="text-[11px] text-neutral-500 hover:text-rose-400">
            Remove this goal
          </button>
        )}
      </section>
    );
  }

  if (!goal) {
    return (
      <section className="rounded-[28px] border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
        {header}
        <p className="text-sm text-neutral-300 mt-2 leading-relaxed">Pick a target for the month: distance, number of workouts or active minutes. Progress shows here.</p>
        <button type="button" onClick={startEdit} className="mt-3 px-4 py-2 rounded-full text-xs font-extrabold text-black" style={{ backgroundColor: theme.primary }}>
          Set a monthly goal
        </button>
      </section>
    );
  }

  const p = monthProgress(workouts, goal);
  const color = STATE_COLOR[p.state];
  const u = unitFor(goal.kind, units);
  return (
    <section className="rounded-[28px] border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      {header}
      <div className="flex items-end gap-2 mt-3">
        <span className="hero-num text-[3.4rem]">{show(goal.kind, p.done, units)}</span>
        <span className="text-sm text-neutral-400 pb-2 font-semibold">
          / {show(goal.kind, goal.target, units)} {u}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-white/10 mt-2 overflow-visible" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.pct} aria-label="Monthly goal progress">
        <div className="h-full rounded-full" style={{ width: `${p.pct}%`, backgroundColor: color }} />
        {p.state !== 'done' && <div className="absolute -top-1 w-0.5 bg-white/70" style={{ left: `${p.monthPct}%`, height: 18 }} title="Where you would be at an even pace" />}
      </div>
      <div className="flex items-center justify-between mt-2 text-[12px]">
        <span className="font-bold" style={{ color }}>
          {STATE_TEXT[p.state]}
        </span>
        <span className="text-neutral-400">{p.daysLeft} day{p.daysLeft === 1 ? '' : 's'} left</span>
      </div>
      {p.state !== 'done' && (
        <p className="text-[11px] text-neutral-500 mt-1">
          About {show(goal.kind, p.perDayNeeded, units)} {u} a day from here.
          {p.projected > 0 && ` At this pace you finish near ${show(goal.kind, p.projected, units)} ${u}.`}
        </p>
      )}
    </section>
  );
};
