import React, { useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronUp, Dumbbell, Eye, Play, Plus, Trash2 } from 'lucide-react';
import { LiftingBuilder } from './LiftingBuilder';
import { CalendarSheet } from './CalendarSheet';
import { Preset, PresetPreview, PreviewAction } from './PresetPreview';
import { WorkoutSession, WorkoutType } from '../types/health';
import { ActivePlan, PlanDay, Routine, WorkoutPlan } from '../types/tracking';
import { STRENGTH_TEMPLATES } from '../data/templates';
import { ColorPalette } from '../types/theme';
import { BUILT_IN_PLANS, FOCUS_LABELS, PlanFocus, getPlan, planHasFocus } from '../data/plans';
import { getExercise } from '../data/exercises';
import { addDays, startOfMondayWeek as startOfWeek, toDateKey, weekdayIndex } from '../lib/dates';
import { workoutsOnDay } from '../lib/calc';
import { PlanLevel, RACE_INFO, RaceGoal, buildRacePlan, planDaysForWeek } from '../lib/planBuilder';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface PlansPanelProps {
  theme: ColorPalette;
  workouts: WorkoutSession[];
  activePlan: ActivePlan | null;
  routines: Routine[];
  onActivatePlan: (planId: string | null, plan?: WorkoutPlan, opts?: { keepStart?: boolean }) => void;
  onStartStrength: (exerciseIds: string[], title?: string) => void;
  onStartCardio: (type: WorkoutType, day?: PlanDay) => void;
  onDeleteRoutine: (id: string) => void;
  onSaveRoutine?: (name: string, exerciseIds: string[]) => void;
}

