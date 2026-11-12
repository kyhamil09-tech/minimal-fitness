import React, { useState } from 'react';
import { CalendarRange, ChevronRight, EllipsisVertical } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { UserProfile } from '../types/tracking';
import { getExercise } from '../data/exercises';
import { personalRecords } from '../lib/calc';
import { PROGRAMS, PlannedExercise, ProgramDef, ProgramState, planSession, plannedLogs, progressText, sessionInfo, sessionsTotal, setupExercises, skipSession, startProgram, suggestStart, getProgram } from '../lib/programs';
import { displayToKg, formatWeight, kgToDisplay, weightUnit } from '../lib/units';
import { Sheet } from './ui';
import { useT, type TFunction } from '../lib/i18n';
import type { MessageKey } from '../locales/en';
import type { StartOptions } from './LiftHome';

const nameOf = (id: string): string => getExercise(id)?.name ?? id;

/** One planned exercise in a line: "5 × 5 · 62.5 kg", or for a 5/3/1 lift each set. */
const describe = (e: PlannedExercise, units: UserProfile['units'], t: TFunction): string => {
  const first = e.sets[0];
  const same = e.sets.every((s) => s.reps === first.reps && s.weightKg === first.weightKg && !s.plus);
  const w = (kg: number) => (kg > 0 ? formatWeight(kg, units) : t('lp.pickWeight'));
  if (same) return `${e.sets.length} × ${first.reps} · ${w(first.weightKg)}`;
  return e.sets.map((s) => `${s.reps}${s.plus ? '+' : ''} × ${kg(s.weightKg, units)}`).join(', ');
};
const kg = (v: number, units: UserProfile['units']): string => (v > 0 ? String(kgToDisplay(v, units)) : '–');

const DAY_KEYS: Record<string, MessageKey> = {
  'Workout A': 'lp.day.workoutA',
  'Workout B': 'lp.day.workoutB',
  'Overhead press': 'lp.day.ohp',
  Deadlift: 'lp.day.deadlift',
  'Bench press': 'lp.day.bench',
  Squat: 'lp.day.squat',
  Push: 'lp.day.push',
  Pull: 'lp.day.pull',
  Legs: 'lp.day.legs',
  'Upper A': 'lp.day.upperA',
  'Lower A': 'lp.day.lowerA',
  'Upper B': 'lp.day.upperB',
  'Lower B': 'lp.day.lowerB',
  'Full body A': 'lp.day.fullA',
  'Full body B': 'lp.day.fullB',
};

interface Props {
  profile: UserProfile;
  workouts: WorkoutSession[];
  program: ProgramState | null;
  onProgramChange: (p: ProgramState | null) => void;
  onStart: (ids: string[], opts?: StartOptions) => void;
}

/**
 * Programs on the Workout tab: choose a multi-week program, give it the weights to start from, and it tells you what to lift in each
 * workout and changes the weights as you finish them (see lib/programs). With one running, the card is the next workout.
 */
