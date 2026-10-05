import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Dumbbell, Info, Plus, Search, Timer, Trash2, TrendingUp, Trophy } from 'lucide-react';
import { ExerciseGuide } from './ExerciseDemo';
import { RecoveryNote } from './RecoveryNote';
import { BAR_KG, BAR_LB, PLATES_KG, PLATES_LB, Suggestion, liftHistory, plateBreakdown, suggestNext } from '../lib/strengthProgress';
import { WorkoutSession } from '../types/health';
import { Exercise, ExerciseLog, MuscleGroup, UserProfile } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { EXERCISES, MUSCLE_GROUPS, getExercise } from '../data/exercises';
import { Modal, fieldClass } from './ui/Modal';
import {
  detectNewPRs,
  estimateCalories,
  getMaxHr,
  lastLogFor,
  logVolumeKg,
  personalRecords,
  trimp,
  currentRestingHr,
} from '../lib/calc';
import { displayToKg, formatWeight, kgToDisplay, weightUnit } from '../lib/units';
import { useWatchCommands, useWatchWorkoutSync } from '../hooks/useWatchWorkoutSync';
import { StrengthAction, applyStrengthCommand, buildWatchStrength } from '../lib/watchStrength';
import { hasNativeTracker, readNativeSamples, startNativeSession, stopNativeSession } from '../lib/tracker';
import { downsampleHr } from '../lib/workoutStats';
import { CalorieSample, WatchCommand, WatchWorkoutState } from '../lib/watch';

interface Row {
  reps: string;
  weight: string; // display units
  done: boolean;
}
interface LoggedExercise {
  exerciseId: string;
  name: string;
  rows: Row[];
}

interface StrengthLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ColorPalette;
  profile: UserProfile;
  workouts: WorkoutSession[];
  initialExerciseIds: string[];
  planDayTitle?: string;
  liveBpm: number;
  hrFromSensor: boolean;
  watchKcal: CalorieSample | null;
  /** Open the watch app when this session starts (false when the watch started it). */
  watchLaunch: boolean;
  /** Increments when the watch's Stop button is pressed. */
  remoteStopToken: number;
  onSave: (session: WorkoutSession) => void;
  onSaveRoutine: (name: string, exerciseIds: string[]) => void;
}

