import React, { useMemo, useState } from 'react';
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
} from 'lucide-react';
import { MetricKey, TabId, WorkoutSession, QuickWorkoutTemplate } from '../types/health';
import { ColorPalette } from '../types/theme';
import type { HcVitals } from '../hooks/useAutomaticData';
import type { WeatherState } from '../hooks/useWeather';
import { WeatherCard } from './WeatherCard';
import { ReadinessCard } from './ReadinessCard';
import { CycleCard } from './CycleCard';
import { adaptPlanDay } from '../lib/planAdapt';
import { cycleStatus } from '../lib/cycle';
import { TopInsightCard } from './InsightsPanel';
import type { Insight } from '../lib/insights';
import { MonthlyGoalCard } from './MonthlyGoalCard';
import type { Readiness } from '../lib/readiness';
import { sanitizeMonthlyGoal } from '../lib/monthlyGoal';
import type { MonthlyGoal } from '../lib/monthlyGoal';
import { QUICK_WORKOUT_SUGGESTIONS } from '../data/catalog';
import { ConcentricRings } from './ui/charts';
import { fieldClass } from './ui/Modal';
import { ActivePlan, FoodEntry, Goals, UserProfile, WaterEntry } from '../types/tracking';
import { SleepLogEntry } from '../types/health';
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
import { distanceUnit, formatPace, kgToDisplay, kmToDisplay, mlToDisplay, volumeUnit, weightUnit } from '../lib/units';

interface TodayScreenProps {
  enabledMetrics: Set<MetricKey>;
  onOpenTabEditor: () => void;
  onNavigateToTab: (tab: TabId) => void;
  /** 0 when no sensor is connected. */
  liveBpm: number;
  hrFromSensor: boolean;
  hrSource: 'watch' | 'ble' | null;
  theme: ColorPalette;
  workouts: WorkoutSession[];
  onAddWorkout: (workout: WorkoutSession) => void;
  profile: UserProfile;
  goals: Goals;
  onSetStepGoal: (n: number) => void;
  sleepLogs: SleepLogEntry[];
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
  /** Cycle tracking (optional, off by default): the logged period start dates and how to change them. */
  cycleOn: boolean;
  cycleStarts: string[];
  onLogPeriod: (date: string) => void;
  onRemovePeriod: (date: string) => void;
  /** Switches cycle tracking off from the card itself. */
  onTurnOffCycle?: () => void;
}