export const ProgramsCard: React.FC<Props> = ({ profile, workouts, program, onProgramChange, onStart }) => {
  const units = profile.units;
  const unit = weightUnit(units);
  const t = useT();
  const dayName = (n: string) => (DAY_KEYS[n] ? t(DAY_KEYS[n]) : n);
  const progName = (p: ProgramDef) => t(`lp.name.${p.id}` as MessageKey);
  const blurbOf = (p: ProgramDef) => t(`lp.blurb.${p.id}` as MessageKey);
  const levelOf = (p: ProgramDef) => t(`lp.level.${p.level}` as MessageKey);
  const progress = (d: ProgramDef, st: ProgramState) => {
    const i = sessionInfo(d, st.done);
    return d.cycleWeeks <= 4 ? t('lp.progress.cycle', { c: i.cycle, w: i.cycleWeek + 1, n: d.cycleWeeks }) : t('lp.progress.plan', { w: i.week, n: d.cycleWeeks });
  };
  const length = (d: ProgramDef) => t(d.cycleWeeks <= 4 ? 'lp.weekCycle' : 'lp.weekPlan', { n: d.cycleWeeks });
  const [listOpen, setListOpen] = useState(false);
  const [detail, setDetail] = useState<ProgramDef | null>(null);
  const [setup, setSetup] = useState<ProgramDef | null>(null);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [manage, setManage] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const def = program ? getProgram(program.programId) : undefined;

  const openSetup = (d: ProgramDef) => {
    const best = personalRecords(workouts);
    const w: Record<string, string> = {};
    for (const id of setupExercises(d)) {
      const s = suggestStart(d, best[id]?.oneRepMax ?? 0, units);
      w[id] = s > 0 ? String(kgToDisplay(s, units)) : '';
    }
    setWeights(w);
    setDetail(null);
    setListOpen(false);
    setSetup(d);
  };

  const begin = () => {
    if (!setup) return;
    const kgs: Record<string, number> = {};
    for (const [id, v] of Object.entries(weights)) {
      const n = parseFloat(v.replace(',', '.'));
      if (n > 0) kgs[id] = displayToKg(n, units);
    }
    onProgramChange(startProgram(setup, kgs));
    setSetup(null);
  };

  const startNext = () => {
    if (!program || !def) return;
    const plan = planSession(def, program, units);
    onStart(
      plan.exercises.map((e) => e.exerciseId),
      { title: `${progName(def)} · ${dayName(plan.info.day.name)}`, logs: plannedLogs(plan.exercises, nameOf), program: { id: def.id, index: program.done } }
    );
  };

  const plan = program && def ? planSession(def, program, units) : null;

  return (
    <section aria-label={t('lp.aria')} className="mt-4">
      {program && def && plan ? (
        <div className="l-card l-hero l-rise p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="l-dim text-xs font-semibold uppercase">{progName(def)}</div>
              <div className="text-lg font-bold">{dayName(plan.info.day.name)}</div>
              <div className="l-dim text-xs">
                {progress(def, program)}
                {plan.info.deload ? ` · ${t('lp.lighterWeek')}` : ''}
              </div>
            </div>
            <button type="button" className="l-icon-btn -mr-2 -mt-2" onClick={() => setManage(true)} aria-label={t('lp.options')}>
              <EllipsisVertical className="l-dim h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {plan.exercises.map((e) => (
              <li key={e.exerciseId} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-semibold">{nameOf(e.exerciseId)}</span>
                <span className="l-dim shrink-0 text-xs tabular-nums">{describe(e, units, t)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button type="button" className="l-btn l-btn-primary flex-1" onClick={startNext}>
              {t('lp.startWorkout')}
            </button>
            <button type="button" className="l-btn" onClick={() => onProgramChange(skipSession(def, program, units))}>
              {t('lp.skip')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="l-card flex w-full items-center gap-3 p-4 text-left" style={{ color: 'var(--l-text)' }} onClick={() => setListOpen(true)}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--l-fill)', color: 'var(--l-on-fill)' }} aria-hidden="true">
            <CalendarRange className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">{t('lp.follow')}</span>
            <span className="l-dim block text-xs">{t('lp.followSub')}</span>
          </span>
          <ChevronRight className="l-dim h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {/* The choice of programs */}
      <Sheet open={listOpen} onClose={() => setListOpen(false)} title={t('lp.programs')}>
        <ul className="space-y-2">
          {PROGRAMS.map((p) => (
            <li key={p.id}>
              <button type="button" className="l-card block w-full p-3 text-left" style={{ color: 'var(--l-text)' }} onClick={() => { setListOpen(false); setDetail(p); }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-bold">{progName(p)}</span>
                  <span className="l-dim text-xs">{levelOf(p)}</span>
                </div>
                <div className="l-dim mt-0.5 text-xs">
                  {t('lp.perWeek', { n: p.sessionsPerWeek })} · {length(p)}
                </div>
                <p className="l-dim mt-1 text-xs leading-snug">{blurbOf(p)}</p>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      {/* One program in detail */}
      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail ? progName(detail) : t('lp.aria')}>
        {detail && (
          <div>
            <p className="text-sm leading-snug">{blurbOf(detail)}</p>
            <div className="l-dim mt-1 text-xs">
              {levelOf(detail)} · {t('lp.perWeek', { n: detail.sessionsPerWeek })} · {t('lp.weeksN', { n: detail.cycleWeeks })}
              {detail.cycleWeeks <= 4 ? `, ${t('lp.repeats')}` : ''}
              {detail.deloadWeeks.length ? ` · ${t('lp.deloadBuilt')}` : ''}
            </div>
            <div className="mt-3 space-y-2">
              {detail.days.map((d, i) => (
                <div key={i} className="l-card p-3">
                  <div className="text-sm font-bold">{dayName(d.name)}</div>
                  <div className="l-dim mt-0.5 text-xs leading-snug">{d.exercises.map((e) => nameOf(e.id)).join(' · ')}</div>
                </div>
              ))}
            </div>
            <button type="button" className="l-btn l-btn-primary mt-4 w-full" onClick={() => openSetup(detail)}>
              {t('lp.setup')}
            </button>
          </div>
        )}
      </Sheet>

      {/* Starting weights */}
      <Sheet open={!!setup} onClose={() => setSetup(null)} title={setup ? t('lp.startTitle', { name: progName(setup) }) : t('lp.startShort')}>
        {setup && (
          <div>
            <p className="l-dim text-xs leading-snug">
              {setup.setup === 'max' ? t('lp.setupMax') : t('lp.setupWeight')}
            </p>
            <div className="mt-3 space-y-2">
              {setupExercises(setup).map((id) => (
                <label key={id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-semibold">{nameOf(id)}</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      aria-label={t(setup.setup === 'max' ? 'lp.maxLabel' : 'lp.startLabel', { name: nameOf(id), unit })}
                      inputMode="decimal"
                      className="l-num-input !w-24"
                      onFocus={(e) => e.target.select()}
                      value={weights[id] ?? ''}
                      placeholder="0"
                      onChange={(e) => setWeights((w) => ({ ...w, [id]: e.target.value }))}
                    />
                    <span className="l-dim w-6 text-xs">{unit}</span>
                  </span>
                </label>
              ))}
            </div>
            <button type="button" className="l-btn l-btn-primary mt-4 w-full" onClick={begin}>
              {t('lp.startProgram')}
            </button>
          </div>
        )}
      </Sheet>

      {/* Upcoming workouts, and changing or stopping */}
      <Sheet open={manage} onClose={() => { setManage(false); setConfirmStop(false); }} title={def ? progName(def) : t('lp.aria')}>
        {program && def && (
          <div>
            <div className="l-dim text-xs">
              {progress(def, program)} · {t(def.cycleWeeks <= 4 ? 'lp.doneCycle' : 'lp.donePlan', { done: program.done, total: sessionsTotal(def) })}
            </div>
            <h3 className="l-h2 !mt-3">{t('lp.comingUp')}</h3>
            <ul className="space-y-1.5">
              {Array.from({ length: 8 }, (_, i) => sessionInfo(def, program.done + i)).map((s, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{dayName(s.day.name)}</span>
                  <span className="l-dim text-xs">
                    {t('lp.weekN', { n: s.week })}
                    {s.deload ? ` · ${t('lp.lighter')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <h3 className="l-h2 !mt-4">{t('lp.working')}</h3>
            <ul className="space-y-1 text-sm">
              {Object.entries(program.weights)
                .filter(([, v]) => v > 0)
                .map(([id, v]) => (
                  <li key={id} className="flex items-center justify-between">
                    <span>{nameOf(id)}</span>
                    <span className="l-dim tabular-nums">{formatWeight(v, units)}</span>
                  </li>
                ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <button type="button" className="l-btn flex-1" onClick={() => { setManage(false); setListOpen(true); }}>
                {t('lp.change')}
              </button>
              <button type="button" className="l-btn flex-1" style={{ background: 'var(--l-fail)', borderColor: 'var(--l-fail)', color: 'var(--l-on-fail)' }} onClick={() => setConfirmStop(true)}>
                {t('lp.stop')}
              </button>
            </div>
            {confirmStop && (
              <div className="l-card mt-3 p-3" role="alert">
                <p className="text-sm">{t('lp.stopConfirm', { name: progName(def) })}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="l-btn flex-1" onClick={() => setConfirmStop(false)}>
                    {t('lp.keep')}
                  </button>
                  <button type="button" className="l-btn flex-1" style={{ background: 'var(--l-fail)', borderColor: 'var(--l-fail)', color: 'var(--l-on-fail)' }} onClick={() => { onProgramChange(null); setManage(false); setConfirmStop(false); }}>
                    {t('lp.stopProgram')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </section>
  );
};
