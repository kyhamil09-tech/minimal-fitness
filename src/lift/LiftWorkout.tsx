import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Clock, Dumbbell, EllipsisVertical, Minus, Pause, Play, Plus, Share2, Trophy } from 'lucide-react';
import { afterGroupedSetDone, groupKind, groupLabel, linkWithNext, removeAt, unlinkFromNext } from '../lib/supersets';
import { Suggestion, liftHistory, suggestNext } from '../lib/strengthProgress';
import { gearFor } from '../lib/gear';
import { playBeep } from '../lib/beep';
import { keepScreenOn } from '../lib/keepAwake';
import { WorkoutSession } from '../types/health';
import { Exercise, ExerciseLog, RoutineSet, SetKind, SetLog, UserProfile } from '../types/tracking';
import { targetsFromLogs } from '../lib/routines';
import { EXERCISES, getExercise, isTimedExercise } from '../data/exercises';
import { detectNewPRs, estimateCalories, estimateOneRepMax, getMaxHr, personalRecords, trimp, currentRestingHr } from '../lib/calc';
import { displayToKg, formatWeight, kgToDisplay, weightUnit } from '../lib/units';
import { effortNudge, nextSetWeightKg } from '../lib/effort';
import { DEFAULT_DELOAD, DeloadState, deloadActive, deloadSets, deloadWeightKg } from '../lib/deload';
import { readStored } from '../hooks/usePersistentState';
import { useWatchCommands, useWatchWorkoutSync } from '../hooks/useWatchWorkoutSync';
import { makeId } from '../lib/ids';
import { StrengthAction, applyStrengthCommand, buildWatchStrength } from '../lib/watchStrength';
import { hasNativeTracker, readNativeSamples, startNativeSession, stopNativeSession } from '../lib/tracker';
import { downsampleHr } from '../lib/workoutStats';
import { CalorieSample, WatchCommand, WatchWorkoutState } from '../lib/watch';
import { buzz, usePrefs } from '../lib/prefs';
import { kindInfo, nextKind, hasWork, setLabel as setNumber } from '../lib/sets';
import { exerciseEntries, previousSets, workoutTotals } from '../lib/lifting';
import { GuideSheet } from './GuideSheet';
import { useBack } from './back';
import { ExercisePicker } from './ExercisePicker';
import { Header, LiftShell, Sheet, Stat } from './ui';
import { LiftShareSheet } from './LiftShareSheet';
import { usePersistentState } from '../hooks/usePersistentState';
import { useT } from '../lib/i18n';
import { clearDraft, loadDraft, saveDraft } from '../lib/liftDraft';
import { checkWeight } from '../lib/fatFinger';
import { warmupSets } from '../lib/warmup';
import { getRules } from '../lib/progressionStore';
import { progressedWeight } from '../lib/progression';
import { PlateSheet } from './PlateSheet';
import { AlertSettings } from './LiftSettings';
import { ReorderSheet, SwipeDelete } from './gestures';
import { ResumeBar } from './ResumeBar';
import { StepperBar } from './StepperBar';
import { MuscleBadge, RestRing } from './visuals';
import { LiftSession, isAndroidApp } from '../lib/native';
import { ensureNotificationPermission } from '../lib/notifications';

interface Row {
  reps: string;
  /** In the person's display units. */
  weight: string;
  done: boolean;
  kind?: SetKind;
  /** Effort for the set, as typed. */
  rpe?: string;
  /** Seconds (or m:ss) held, for timed exercises. */
  sec?: string;
}

interface LoggedExercise {
  exerciseId: string;
  name: string;
  rows: Row[];
  /** Shared by exercises done as a superset or circuit: one set of each in turn, rest after the last (lib/supersets). */
  group?: string;
  note?: string;
  /** Set when the weights were raised automatically for this session (the amount, in display units). */
  raised?: number;
  /** Last session felt easier or harder than the target effort: a suggestion to move the weights, applied with one tap. */
  effort?: { dir: 'up' | 'down'; avgRpe: number };
}

export interface LiftWorkoutProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  workouts: WorkoutSession[];
  initialExerciseIds: string[];
  /** Sets to start from (a repeated workout): the same exercises with the same weights and reps, nothing ticked off. */
  initialLogs?: ExerciseLog[];
  /** The plan day or routine this started from, used as the workout's name. */
  planDayTitle?: string;
  liveBpm: number;
  hrFromSensor: boolean;
  watchKcal: CalorieSample | null;
  /** Open the watch app when this session starts (false when the watch started it). */
  watchLaunch: boolean;
  /** Increments when the watch's Stop button is pressed. */
  remoteStopToken: number;
  /** Pick up the workout that was in progress when the app was closed (see lib/liftDraft) instead of starting a new one. */
  resume?: boolean;
  /** Goes up by one to bring a minimized workout back (a Start button was pressed while one is under way). */
  resumeToken?: number;
  /** The program workout this is, if it is one. */
  programRef?: { id: string; index: number };
  onSave: (session: WorkoutSession) => void;
  onSaveRoutine: (name: string, exerciseIds: string[], folder?: string, targets?: Record<string, RoutineSet[]>) => void;
  /** Exercises you made yourself, and how to change that list. */
  custom: Exercise[];
  onCustomChange: (list: Exercise[]) => void;
}

/** Tapping a number box selects what is in it, so typing replaces it. */
const selectAll = (e: React.FocusEvent<HTMLInputElement>) => e.target.select();

const REST_CHOICES = [0, 30, 60, 90, 120, 180];

