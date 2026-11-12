import React, { useMemo, useState } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { usePrefs } from '../lib/prefs';
import { MascotStrip } from './scenes/BotMascots';
import { mascotLine } from '../lib/mascotTalk';
import { MetricDetailSheet } from './MetricDetailSheet';
import type { MetricId, SeriesInput } from '../lib/metricSeries';
import { adaptWeek } from '../lib/planWeek';
import { trainingLoadStatus } from '../lib/trainingLoad';
import {
  Calendar,
  Flame,
  Footprints,
  Moon,
  HeartPulse,
  SlidersHorizontal,
  ChevronRight,
  Dumbbell,
  ShieldCheck,
  CheckCircle2,
  Plus,
  Play,
  Check,
  Zap,
  Clock,
  Sparkles,
  Award,
  ArrowUpRight,
  TrendingUp,
  X,
  Sliders,
  Droplets,
  Utensils,
  LayoutGrid,
  Minus,
} from 'lucide-react';
import { DashboardEditor } from './DashboardEditor';
import { DashboardLayout, WIDGETS, WidgetId, groupWidgets, moveWidgetTo, visibleWidgets } from '../lib/dashboardLayout';
import { useTileDrag } from '../hooks/useTileDrag';
import { MetricKey, TabId, WorkoutSession, WorkoutType, QuickWorkoutTemplate } from '../types/health';
import { ColorPalette } from '../types/theme';
import type { HcVitals } from '../hooks/useAutomaticData';
import type { WeatherState } from '../hooks/useWeather';
import { WeatherCard } from './WeatherCard';
import { ReadinessCard } from './ReadinessCard';
import { adaptPlanDay } from '../lib/planAdapt';
import { TopInsightCard } from './InsightsPanel';
import type { Insight } from '../lib/insights';
import { MonthlyGoalCard } from './MonthlyGoalCard';
import type { Readiness } from '../lib/readiness';
import { sanitizeMonthlyGoal } from '../lib/monthlyGoal';
import type { MonthlyGoal } from '../lib/monthlyGoal';
import { QUICK_WORKOUT_SUGGESTIONS } from '../data/catalog';
import { ConcentricRings } from './ui/charts';
import { CountUp } from './ui/CountUp';
import { fieldClass } from './ui/Modal';
import { ActivePlan, FoodEntry, Goals, UserProfile, WaterEntry } from '../types/tracking';
import { FastingSession, SleepLogEntry } from '../types/health';
import { MoodTile } from './MoodTile';
import { freezeOffer } from '../lib/streakFreeze';
import { PlanMove, applyMoves, movesFor, planReshuffle } from '../lib/planReshuffle';
import { planHeadline, plannedSport } from '../lib/planToday';
import {
  clamp01,
  currentStreak,
  estimateCalories,
  getMaxHr,
  sumFood,
  summarize,
  trimp,
  workoutDateKeys,
  workoutsInWeek,
  workoutsOnDay,
  currentRestingHr,
} from '../lib/calc';
import { addDays, formatTimestamp, startOfMondayWeek, startOfWeek, toDateKey, todayKey, weekStartsOnSunday, weekdayIndex } from '../lib/dates';
import { buildSleepInsight } from '../lib/sleepInsight';
import { getPlan } from '../data/plans';
import { planDaysForWeek } from '../lib/planBuilder';
import { displayToMl, distanceUnit, formatPace, kgToDisplay, kmToDisplay, mlToDisplay, volumeUnit, weightUnit } from '../lib/units';

interface TodayScreenProps {
  enabledMetrics: Set<MetricKey>;
  onOpenTabEditor: () => void;
  onNavigateToTab: (tab: TabId) => void;
  /** Opens the map of the whole app. */
  onOpenMap: () => void;
  /** Opens the Lift side (a plain weightlifting app inside this one). */
  onOpenLift?: () => void;
  /** 0 when no sensor is connected. */
  liveBpm: number;
  hrFromSensor: boolean;
  hrSource: 'watch' | 'ble' | null;
  /** The name the linked watch gives itself, once it is connected. */
  watchName?: string;
  theme: ColorPalette;
  workouts: WorkoutSession[];
  onAddWorkout: (workout: WorkoutSession) => void;
  profile: UserProfile;
  goals: Goals;
  onSetStepGoal: (n: number) => void;
  sleepLogs: SleepLogEntry[];
  /** Finished and running fasts, for the mood tile's patterns. */
  fasts?: FastingSession[];
  /** Days kept alive with a streak freeze, and how to freeze one more. */
  frozenDays?: string[];
  /** Moves a missed session to another day of this week. */
  onPlanMove?: (move: PlanMove) => void;
  /** Opens the Run tab on the Start card for this activity (what today's planned session is). */
  onOpenSport?: (type: WorkoutType) => void;
  onFreezeDay?: (dateKey: string) => void;
  steps: number;
  onSetSteps: (n: number) => void;
  /** Today's steps were set or deleted by hand rather than counted automatically. */
  stepsAdjusted: boolean;
  /** Sets today's steps exactly (0 deletes them); the automatic count no longer changes today's number. */
  onEditSteps: (n: number) => void;
  /** Returns today's steps to the automatic count. */
  onResetSteps: () => void;
  /** The "remove steps from a period" editor, shown inside the steps dialog. */
  stepPeriods?: React.ReactNode;
  /** Daily numbers behind the history sheets that the health tiles open. */
  metricInput: SeriesInput;
  food: FoodEntry[];
  water: WaterEntry[];
  /** Logs a drink for a day, and takes one back out (the water tile's + and - buttons). */
  onAddWater: (date: string, ml: number) => void;
  onDeleteWater: (id: string) => void;
  /** Which tiles Home shows, and in what order. */
  layout: DashboardLayout;
  onLayoutChange: (layout: DashboardLayout) => void;
  activePlan: ActivePlan | null;
  /** Heart rate, calories, distance and weight read from Health Connect. */
  vitals?: HcVitals | null;
  weather?: WeatherState;
  /** Reminds you to set up (or refresh) the folder backup so a lost phone does not lose your history. */
  backupNudge?: { kind: 'none' | 'stale'; days?: number; onFix: () => void } | null;
  /** Today's readiness (see lib/readiness), or null while there is not enough data. */
  readiness: Readiness | null;
  /** Readiness for the last three mornings, oldest first. */
  readinessRecent?: number[];
  /** The best pattern the insights engine found, if any. */
  topInsight: Insight | null;
  onOpenInsights: () => void;
  onSetMonthlyGoal: (goal: MonthlyGoal | null) => void;
}