export const PlansPanel: React.FC<PlansPanelProps> = ({
  theme,
  workouts,
  activePlan,
  routines,
  onActivatePlan,
  onStartStrength,
  onStartCardio,
  onDeleteRoutine,
  onSaveRoutine,
}) => {
  const [open, setOpen] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [building, setBuilding] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [focus, setFocus] = useState<PlanFocus | 'all'>('all');
  const [raceGoal, setRaceGoal] = useState<RaceGoal>('10k');
  const [level, setLevel] = useState<PlanLevel>('Intermediate');
  const [perWeek, setPerWeek] = useState<3 | 4 | 5>(4);
  const [weeks, setWeeks] = useState(12);
  // The lifting plan and routine maker: which tab it opens on, and a hand-made plan being edited.
  const [builder, setBuilder] = useState<{ open: boolean; mode: 'quick' | 'design' | 'routine'; editing: WorkoutPlan | null }>({ open: false, mode: 'quick', editing: null });
  const [calOpen, setCalOpen] = useState(false);
  const plan = activePlan ? (activePlan.plan ?? getPlan(activePlan.planId)) : undefined;
  // A read-through of a plan, day, template or routine before starting it.
  const [preview, setPreview] = useState<{ preset: Preset; actions: PreviewAction[] } | null>(null);
  const closePreview = () => setPreview(null);

  const now = Date.now();
  const weekStart = toDateKey(startOfWeek(now));
  const today = weekdayIndex(now);
  const weekMs = 7 * 24 * 3600 * 1000;
  const weekNumber = plan && activePlan
    ? Math.floor((startOfWeek(now).getTime() - startOfWeek(activePlan.startedAt).getTime()) / weekMs) + 1
    : 0;
  const finished = !!plan && weekNumber > plan.weeks;
  const weekDays = plan ? planDaysForWeek(plan, weekNumber) : [];

  const info = RACE_INFO[raceGoal];
  const clampedWeeks = Math.max(info.minWeeks, Math.min(info.maxWeeks, weeks));
  // Calendar arithmetic (not milliseconds) so a daylight-saving change cannot land it on the wrong day.
  const raceDate = startOfWeek(now);
  raceDate.setDate(raceDate.getDate() + clampedWeeks * 7 - 1);

  const startDay = (d: PlanDay) => {
    if (d.kind === 'strength' && d.exerciseIds) onStartStrength(d.exerciseIds, d.title);
    else if (d.cardioType) onStartCardio(d.cardioType as WorkoutType, d);
  };

  const dayDetail = (d: PlanDay) => {
    if (d.kind === 'strength') return (d.exerciseIds || []).map((id) => getExercise(id)?.name).filter(Boolean).join(' · ');
    if (d.kind === 'rest') return 'Recovery day';
    const parts: string[] = [d.cardioType ?? ''];
    if (d.targetKm) parts.push(d.targetKm + ' km');
    else if (d.targetMinutes) parts.push(d.targetMinutes + ' min');
    return parts.filter(Boolean).join(' · ');
  };

  const createPlan = () => {
    const built = buildRacePlan({ goal: raceGoal, level, daysPerWeek: perWeek, weeks: clampedWeeks });
    onActivatePlan(built.id, built);
    setBuilding(false);
    setChoosing(false);
  };

  return (
    <section
      className="rounded-3xl border p-5 space-y-3"
      style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
    >
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between"
      >
        <span className="text-xs font-semibold text-[#9AA3B2] tracking-wider uppercase flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5" style={{ color: theme.primary }} />
          Plans & Routines
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
      </button>

      {open && (
        <div className="space-y-4">
          {!building && (
            <div className="rounded-2xl border p-3 flex items-center justify-between gap-3" style={{ borderColor: theme.primary, backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-start gap-2.5 min-w-0">
                <Dumbbell className="w-4 h-4 mt-0.5 shrink-0" style={{ color: theme.primary }} />
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-white">Build a lifting plan</h3>
                  <p className="text-xs text-[#9AA3B2] mt-0.5">Pick a split and goal, or design every day yourself.</p>
                </div>
              </div>
              <button onClick={() => setBuilder({ open: true, mode: 'quick', editing: null })} className="min-h-11 px-4 rounded-xl text-xs font-bold text-black shrink-0" style={{ backgroundColor: theme.primary }}>
                Build
              </button>
            </div>
          )}
          {plan && activePlan && !choosing && !building ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white">{plan.name}</h3>
                  <p className="text-xs font-mono text-[#9AA3B2]">
                    {finished ? `Completed ${plan.weeks} weeks` : `Week ${weekNumber} of ${plan.weeks}`} · {plan.level}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {plan.id.startsWith('plan-lift') && (
                    <button onClick={() => setBuilder({ open: true, mode: 'design', editing: plan })} className="text-xs underline text-neutral-400 hover:text-white">
                      Edit
                    </button>
                  )}
                  <button onClick={() => setCalOpen(true)} className="text-xs underline text-neutral-400 hover:text-white">
                    Calendar
                  </button>
                  <button onClick={() => setChoosing(true)} className="text-xs underline text-neutral-400 hover:text-white">
                    Change
                  </button>
                  <button onClick={() => onActivatePlan(null)} className="text-xs underline text-neutral-400 hover:text-white">
                    Stop
                  </button>
                </div>
              </div>

              <ul className="divide-y divide-[#1A1E26] rounded-2xl border border-[#1A1E26] overflow-hidden">
                {weekDays.map((d) => {
                  const key = addDays(weekStart, d.day);
                  const done = d.kind !== 'rest' && workoutsOnDay(workouts, key).length > 0;
                  const isToday = d.day === today;
                  return (
                    <li
                      key={d.day}
                      className="flex items-center justify-between gap-2 px-3 py-2.5 bg-black/40"
                      style={{ boxShadow: isToday ? `inset 2px 0 0 ${theme.primary}` : undefined }}
                    >
                      <button
                        className="min-w-0 text-left"
                        aria-label={`Preview ${d.title}`}
                        onClick={() =>
                          setPreview({
                            preset: { kind: 'day', day: d },
                            actions: d.kind !== 'rest' && !finished && !done ? [{ label: 'Start', primary: true, onClick: () => { closePreview(); startDay(d); } }] : [],
                          })
                        }
                      >
                        <div className="text-xs font-semibold text-white flex items-center gap-2">
                          <span className="font-mono text-neutral-400 w-7">{DAY_NAMES[d.day]}</span>
                          <span className="truncate">{d.title}</span>
                          {isToday && (
                            <span className="text-xs font-mono px-1.5 rounded" style={{ color: theme.primary, backgroundColor: `${theme.primary}20` }}>
                              TODAY
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#9AA3B2] ml-9 truncate">{dayDetail(d)}</div>
                      </button>
                      {done ? (
                        <Check className="w-4 h-4 shrink-0" style={{ color: theme.primary }} aria-label="Completed" />
                      ) : d.kind !== 'rest' && !finished ? (
                        <button
                          onClick={() => startDay(d)}
                          aria-label={`Start ${d.title}`}
                          className="min-h-11 px-3 rounded-xl text-xs font-bold text-black flex items-center gap-1 shrink-0"
                          style={{ backgroundColor: isToday ? theme.primary : '#CBD5E1' }}
                        >
                          <Play className="w-3 h-3 fill-black" /> Start
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : building ? (
            <div className="space-y-3">
              <p className="text-xs text-[#9AA3B2]">
                Build a plan for a race: long runs grow week by week, with a lighter week now and then, a taper and race day on the last Sunday.
              </p>
              <div>
                <span className="stat-label">Race</span>
                <div className="flex gap-2 mt-1.5 flex-wrap" role="group" aria-label="Race distance">
                  {(Object.keys(RACE_INFO) as RaceGoal[]).map((g) => (
                    <button
                      key={g}
                      onClick={() => {
                        setRaceGoal(g);
                        setWeeks(Math.max(RACE_INFO[g].minWeeks, Math.min(RACE_INFO[g].maxWeeks, weeks)));
                      }}
                      aria-pressed={raceGoal === g}
                      className="sport-pill !py-2 !text-xs"
                    >
                      {RACE_INFO[g].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="stat-label">Level</span>
                <div className="flex gap-2 mt-1.5 flex-wrap" role="group" aria-label="Level">
                  {(['Beginner', 'Intermediate', 'Advanced'] as PlanLevel[]).map((l) => (
                    <button key={l} onClick={() => setLevel(l)} aria-pressed={level === l} className="sport-pill !py-2 !text-xs">
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="stat-label">Runs per week</span>
                <div className="flex gap-2 mt-1.5" role="group" aria-label="Runs per week">
                  {([3, 4, 5] as const).map((n) => (
                    <button key={n} onClick={() => setPerWeek(n)} aria-pressed={perWeek === n} className="sport-pill !py-2 !text-xs">
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="stat-label">Weeks to race</span>
                <div className="flex items-center gap-4 mt-1.5">
                  <button onClick={() => setWeeks(Math.max(info.minWeeks, clampedWeeks - 1))} aria-label="Fewer weeks" className="w-11 h-11 rounded-full glass-chip text-white text-lg font-bold">
                    −
                  </button>
                  <span className="hero-num text-[2.4rem]">{clampedWeeks}</span>
                  <button onClick={() => setWeeks(Math.min(info.maxWeeks, clampedWeeks + 1))} aria-label="More weeks" className="w-11 h-11 rounded-full glass-chip text-white text-lg font-bold">
                    +
                  </button>
                </div>
                <p className="text-xs text-neutral-400 mt-1.5">
                  Race day: {raceDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={createPlan} className="flex-1 py-3 rounded-full text-sm font-extrabold" style={{ backgroundColor: theme.primary, color: '#000' }}>
                  Create plan
                </button>
                <button onClick={() => setBuilding(false)} className="px-4 py-3 rounded-full glass-chip text-xs font-bold text-neutral-300">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[#9AA3B2]">
                {choosing ? 'Pick a new program:' : 'Follow a structured program with a weekly schedule:'}
              </p>
              <div className="rounded-2xl border p-3 flex items-start justify-between gap-3" style={{ borderColor: theme.primary, backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <div>
                  <h3 className="text-xs font-bold text-white">Build a race plan</h3>
                  <p className="text-xs text-[#9AA3B2] mt-0.5">5K, 10K or half marathon, with progressing long runs, intervals and a taper.</p>
                </div>
                <button
                  onClick={() => setBuilding(true)}
                  className="min-h-11 px-4 rounded-xl text-xs font-bold text-black shrink-0"
                  style={{ backgroundColor: theme.primary }}
                >
                  Build
                </button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Plan type">
                {(['all', 'walk', 'strength', 'run', 'cycle', 'mobility'] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={focus === f} onClick={() => setFocus(f)} className="sport-pill !py-1.5 !px-3.5 !text-xs whitespace-nowrap">
                    {f === 'all' ? 'All plans' : FOCUS_LABELS[f]}
                  </button>
                ))}
              </div>
              {BUILT_IN_PLANS.filter((p) => focus === 'all' || planHasFocus(p, focus)).map((p) => (
                <div key={p.id} className="rounded-2xl border border-[#1A1E26] bg-black/40 p-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-white">{p.name}</h3>
                    <p className="text-xs text-[#9AA3B2] mt-0.5">{p.description}</p>
                    <p className="text-xs font-mono text-neutral-400 mt-1">
                      {p.weeks} weeks · {p.level} · {p.days.filter((d) => d.kind !== 'rest').length} days/week
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        onActivatePlan(p.id);
                        setChoosing(false);
                      }}
                      className="min-h-11 px-3 rounded-xl text-xs font-bold text-black"
                      style={{ backgroundColor: theme.primary }}
                    >
                      Start plan
                    </button>
                    <button
                      onClick={() =>
                        setPreview({
                          preset: { kind: 'plan', plan: p },
                          actions: [{ label: 'Start plan', primary: true, onClick: () => { closePreview(); onActivatePlan(p.id); setChoosing(false); } }],
                        })
                      }
                      aria-label={`Preview ${p.name}`}
                      className="min-h-11 px-3 rounded-xl text-xs font-bold text-neutral-200 border border-[#2A3040] flex items-center justify-center gap-1.5"
                    >
                      <Eye className="w-4 h-4" /> Preview
                    </button>
                  </div>
                </div>
              ))}
              {choosing && (
                <button onClick={() => setChoosing(false)} className="text-xs underline text-neutral-400">
                  Cancel
                </button>
              )}
            </div>
          )}

          <div className="space-y-2 pt-3 border-t border-[#1A1E26]">
            <button
              onClick={() => setShowTemplates((v) => !v)}
              aria-expanded={showTemplates}
              className="flex min-h-11 w-full items-center justify-between text-left"
            >
              <span>
                <span className="block text-sm font-bold text-white">Starter workouts</span>
                <span className="block text-xs text-[#9AA3B2]">{STRENGTH_TEMPLATES.length} ready-made strength sessions</span>
              </span>
              {showTemplates ? <ChevronUp className="w-5 h-5 text-neutral-300" /> : <ChevronDown className="w-5 h-5 text-neutral-300" />}
            </button>
            {showTemplates && STRENGTH_TEMPLATES.map((t) => {
              const saved = routines.some((r) => r.name === t.name);
              return (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#1A1E26] bg-black/40 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{t.name}</div>
                    <div className="text-xs text-[#9AA3B2]">
                      {t.exerciseIds.map((id) => getExercise(id)?.name).filter(Boolean).slice(0, 3).join(', ')}
                      {t.exerciseIds.length > 3 ? ` +${t.exerciseIds.length - 3}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() =>
                        setPreview({
                          preset: { kind: 'strength', title: t.name, blurb: t.blurb, exerciseIds: t.exerciseIds },
                          actions: [
                            ...(onSaveRoutine && !saved ? [{ label: 'Save as routine', onClick: () => { onSaveRoutine(t.name, t.exerciseIds); closePreview(); } }] : []),
                            { label: 'Start', primary: true, onClick: () => { closePreview(); onStartStrength(t.exerciseIds, t.name); } },
                          ],
                        })
                      }
                      aria-label={`Preview ${t.name}`}
                      className="min-h-11 px-3 rounded-xl text-xs font-bold text-neutral-200 border border-[#2A3040] flex items-center gap-1.5"
                    >
                      <Eye className="w-4 h-4" /> Preview
                    </button>
                    {onSaveRoutine && !saved && (
                      <button onClick={() => onSaveRoutine(t.name, t.exerciseIds)} className="min-h-11 px-3 rounded-xl text-xs font-bold text-neutral-200 border border-[#2A3040]">
                        Save
                      </button>
                    )}
                    <button onClick={() => onStartStrength(t.exerciseIds, t.name)} className="min-h-11 px-3.5 rounded-xl text-xs font-bold text-black" style={{ backgroundColor: theme.primary }}>
                      Start
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 pt-3 border-t border-[#1A1E26]">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">My routines</h4>
              <button onClick={() => setBuilder({ open: true, mode: 'routine', editing: null })} className="min-h-11 px-2 text-xs font-bold flex items-center gap-1" style={{ color: theme.primary }}>
                <Plus className="w-3.5 h-3.5" /> New routine
              </button>
            </div>
            {routines.length === 0 ? (
              <p className="text-xs text-neutral-400">
                No routines yet. Build a strength workout and use “Save these exercises as a routine”.
              </p>
            ) : (
              routines.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#1A1E26] bg-black/40 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{r.name}</div>
                    <div className="text-xs text-[#9AA3B2]">{r.exerciseIds.length} exercises</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() =>
                        setPreview({
                          preset: { kind: 'strength', title: r.name, exerciseIds: r.exerciseIds },
                          actions: [{ label: 'Start', primary: true, onClick: () => { closePreview(); onStartStrength(r.exerciseIds, r.name); } }],
                        })
                      }
                      aria-label={`Preview ${r.name}`}
                      className="min-h-11 px-3 rounded-xl text-xs font-bold text-neutral-200 border border-[#2A3040] flex items-center gap-1.5"
                    >
                      <Eye className="w-4 h-4" /> Preview
                    </button>
                    <button
                      onClick={() => onStartStrength(r.exerciseIds, r.name)}
                      className="min-h-11 px-3.5 rounded-xl text-xs font-bold text-black"
                      style={{ backgroundColor: theme.primary }}
                    >
                      Start
                    </button>
                    <button
                      onClick={() => onDeleteRoutine(r.id)}
                      aria-label={`Delete routine ${r.name}`}
                      className="flex h-11 w-11 items-center justify-center text-neutral-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <PresetPreview preset={preview?.preset ?? null} theme={theme} onClose={closePreview} actions={preview?.actions} />
      <LiftingBuilder
        isOpen={builder.open}
        onClose={() => setBuilder((b) => ({ ...b, open: false }))}
        theme={theme}
        initialMode={builder.mode}
        editing={builder.editing}
        onCreatePlan={(p, opts) => {
          onActivatePlan(p.id, p, opts);
          setChoosing(false);
        }}
        onSaveRoutine={(name, ids) => onSaveRoutine?.(name, ids)}
      />
      <CalendarSheet isOpen={calOpen} onClose={() => setCalOpen(false)} theme={theme} />
    </section>
  );
};
