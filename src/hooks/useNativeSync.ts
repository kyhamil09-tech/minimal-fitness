import { useEffect, useMemo, useRef } from 'react';
import { Eat, Fasting, Glance, Launch, Water, isAndroidApp } from '../lib/native';
import type { EatSummary } from '../eat/model';
import { FastingSession, WorkoutSession } from '../types/health';
import { Goals, ReminderSettings, UserProfile, WaterEntry } from '../types/tracking';
import { currentStreak, workoutDateKeys, workoutsInWeek } from '../lib/calc';
import { todayKey } from '../lib/dates';
import { lastProtocol } from '../lib/fasting';
import { KIND_LABEL, goalSummary, monthProgress, sanitizeMonthlyGoal } from '../lib/monthlyGoal';
import { countWaterUndos, sanitizePendingWater, waterButtonAmounts } from '../lib/waterPending';
import { SleepLogEntry } from '../types/health';
import { getMaxHr } from '../lib/calc';
import { sleepScore } from '../lib/sleepMetrics';
import { sleepDebt } from '../lib/sleepPlan';


interface NativeSyncInput {
  workouts: WorkoutSession[];
  goals: Goals;
  profile: UserProfile;
  todaySteps: number;
  /** Today's readiness, or null before there is enough data. */
  readiness: { score: number; label: string } | null;
  fastingSessions: FastingSession[];
  reminders: ReminderSettings;
  water: WaterEntry[];
  /** Adds water drunk on `date` to the log (used for what the widget or watch added while the app was closed). */
  onAddWater: (date: string, ml: number) => void;
  /** Takes back the latest `count` drinks logged today (used when the watch's tile took a drink back while the app was closed). */
  onUndoWater: (count: number) => void;
  /** For the watch's sleep screen and complication. */
  sleepLogs: SleepLogEntry[];
  /** The app's accent color (#RRGGBB), so the fasting notification follows the color scheme. */
  accent: string;
  /** The sleep goal, minutes a night, for the watch's sleep score. */
  sleepGoalMin: number;
  /** Today's food against the goal, for the Eat widget, the Quick Settings tile and the watch. */
  eat: EatSummary;
}

/**
 * Everything the app pushes out to the rest of the phone and the watch, and the one thing it pulls in: the home-screen widgets'
 * numbers, the fasting notification, the watch's complications and Fuel tile, and water added from the widget or watch.
 * All of it does nothing in a browser.
 */
