import { useEffect, useMemo, useRef } from 'react';
import { Fasting, Glance, Launch, Water, isAndroidApp } from '../lib/native';
import { FastingSession, WorkoutSession } from '../types/health';
import { Goals, ReminderSettings, UserProfile, WaterEntry } from '../types/tracking';
import { currentStreak, workoutDateKeys, workoutsInWeek } from '../lib/calc';
import { todayKey } from '../lib/dates';
import { lastProtocol } from '../lib/fasting';
import { KIND_LABEL, goalSummary, monthProgress, sanitizeMonthlyGoal } from '../lib/monthlyGoal';
import { sanitizePendingWater, waterButtonAmounts } from '../lib/waterPending';

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
}

/**
 * Everything the app pushes out to the rest of the phone and the watch, and the one thing it pulls in: the home-screen widgets'
 * numbers, the fasting notification, the watch's complications and Fuel tile, and water added from the widget or watch.
 * All of it does nothing in a browser.
 */
export function useNativeSync({ workouts, goals, profile, todaySteps, readiness, fastingSessions, reminders, water, onAddWater }: NativeSyncInput) {
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
      lastHours: nextFast.hours,
      lastProtocol: nextFast.name,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fastStart, fastGoal, fastName, reminders.fastingLive, reminders.fastingStages, nextFast.hours, nextFast.name]);

  // The home-screen water widget and the watch's Fuel tile show today's water, and add to it with one tap.
  const imperialUnits = profile.units === 'imperial';
  const waterToday = useMemo(() => water.filter((w) => w.date === todayKey()).reduce((s, w) => s + w.ml, 0), [water]);
  useEffect(() => {
    if (!isAndroidApp()) return;
    const [step1Ml, step2Ml] = waterButtonAmounts(imperialUnits);
    Water.sync({ totalMl: waterToday, goalMl: goals.dailyWaterMl, imperial: imperialUnits, step1Ml, step2Ml }).catch(() => {});
  }, [waterToday, goals.dailyWaterMl, imperialUnits]);
  // Water added from the widget or the watch while the app was closed goes into the log, on the day it was drunk.
  const addWaterRef = useRef(onAddWater);
  addWaterRef.current = onAddWater;
  useEffect(() => {
    if (!isAndroidApp() || !profile.onboarded) return;
    const collect = async () => {
      try {
        const { items } = await Water.takePending();
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

  // The watch's complications: readiness, the month's goal, the running fast and the step goal.
  useEffect(() => {
    if (!isAndroidApp()) return;
    Glance.send({
      readiness: readinessScore,
      readinessLabel,
      stepGoal: goals.dailySteps,
      monthPct,
      monthText,
      monthKind: monthly ? KIND_LABEL[monthly.kind] : '',
      fastActive: !!activeFast,
      fastStartMs: fastStart,
      fastGoalHours: fastGoal,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readinessScore, readinessLabel, goals.dailySteps, monthPct, monthText, monthly?.kind, fastStart, fastGoal]);
}
