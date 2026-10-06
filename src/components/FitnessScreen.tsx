import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Activity,
  Pause,
  Square,
  Footprints,
  Bike,
  Plus,
  Dumbbell,
  MapPin,
  Mountain,
  Flag,
  Target,
  Check,
  CheckCircle2,
  Minus,
  Zap,
  Route as RouteIcon,
  MessageSquare,
} from 'lucide-react';
import { Segmented } from './ui/Segmented';
import type { WeatherState } from '../hooks/useWeather';
import { WeatherCard } from './WeatherCard';
import { GearKind, NO_GEAR, Shoe, defaultShoe, gearKindFor, gearOfKind, kindOf, shoeKm, shoeMessage, shoeState } from '../lib/shoes';
import { buildWatchGear } from '../lib/watchGear';
import { QUICK_WORKOUT_SUGGESTIONS } from '../data/catalog';
import { Lap, QuickWorkoutTemplate, WorkoutSession, WorkoutType } from '../types/health';
import { ActivePlan, PlanDay, Routine, RunOptions, UserProfile, WorkoutPlan } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { useGeoTracker } from '../hooks/useGeoTracker';
import { markWatchWorkoutDiscarded, useWatchCommands, useWatchWorkoutSync } from '../hooks/useWatchWorkoutSync';
import { CalorieSample, WatchCommand, WatchWorkoutState } from '../lib/watch';
import { currentRestingHr, estimateCalories, estimateWorkoutCalories, getMaxHr, heartRateZone, ZONE_NAMES, trimp, workoutsOnDay } from '../lib/calc';
import { summarizeStrokes } from '../lib/strokeRate';
import {  todayKey } from '../lib/dates';
import { KM_PER_MI, distanceUnit, formatDistance, formatPace, kmToDisplay } from '../lib/units';
import type { RunSection } from '../lib/appMap';
import {
  GPS_TYPES,
  GoalType,
  ActiveGoal,
  LiveRun,
  SETUP_KEY,
  DEFAULT_CUSTOM,
  RunSetup,
  readSetup,
  readLiveRun,
  writeLiveRun,
  clearLiveRun,
  GOAL_LABELS,
  GOAL_DEFAULTS,
  GOAL_PRESETS,
  goalKey,
  readSavedGoal,
  goalUnitLabel,
  goalSummary,
} from '../lib/runSetup';
import { LatLng, haversineKm } from '../lib/geo';
import { FollowState, RouteFollower, bearingDeg, headingFrom, relativeTurn, turnAdvice, turnText } from '../lib/routeFollow';
import type { SavedRoute } from '../lib/savedRoutes';
import { FollowBanner } from './FollowBanner';
import { StrengthLoggerModal } from './StrengthLoggerModal';
import { WorkoutDetailModal } from './WorkoutDetailModal';
import { ErrorBoundary } from './ErrorBoundary';
import { LiveMap } from './LiveMap';
import { RoutesView } from './RoutesView';
import { ManualWorkoutModal } from './ManualWorkoutModal';
import { ActivitiesPanel } from './ActivitiesPanel';
import { SegmentsPanel } from './SegmentTools';
import { hasNativeTracker, readNativeSamples, speakNative, startNativeSession, stopNativeSession } from '../lib/tracker';
import { Glance, Launch, isAndroidApp } from '../lib/native';
import { buildWatchRoutines, resolveWatchRoutine, watchRoutinesJson } from '../lib/watchStrength';
import { readCadence, readStrokeRate, startCadence, startStrokes, stopCadence, stopStrokes, summarizeCadence } from '../lib/cadence';
import {
  CustomIntervalInput,
  INTERVAL_WORKOUTS,
  IntervalStep,
  buildCustomIntervals,
  describeStep,
  plannedSeconds,
  stepProgress,
} from '../data/intervals';
import { formatPaceSec, paceGapSec, paceVerdict, verdictMessage, zoneVerdict } from '../lib/targets';
import { nextMilestone } from '../lib/milestones';
import { useCyclingSensors } from '../hooks/useCyclingSensors';
import { armLiveShare, canShareLocation, disarmLiveShare, sendSos, setSharePaused, useLiveShare } from '../lib/liveShare';
import { CyclingSensorsCard } from './CyclingSensorsCard';
import { bestAverage, estimateFtp, powerLoad, powerZoneSeconds, summarizePower } from '../lib/cyclingSensors';
import { MAX_BPM, MIN_BPM, clampBpm, setBeatBpm, startBeat, stopBeat } from '../lib/metronome';
import { buzz, usePrefs, voiceStepKm } from '../lib/prefs';
import { keepScreenOn } from '../lib/keepAwake';
import { formatDuration } from '../lib/workoutStats';
import { downsampleHr } from '../lib/workoutStats';
import { PlansPanel } from './PlansPanel';

interface ExerciseScreenProps {
  workouts: WorkoutSession[];
  onAddWorkout: (workout: WorkoutSession) => void;
  onDeleteWorkout: (id: string) => void;
  onUpdateWorkout: (workout: WorkoutSession) => void;
  runOptions: RunOptions;
  /** A widget or watch tile asked to start a workout; 
once changes for every request. */
  launchRequest: { type: WorkoutType; nonce: number } | null;
  liveBpm: number;
  hrFromSensor: boolean;
  /** Calories the watch measured for its current exercise, if a watch is linked. */
  watchKcal: CalorieSample | null;
  theme: ColorPalette;
  profile: UserProfile;
  activePlan: ActivePlan | null;
  routines: Routine[];
  onActivatePlan: (planId: string | null, plan?: WorkoutPlan, opts?: { keepStart?: boolean }) => void;
  onSaveRoutine: (name: string, exerciseIds: string[]) => void;
  onDeleteRoutine: (id: string) => void;
  /** Adds steps to today's total (used by the walking micro-workouts). */
  onAddSteps?: (n: number) => void;
  shoes: Shoe[];
  onShoesChange: (shoes: Shoe[]) => void;
  weather?: WeatherState;
  /** Asks for one of the Run sections to be shown (from the map). A new object each time, so asking twice for the same one still works. */
  openRunView?: { view: RunView; nonce: number } | null;
  /** Routes saved on this phone (from a GPX file or a past run) that a workout can follow. */
  savedRoutes: SavedRoute[];
  onSaveRoute: (route: SavedRoute) => void;
  onDeleteRoute: (id: string) => void;
}

type RunView = RunSection;


