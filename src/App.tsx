import { useState, useEffect, useMemo, useRef } from 'react';
import { MetricKey, WorkoutSession, WorkoutType, SleepLogEntry, FastingSession } from './types/health';
import { ThemeId } from './types/theme';
import { MODERN_THEMES } from './data/themes';
import { METRIC_CONFIGS } from './data/catalog';
import {
  ActivePlan,
  BodyEntry,
  Goals,
  DEFAULT_RUN_OPTIONS,
  ReminderSettings,
  Routine,
  HealthLogEntry,
  WorkoutPlan,
  RunOptions,
  UserProfile,
} from './types/tracking';
import { DEFAULT_GOALS, DEFAULT_PROFILE, DEFAULT_REMINDERS } from './data/defaults';
import { usePersistentState } from './hooks/usePersistentState';
import { useBleHeartRate } from './hooks/useBleHeartRate';
import { useWatchHeartRate } from './hooks/useWatchHeartRate';
import { useAutomaticData } from './hooks/useAutomaticData';
import { useAutoBackup } from './hooks/useAutoBackup';
import { isAndroidApp } from './lib/native';
import { workoutsCodec } from './lib/storageCodec';
import { StorageNotice } from './components/StorageNotice';
import { AppMapScreen } from './components/AppMapScreen';
import { useAppNavigation } from './hooks/useAppNavigation';
import { useNativeSync } from './hooks/useNativeSync';
import { useNutritionLog } from './hooks/useNutritionLog';
import { makeId } from './lib/ids';
import { useWatchWorkoutImport, useWidgetLaunchActions } from './hooks/useWatchAndWidgetInput';
import { progressSectionFor } from './lib/appMap';
import { App as CapApp } from '@capacitor/app';
import { AuroraGlow } from './components/AuroraGlow';
import { RewardsHost } from './components/RewardsHost';
import { wipePhotos } from './lib/photoStore';
import { afterWorkout } from './lib/rewards';
import { announce } from './lib/rewardsBus';
import { watchSystemInsets } from './lib/systemInsets';
import { pickRestingHr, setZoneConfig, workoutsOnDay } from './lib/calc';
import { dayProgress } from './lib/dayProgress';
import { clearAppData, clearSecrets } from './lib/backup';
import { useReminders } from './hooks/useReminders';
import { setWeekStartsOnSunday, toDateKey, todayKey } from './lib/dates';
import { AppPrefs, PrefsContext, readPrefs, sanitizePrefs, writePrefs } from './lib/prefs';
import { NutritionScreen, NutritionSegment } from './components/NutritionScreen';
import { ProgressScreen } from './components/ProgressScreen';
import { FitnessMetricsScreen } from './components/FitnessMetricsScreen';
import { ProfileModal } from './components/ProfileModal';
import { RemindersModal } from './components/RemindersModal';
import { BackupModal } from './components/BackupModal';
import { ImportModal } from './components/ImportModal';
import { AppLockGate } from './components/AppLockGate';
import { cleanStarts } from './lib/cycle';
import { SavedRoute, upsertRoute } from './lib/savedRoutes';
import { mergeImportedNights, mergeImportedWorkouts } from './lib/importers/merge';
import { hcWorkoutToSession } from './lib/hcWorkouts';
import { syncAutoDetect } from './lib/autoDetect';
import { useAppearance } from './hooks/useAppearance';
import { Onboarding } from './components/Onboarding';
import { installTapHaptics } from './lib/haptics';
import { setCardSkin, skinFrom } from './lib/cardSkin';
import { sendWatchLook } from './lib/watchLook';
import { buildWatchLook } from './lib/appearance';
import { AmoledTopBar } from './components/AmoledTopBar';
import { BottomNavBar } from './components/BottomNavBar';
import { TodayScreen } from './components/TodayScreen';
import { StepPeriods } from './components/StepPeriods';
import { FitnessScreen } from './components/FitnessScreen';
import { SleepScreen } from './components/SleepScreen';
import { FastingScreen } from './components/FastingScreen';
import { HealthScreen } from './components/HealthScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { TabEditorModal } from './components/TabEditorModal';
import { ThemeSelectorModal } from './components/ThemeSelectorModal';
import { Segmented } from './components/ui/Segmented';
import type { Shoe } from './lib/shoes';
import { HealthLogScreen } from './components/HealthLogScreen';
import { dismissSleepId } from './lib/sleepDetect';
import { useWeather } from './hooks/useWeather';
import { getAutoUpload, isConnected as isStravaConnected, uploadWorkout } from './lib/strava';
import { mergeImportedLogs } from './lib/healthLog';
import { buildFitnessDays } from './lib/fitnessMetrics';
import { trainingLoadStatus } from './lib/trainingLoad';
import { readiness, recentReadiness } from './lib/readiness';
import { buildInsights, insightReadiness } from './lib/insights';
import { InsightsPanel } from './components/InsightsPanel';
import type { MonthlyGoal } from './lib/monthlyGoal';
import {
  deleteFromHc,
  deleteWorkoutFromHc,
  writeBodyToHc,
  deleteHealthLogFromHc,
  writeHealthLogToHc,
  writeSleepToHc,
  writeWorkoutToHc,
  setHealthWriteEnabled,
} from './lib/healthWrite';
import { markSynced, unsyncedWorkouts } from './lib/hcSync';