export const TodayScreen: React.FC<TodayScreenProps> = ({
  enabledMetrics,
  onOpenTabEditor,
  onNavigateToTab,
  liveBpm,
  hrFromSensor,
  hrSource,
  theme,
  workouts,
  onAddWorkout,
  profile,
  goals,
  onSetStepGoal,
  sleepLogs,
  steps: currentSteps,
  onSetSteps,
  stepsAdjusted,
  onEditSteps,
  onResetSteps,
  stepPeriods,
  metricInput,
  food,
  water,
  activePlan,
  vitals = null,
  weather,
  backupNudge = null,
  readiness,
  readinessRecent = [],
  topInsight,
  onOpenInsights,
  onSetMonthlyGoal,
  cycleOn,
  cycleStarts,
  onLogPeriod,
  onRemovePeriod,
  onTurnOffCycle,
}) => {
  const dailyStepGoal = goals.dailySteps;
  const today = todayKey();

  const [showGoalModal, setShowGoalModal] = useState<boolean>(false);
  const [tempGoal, setTempGoal] = useState<number>(dailyStepGoal);
  const [tempSteps, setTempSteps] = useState<string>(String(currentSteps));
  const [justCompletedTitle, setJustCompletedTitle] = useState<string | null>(null);
  const [showPeriods, setShowPeriods] = useState(false);
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
  const waterMl = water.filter((w) => w.date === today).reduce((s, w) => s + w.ml, 0);
  const doneKeys = workoutDateKeys(workouts);
  const streak = currentStreak(doneKeys, today);
  const doneToday = workoutsOnDay(workouts, today);
  const plan = activePlan ? (activePlan.plan ?? getPlan(activePlan.planId)) : undefined;
  const planWeek = plan && activePlan ? Math.floor((startOfMondayWeek(Date.now()).getTime() - startOfMondayWeek(activePlan.startedAt).getTime()) / (7 * 24 * 3600 * 1000)) + 1 : 1;
  const planToday = plan ? planDaysForWeek(plan, planWeek).find((d) => d.day === weekdayIndex()) : undefined;
  const planAdvice = planToday ? adaptPlanDay(planToday, readiness) : null;
  // The rest of this week's plan, adjusted for how loaded and recovered you are (only shown when it suggests a change).
  const weekAdvice = useMemo(() => {
    if (!plan) return null;
    const doneIdx = [...new Set(workoutsInWeek(workouts).map((w) => weekdayIndex(w.startedAt ?? Date.parse(w.timestamp))))];
    return adaptWeek({
      days: planDaysForWeek(plan, planWeek),
      doneDays: doneIdx,
      todayIdx: weekdayIndex(),
      load: trainingLoadStatus(workouts, today),
      readiness: readinessRecent.length > 0 ? readinessRecent : readiness ? [readiness.score] : [],
    });
  }, [plan, planWeek, workouts, today, readiness, readinessRecent]);

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
  // Health Connect: heart-rate tile fallback when no sensor is live, and the watch summary card
  const hcToday = vitals?.daily[today];
  const hcRecentBpm = vitals && vitals.latestBpm > 0 && Date.now() - vitals.latestAt < 6 * 3600_000 ? vitals.latestBpm : 0;
  const hcWeight = vitals && vitals.weights.length ? [...vitals.weights].sort((a, b) => b.time - a.time)[0] : null;
  const hasHc = !!vitals && (!!hcToday || vitals.restingBpm > 0 || !!hcWeight);

  return (
    <div className="space-y-4 pb-8 max-w-lg mx-auto">
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
              <Flame className="w-3.5 h-3.5" />
              {streak}
            </div>
          )}
          <button
            onClick={() => onNavigateToTab('settings')}
            aria-label="Profile and settings"
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold text-black"
            style={{ backgroundColor: theme.primary }}
          >
            {(profile.name || 'You').trim().charAt(0).toUpperCase()}
          </button>
        </div>
      </header>

      {/* START RUN BANNER */}
      <section className="hero-banner" aria-label="Start a run">
        <div className="flex items-center justify-between p-5 min-h-[168px]">
          <div className="max-w-[58%]">
            <div className="eyebrow-accent">Run club</div>
            <div className="hero-num text-[2.6rem] mt-2 uppercase" style={{ lineHeight: 0.9 }}>
              {doneToday.length > 0 ? 'Keep it moving' : 'Ready to run?'}
            </div>
            <p className="text-[12px] text-neutral-400 mt-2">
              {plan && planToday ? `Today: ${planToday.title}` : 'GPS, live map, pace and heart rate.'}
            </p>
          </div>
          <button
            onClick={() => onNavigateToTab('exercise')}
            aria-label="Start a run"
            className="shrink-0 w-[84px] h-[84px] rounded-full bg-black flex items-center justify-center"
            style={{ color: theme.primary, boxShadow: '0 0 0 5px rgba(0,0,0,0.35)' }}
          >
            <span className="hero-num text-[2.1rem]" style={{ color: theme.primary }}>
              GO
            </span>
          </button>
        </div>
      </section>

      {backupNudge && workouts.length > 0 && (
        <section className="rounded-[28px] border p-4 flex items-center justify-between gap-3" style={{ backgroundColor: theme.surface, borderColor: theme.secondary }}>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white">{backupNudge.kind === 'none' ? 'Protect your history' : 'Backup is out of date'}</div>
            <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">
              {backupNudge.kind === 'none'
                ? 'Pick a Google Drive folder once and your runs back up automatically, so a lost phone does not lose them.'
                : `Your last backup was ${backupNudge.days} days ago.`}
            </p>
          </div>
          <button onClick={backupNudge.onFix} className="px-4 py-2 rounded-full text-xs font-extrabold shrink-0" style={{ backgroundColor: theme.secondary, color: '#000' }}>
            {backupNudge.kind === 'none' ? 'Set up' : 'Back up now'}
          </button>
        </section>
      )}

      <ReadinessCard theme={theme} readiness={readiness} />
      {cycleOn && <CycleCard theme={theme} status={cycleStatus(cycleStarts, today)} starts={cycleStarts} onLogStart={onLogPeriod} onRemove={onRemovePeriod} onTurnOff={onTurnOffCycle} />}
      {topInsight && <TopInsightCard theme={theme} insight={topInsight} onOpen={onOpenInsights} />}

      {weather && <WeatherCard state={weather} theme={theme} units={profile.units} />}

      {/* FIRST-RUN CHECKLIST: shown until you have logged a workout */}
      {workouts.length === 0 && (
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
                  <span className={`text-sm font-semibold flex-1 ${item.done ? 'text-neutral-500 line-through' : 'text-white'}`}>{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-neutral-500" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* THIS WEEK */}
      <section className="rounded-[28px] border p-5 glass-hero" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
        <div className="flex items-center justify-between">
          <span className="stat-label">This week</span>
          <button onClick={onOpenTabEditor} className="text-[11px] flex items-center gap-1 font-bold text-neutral-400 hover:text-white">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Customize
          </button>
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
              <p className="text-[11px] text-neutral-400 mt-1">
                Suggested: {[planAdvice.adjusted.targetMinutes ? `${planAdvice.adjusted.targetMinutes} min` : '', planAdvice.adjusted.targetKm ? `${kmToDisplay(planAdvice.adjusted.targetKm, profile.units, 1)} ${unit}` : ''].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        )}
        {weekAdvice && weekAdvice.tone !== 'good' && (
          <div className="mt-3 rounded-2xl border p-3.5" style={{ borderColor: weekAdvice.tone === 'warn' ? '#FBBF2466' : 'var(--accent)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <div className="text-sm font-bold text-white">{weekAdvice.title}</div>
            <p className="text-[12px] text-neutral-300 mt-1 leading-relaxed">{weekAdvice.message}</p>
            <ul className="mt-2 space-y-1">
              {weekAdvice.days.map((d) => (
                <li key={d.day} className="text-[11px] text-neutral-300 flex gap-2">
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
            <p className="text-[10px] text-neutral-500 mt-2">
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

      <MonthlyGoalCard theme={theme} workouts={workouts} units={profile.units} goal={sanitizeMonthlyGoal(goals.monthly)} onChange={onSetMonthlyGoal} />

      {/* LAST ACTIVITY */}
      {lastRun && (
        <section
          onClick={() => onNavigateToTab('exercise')}
          className="rounded-[28px] border p-5 cursor-pointer"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          <div className="flex items-center justify-between">
            <span className="stat-label">Last {lastRun.type.toLowerCase()}</span>
            <span className="text-[11px] font-semibold text-neutral-500">
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
      )}

      {/* STEPS + WATER */}
      <section className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMetric('steps')}
          className="rounded-[28px] border p-4 text-left glass-tile"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          <div className="gh-chip" style={{ background: `${theme.primary}22`, color: theme.primary }}>
            <Footprints className="w-4 h-4" />
          </div>
          <div className="gh-label">Steps</div>
          <div className="gh-value">{currentSteps.toLocaleString()}</div>
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${stepsProgress}%`, backgroundColor: theme.primary }} />
          </div>
          <div className="gh-sub">of {dailyStepGoal.toLocaleString()}</div>
        </button>

        <button
          onClick={() => setMetric('water')}
          className="rounded-[28px] border p-4 text-left glass-tile"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          <div className="gh-chip" style={{ background: '#7dd3fc22', color: '#7dd3fc' }}>
            <Droplets className="w-4 h-4" />
          </div>
          <div className="gh-label">Water</div>
          <div className="gh-value">
            {mlToDisplay(waterMl, profile.units)}
            <span className="gh-unit"> {volumeUnit(profile.units)}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.round(clamp01(waterMl / Math.max(1, goals.dailyWaterMl)) * 100)}%`, backgroundColor: '#7dd3fc' }}
            />
          </div>
          <div className="gh-sub">
            of {mlToDisplay(goals.dailyWaterMl, profile.units)} {volumeUnit(profile.units)}
          </div>
        </button>

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
              ? 'Pixel Watch · live'
              : hrSource === 'ble'
                ? 'Bluetooth sensor · live'
                : hcRecentBpm
                  ? 'Latest from Health Connect'
                  : vitals?.restingBpm
                    ? 'Resting · Health Connect'
                    : 'No sensor connected'}
          </div>
        </div>

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

        <div
          {...tap(() => setMetric('eaten'))}
          className="rounded-[28px] border p-4 cursor-pointer glass-tile col-span-2"
          style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="gh-label">Calories eaten</div>
              <div className="gh-value">
                {eaten.toLocaleString()}
                <span className="gh-unit"> / {goals.dailyCalories.toLocaleString()} kcal</span>
              </div>
            </div>
            <div className="gh-chip !mb-0" style={{ background: '#ffd23f22', color: '#ffd23f' }}>
              <Utensils className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.round(clamp01(eaten / Math.max(1, goals.dailyCalories)) * 100)}%`, backgroundColor: '#ffd23f' }}
            />
          </div>
        </div>
      </section>

      {/* FROM HEALTH CONNECT: what the watch and other apps recorded today */}
      {hasHc && vitals && (
        <section className="rounded-[28px] border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
          <div className="flex items-center justify-between">
            <span className="stat-label">From Health Connect</span>
            <span className="text-[11px] font-semibold text-neutral-500">today</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
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
          </div>
        </section>
      )}

      {metric && (
        <MetricDetailSheet
          metric={metric}
          theme={theme}
          units={profile.units}
          goals={goals}
          input={metricInput}
          onClose={() => setMetric(null)}
          action={sheetAction(metric)}
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
              <button onClick={() => setShowGoalModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="space-y-1">
                <label htmlFor="ts-steps" className="text-[11px] text-neutral-400">
                  Steps today
                </label>
                <input
                  id="ts-steps"
                  inputMode="numeric"
                  value={tempSteps}
                  onChange={(e) => setTempSteps(e.target.value)}
                  className={fieldClass}
                />
                <p className="text-[10px] text-neutral-600">
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
                    className="flex-1 py-2 rounded-xl border border-rose-500/40 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10"
                  >
                    Delete today's steps
                  </button>
                  {stepsAdjusted && (
                    <button
                      onClick={() => {
                        onResetSteps();
                        setShowGoalModal(false);
                      }}
                      className="flex-1 py-2 rounded-xl border border-neutral-700 text-[11px] font-semibold text-neutral-200 hover:text-white"
                    >
                      Use automatic count
                    </button>
                  )}
                </div>
                {stepPeriods && (
                  <div className="pt-2">
                    <button
                      onClick={() => setShowPeriods((v) => !v)}
                      aria-expanded={showPeriods}
                      className="text-[11px] font-semibold text-neutral-300 hover:text-white"
                    >
                      {showPeriods ? 'Hide' : 'Remove steps from a period, like a drive'}
                    </button>
                    {showPeriods && <div className="mt-3 pt-3 border-t border-[#1A1E26]">{stepPeriods}</div>}
                  </div>
                )}
              </div>
              <div className="text-center">
                <span className="text-4xl font-bold font-mono text-white tabular-nums">
                  {tempGoal.toLocaleString()}
                </span>
                <span className="text-xs font-mono text-[#7E889B] block mt-1">target steps / day</span>
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