export function useNativeSync({ workouts, goals, profile, todaySteps, readiness, fastingSessions, reminders, water, onAddWater, onUndoWater, sleepLogs, accent, sleepGoalMin: SLEEP_GOAL_MIN, eat }: NativeSyncInput) {
  // Keep the widget's numbers current.
  const weekCount = workoutsInWeek(workouts).length;
  const streakDays = currentStreak(workoutDateKeys(workouts), todayKey());
  const monthly = sanitizeMonthlyGoal(goals.monthly);
  const monthNow = monthly ? monthProgress(workouts, monthly) : null;
  const monthPct = monthNow ? monthNow.pct : -1;
  const monthText = monthNow ? goalSummary(monthNow, profile.units) : '';
  const readinessScore = readiness ? readiness.score : -1;
  const readinessLabel = readiness ? readiness.label : '';
  useEffect(() => {
    if (!isAndroidApp()) return;
    Launch.updateWidget({
      steps: todaySteps,
      stepGoal: goals.dailySteps,
      week: weekCount,
      weekGoal: goals.weeklyWorkouts,
      streak: streakDays,
      readiness: readinessScore,
      readinessLabel,
      monthPct,
      monthLabel: monthly ? KIND_LABEL[monthly.kind] : '',
    }).catch(() => {});
  }, [todaySteps, goals.dailySteps, goals.weeklyWorkouts, weekCount, streakDays, readinessScore, readinessLabel, monthPct, monthly?.kind]);

  // The fasting notification and widget: hand the running fast (and the settings) to Android.
  const activeFast = fastingSessions.find((s) => !s.isCompleted);
  const fastStart = activeFast?.startTimestamp ?? 0;
  const fastGoal = activeFast?.targetDurationHours ?? 0;
  const fastName = activeFast?.fastProtocolName ?? '';
  const nextFast = lastProtocol(fastingSessions);
  useEffect(() => {
    if (!isAndroidApp()) return;
    Fasting.sync({
      active: !!activeFast,
      startMs: fastStart,
      goalHours: fastGoal || nextFast.hours,
      protocol: fastName || nextFast.name,
      live: reminders.fastingLive !== false,
      stages: reminders.fastingStages !== false,
      glow: reminders.fastingGlow !== false,
      accent,
      lastHours: nextFast.hours,
      lastProtocol: nextFast.name,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fastStart, fastGoal, fastName, reminders.fastingLive, reminders.fastingStages, reminders.fastingGlow, accent, nextFast.hours, nextFast.name]);

  // The home-screen water widget and the watch's Fuel tile show today's water, and add to it with one tap.
  const imperialUnits = profile.units === 'imperial';
  const waterToday = useMemo(() => water.filter((w) => w.date === todayKey()).reduce((s, w) => s + w.ml, 0), [water]);
  useEffect(() => {
    if (!isAndroidApp()) return;
    const [step1Ml, step2Ml] = waterButtonAmounts(imperialUnits);
    // The latest drink today, so the watch can take it back and show the right total straight away.
    const todays = water.filter((w) => w.date === todayKey());
    const lastMl = todays.length > 0 ? Math.round(todays[todays.length - 1].ml) : 0;
    Water.sync({ totalMl: waterToday, goalMl: goals.dailyWaterMl, imperial: imperialUnits, step1Ml, step2Ml, lastMl }).catch(() => {});
  }, [waterToday, goals.dailyWaterMl, imperialUnits, water]);
  // Water added from the widget or the watch while the app was closed goes into the log, on the day it was drunk.
  const addWaterRef = useRef(onAddWater);
  addWaterRef.current = onAddWater;
  const undoWaterRef = useRef(onUndoWater);
  undoWaterRef.current = onUndoWater;
  useEffect(() => {
    if (!isAndroidApp() || !profile.onboarded) return;
    const collect = async () => {
      try {
        const { items } = await Water.takePending();
        // Drinks taken back from the watch apply to what was already logged, so they go first; the new ones are added after.
        const undos = countWaterUndos(items, Date.now());
        if (undos > 0) undoWaterRef.current(undos);
        for (const w of sanitizePendingWater(items, Date.now())) addWaterRef.current(w.date, w.ml);
      } catch {
        // water bridge unavailable
      }
    };
    void collect();
    const timer = setInterval(collect, 60_000);
    const onVisible = () => document.visibilityState === 'visible' && void collect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [profile.onboarded]);

  // Today's calories for the Eat widget and the Quick Settings tile.
  useEffect(() => {
    if (!isAndroidApp()) return;
    Eat.sync({ eaten: eat.eaten, goal: eat.goal, left: eat.left, proteinG: eat.proteinG, proteinGoal: eat.proteinGoal }).catch(() => {});
  }, [eat.eaten, eat.goal, eat.left, eat.proteinG, eat.proteinGoal]);

  // Last night, for the watch's sleep screen and complication.
  const night = useMemo(() => {
    const latest = [...sleepLogs].filter((l) => l.durationMinutes > 0).sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0))[0];
    if (!latest) return null;
    const score = sleepScore(latest, SLEEP_GOAL_MIN);
    return {
      min: latest.durationMinutes,
      deep: latest.deepSleepMinutes,
      rem: latest.remSleepMinutes,
      light: latest.lightSleepMinutes,
      awake: latest.awakeMinutes,
      score: score ? score.score : -1,
      bed: latest.bedtime,
      wake: latest.wakeTime,
      date: latest.dateIso,
    };
  }, [sleepLogs, SLEEP_GOAL_MIN]);
  const maxHr = getMaxHr(profile);
  const debt = useMemo(() => sleepDebt(sleepLogs, SLEEP_GOAL_MIN, todayKey(), 7), [sleepLogs, SLEEP_GOAL_MIN]);

  // The watch's complications: readiness, the month's goal, the running fast and the step goal.
  useEffect(() => {
    if (!isAndroidApp()) return;
    Glance.send({
      maxHr,
      sleepMin: night ? night.min : -1,
      sleepDeep: night?.deep ?? 0,
      sleepRem: night?.rem ?? 0,
      sleepLight: night?.light ?? 0,
      sleepAwake: night?.awake ?? 0,
      sleepScore: night?.score ?? -1,
      sleepBed: night?.bed ?? '',
      sleepWake: night?.wake ?? '',
      sleepDate: night?.date ?? '',
      sleepGoalMin: SLEEP_GOAL_MIN,
      readiness: readinessScore,
      readinessLabel,
      stepGoal: goals.dailySteps,
      monthPct,
      monthText,
      monthKind: monthly ? KIND_LABEL[monthly.kind] : '',
      fastActive: !!activeFast,
      fastStartMs: fastStart,
      fastGoalHours: fastGoal,
      eatEaten: eat.eaten,
      eatGoal: eat.goal,
      eatLeft: eat.left,
      eatP: eat.proteinG,
      eatPGoal: eat.proteinGoal,
      eatLastMs: eat.lastFoodMs,
      sleepDebtMin: debt.logged > 0 ? debt.debtMin : -1,
      sleepDebtNights: debt.logged,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readinessScore, readinessLabel, goals.dailySteps, monthPct, monthText, monthly?.kind, fastStart, fastGoal, maxHr, night, eat.eaten, eat.goal, eat.left, eat.proteinG, eat.proteinGoal, eat.lastFoodMs, debt.debtMin, debt.logged]);
}