const clock = (s: number): string => {
  const sec = Math.max(0, Math.round(s));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const r = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

/** "Off", "30 s", "2 min" for a rest length in seconds. */
const restText = (s: number): string => (s === 0 ? 'Off' : s < 60 ? `${s} s` : s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

/** "90" or "1:30" as seconds. */
const parseClock = (s: string | undefined): number => {
  const t = (s ?? '').trim();
  if (!t) return 0;
  if (t.includes(':')) {
    const [m, r] = t.split(':');
    return Math.max(0, Math.round((parseFloat(m) || 0) * 60 + (parseFloat(r) || 0)));
  }
  return Math.max(0, Math.round(parseFloat(t) || 0));
};

/**
 * The workout you are logging, as a plain full-screen list: each exercise with its sets (set type, what you did last time, weight, reps,
 * a tick), a rest timer that starts when you tick a set, and a summary at the end with any records. It carries the watch link and the
 * heart-rate recording that the older logger had, and works the same whether it was started from the Lift side or from the Run tab.
 */
export const LiftWorkout: React.FC<LiftWorkoutProps> = ({
  isOpen,
  onClose,
  profile,
  workouts,
  initialExerciseIds,
  initialLogs,
  planDayTitle,
  liveBpm,
  hrFromSensor,
  watchKcal,
  watchLaunch,
  remoteStopToken,
  resume,
  resumeToken,
  programRef,
  onSave,
  onSaveRoutine,
  custom,
  onCustomChange,
}) => {
  const { prefs, setPrefs } = usePrefs();
  const tr = useT();
  const units = profile.units;
  const [items, setItems] = useState<LoggedExercise[]>([]);
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [sessionReady, setSessionReady] = useState(false);
  const [restLeft, setRestLeft] = useState(0);
  /** The set that was just ticked ("exercise-row"), so its tick can burst once. */
  const [burst, setBurst] = useState('');
  const [restTotal, setRestTotal] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [restEnds, setRestEnds] = useState(0);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [outlier, setOutlier] = useState<{ ei: number; ri: number; typed: string; suggest: number | null } | null>(null);
  const [guide, setGuide] = useState<Exercise | null>(null);
  const [platesFor, setPlatesFor] = useState<string | null>(null);
  const [swapFor, setSwapFor] = useState<number | null>(null);
  // Paused: the clock, the rest countdown and the heart-rate average stand still until you resume.
  const [pausedAt, setPausedAt] = useState(0);
  // Exercises where the weight is added to, or taken off, your bodyweight (pull-ups with a belt or a band).
  const [weightMode, setWeightMode] = usePersistentState<Record<string, 'added' | 'assisted'>>('exercise_weight_mode', {});
  const restRemain = useRef(0);
  // Minimized: the workout goes on behind a small bar, and the rest of the app can be used.
  const [minimized, setMinimized] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  // The weight, reps or effort box being typed in, for the plus and minus bar above the keyboard.
  const [field, setField] = useState<{ ei: number; ri: number; kind: 'weight' | 'reps' | 'rpe' } | null>(null);
  const [tipSeen, setTipSeen] = useState(() => {
    try {
      return localStorage.getItem('kyfit_lift_tip') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (resumeToken) setMinimized(false);
  }, [resumeToken]);
  const [reorderOpen, setReorderOpen] = useState(false);
  const holdTimer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const [routineName, setRoutineName] = useState('');
  const [routineSaved, setRoutineSaved] = useState(false);
  const [sharing, setSharing] = useState(false);
  // How long to rest after each exercise, when it is not the usual time. Remembered per exercise.
  const [restByExercise, setRestByExercise] = usePersistentState<Record<string, number>>("exercise_rest", {});
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<{ prs: string[]; saved: WorkoutSession } | null>(null);
  const hrSamples = useRef<number[]>([]);
  const hrTimeline = useRef<[number, number][]>([]);
  const nativeStarted = useRef(false);
  const bpmRef = useRef(liveBpm);
  bpmRef.current = liveBpm;
  const restLen = prefs.liftRest;
  const showRpe = prefs.liftRpe;

  // What was done last time in each exercise, for the "previous" column and for filling a set with one tap.
  const previous = useMemo(() => {
    const out: Record<string, ReturnType<typeof previousSets>> = {};
    for (const it of items) out[it.exerciseId] = previousSets(workouts, it.exerciseId);
    return out;
  }, [items.map((i) => i.exerciseId).join('|'), workouts]); // eslint-disable-line react-hooks/exhaustive-deps

  const display = (kg: number): string => (kg > 0 ? String(kgToDisplay(kg, units)) : '');

  /** The weight to show for a past set of this exercise: what was added or taken off, or the plain weight. */
  const shownKg = (s: SetLog, id: string): number => {
    const mode = weightMode[id];
    return mode ? (s.load?.mode === mode ? s.load.kg : 0) : s.weightKg;
  };

  const rowFromSet = (s: SetLog, id: string): Row => ({
    reps: s.reps > 0 ? String(s.reps) : '',
    weight: display(shownKg(s, id)),
    done: false,
    ...(s.kind && s.kind !== 'normal' ? { kind: s.kind } : {}),
    ...(s.seconds ? { sec: clock(s.seconds) } : {}),
  });

  const buildRows = (exerciseId: string): Row[] => {
    const fromLogs = initialLogs?.find((l) => l.exerciseId === exerciseId);
    if (fromLogs && fromLogs.sets.length > 0) return fromLogs.sets.map((s) => rowFromSet(s, exerciseId));
    const last = previousSets(workouts, exerciseId);
    if (last && last.sets.length > 0) return last.sets.map((s) => rowFromSet(s, exerciseId));
    const timed = isTimedExercise(getExercise(exerciseId));
    return [0, 1, 2].map(() => (timed ? { reps: '', weight: '', sec: '', done: false } : { reps: '', weight: '', done: false }));
  };

  const makeItem = (id: string): LoggedExercise | null => {
    const ex = getExercise(id);
    if (!ex) return null;
    const fromLogs = initialLogs?.find((l) => l.exerciseId === id);
    const note = fromLogs?.note ?? previousSets(workouts, id)?.note;
    let rows = buildRows(ex.id);
    // An automatic increase: when every working set last time reached the reps, start heavier by the step.
    const rule = getRules()[id];
    const up = weightMode[id] ? null : progressedWeight(previousSets(workouts, id)?.sets, rule, (kg) => kgToDisplay(kg, units));
    if (up !== null && rule) rows = rows.map((r) => (r.kind === 'warmup' ? r : { ...r, weight: String(up) }));
    // A deload week: weights about 10% lighter and half the working sets.
    if (deloadActive(readStored<DeloadState>('lift_deload', DEFAULT_DELOAD), Date.now())) {
      const work = rows.filter((r) => r.kind !== 'warmup');
      const keep = deloadSets(work.length);
      let seen = 0;
      rows = rows
        .filter((r) => r.kind === 'warmup' || ++seen <= keep)
        .map((r) => {
          const w = parseFloat(r.weight);
          return w > 0 ? { ...r, weight: String(Math.round(w * 0.9 * 2) / 2) } : r;
        });
    }
    // Last session's effort against the target: easy means try more, hard means ease off (only with the effort box on and no automatic rule).
    const nudge = showRpe && up === null && !fromLogs ? effortNudge(previousSets(workouts, id)?.sets, prefs.liftTargetRpe) : null;
    return { exerciseId: ex.id, name: ex.name, rows, ...(fromLogs?.group ? { group: fromLogs.group } : {}), ...(note ? { note } : {}), ...(up !== null && rule ? { raised: rule.step } : {}), ...(nudge && nudge.dir !== 'same' ? { effort: { dir: nudge.dir, avgRpe: nudge.avgRpe } } : {}) };
  };

  // Start fresh every time the screen opens.
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
    setDeloadOn(deloadActive(readStored<DeloadState>('lift_deload', DEFAULT_DELOAD), Date.now()));
    // The phone records heart rate natively too, so nothing is lost while the screen is off.
    if (hasNativeTracker()) {
      nativeStarted.current = true;
      startNativeSession(false).catch(() => {
        nativeStarted.current = false;
      });
    }
    const draft = resume ? loadDraft(localStorage) : null;
    const ids = initialLogs && initialLogs.length > 0 ? initialLogs.map((l) => l.exerciseId) : initialExerciseIds;
    setItems(draft ? (draft.items as LoggedExercise[]) : (ids.map(makeItem).filter(Boolean) as LoggedExercise[]));
    setStartedAt(draft ? draft.startedAt : Date.now());
    setElapsed(draft ? Math.max(0, Math.floor((Date.now() - draft.startedAt) / 1000)) : 0);
    setRestLeft(draft && draft.restEnds > 0 ? Math.ceil((draft.restEnds - Date.now()) / 1000) : 0);
    setRestTotal(draft && draft.restEnds > 0 ? draft.restTotal : 0);
    setRestEnds(draft ? draft.restEnds : 0);
    setCursor(draft ? draft.cursor : 0);
    setShowPicker(false);
    setMenuFor(null);
    setSettingsOpen(false);
    setConfirmDiscard(false);
    setOutlier(null);
    setPlatesFor(null);
    setSwapFor(null);
    setReorderOpen(false);
    setPausedAt(draft?.pausedAt ?? 0);
    restRemain.current = draft?.restRemainMs ?? 0;
    setMinimized(false);
    setNotesOpen(!!draft?.notes);
    setField(null);
    setTitle(draft ? draft.title : (planDayTitle ?? ''));
    setNotes(draft ? draft.notes : '');
    setRoutineName('');
    setRoutineSaved(false);
    setSharing(false);
    setMessage('');
    setResult(null);
    hrSamples.current = [];
    hrTimeline.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Clock and heart-rate sampling (only real sensor data is averaged).
  useEffect(() => {
    if (!isOpen || result || pausedAt) return undefined;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      if (hrFromSensor && bpmRef.current > 0) {
        hrSamples.current.push(bpmRef.current);
        hrTimeline.current.push([Date.now(), bpmRef.current]);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isOpen, startedAt, result, hrFromSensor, pausedAt]);

  // Rest countdown, worked out from when it ends (not by counting ticks, which stop while the app is in the background), with a buzz at the end.
  useEffect(() => {
    if (restEnds <= 0) return undefined;
    let buzzed = false;
    const tick = () => {
      const left = Math.ceil((restEnds - Date.now()) / 1000);
      if (left <= 0) {
        setRestLeft(0);
        setRestEnds(0);
        if (!buzzed) {
          buzzed = true;
          // What the person chose for the end of a rest (the phone's notification does the same when the app is away).
          if (prefs.liftRestAlert === 'vibrate' || prefs.liftRestAlert === 'both') buzz(true, [200, 100, 200]);
          if (prefs.liftRestAlert === 'sound' || prefs.liftRestAlert === 'both') playBeep();
        }
      } else {
        setRestLeft(left);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [restEnds, prefs.liftRestAlert]);

  /** Stops the clock and the rest countdown; resuming gives back exactly the time that was left. */
  const togglePause = () => {
    const now = Date.now();
    if (pausedAt) {
      // The time spent paused is not workout time: move the start forward by it.
      setStartedAt((s) => s + (now - pausedAt));
      if (restRemain.current > 0) {
        setRestEnds(now + restRemain.current);
        setRestLeft(Math.ceil(restRemain.current / 1000));
      }
      restRemain.current = 0;
      setPausedAt(0);
    } else {
      restRemain.current = restEnds > now ? restEnds - now : 0;
      setRestEnds(0);
      setPausedAt(now);
      setElapsed(Math.floor((now - startedAt) / 1000));
    }
  };

  /** Rest after a set of this exercise: its own time if you set one, else the usual. */
  const restFor = (exerciseId: string): number => restByExercise[exerciseId] ?? restLen;

  const startRest = (seconds = restLen) => {
    if (seconds <= 0) return;
    setRestLeft(seconds);
    setRestTotal(seconds);
    setRestEnds(Date.now() + seconds * 1000);
  };

  const adjustRest = (delta: number) => {
    const left = Math.max(0, restLeft + delta);
    setRestLeft(left);
    setRestTotal((t) => Math.max(t, left));
    setRestEnds(left > 0 ? Date.now() + left * 1000 : 0);
  };

  const updateRow = (ei: number, ri: number, patch: Partial<Row>) =>
    setItems((prev) => prev.map((it, i) => (i !== ei ? it : { ...it, rows: it.rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)) })));

  // The step the weights move in (display units), a deload week flag, and the weight for the next set from the effort of the last one.
  const stepDisp = units === 'imperial' ? 5 : 2.5;
  const [deloadOn, setDeloadOn] = useState(false);
  const nextSuggestion = (it: LoggedExercise): { index: number; display: number } | null => {
    let last = -1;
    it.rows.forEach((r, i) => {
      if (r.done && r.kind !== 'warmup' && r.rpe) last = i;
    });
    if (last < 0) return null;
    const nextIdx = it.rows.findIndex((r, i) => i > last && !r.done && r.kind !== 'warmup');
    if (nextIdx < 0) return null;
    const r = it.rows[last];
    const w = parseFloat(r.weight);
    const reps = parseFloat(r.reps);
    const rpe = parseFloat(r.rpe ?? '');
    if (!(w > 0) || !(reps >= 1) || !(rpe >= 6)) return null;
    const kg = nextSetWeightKg({ weightKg: displayToKg(w, units), reps, rpe }, prefs.liftTargetRpe, displayToKg(stepDisp, units));
    if (kg === null) return null;
    const display = Math.round(kgToDisplay(kg, units) / stepDisp) * stepDisp;
    if (!(display > 0) || display === w) return null;
    return { index: nextIdx, display: Math.round(display * 100) / 100 };
  };
  const applyNextSuggestion = (ei: number) => {
    const s = nextSuggestion(items[ei]);
    if (s) updateRow(ei, s.index, { weight: String(s.display) });
  };
  const applyEffort = (ei: number, delta: number) =>
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== ei) return it;
        return { ...it, effort: undefined, rows: it.rows.map((r) => (r.kind === 'warmup' || !(parseFloat(r.weight) > 0) ? r : { ...r, weight: String(Math.max(0, Math.round((parseFloat(r.weight) + delta) * 100) / 100)) })) };
      })
    );

  const updateItem = (ei: number, patch: Partial<LoggedExercise>) => setItems((prev) => prev.map((it, i) => (i === ei ? { ...it, ...patch } : it)));

  const toggleDone = (ei: number, ri: number, confirmed = false) => {
    const it = items[ei];
    const row = it.rows[ri];
    const timed = isTimedExercise(getExercise(it.exerciseId));
    if (row.done) {
      updateRow(ei, ri, { done: false });
      return;
    }
    setBurst(`${ei}-${ri}`);
    // One tap on the tick accepts what you did last time for anything left empty.
    const prev = previous[it.exerciseId]?.sets[ri];
    const fill: Partial<Row> = {};
    if (timed) {
      if (!row.sec && prev?.seconds) fill.sec = clock(prev.seconds);
    } else {
      if (!row.reps && prev && prev.reps > 0) fill.reps = String(prev.reps);
    }
    if (!row.weight && prev && shownKg(prev, it.exerciseId) > 0) fill.weight = display(shownKg(prev, it.exerciseId));
    const merged = { ...row, ...fill };
    const worked = timed ? parseClock(merged.sec) > 0 : (parseFloat(merged.reps) || 0) > 0;
    if (!worked) {
      setMessage(timed ? 'Enter the time first.' : 'Enter the reps first.');
      return;
    }
    setMessage('');
    // A weight far above anything logged for this exercise is probably a slip (2250 for 225): ask before it goes in.
    if (!timed && !confirmed && !weightMode[it.exerciseId]) {
      const best = prBefore[it.exerciseId]?.oneRepMax ?? 0;
      const check = checkWeight(parseFloat(merged.weight) || 0, parseFloat(merged.reps) || 1, best > 0 ? kgToDisplay(best, units) : 0, units === 'imperial' ? 'lb' : 'kg');
      if (check) {
        setOutlier({ ei, ri, typed: merged.weight, suggest: check.suggest });
        return;
      }
    }
    completeSet(ei, ri, merged);
  };

  const completeSet = (ei: number, ri: number, merged: Row) => {
    const it = items[ei];
    buzz(prefs.uiHaptics, 25);
    const next = items.map((x, i) =>
      i !== ei
        ? x
        : {
            ...x,
            // The next set starts as a copy of this one, unless it already has numbers in it.
            rows: x.rows.map((r, j) => (j === ri ? { ...merged, done: true } : j === ri + 1 && !r.done && !r.reps && !r.weight && !r.sec ? { ...r, reps: merged.reps, weight: merged.weight, ...(merged.sec ? { sec: merged.sec } : {}) } : r)),
          }
    );
    setItems(next);
    // In a superset or circuit the next exercise of the round is up with no rest; the rest comes after the last one.
    const grouped = afterGroupedSetDone(next, ei, ri);
    if (grouped) setCursor(grouped.cursor);
    if (!grouped || grouped.rest) startRest(restFor(it.exerciseId));
  };

  const addSet = (ei: number) =>
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== ei) return it;
        const last = it.rows[it.rows.length - 1];
        return { ...it, rows: [...it.rows, { reps: last?.reps || '', weight: last?.weight || '', ...(last?.sec ? { sec: last.sec } : {}), done: false }] };
      })
    );

  const removeSet = (ei: number, ri: number) => setItems((prev) => prev.map((it, i) => (i !== ei ? it : { ...it, rows: it.rows.filter((_, j) => j !== ri) })));

  /** Warm-up sets at the front: 50, 70 and 90% of the first working weight. Earlier warm-ups that are not done yet are replaced. */
  const addWarmups = (ei: number) => {
    const it = items[ei];
    const first = it.rows.find((r) => r.kind !== 'warmup' && parseFloat(r.weight) > 0);
    if (!first) {
      setMessage('Enter a working weight first, then add warm-ups.');
      return;
    }
    const ex = getExercise(it.exerciseId);
    const bar = ex?.equipment === 'Barbell' ? gearFor(units === 'imperial' ? 'lb' : 'kg', prefs).bar : 0;
    const sets = warmupSets(parseFloat(first.weight), bar, units === 'imperial' ? 'lb' : 'kg');
    if (sets.length === 0) {
      setMessage('That weight is too light to need a warm-up.');
      return;
    }
    setMessage('');
    const rows: Row[] = sets.map((w) => ({ reps: String(w.reps), weight: String(w.weight), done: false, kind: 'warmup' as SetKind }));
    setItems((prev) => prev.map((x, i) => (i !== ei ? x : { ...x, rows: [...rows, ...x.rows.filter((r) => !(r.kind === 'warmup' && !r.done))] })));
  };

  const swapExercise = (ei: number, id: string) => {
    const ex = getExercise(id);
    setSwapFor(null);
    if (!ex || items.some((i) => i.exerciseId === id)) return;
    setItems((prev) => prev.map((x, i) => (i !== ei ? x : { ...x, exerciseId: ex.id, name: ex.name, raised: undefined })));
  };

  const reorder = (from: number, to: number) => {
    setItems((prev) => {
      if (to < 0 || to >= prev.length || from === to) return prev;
      const copy = [...prev];
      const [x] = copy.splice(from, 1);
      copy.splice(to, 0, x);
      return copy;
    });
    setCursor((c) => (c === from ? to : c));
  };

  const addExercises = (ids: string[]) => {
    const fresh = ids.filter((id) => !items.some((i) => i.exerciseId === id)).map(makeItem).filter(Boolean) as LoggedExercise[];
    if (fresh.length) setItems((prev) => [...prev, ...fresh]);
    setShowPicker(false);
  };

  const move = (ei: number, dir: -1 | 1) =>
    setItems((prev) => {
      const j = ei + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[ei], copy[j]] = [copy[j], copy[ei]];
      return copy;
    });

  // What to lift next, from the last sessions of each exercise (see lib/strengthProgress).
  const suggestions = useMemo(() => {
    const out: Record<string, Suggestion | null> = {};
    for (const it of items) out[it.exerciseId] = suggestNext(liftHistory(workouts, it.exerciseId), it.exerciseId, units);
    return out;
  }, [items.map((i) => i.exerciseId).join('|'), workouts, units]); // eslint-disable-line react-hooks/exhaustive-deps

  const applySuggestion = (ei: number, s: Suggestion) =>
    setItems((prev) => prev.map((it, i) => (i !== ei ? it : { ...it, rows: it.rows.map((r) => (r.done ? r : { ...r, weight: s.weightKg > 0 ? String(kgToDisplay(s.weightKg, units)) : '', reps: String(s.reps) })) })));

  /** The weight fields of a set: as typed, or for a bodyweight mode the load moved plus what was added or taken off. */
  const weightFields = (exerciseId: string, typed: number): { weightKg: number; load?: SetLog['load'] } => {
    const mode = weightMode[exerciseId];
    const entered = Math.max(0, displayToKg(typed, units));
    if (!mode) return { weightKg: entered };
    const bw = profile.weightKg > 0 ? profile.weightKg : 0;
    return { weightKg: mode === 'added' ? bw + entered : Math.max(0, bw - entered), load: { mode, kg: entered } };
  };

  const toLogs = (): ExerciseLog[] =>
    items
      .map((it) => ({
        exerciseId: it.exerciseId,
        name: it.name,
        ...(it.group ? { group: it.group } : {}),
        ...(it.note?.trim() ? { note: it.note.trim() } : {}),
        sets: it.rows
          .map((r): SetLog => {
            const seconds = parseClock(r.sec);
            const rpe = parseFloat(r.rpe ?? '');
            return {
              reps: Math.max(0, Math.round(parseFloat(r.reps) || 0)),
              ...weightFields(it.exerciseId, parseFloat(r.weight) || 0),
              done: r.done,
              ...(r.kind && r.kind !== 'normal' ? { kind: r.kind } : {}),
              ...(rpe >= 1 && rpe <= 10 ? { rpe } : {}),
              ...(seconds > 0 ? { seconds } : {}),
            };
          })
          .filter(hasWork),
      }))
      .filter((l) => l.sets.length > 0);

  const logs = toLogs();
  const totals = workoutTotals({ exercises: logs });
  const volumeKg = totals.volumeKg;
  const doneSets = totals.sets;

  const measuredKcal = watchKcal && watchKcal.ts >= startedAt && watchKcal.kcal > 0 ? Math.round(watchKcal.kcal) : null;
  const sessionKcal = measuredKcal ?? estimateCalories('Strength', elapsed / 60, profile.weightKg);

  // Mirror the session to the watch (timer, heart rate, calories; strength has no pause or distance).
  const watchState: WatchWorkoutState | null =
    isOpen && sessionReady && !result
      ? {
          active: true,
          type: 'Strength',
          startedAt,
          paused: !!pausedAt,
          pausedAt,
          pausedTotalMs: 0,
          distanceText: '',
          distanceKm: 0,
          paceText: '',
          kcal: sessionKcal,
          maxHr: getMaxHr(profile),
          canPause: true,
          miles: units === 'imperial',
          strength: buildWatchStrength({ items, cursor }, { units, restEndsAt: restEnds, restLen: restLen || 90, volume: formatWeight(volumeKg, units, 0) }) ?? undefined,
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
  const restLenRef = useRef(restLen || 90);
  restLenRef.current = restLen || 90;
  useWatchCommands((c: WatchCommand) => {
    // The watch's pause and resume buttons stop and start the clock and the rest timer here too.
    if (isOpen && !result && ((c.cmd === 'pause' && !pausedAt) || (c.cmd === 'resume' && pausedAt))) {
      togglePause();
      return;
    }
    if (c.cmd !== 'set' || !isOpen || result) return;
    // The watch's picker added an exercise (by its place in the library list): put it at the end and move to it.
    if (c.action === 'addex') {
      const ex = EXERCISES[Math.round(c.index ?? -1)];
      if (!ex) return;
      const at = itemsRef.current.findIndex((i) => i.exerciseId === ex.id);
      if (at >= 0) {
        cursorRef.current = at;
        setCursor(at);
        return;
      }
      const item = makeItem(ex.id);
      if (!item) return;
      const next = [...itemsRef.current, item];
      itemsRef.current = next;
      setItems(next);
      cursorRef.current = next.length - 1;
      setCursor(next.length - 1);
      return;
    }
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
      startRest(restLenRef.current);
    } else if (out.rest.kind === 'skip') {
      setRestLeft(0);
      setRestEnds(0);
    } else if (restEndsRef.current > Date.now()) {
      const left = Math.max(0, Math.ceil((restEndsRef.current - Date.now()) / 1000) + out.rest.seconds);
      setRestLeft(left);
      setRestEnds(left > 0 ? Date.now() + left * 1000 : 0);
    }
  });

  const handleFinish = async () => {
    if (logs.length === 0) return;
    const endAt = pausedAt || Date.now();
    const durationSec = Math.max(1, Math.round((endAt - startedAt) / 1000));
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
    // Effort: the average of the set efforts you typed, else a middling 7.
    const efforts = logs.flatMap((l) => l.sets.map((s) => s.rpe).filter((v): v is number => !!v));
    const effort = efforts.length ? Math.round(efforts.reduce((a, b) => a + b, 0) / efforts.length) : 7;
    const avgHr = measured ? Math.round(hrSeries.reduce((s, [, b]) => s + b, 0) / hrSeries.length) : Math.round(profile.restingHr + (maxHr - profile.restingHr) * (0.3 + effort * 0.04));
    const prs = detectNewPRs(workouts, logs);
    const session: WorkoutSession = {
      id: makeId('w-str'),
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
      perceivedExertion: effort,
      notes: notes.trim() || undefined,
      cardioLoadPoints: trimp(minutes, avgHr, maxHr, currentRestingHr()),
      exercises: logs,
      planDayTitle,
      title: title.trim() || undefined,
      ...(programRef ? { program: programRef } : {}),
    };
    onSave(session);
    setResult({ prs, saved: session });
  };

  // The watch's Stop button ends the session: save it if any sets were done, otherwise just close.
  const seenStopToken = useRef(remoteStopToken);
  useEffect(() => {
    if (remoteStopToken === seenStopToken.current) return;
    seenStopToken.current = remoteStopToken;
    if (!isOpen || result) return;
    if (logs.length > 0) void handleFinish();
    else onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteStopToken]);

  const saveRoutine = () => {
    const name = routineName.trim();
    if (!name || items.length === 0) return;
    onSaveRoutine(name, items.map((i) => i.exerciseId), undefined, targetsFromLogs(toLogs()));
    setRoutineName('');
    setRoutineSaved(true);
  };

  // The back button: close the top-most thing, and ask before throwing a workout away.
  // The back button puts a workout under way into the small bar (nothing is lost); an empty one just closes.
  const askDiscard = () => {
    if (result || (items.length === 0 && !notes && doneSets === 0)) onClose();
    else setMinimized(true);
  };
  useBack(isOpen && !minimized && !showPicker && menuFor === null && !settingsOpen && !confirmDiscard && !guide && !outlier && swapFor === null && platesFor === null && !reorderOpen, askDiscard);

  /** Plus or minus on the box being typed in (weight by the usual plate jump, reps by one, effort by half). */
  const stepField = (dir: 1 | -1) => {
    if (!field) return;
    const row = items[field.ei]?.rows[field.ri];
    if (!row) return;
    if (field.kind === 'weight') {
      const step = units === 'imperial' ? 5 : 2.5;
      const next = Math.max(0, Math.round(((parseFloat(row.weight) || 0) + dir * step) * 100) / 100);
      updateRow(field.ei, field.ri, { weight: next > 0 ? String(next) : '' });
    } else if (field.kind === 'reps') {
      const next = Math.max(0, Math.round(parseFloat(row.reps) || 0) + dir);
      updateRow(field.ei, field.ri, { reps: next > 0 ? String(next) : '' });
    } else {
      const base = parseFloat(row.rpe ?? '') || 7;
      updateRow(field.ei, field.ri, { rpe: String(Math.min(10, Math.max(1, base + dir * 0.5))) });
    }
  };
  const nextField = () => {
    const boxes = [...document.querySelectorAll<HTMLInputElement>('.lift section input.l-num-input')];
    const at = boxes.indexOf(document.activeElement as HTMLInputElement);
    boxes[at + 1]?.focus();
  };
  const fieldBlur = () =>
    window.setTimeout(() => {
      const a = document.activeElement;
      if (!(a instanceof HTMLInputElement && a.classList.contains('l-num-input'))) setField(null);
    }, 90);

  // Every change is written to storage straight away (not on a timer), so a crash or a dead battery loses nothing.
  useEffect(() => {
    if (!isOpen || !sessionReady || result) return;
    saveDraft(localStorage, { startedAt, items, cursor, title, notes, restEnds, restTotal, pausedAt, restRemainMs: restRemain.current });
  }, [isOpen, sessionReady, result, startedAt, items, cursor, title, notes, restEnds, restTotal, pausedAt]);
  // The notification shade and lock screen: the set you are on, and the rest countdown (which Android keeps ticking by itself).
  const liveWorkout = isOpen && sessionReady && !result;
  const liveItem = items[Math.min(cursor, Math.max(0, items.length - 1))];
  const liveSet = liveItem ? Math.max(0, liveItem.rows.findIndex((r) => !r.done)) : 0;
  const liveRow = liveItem?.rows[liveSet];
  const liveTitle = liveItem ? liveItem.name : 'Workout';
  const liveDetail = liveItem
    ? `Set ${liveSet + 1} of ${liveItem.rows.length}${liveRow && liveRow.weight ? ` · ${liveRow.weight} ${weightUnit(units)}${liveRow.reps ? ` × ${liveRow.reps}` : ''}` : ''}`
    : 'Add an exercise to begin';
  useEffect(() => {
    if (!isAndroidApp()) return;
    if (!liveWorkout) {
      LiftSession.sync({ active: false }).catch(() => {});
      return;
    }
    LiftSession.sync({ active: true, title: pausedAt ? 'Workout paused' : liveTitle, detail: liveDetail, startedAt, restEndsAt: restEnds, paused: !!pausedAt, alert: prefs.liftRestAlert }).catch(() => {});
  }, [liveWorkout, liveTitle, liveDetail, startedAt, restEnds, pausedAt, prefs.liftRestAlert]);
  useEffect(() => {
    if (liveWorkout) void ensureNotificationPermission();
  }, [liveWorkout]);
  // The screen stays on during a workout when that is switched on.
  useEffect(() => {
    if (!liveWorkout || !prefs.liftKeepAwake) return undefined;
    void keepScreenOn(true);
    return () => {
      void keepScreenOn(false);
    };
  }, [liveWorkout, prefs.liftKeepAwake]);
  // Once the workout is saved, discarded or closed there is nothing to come back to.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (result || (wasOpen.current && !isOpen)) clearDraft(localStorage);
    wasOpen.current = isOpen;
  }, [isOpen, result]);

  // Records so far: the best set of each exercise this session that beats the old record.
  const prBefore = useMemo(() => personalRecords(workouts), [workouts]);
  const prSet = (it: LoggedExercise): number => {
    const old = prBefore[it.exerciseId];
    if (!old) return -1;
    let best = -1;
    let bestE = old.oneRepMax + 0.01;
    it.rows.forEach((r, i) => {
      if (!r.done || r.kind === 'warmup') return;
      const reps = parseFloat(r.reps) || 0;
      const kg = weightFields(it.exerciseId, parseFloat(r.weight) || 0).weightKg;
      const e = reps > 0 && kg > 0 ? estimateOneRepMax(kg, reps, parseFloat(r.rpe ?? '') || undefined) : 0;
      if (e > bestE) {
        bestE = e;
        best = i;
      }
    });
    return best;
  };

  const setLabel = (it: LoggedExercise, ri: number): string => setNumber(it.rows, ri);

  const prevText = (it: LoggedExercise, ri: number): string => {
    const p = previous[it.exerciseId]?.sets[ri];
    if (!p) return '–';
    if ((p.seconds ?? 0) > 0 && p.reps <= 0) return clock(p.seconds ?? 0);
    const mode = weightMode[it.exerciseId];
    if (mode) {
      const kg = shownKg(p, it.exerciseId);
      return kg > 0 ? `${mode === 'assisted' ? '−' : '+'}${kgToDisplay(kg, units)}×${p.reps}` : `BW×${p.reps}`;
    }
    return p.weightKg > 0 ? `${kgToDisplay(p.weightKg, units)}×${p.reps}` : `${p.reps} reps`;
  };

  if (!isOpen) return null;

  const unit = weightUnit(units);

  // ---- The finished screen ----
  if (result) {
    const t = workoutTotals(result.saved);
    return (
      <LiftShell label="Workout complete" z={90}>
        <Header title={tr('lift.wo.complete')} right={<button type="button" className="l-btn l-btn-primary" onClick={onClose}>{tr('lift.wo.done')}</button>} />
        <div className="l-scroll pt-12">
          <div className="l-rise text-center">
            <span className="l-celebrate mx-auto">
              {result.prs.length > 0 ? <Trophy className="h-9 w-9" aria-hidden="true" /> : <Check className="h-9 w-9" aria-hidden="true" />}
            </span>
            <div className="mt-5 text-2xl font-extrabold tracking-tight">{result.saved.title || 'Workout saved'}</div>
            <div className="l-dim text-sm">{result.prs.length > 0 ? `${result.prs.length} new record${result.prs.length === 1 ? '' : 's'}` : new Date(result.saved.startedAt ?? Date.now()).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          </div>
          <div className="l-card l-rise mt-6 grid grid-cols-3 gap-2 p-4 text-center" style={{ ['--i' as string]: 2 }}>
            <Stat label={tr('lift.wo.duration')} value={clock((result.saved.durationSec ?? 0))} />
            <Stat label={tr('lift.wo.volume')} value={formatWeight(t.volumeKg, units, 0)} />
            <Stat label={tr('lift.wo.sets')} value={t.sets} />
          </div>
          <button type="button" className="l-btn l-rise mt-3 w-full" style={{ ['--i' as string]: 3 }} onClick={() => setSharing(true)}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {tr('lift.wo.share')}
          </button>
          <LiftShareSheet open={sharing} onClose={() => setSharing(false)} workout={result.saved} others={workouts} units={units} />
          {result.prs.length > 0 && (
            <div className="l-card l-hero l-rise mt-4 p-4" style={{ ['--i' as string]: 4 }}>
              <div className="l-pr flex items-center gap-2 text-sm font-bold">
                <Trophy className="h-4 w-4" aria-hidden="true" />
                New personal record{result.prs.length > 1 ? 's' : ''}
              </div>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                {result.prs.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5">
            <label htmlFor="lw-routine-done" className="l-dim text-xs font-semibold">
              Save these exercises as a routine
            </label>
            <div className="mt-1 flex gap-2">
              <input id="lw-routine-done" className="h-11 min-w-0 flex-1 px-3 text-sm" value={routineName} onChange={(e) => setRoutineName(e.target.value)} placeholder="Routine name" />
              <button type="button" className="l-btn" disabled={!routineName.trim()} onClick={saveRoutine}>
                Save
              </button>
            </div>
            {routineSaved && (
              <p role="status" className="l-dim mt-2 text-sm">
                Saved. Find it under Workout.
              </p>
            )}
          </div>
        </div>
      </LiftShell>
    );
  }

  if (minimized) {
    return <ResumeBar title={title.trim() || planDayTitle || liveTitle} clock={clock(elapsed)} paused={pausedAt > 0} restText={restLeft > 0 ? clock(restLeft) : null} onOpen={() => setMinimized(false)} />;
  }

  return (
    <LiftShell label="Log workout" z={90}>
      <div className="l-header">
        <button type="button" className="l-icon-btn -ml-1" onClick={askDiscard} aria-label={tr('lift.wo.minimize')}>
          <ChevronDown className="h-6 w-6" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums" role="timer" aria-label={`Workout time ${clock(elapsed)}${pausedAt ? ', paused' : ''}`} style={pausedAt ? { opacity: 0.6 } : undefined}>
            <Clock className="l-dim h-4 w-4" aria-hidden="true" />
            {clock(elapsed)}
          </div>
          <button type="button" className="l-icon-btn" onClick={togglePause} aria-label={pausedAt ? tr('lift.wo.resumeWorkout') : tr('lift.wo.pause')} aria-pressed={!!pausedAt}>
            {pausedAt ? <Play className="h-5 w-5" aria-hidden="true" /> : <Pause className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="l-icon-btn" onClick={() => setSettingsOpen(true)} aria-label={tr('lift.wo.settings')}>
            <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" className="l-btn l-btn-primary" disabled={doneSets === 0} onClick={() => void handleFinish()}>
            {tr('lift.wo.finish')}
          </button>
        </div>
      </div>

      <div className="l-scroll pt-3">
        {pausedAt > 0 && (
          <div className="l-card mb-3 flex items-center justify-between gap-3 px-4 py-3" role="status">
            <span className="text-sm font-semibold">{tr('lift.wo.paused')}</span>
            <button type="button" className="l-btn l-btn-primary shrink-0" onClick={togglePause}>
              {tr('lift.wo.resume')}
            </button>
          </div>
        )}
        <div className="flex items-baseline justify-between pb-2 text-sm tabular-nums" aria-label="Workout totals">
          <span>
            <span className="l-dim">{tr('lift.wo.setsDone', { n: doneSets })}</span>
          </span>
          <span>
            <span className="text-lg font-bold">{formatWeight(volumeKg, units, 0)}</span> <span className="l-dim">{tr('lift.wo.lifted')}</span>
          </span>
        </div>
        <label htmlFor="lw-title" className="sr-only">
          Workout title
        </label>
        <input id="lw-title" className="h-11 w-full px-3 text-base font-semibold" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder={tr('lift.wo.title')} />
        {notesOpen || notes ? (
          <>
            <label htmlFor="lw-notes" className="sr-only">
              Workout notes
            </label>
            <input id="lw-notes" className="mt-2 h-11 w-full px-3 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr('lift.wo.notesPh')} />
          </>
        ) : (
          <button type="button" className="l-btn l-btn-quiet !min-h-9 !px-1 !text-xs" onClick={() => setNotesOpen(true)}>
            {tr('lift.wo.addNotes')}
          </button>
        )}
        {message && (
          <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--l-warm)' }}>
            {message}
          </p>
        )}

        {!tipSeen && items.length > 0 && (
          <div className="l-card mt-3 flex items-start gap-3 px-4 py-3 text-xs leading-relaxed" role="note">
            <span className="min-w-0 flex-1">
              {tr('lift.wo.tip')}
            </span>
            <button
              type="button"
              className="l-btn l-btn-quiet shrink-0 !min-h-8 !px-2 !text-xs"
              onClick={() => {
                setTipSeen(true);
                try {
                  localStorage.setItem('kyfit_lift_tip', '1');
                } catch {
                  // not remembered
                }
              }}
            >
              {tr('lift.wo.gotIt')}
            </button>
          </div>
        )}

        {deloadOn && (
          <div className="l-card mb-3 text-sm" role="note">
            <span className="font-bold">Deload week.</span> Weights are about 10% lighter and each exercise has half the sets. Easy does it.
          </div>
        )}

        {items.map((it, ei) => {
          const ex = getExercise(it.exerciseId);
          const timed = isTimedExercise(ex);
          const kind = groupKind(items, ei);
          const linkedToNext = !!it.group && items[ei + 1]?.group === it.group;
          const mode = weightMode[it.exerciseId];
          const sug = mode ? null : suggestions[it.exerciseId];
          const pr = prSet(it);
          const gridClass = `l-set-grid${showRpe ? ' with-rpe' : ''}`;
          return (
            <section key={it.exerciseId} className="mt-5" aria-label={it.name}>
              <div
                className="flex items-start justify-between gap-2"
                onPointerDown={() => {
                  held.current = false;
                  window.clearTimeout(holdTimer.current);
                  holdTimer.current = window.setTimeout(() => {
                    held.current = true;
                    setReorderOpen(true);
                  }, 550);
                }}
                onPointerUp={() => window.clearTimeout(holdTimer.current)}
                onPointerLeave={() => window.clearTimeout(holdTimer.current)}
                onPointerMove={(e) => {
                  if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) window.clearTimeout(holdTimer.current);
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <MuscleBadge group={ex?.muscle ?? 'Full Body'} size={38} />
                <div className="min-w-0">
                  {kind !== 'single' && (
                    <div className="mb-0.5 text-[11px] font-bold uppercase" style={{ color: 'var(--l-accent)' }}>
                      {kind === 'circuit' ? 'Circuit' : 'Superset'} {groupLabel(items, ei)}
                    </div>
                  )}
                  <button type="button" className="text-left text-base font-bold" style={{ color: 'var(--l-accent)', background: 'transparent', border: 0, padding: 0 }} onClick={() => {
                    if (held.current) {
                      held.current = false;
                      return;
                    }
                    if (ex) setGuide(ex);
                  }}>
                    {it.name}
                  </button>
                  {ex && (
                    <div className="l-dim text-xs">
                      {ex.muscle} · {ex.equipment}
                      {restByExercise[it.exerciseId] !== undefined ? ` · Rest ${restText(restByExercise[it.exerciseId])}` : ''}
                      {it.raised ? ` · Auto +${it.raised} ${unit}` : ''}
                    </div>
                  )}
                </div>
                </div>
                <div className="-mr-2 flex shrink-0 items-center">
                  {(ex?.equipment === 'Barbell' || ex?.equipment === 'Trap Bar' || ex?.equipment === 'EZ Bar' || ex?.equipment === 'Smith Machine') && (
                    <button type="button" className="l-icon-btn" onClick={() => setPlatesFor(it.exerciseId)} aria-label={`Plate calculator for ${it.name}`}>
                      <Dumbbell className="h-5 w-5" aria-hidden="true" />
                    </button>
                  )}
                  <button type="button" className="l-icon-btn" onClick={() => setMenuFor(ei)} aria-label={`Options for ${it.name}`}>
                    <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {it.note !== undefined && (
                <>
                  <label htmlFor={`note-${ei}`} className="sr-only">
                    Note for {it.name}
                  </label>
                  <input id={`note-${ei}`} className="mt-2 h-10 w-full px-3 text-sm" value={it.note} onChange={(e) => updateItem(ei, { note: e.target.value })} placeholder="Add a note for this exercise" />
                </>
              )}

              {sug && (
                <div className="l-card mt-2 flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1">{sug.reason}</span>
                  <button type="button" className="l-btn !min-h-8 !px-3 !text-xs" onClick={() => applySuggestion(ei, sug)}>
                    Use
                  </button>
                </div>
              )}

              <div className={`${gridClass} l-dim mt-2 px-0.5 text-[11px] font-bold uppercase`} aria-hidden="true">
                <span className="text-center">{tr('lift.wo.set')}</span>
                <span className="text-center">{tr('lift.wo.previous')}</span>
                <span className="text-center">{mode === 'assisted' ? `−${unit}` : mode === 'added' ? `+${unit}` : timed ? `+${unit}` : unit}</span>
                <span className="text-center">{timed ? 'Time' : tr('lift.wo.reps')}</span>
                {showRpe && <span className="text-center">RPE</span>}
                <span className="text-center">
                  <Check className="mx-auto h-3.5 w-3.5" />
                </span>
              </div>
              {it.rows.map((r, ri) => {
                const p = previous[it.exerciseId]?.sets[ri];
                const kindName = kindInfo(r.kind).label;
                return (
                  <SwipeDelete key={ri} className="mt-1" label={`${it.name} set ${ri + 1}`} onDelete={() => removeSet(ei, ri)}>
                  <div className={`${gridClass} l-set-row`} data-done={r.done} data-pr={ri === pr && r.done}>
                    <button
                      type="button"
                      className="l-set-num"
                      data-kind={r.kind ?? 'normal'}
                      onClick={() => updateRow(ei, ri, { kind: nextKind(r.kind) })}
                      aria-label={`${it.name} set ${ri + 1}, ${kindName}. Tap to change the set type.`}
                    >
                      {setLabel(it, ri)}
                    </button>
                    <button type="button" className="l-dim text-center text-xs tabular-nums" style={{ background: 'transparent', border: 0 }} onClick={() => {
                      if (!p) return;
                      updateRow(ei, ri, { weight: display(shownKg(p, it.exerciseId)), ...(timed ? { sec: clock(p.seconds ?? 0) } : { reps: p.reps > 0 ? String(p.reps) : '' }) });
                    }} aria-label={p ? `Previous: ${prevText(it, ri)}. Tap to use it.` : 'No previous set'}>
                      {prevText(it, ri)}
                    </button>
                    <input
                      aria-label={`${it.name} set ${ri + 1} ${mode === 'assisted' ? 'assistance' : timed || mode === 'added' ? 'added weight' : 'weight'}`}
                      inputMode="decimal"
                      className="l-num-input"
                      onFocus={(e) => {
                        selectAll(e);
                        setField({ ei, ri, kind: 'weight' });
                      }}
                      onBlur={fieldBlur}
                      value={r.weight}
                      placeholder={p && shownKg(p, it.exerciseId) > 0 ? display(shownKg(p, it.exerciseId)) : '0'}
                      onChange={(e) => updateRow(ei, ri, { weight: e.target.value })}
                    />
                    {timed ? (
                      <input aria-label={`${it.name} set ${ri + 1} time`} inputMode="text" className="l-num-input" onFocus={selectAll} value={r.sec ?? ''} placeholder={p?.seconds ? clock(p.seconds) : '0:30'} onChange={(e) => updateRow(ei, ri, { sec: e.target.value })} />
                    ) : (
                      <input aria-label={`${it.name} set ${ri + 1} reps`} inputMode="numeric" className="l-num-input" onFocus={(e) => { selectAll(e); setField({ ei, ri, kind: 'reps' }); }} onBlur={fieldBlur} value={r.reps} placeholder={p && p.reps > 0 ? String(p.reps) : '0'} onChange={(e) => updateRow(ei, ri, { reps: e.target.value })} />
                    )}
                    {showRpe && <input aria-label={`${it.name} set ${ri + 1} effort, 1 to 10`} inputMode="decimal" className="l-num-input" onFocus={(e) => { selectAll(e); setField({ ei, ri, kind: 'rpe' }); }} onBlur={fieldBlur} value={r.rpe ?? ''} placeholder="–" onChange={(e) => updateRow(ei, ri, { rpe: e.target.value })} />}
                    <button type="button" className={`l-done${burst === `${ei}-${ri}` ? ' l-just-done' : ''}`} aria-pressed={r.done} aria-label={`${r.done ? 'Mark not done' : 'Mark done'}: ${it.name} set ${ri + 1}${ri === pr ? ', a new record' : ''}`} onClick={() => toggleDone(ei, ri)}>
                      {ri === pr && r.done ? <Trophy className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                  </SwipeDelete>
                );
              })}
              {it.effort && (
                <div className="l-card mt-2 flex items-center justify-between gap-3 text-xs">
                  <span>
                    Last time averaged effort {it.effort.avgRpe}, {it.effort.dir === 'up' ? 'easier' : 'harder'} than your target. Try {it.effort.dir === 'up' ? '+' : '-'}{stepDisp} {unit}.
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button type="button" className="l-chip" onClick={() => applyEffort(ei, it.effort!.dir === 'up' ? stepDisp : -stepDisp)}>Apply</button>
                    <button type="button" className="l-chip" onClick={() => updateItem(ei, { effort: undefined })} aria-label="Dismiss">Skip</button>
                  </span>
                </div>
              )}
              {showRpe && nextSuggestion(it) && (
                <button type="button" className="l-chip mt-2" onClick={() => applyNextSuggestion(ei)}>
                  Next set: {nextSuggestion(it)!.display} {unit} should land near effort {prefs.liftTargetRpe}. Use it
                </button>
              )}
              <div className="mt-2 flex gap-2">
                <button type="button" className="l-btn flex-1" onClick={() => addSet(ei)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {tr('lift.wo.addSet')}
                </button>
                <button type="button" className="l-btn flex-1" onClick={() => removeSet(ei, it.rows.length - 1)} disabled={it.rows.length <= 1} aria-label={`Remove the last set of ${it.name}`}>
                  <Minus className="h-4 w-4" aria-hidden="true" />
                  {tr('lift.wo.removeSet')}
                </button>
              </div>
              {ei < items.length - 1 && (
                <button
                  type="button"
                  className="l-btn l-btn-quiet mt-1 !min-h-9 !text-xs"
                  aria-pressed={linkedToNext}
                  onClick={() => setItems((prev) => (linkedToNext ? unlinkFromNext(prev, ei) : linkWithNext(prev, ei)))}
                >
                  {linkedToNext ? `Unlink from ${items[ei + 1].name}` : `Superset with ${items[ei + 1].name}`}
                </button>
              )}
            </section>
          );
        })}

        <button type="button" className="l-btn l-btn-primary mt-6 w-full" onClick={() => setShowPicker(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {tr('lift.wo.addExercise')}
        </button>
        <button type="button" className="l-btn l-btn-danger mt-2 w-full" onClick={() => setConfirmDiscard(true)}>
          {tr('lift.wo.cancel')}
        </button>
        <div className="h-24" />
      </div>

      {field && items[field.ei]?.rows[field.ri] && (
        <StepperBar
          label={`${items[field.ei].name} · set ${field.ri + 1} · ${field.kind === 'weight' ? 'weight' : field.kind === 'reps' ? 'reps' : 'effort'}`}
          step={field.kind === 'weight' ? `${units === 'imperial' ? 5 : 2.5} ${weightUnit(units)}` : field.kind === 'reps' ? '1 rep' : '0.5'}
          onStep={stepField}
          onNext={nextField}
          onDone={() => {
            const at = field;
            (document.activeElement as HTMLElement | null)?.blur();
            setField(null);
            if (!items[at.ei].rows[at.ri].done) toggleDone(at.ei, at.ri);
          }}
        />
      )}

      {restLeft > 0 && (
        <div className="l-card flex-none rounded-none border-x-0 border-b-0 px-4 py-3" role="timer" aria-label={`Rest ${clock(restLeft)} left`}>
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="l-btn !min-h-10" onClick={() => adjustRest(-15)}>
              −15
            </button>
            <RestRing left={restLeft} total={restTotal} label={`Rest ${clock(restLeft)} left`}>
              <div className="text-xl font-bold tabular-nums leading-none">{clock(restLeft)}</div>
              <div className="l-dim mt-0.5 text-[10px] uppercase">{tr('lift.wo.rest')}</div>
            </RestRing>
            <button type="button" className="l-btn !min-h-10" onClick={() => adjustRest(15)}>
              +15
            </button>
            <button type="button" className="l-btn l-btn-primary !min-h-10" onClick={() => {
              setRestLeft(0);
              setRestEnds(0);
            }}>
              {tr('lift.wo.skip')}
            </button>
          </div>
        </div>
      )}

      {showPicker && <ExercisePicker already={items.map((i) => i.exerciseId)} workouts={workouts} custom={custom} onCustomChange={onCustomChange} onPick={addExercises} onClose={() => setShowPicker(false)} />}

      {swapFor !== null && items[swapFor] && (
        <ExercisePicker single title={`Swap ${items[swapFor].name}`} already={items.map((i) => i.exerciseId)} workouts={workouts} custom={custom} onCustomChange={onCustomChange} onPick={(ids) => swapExercise(swapFor, ids[0])} onClose={() => setSwapFor(null)} />
      )}

      <PlateSheet
        open={platesFor !== null}
        onClose={() => setPlatesFor(null)}
        unit={units === 'imperial' ? 'lb' : 'kg'}
        weight={(() => {
          const it = items.find((i) => i.exerciseId === platesFor);
          const row = it && (it.rows.find((r) => !r.done && r.kind !== 'warmup' && parseFloat(r.weight) > 0) ?? it.rows.find((r) => parseFloat(r.weight) > 0));
          return row?.weight ?? '';
        })()}
      />

      <ReorderSheet open={reorderOpen} onClose={() => setReorderOpen(false)} names={items.map((i) => i.name)} onMove={reorder} />

      {/* One exercise's options */}
      <Sheet open={menuFor !== null} onClose={() => setMenuFor(null)} title={menuFor !== null ? items[menuFor]?.name ?? 'Exercise' : 'Exercise'}>
        {menuFor !== null && items[menuFor] && (
          <div className="space-y-1">
            {[
              { label: 'Add warm-up sets', run: () => addWarmups(menuFor) },
              { label: 'Swap this exercise', run: () => setSwapFor(menuFor) },
              ...(items[menuFor].rows.length > 1 ? [{ label: 'Remove the last set', run: () => removeSet(menuFor, items[menuFor].rows.length - 1) }] : []),
              { label: 'Reorder exercises', run: () => setReorderOpen(true) },
              { label: items[menuFor].note === undefined ? 'Add a note' : 'Remove the note', run: () => updateItem(menuFor, { note: items[menuFor].note === undefined ? '' : undefined }) },
              ...(menuFor > 0 ? [{ label: 'Move up', run: () => move(menuFor, -1) }] : []),
              ...(menuFor < items.length - 1 ? [{ label: 'Move down', run: () => move(menuFor, 1) }] : []),
              { label: 'How to do it', run: () => { const e = getExercise(items[menuFor].exerciseId); if (e) setGuide(e); } },
            ].map((a) => (
              <button key={a.label} type="button" className="l-btn w-full !justify-start" onClick={() => { a.run(); setMenuFor(null); }}>
                {a.label}
              </button>
            ))}
            <div className="px-1 pt-3">
              <div className="mb-2 text-sm font-semibold">How the weight counts</div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How the weight counts">
                {([['', 'Normal'], ['added', 'Added to bodyweight'], ['assisted', 'Assisted (machine or band)']] as const).map(([id, label]) => (
                  <button
                    key={id || 'normal'}
                    type="button"
                    role="radio"
                    aria-checked={(weightMode[items[menuFor].exerciseId] ?? '') === id}
                    className="l-chip"
                    onClick={() =>
                      setWeightMode((prev) => {
                        const { [items[menuFor].exerciseId]: _gone, ...rest } = prev;
                        void _gone;
                        return id ? { ...rest, [items[menuFor].exerciseId]: id } : rest;
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="l-dim mt-2 text-xs">For pull-ups, dips and the like: type what you add (a belt) or what the help takes off. Your bodyweight from your profile is used for records and volume.</p>
            </div>
            <div className="px-1 pb-2 pt-3">
              <div className="mb-2 text-sm font-semibold">Rest after this exercise</div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Rest after this exercise">
                <button
                  type="button"
                  role="radio"
                  aria-checked={restByExercise[items[menuFor].exerciseId] === undefined}
                  className="l-chip"
                  onClick={() => setRestByExercise((prev) => { const { [items[menuFor].exerciseId]: _gone, ...rest } = prev; void _gone; return rest; })}
                >
                  Usual ({restText(restLen)})
                </button>
                {[0, 30, 45, 60, 90, 120, 180, 240, 300].map((sec) => (
                  <button key={sec} type="button" role="radio" aria-checked={restByExercise[items[menuFor].exerciseId] === sec} className="l-chip" onClick={() => setRestByExercise((prev) => ({ ...prev, [items[menuFor].exerciseId]: sec }))}>
                    {restText(sec)}
                  </button>
                ))}
              </div>
              <p className="l-dim mt-2 text-xs">Heavy lifts often need longer than curls. This is remembered for next time.</p>
            </div>
            <button type="button" className="l-btn l-btn-danger w-full !justify-start" onClick={() => { setItems((prev) => removeAt(prev, menuFor)); setMenuFor(null); }}>
              Remove exercise
            </button>
          </div>
        )}
      </Sheet>

      {/* Workout settings */}
      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Workout settings">
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-sm font-semibold">Rest timer after a set</div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Rest timer">
              {REST_CHOICES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={restLen === s} className="l-chip" onClick={() => setPrefs({ liftRest: s })}>
                  {s === 0 ? 'Off' : s >= 60 ? `${s / 60 >= 1 && s % 60 === 0 ? s / 60 : (s / 60).toFixed(1)} min` : `${s} s`}
                </button>
              ))}
            </div>
          </div>
          <button type="button" role="switch" aria-checked={showRpe} className="flex min-h-11 w-full items-center justify-between text-left" style={{ background: 'transparent', border: 0, color: 'var(--l-text)' }} onClick={() => setPrefs({ liftRpe: !showRpe })}>
            <span>
              <span className="block text-sm font-semibold">Effort (RPE) for each set</span>
              <span className="l-dim block text-xs">Adds a box for how hard each set was, 1 to 10</span>
            </span>
            <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: showRpe ? 'var(--l-fill)' : 'var(--l-s2)', color: showRpe ? 'var(--l-on-fill)' : 'var(--l-dim-s2)' }}>
              {showRpe ? 'On' : 'Off'}
            </span>
          </button>
          {showRpe && (
            <div>
              <div className="mb-2 text-sm font-semibold">Target effort (RPE)</div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Target effort">
                {[7, 7.5, 8, 8.5, 9].map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={prefs.liftTargetRpe === v} className="l-chip" onClick={() => setPrefs({ liftTargetRpe: v })}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}
          <AlertSettings />
          {items.length > 0 && (
            <div>
              <label htmlFor="lw-routine" className="text-sm font-semibold">
                Save these exercises as a routine
              </label>
              <div className="mt-1 flex gap-2">
                <input id="lw-routine" className="h-11 min-w-0 flex-1 px-3 text-sm" value={routineName} onChange={(e) => setRoutineName(e.target.value)} placeholder="Routine name" />
                <button type="button" className="l-btn" disabled={!routineName.trim()} onClick={() => { saveRoutine(); setSettingsOpen(false); }}>
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </Sheet>

      <GuideSheet exercise={guide} onClose={() => setGuide(null)} extra={guide && exerciseEntries(workouts, guide.id)[0] ? <p className="l-dim mt-3 text-xs">Last time: {exerciseEntries(workouts, guide.id)[0].sets.length} sets.</p> : null} />

      {/* A weight that looks like a typing slip */}
      <Sheet open={outlier !== null} onClose={() => setOutlier(null)} title="Check that weight">
        {outlier && (
          <>
            <p className="mb-4 text-sm">
              {outlier.suggest !== null ? `Did you mean ${outlier.suggest} ${unit}?` : `${outlier.typed} ${unit} is far more than you usually lift.`}
              <span className="l-dim"> You typed {outlier.typed} {unit}.</span>
            </p>
            <div className="flex gap-2">
              {outlier.suggest !== null && (
                <button
                  type="button"
                  className="l-btn l-btn-primary flex-1"
                  onClick={() => {
                    const o = outlier;
                    setOutlier(null);
                    const row = { ...items[o.ei].rows[o.ri], weight: String(o.suggest) };
                    updateRow(o.ei, o.ri, { weight: String(o.suggest) });
                    completeSet(o.ei, o.ri, row);
                  }}
                >
                  Use {outlier.suggest}
                </button>
              )}
              <button
                type="button"
                className="l-btn flex-1"
                onClick={() => {
                  const o = outlier;
                  setOutlier(null);
                  toggleDone(o.ei, o.ri, true);
                }}
              >
                Keep {outlier.typed}
              </button>
            </div>
            <button type="button" className="l-btn mt-2 w-full" onClick={() => setOutlier(null)}>
              Edit it
            </button>
          </>
        )}
      </Sheet>

      {/* Throwing a workout away */}
      <Sheet open={confirmDiscard} onClose={() => setConfirmDiscard(false)} title="Cancel workout?">
        <p className="l-dim mb-4 text-sm">{doneSets > 0 ? `This workout has ${doneSets} finished set${doneSets === 1 ? '' : 's'}. They will be lost.` : 'Nothing has been logged yet.'}</p>
        <div className="flex gap-2">
          <button type="button" className="l-btn flex-1" onClick={() => setConfirmDiscard(false)}>
            Keep going
          </button>
          <button type="button" className="l-btn flex-1" style={{ background: 'var(--l-fail)', borderColor: 'var(--l-fail)', color: 'var(--l-on-fail)' }} onClick={onClose}>
            Discard
          </button>
        </div>
      </Sheet>
    </LiftShell>
  );
};