const REST_OPTIONS = [60, 90, 120, 180];

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const StrengthLoggerModal: React.FC<StrengthLoggerModalProps> = ({
  isOpen,
  onClose,
  theme,
  profile,
  workouts,
  initialExerciseIds,
  planDayTitle,
  liveBpm,
  hrFromSensor,
  watchKcal,
  watchLaunch,
  remoteStopToken,
  onSave,
  onSaveRoutine,
}) => {
  const units = profile.units;
  const [items, setItems] = useState<LoggedExercise[]>([]);
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);
  // True once the open-reset below has stamped this session's real start time.
  const [sessionReady, setSessionReady] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [restLen, setRestLen] = useState(90);
  const [restLeft, setRestLeft] = useState(0);
  // The exercise the watch is on, and when the current rest ends (epoch ms; the watch counts down from this by itself).
  const [cursor, setCursor] = useState(0);
  const [restEnds, setRestEnds] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'All'>('All');
  const [notes, setNotes] = useState('');
  const [routineName, setRoutineName] = useState('');
  const [guide, setGuide] = useState<Exercise | null>(null);
  const [result, setResult] = useState<{ prs: string[]; volume: string; saved: WorkoutSession } | null>(null);
  const hrSamples = useRef<number[]>([]);
  const hrTimeline = useRef<[number, number][]>([]);
  const nativeStarted = useRef(false);
  const bpmRef = useRef(liveBpm);
  bpmRef.current = liveBpm;

  const buildRows = (exerciseId: string): Row[] => {
    const last = lastLogFor(workouts, exerciseId);
    if (last) {
      return last.sets.map((s) => ({
        reps: String(s.reps),
        weight: s.weightKg ? String(kgToDisplay(s.weightKg, units)) : '',
        done: false,
      }));
    }
    return [0, 1, 2].map(() => ({ reps: '8', weight: '', done: false }));
  };

  const makeItem = (id: string): LoggedExercise | null => {
    const ex = getExercise(id);
    return ex ? { exerciseId: ex.id, name: ex.name, rows: buildRows(ex.id) } : null;
  };

  // Reset every time the dialog opens.
  useEffect(() => {
    if (!isOpen) {
      setSessionReady(false);
      if (nativeStarted.current) {
        nativeStarted.current = false;
        void stopNativeSession();
      }
      return;
    }
    setSessionReady(true);
    // The phone records heart rate natively too, so nothing is lost while the screen is off.
    if (hasNativeTracker()) {
      nativeStarted.current = true;
      startNativeSession(false).catch(() => {
        nativeStarted.current = false;
      });
    }
    setItems(initialExerciseIds.map(makeItem).filter(Boolean) as LoggedExercise[]);
    setStartedAt(Date.now());
    setElapsed(0);
    setRpe(7);
    setRestLeft(0);
    setRestEnds(0);
    setCursor(0);
    setShowPicker(initialExerciseIds.length === 0);
    setQuery('');
    setMuscle('All');
    setNotes('');
    setRoutineName('');
    setResult(null);
    hrSamples.current = [];
    hrTimeline.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Session clock + HR sampling (only real sensor data is averaged).
  useEffect(() => {
    if (!isOpen || result) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      if (hrFromSensor && bpmRef.current > 0) {
        hrSamples.current.push(bpmRef.current);
        hrTimeline.current.push([Date.now(), bpmRef.current]);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isOpen, startedAt, result, hrFromSensor]);

  // Rest countdown
  useEffect(() => {
    if (restLeft <= 0) return;
    const id = setTimeout(() => {
      setRestLeft((r) => {
        if (r <= 1) {
          try {
            navigator.vibrate?.([200, 100, 200]);
          } catch {
            // not supported
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearTimeout(id);
  }, [restLeft]);

  const updateRow = (ei: number, ri: number, patch: Partial<Row>) =>
    setItems((prev) =>
      prev.map((it, i) =>
        i !== ei ? it : { ...it, rows: it.rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)) }
      )
    );

  const toggleDone = (ei: number, ri: number) => {
    const row = items[ei].rows[ri];
    const nowDone = !row.done;
    updateRow(ei, ri, { done: nowDone });
    if (nowDone) {
      setRestLeft(restLen);
      setRestEnds(Date.now() + restLen * 1000);
    }
  };

  // When the rest ends (or is skipped) the watch is told by clearing the end time.
  useEffect(() => {
    if (restLeft === 0) setRestEnds(0);
  }, [restLeft]);

  const addSet = (ei: number) =>
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== ei) return it;
        const last = it.rows[it.rows.length - 1];
        return { ...it, rows: [...it.rows, { reps: last?.reps || '8', weight: last?.weight || '', done: false }] };
      })
    );

  const removeSet = (ei: number, ri: number) =>
    setItems((prev) =>
      prev.map((it, i) => (i !== ei ? it : { ...it, rows: it.rows.filter((_, j) => j !== ri) }))
    );

  const addExercise = (id: string) => {
    if (items.some((i) => i.exerciseId === id)) {
      setShowPicker(false);
      return;
    }
    const item = makeItem(id);
    if (item) setItems((prev) => [...prev, item]);
    setShowPicker(false);
    setQuery('');
  };

  // What to lift next, from the last sessions of each exercise (see lib/strengthProgress).
  const suggestions = useMemo(() => {
    const out: Record<string, Suggestion | null> = {};
    for (const it of items) out[it.exerciseId] = suggestNext(liftHistory(workouts, it.exerciseId), it.exerciseId, units);
    return out;
  }, [items.map((i) => i.exerciseId).join('|'), workouts, units]);
  const [platesFor, setPlatesFor] = useState<string | null>(null);

  const applySuggestion = (ei: number, s: Suggestion) =>
    setItems((prev) =>
      prev.map((it, i) =>
        i !== ei ? it : { ...it, rows: it.rows.map((r) => (r.done ? r : { ...r, weight: s.weightKg > 0 ? String(kgToDisplay(s.weightKg, units)) : '', reps: String(s.reps) })) }
      )
    );

  const toLogs = (): ExerciseLog[] =>
    items
      .map((it) => ({
        exerciseId: it.exerciseId,
        name: it.name,
        sets: it.rows
          .map((r) => ({
            reps: Math.max(0, Math.round(parseFloat(r.reps) || 0)),
            weightKg: Math.max(0, displayToKg(parseFloat(r.weight) || 0, units)),
            done: r.done,
          }))
          .filter((s) => s.done && s.reps > 0),
      }))
      .filter((l) => l.sets.length > 0);

  const logs = toLogs();
  const doneSets = logs.reduce((n, l) => n + l.sets.length, 0);
  const volumeKg = logs.reduce((s, l) => s + logVolumeKg(l), 0);

  // Calories the watch measured for this session (ignore readings from an earlier one).
  const measuredKcal =
    watchKcal && watchKcal.ts >= startedAt && watchKcal.kcal > 0 ? Math.round(watchKcal.kcal) : null;
  const sessionKcal = measuredKcal ?? estimateCalories('Strength', elapsed / 60, profile.weightKg);

  // Mirror the session to the watch (timer, heart rate, calories; strength has no pause or distance).
  const watchState: WatchWorkoutState | null =
    isOpen && sessionReady && !result
      ? {
          active: true,
          type: 'Strength',
          startedAt,
          paused: false,
          pausedAt: 0,
          pausedTotalMs: 0,
          distanceText: '',
          distanceKm: 0,
          paceText: '',
          kcal: sessionKcal,
          maxHr: getMaxHr(profile),
          canPause: false,
          miles: units === 'imperial',
          // The set, weight and reps on show, so the watch can run the session set by set.
          strength:
            buildWatchStrength({ items, cursor }, { units, restEndsAt: restEnds, restLen, volume: formatWeight(volumeKg, units, 0) }) ?? undefined,
        }
      : null;
  useWatchWorkoutSync(watchState, watchLaunch);

  // Buttons pressed on the watch's strength screen (done, reps, weight, next exercise, rest...). The refs hold the newest session so
  // several quick presses in a row each build on the one before.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const restEndsRef = useRef(restEnds);
  restEndsRef.current = restEnds;
  const restLenRef = useRef(restLen);
  restLenRef.current = restLen;
  useWatchCommands((c: WatchCommand) => {
    if (c.cmd !== 'set' || !isOpen || result) return;
    const out = applyStrengthCommand({ items: itemsRef.current, cursor: cursorRef.current }, { action: c.action as StrengthAction, delta: c.delta, index: c.index }, units);
    if (out.state.items !== itemsRef.current) {
      itemsRef.current = out.state.items as typeof items;
      setItems(out.state.items as typeof items);
    }
    if (out.state.cursor !== cursorRef.current) {
      cursorRef.current = out.state.cursor;
      setCursor(out.state.cursor);
    }
    if (!out.rest) return;
    if (out.rest.kind === 'start') {
      setRestLeft(restLenRef.current);
      setRestEnds(Date.now() + restLenRef.current * 1000);
    } else if (out.rest.kind === 'skip') {
      setRestLeft(0);
    } else if (restEndsRef.current > Date.now()) {
      const left = Math.max(0, Math.ceil((restEndsRef.current - Date.now()) / 1000) + out.rest.seconds);
      setRestLeft(left);
      setRestEnds(left > 0 ? Date.now() + left * 1000 : 0);
    }
  });

  const handleFinish = async () => {
    if (logs.length === 0) return;
    const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const minutes = Math.max(1, Math.round(durationSec / 60));
    const maxHr = getMaxHr(profile);

    let rawHr: [number, number][] = hrTimeline.current;
    if (nativeStarted.current) {
      nativeStarted.current = false;
      try {
        const native = await readNativeSamples({ fix: 0, hr: 0 });
        if (native.hr.length > 5) rawHr = native.hr;
      } catch {
        // fall back to the readings the page saw
      }
      await stopNativeSession();
    }
    const hrSeries = downsampleHr(rawHr.filter(([, b]) => b > 30 && b < 230));
    const measured = hrSeries.length > 5;
    const avgHr = measured
      ? Math.round(hrSeries.reduce((s, [, b]) => s + b, 0) / hrSeries.length)
      : // Estimate from effort when no sensor data was recorded.
        Math.round(profile.restingHr + (maxHr - profile.restingHr) * (0.3 + rpe * 0.04));

    const prs = detectNewPRs(workouts, logs);
    const session: WorkoutSession = {
      id: `w-str-${Date.now()}`,
      type: 'Strength',
      timestamp: '',
      startedAt,
      durationMinutes: minutes,
      durationSec,
      avgHeartRate: avgHr,
      maxHeartRate: measured ? Math.max(...hrSeries.map(([, b]) => b)) : undefined,
      hrSeries: measured ? hrSeries : undefined,
      caloriesBurned: measuredKcal ?? estimateCalories('Strength', minutes, profile.weightKg),
      isManualEntry: false,
      hrFromSensor: measured,
      perceivedExertion: rpe,
      notes: notes.trim() || undefined,
      cardioLoadPoints: trimp(minutes, avgHr, maxHr, currentRestingHr()),
      exercises: logs,
      planDayTitle,
    };
    onSave(session);
    setResult({ prs, volume: formatWeight(volumeKg, units, 0), saved: session });
  };
  // The watch's Stop button ends the session: save it if any sets were done, otherwise just close.
  const seenStopToken = useRef(remoteStopToken);
  useEffect(() => {
    if (remoteStopToken === seenStopToken.current) return;
    seenStopToken.current = remoteStopToken;
    if (!isOpen || result) return;
    if (logs.length > 0) handleFinish();
    else onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteStopToken]);

  const handleSaveRoutine = () => {
    const name = routineName.trim();
    if (!name || items.length === 0) return;
    onSaveRoutine(name, items.map((i) => i.exerciseId));
    setRoutineName('');
  };

  const filtered = EXERCISES.filter(
    (e) =>
      (muscle === 'All' || e.muscle === muscle) &&
      (query.trim() === '' || e.name.toLowerCase().includes(query.trim().toLowerCase()))
  );
  const prs = personalRecords(workouts);

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={planDayTitle ? `Strength · ${planDayTitle}` : 'Strength Workout'}
      icon={<Dumbbell className="w-4 h-4" style={{ color: theme.primary }} />}
      footer={
        result ? (
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-bold text-xs text-black"
            style={{ backgroundColor: theme.primary }}
          >
            Done
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-neutral-800 text-xs font-semibold text-neutral-300 hover:text-white"
            >
              Discard
            </button>
            <button
              onClick={handleFinish}
              disabled={doneSets === 0}
              className="flex-1 py-2.5 rounded-xl font-bold text-xs text-black disabled:opacity-40"
              style={{ backgroundColor: theme.primary }}
            >
              Finish & save ({doneSets} sets)
            </button>
          </div>
        )
      }
    >
      {result ? (
        <div className="space-y-4 text-center py-4">
          <Check className="w-10 h-10 mx-auto" style={{ color: theme.primary }} />
          <div>
            <p className="text-lg font-bold text-white">Workout saved</p>
            <p className="text-xs text-[#7E889B] font-mono mt-1">
              {result.saved.durationMinutes} min · {result.volume} lifted · {result.saved.caloriesBurned} kcal
            </p>
          </div>
          <div className="text-left"><RecoveryNote workout={result.saved} all={workouts} /></div>
          {result.prs.length > 0 ? (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-left">
              <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Trophy className="w-4 h-4" /> New personal record{result.prs.length > 1 ? 's' : ''}!
              </p>
              <ul className="text-xs text-amber-100 mt-1 list-disc pl-5">
                {result.prs.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] text-[#7E889B]">Keep logging to unlock personal records.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-white text-base font-bold tabular-nums">{fmtClock(elapsed)}</span>
            <span className="text-[#7E889B]">
              {formatWeight(volumeKg, units, 0)} volume · {hrFromSensor ? `${liveBpm} bpm (sensor)` : 'no HR sensor'}
            </span>
          </div>

          {/* Rest timer */}
          <div className="rounded-2xl border border-[#1A1E26] bg-black/50 p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4" style={{ color: theme.primary }} />
              <div>
                <div className="text-[11px] text-neutral-400">Rest timer</div>
                <div className="text-lg font-bold font-mono tabular-nums text-white" aria-live="polite">
                  {restLeft > 0 ? fmtClock(restLeft) : 'Ready'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Rest length">
              {REST_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setRestLen(s);
                    if (restLeft > 0) {
                      setRestLeft(s);
                      setRestEnds(Date.now() + s * 1000);
                    }
                  }}
                  aria-pressed={restLen === s}
                  className={`px-2 py-1 rounded-lg text-[11px] font-mono border ${
                    restLen === s ? 'text-black border-transparent' : 'text-neutral-400 border-[#1A1E26]'
                  }`}
                  style={{ backgroundColor: restLen === s ? theme.primary : undefined }}
                >
                  {s}s
                </button>
              ))}
              {restLeft > 0 && (
                <button onClick={() => setRestLeft(0)} className="px-2 py-1 text-[11px] text-neutral-400 underline">
                  Skip
                </button>
              )}
            </div>
          </div>

          {/* Exercises */}
          {items.map((it, ei) => {
            const pr = prs[it.exerciseId];
            return (
              <section key={it.exerciseId} className="rounded-2xl border border-[#1A1E26] bg-black/40 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{it.name}</h3>
                    {pr && (
                      <p className="text-[10px] font-mono text-amber-300 flex items-center gap-1 mt-0.5">
                        <Trophy className="w-3 h-3" />
                        PR {formatWeight(pr.weightKg, units)} × {pr.reps}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => setGuide(getExercise(it.exerciseId) ?? null)} aria-label={`How to do ${it.name}`} className="text-neutral-400 hover:text-white">
                      <Info className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== ei))}
                      aria-label={`Remove ${it.name}`}
                      className="text-neutral-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {suggestions[it.exerciseId] && (
                  <div className="rounded-xl border border-[#1A1E26] bg-black/50 px-2.5 py-2 flex items-start gap-2">
                    <TrendingUp className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: theme.primary }} />
                    <p className="text-[11px] text-neutral-300 flex-1">{suggestions[it.exerciseId]!.reason}</p>
                    <button
                      onClick={() => applySuggestion(ei, suggestions[it.exerciseId]!)}
                      className="text-[11px] font-bold px-2 py-1 rounded-lg text-black"
                      style={{ backgroundColor: theme.primary }}
                    >
                      Use
                    </button>
                  </div>
                )}
                {getExercise(it.exerciseId)?.equipment === 'Barbell' && (
                  <div>
                    <button onClick={() => setPlatesFor(platesFor === it.exerciseId ? null : it.exerciseId)} className="text-[11px] font-semibold text-neutral-400 underline">
                      {platesFor === it.exerciseId ? 'Hide plates' : 'Plates'}
                    </button>
                    {platesFor === it.exerciseId && (() => {
                      const row = it.rows.find((r) => !r.done && parseFloat(r.weight) > 0) ?? it.rows.find((r) => parseFloat(r.weight) > 0);
                      const target = row ? parseFloat(row.weight) : 0;
                      const bar = units === 'imperial' ? BAR_LB : BAR_KG;
                      const res = plateBreakdown(target, bar, units === 'imperial' ? PLATES_LB : PLATES_KG);
                      return (
                        <p className="text-[11px] text-neutral-300 mt-1">
                          {target <= bar
                            ? `Just the ${bar} ${weightUnit(units)} bar.`
                            : `${bar} ${weightUnit(units)} bar + ${res.perSide.length ? res.perSide.join(' + ') : 'no plates'} each side = ${res.loaded} ${weightUnit(units)}${res.short > 0 ? ` (${res.short} short of ${target})` : ''}`}
                        </p>
                      );
                    })()}
                  </div>
                )}
                <div className="grid grid-cols-[1.5rem_1fr_1fr_2.25rem_1.5rem] gap-1.5 text-[10px] text-neutral-500 font-mono px-0.5">
                  <span>Set</span>
                  <span>{weightUnit(units)}</span>
                  <span>Reps</span>
                  <span className="text-center">Done</span>
                  <span />
                </div>
                {it.rows.map((r, ri) => (
                  <div key={ri} className="grid grid-cols-[1.5rem_1fr_1fr_2.25rem_1.5rem] gap-1.5 items-center">
                    <span className="text-xs text-neutral-400 font-mono">{ri + 1}</span>
                    <input
                      aria-label={`${it.name} set ${ri + 1} weight`}
                      inputMode="decimal"
                      value={r.weight}
                      onChange={(e) => updateRow(ei, ri, { weight: e.target.value })}
                      className={fieldClass + ' !py-1.5'}
                      placeholder="0"
                    />
                    <input
                      aria-label={`${it.name} set ${ri + 1} reps`}
                      inputMode="numeric"
                      value={r.reps}
                      onChange={(e) => updateRow(ei, ri, { reps: e.target.value })}
                      className={fieldClass + ' !py-1.5'}
                    />
                    <button
                      onClick={() => toggleDone(ei, ri)}
                      aria-label={`Mark set ${ri + 1} ${r.done ? 'not done' : 'done'}`}
                      aria-pressed={r.done}
                      className={`h-8 rounded-lg border flex items-center justify-center ${
                        r.done ? 'text-black border-transparent' : 'text-neutral-500 border-[#1A1E26]'
                      }`}
                      style={{ backgroundColor: r.done ? theme.primary : undefined }}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeSet(ei, ri)}
                      aria-label={`Delete set ${ri + 1}`}
                      className="text-neutral-600 hover:text-rose-400 text-sm"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button onClick={() => addSet(ei)} className="text-[11px] font-semibold flex items-center gap-1" style={{ color: theme.primary }}>
                  <Plus className="w-3 h-3" /> Add set
                </button>
              </section>
            );
          })}

          {/* Exercise picker */}
          {showPicker ? (
            <div className="rounded-2xl border border-[#1A1E26] bg-black/40 p-3 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  aria-label="Search exercises"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search exercises"
                  className={fieldClass + ' !pl-8'}
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {(['All', ...MUSCLE_GROUPS] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMuscle(m)}
                    aria-pressed={muscle === m}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-mono whitespace-nowrap border ${
                      muscle === m ? 'text-black border-transparent' : 'text-neutral-400 border-[#1A1E26]'
                    }`}
                    style={{ backgroundColor: muscle === m ? theme.primary : undefined }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <ul className="max-h-48 overflow-y-auto divide-y divide-[#1A1E26]">
                {filtered.map((e) => (
                  <li key={e.id} className="flex items-center">
                    <button
                      onClick={() => addExercise(e.id)}
                      className="flex-1 min-w-0 text-left py-2 px-1 flex items-center justify-between gap-2 hover:bg-neutral-900/60 rounded-lg"
                    >
                      <span className="text-xs text-white truncate">{e.name}</span>
                      <span className="text-[10px] font-mono text-neutral-500 shrink-0">
                        {e.muscle} · {e.equipment}
                      </span>
                    </button>
                    <button onClick={() => setGuide(e)} aria-label={`How to do ${e.name}`} className="p-2 shrink-0 text-neutral-500 hover:text-white">
                      <Info className="w-4 h-4" />
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && <li className="py-3 text-center text-xs text-neutral-500">No matches</li>}
              </ul>
            </div>
          ) : (
            <button
              onClick={() => setShowPicker(true)}
              className="w-full py-2.5 rounded-xl border border-dashed border-neutral-700 text-xs font-semibold text-neutral-300 hover:text-white flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add exercise
            </button>
          )}

          {/* RPE + notes */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-neutral-400">
              <label htmlFor="sl-rpe">Overall effort (RPE)</label>
              <span className="font-mono font-bold" style={{ color: theme.primary }}>
                {rpe} / 10
              </span>
            </div>
            <input
              id="sl-rpe"
              type="range"
              min={1}
              max={10}
              value={rpe}
              onChange={(e) => setRpe(parseInt(e.target.value, 10))}
              className="w-full"
              style={{ accentColor: theme.primary }}
            />
          </div>
          <input
            aria-label="Workout notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className={fieldClass}
          />

          {/* Save as routine */}
          {items.length > 0 && (
            <div className="flex gap-2">
              <input
                aria-label="Routine name"
                value={routineName}
                onChange={(e) => setRoutineName(e.target.value)}
                placeholder="Save these exercises as a routine…"
                className={fieldClass}
              />
              <button
                onClick={handleSaveRoutine}
                disabled={!routineName.trim()}
                className="px-3 rounded-xl border border-neutral-700 text-xs font-semibold text-white disabled:opacity-40"
              >
                Save
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
    <ExerciseGuide exercise={guide} onClose={() => setGuide(null)} />
    </>
  );
};