export default function App() {
  // Navigation & View Mode State
  // App-wide preferences (Settings). Read once up front so the first screen already follows them.
  const [prefs, setPrefsState] = useState<AppPrefs>(() => {
    const p = readPrefs();
    setWeekStartsOnSunday(p.weekStart === 'sun');
    return p;
  });
  const setPrefs = (patch: Partial<AppPrefs>) => {
    const next = sanitizePrefs({ ...prefs, ...patch });
    setWeekStartsOnSunday(next.weekStart === 'sun');
    writePrefs(next);
    setPrefsState(next);
  };
  useEffect(() => {
    document.documentElement.classList.toggle('large-text', prefs.largeText);
    document.documentElement.classList.toggle('reduce-motion', prefs.reduceMotion);
    document.documentElement.classList.toggle('liquid-glass', prefs.liquidGlass);
  }, [prefs.largeText, prefs.reduceMotion, prefs.liquidGlass]);

  useEffect(() => watchSystemInsets(), []);

  // Where you are and how you move (tabs, swipes, the back button, the map). See hooks/useAppNavigation.
  const {
    currentTab,
    setCurrentTab,
    scrollRef,
    slideDir,
    setSlideDir,
    handleSwipeStart,
    handleSwipeEnd,
    confirmExit,
    setConfirmExit,
    glowKey,
    progressStart,
    setProgressStart,
    mapOpen,
    setMapOpen,
    runOpen,
    mealPlanToken,
    setMealPlanToken,
    navigateTo,
  } = useAppNavigation(prefs.swipeTabs);

  // Modern & Custom Theme State
  const [customThemes, setCustomThemes] = useState<Record<string, import('./types/theme').ColorPalette>>(() => {
    try {
      const saved = localStorage.getItem('aegis_custom_themes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Top banner visibility state (hidden by default for clean mobile screen; accessible in Settings)
  const [isTopBannerVisible, setIsTopBannerVisible] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('aegis_show_top_banner');
      return saved === 'true'; // Default false: hidden on mobile
    } catch {
      return false;
    }
  });

  const toggleTopBanner = () => {
    setIsTopBannerVisible((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('aegis_show_top_banner', String(next));
      } catch {}
      return next;
    });
  };

  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>(() => {
    try {
      // The Run Club redesign makes Volt the default; move installs still on the old default across once.
      if (!localStorage.getItem('kyfit_ui_v2')) {
        localStorage.setItem('kyfit_ui_v2', '1');
        if (localStorage.getItem('aegis_theme_id') === 'hyper_mint') localStorage.removeItem('aegis_theme_id');
      }
      return localStorage.getItem('aegis_theme_id') || 'volt';
    } catch {
      return 'volt';
    }
  });

  const allThemes = { ...MODERN_THEMES, ...customThemes };
  const baseTheme = allThemes[currentThemeId] || MODERN_THEMES.volt;
  // Background (off-black, AMOLED, pastels, your own) + accent palette: sets the page's colour variables and gives the screens their colours.
  const look = useAppearance(baseTheme);
  // The watch app, tile and workout screens use the same palette and (dark) background.
  useEffect(() => {
    const t = window.setTimeout(() => void sendWatchLook(buildWatchLook(look.backdrop, baseTheme)), 600);
    return () => window.clearTimeout(t);
  }, [look.backdrop, baseTheme]);
  // Share cards are drawn in the current background and palette.
  useEffect(() => {
    setCardSkin(skinFrom(look.backdrop, baseTheme, { style: prefs.logoStyle, colors: { bg: prefs.logoBg, ink: prefs.logoInk } }));
  }, [look.backdrop, baseTheme, prefs.logoStyle, prefs.logoBg, prefs.logoInk]);
  // A light tick on every button press (Settings > Run > Light haptics on taps).
  useEffect(() => installTapHaptics(), []);
  const theme = look.theme;
  const themeMode = look.mode;
  const setThemeMode = look.setMode;

  const handleSelectTheme = (id: ThemeId) => {
    setCurrentThemeId(id);
    try {
      localStorage.setItem('aegis_theme_id', id);
    } catch {}
  };

  const handleSaveCustomTheme = (palette: import('./types/theme').ColorPalette) => {
    setCustomThemes((prev) => {
      const updated = { ...prev, [palette.id]: palette };
      try {
        localStorage.setItem('aegis_custom_themes', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleDeleteCustomTheme = (id: string) => {
    setCustomThemes((prev) => {
      const updated = { ...prev };
      delete updated[id];
      try {
        localStorage.setItem('aegis_custom_themes', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    if (currentThemeId === id) {
      handleSelectTheme('volt');
    }
  };

  // ---- Persisted user data (survives reloads; included in Backup & Export) ----
  const [profile, setProfile] = usePersistentState<UserProfile>('profile', DEFAULT_PROFILE);
  const [goals, setGoals] = usePersistentState<Goals>('goals', () => {
    // Carry over the step goal from the pre-profile version of the app.
    try {
      const legacy = localStorage.getItem('aegis_step_goal');
      if (legacy) return { ...DEFAULT_GOALS, dailySteps: parseInt(legacy, 10) || DEFAULT_GOALS.dailySteps };
    } catch {
      // ignore
    }
    return DEFAULT_GOALS;
  });
  // Every list starts empty: nothing is pre-loaded, each install only ever holds its own user's data.
  // Workouts carry big GPS tracks, so their heavy parts are squeezed when stored and expanded when read (see lib/storageCodec).
  const [workouts, setWorkouts] = usePersistentState<WorkoutSession[]>('workouts', [], workoutsCodec);
  // The newest list, for callbacks that run on a timer.
  const workoutsRef = useRef(workouts);
  workoutsRef.current = workouts;
  const [sleepLogs, setSleepLogs] = usePersistentState<SleepLogEntry[]>('sleep_logs', []);
  const [fastingSessions, setFastingSessions] = usePersistentState<FastingSession[]>('fasting_sessions', []);
  // Food, water and saved meals, with adding and deleting. See hooks/useNutritionLog.
  const { food, water, savedMeals, addFood: handleAddFood, deleteFood: handleDeleteFood, addWater: handleAddWater, deleteWater: handleDeleteWater, saveMeal: handleSaveMeal, deleteMeal: handleDeleteMeal } =
    useNutritionLog();
  const [body, setBody] = usePersistentState<BodyEntry[]>('body', []);
  const [stepsLog, setStepsLog] = usePersistentState<Record<string, number>>('steps', {});
  const [routines, setRoutines] = usePersistentState<Routine[]>('routines', []);
  const weather = useWeather();
  const [shoes, setShoes] = usePersistentState<Shoe[]>('shoes', []);
  const [cycleStarts, setCycleStarts] = usePersistentState<string[]>('cycle_starts', []);
  const [savedRoutes, setSavedRoutes] = usePersistentState<SavedRoute[]>('saved_routes', []);
  const [healthLog, setHealthLog] = usePersistentState<HealthLogEntry[]>('health_log', []);
  const [activePlan, setActivePlan] = usePersistentState<ActivePlan | null>('active_plan', null);
  const [reminders, setReminders] = usePersistentState<ReminderSettings>('reminders', DEFAULT_REMINDERS);

  const [runOptions, setRunOptions] = usePersistentState<RunOptions>('run_options', DEFAULT_RUN_OPTIONS);
  const [launchRequest, setLaunchRequest] = useState<{ type: WorkoutType; nonce: number } | null>(null);

  // Steps, sleep from the watch (Health Connect) and the daily folder backup
  // Workouts other apps saved to Health Connect (Google Health / Fitbit and others) join the list, without being written back or sent to Strava.
  const automation = useAutomaticData(profile.onboarded, setSleepLogs, (sessions) => {
    const converted = sessions.map((s) => hcWorkoutToSession(s, profile)).filter((w): w is WorkoutSession => w !== null);
    if (converted.length > 0) setWorkouts((prev) => mergeImportedWorkouts(prev, converted).merged);
  }, prefs.stepSource, prefs.useHealthConnect);
  // The Health Connect master switch also guards every write and delete (see healthWrite).
  setHealthWriteEnabled(prefs.useHealthConnect);

  // "Looks like you started a run": the phone's own activity recognition offers to record (needs the physical-activity permission the step counter asks for).
  const stepsReady = automation.steps !== null;
  useEffect(() => {
    if (!profile.onboarded) return;
    void syncAutoDetect(prefs.detectWorkouts, prefs.detectWalks);
  }, [profile.onboarded, prefs.detectWorkouts, prefs.detectWalks, stepsReady]);

  // Zones and training load use your real resting heart rate when Health Connect or the watch has one.
  useEffect(() => {
    const fit = automation.vitals?.fitness ?? {};
    const latestFit = Object.values(fit).filter((d) => d.restingHr).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.restingHr;
    const ownDays = Object.entries(automation.own).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    const latestOwn = ownDays.find(([, d]) => d.restingHr)?.[1].restingHr;
    setZoneConfig(prefs.zoneMethod, pickRestingHr(profile.restingHr, latestFit, automation.vitals?.restingBpm || undefined, latestOwn));
  }, [prefs.zoneMethod, profile.restingHr, automation.vitals, automation.own]);
  const backup = useAutoBackup(workouts.length);
  // Weights other apps wrote to Health Connect (a smart scale, the Google app) join the body log once.
  const hcWeightStamp = automation.vitals?.at;
  useEffect(() => {
    const ws = automation.vitals?.weights.filter((w) => !w.own) ?? [];
    if (ws.length === 0) return;
    setBody((prev) => {
      const have = new Set(prev.map((b) => b.id));
      const add = ws
        .filter((w) => !have.has(`hc-${w.id}`))
        .map((w) => ({ id: `hc-${w.id}`, date: toDateKey(w.time), weightKg: Math.round(w.kg * 10) / 10 }));
      if (add.length === 0) return prev;
      const newest = add.reduce((a, b) => (a.date >= b.date ? a : b));
      const latestDate = prev.reduce((m, b) => (b.date > m ? b.date : m), '');
      if (newest.date >= latestDate) setProfile((p) => ({ ...p, weightKg: newest.weightKg }));
      return [...prev, ...add];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hcWeightStamp]);

  const handleAddHealthLog = (entry: Omit<HealthLogEntry, 'id'>) => {
    const saved: HealthLogEntry = { ...entry, id: makeId('hl') };
    setHealthLog((prev) => [saved, ...prev]);
    void writeHealthLogToHc(saved);
  };
  const handleDeleteHealthLog = (id: string) => {
    const gone = healthLog.find((e) => e.id === id);
    setHealthLog((prev) => prev.filter((e) => e.id !== id));
    if (gone) void deleteHealthLogFromHc(gone);
  };
  // Blood pressure and glucose readings other apps wrote to Health Connect join the log once.
  useEffect(() => {
    const v = automation.vitals;
    if (!v || (v.bp.length === 0 && v.glucose.length === 0)) return;
    const incoming: HealthLogEntry[] = [
      ...v.bp.map((b): HealthLogEntry => ({ id: `hc-bp-${b.id}`, kind: 'bp', at: b.time, systolic: Math.round(b.systolic), diastolic: Math.round(b.diastolic), imported: true })),
      ...v.glucose.map((g): HealthLogEntry => ({ id: `hc-gl-${g.id}`, kind: 'glucose', at: g.time, mgdl: Math.round(g.mgdl), relation: 'general', imported: true })),
    ];
    setHealthLog((prev) => mergeImportedLogs(prev, incoming));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hcWeightStamp]);

  // A day's steps are the highest of what you added and what the chosen source counted, unless you set or deleted that day.
  const mergedSteps = useMemo(() => {
    const out: Record<string, number> = { ...stepsLog };
    for (const [day, n] of Object.entries(automation.autoSteps)) out[day] = Math.max(out[day] ?? 0, n);
    for (const [day, n] of Object.entries(automation.stepOverrides)) out[day] = n;
    return out;
  }, [stepsLog, automation.autoSteps, automation.stepOverrides]);

  // Today's readiness: last night's sleep, HRV and resting heart rate against your usual, and your recent training load.
  const fitnessDays = useMemo(
    () =>
      buildFitnessDays({
        days: 120,
        today: todayKey(),
        steps: mergedSteps,
        hcDaily: automation.vitals?.daily ?? {},
        hcFitness: automation.vitals?.fitness ?? {},
        own: automation.own,
        workouts,
      }),
    [mergedSteps, automation.vitals, automation.own, workouts]
  );
  // The numbers behind the history sheets that the health tiles on Today open.
  const metricInput = useMemo(
    () => ({
      days: fitnessDays,
      // Weigh-ins from this app plus the ones Health Connect holds (a smart scale), one per day.
      body: [
        ...(automation.vitals?.weights ?? []).filter((w) => !w.own).map((w) => ({ date: toDateKey(w.time), weightKg: w.kg })),
        ...body.map((b) => ({ date: b.date, weightKg: b.weightKg })),
      ],
      food: food.map((f) => ({ date: f.date, calories: f.calories })),
      water: water.map((w) => ({ date: w.date, ml: w.ml })),
    }),
    [fitnessDays, automation.vitals, body, food, water]
  );
  const readinessToday = useMemo(() => {
    const today = todayKey();
    return readiness({ sleepLogs, days: fitnessDays, load: trainingLoadStatus(workouts, today), today });
  }, [fitnessDays, workouts, sleepLogs]);

  // The last three mornings, so the week's plan is adjusted on a trend and not one bad night.
  const readinessRecent = useMemo(
    () => recentReadiness({ sleepLogs, days: fitnessDays, loadFor: (d) => trainingLoadStatus(workouts, d) }, todayKey(), 3),
    [fitnessDays, workouts, sleepLogs]
  );

  // Patterns in your own data (see lib/insights): worked out on the phone from what is already stored.
  const insightInput = useMemo(() => ({ today: todayKey(), workouts, sleepLogs, days: fitnessDays, fasts: fastingSessions }), [workouts, sleepLogs, fitnessDays, fastingSessions]);
  const insights = useMemo(() => buildInsights(insightInput), [insightInput]);
  const insightData = useMemo(() => insightReadiness(insightInput), [insightInput]);
  const handleSetMonthlyGoal = (monthly: MonthlyGoal | null) => setGoals((g) => ({ ...g, monthly }));

  // Dynamic Dashboard Metric Visibility (The Tab Editor State)
  const [enabledMetricList, setEnabledMetricList] = usePersistentState<MetricKey[]>('enabled_metrics', () =>
    METRIC_CONFIGS.filter((m) => m.defaultVisible).map((m) => m.id)
  );
  const enabledMetrics = useMemo(() => new Set<MetricKey>(enabledMetricList), [enabledMetricList]);

  // Heart rate: live from the Pixel Watch (Wear OS Data Layer) first, then any Bluetooth LE sensor.
  // With neither connected there is no reading (0), never a made-up number.
  const watch = useWatchHeartRate();
  const ble = useBleHeartRate();
  const bleBpm = ble.status === 'connected' ? ble.bpm : null;
  const sensorBpm = watch.bpm ?? bleBpm;
  const hrFromSensor = sensorBpm !== null;
  const liveBpm = sensorBpm ?? 0;
  const hrSource: 'watch' | 'ble' | null = watch.bpm !== null ? 'watch' : bleBpm !== null ? 'ble' : null;

  // Modals for profile/data
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  useReminders({ settings: reminders, water, goals, fastingSessions });

  // Modals
  const [isTabEditorOpen, setIsTabEditorOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  const handleToggleMetric = (key: MetricKey) => {
    setEnabledMetricList((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleResetMetrics = () => {
    setEnabledMetricList(METRIC_CONFIGS.filter((m) => m.defaultVisible).map((m) => m.id));
  };

  // Saves workouts to Health Connect and remembers the ones that really went through, so only the rest are offered later.
  const sendWorkoutsToHc = async (list: WorkoutSession[]): Promise<number> => {
    const sent = new Set<string>();
    for (const w of list) if (await writeWorkoutToHc(w)) sent.add(w.id);
    if (sent.size > 0) setWorkouts((prev) => markSynced(prev, sent));
    return sent.size;
  };
  // Timer callbacks (the watch import) need the newest version of the function above.
  const sendWorkoutsToHcRef = useRef(sendWorkoutsToHc);
  sendWorkoutsToHcRef.current = sendWorkoutsToHc;
  const waitingForHc = useMemo(() => unsyncedWorkouts(workouts, Date.now()).length, [workouts]);
  const handleSendUnsynced = () => sendWorkoutsToHc(unsyncedWorkouts(workoutsRef.current, Date.now()));

  const handleAddWorkout = (workout: WorkoutSession) => {
    setWorkouts((prev) => [workout, ...prev]);
    announce(afterWorkout(workout, workouts, goals, todayKey()));
    void sendWorkoutsToHc([workout]);
    // Strava, when connected and set to send every workout automatically.
    if (getAutoUpload() && isStravaConnected() && !workout.isManualEntry) void uploadWorkout(workout);
  };

  const handleUpdateWorkout = (updated: WorkoutSession) => {
    setWorkouts((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  };

  const handleDeleteWorkout = (id: string) => {
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
    void deleteWorkoutFromHc(id);
  };

  const handleSaveProfile = (p: UserProfile, g: Goals) => {
    setProfile(p);
    setGoals(g);
    setIsProfileOpen(false);
  };

  /** Sleep log changes made on the Sleep screen are mirrored into Health Connect (imported nights are skipped). */
  const setSleepLogsSynced: typeof setSleepLogs = (action) => {
    setSleepLogs((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      const had = new Set(prev.map((l) => l.id));
      const has = new Set(next.map((l) => l.id));
      queueMicrotask(() => {
        // Nights the phone detected or the app estimated from the watch are not written to Health Connect, and stay deleted once removed.
        const own = (l: SleepLogEntry) => l.source === 'sleep-api' || l.source === 'sensors' || l.source === 'import';
        next.filter((l) => !had.has(l.id) && !own(l)).forEach((l) => void writeSleepToHc(l));
        prev.filter((l) => !has.has(l.id) && own(l)).forEach((l) => dismissSleepId(l.id));
        prev.filter((l) => !has.has(l.id) && l.source !== 'health-connect' && !own(l)).forEach((l) => void deleteFromHc('sleep', [l.id]));
      });
      return next;
    });
  };

  const handleAddBody = (entry: Omit<BodyEntry, 'id'>) => {
    const latestDate = body.reduce((m, b) => (b.date > m ? b.date : m), '');
    // Keep the profile weight (used for calorie math) in sync with the newest entry.
    if (entry.date >= latestDate) setProfile((p) => ({ ...p, weightKg: entry.weightKg }));
    const saved: BodyEntry = { ...entry, id: makeId('b') };
    setBody((prev) => [...prev, saved]);
    void writeBodyToHc(saved);
  };
  const handleDeleteBody = (id: string) => {
    setBody((prev) => prev.filter((b) => b.id !== id));
    void deleteFromHc('weight', [id]);
    void deleteFromHc('bodyFat', [`${id}-fat`]);
  };

  const handleSaveRoutine = (name: string, exerciseIds: string[]) =>
    setRoutines((prev) => [...prev, { id: makeId('r'), name, exerciseIds }]);
  const handleDeleteRoutine = (id: string) => setRoutines((prev) => prev.filter((r) => r.id !== id));
  // keepStart: changing the plan you are already on (editing it) keeps the week you are in instead of starting over.
  const handleActivatePlan = (planId: string | null, plan?: WorkoutPlan, opts?: { keepStart?: boolean }) =>
    setActivePlan((prev) => (planId ? { planId, startedAt: opts?.keepStart && prev ? prev.startedAt : Date.now(), plan } : null));

  const todaySteps = mergedSteps[todayKey()] || 0;
  const handleSetSteps = (n: number) => setStepsLog((prev) => ({ ...prev, [todayKey()]: n }));
  // Correct (a number) or delete (0) a day's steps, or return it to the automatic count (null). Also clears an older typed value for that day.
  const handleSetDaySteps = (date: string, n: number | null) => {
    automation.setDaySteps(date, n);
    setStepsLog((prev) => {
      if (!(date in prev)) return prev;
      const { [date]: _gone, ...rest } = prev;
      return rest;
    });
  };
  const stepsAutomation = { ...automation, setDaySteps: handleSetDaySteps };
  const handleSetStepGoal = (n: number) => setGoals((g) => ({ ...g, dailySteps: n }));

  // Wipes every kyfit_/aegis_ key and reloads, which returns the app to first-run onboarding.
  const handleResetAllData = () => {
    clearAppData(localStorage);
    clearSecrets(localStorage);
    // Progress photos are kept in IndexedDB rather than localStorage, so they need their own wipe.
    void wipePhotos().then(() => window.location.reload());
  };

  const isExerciseTab = currentTab === 'exercise';

  // What widgets and notifications ask for, and workouts that arrive from the watch. See hooks/useWatchAndWidgetInput.
  useWidgetLaunchActions({ setCurrentTab, setLaunchRequest, setFastingSessions });
  useWatchWorkoutImport({ profile, workoutsRef, setWorkouts, sendToHcRef: sendWorkoutsToHcRef });

  // Today's three quests (steps goal, water goal, a workout), drawn as a ring on the Home tab.
  const waterTodayMl = water.filter((w) => w.date === todayKey()).reduce((sum, w) => sum + w.ml, 0);
  const quests = dayProgress({
    steps: todaySteps,
    stepGoal: goals.dailySteps,
    waterMl: waterTodayMl,
    waterGoalMl: goals.dailyWaterMl,
    workoutDone: workoutsOnDay(workouts, todayKey()).length > 0,
  });

  // Widgets, the fasting notification, the watch's tile and complications, and water added there. See hooks/useNativeSync.
  useNativeSync({
    workouts,
    goals,
    profile,
    todaySteps,
    readiness: readinessToday,
    fastingSessions,
    reminders,
    water,
    onAddWater: handleAddWater,
  });

  // Render the phone's active screen
  const renderScreen = () => {
    switch (currentTab) {
      case 'today':
        return (
          <TodayScreen
            enabledMetrics={enabledMetrics}
            onOpenTabEditor={() => setIsTabEditorOpen(true)}
            onNavigateToTab={setCurrentTab}
            onOpenMap={() => setMapOpen(true)}
            liveBpm={liveBpm}
            hrFromSensor={hrFromSensor}
            hrSource={hrSource}
            theme={theme}
            workouts={workouts}
            onAddWorkout={handleAddWorkout}
            profile={profile}
            goals={goals}
            onSetStepGoal={handleSetStepGoal}
            sleepLogs={sleepLogs}
            steps={todaySteps}
            onSetSteps={handleSetSteps}
            stepsAdjusted={todayKey() in automation.stepOverrides}
            onEditSteps={(n) => handleSetDaySteps(todayKey(), n)}
            onResetSteps={() => handleSetDaySteps(todayKey(), null)}
            stepPeriods={<StepPeriods theme={theme} automation={automation} />}
            metricInput={metricInput}
            food={food}
            water={water}
            activePlan={activePlan}
            vitals={automation.vitals}
            weather={weather}
            readiness={readinessToday}
            readinessRecent={readinessRecent}
            topInsight={insights[0] ?? null}
            onOpenInsights={() => {
              setProgressStart('insights');
              setCurrentTab('progress');
            }}
            onSetMonthlyGoal={handleSetMonthlyGoal}
            cycleOn={prefs.cycleTracking && profile.sex === 'female'}
            onTurnOffCycle={() => setPrefs({ cycleTracking: false })}
            cycleStarts={cycleStarts}
            onLogPeriod={(d) => setCycleStarts((prev) => cleanStarts([...prev, d]))}
            onRemovePeriod={(d) => setCycleStarts((prev) => prev.filter((x) => x !== d))}
            backupNudge={
              !isAndroidApp() || !backup.status
                ? null
                : !backup.status.folder
                  ? { kind: 'none', onFix: () => setCurrentTab('settings') }
                  : Date.now() - backup.status.lastBackupAt > 7 * 24 * 3600 * 1000
                    ? { kind: 'stale', days: Math.floor((Date.now() - backup.status.lastBackupAt) / (24 * 3600 * 1000)), onFix: () => void backup.backupNow() }
                    : null
            }
          />
        );
      case 'nutrition':
      case 'fasting':
      case 'sleep':
      case 'healthlog': {
        // One Health hub: food & water, fasting and sleep behind a single switcher.
        const segment: NutritionSegment = currentTab === 'fasting' ? 'fasting' : 'food';
        return (
          <div className="space-y-4 max-w-lg mx-auto">
            <div className="px-1 pt-1">
              <p className="gh-eyebrow">Health</p>
              <h1 className="mt-1.5">
                {currentTab === 'sleep' ? 'Sleep' : currentTab === 'fasting' ? 'Fasting' : currentTab === 'healthlog' ? 'Health log' : 'Fuel'}
              </h1>
            </div>
            <Segmented<'nutrition' | 'fasting' | 'sleep' | 'healthlog'>
              ariaLabel="Health sections"
              theme={theme}
              value={currentTab as 'nutrition' | 'fasting' | 'sleep' | 'healthlog'}
              onChange={(id) => setCurrentTab(id)}
              options={[
                { id: 'nutrition', label: 'Food & water' },
                { id: 'fasting', label: 'Fasting' },
                { id: 'sleep', label: 'Sleep' },
                { id: 'healthlog', label: 'Log' },
              ]}
            />
            {currentTab === 'healthlog' ? (
              <HealthLogScreen theme={theme} entries={healthLog} onAdd={handleAddHealthLog} onDelete={handleDeleteHealthLog} />
            ) : currentTab === 'sleep' ? (
              <SleepScreen theme={theme} sleepLogs={sleepLogs} setSleepLogs={setSleepLogsSynced} hideHeader />
            ) : (
              <NutritionScreen
                hideHeader
                openPlanToken={mealPlanToken}
                onPlanOpened={() => setMealPlanToken(0)}
                savedMeals={savedMeals}
                onSaveMeal={handleSaveMeal}
                onDeleteMeal={handleDeleteMeal}
                theme={theme}
                profile={profile}
                goals={goals}
                food={food}
                water={water}
                workouts={workouts}
                segment={segment}
                onSegmentChange={(s) => setCurrentTab(s === 'fasting' ? 'fasting' : 'nutrition')}
                onAddFood={handleAddFood}
                onDeleteFood={handleDeleteFood}
                onAddWater={handleAddWater}
                onDeleteWater={handleDeleteWater}
                fastingSlot={<FastingScreen theme={theme} sessions={fastingSessions} setSessions={setFastingSessions} hideHeader />}
              />
            )}
          </div>
        );
      }
      case 'progress':
      case 'health':
        return (
          <ProgressScreen
            key={currentTab + progressStart}
            fasts={fastingSessions}
            activePlan={activePlan}
            initialSegment={progressSectionFor(currentTab, progressStart)}
            insightsSlot={<InsightsPanel theme={theme} insights={insights} data={insightData} />}
            theme={theme}
            profile={profile}
            goals={goals}
            workouts={workouts}
            sleepLogs={sleepLogs}
            stepsLog={mergedSteps}
            food={food}
            water={water}
            body={body}
            onAddBody={handleAddBody}
            onDeleteBody={handleDeleteBody}
            fitnessSlot={
              <FitnessMetricsScreen
                theme={theme}
                goals={goals}
                profile={profile}
                steps={mergedSteps}
                vitals={automation.vitals}
                own={automation.own}
                workouts={workouts}
                hcConnected={!!automation.hc?.available && !!automation.hc?.canRead}
              />
            }
            healthSlot={
              <HealthScreen
                liveBpm={liveBpm}
                hrSource={hrSource}
                watch={watch}
                theme={theme}
                profile={profile}
                workouts={workouts}
                vitals={automation.vitals}
                onOpenSettings={() => setCurrentTab('settings')}
              />
            }
          />
        );
      case 'settings':
        return (
          <SettingsScreen
            showCycle={profile.sex === 'female'}
            ble={ble}
            watch={watch}
            automation={stepsAutomation}
            onOpenMap={() => setMapOpen(true)}
            hcWaiting={waitingForHc}
            onSendUnsynced={handleSendUnsynced}
            backup={backup}
            runOptions={runOptions}
            onRunOptionsChange={setRunOptions}
            themeMode={themeMode}
            onThemeModeChange={setThemeMode}
            profileName={profile.name}
            onOpenProfile={() => setIsProfileOpen(true)}
            onOpenReminders={() => setIsRemindersOpen(true)}
            onOpenBackup={() => setIsBackupOpen(true)}
            onOpenImport={() => setIsImportOpen(true)}
            theme={theme}
            isTopBannerVisible={isTopBannerVisible}
            onToggleTopBanner={toggleTopBanner}
            onOpenTabEditor={() => setIsTabEditorOpen(true)}
            onOpenThemeModal={() => setIsThemeModalOpen(true)}
            lookSummary={`${look.backdrop.name} background`}
            onResetAllData={handleResetAllData}
            workouts={workouts}
            units={profile.units}
          />
        );
      default:
        return null;
    }
  };

  return (
    <PrefsContext.Provider value={{ prefs, setPrefs }}>
      {confirmExit && (
        <div role="alertdialog" aria-label="Close app" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-8">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#111] p-6 text-center">
            <h2 className="text-xl font-extrabold italic text-white">Close Minimal Fitness?</h2>
            <p className="mt-2 text-sm text-gray-400">A workout in progress keeps recording in the background.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmExit(false)} className="flex-1 rounded-2xl bg-white/10 py-3 font-bold text-white">Stay</button>
              <button onClick={() => { void CapApp.exitApp(); }} className="flex-1 rounded-2xl bg-[#cbff00] py-3 font-extrabold text-black">Close</button>
            </div>
          </div>
        </div>
      )}
    <div className="h-dvh text-white flex flex-col font-sans">
      <AppLockGate enabled={prefs.appLock} hideInRecents={prefs.hideInRecents} />
      <AuroraGlow mode={prefs.reduceMotion ? 'off' : prefs.glow} burstKey={glowKey} still={prefs.liquidGlass} />
      <RewardsHost workouts={workouts} fasts={fastingSessions} goals={goals} enabled={profile.onboarded} />

      {/* Top Application Bar (hidden by default for a clean mobile screen; toggleable from Settings) */}
      {isTopBannerVisible && (
        <AmoledTopBar
          watch={watch}
          theme={theme}
          currentTab={currentTab}
          onNavigateToSettings={() =>
            setCurrentTab((prev) => (prev === 'settings' ? 'today' : 'settings'))
          }
          onClose={toggleTopBanner}
        />
      )}

      <StorageNotice
        onOpenBackup={() => {
          setCurrentTab('settings');
          // Settings has to be on screen before the group can be asked to open.
          window.setTimeout(() => window.dispatchEvent(new CustomEvent('kyfit-open-settings-group', { detail: 'data' })), 200);
        }}
      />

      {/* Main View Area */}
      <main className="relative z-[1] flex-1 min-h-0 flex overflow-hidden">
        <div
          ref={scrollRef}
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
          className="flex-1 flex flex-col items-center justify-start overflow-y-auto no-scrollbar touch-pan-y"
        >
          {/* Phone container - seamless full-width on mobile with max-w-md on desktop */}
          <div className="w-full max-w-md min-h-full flex flex-col relative sm:border-x sm:border-white/5">
            {/* Screen Body (re-keyed per tab so each screen eases in) */}
            <div
              key={currentTab}
              hidden={isExerciseTab}
              className={`flex-1 px-4 screen-top pb-4 ${slideDir ? `animate-slide-${slideDir}` : 'animate-rise'}`}
            >
              {renderScreen()}
            </div>

            {/* Stays mounted so a live workout (timer, GPS, watch sync) survives switching tabs. */}
            <div hidden={!isExerciseTab} className="flex-1 px-4 screen-top pb-4">
              <FitnessScreen
                workouts={workouts}
                onAddWorkout={handleAddWorkout}
                onDeleteWorkout={handleDeleteWorkout}
                onUpdateWorkout={handleUpdateWorkout}
                runOptions={runOptions}
                launchRequest={launchRequest}
                liveBpm={liveBpm}
                hrFromSensor={hrFromSensor}
                watchKcal={watch.kcal}
                theme={theme}
                profile={profile}
                activePlan={activePlan}
                routines={routines}
                onActivatePlan={handleActivatePlan}
                onSaveRoutine={handleSaveRoutine}
                onDeleteRoutine={handleDeleteRoutine}
                onAddSteps={(n) => handleSetSteps(todaySteps + n)}
                shoes={shoes}
                onShoesChange={setShoes}
                openRunView={runOpen}
                weather={weather}
                savedRoutes={savedRoutes}
                onSaveRoute={(r) => setSavedRoutes((prev) => upsertRoute(prev, r))}
                onDeleteRoute={(id) => setSavedRoutes((prev) => prev.filter((r) => r.id !== id))}
              />
            </div>

          </div>
        </div>
      </main>

      {/* Bottom Navigation Bar: a fixed footer outside the scrolling area, so it never rises or falls as the page scrolls. */}
      <BottomNavBar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setSlideDir(null);
          setCurrentTab(tab);
        }}
        theme={theme}
        progress={quests}
      />

      {mapOpen && <AppMapScreen theme={theme} onGo={navigateTo} onClose={() => setMapOpen(false)} />}

      {/* Modals & Bottom Sheets */}
      <ThemeSelectorModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        currentThemeId={currentThemeId}
        onSelectTheme={handleSelectTheme}
        customThemes={customThemes}
        onSaveCustomTheme={handleSaveCustomTheme}
        onDeleteCustomTheme={handleDeleteCustomTheme}
        look={look}
      />

      <TabEditorModal
        isOpen={isTabEditorOpen}
        onClose={() => setIsTabEditorOpen(false)}
        enabledMetrics={enabledMetrics}
        onToggleMetric={handleToggleMetric}
        onResetDefaults={handleResetMetrics}
        theme={theme}
      />

      {!profile.onboarded && (
        <Onboarding
          theme={theme}
          look={look}
          onSelectTheme={handleSelectTheme}
          onDone={(p, g, startTab) => {
            setProfile(p);
            setGoals(g);
            setCurrentTab(startTab);
          }}
        />
      )}

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        profile={profile}
        goals={goals}
        isOnboarding={false}
        onSave={handleSaveProfile}
        theme={theme}
      />

      <RemindersModal
        isOpen={isRemindersOpen}
        onClose={() => setIsRemindersOpen(false)}
        theme={theme}
        settings={reminders}
        onChange={setReminders}
      />

      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        theme={theme}
        workouts={workouts}
      />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        theme={theme}
        profile={profile}
        workouts={workouts}
        sleepLogs={sleepLogs}
        onApply={(newWorkouts, nights) => {
          // Imported history joins the log quietly: it is not pushed into Health Connect, and the night merge never replaces a night you already have.
          setWorkouts((prev) => mergeImportedWorkouts(prev, newWorkouts).merged);
          setSleepLogs((prev) => mergeImportedNights(prev, nights).merged);
        }}
      />
    </div>
    </PrefsContext.Provider>
  );
}