export const FitnessScreen: React.FC<ExerciseScreenProps> = ({
  workouts,
  onAddWorkout,
  onDeleteWorkout,
  onUpdateWorkout,
  runOptions,
  launchRequest,
  liveBpm,
  hrFromSensor,
  watchKcal,
  theme,
  profile,
  activePlan,
  routines,
  onActivatePlan,
  onSaveRoutine,
  onDeleteRoutine,
  onAddSteps,
  shoes,
  onShoesChange,
  weather,
  savedRoutes,
  openRunView,
  onSaveRoute,
  onDeleteRoute,
}) => {
  const units = profile.units;
  const imperial = units === 'imperial';
  const { prefs } = usePrefs();
  const maxHr = getMaxHr(profile);

  // Which part of the Run tab is showing
  const [runView, setRunView] = useState<RunView>('start');
  useEffect(() => {
    if (openRunView) setRunView(openRunView.view);
  }, [openRunView]);

  // A saved route to follow on the next GPS workout, and the live guidance while it runs
  const [followId, setFollowId] = useState<string | null>(null);
  const followRoute = savedRoutes.find((r) => r.id === followId) ?? null;
  const reference = useMemo(() => followRoute?.points, [followRoute]);
  const follower = useMemo(() => (followRoute ? new RouteFollower(followRoute.points) : null), [followRoute]);
  const [follow, setFollow] = useState<FollowState | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [homeMode, setHomeMode] = useState(false);

  // Goal chosen before the run (distance in the display unit), and the goal the live run was started with
  const [goalType, setGoalType] = useState<GoalType>('open');
  const [goalValue, setGoalValue] = useState<number>(5);
  const [activeGoal, setActiveGoal] = useState<ActiveGoal | null>(null);
  const goalHit = useRef(false);
  // Spoken milestones already said this run (halfway, last kilometre ...).
  const milestonesSaid = useRef<Set<string>>(new Set());
  const [goalToast, setGoalToast] = useState(false);

  // Activities: calendar + day filter, and the micro-workout confirmation
  const [justCompletedTitle, setJustCompletedTitle] = useState<string | null>(null);
  // A run that was cut short (crash, killed app, dead battery) and can be picked up again
  const [recoverable, setRecoverable] = useState<LiveRun | null>(() => readLiveRun());
  // Gear: which pair of shoes this run is logged in
  const readSaved = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const [savedGear, setSavedGear] = useState<Record<GearKind, string | null>>(() => ({ shoe: readSaved('kyfit_shoe_selected'), bike: readSaved('kyfit_bike_selected') }));
  const [gearKind, setGearKind] = useState<GearKind>('shoe');
  const [gearName, setGearName] = useState('');
  const [gearStart, setGearStart] = useState('0');
  const [gearRetire, setGearRetire] = useState(imperial ? '500' : '800');
  const [bikeService, setBikeService] = useState(imperial ? '1000' : '1500');
  const addShoe = () => {
    const name = gearName.trim();
    if (!name) return;
    const toKm = (v: string) => (imperial ? Number(v) * KM_PER_MI : Number(v)) || 0;
    const limit = gearKind === 'bike' ? toKm(bikeService) || 1500 : toKm(gearRetire) || 800;
    onShoesChange([
      ...shoes,
      { id: `${gearKind}-${Date.now()}`, name, kind: gearKind, startKm: toKm(gearStart), retireKm: Math.max(50, limit), retired: false, addedAt: Date.now() },
    ]);
    setGearName('');
    setGearStart('0');
  };

  // Structured intervals and pace / heart-rate targets
  const [ivChoice, setIvChoice] = useState<string>(() => readSetup().ivChoice ?? '5x3');
  const [custom, setCustom] = useState<CustomIntervalInput>(() => readSetup().custom ?? DEFAULT_CUSTOM);
  const [paceTargetOn, setPaceTargetOn] = useState<boolean>(() => readSetup().paceOn ?? false);
  const [paceTarget, setPaceTarget] = useState<number>(() => readSetup().pace ?? 330);
  const [zoneTarget, setZoneTarget] = useState<number>(() => readSetup().zone ?? 0);
  // Cadence beat for pacing your steps
  const [beatOn, setBeatOn] = useState<boolean>(() => readSetup().beatOn ?? false);
  const [beatBpm, setBeatBpm_] = useState<number>(() => clampBpm(readSetup().bpm ?? 170));
  const [beatAlt, setBeatAlt] = useState<boolean>(() => readSetup().alternate ?? false);
  const [beatMuted, setBeatMuted] = useState(false);
  const [beatPreview, setBeatPreview] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify({ ...readSetup(), beatOn, bpm: beatBpm, alternate: beatAlt } satisfies RunSetup));
    } catch {
      // storage unavailable
    }
  }, [beatOn, beatBpm, beatAlt]);
  const [activeSteps, setActiveSteps] = useState<IntervalStep[] | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const stepStart = useRef({ sec: 0, km: 0 });
  const [intervalsDone, setIntervalsDone] = useState(false);
  const [activeTargets, setActiveTargets] = useState<{ pace?: number; zone?: number } | null>(null);
  const offCount = useRef(0);
  const lastAlertAt = useRef(0);
  const [alertText, setAlertText] = useState('');
  // Battery optimisation can stop a long GPS run; offer the one-tap exemption
  const [batteryOk, setBatteryOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isAndroidApp()) return;
    const check = () => {
      Launch.isIgnoringBatteryOptimizations()
        .then((r) => setBatteryOk(r.ignoring))
        .catch(() => setBatteryOk(null));
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);

  // Live workout recording state (timestamp based so background tabs don't drift)
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [selectedSport, setSelectedSport] = useState<WorkoutType>(() => {
    if (prefs.defaultSport !== 'last') return prefs.defaultSport;
    try {
      return (localStorage.getItem('kyfit_last_sport') as WorkoutType | null) || 'Running';
    } catch {
      return 'Running';
    }
  });
  // The gear for the sport picked on the Start screen: shoes for running and walking, a bike for riding.
  const sportGear = gearKindFor(selectedSport);
  const selectedShoe = sportGear ? defaultShoe(gearOfKind(shoes, sportGear), savedGear[sportGear]) : null;
  const chooseShoe = (id: string) => {
    if (!sportGear) return;
    setSavedGear((g) => ({ ...g, [sportGear]: id }));
    try {
      localStorage.setItem(sportGear === 'bike' ? 'kyfit_bike_selected' : 'kyfit_shoe_selected', id);
    } catch {
      // storage unavailable
    }
  };
  // The shoes or bike picked on the watch: switch to it (whichever kind it is) before the workout starts.
  const chooseGearById = (id: string, sport?: string) => {
    const kind = id === NO_GEAR ? gearKindFor(sport ?? selectedSport) : (() => { const g = shoes.find((s) => s.id === id); return g ? kindOf(g) : null; })();
    if (!kind) return;
    setSavedGear((g) => ({ ...g, [kind]: id }));
    try {
      localStorage.setItem(kind === 'bike' ? 'kyfit_bike_selected' : 'kyfit_shoe_selected', id);
    } catch {
      // storage unavailable
    }
  };
  const [sessionStart, setSessionStart] = useState(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [pausedTotal, setPausedTotal] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const hrSamples = useRef<number[]>([]);
  // Timestamped heart-rate readings, used when the phone's native recorder has none (e.g. in a browser).
  const hrTimeline = useRef<[number, number][]>([]);
  // Full breakdown screen (opens automatically when a workout finishes, or from the history).
  const [detail, setDetail] = useState<{ workout: WorkoutSession; justFinished: boolean } | null>(null);
  const bpmRef = useRef(liveBpm);
  bpmRef.current = liveBpm;
  const geo = useGeoTracker();
  const usesGps = GPS_TYPES.includes(selectedSport);

  // Strength logger
  const [strength, setStrength] = useState<{ open: boolean; ids: string[]; title?: string }>({
    open: false,
    ids: [],
  });

  // Filter chips + history

  // Safety live share: texts a map link to your chosen contacts while a GPS workout runs (Settings > Live share).
  const [liveShare] = useLiveShare();
  const [shareThisRun, setShareThisRun] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [liveNote, setLiveNote] = useState('');
  const [confirmSos, setConfirmSos] = useState(false);

  // Manual Workout Logger Modal state
  const [showManualModal, setShowManualModal] = useState(false);
  // The activity the Log workout dialog starts on (a planned day that cannot be recorded with GPS opens it on that activity).
  const [manualType, setManualType] = useState<WorkoutType>('Strength');

  const elapsedSeconds = isSessionActive
    ? Math.max(0, Math.floor(((pausedAt ?? nowMs) - sessionStart - pausedTotal) / 1000))
    : 0;
  const isPaused = pausedAt !== null;
  // Bluetooth power meter, cadence and wheel-speed sensors (Android app); one sample a second while a ride runs.
  const cycling = useCyclingSensors(prefs.wheelMm, isSessionActive && !pausedAt);
  // The watch's own calorie count for this session (ignore readings left over from an earlier one).
  const measuredKcal =
    isSessionActive && watchKcal && watchKcal.ts >= sessionStart && watchKcal.kcal > 0
      ? Math.round(watchKcal.kcal)
      : null;
  const startedFromWatch = useRef(0);
  /** True while the phone's native recorder is capturing heart rate for a session without GPS. */
  const timedNative = useRef(false);

  // Laps (lap button) and auto-pause bookkeeping
  const [laps, setLaps] = useState<Lap[]>([]);
  const lastLapElapsed = useRef(0);
  const [autoPaused, setAutoPaused] = useState(false);
  const autoPausedRef = useRef(false);
  const slowSeconds = useRef(0);
  const fastSeconds = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  pausedAtRef.current = pausedAt;

  useEffect(() => {
    if (!isSessionActive) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
      if (hrFromSensor && bpmRef.current > 0) {
        hrSamples.current.push(bpmRef.current);
        hrTimeline.current.push([Date.now(), bpmRef.current]);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isSessionActive, hrFromSensor]);

  // Save the run in progress every few seconds (and whenever the app is hidden) so a crash cannot lose it.
  const liveRef = useRef<() => LiveRun>(() => null as unknown as LiveRun);
  liveRef.current = () => ({
    v: 1,
    sport: selectedSport,
    sessionStart,
    pausedTotal,
    pausedAt,
    laps,
    goal: activeGoal,
    goalHit: goalHit.current,
    hr: hrTimeline.current.slice(-4000),
    geo: geo.getState(),
    iv: activeSteps ? { steps: activeSteps, idx: stepIdx, sec: stepStart.current.sec, km: stepStart.current.km, done: intervalsDone } : null,
    targets: activeTargets,
    savedAt: Date.now(),
  });
  useEffect(() => {
    if (!isSessionActive) return;
    const save = () => writeLiveRun(liveRef.current());
    save();
    const id = setInterval(save, 8000);
    const onHide = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [isSessionActive]);

  /** Picks a cut-short run back up, paused, so the time lost while the app was down is not counted. */
  const resumeRecovered = (r: LiveRun) => {
    setRecoverable(null);
    setSelectedSport(r.sport);
    setSessionStart(r.sessionStart);
    setNowMs(Date.now());
    setPausedAt(r.pausedAt ?? r.savedAt);
    setPausedTotal(r.pausedTotal);
    setLaps(r.laps);
    lastLapElapsed.current = r.laps.reduce((s, l) => s + l.splitSec, 0);
    hrTimeline.current = r.hr.slice();
    hrSamples.current = r.hr.map((p) => p[1]);
    setActiveGoal(r.goal);
    goalHit.current = r.goalHit;
    setActiveSteps(r.iv?.steps ?? null);
    setStepIdx(r.iv?.idx ?? 0);
    stepStart.current = { sec: r.iv?.sec ?? 0, km: r.iv?.km ?? 0 };
    setIntervalsDone(r.iv?.done ?? false);
    setActiveTargets(r.targets ?? null);
    autoPausedRef.current = false;
    setAutoPaused(false);
    timedNative.current = false;
    setIsSessionActive(true);
    if (GPS_TYPES.includes(r.sport)) {
      void geo
        .start(coachOptions(), r.geo)
        .then(() => geo.setPaused(true));
    } else if (hasNativeTracker()) {
      timedNative.current = true;
      startNativeSession(false).catch(() => {
        timedNative.current = false;
      });
    }
  };

  const discardRecovered = () => {
    clearLiveRun();
    setRecoverable(null);
  };

  // Picking an activity brings back the goal you last used for it.
  const planGoal = useRef<{ type: GoalType; value?: number; iv?: string } | null>(null);
  useEffect(() => {
    // A plan day just picked its own goal: keep that instead of the last saved one.
    if (planGoal.current) {
      const g = planGoal.current;
      planGoal.current = null;
      setGoalType(g.type);
      if (g.value) setGoalValue(g.value);
      if (g.iv) setIvChoice(g.iv);
      return;
    }
    const saved = readSavedGoal(selectedSport);
    const type: GoalType = saved.type === 'distance' && !GPS_TYPES.includes(selectedSport) ? 'open' : saved.type;
    setGoalType(type);
    if (type === 'distance' || type === 'time' || type === 'calories') {
      const fallback = type === 'distance' ? GOAL_DEFAULTS.distance[imperial ? 'imperial' : 'metric'] : GOAL_DEFAULTS[type];
      setGoalValue(saved.value && saved.value > 0 ? saved.value : fallback);
    }
  }, [selectedSport, imperial]);

  const chooseGoalType = (t: GoalType) => {
    setGoalType(t);
    if (t === 'distance' || t === 'time' || t === 'calories') {
      const saved = readSavedGoal(selectedSport);
      const fallback = t === 'distance' ? GOAL_DEFAULTS.distance[imperial ? 'imperial' : 'metric'] : GOAL_DEFAULTS[t];
      setGoalValue(saved.type === t && saved.value && saved.value > 0 ? saved.value : fallback);
    }
  };

  const nudgeGoal = (dir: 1 | -1) => {
    const step = goalType === 'distance' ? 0.5 : goalType === 'time' ? 5 : 50;
    const max = goalType === 'distance' ? 100 : goalType === 'time' ? 300 : 3000;
    setGoalValue((v) => Math.max(step, Math.min(max, Math.round((v + dir * step) * 10) / 10)));
  };

  /** The goal chosen on the setup card, converted to metric. */
  const setupGoal = (): ActiveGoal | null => {
    if (goalType === 'open' || goalType === 'intervals' || !(goalValue > 0)) return null;
    return { type: goalType, value: goalType === 'distance' && imperial ? goalValue * KM_PER_MI : goalValue };
  };

  const setupSteps = (): IntervalStep[] | null =>
    goalType !== 'intervals'
      ? null
      : ivChoice === 'custom'
        ? buildCustomIntervals(custom)
        : (INTERVAL_WORKOUTS.find((w) => w.id === ivChoice)?.steps ?? null);

  /** Speaks (when spoken updates are on) and buzzes: used for interval steps and target alerts. */
  const announce = (text: string, pattern: number[] = [200, 100, 200], kind: 'steps' | 'alerts' = 'steps') => {
    buzz(kind === 'steps' ? prefs.hapticsSteps : prefs.hapticsAlerts, pattern);
    if (text) void speakNative(text);
  };

  /** What the native recorder needs: spoken update spacing and contents, and the GPS battery mode. */
  const coachOptions = () => ({
    cues: runOptions.voiceCues,
    unit: (imperial ? 'mi' : 'km') as 'mi' | 'km',
    cueHr: runOptions.voiceHeartRate,
    ...(prefs.voiceMode === 'time' ? { everyMin: prefs.voiceMinutes } : { everyKm: voiceStepKm(prefs, imperial) }),
    sayDistance: prefs.voiceSayDistance,
    sayTime: prefs.voiceSayTime,
    sayPace: prefs.voiceSayPace,
    saver: prefs.gpsSaver,
  });

  // Keep the screen on while a workout runs, when that is switched on.
  useEffect(() => {
    if (!isSessionActive || !prefs.keepScreenOn) return;
    void keepScreenOn(true);
    return () => {
      void keepScreenOn(false);
    };
  }, [isSessionActive, prefs.keepScreenOn]);

  // Optional 3, 2, 1 before a workout starts. Starts that come from the watch skip it.
  const [countdown, setCountdown] = useState<{ left: number; type: WorkoutType } | null>(null);
  const requestStart = (type: WorkoutType) => {
    if (!prefs.startCountdown || type === 'Strength') {
      handleStartWorkout(type);
      return;
    }
    buzz(prefs.hapticsSteps, 60);
    setCountdown({ left: 3, type });
  };
  const cancelCountdown = () => setCountdown(null);

  // Pace is stored in seconds per km; the stepper works in the unit you use.
  const paceShown = imperial ? paceTarget * KM_PER_MI : paceTarget;
  const nudgePace = (dir: 1 | -1) => {
    const shown = Math.max(150, Math.min(900, Math.round(paceShown / 5) * 5 + dir * 5));
    setPaceTarget(imperial ? shown / KM_PER_MI : shown);
  };

  const handleStartWorkout = (type: WorkoutType, goal?: ActiveGoal | null) => {
    if (type === 'Strength') {
      setStrength({ open: true, ids: [] });
      return;
    }
    const chosen = goal === undefined ? setupGoal() : goal;
    if (goal === undefined) {
      try {
        localStorage.setItem(goalKey(type), JSON.stringify({ type: goalType, value: goalValue }));
      } catch {
        // storage unavailable
      }
    }
    try {
      localStorage.setItem('kyfit_last_sport', type);
    } catch {
      // storage unavailable
    }
    setActiveGoal(chosen);
    goalHit.current = false;
    milestonesSaid.current = new Set();
    setGoalToast(false);
    // Intervals and targets only come from the setup card (a goal sent by the watch carries neither).
    const fromSetup = goal === undefined;
    const steps = fromSetup ? setupSteps() : null;
    setActiveSteps(steps);
    setStepIdx(0);
    stepStart.current = { sec: 0, km: 0 };
    setIntervalsDone(false);
    const targets = fromSetup
      ? {
          pace: paceTargetOn && GPS_TYPES.includes(type) ? paceTarget : undefined,
          zone: zoneTarget > 0 ? zoneTarget : undefined,
        }
      : null;
    setActiveTargets(targets && (targets.pace || targets.zone) ? targets : null);
    setBeatMuted(false);
    setBeatPreview(false);
    cadenceReadings.current = [];
    offCount.current = 0;
    lastAlertAt.current = 0;
    setAlertText('');
    if (fromSetup) {
      try {
        localStorage.setItem(
          SETUP_KEY,
          JSON.stringify({ ...readSetup(), ivChoice, custom, paceOn: paceTargetOn, pace: paceTarget, zone: zoneTarget } satisfies RunSetup)
        );
      } catch {
        // storage unavailable
      }
    }
    if (steps && steps.length > 0) window.setTimeout(() => announce(describeStep(steps[0], imperial)), 1800);
    setSelectedSport(type);
    const t = Date.now();
    setSessionStart(t);
    setNowMs(t);
    setPausedAt(null);
    setPausedTotal(0);
    hrSamples.current = [];
    hrTimeline.current = [];
    setLaps([]);
    lastLapElapsed.current = 0;
    autoPausedRef.current = false;
    setAutoPaused(false);
    slowSeconds.current = 0;
    fastSeconds.current = 0;
    setIsSessionActive(true);
    timedNative.current = false;
    if (!GPS_TYPES.includes(type) && hasNativeTracker()) {
      // No GPS for this sport, but keep recording heart rate natively so nothing is lost with the screen off.
      timedNative.current = true;
      startNativeSession(false).catch(() => {
        timedNative.current = false;
      });
    }
    if (GPS_TYPES.includes(type)) {
      void geo.start(coachOptions());
      // Safety live share: text a map link to the contacts you chose (only if you switched it on, and not for this run if you turned it off here).
      setLiveNote('');
      setConfirmSos(false);
      if (shareThisRun && liveShare.enabled) {
        void armLiveShare(liveShare, type, imperial).then((err) => {
          setSharing(err === null);
          if (err) setLiveNote(err);
        });
      }
    }
  };

  // Plan days: GPS-trackable sports start a live session; mobility/HIIT are logged after the fact.
  const handleStartCardio = (type: WorkoutType, day?: PlanDay) => {
    if (GPS_TYPES.includes(type)) {
      // Let the runner set a goal first instead of launching straight into a session.
      // The plan day's target (intervals, distance or time) is preselected on the Start screen.
      if (day?.intervalId) {
        planGoal.current = { type: 'intervals', iv: day.intervalId };
        setGoalType('intervals');
        setIvChoice(day.intervalId);
      } else if (day?.targetKm && type !== 'Walking') {
        const shown = imperial ? Math.round((day.targetKm / KM_PER_MI) * 10) / 10 : day.targetKm;
        planGoal.current = { type: 'distance', value: shown };
        setGoalType('distance');
        setGoalValue(shown);
      } else if (day?.targetMinutes) {
        planGoal.current = { type: 'time', value: day.targetMinutes };
        setGoalType('time');
        setGoalValue(day.targetMinutes);
      }
      setSelectedSport(type);
      setRunView('start');
    } else {
      setManualType(type);
      setShowManualModal(true);
    }
  };

  const pauseWorkout = () => {
    if (pausedAtRef.current !== null) return;
    setPausedAt(Date.now());
    geo.setPaused(true);
    setSharePaused(true);
  };

  const resumeWorkout = () => {
    const at = pausedAtRef.current;
    if (at === null) return;
    setPausedTotal((p) => p + (Date.now() - at));
    setPausedAt(null);
    geo.setPaused(false);
    setSharePaused(false);
  };

  /** Pause / Resume button (and the watch's buttons). A manual choice always overrides auto-pause. */
  const handleTogglePause = () => {
    autoPausedRef.current = false;
    setAutoPaused(false);
    if (pausedAtRef.current === null) pauseWorkout();
    else resumeWorkout();
  };

  const handleLap = () => {
    const splitSec = Math.max(1, elapsedSeconds - lastLapElapsed.current);
    lastLapElapsed.current = elapsedSeconds;
    const lap: Lap = { n: laps.length + 1, t: Date.now(), distanceKm: Number(geo.distanceKm.toFixed(3)), splitSec };
    setLaps((prev) => [...prev, lap]);
    if (runOptions.voiceCues) void speakNative(`Lap ${lap.n}. ${formatDuration(splitSec)}.`);
  };

  // Auto-pause: stop the clock after ~6 s of standing still, resume after ~2 s of real movement.
  const speedRef = useRef<number | null>(null);
  speedRef.current = geo.speedMs;
  useEffect(() => {
    if (!runOptions.autoPause || !isSessionActive || !usesGps) return;
    const id = setInterval(() => {
      const v = speedRef.current;
      if (v === null) return;
      if (pausedAtRef.current === null) {
        slowSeconds.current = v < 0.7 ? slowSeconds.current + 1 : 0;
        if (slowSeconds.current >= 6) {
          slowSeconds.current = 0;
          autoPausedRef.current = true;
          setAutoPaused(true);
          pauseWorkout();
        }
      } else if (autoPausedRef.current) {
        fastSeconds.current = v > 1.4 ? fastSeconds.current + 1 : 0;
        if (fastSeconds.current >= 2) {
          fastSeconds.current = 0;
          autoPausedRef.current = false;
          setAutoPaused(false);
          resumeWorkout();
        }
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runOptions.autoPause, isSessionActive, usesGps]);

  // A widget tap can start a workout from outside the app.
  const lastLaunch = useRef(0);
  useEffect(() => {
    if (!launchRequest || launchRequest.nonce === lastLaunch.current) return;
    lastLaunch.current = launchRequest.nonce;
    // Widgets and tiles open the setup card for that workout; the goal is chosen before it starts.
    if (!isSessionActive && !strength.open) {
      setSelectedSport(launchRequest.type);
      setRunView('start');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchRequest?.nonce]);
  const handleFinishWorkout = async () => {
    const minutes = Math.max(1, Math.round(elapsedSeconds / 60));
    const durationSec = elapsedSeconds;
    let result: Awaited<ReturnType<typeof geo.stop>> | null = null;
    try {
      result = usesGps ? await geo.stop() : null;
    } catch {
      // the workout is still saved, just without the GPS track
    }
    // Whatever goes wrong while working out the details, the workout itself is always saved.
    const buildSession = async (): Promise<WorkoutSession> => {
      const hasGps = !!result && result.distanceKm >= 0.02 && result.track.length >= 2;
      const rpe = 6;
      const rowing = selectedSport === 'Rowing';
      const ride = cycling.takeSamples();
      const powerStats = ride.power.length >= 30 ? summarizePower(ride.power) : null;
      const pedalRpm = ride.cadence.filter((v) => v > 0);
      const ftp = prefs.ftpW > 0 ? prefs.ftpW : estimateFtp(workouts) ?? 0;
      const cadenceSummary = rowing ? summarizeStrokes(cadenceReadings.current) : summarizeCadence(cadenceReadings.current);
      // Time spent paused: the whole span from start to finish minus the time the workout actually ran.
      const pausedSec = Math.max(0, Math.round((Date.now() - sessionStart) / 1000 - durationSec));

      // Prefer the phone's native heart-rate record (complete even with the screen off).
      let timedHr: [number, number][] = [];
      if (!usesGps && timedNative.current) {
        timedNative.current = false;
        try {
          timedHr = (await readNativeSamples({ fix: 0, hr: 0 })).hr;
        } catch {
          // fall back to what the page saw
        }
        await stopNativeSession();
      }
      const rawHr = result && result.hr.length > 5 ? result.hr : timedHr.length > 5 ? timedHr : hrTimeline.current;
      const hrSeries = downsampleHr(rawHr.filter(([, b]) => b > 30 && b < 230));
      const measured = hrSeries.length > 5;
      const avgHr = measured
        ? Math.round(hrSeries.reduce((s, [, b]) => s + b, 0) / hrSeries.length)
        : Math.round(profile.restingHr + (maxHr - profile.restingHr) * (0.3 + rpe * 0.05));

      return {
        id: `w-${Date.now()}`,
        type: selectedSport,
        timestamp: '',
        startedAt: sessionStart,
        durationMinutes: minutes,
        durationSec,
        distanceKm: hasGps ? result!.distanceKm : undefined,
        gpsTracked: hasGps,
        route: hasGps ? result!.route : undefined,
        track: hasGps ? result!.track : undefined,
        elevationGainM: hasGps && result!.elevationGainM > 0 ? result!.elevationGainM : undefined,
        elevationLossM: hasGps && result!.elevationLossM > 0 ? result!.elevationLossM : undefined,
        avgHeartRate: avgHr,
        maxHeartRate: measured ? Math.max(...hrSeries.map(([, b]) => b)) : undefined,
        hrSeries: measured ? hrSeries : undefined,
        hrFromSensor: measured,
        caloriesBurned: measuredKcal ?? estimateWorkoutCalories(selectedSport, minutes, profile, avgHr, measured),
        isManualEntry: false,
        perceivedExertion: rpe,
        // With a power meter the load comes from power (an hour at threshold scores 100); otherwise from heart rate.
        cardioLoadPoints: (powerStats && ftp > 0 ? powerLoad(powerStats.npW, powerStats.seconds, ftp) : 0) || trimp(minutes, avgHr, maxHr, currentRestingHr()),
        avgPowerW: powerStats?.avgW,
        maxPowerW: powerStats?.maxW,
        normPowerW: powerStats?.npW,
        bestPower20W: powerStats ? bestAverage(ride.power, 1200) ?? undefined : undefined,
        powerZoneSec: powerStats && ftp > 0 ? powerZoneSeconds(ride.power, ftp) : undefined,
        ftpW: powerStats && ftp > 0 ? ftp : undefined,
        laps: laps.length > 0 ? laps : undefined,
        shoeId: selectedShoe ? selectedShoe.id : undefined,
        cadenceAvg: pedalRpm.length >= 30 ? Math.round(pedalRpm.reduce((a, b) => a + b, 0) / pedalRpm.length) : cadenceSummary?.avg,
        cadenceMax: pedalRpm.length >= 30 ? Math.max(...pedalRpm) : cadenceSummary?.max,
        cadenceKind: pedalRpm.length >= 30 ? 'rpm' : cadenceSummary ? (rowing ? 'strokes' : 'steps') : undefined,
        pausedSec: pausedSec >= 2 ? pausedSec : undefined,
        elevationFrom: hasGps && ((result!.elevationGainM ?? 0) > 0 || (result!.elevationLossM ?? 0) > 0) ? (result!.barometer ? 'barometer' : 'gps') : undefined,
      };
    };
    let newSession: WorkoutSession;
    try {
      newSession = await buildSession();
    } catch (err) {
      console.error('Could not build the full workout summary', err);
      const gps = !!result && result.distanceKm >= 0.02 && result.track.length >= 2;
      newSession = {
        id: `w-${Date.now()}`,
        type: selectedSport,
        timestamp: '',
        startedAt: sessionStart,
        durationMinutes: minutes,
        durationSec,
        distanceKm: gps ? result!.distanceKm : undefined,
        gpsTracked: gps,
        route: gps ? result!.route : undefined,
        track: gps ? result!.track : undefined,
        avgHeartRate: Math.round(profile.restingHr + (maxHr - profile.restingHr) * 0.6),
        caloriesBurned: measuredKcal ?? estimateCalories(selectedSport, minutes, profile.weightKg),
        isManualEntry: false,
        perceivedExertion: 6,
        cardioLoadPoints: 0,
      };
    }

    onAddWorkout(newSession);
    clearLiveRun();
    disarmLiveShare();
    setSharing(false);
    setIsSessionActive(false);
    setPausedAt(null);
    // Show the full breakdown straight away.
    setDetail({ workout: newSession, justFinished: true });
  };
  const handleDiscardWorkout = () => {
    cycling.takeSamples();
    disarmLiveShare();
    setSharing(false);
    clearLiveRun();
    markWatchWorkoutDiscarded();
    if (usesGps) void geo.stop();
    if (timedNative.current) {
      timedNative.current = false;
      void stopNativeSession();
    }
    setIsSessionActive(false);
    setPausedAt(null);
  };

  const formatTimer = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const mm = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return h > 0 ? `${h}:${mm}` : mm;
  };

  const liveZone = heartRateZone(liveBpm, maxHr);
  const liveCalories = measuredKcal ?? estimateCalories(selectedSport, elapsedSeconds / 60, profile.weightKg);

  // Cadence from the phone's step sensor (or, rowing, the stroke rate from its movement), read every few seconds during the workout.
  const [cadence, setCadence] = useState(0);
  const cadenceReadings = useRef<number[]>([]);
  useEffect(() => {
    if (!isSessionActive) return;
    let alive = true;
    const rowing = selectedSport === 'Rowing';
    void (rowing ? startStrokes() : startCadence());
    const id = setInterval(async () => {
      if (!alive || pausedAtRef.current !== null) return;
      const spm = rowing ? await readStrokeRate() : (await readCadence()).spm;
      if (!alive) return;
      setCadence(spm);
      if (spm > 0) cadenceReadings.current.push(spm);
    }, rowing ? 3000 : 2000);
    return () => {
      alive = false;
      clearInterval(id);
      void (rowing ? stopStrokes() : stopCadence());
      setCadence(0);
    };
  }, [isSessionActive]);

  // The cadence beat plays while the run is going (silent when paused or muted) and follows the BPM setting.
  const beatActive = isSessionActive && !isPaused && beatOn && !beatMuted;
  useEffect(() => {
    if (!beatActive) return;
    void startBeat(beatBpm, beatAlt, prefs.beatVolume / 100, prefs.beatSound);
    return () => {
      void stopBeat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatActive, beatAlt, prefs.beatVolume, prefs.beatSound]);
  useEffect(() => {
    if (beatActive) void setBeatBpm(beatBpm);
  }, [beatBpm, beatActive]);
  // A beat preview on the setup screen stops when you leave it or start the run.
  useEffect(() => {
    if (!beatPreview || isSessionActive) return;
    void startBeat(beatBpm, beatAlt, prefs.beatVolume / 100, prefs.beatSound);
    return () => {
      void stopBeat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatPreview, isSessionActive, beatAlt, prefs.beatVolume, prefs.beatSound]);
  useEffect(() => {
    if (beatPreview && !isSessionActive) void setBeatBpm(beatBpm);
  }, [beatBpm, beatPreview, isSessionActive]);
  useEffect(() => {
    if (runView !== 'start' || isSessionActive) setBeatPreview(false);
  }, [runView, isSessionActive]);

  // Tick the start countdown down once a second, then begin the workout.
  useEffect(() => {
    if (!countdown) return;
    const id = window.setTimeout(() => {
      if (countdown.left <= 1) {
        setCountdown(null);
        handleStartWorkout(countdown.type);
      } else {
        buzz(prefs.hapticsSteps, 60);
        setCountdown({ left: countdown.left - 1, type: countdown.type });
      }
    }, 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  // Interval workout: move to the next step when this one is done, with a spoken cue and a buzz.
  useEffect(() => {
    if (!isSessionActive || !activeSteps || intervalsDone || isPaused) return;
    const step = activeSteps[stepIdx];
    if (!step) return;
    const p = stepProgress(step, elapsedSeconds - stepStart.current.sec, geo.distanceKm - stepStart.current.km);
    if (!p.done) return;
    const next = stepIdx + 1;
    if (next >= activeSteps.length) {
      setIntervalsDone(true);
      announce('Workout complete. Nice work.', [300, 100, 300, 100, 300], 'steps');
      return;
    }
    stepStart.current = { sec: elapsedSeconds, km: geo.distanceKm };
    setStepIdx(next);
    announce(describeStep(activeSteps[next], imperial), activeSteps[next].kind === 'work' ? [400] : [150, 80, 150]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSeconds]);

  // Pace and heart-rate targets: after about 15 seconds off target, say so (at most every 45 seconds).
  useEffect(() => {
    if (!isSessionActive || !activeTargets || isPaused) return;
    const stepKind = activeSteps && !intervalsDone ? activeSteps[stepIdx]?.kind : undefined;
    // Pace only matters on effort steps when running intervals; heart rate always counts.
    const paceChecked = activeTargets.pace && (!stepKind || stepKind === 'work') ? activeTargets.pace : undefined;
    const v =
      (paceChecked ? paceVerdict(geo.speedMs, paceChecked) : null) ??
      (activeTargets.zone && hrFromSensor ? zoneVerdict(liveBpm, maxHr, activeTargets.zone) : null);
    const off = v !== null && v !== 'ok';
    // For a pace target, say how far off you are ("Speed up, you are 15 seconds per kilometre behind").
    const gap = paceChecked && (v === 'slow' || v === 'fast') ? paceGapSec(geo.speedMs, paceChecked) : null;
    const msg = verdictMessage(v, gap === null ? undefined : Math.abs(gap), imperial);
    setAlertText(off ? msg : '');
    offCount.current = off ? offCount.current + 1 : 0;
    if (off && offCount.current >= 15 && Date.now() - lastAlertAt.current > 45_000) {
      lastAlertAt.current = Date.now();
      offCount.current = 0;
      announce(msg, v === 'slow' || v === 'low' ? [120, 80, 120] : [400], 'alerts');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSeconds]);

  // Halfway, a quarter to go, the last kilometre: said once each, for distance and time goals (see lib/milestones).
  useEffect(() => {
    if (!isSessionActive || isPaused || !activeGoal || activeGoal.type === 'calories' || goalHit.current) return;
    const m = nextMilestone({
      type: activeGoal.type,
      goal: activeGoal.value,
      done: activeGoal.type === 'distance' ? geo.distanceKm : elapsedSeconds / 60,
      said: milestonesSaid.current,
      miles: imperial,
    });
    if (!m) return;
    // nextMilestone only ever returns the latest cue reached, so earlier ones are never replayed.
    milestonesSaid.current.add(m.id);
    announce(m.text, [160], 'alerts');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSeconds]);

  // Progress toward the goal this run started with (null for an open run)
  const goalProgress =
    isSessionActive && activeGoal
      ? activeGoal.type === 'distance'
        ? geo.distanceKm / activeGoal.value
        : activeGoal.type === 'time'
          ? elapsedSeconds / (activeGoal.value * 60)
          : liveCalories / activeGoal.value
      : null;
  const goalReached = goalProgress !== null && goalProgress >= 1;
  useEffect(() => {
    if (!goalReached || goalHit.current || !activeGoal) return;
    goalHit.current = true;
    setGoalToast(true);
    const t = window.setTimeout(() => setGoalToast(false), 8000);
    buzz(prefs.hapticsGoals, [220, 100, 220]);
    if (runOptions.voiceCues) void speakNative(`Goal reached. ${goalSummary(activeGoal, imperial)}.`);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalReached]);

  // Following a saved route: where you are against the line, an alert when you drift off it, and the way back to the start.
  const startPoint = useRef<LatLng | null>(null);
  const wasOff = useRef(false);
  const reachedEnd = useRef(false);
  useEffect(() => {
    if (!isSessionActive || !usesGps || geo.pointCount < 1) {
      if (!isSessionActive) {
        startPoint.current = null;
        wasOff.current = false;
        reachedEnd.current = false;
        follower?.reset();
        setFollow(null);
        setHomeMode(false);
      }
      return;
    }
    const recent = geo.getRecent(12);
    const last = recent[recent.length - 1];
    if (!last) return;
    const pos: LatLng = [last.lat, last.lng];
    if (!startPoint.current) startPoint.current = pos;
    setHeading(headingFrom(recent.map((p): LatLng => [p.lat, p.lng])));
    const base: FollowState = follower
      ? follower.update(pos)
      : { offRouteM: 0, isOff: false, progressKm: 0, remainingKm: 0, totalKm: 0, bearingToRoute: 0, toStartKm: 0, bearingToStart: 0, finished: false };
    const start = startPoint.current;
    const state: FollowState = { ...base, toStartKm: haversineKm(pos, start), bearingToStart: bearingDeg(pos, start) };
    setFollow(state);
    if (!follower) return;
    if (state.isOff && !wasOff.current) {
      wasOff.current = true;
      const h = headingFrom(recent.map((p): LatLng => [p.lat, p.lng]));
      const advice = h === null ? '' : `, ${turnText(turnAdvice(relativeTurn(h, state.bearingToRoute)))}`;
      buzz(prefs.hapticsAlerts, [120, 80, 120]);
      if (runOptions.voiceCues) void speakNative(`Off route${advice}.`);
    } else if (!state.isOff && wasOff.current) {
      wasOff.current = false;
      buzz(prefs.hapticsAlerts, [60]);
      if (runOptions.voiceCues) void speakNative('Back on route.');
    }
    if (state.finished && !reachedEnd.current && state.progressKm > 0.05) {
      reachedEnd.current = true;
      buzz(prefs.hapticsGoals, [220, 100, 220]);
      if (runOptions.voiceCues) void speakNative('You have reached the end of the route.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.pointCount, isSessionActive]);

  const handleCompleteQuickWorkout = (template: QuickWorkoutTemplate) => {
    setJustCompletedTitle(template.title);
    setTimeout(() => setJustCompletedTitle(null), 3000);
    if (template.category === 'Walking') onAddSteps?.(Math.round(template.durationMinutes * 100));
    const type: WorkoutType =
      template.category === 'Walking' ? 'Walking' : template.category === 'HIIT' ? 'HIIT' : template.category === 'Mobility' ? 'Mobility' : 'Calisthenics';
    const avgHr = Math.round(profile.restingHr + (maxHr - profile.restingHr) * (0.3 + template.rpe * 0.05));
    onAddWorkout({
      id: `qw-completed-${Date.now()}`,
      type,
      timestamp: '',
      startedAt: Date.now(),
      durationMinutes: template.durationMinutes,
      avgHeartRate: avgHr,
      caloriesBurned: estimateCalories(type, template.durationMinutes, profile.weightKg),
      isManualEntry: true,
      perceivedExertion: template.rpe,
      notes: `Quick workout: ${template.title}`,
      cardioLoadPoints: trimp(template.durationMinutes, avgHr, maxHr, currentRestingHr()),
    });
  };
  const todayDone = workoutsOnDay(workouts, todayKey());
  const isTemplateDone = (t: QuickWorkoutTemplate) => todayDone.some((w) => w.notes === `Quick workout: ${t.title}`);

  // The current interval step, sent to the watch so it can show it and buzz at each change.
  const watchStepInfo = (): Partial<WatchWorkoutState> => {
    if (!activeSteps || activeSteps.length === 0) return {};
    const idx = Math.min(stepIdx, activeSteps.length - 1);
    const step = activeSteps[idx];
    const prog = stepProgress(step, elapsedSeconds - stepStart.current.sec, geo.distanceKm - stepStart.current.km);
    const timed = step.durationSec !== undefined;
    return {
      stepLabel: intervalsDone ? 'Workout complete' : step.label,
      stepKind: step.kind,
      stepIndex: idx,
      stepCount: activeSteps.length,
      stepDurMs: timed ? (step.durationSec as number) * 1000 : 0,
      stepEndsAt: timed && !isPaused && !intervalsDone ? Date.now() + (prog.remainingSec ?? 0) * 1000 : 0,
      stepFraction: prog.fraction,
      stepLeft: timed ? formatTimer(Math.ceil(prog.remainingSec ?? 0)) : kmToDisplay(prog.remainingKm ?? 0, units, 2) + ' ' + distanceUnit(units),
      stepsDone: intervalsDone,
    };
  };

  // ---- Watch sync: mirror this workout to the watch and obey its Pause / Stop / Start buttons ----
  const [strengthStopToken, setStrengthStopToken] = useState(0);
  const watchState: WatchWorkoutState | null = isSessionActive
    ? {
        active: true,
        type: selectedSport,
        startedAt: sessionStart,
        paused: isPaused,
        pausedAt: pausedAt ?? 0,
        pausedTotalMs: pausedTotal,
        distanceText: usesGps ? formatDistance(geo.distanceKm, units) : '',
        distanceKm: usesGps ? geo.distanceKm : 0,
        paceText:
          usesGps && geo.distanceKm > 0.05
            ? ` /`
            : '',
        kcal: liveCalories,
        maxHr,
        canPause: true,
        miles: units === 'imperial',
        goalType: activeGoal?.type ?? 'open',
        goalValue: activeGoal?.value ?? 0,
        ...watchStepInfo(),
        alertText,
      }
    : null;
  const watchStartedHere = Date.now() - startedFromWatch.current > 10_000;
  useWatchWorkoutSync(watchState, watchStartedHere);

  // The strength sessions the watch offers (today's plan day, your routines, starter templates), kept up to date on the watch.
  const watchRoutines = useMemo(() => buildWatchRoutines({ routines, activePlan }), [routines, activePlan]);
  const watchRoutinesText = useMemo(() => watchRoutinesJson(watchRoutines), [watchRoutines]);
  useEffect(() => {
    if (!isAndroidApp()) return;
    Glance.sendRoutines({ json: watchRoutinesText }).catch(() => undefined);
  }, [watchRoutinesText]);

  // The shoes and bikes the watch offers when you start a run or a ride there, with their mileage and the current choice.
  const watchGearText = useMemo(() => JSON.stringify(buildWatchGear(shoes, workouts, savedGear, units)), [shoes, workouts, savedGear, units]);
  useEffect(() => {
    if (!isAndroidApp()) return;
    Glance.sendGear({ json: watchGearText }).catch(() => undefined);
  }, [watchGearText]);

  const WATCH_SPORTS: WorkoutType[] = ['Running', 'Walking', 'Cycling', 'Hiking', 'Strength', 'Treadmill', 'IndoorCycling', 'Rowing', 'HIIT', 'Yoga', 'Elliptical', 'Calisthenics'];
  useWatchCommands((c: WatchCommand) => {
    if (c.cmd === 'start') {
      const type = WATCH_SPORTS.find((s) => s === c.type);
      if (!type || isSessionActive || strength.open) return;
      startedFromWatch.current = Date.now();
      // The shoes or bike picked on the watch count this workout's mileage.
      if (c.gear) chooseGearById(c.gear, type);
      // A strength session started from a routine picked on the watch opens with those exercises already in it.
      if (type === 'Strength' && c.routine) {
        const picked = resolveWatchRoutine(c.routine, watchRoutines);
        if (picked) {
          setStrength({ open: true, ids: picked.ids, title: picked.name.replace(/^Today: /, '') });
          return;
        }
      }
      // The goal picked on the watch comes along with the start command.
      const gt = c.goalType;
      const goal: ActiveGoal | null =
        (gt === 'distance' || gt === 'time' || gt === 'calories') && (c.goalValue ?? 0) > 0
          ? { type: gt, value: c.goalValue as number }
          : null;
      handleStartWorkout(type, goal);
    } else if (c.cmd === 'pause') {
      if (isSessionActive && !isPaused) handleTogglePause();
    } else if (c.cmd === 'resume') {
      if (isSessionActive && isPaused) handleTogglePause();
    } else if (c.cmd === 'stop') {
      if (isSessionActive) handleFinishWorkout();
      else if (strength.open) setStrengthStopToken((n) => n + 1);
    } else if (c.cmd === 'discard') {
      if (isSessionActive) handleDiscardWorkout();
      else if (strength.open) setStrength((s) => ({ ...s, open: false }));
    }
  });
  const geoMessage =
    geo.status === 'denied'
      ? 'Location permission denied — distance will not be recorded.'
      : geo.status === 'unavailable'
        ? 'GPS unavailable on this device/browser — distance will not be recorded.'
        : geo.status === 'acquiring'
          ? 'Acquiring GPS signal…'
          : '';

  return (
    <div className="space-y-4 pb-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between px-1 pt-1">
        <div>
          <p className="gh-eyebrow">Run club</p>
          <h1 className="mt-1.5">Move</h1>
        </div>
        <button
          onClick={() => setShowManualModal(true)}
          className="mt-1 px-3.5 py-2 rounded-full glass-chip text-[11px] font-extrabold uppercase tracking-wider text-white flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" style={{ color: theme.primary }} />
          <span>Log workout</span>
        </button>
      </div>

      {!isSessionActive && (
        <Segmented<RunView>
          ariaLabel="Run sections"
          theme={theme}
          value={runView}
          onChange={setRunView}
          options={[
            { id: 'start', label: 'Start' },
            { id: 'plans', label: 'Plans' },
            { id: 'activities', label: 'Activities' },
            { id: 'routes', label: 'Routes' },
            { id: 'gear', label: 'Gear' },
          ]}
        />
      )}

      {/* START COUNTDOWN */}
      {countdown && (
        <div
          role="dialog"
          aria-label="Starting"
          onClick={cancelCountdown}
          className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center"
        >
          <div className="hero-num text-[14rem]" style={{ color: theme.primary }}>
            {countdown.left}
          </div>
          <div className="stat-label mt-6">Tap anywhere to cancel</div>
        </div>
      )}

      {/* LIVE WORKOUT: takes over the whole screen while recording */}
      {isSessionActive && (
        <section
          className="fixed inset-0 z-50 bg-black flex flex-col"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          aria-label="Workout in progress"
        >
          <div className="flex items-center justify-between px-5 pt-4">
            <span className="eyebrow-accent flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${isPaused ? '' : 'animate-pulse'}`}
                style={{ backgroundColor: isPaused ? '#8a8a8a' : theme.primary }}
              />
              {isPaused ? (autoPaused ? 'Auto-paused' : 'Paused') : selectedSport}
            </span>
            <span className="stat-label">{usesGps ? (geo.status === 'tracking' ? 'GPS locked' : 'GPS…') : 'Timer only'}</span>
          </div>

          {usesGps && runOptions.liveMap && geo.pointCount >= 1 && (
            <div className="px-4 pt-3">
              <LiveMap getPoints={geo.getPoints} pointCount={geo.pointCount} color={theme.primary} height={230} reference={reference} />
            </div>
          )}

          {usesGps && geo.pointCount >= 1 && (followRoute || homeMode) && (
            <FollowBanner state={follow} heading={heading} homeMode={homeMode || !followRoute} routeName={followRoute?.name} units={units} accent={theme.primary} />
          )}
          {usesGps && geo.pointCount >= 1 && (
            <div className="px-4 pt-2 flex justify-center">
              <button type="button" onClick={() => setHomeMode((v) => !v)} aria-pressed={homeMode} className="px-3.5 py-1.5 rounded-full glass-chip text-[11px] font-semibold text-neutral-200">
                {homeMode ? (followRoute ? 'Back to the route guide' : 'Hide the way back') : 'Way back to the start'}
              </button>
            </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-5 text-center">
            {usesGps ? (
              <>
                <div className="hero-num text-[8.5rem]" aria-live="off">
                  {kmToDisplay(geo.distanceKm, units)}
                </div>
                <div className="hero-unit text-2xl mt-2">{distanceUnit(units)}</div>
              </>
            ) : (
              <>
                <div className="hero-num text-[6.5rem]" aria-live="off">
                  {formatTimer(elapsedSeconds)}
                </div>
                <div className="hero-unit text-2xl mt-2">Time</div>
              </>
            )}

            {activeSteps && activeSteps.length > 0 && (() => {
              const idx = Math.min(stepIdx, activeSteps.length - 1);
              const step = activeSteps[idx];
              const prog = stepProgress(step, elapsedSeconds - stepStart.current.sec, geo.distanceKm - stepStart.current.km);
              const color = intervalsDone ? theme.primary : step.kind === 'work' ? theme.primary : step.kind === 'recover' ? '#7dd3fc' : theme.secondary;
              const left =
                prog.remainingSec !== undefined
                  ? formatTimer(Math.ceil(prog.remainingSec))
                  : `${kmToDisplay(prog.remainingKm ?? 0, units, 2)} ${distanceUnit(units)}`;
              const next = activeSteps[idx + 1];
              return (
                <div className="w-full max-w-sm mt-5 rounded-[22px] border p-4 text-left" style={{ borderColor: color, backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  <div className="flex items-center justify-between">
                    <span className="eyebrow-accent" style={{ color }}>
                      {intervalsDone ? 'Workout complete' : step.label}
                    </span>
                    <span className="stat-label">
                      Step {idx + 1} / {activeSteps.length}
                    </span>
                  </div>
                  {!intervalsDone && (
                    <>
                      <div className="hero-num text-[3.4rem] mt-2" style={{ color }}>
                        {left}
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-2">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round(prog.fraction * 100)}%`, backgroundColor: color }} />
                      </div>
                      <div className="stat-label mt-2">{next ? `Next: ${next.label}` : 'Last step'}</div>
                    </>
                  )}
                </div>
              );
            })()}
            {alertText && (
              <div role="status" className="mt-3 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider" style={{ backgroundColor: theme.secondary, color: '#000' }}>
                {alertText}
              </div>
            )}            {activeGoal && goalProgress !== null && (
              <div className="w-full max-w-sm mt-5">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={Math.round(Math.min(1, goalProgress) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Goal progress">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.round(Math.min(1, goalProgress) * 100)}%`, backgroundColor: theme.primary }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 stat-label">
                  <span style={{ color: goalReached ? theme.primary : undefined }}>
                    {goalReached ? 'Goal reached' : `${Math.round(goalProgress * 100)}% of goal`}
                  </span>
                  <span>{goalSummary(activeGoal, imperial)}</span>
                </div>
              </div>
            )}
            {goalToast && (
              <div role="status" className="mt-3 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider animate-fadeIn" style={{ backgroundColor: theme.primary, color: '#000' }}>
                Goal reached! Keep going or finish.
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 w-full max-w-sm mt-7">
              {usesGps ? (
                <>
                  <div>
                    <div className="hero-num text-[2.4rem]">{formatPace(elapsedSeconds / 60, geo.distanceKm, units)}</div>
                    <div className="stat-label mt-1">Pace /{distanceUnit(units)}</div>
                  </div>
                  <div>
                    <div className="hero-num text-[2.4rem]">{formatTimer(elapsedSeconds)}</div>
                    <div className="stat-label mt-1">Time</div>
                  </div>
                  <div>
                    <div className="hero-num text-[2.4rem]">{hrFromSensor ? liveBpm : '--'}</div>
                    <div className="stat-label mt-1">{hrFromSensor ? `Z${liveZone} ${ZONE_NAMES[liveZone]}` : 'Heart rate'}</div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="hero-num text-[2.4rem]">{hrFromSensor ? liveBpm : '--'}</div>
                    <div className="stat-label mt-1">{hrFromSensor ? `Z${liveZone} ${ZONE_NAMES[liveZone]}` : 'Heart rate'}</div>
                  </div>
                  <div>
                    <div className="hero-num text-[2.4rem]">{liveCalories}</div>
                    <div className="stat-label mt-1">Kcal</div>
                  </div>
                  <div>
                    <div className="hero-num text-[2.4rem]">{maxHr}</div>
                    <div className="stat-label mt-1">Max HR</div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-4 mt-4 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              {usesGps && <span>{liveCalories} kcal</span>}
              {cadence > 0 && (
                <span>
                  {cadence} {selectedSport === 'Rowing' ? 'strokes/min' : 'spm'}
                  {selectedSport !== 'Rowing' && beatOn && !beatMuted ? ` · ${cadence - beatBpm >= 0 ? '+' : ''}${cadence - beatBpm} vs beat` : ''}
                </span>
              )}
              {usesGps && geo.elevationGainM > 0 && (
                <span className="flex items-center gap-1">
                  <Mountain className="w-3 h-3" /> +{geo.elevationGainM} m
                </span>
              )}
              {cycling.live.powerW !== undefined && <span>{cycling.live.powerW} W</span>}
              {cycling.live.cadenceRpm !== undefined && <span>{cycling.live.cadenceRpm} rpm</span>}
              {cycling.live.speedKmh !== undefined && <span>{units === 'imperial' ? Math.round((cycling.live.speedKmh / 1.609344) * 10) / 10 : cycling.live.speedKmh} {units === 'imperial' ? 'mph' : 'km/h'}</span>}
            </div>
            {usesGps && liveShare.enabled && (
              <div className="mt-3 w-full max-w-sm rounded-2xl glass-inset px-3 py-2 flex items-center justify-between gap-2 text-[11px] font-semibold text-neutral-300">
                <span className="flex items-center gap-1.5 min-w-0">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" style={{ color: sharing ? theme.primary : undefined }} />
                  <span className="truncate">{sharing ? `Texting ${liveShare.contacts.map((c) => c.name).join(', ')}` : 'Location not shared'}</span>
                </span>
                {confirmSos ? (
                  <span className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={async () => {
                        setConfirmSos(false);
                        const ok = await sendSos(liveShare);
                        setLiveNote(ok ? 'Emergency text sent.' : 'Could not send the emergency text.');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold"
                    >
                      Send help text
                    </button>
                    <button onClick={() => setConfirmSos(false)} className="text-neutral-400 underline">Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmSos(true)} className="px-2.5 py-1 rounded-lg border border-rose-500/60 text-rose-300 font-bold shrink-0">SOS</button>
                )}
              </div>
            )}
            {liveNote && (
              <p role="status" className="text-[11px] text-amber-300 mt-2">
                {liveNote}
              </p>
            )}
            {usesGps && geoMessage && (
              <p role="status" className="text-[11px] text-amber-300 mt-2">
                {geoMessage}
              </p>
            )}
            {laps.length > 0 && (
              <div className="mt-3 w-full max-w-sm rounded-2xl glass-inset px-3 py-2 text-[11px] font-semibold text-neutral-400 space-y-0.5">
                {laps.slice(-2).map((l) => (
                  <div key={l.n} className="flex justify-between">
                    <span>Lap {l.n}</span>
                    <span className="text-white">{formatDuration(l.splitSec)}</span>
                    <span>{formatDistance(l.distanceKm, units)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {beatOn && (
            <div className="flex items-center justify-center gap-3 pb-3">
              <button onClick={() => setBeatBpm_((b) => clampBpm(b - 2))} aria-label="Slower beat" className="w-9 h-9 rounded-full glass-chip flex items-center justify-center text-white">
                <Minus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setBeatMuted((m) => !m)}
                aria-pressed={!beatMuted}
                aria-label={beatMuted ? 'Turn the beat on' : 'Mute the beat'}
                className="px-4 py-2 rounded-full glass-chip text-xs font-extrabold uppercase tracking-wider"
                style={{ color: beatMuted ? '#8a8a8a' : theme.primary }}
              >
                {beatMuted ? 'Beat off' : `Beat ${beatBpm}`}
              </button>
              <button onClick={() => setBeatBpm_((b) => clampBpm(b + 2))} aria-label="Faster beat" className="w-9 h-9 rounded-full glass-chip flex items-center justify-center text-white">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="px-6 pb-8 pt-2" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
            <div className="flex items-end justify-center gap-6">
              {usesGps && (
                <div className="flex flex-col items-center gap-2">
                  <button onClick={handleLap} aria-label="Lap" className="round-btn">
                    <Flag className="w-6 h-6" />
                  </button>
                  <span className="stat-label">Lap</span>
                </div>
              )}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={handleTogglePause}
                  aria-label={isPaused ? 'Resume' : 'Pause'}
                  className="w-[104px] h-[104px] rounded-full flex items-center justify-center"
                  style={{ backgroundColor: theme.primary, color: '#000' }}
                >
                  {isPaused ? <Play className="w-10 h-10 fill-black" /> : <Pause className="w-10 h-10 fill-black" />}
                </button>
                <span className="stat-label">{isPaused ? 'Resume' : 'Pause'}</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={handleFinishWorkout}
                  aria-label="Finish and save"
                  className="round-btn"
                  style={{ borderColor: '#ff4d4d', color: '#ff4d4d' }}
                >
                  <Square className="w-6 h-6 fill-current" />
                </button>
                <span className="stat-label">Finish</span>
              </div>
            </div>
            <button onClick={handleDiscardWorkout} className="block mx-auto mt-5 text-[11px] font-bold uppercase tracking-wider text-neutral-600 hover:text-neutral-300">
              Discard session
            </button>
          </div>
        </section>
      )}

      {/* START: sport picker, goal setup and the big GO button */}
      {!isSessionActive && runView === 'start' && (
        <section className="pt-2 pb-2">
          {recoverable && (
            <div className="mb-4 rounded-[26px] border p-4" style={{ backgroundColor: theme.surface, borderColor: theme.primary }}>
              <div className="eyebrow-accent">Run interrupted</div>
              <p className="text-sm text-white font-semibold mt-1">
                {recoverable.sport} · {kmToDisplay(recoverable.geo.distanceKm, units)} {distanceUnit(units)} ·{' '}
                {formatDuration(Math.max(0, Math.round((recoverable.savedAt - recoverable.sessionStart - recoverable.pausedTotal) / 1000)))}
              </p>
              <p className="text-[11px] text-neutral-500 mt-1">The app closed before you finished. Pick it up where it left off, then finish and save it.</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => resumeRecovered(recoverable)} className="flex-1 py-2.5 rounded-full text-xs font-extrabold" style={{ backgroundColor: theme.primary, color: '#000' }}>
                  Resume run
                </button>
                <button onClick={discardRecovered} className="px-4 py-2.5 rounded-full glass-chip text-xs font-bold text-neutral-300">
                  Discard
                </button>
              </div>
            </div>
          )}
          {batteryOk === false && (
            <div className="mb-4 rounded-[26px] border p-4 flex items-center justify-between gap-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white">Keep GPS alive on long runs</div>
                <p className="text-[11px] text-neutral-500 mt-0.5">Android can stop apps to save battery mid-run. Allow Minimal Fitness to run in the background.</p>
              </div>
              <button
                onClick={() => Launch.requestIgnoreBatteryOptimizations().catch(() => {})}
                className="px-4 py-2 rounded-full text-xs font-extrabold shrink-0"
                style={{ backgroundColor: theme.primary, color: '#000' }}
              >
                Allow
              </button>
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1" role="group" aria-label="Choose an activity">
            {([
              ['Running', 'Run', Activity],
              ['Walking', 'Walk', Footprints],
              ['Hiking', 'Hike', MapPin],
              ['Cycling', 'Cycle', Bike],
              ['Strength', 'Strength', Dumbbell],
              ['Treadmill', 'Treadmill', Activity],
              ['IndoorCycling', 'Indoor bike', Bike],
              ['Rowing', 'Row', Activity],
              ['HIIT', 'HIIT', Flag],
              ['Yoga', 'Yoga', Activity],
              ['Elliptical', 'Elliptical', Activity],
              ['Calisthenics', 'Bodyweight', Dumbbell],
            ] as [WorkoutType, string, React.ElementType][]).map(([id, label, Icon]) => (
              <button key={id} onClick={() => setSelectedSport(id)} aria-pressed={selectedSport === id} className="sport-pill">
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {weather && GPS_TYPES.includes(selectedSport) && <WeatherCard state={weather} theme={theme} units={units} compact />}

          {/* Shoes or bike: pick which one this workout counts toward, so the mileage lands on the right pair */}
          {sportGear && (
            <section className="mt-4 rounded-[22px] border px-4 py-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }} aria-label={sportGear === 'bike' ? 'Bike for this ride' : 'Shoes for this run'}>
              <div className="flex items-center justify-between">
                <span className="stat-label">{sportGear === 'bike' ? 'Bike' : 'Shoes'}</span>
                <button type="button" onClick={() => { setGearKind(sportGear); setRunView('gear'); }} className="text-[11px] font-bold" style={{ color: theme.primary }}>
                  {gearOfKind(shoes, sportGear).some((s) => !s.retired) ? 'Manage' : sportGear === 'bike' ? 'Add a bike' : 'Add shoes'}
                </button>
              </div>
              {gearOfKind(shoes, sportGear).some((s) => !s.retired) ? (
                <div className="mt-2 space-y-1.5" role="radiogroup" aria-label={sportGear === 'bike' ? 'Choose a bike' : 'Choose shoes'}>
                  {gearOfKind(shoes, sportGear)
                    .filter((s) => !s.retired)
                    .map((s) => {
                      const km = shoeKm(s, workouts);
                      const on = selectedShoe?.id === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => chooseShoe(s.id)}
                          className="w-full flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left"
                          style={{ borderColor: on ? theme.primary : 'var(--hairline)', background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent' }}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-white truncate">{s.name}</span>
                            <span className="block text-[11px] text-neutral-400">
                              {kmToDisplay(km, units, 0)} / {kmToDisplay(s.retireKm, units, 0)} {distanceUnit(units)}
                            </span>
                          </span>
                          <span className="w-4 h-4 rounded-full border-2 shrink-0" style={{ borderColor: on ? theme.primary : '#64748b', background: on ? theme.primary : 'transparent' }} />
                        </button>
                      );
                    })}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={savedGear[sportGear] === NO_GEAR}
                    onClick={() => chooseShoe(NO_GEAR)}
                    className="w-full text-left rounded-2xl border px-3 py-2 text-[12px] text-neutral-400"
                    style={{ borderColor: savedGear[sportGear] === NO_GEAR ? theme.primary : 'var(--hairline)' }}
                  >
                    Don't count this {sportGear === 'bike' ? 'ride' : 'workout'} toward any {sportGear === 'bike' ? 'bike' : 'shoes'}
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-neutral-400 mt-1.5">
                  {sportGear === 'bike'
                    ? 'Add the bike you ride and each ride counts toward its mileage, with a reminder when a service is due.'
                    : 'Add the shoes you run in and each run counts toward their mileage, with a warning as they wear out.'}
                </p>
              )}
            </section>
          )}
          {selectedShoe && sportGear && shoeState(shoeKm(selectedShoe, workouts), selectedShoe.retireKm) !== 'good' && (
            <p className="mt-2 px-2 text-[11px] font-semibold" style={{ color: theme.secondary }}>
              {selectedShoe.name}: {shoeMessage(shoeState(shoeKm(selectedShoe, workouts), selectedShoe.retireKm), sportGear)}
            </p>
          )}
          {(selectedSport === 'Cycling' || selectedSport === 'IndoorCycling') && <CyclingSensorsCard theme={theme} sensors={cycling} />}

          {/* Safety live share */}
          {liveShare.enabled && canShareLocation(selectedSport) && (
            <div className="mt-4 rounded-[22px] border px-4 py-3" style={{ backgroundColor: theme.surface, borderColor: shareThisRun ? theme.primary : theme.surfaceBorder }}>
              <div className="flex items-center justify-between gap-3">
                <span className="stat-label flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Text my location
                </span>
                <button type="button" onClick={() => setShareThisRun((v) => !v)} aria-pressed={shareThisRun} className="sport-pill">
                  {shareThisRun ? 'On for this run' : 'Off for this run'}
                </button>
              </div>
              <p className="text-[11px] text-neutral-400 mt-2">
                {shareThisRun
                  ? `A text with a map link goes to ${liveShare.contacts.map((c) => c.name).join(', ')} when you start, every ${liveShare.everyMin} minutes, and when you finish. It goes by SMS, not the internet.`
                  : 'Nothing will be texted on this run.'}
              </p>
            </div>
          )}

          {/* Route to follow */}
          {GPS_TYPES.includes(selectedSport) && (
            <div className="mt-4 rounded-[22px] border px-4 py-3" style={{ backgroundColor: theme.surface, borderColor: followRoute ? theme.primary : theme.surfaceBorder }}>
              <div className="flex items-center justify-between gap-3">
                <span className="stat-label flex items-center gap-1.5">
                  <RouteIcon className="w-3.5 h-3.5" /> Route
                </span>
                {savedRoutes.length > 0 ? (
                  <select
                    value={followId ?? ''}
                    onChange={(e) => setFollowId(e.target.value || null)}
                    aria-label="Route to follow"
                    className="flex-1 min-w-0 px-3 py-2 text-sm text-white"
                  >
                    <option value="">Free run: no route</option>
                    {savedRoutes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {kmToDisplay(r.km, units, 1)} {distanceUnit(units)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button type="button" onClick={() => setRunView('routes')} className="text-[11px] font-bold underline text-neutral-300">
                    Add a route to follow
                  </button>
                )}
              </div>
              {followRoute && <p className="text-[11px] text-neutral-400 mt-2">The route shows on the live map. You get a buzz (and a spoken note when spoken updates are on) if you leave it. It works with just GPS, no signal needed.</p>}
            </div>
          )}

          {/* Goal */}
          {selectedSport !== 'Strength' && (
            <div className="mt-5 rounded-[26px] border p-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
              <div className="flex items-center justify-between">
                <span className="stat-label flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> Goal
                </span>
                <span className="text-[11px] font-semibold text-neutral-500">
                  {goalType === 'open' ? 'No target, just go' : goalType === 'intervals' ? 'Voice and buzz at each step' : 'Buzz when you reach it'}
                </span>
              </div>
              <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar" role="group" aria-label="Goal type">
                {(['open', 'distance', 'time', 'calories', 'intervals'] as GoalType[])
                  .filter((t) => t !== 'distance' || GPS_TYPES.includes(selectedSport))
                  .map((t) => (
                    <button key={t} onClick={() => chooseGoalType(t)} aria-pressed={goalType === t} className="sport-pill">
                      {GOAL_LABELS[t]}
                    </button>
                  ))}
              </div>

              {(goalType === 'distance' || goalType === 'time' || goalType === 'calories') && (
                <>
                  <div className="flex items-center justify-between mt-4">
                    <button
                      onClick={() => nudgeGoal(-1)}
                      aria-label="Decrease goal"
                      className="w-12 h-12 rounded-full glass-chip flex items-center justify-center text-white"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <div className="text-center">
                      <div className="hero-num text-[4.2rem]">{goalType === 'distance' ? goalValue.toFixed(goalValue % 1 === 0 ? 0 : 1) : Math.round(goalValue)}</div>
                      <div className="hero-unit text-lg mt-1">{goalUnitLabel(goalType, imperial)}</div>
                    </div>
                    <button
                      onClick={() => nudgeGoal(1)}
                      aria-label="Increase goal"
                      className="w-12 h-12 rounded-full glass-chip flex items-center justify-center text-white"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex justify-center gap-2 mt-4 flex-wrap">
                    {(goalType === 'distance' ? GOAL_PRESETS.distance[imperial ? 'imperial' : 'metric'] : GOAL_PRESETS[goalType as 'time' | 'calories']).map((v) => (
                      <button key={v} onClick={() => setGoalValue(v)} aria-pressed={goalValue === v} className="sport-pill !py-1.5 !px-3.5 !text-xs">
                        {v}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Interval workouts */}
          {selectedSport !== 'Strength' && goalType === 'intervals' && (
            <div className="mt-3 rounded-[26px] border p-4 space-y-2" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
              <div className="flex items-center justify-between">
                <span className="stat-label">Workout</span>
                {!runOptions.voiceCues && <span className="text-[10px] text-neutral-500">Turn on Spoken updates in Settings for voice cues</span>}
              </div>
              {INTERVAL_WORKOUTS.map((w) => {
                const on = ivChoice === w.id;
                const mins = Math.round(plannedSeconds(w.steps) / 60);
                return (
                  <button
                    key={w.id}
                    onClick={() => setIvChoice(w.id)}
                    aria-pressed={on}
                    className="w-full text-left rounded-2xl glass-inset px-4 py-3"
                    style={on ? { borderColor: theme.primary } : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white">{w.name}</span>
                      <span className="text-[11px] font-bold text-neutral-400">{mins > 0 ? `${mins}+ min` : ''}</span>
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">{w.description}</p>
                  </button>
                );
              })}
              <button
                onClick={() => setIvChoice('custom')}
                aria-pressed={ivChoice === 'custom'}
                className="w-full text-left rounded-2xl glass-inset px-4 py-3"
                style={ivChoice === 'custom' ? { borderColor: theme.primary } : undefined}
              >
                <span className="text-sm font-bold text-white">Build your own</span>
                <p className="text-[11px] text-neutral-500 mt-0.5">Pick the reps, effort and rest.</p>
              </button>
              {ivChoice === 'custom' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {(
                    [
                      ['Reps', 'reps', 1, 30, 1],
                      [custom.workByDistance ? 'Effort (km)' : 'Effort (min)', 'work', 0.1, 60, custom.workByDistance ? 0.1 : 0.5],
                      ['Rest (min)', 'recoverMin', 0, 10, 0.5],
                      ['Warm-up (min)', 'warmupMin', 0, 30, 1],
                      ['Cool-down (min)', 'cooldownMin', 0, 30, 1],
                    ] as [string, keyof CustomIntervalInput, number, number, number][]
                  ).map(([label, key, lo, hi, step]) => (
                    <label key={key} className="block">
                      <span className="stat-label">{label}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={lo}
                        max={hi}
                        step={step}
                        value={custom[key] as number}
                        onChange={(e) => setCustom({ ...custom, [key]: Math.max(lo, Math.min(hi, Number(e.target.value) || 0)) })}
                        className="w-full mt-1 px-3 py-2 text-sm text-white"
                      />
                    </label>
                  ))}
                  <button
                    onClick={() => setCustom({ ...custom, workByDistance: !custom.workByDistance, work: custom.workByDistance ? 2 : 0.4 })}
                    className="sport-pill self-end justify-center"
                  >
                    Effort by {custom.workByDistance ? 'distance' : 'time'}: switch
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Pace and heart-rate targets */}
          {selectedSport !== 'Strength' && (
            <div className="mt-3 rounded-[26px] border p-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
              <div className="flex items-center justify-between">
                <span className="stat-label">Targets · alerts when you drift</span>
              </div>
              {GPS_TYPES.includes(selectedSport) && (
                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">Target pace</span>
                    <button
                      role="switch"
                      aria-checked={paceTargetOn}
                      aria-label="Target pace"
                      onClick={() => setPaceTargetOn((v) => !v)}
                      className="relative w-11 h-6 rounded-full shrink-0 transition-colors"
                      style={{ background: paceTargetOn ? theme.primary : 'rgba(255,255,255,0.16)' }}
                    >
                      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: paceTargetOn ? 22 : 2 }} />
                    </button>
                  </div>
                  {paceTargetOn && (
                    <div className="flex items-center justify-between mt-3">
                      <button onClick={() => nudgePace(-1)} aria-label="Faster target" className="w-10 h-10 rounded-full glass-chip flex items-center justify-center text-white">
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="text-center">
                        <div className="hero-num text-[2.6rem]">{formatPaceSec(paceShown)}</div>
                        <div className="stat-label mt-1">per {distanceUnit(units)}</div>
                      </div>
                      <button onClick={() => nudgePace(1)} aria-label="Slower target" className="w-10 h-10 rounded-full glass-chip flex items-center justify-center text-white">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4">
                <span className="text-sm font-semibold text-white">Heart-rate zone</span>
                <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar" role="group" aria-label="Target heart-rate zone">
                  {[0, 1, 2, 3, 4, 5].map((z) => (
                    <button key={z} onClick={() => setZoneTarget(z)} aria-pressed={zoneTarget === z} className="sport-pill !py-1.5 !px-3.5 !text-xs">
                      {z === 0 ? 'Off' : `Zone ${z}`}
                    </button>
                  ))}
                </div>
                {zoneTarget > 0 && !hrFromSensor && (
                  <p className="text-[10px] text-neutral-500 mt-2">Needs a live heart-rate sensor (your watch or a chest strap) to alert.</p>
                )}
              </div>
            </div>
          )}
          {/* Cadence beat */}
          <div className="mt-3 rounded-[26px] border p-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-white">Cadence beat</span>
                <p className="text-[11px] text-neutral-500 mt-0.5">A steady click to pace your steps. Plays while you run, even with the screen off.</p>
              </div>
              <button
                role="switch"
                aria-checked={beatOn}
                aria-label="Cadence beat"
                onClick={() => setBeatOn((v) => !v)}
                className="relative w-11 h-6 rounded-full shrink-0 transition-colors ml-3"
                style={{ background: beatOn ? theme.primary : 'rgba(255,255,255,0.16)' }}
              >
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: beatOn ? 22 : 2 }} />
              </button>
            </div>
            {beatOn && (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <button onClick={() => setBeatBpm_((b) => clampBpm(b - 1))} aria-label="Slower beat" className="w-11 h-11 rounded-full glass-chip flex items-center justify-center text-white">
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="text-center">
                    <div className="hero-num text-[3.4rem]">{beatBpm}</div>
                    <div className="stat-label mt-1">steps per minute</div>
                  </div>
                  <button onClick={() => setBeatBpm_((b) => clampBpm(b + 1))} aria-label="Faster beat" className="w-11 h-11 rounded-full glass-chip flex items-center justify-center text-white">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <input
                  type="range"
                  min={MIN_BPM}
                  max={MAX_BPM}
                  value={beatBpm}
                  onChange={(e) => setBeatBpm_(clampBpm(Number(e.target.value)))}
                  aria-label="Steps per minute"
                  className="w-full mt-3"
                />
                <div className="flex justify-center gap-2 mt-3 flex-wrap">
                  {[160, 170, 180, 190].map((v) => (
                    <button key={v} onClick={() => setBeatBpm_(v)} aria-pressed={beatBpm === v} className="sport-pill !py-1.5 !px-3.5 !text-xs">
                      {v}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-4 gap-3">
                  <button onClick={() => setBeatPreview((v) => !v)} aria-pressed={beatPreview} className="sport-pill !py-2 !text-xs">
                    {beatPreview ? 'Stop preview' : 'Hear it'}
                  </button>
                  <label className="flex items-center gap-2 text-[11px] text-neutral-400 font-semibold">
                    <input type="checkbox" checked={beatAlt} onChange={(e) => setBeatAlt(e.target.checked)} />
                    Different tone for each foot
                  </label>
                </div>
                <p className="text-[10px] text-neutral-600 mt-3 leading-relaxed">
                  Most runners land between 160 and 180 steps a minute. Change it by a few steps at a time. Use headphones for a quieter, clearer click.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center py-9">
            <button onClick={() => requestStart(selectedSport)} aria-label={`Start ${selectedSport}`} className="go-btn">
              GO
            </button>
            <p className="stat-label mt-9">
              {GPS_TYPES.includes(selectedSport) ? `Phone GPS${hrFromSensor ? ' · live heart rate' : ''}` : 'Timer & heart rate'}
            </p>
            {!hrFromSensor && (
              <p className="text-[11px] text-neutral-600 mt-2 text-center max-w-xs leading-relaxed">
                No heart-rate sensor connected, so average HR is estimated. Link your watch in Settings for real readings.
              </p>
            )}
          </div>
        </section>
      )}

      {/* PLANS: structured programs, saved routines and one-tap micro-workouts */}
      {!isSessionActive && runView === 'plans' && (
        <>
          <PlansPanel
            theme={theme}
            workouts={workouts}
            activePlan={activePlan}
            routines={routines}
            onActivatePlan={onActivatePlan}
            onStartStrength={(ids, title) => setStrength({ open: true, ids, title })}
            onStartCardio={handleStartCardio}
            onDeleteRoutine={onDeleteRoutine}
            onSaveRoutine={onSaveRoutine}
          />

          <section className="rounded-3xl border p-5 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" style={{ color: theme.primary }} />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7E889B]">Quick sessions</h3>
              </div>
              <span className="text-[11px] font-bold" style={{ color: theme.primary }}>
                1-tap log
              </span>
            </div>
            {justCompletedTitle && (
              <div className="p-3 rounded-2xl glass-inset flex items-center gap-2 animate-fadeIn text-xs text-white">
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: theme.primary }} />
                <span>
                  <strong>{justCompletedTitle}</strong> saved to your activities.
                </span>
              </div>
            )}
            <div className="space-y-2">
              {QUICK_WORKOUT_SUGGESTIONS.map((template) => {
                const isDone = isTemplateDone(template);
                return (
                  <div key={template.id} className="bg-black/50 border border-[#1A1E26] rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">{template.title}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-300 whitespace-nowrap">
                          {template.durationMinutes} min
                        </span>
                      </div>
                      <p className="text-[11px] text-[#7E889B] leading-relaxed">{template.description}</p>
                    </div>
                    <button
                      disabled={isDone}
                      onClick={() => handleCompleteQuickWorkout(template)}
                      className="px-3.5 py-2 rounded-full text-xs font-extrabold shrink-0 flex items-center gap-1.5 disabled:opacity-60"
                      style={isDone ? { background: `${theme.primary}22`, color: theme.primary } : { backgroundColor: theme.primary, color: '#000' }}
                    >
                      {isDone ? <Check className="w-3.5 h-3.5" /> : null}
                      {isDone ? 'Logged' : 'Log'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* GEAR: shoe mileage */}
      {!isSessionActive && runView === 'gear' && (
        <>
          <section className="rounded-[28px] border p-5 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl border border-[#1A1E26] bg-black/40" role="group" aria-label="Gear type">
              {(['shoe', 'bike'] as GearKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setGearKind(k)}
                  aria-pressed={gearKind === k}
                  className="py-1.5 rounded-lg text-xs font-bold"
                  style={{ background: gearKind === k ? theme.primary : 'transparent', color: gearKind === k ? 'var(--on-accent)' : '#9aa3b2' }}
                >
                  {k === 'shoe' ? 'Shoes' : 'Bikes'}
                </button>
              ))}
            </div>
            <div className="stat-label">{gearKind === 'bike' ? 'Your bikes' : 'Your shoes'}</div>
            {gearOfKind(shoes, gearKind).length === 0 && (
              <p className="text-sm text-neutral-400">
                {gearKind === 'bike'
                  ? 'Add the bike you ride. Each ride is logged on the bike you pick on the Start screen, and you get a reminder when a service is due.'
                  : 'Add the pair you run in. Each run is logged in the pair you pick on the Start screen, and you get a warning as they wear out.'}
              </p>
            )}
            {gearOfKind(shoes, gearKind).map((s) => {
              const km = shoeKm(s, workouts);
              const state = shoeState(km, s.retireKm);
              const pct = Math.min(100, Math.round((km / s.retireKm) * 100));
              const color = state === 'replace' ? '#ff4d4d' : state === 'worn' ? theme.secondary : theme.primary;
              return (
                <div key={s.id} className="rounded-2xl glass-inset p-4" style={s.retired ? { opacity: 0.55 } : undefined}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white truncate">{s.name}</span>
                    <span className="hero-num text-[1.8rem]">
                      {kmToDisplay(km, units, 0)}
                      <span className="hero-unit text-sm"> / {kmToDisplay(s.retireKm, units, 0)} {distanceUnit(units)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-2">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  {state !== 'good' && !s.retired && <p className="text-[11px] font-semibold mt-2" style={{ color }}>{shoeMessage(state, gearKind)}</p>}
                  <div className="flex gap-4 mt-3 text-[11px] font-bold uppercase tracking-wider">
                    <button onClick={() => onShoesChange(shoes.map((x) => (x.id === s.id ? { ...x, retired: !x.retired } : x)))} className="text-neutral-400 hover:text-white">
                      {s.retired ? 'Bring back' : 'Retire'}
                    </button>
                    <button onClick={() => onShoesChange(shoes.filter((x) => x.id !== s.id))} className="text-neutral-500 hover:text-rose-400">
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
          <section className="rounded-[28px] border p-5 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <div className="stat-label">{gearKind === 'bike' ? 'Add a bike' : 'Add a pair'}</div>
            <input value={gearName} onChange={(e) => setGearName(e.target.value)} placeholder={gearKind === 'bike' ? 'Name, e.g. Canyon Endurace' : 'Name, e.g. Nike Pegasus 41'} aria-label={gearKind === 'bike' ? 'Bike name' : 'Shoe name'} className="w-full px-3 py-2.5 text-sm text-white" />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="stat-label">{gearKind === 'bike' ? 'Already ridden' : 'Already run'} ({distanceUnit(units)})</span>
                <input type="number" inputMode="decimal" min={0} value={gearStart} onChange={(e) => setGearStart(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm text-white" />
              </label>
              <label className="block">
                <span className="stat-label">{gearKind === 'bike' ? 'Service at' : 'Replace at'} ({distanceUnit(units)})</span>
                {gearKind === 'bike' ? (
                  <input type="number" inputMode="decimal" min={50} value={bikeService} onChange={(e) => setBikeService(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm text-white" />
                ) : (
                  <input type="number" inputMode="decimal" min={50} value={gearRetire} onChange={(e) => setGearRetire(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm text-white" />
                )}
              </label>
            </div>
            <button onClick={addShoe} disabled={!gearName.trim()} className="w-full py-3 rounded-full text-sm font-extrabold disabled:opacity-40" style={{ backgroundColor: theme.primary, color: '#000' }}>
              {gearKind === 'bike' ? 'Add bike' : 'Add shoes'}
            </button>
          </section>
        </>
      )}
      {/* ROUTES: heatmap of everywhere you have been and the routes you repeat */}
      {!isSessionActive && runView === 'routes' && (
        <SegmentsPanel workouts={workouts} units={units} theme={theme} onOpenWorkout={(w) => setDetail({ workout: w, justFinished: false })} />
      )}
      {!isSessionActive && runView === 'routes' && (
        <RoutesView
          theme={theme}
          workouts={workouts}
          units={units}
          onOpenWorkout={(w) => setDetail({ workout: w, justFinished: false })}
          savedRoutes={savedRoutes}
          onSaveRoute={onSaveRoute}
          onDeleteRoute={onDeleteRoute}
          onFollow={(id) => {
            setFollowId(id);
            setRunView('start');
          }}
        />
      )}
      {/* ACTIVITIES: records, month calendar and the history feed */}
      {!isSessionActive && runView === 'activities' && (
        <>
      <ActivitiesPanel
        workouts={workouts}
        units={units}
        theme={theme}
        onOpenDetail={(w) => setDetail({ workout: w, justFinished: false })}
        onDeleteWorkout={onDeleteWorkout}
      />
        </>
      )}

      {/* A crash while drawing the breakdown must never take the whole app down; the workout is already saved. */}
      <ErrorBoundary
        key={detail?.workout?.id ?? 'none'}
        fallback={() => (
          <div role="alertdialog" aria-label="Breakdown unavailable" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-8">
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#111] p-6 text-center">
              <h2 className="text-xl font-extrabold italic text-white">Workout saved</h2>
              <p className="mt-2 text-sm text-gray-400">The detailed breakdown could not be shown. Your workout is in your history.</p>
              <button onClick={() => setDetail(null)} className="mt-5 w-full rounded-2xl bg-[#cbff00] py-3 font-extrabold text-black">
                Close
              </button>
            </div>
          </div>
        )}
      >
        <WorkoutDetailModal
          workout={detail?.workout ?? null}
          allWorkouts={workouts}
          onUpdate={(w) => {
            onUpdateWorkout(w);
            setDetail((d) => (d ? { ...d, workout: w } : d));
          }}
          onSaveAsRoute={onSaveRoute}
          profile={profile}
          justFinished={detail?.justFinished}
          onClose={() => setDetail(null)}
        />
      </ErrorBoundary>

      {/* STRENGTH LOGGER */}
      <StrengthLoggerModal
        isOpen={strength.open}
        onClose={() => setStrength((s) => ({ ...s, open: false }))}
        theme={theme}
        profile={profile}
        workouts={workouts}
        initialExerciseIds={strength.ids}
        planDayTitle={strength.title}
        liveBpm={liveBpm}
        hrFromSensor={hrFromSensor}
        watchKcal={watchKcal}
        watchLaunch={watchStartedHere}
        remoteStopToken={strengthStopToken}
        onSave={onAddWorkout}
        onSaveRoutine={onSaveRoutine}
      />

      {showManualModal && <ManualWorkoutModal initialType={manualType} profile={profile} onSave={onAddWorkout} onClose={() => setShowManualModal(false)} />}
    </div>
  );
};

export const ExerciseScreen = FitnessScreen;