export const TodayScreen: React.FC<TodayScreenProps> = ({
  enabledMetrics,
  onOpenTabEditor,
  onNavigateToTab,
  onOpenMap,
  onOpenLift,
  liveBpm,
  hrFromSensor,
  hrSource,
  watchName,
  theme,
  workouts,
  onAddWorkout,
  profile,
  goals,
  onSetStepGoal,
  sleepLogs,
  fasts,
  frozenDays = [],
  onPlanMove,
  onOpenSport,
  onFreezeDay,
  steps: currentSteps,
  onSetSteps,
  stepsAdjusted,
  onEditSteps,
  onResetSteps,
  stepPeriods,
  metricInput,
  food,
  water,
  onAddWater,
  onDeleteWater,
  layout,
  onLayoutChange,
  activePlan,
  vitals = null,
  weather,
  backupNudge = null,
  readiness,
  readinessRecent = [],
  topInsight,
  onOpenInsights,
  onSetMonthlyGoal,
}) => {
  const dailyStepGoal = goals.dailySteps;
  const today = todayKey();
  // With Health Connect switched off its card is hidden (what was imported earlier still feeds the charts).
  const hcEnabled = usePrefs().prefs.useHealthConnect;

  const [showGoalModal, setShowGoalModal] = useState<boolean>(false);
  const [tempGoal, setTempGoal] = useState<number>(dailyStepGoal);
  const [tempSteps, setTempSteps] = useState<string>(String(currentSteps));
  const [justCompletedTitle, setJustCompletedTitle] = useState<string | null>(null);
  // The extra watch numbers start folded away: each tile above already opens its own history.
  const [showHc, setShowHc] = useState(false);
  // The health tile that was tapped: it opens a sheet with history, trend and averages.
  const [metric, setMetric] = useState<MetricId | null>(null);
  // Makes a non-button element behave like one for touch, mouse and keyboard.
  const tap = (run: () => void) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: run,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        run();
      }
    },
  });
  // Where each tile used to lead, kept as a button inside its sheet.
  const sheetAction = (id: MetricId): { label: string; onClick: () => void } | undefined => {
    switch (id) {
      case 'steps':
        return {
          label: "Edit today's steps or the goal",
          onClick: () => {
            setMetric(null);
            setTempGoal(dailyStepGoal);
            setTempSteps(String(currentSteps));
            setShowGoalModal(true);
          },
        };
      case 'water':
      case 'eaten':
        return { label: id === 'water' ? 'Log water in Nutrition' : 'Open Nutrition', onClick: () => { setMetric(null); onNavigateToTab('nutrition'); } };
      case 'heart':
        return { label: 'Live heart rate and sensors', onClick: () => { setMetric(null); onNavigateToTab('health'); } };
      default:
        return undefined;
    }
  };

  const stepsProgress = Math.min(100, Math.round((currentSteps / dailyStepGoal) * 100));

  // Only one reminder or prompt shows at a time, the most useful first, so Today does not fill up with cards asking for something.
  const weatherPrompt = !!weather && (!weather.enabled || !weather.weather);
  const notice: 'checklist' | 'backup' | 'insight' | 'weather' | null =
    workouts.length === 0 ? 'checklist' : backupNudge ? 'backup' : topInsight ? 'insight' : weatherPrompt ? 'weather' : null;

  // Real weekly totals from the workout log
  const weekWorkouts = workoutsInWeek(workouts);
  const week = summarize(weekWorkouts);
  const weeklyCardioMinutes = week.minutes;
  const weeklyTrimpPoints = week.trimp;

  // Real latest sleep entry
  const latestSleep = sleepLogs[0];
  const sleepH = latestSleep ? Math.floor(latestSleep.durationMinutes / 60) : 0;
  const sleepM = latestSleep ? latestSleep.durationMinutes % 60 : 0;
  const sleepInsight = buildSleepInsight(sleepLogs, todayKey());

  // Goals summary
  const eaten = sumFood(food.filter((f) => f.date === today)).calories;
  const waterToday = water.filter((w) => w.date === today);
  const waterMl = waterToday.reduce((s, w) => s + w.ml, 0);
  const lastWaterToday = waterToday[waterToday.length - 1];
  const quickWater = profile.units === 'imperial' ? [8, 16] : [250, 500];
  const [editing, setEditing] = useState(false);
  const [dragTipSeen, setDragTipSeen] = usePersistentState<boolean>('home_drag_tip_seen', false);
  // Press and hold a tile, then drag it over another to reorder Home.
  // The tile moves when you let go, so nothing shifts under your finger while you drag.
  const drag = useTileDrag((id, target) => onLayoutChange(moveWidgetTo(layout, id as WidgetId, target as WidgetId)));
  const tile = (id: WidgetId) => {
    const node = widgetNodes[id];
    if (!node) return null;
    const lifted = drag.dragId === id;
    const over = drag.overId === id && drag.dragId !== id;
    return (
      <div
        key={id}
        {...drag.bind(id)}
        className={`select-none [&>*]:h-full [&>*]:w-full ${lifted ? 'scale-[0.97] opacity-50' : ''} ${over ? 'rounded-[28px] ring-2 ring-white/70' : ''}`}
        style={{ transition: 'transform 0.15s, opacity 0.15s', WebkitTouchCallout: 'none' }}
      >
        {node}
      </div>
    );
  };
  const doneKeys = workoutDateKeys(workouts);
  const streak = currentStreak(doneKeys, today);
  const doneToday = workoutsOnDay(workouts, today);
  const offer = onFreezeDay ? freezeOffer(doneKeys, frozenDays, today) : null;
  const plan = activePlan ? (activePlan.plan ?? getPlan(activePlan.planId)) : undefined;
  const planWeek = plan && activePlan ? Math.floor((startOfMondayWeek(Date.now()).getTime() - startOfMondayWeek(activePlan.startedAt).getTime()) / (7 * 24 * 3600 * 1000)) + 1 : 1;
  const thisMonday = toDateKey(startOfMondayWeek(Date.now()));
  const weekPlanDays = plan ? applyMoves(planDaysForWeek(plan, planWeek), movesFor(activePlan?.moves, thisMonday)) : [];
  const planToday = plan ? weekPlanDays.find((d) => d.day === weekdayIndex()) : undefined;
  const [dismissedReshuffle, setDismissedReshuffle] = useState<string>(() => {
    try {
      return localStorage.getItem('kyfit_reshuffle_dismissed') || '';
    } catch {
      return '';
    }
  });
  const planAdvice = planToday ? adaptPlanDay(planToday, readiness) : null;
  // The rest of this week's plan, adjusted for how loaded and recovered you are (only shown when it suggests a change).
  const weekAdvice = useMemo(() => {
    if (!plan) return null;
    const doneIdx = [...new Set(workoutsInWeek(workouts).map((w) => weekdayIndex(w.startedAt ?? Date.parse(w.timestamp))))];
    return adaptWeek({
      days: weekPlanDays,
      doneDays: doneIdx,
      todayIdx: weekdayIndex(),
      load: trainingLoadStatus(workouts, today),
      readiness: readinessRecent.length > 0 ? readinessRecent : readiness ? [readiness.score] : [],
    });
  }, [plan, planWeek, workouts, today, readiness, readinessRecent, activePlan?.moves]);
  const reshuffle = useMemo(() => {
    if (!plan || !onPlanMove) return null;
    const doneIdx = [...new Set(workoutsInWeek(workouts).map((w) => weekdayIndex(w.startedAt ?? Date.parse(w.timestamp))))];
    const r = planReshuffle(weekPlanDays, doneIdx, weekdayIndex());
    return r && dismissedReshuffle !== `${thisMonday}:${r.missed.day}` ? r : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, planWeek, workouts, today, activePlan?.moves, dismissedReshuffle]);

  const handleSaveStepGoal = (newGoal: number, newSteps: number) => {
    onSetStepGoal(newGoal);
    if (newSteps !== currentSteps) onEditSteps(newSteps);
    setShowGoalModal(false);
  };

  const isTemplateDone = (t: QuickWorkoutTemplate) =>
    doneToday.some((w) => w.notes === `Quick workout: ${t.title}`);

  const handleCompleteQuickWorkout = (template: QuickWorkoutTemplate) => {
    setJustCompletedTitle(template.title);
    setTimeout(() => setJustCompletedTitle(null), 3000);

    // Walking template adds an estimated step count to today's total.
    if (template.category === 'Walking') {
      onSetSteps(currentSteps + Math.round(template.durationMinutes * 100));
    }

    const type = template.category === 'Walking' ? 'Walking' : template.category === 'HIIT' ? 'HIIT' : template.category === 'Mobility' ? 'Mobility' : 'Calisthenics';
    const maxHr = getMaxHr(profile);
    const avgHr = Math.round(profile.restingHr + (maxHr - profile.restingHr) * (0.3 + template.rpe * 0.05));
    const newSession: WorkoutSession = {
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
    };

    onAddWorkout(newSession);
  };

  const weekStartKey = toDateKey(startOfWeek(Date.now()));
  const weekDays = (weekStartsOnSunday() ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((label, i) => {
    const key = addDays(weekStartKey, i);
    return { label, key, done: doneKeys.has(key), isToday: key === today };
  });
  const lastRun = workouts.find((w) => (w.distanceKm ?? 0) > 0.05);
  const unit = distanceUnit(profile.units);
  const firstName = profile.name ? profile.name.split(' ')[0] : '';
  // The bots on Home belong to the Google-inspired theme alone; every other theme shows nothing here.
  const [botTalk, setBotTalk] = useState(0);
  // Health Connect: heart-rate tile fallback when no sensor is live, and the watch summary card
  const hcToday = vitals?.daily[today];
  const hcRecentBpm = vitals && vitals.latestBpm > 0 && Date.now() - vitals.latestAt < 6 * 3600_000 ? vitals.latestBpm : 0;
  const hcWeight = vitals && vitals.weights.length ? [...vitals.weights].sort((a, b) => b.time - a.time)[0] : null;
  const hasHc = hcEnabled && !!vitals && (!!hcToday || vitals.restingBpm > 0 || !!hcWeight);

  // Everything Home can show, in the order of the standard layout. The person's layout decides which appear and in what order.
  const widgetNodes: Partial<Record<WidgetId, React.ReactNode>> = {
    mood: <MoodTile theme={theme} sleepLogs={sleepLogs} workouts={workouts} fasts={fasts ?? []} />,
    lift: onOpenLift ? (
        <button
          type="button"
          onClick={onOpenLift}
          className="w-full rounded-2xl border min-h-14 p-3.5 flex items-center justify-between text-left glass-tile"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          <span className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center border" style={{ backgroundColor: `${theme.primary}15`, borderColor: `${theme.primary}33` }}>
              <Dumbbell className="w-5 h-5" style={{ color: theme.primary }} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-bold text-white">Lift</span>
              <span className="block text-xs text-[#A1A1AA]">Routines, sets and records</span>
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-neutral-400" aria-hidden="true" />
        </button>
    ) : null,
    run: (
      <section className="hero-banner" aria-label="Start a run">
        <div className="flex items-center justify-between p-5 min-h-[168px]">
          <div className="max-w-[58%]">
            <div className="eyebrow-accent">Today</div>
            <div className="hero-num text-[2.6rem] mt-2 uppercase" style={{ lineHeight: 0.9 }}>
              {doneToday.length > 0 ? 'Keep it moving' : planHeadline(planToday)}
            </div>
            {plan && planToday && <p className="mt-2 text-[12px] font-semibold text-neutral-300">{planToday.title}</p>}
          </div>
          <button
            onClick={() => {
              const type = onOpenSport ? plannedSport(planToday) : null;
              if (type && onOpenSport) onOpenSport(type);
              else onNavigateToTab('exercise');
            }}
            aria-label={plannedSport(planToday) ? `Start ${planToday?.title}` : 'Start a run'}
            className="shrink-0 w-[84px] h-[84px] rounded-full bg-black flex items-center justify-center"
            style={{ color: theme.primary, boxShadow: '0 0 0 5px rgba(0,0,0,0.35)' }}
          >
            <span className="hero-num text-[2.1rem]" style={{ color: theme.primary }}>
              GO
            </span>
          </button>
        </div>
      </section>
    ),
    rings: (() => {
      const activeMin = doneToday.reduce((sum, w) => sum + (w.durationMinutes || 0), 0);
      const items = [
        { label: 'Steps', value: currentSteps, goal: dailyStepGoal, color: theme.primary, unit: '' },
        { label: 'Active minutes', value: activeMin, goal: 30, color: theme.secondary, unit: ' min' },
        { label: 'Fuel', value: eaten, goal: goals.dailyCalories, color: '#ffd23f', unit: ' kcal' },
      ];
      const frac = (v: number, g: number) => (g > 0 ? clamp01(v / g) : 0);
      const overall = Math.round((items.reduce((s, i) => s + frac(i.value, i.goal), 0) / items.length) * 100);
      return (
        <section className="rounded-[28px] border p-5 glass-tile" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }} aria-label="Today's rings">
          <div className="flex items-center gap-5">
            <ConcentricRings
              rings={items.map((i) => ({ value: frac(i.value, i.goal), color: i.color }))}
              size={156}
              stroke={11}
              ariaLabel={`Today: ${items.map((i) => `${i.label} ${Math.round(frac(i.value, i.goal) * 100)} percent`).join(', ')}`}
            >
              <div>
                <div className="hero-num text-[1.7rem] leading-none">
                  <CountUp value={overall} />
                  <span className="text-sm">%</span>
                </div>
              </div>
            </ConcentricRings>
            <ul className="min-w-0 flex-1 space-y-2.5">
              {items.map((i) => (
                <li key={i.label} className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: i.color}} aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{i.label}</div>
                    <div className="text-sm font-extrabold tabular-nums text-white">
                      <CountUp value={i.value} />
                      <span className="text-xs font-semibold text-neutral-400">
                        {' '}
                        / {i.goal.toLocaleString()}
                        {i.unit}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      );
    })(),
    steps: (
        <button
          onClick={() => setMetric('steps')}
          className="rounded-[28px] border p-4 text-left glass-tile"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          <div className="gh-chip" style={{ background: `${theme.primary}22`, color: theme.primary }}>
            <Footprints className="w-4 h-4" />
          </div>
          <div className="gh-label">Steps</div>
          <div className="gh-value"><CountUp value={currentSteps} /></div>
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="bar-grow h-full rounded-full" style={{ width: `${stepsProgress}%`, backgroundColor: theme.primary }} />
          </div>
          <div className="gh-sub">of {dailyStepGoal.toLocaleString()}</div>
        </button>
    ),
    water: (
        <div
          className="relative rounded-[28px] border p-4 text-left glass-tile"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          {/* A button can not sit inside another button (screen readers get lost), so the tile's own tap is a button laid behind the content and the add and remove buttons sit above it. */}
          <button type="button" onClick={() => setMetric('water')} aria-label="Water, open details" className="absolute inset-0 rounded-[28px]" />
          {/* The icon and the add and remove buttons share one row, so the tile stays the same size as the others */}
          <div className="flex items-start justify-between gap-1">
            <div className="gh-chip shrink-0" style={{ background: '#7dd3fc22', color: '#7dd3fc' }}>
              <Droplets className="w-4 h-4" />
            </div>
            <div className="relative z-10 -mt-2 -mr-2 flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (lastWaterToday) onDeleteWater(lastWaterToday.id);
                }}
                disabled={!lastWaterToday}
                aria-label="Remove the last drink"
                title="Remove the last drink"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.07] text-neutral-200 disabled:opacity-30"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              {quickWater.slice(0, 1).map((v) => (
                <button
                  key={v}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddWater(today, displayToMl(v, profile.units));
                  }}
                  aria-label={`Add ${v} ${volumeUnit(profile.units)} of water`}
                  className="h-11 min-w-11 rounded-full bg-sky-400/15 px-3 text-sm font-extrabold text-sky-300"
                >
                  +{v}
                </button>
              ))}
            </div>
          </div>
          <div className="gh-label">Water</div>
          <div className="gh-value">
            <CountUp value={mlToDisplay(waterMl, profile.units)} />
            <span className="gh-unit"> {volumeUnit(profile.units)}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="bar-grow h-full rounded-full"
              style={{ width: `${Math.round(clamp01(waterMl / Math.max(1, goals.dailyWaterMl)) * 100)}%`, backgroundColor: '#7dd3fc' }}
            />
          </div>
          <div className="gh-sub">
            of {mlToDisplay(goals.dailyWaterMl, profile.units)} {volumeUnit(profile.units)}
          </div>
        </div>
    ),
    heart: (
        <div
          {...tap(() => setMetric('heart'))}
          className="rounded-[28px] border p-4 cursor-pointer glass-tile"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          <div className="gh-chip" style={{ background: '#ff4d4d22', color: '#ff4d4d' }}>
            <HeartPulse className={`w-4 h-4 ${hrFromSensor ? 'animate-pulse' : ''}`} />
          </div>
          <div className="gh-label">Heart rate</div>
          <div className="gh-value">
            {hrFromSensor ? liveBpm : hcRecentBpm || vitals?.restingBpm || '—'}
            <span className="gh-unit"> bpm</span>
          </div>
          <div className="gh-sub" style={{ color: hrFromSensor ? '#ff4d4d' : undefined }}>
            {hrSource === 'watch'
              ? `${watchName || 'Watch'} · live`
              : hrSource === 'ble'
                ? 'Bluetooth sensor · live'
                : hcRecentBpm
                  ? 'Latest from Health Connect'
                  : vitals?.restingBpm
                    ? 'Resting · Health Connect'
                    : 'No sensor connected'}
          </div>
        </div>
    ),
    sleep: (
        <div
          onClick={() => onNavigateToTab('sleep')}
          className="rounded-[28px] border p-4 cursor-pointer glass-tile"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          <div className="gh-chip" style={{ background: `${theme.secondary}22`, color: theme.secondary }}>
            <Moon className="w-4 h-4" />
          </div>
          <div className="gh-label">Sleep</div>
          <div className="gh-value">{latestSleep ? `${sleepH}h ${sleepM}m` : '—'}</div>
          <div className="gh-sub">{sleepInsight ? sleepInsight.deltaLabel : 'No sleep logged'}</div>
        </div>
    ),
    calories: (
        <div
          {...tap(() => setMetric('eaten'))}
          className="rounded-[28px] border p-4 cursor-pointer glass-tile col-span-2"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="gh-label">Calories eaten</div>
              <div className="gh-value">
                <CountUp value={eaten} />
                <span className="gh-unit"> / {goals.dailyCalories.toLocaleString()} kcal</span>
              </div>
            </div>
            <div className="gh-chip !mb-0" style={{ background: '#ffd23f22', color: '#ffd23f' }}>
              <Utensils className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="bar-grow h-full rounded-full"
              style={{ width: `${Math.round(clamp01(eaten / Math.max(1, goals.dailyCalories)) * 100)}%`, backgroundColor: '#ffd23f' }}
            />
          </div>
        </div>
    ),
    readiness: (
<ReadinessCard theme={theme} readiness={readiness} />
    ),
    weather: weather && !weatherPrompt ? <WeatherCard state={weather} theme={theme} units={profile.units} /> : null,
    week: (
      <section className="rounded-[28px] border p-5 glass-hero" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
        <div className="flex items-center justify-between">
          <span className="stat-label">This week</span>
        </div>
        <div className="flex items-end gap-2 mt-3">
          <span className="hero-num text-[5.5rem]">{kmToDisplay(week.distanceKm, profile.units, 1)}</span>
          <span className="hero-unit text-2xl pb-2">{unit}</span>
        </div>
        <div className="flex items-center gap-4 mt-2 text-[12px] text-neutral-400 font-semibold">
          <span>
            <b className="text-white">{week.count}</b> / {goals.weeklyWorkouts} workouts
          </span>
          <span>
            <b className="text-white">{weeklyCardioMinutes}</b> min
          </span>
          <span>
            <b className="text-white">{week.calories.toLocaleString()}</b> kcal
          </span>
        </div>

        <div className="grid grid-cols-7 gap-2 mt-5">
          {weekDays.map((d, i) => (
            <div key={i} className="week-dot" data-done={d.done} data-today={d.isToday} title={d.key}>
              {d.done ? <Check className="w-3.5 h-3.5" strokeWidth={3.5} /> : d.label}
            </div>
          ))}
        </div>

        {plan && planToday && planAdvice && planAdvice.action !== 'keep' && (
          <div className="mt-5 rounded-2xl border p-3.5" style={{ borderColor: planAdvice.action === 'rest' ? '#FB718566' : '#FBBF2466', backgroundColor: 'rgba(251,191,36,0.07)' }}>
            <div className="text-sm font-bold text-white">{planAdvice.title}</div>
            <p className="text-[12px] text-neutral-300 mt-1 leading-relaxed">{planAdvice.message}</p>
            {planAdvice.adjusted && (planAdvice.adjusted.targetMinutes || planAdvice.adjusted.targetKm) && (
              <p className="text-xs text-neutral-400 mt-1">
                Suggested: {[planAdvice.adjusted.targetMinutes ? `${planAdvice.adjusted.targetMinutes} min` : '', planAdvice.adjusted.targetKm ? `${kmToDisplay(planAdvice.adjusted.targetKm, profile.units, 1)} ${unit}` : ''].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        )}
        {reshuffle && onPlanMove && (
          <div className="mt-3 rounded-2xl border p-3.5" style={{ borderColor: 'var(--accent)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <div className="text-sm font-bold text-white">{reshuffle.title}</div>
            <p className="text-[12px] text-neutral-300 mt-1 leading-relaxed">{reshuffle.message}</p>
            <div className="mt-2.5 flex gap-2">
              {reshuffle.to !== null && (
                <button type="button" onClick={() => onPlanMove({ week: thisMonday, from: reshuffle.missed.day, to: reshuffle.to as number })} className="sport-pill !py-2 !px-4 !text-xs min-h-11">
                  Move it
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const k = `${thisMonday}:${reshuffle.missed.day}`;
                  setDismissedReshuffle(k);
                  try {
                    localStorage.setItem('kyfit_reshuffle_dismissed', k);
                  } catch {
                    // storage unavailable
                  }
                }}
                className="sport-pill !py-2 !px-4 !text-xs min-h-11"
              >
                {reshuffle.to === null ? 'Got it' : 'Leave the plan'}
              </button>
            </div>
          </div>
        )}
        {weekAdvice && weekAdvice.tone !== 'good' && (
          <div className="mt-3 rounded-2xl border p-3.5" style={{ borderColor: weekAdvice.tone === 'warn' ? '#FBBF2466' : 'var(--accent)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <div className="text-sm font-bold text-white">{weekAdvice.title}</div>
            <p className="text-[12px] text-neutral-300 mt-1 leading-relaxed">{weekAdvice.message}</p>
            <ul className="mt-2 space-y-1">
              {weekAdvice.days.map((d) => (
                <li key={d.day} className="text-xs text-neutral-300 flex gap-2">
                  <span className="w-8 shrink-0 font-bold text-neutral-400">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d.day]}</span>
                  <span>
                    <span className="text-white font-semibold">{d.title}</span>: {d.note}
                    {d.change !== 'keep' && d.change !== 'rest' && (d.targetMinutes || d.targetKm)
                      ? ` (${[d.targetMinutes ? `${Math.round(d.targetMinutes)} min` : '', d.targetKm ? `${kmToDisplay(d.targetKm, profile.units, 1)} ${unit}` : ''].filter(Boolean).join(' · ')})`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-neutral-400 mt-2">
              Planned {weekAdvice.plannedMinutes} min left this week, suggested about {weekAdvice.suggestedMinutes}. The plan itself is unchanged.
            </p>
          </div>
        )}
        {plan && planToday && (
          <button
            onClick={() => onNavigateToTab('exercise')}
            className="mt-5 w-full text-left rounded-2xl glass-inset px-4 py-3 flex items-center justify-between"
          >
            <div>
              <div className="stat-label">Today in {plan.name}</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {planToday.title}
                {planToday.kind === 'rest' ? ' — enjoy the recovery' : ''}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-400" />
          </button>
        )}
      </section>
    ),
    monthly: (
<MonthlyGoalCard theme={theme} workouts={workouts} units={profile.units} goal={sanitizeMonthlyGoal(goals.monthly)} onChange={onSetMonthlyGoal} />
    ),
    last: lastRun ? (
        <section
          onClick={() => onNavigateToTab('exercise')}
          className="rounded-[28px] border p-5 cursor-pointer"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          <div className="flex items-center justify-between">
            <span className="stat-label">Last {lastRun.type.toLowerCase()}</span>
            <span className="text-xs font-semibold text-neutral-400">
              {lastRun.startedAt ? formatTimestamp(lastRun.startedAt) : lastRun.timestamp}
            </span>
          </div>
          <div className="flex items-end gap-2 mt-2">
            <span className="hero-num text-[3.6rem]">{kmToDisplay(lastRun.distanceKm ?? 0, profile.units, 2)}</span>
            <span className="hero-unit text-xl pb-1.5">{unit}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div>
              <div className="stat-label">Pace</div>
              <div className="gh-value !text-[1.6rem]">
                {formatPace(lastRun.durationMinutes, lastRun.distanceKm ?? 0, profile.units)}
                <span className="gh-unit"> /{unit}</span>
              </div>
            </div>
            <div>
              <div className="stat-label">Time</div>
              <div className="gh-value !text-[1.6rem]">
                {lastRun.durationMinutes}
                <span className="gh-unit"> min</span>
              </div>
            </div>
            <div>
              <div className="stat-label">Burned</div>
              <div className="gh-value !text-[1.6rem]">
                {lastRun.caloriesBurned}
                <span className="gh-unit"> kcal</span>
              </div>
            </div>
          </div>
        </section>
      ) : null,
    watch: hasHc && vitals ? (
        <section className="rounded-[28px] border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
          <button
            onClick={() => setShowHc((v) => !v)}
            aria-expanded={showHc}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="stat-label">More from your watch and Health Connect</span>
            <span className="flex items-center gap-1 text-xs font-semibold text-neutral-400">
              today
              <ChevronRight className={`w-4 h-4 transition-transform ${showHc ? 'rotate-90' : ''}`} />
            </span>
          </button>
          {showHc && <div className="grid grid-cols-3 gap-3 mt-3">
            <button className="text-left rounded-xl -m-1 p-1 hover:bg-white/5" onClick={() => setMetric('kcal')} aria-label="Total calories burned, see history">
              <div className="gh-value !text-[1.8rem]">{hcToday ? hcToday.totalKcal.toLocaleString() : '-'}</div>
              <div className="stat-label mt-1">Total kcal</div>
            </button>
            <button className="text-left rounded-xl -m-1 p-1 hover:bg-white/5" onClick={() => setMetric('active')} aria-label="Active calories, see history">
              <div className="gh-value !text-[1.8rem]">{hcToday ? hcToday.activeKcal.toLocaleString() : '-'}</div>
              <div className="stat-label mt-1">Active kcal</div>
            </button>
            <button className="text-left rounded-xl -m-1 p-1 hover:bg-white/5" onClick={() => setMetric('distance')} aria-label="Distance, see history">
              <div className="gh-value !text-[1.8rem]">{hcToday && hcToday.distanceKm > 0 ? kmToDisplay(hcToday.distanceKm, profile.units, 1) : '-'}</div>
              <div className="stat-label mt-1">{distanceUnit(profile.units)}</div>
            </button>
            <button className="text-left rounded-xl -m-1 p-1 hover:bg-white/5" onClick={() => setMetric('resting')} aria-label="Resting heart rate, see history">
              <div className="gh-value !text-[1.8rem]">{vitals.restingBpm || '-'}</div>
              <div className="stat-label mt-1">Resting bpm</div>
            </button>
            <button className="text-left rounded-xl -m-1 p-1 hover:bg-white/5" onClick={() => setMetric('heart')} aria-label="Average heart rate, see history">
              <div className="gh-value !text-[1.8rem]">{vitals.avgBpm24h || '-'}</div>
              <div className="stat-label mt-1">Avg bpm 24h</div>
            </button>
            <button className="text-left rounded-xl -m-1 p-1 hover:bg-white/5" onClick={() => setMetric('weight')} aria-label="Weight, see history">
              <div className="gh-value !text-[1.8rem]">{hcWeight ? kgToDisplay(hcWeight.kg, profile.units, 1) : '-'}</div>
              <div className="stat-label mt-1">Weight {weightUnit(profile.units)}</div>
            </button>
          </div>}
        </section>
      ) : null,
  };


  return (
    <div className="home-root space-y-4 pb-8 max-w-lg mx-auto">
      {/* HEADER */}
      <header className="flex items-start justify-between px-1 pt-1">
        <div>
          <p className="gh-eyebrow">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          <h1 className="mt-1.5">{firstName ? `Let's go, ${firstName}` : "Let's go"}</h1>
        </div>
        <div className="flex items-center gap-2 pt-1">
          {streak > 0 && (
            <div
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-extrabold glass-chip"
              style={{ color: theme.secondary }}
              aria-label={`${streak} day streak`}
            >
              <Flame className="flame-flicker w-3.5 h-3.5" />
              {streak}
            </div>
          )}
          <button
            onClick={() => setEditing(true)}
            aria-label="Customize Home"
            title="Customize Home"
            className="h-11 rounded-full flex items-center justify-center gap-1.5 px-3.5 glass-chip text-xs font-bold text-neutral-100 hover:text-white"
          >
            <SlidersHorizontal className="w-[18px] h-[18px]" /> Edit
          </button>
          <button
            onClick={onOpenMap}
            aria-label="Open the map of the app"
            title="Map: find anything"
            className="w-11 h-11 rounded-full flex items-center justify-center glass-chip text-neutral-200 hover:text-white"
          >
            <LayoutGrid className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={() => onNavigateToTab('settings')}
            aria-label="Profile and settings"
            className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-extrabold text-black"
            style={{ backgroundColor: theme.primary }}
          >
            {(profile.name || 'You').trim().charAt(0).toUpperCase()}
          </button>
        </div>
      </header>

      {theme.scene === 'google' && (
        <MascotStrip
          light={document.documentElement.dataset.theme === 'light'}
          still={document.documentElement.classList.contains('reduce-motion')}
          line={mascotLine({ hour: new Date().getHours(), stepsPct: stepsProgress, streak, workoutDoneToday: doneToday.length > 0, name: firstName }, botTalk)}
          onNext={() => setBotTalk((n) => n + 1)}
        />
      )}


      {!dragTipSeen && (
        <div className="flex items-center gap-3 rounded-2xl glass-inset px-4 py-3" role="note">
          <span className="text-sm text-neutral-100 flex-1">Tip: press and hold any tile, then drag it to where you want it.</span>
          <button onClick={() => setDragTipSeen(true)} className="min-h-11 shrink-0 rounded-full px-4 text-xs font-extrabold" style={{ backgroundColor: theme.primary, color: '#000' }}>Got it</button>
        </div>
      )}

      {offer && onFreezeDay && (
        <div className="home-wide-span flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
          <div className="min-w-0 text-xs text-neutral-300">
            <span className="font-bold text-white">{offer.streak}-day streak.</span> {offer.kind === 'today' ? 'Not training today?' : 'Missed yesterday?'} A freeze keeps it going ({offer.left} left this month).
          </div>
          <button type="button" onClick={() => onFreezeDay(offer.key)} className="sport-pill !py-2 !px-3.5 !text-xs shrink-0 min-h-11">
            Freeze {offer.kind === 'today' ? 'today' : 'yesterday'}
          </button>
        </div>
      )}
      {(() => {
        const groups = groupWidgets(visibleWidgets(layout));
        // The notice (backup, first steps, an insight, the weather offer) comes after the Today card and the rings, never before them.
        const after = Math.max(0, groups.findIndex((g) => g.ids.includes('rings')));
        return groups.map((g, gi) => (
          <React.Fragment key={g.ids.join('-')}>
            {g.half ? (
              <section className="grid grid-cols-2 gap-3 [&>*:last-child:nth-child(odd)]:col-span-2">{g.ids.map((id) => tile(id))}</section>
            ) : (
              tile(g.ids[0])
            )}
            {gi === after && (
              <>
            {notice === 'backup' && backupNudge && (
              <section className="rounded-[28px] border p-4 flex items-center justify-between gap-3" style={{ backgroundColor: theme.surface, borderColor: theme.secondary }}>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{backupNudge.kind === 'none' ? 'Protect your history' : 'Backup is out of date'}</div>
                  <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                    {backupNudge.kind === 'none'
                      ? 'Back up your runs so a lost phone does not lose them.'
                      : `Your last backup was ${backupNudge.days} days ago.`}
                  </p>
                </div>
                <button onClick={backupNudge.onFix} className="px-4 py-2 rounded-full text-xs font-extrabold shrink-0" style={{ backgroundColor: theme.secondary, color: '#000' }}>
                  {backupNudge.kind === 'none' ? 'Set up' : 'Back up now'}
                </button>
              </section>
            )}

            {/* ONE NOTICE AT A TIME: the most useful thing to look at now, so the screen does not fill with reminders */}
            {/* FIRST-RUN CHECKLIST: shown until you have logged a workout */}
            {notice === 'checklist' && (
              <section className="rounded-[28px] border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
                <div className="eyebrow-accent">Get started</div>
                <ul className="mt-3 space-y-2">
                  {[
                    { done: profile.onboarded, label: 'Set your profile and goals', go: 'settings' as TabId },
                    { done: hrFromSensor, label: 'Link your watch for live heart rate', go: 'settings' as TabId },
                    { done: false, label: 'Set a goal and do your first run', go: 'exercise' as TabId },
                  ].map((item) => (
                    <li key={item.label}>
                      <button
                        onClick={() => onNavigateToTab(item.go)}
                        className="w-full text-left rounded-2xl glass-inset px-4 py-3 flex items-center gap-3"
                      >
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border"
                          style={item.done ? { backgroundColor: theme.primary, borderColor: theme.primary, color: '#000' } : { borderColor: '#3a3a3a' }}
                        >
                          {item.done && <Check className="w-3.5 h-3.5" strokeWidth={3.5} />}
                        </span>
                        <span className={`text-sm font-semibold flex-1 ${item.done ? 'text-neutral-400 line-through' : 'text-white'}`}>{item.label}</span>
                        <ChevronRight className="w-4 h-4 text-neutral-400" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {notice === 'insight' && topInsight && <TopInsightCard theme={theme} insight={topInsight} onOpen={onOpenInsights} />}
            {notice === 'weather' && weather && <WeatherCard state={weather} theme={theme} units={profile.units} />}
              </>
            )}
          </React.Fragment>
        ));
      })()}

      {drag.dragId && drag.pos && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[60] rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-black shadow-lg"
          style={{ left: drag.pos.x, top: drag.pos.y - 46, transform: 'translateX(-50%)' }}
        >
          {WIDGETS.find((w) => w.id === drag.dragId)?.label}
        </div>
      )}

      <button
        onClick={() => setEditing(true)}
        className="flex w-full items-center justify-center gap-2 rounded-[28px] border border-dashed border-neutral-700 py-3.5 text-xs font-bold text-neutral-400 hover:text-white"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" /> Add or remove tiles
      </button>


      {editing && <DashboardEditor theme={theme} layout={layout} onChange={onLayoutChange} onClose={() => setEditing(false)} />}

      {metric && (
        <MetricDetailSheet
          metric={metric}
          theme={theme}
          units={profile.units}
          goals={goals}
          input={metricInput}
          onClose={() => setMetric(null)}
          action={sheetAction(metric)}
          quick={metric === 'water' ? (
            <>
              <button onClick={() => lastWaterToday && onDeleteWater(lastWaterToday.id)} disabled={!lastWaterToday} aria-label="Remove the last drink" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.07] text-neutral-200 disabled:opacity-30"><Minus className="h-5 w-5" /></button>
              {quickWater.map((v) => (
                <button key={v} onClick={() => onAddWater(today, displayToMl(v, profile.units))} className="h-12 flex-1 rounded-2xl bg-sky-400/15 text-base font-extrabold text-sky-300">+{v} {volumeUnit(profile.units)}</button>
              ))}
            </>
          ) : undefined}
        />
      )}

      {/* STEP GOAL CONFIGURATOR MODAL */}      {showGoalModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Steps and step goal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
        >
          <div className="w-full max-w-sm max-h-[90dvh] overflow-y-auto bg-[#0B0D11] border border-[#1A1E26] rounded-3xl p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1A1E26]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Footprints className="w-4 h-4 text-emerald-400" />
                Steps
              </h3>
              <button onClick={() => setShowGoalModal(false)} aria-label="Close" className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="space-y-1">
                <label htmlFor="ts-steps" className="text-xs text-neutral-400">
                  Steps today
                </label>
                <input
                  id="ts-steps"
                  inputMode="numeric"
                  value={tempSteps}
                  onChange={(e) => setTempSteps(e.target.value)}
                  className={fieldClass}
                />
                <p className="text-xs text-neutral-400">
                  {stepsAdjusted
                    ? 'You set this number, so it will not change on its own.'
                    : 'Counted automatically. Change it to correct today; it stays at the number you set.'}
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      onEditSteps(0);
                      setShowGoalModal(false);
                    }}
                    className="flex-1 py-2 rounded-xl border border-rose-500/40 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
                  >
                    Delete today's steps
                  </button>
                  {stepsAdjusted && (
                    <button
                      onClick={() => {
                        onResetSteps();
                        setShowGoalModal(false);
                      }}
                      className="flex-1 py-2 rounded-xl border border-neutral-700 text-xs font-semibold text-neutral-200 hover:text-white"
                    >
                      Use automatic count
                    </button>
                  )}
                </div>
                {stepPeriods && <div className="pt-3">{stepPeriods}</div>}
              </div>
              <div className="text-center">
                <span className="text-4xl font-bold font-mono text-white tabular-nums">
                  {tempGoal.toLocaleString()}
                </span>
                <span className="text-xs font-mono text-[#9AA3B2] block mt-1">target steps / day</span>
              </div>

              {/* Stepper buttons */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setTempGoal((prev) => Math.max(2000, prev - 1000))}
                  className="px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-sm font-mono hover:border-neutral-700"
                >
                  -1,000
                </button>
                <button
                  onClick={() => setTempGoal((prev) => Math.min(30000, prev + 1000))}
                  className="px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-sm font-mono hover:border-neutral-700"
                >
                  +1,000
                </button>
              </div>

              {/* Preset buttons */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[6000, 8000, 10000, 12000].map((goal) => (
                  <button
                    key={goal}
                    onClick={() => setTempGoal(goal)}
                    className={`py-2 rounded-xl border text-xs font-mono transition-colors ${
                      tempGoal === goal
                        ? 'bg-emerald-950 border-emerald-500 text-emerald-400'
                        : 'bg-black/50 border-[#1A1E26] text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    {goal / 1000}k
                  </button>
                ))}
              </div>

              <button
                onClick={() => handleSaveStepGoal(tempGoal, Math.max(0, Math.round(parseFloat(tempSteps) || 0)))}
                className="w-full py-2.5 rounded-xl font-bold text-xs bg-emerald-500 text-black hover:bg-emerald-400 transition-colors shadow-lg mt-2"
              >
                Save Steps & Goal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

