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
  RoutineSet,
  HealthLogEntry,
  WorkoutPlan,
  RunOptions,
  UserProfile,
  Exercise,
  ExerciseLog,
} from './types/tracking';
import { setCustomExercises } from './data/exercises';
import { setOneRepMaxFormula } from './lib/oneRepMax';
import { DEFAULT_GOALS, DEFAULT_PROFILE, DEFAULT_REMINDERS } from './data/defaults';
import { readStored, usePersistentState } from './hooks/usePersistentState';
import { useBleHeartRate } from './hooks/useBleHeartRate';
import { useWatchHeartRate } from './hooks/useWatchHeartRate';
import { useAutomaticData } from './hooks/useAutomaticData';
import { useAutoBackup } from './hooks/useAutoBackup';
import { LiftSession, isAndroidApp } from './lib/native';
import { ProgramState, completeSession, getProgram } from './lib/programs';
import { dayIndex, reminderPlan, routinesForDay } from './lib/liftSchedule';
import { workoutsPerWeek } from './lib/lifting';
import { LocalNotifications } from '@capacitor/local-notifications';
import { notify, syncFastElectrolytes, syncBreatheReminder, syncCoachNotes, syncFastPlanReminders, syncLiftReminders, syncStreakSaver, syncWindDown } from './lib/notifications';
import { SleepPrefs, normalizeSleepPrefs, windDownAt } from './lib/sleepPlan';
import { EatPrefs, normalizeEatPrefs } from './eat/state';
import { dayGoal, eatSummary, isTrainingDay } from './eat/model';
import { electrolyteNotices, lowDayKcal } from './fasting/model';
import { BreatheReminder, DEFAULT_REMINDER } from './lib/breatheReminder';
import { workoutsCodec } from './lib/storageCodec';
import { StorageNotice } from './components/StorageNotice';
import { AppMapScreen } from './components/AppMapScreen';
import { useAppNavigation } from './hooks/useAppNavigation';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { PullIndicator } from './components/PullIndicator';
import { useNativeSync } from './hooks/useNativeSync';
import { useNutritionLog } from './hooks/useNutritionLog';
import { makeId } from './lib/ids';
import { loadDraft } from './lib/liftDraft';
import { useWatchWorkoutImport, useWidgetLaunchActions } from './hooks/useWatchAndWidgetInput';
import { progressSectionFor } from './lib/appMap';
import { App as CapApp } from '@capacitor/app';
import { RewardsHost } from './components/RewardsHost';
import { wipePhotos } from './lib/photoStore';
import { afterWorkout } from './lib/rewards';
import { announce } from './lib/rewardsBus';
import { watchSystemInsets } from './lib/systemInsets';
import { currentStreak, pickRestingHr, setFrozenDays, setZoneConfig, workoutDateKeys, workoutsOnDay } from './lib/calc';
import { addFreeze } from './lib/streakFreeze';
import { dayProgress } from './lib/dayProgress';
import { clearAppData, clearSecrets } from './lib/backup';
import { useReminders } from './hooks/useReminders';
import { setWeekStartsOnSunday, toDateKey, todayKey } from './lib/dates';
import { AppPrefs, PrefsContext, readPrefs, sanitizePrefs, writePrefs } from './lib/prefs';
import { ProgressScreen } from './components/ProgressScreen';
import { FitnessMetricsScreen } from './components/FitnessMetricsScreen';
import { ProfileModal } from './components/ProfileModal';
import { RemindersModal } from './components/RemindersModal';
import { BackupModal } from './components/BackupModal';
import { ImportModal } from './components/ImportModal';
import { AppLockGate } from './components/AppLockGate';
import { SavedRoute, upsertRoute } from './lib/savedRoutes';
import { mergeImportedNights, mergeImportedWorkouts } from './lib/importers/merge';
import { hcWorkoutToSession } from './lib/hcWorkouts';
import { syncAutoDetect } from './lib/autoDetect';
import { useDriveSteps } from './hooks/useDriveSteps';
import { useAppearance } from './hooks/useAppearance';
import { Onboarding } from './components/Onboarding';
import { PrivacyWelcome } from './components/PrivacyWelcome';
import { installTapHaptics } from './lib/haptics';
import { setCardSkin, skinFrom } from './lib/cardSkin';
import { sendWatchLook } from './lib/watchLook';
import { buildWatchLook } from './lib/appearance';
import { AmoledTopBar } from './components/AmoledTopBar';
import { GalaxyBackground } from './components/scenes/GalaxyBackground';
import { BottomNavBar } from './components/BottomNavBar';
import { DEFAULT_LAYOUT, DashboardLayout, sanitizeLayout, withTodayFirst } from './lib/dashboardLayout';
import { focusSetting } from './lib/focusSetting';
import { TodayScreen } from './components/TodayScreen';
import { DriveSteps } from './components/DriveSteps';
import { FitnessScreen } from './components/FitnessScreen';
import { SleepScreen } from './components/SleepScreen';
import { HealthScreen } from './components/HealthScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { HealthHub, HealthSection } from './components/HealthHub';
import { BreatheApp } from './breathe/BreatheApp';
import { FastingApp } from './fasting/FastingApp';
import { EatApp } from './eat/EatApp';
import { Tour } from './components/Tour';
import { useWatchFoodLog } from './hooks/useWatchFoodLog';
import { TourGo, shouldShowTour } from './lib/tour';
import { plannedTrainingToday } from './lib/planToday';
import { EatLauncher } from './eat/Launcher';
import { DEFAULT_PLAN, FastPlan } from './fasting/model';
import { FastQuick } from './components/FastQuick';
import { endFast, startFast } from './lib/fasting';
import { ensureNotificationPermission } from './lib/notifications';
import { LiftWorkout } from './lift/LiftWorkout';
import { LiftApp } from './lift/LiftApp';
import type { BreathSession } from './lib/breathing';
import { BreatheWatch } from './lib/native';
import { useLangFor, useTFor } from './lib/i18n';
import { TabEditorModal } from './components/TabEditorModal';
import { ThemeSelectorModal } from './components/ThemeSelectorModal';
import { Segmented } from './components/ui/Segmented';
import { gearAlerts, type GearNotified, type Shoe } from './lib/shoes';
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
  writeBreathingToHc,
  writeSleepToHc,
  writeWorkoutToHc,
  setHealthWriteEnabled,
  setHealthShare,
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
    document.documentElement.classList.remove('liquid-glass');
  }, [prefs.largeText, prefs.reduceMotion]);

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
    eatToken,
    setEatToken,
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
      // The Kinetic look (obsidian and orange): everyone moves to it once, and can pick another theme afterwards.
      if (!localStorage.getItem('kyfit_ui_v3')) {
        localStorage.setItem('kyfit_ui_v3', '1');
        localStorage.setItem('aegis_theme_id', 'kinetic');
        localStorage.setItem('kyfit_backdrop_dark', JSON.stringify('obsidian'));
        try {
          const raw = localStorage.getItem('kyfit_dashboard_layout');
          if (raw) localStorage.setItem('kyfit_dashboard_layout', JSON.stringify(withTodayFirst(sanitizeLayout(JSON.parse(raw)))));
        } catch {
          // a layout that cannot be read is replaced by the default anyway
        }
      }
      return localStorage.getItem('aegis_theme_id') || 'kinetic';
    } catch {
      return 'kinetic';
    }
  });

  const allThemes = { ...MODERN_THEMES, ...customThemes };
  const baseTheme = allThemes[currentThemeId] || MODERN_THEMES.volt;
  // Background (off-black, AMOLED, pastels, your own) + accent palette: sets the page's color variables and gives the screens their colors.
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
      handleSelectTheme('kinetic');
    }
  };

  // ---- Persisted user data (survives reloads; included in Backup & Export) ----
  const [profile, setProfile] = usePersistentState<UserProfile>('profile', DEFAULT_PROFILE);
  // The privacy welcome shows once, on the very first open (before the setup questions); Settings > Privacy can show it again.
  const [welcomeSeen, setWelcomeSeen] = usePersistentState<boolean>('privacy_welcome_seen', false);
  const [welcomeAgain, setWelcomeAgain] = useState(false);
  // The app tour shows once after the first setup (and once for someone who already had the app), and can be replayed from Settings.
  const [tourSeen, setTourSeen] = usePersistentState<boolean>('tour_seen', false);
  const [tourAsked, setTourAsked] = useState(false);
  useEffect(() => {
    const show = () => setTourAsked(true);
    window.addEventListener('kyfit-show-tour', show);
    return () => window.removeEventListener('kyfit-show-tour', show);
  }, []);
  useEffect(() => {
    const show = () => setWelcomeAgain(true);
    window.addEventListener('kyfit-show-privacy-welcome', show);
    return () => window.removeEventListener('kyfit-show-privacy-welcome', show);
  }, []);
  // Cycle tracking and the text-message live share were removed: delete what they kept (period dates, contact numbers), so nothing
  // sensitive is left behind on the phone.
  useEffect(() => {
    try {
      localStorage.removeItem('kyfit_cycle_starts');
      localStorage.removeItem('kyfit_live_share');
    } catch {
      // storage unavailable
    }
  }, []);
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
  // Days kept alive with a streak freeze. Set before anything below reads a streak, so every screen agrees.
  const [streakFreezes, setStreakFreezes] = usePersistentState<string[]>('streak_freezes', []);
  setFrozenDays(streakFreezes);
  const [fastingSessions, setFastingSessions] = usePersistentState<FastingSession[]>('fasting_sessions', []);
  // Food, water and saved meals, with adding and deleting. See hooks/useNutritionLog.
  const { food, water, savedMeals, addFood: handleAddFood, deleteFood: handleDeleteFood, updateFood: handleUpdateFood, addWater: handleAddWater, deleteWater: handleDeleteWater, saveMeal: handleSaveMeal, deleteMeal: handleDeleteMeal } =
    useNutritionLog();
  const [body, setBody] = usePersistentState<BodyEntry[]>('body', []);
  const [stepsLog, setStepsLog] = usePersistentState<Record<string, number>>('steps', {});
  const [routines, setRoutines] = usePersistentState<Routine[]>('routines', []);
  // Folder names for routines on the Lift side, in order (an empty folder is kept).
  const [routineFolders, setRoutineFolders] = usePersistentState<string[]>('routine_folders', []);
  const weather = useWeather();
  const [shoes, setShoes] = usePersistentState<Shoe[]>('shoes', []);
  const [savedRoutes, setSavedRoutes] = usePersistentState<SavedRoute[]>('saved_routes', []);
  const [healthLog, setHealthLog] = usePersistentState<HealthLogEntry[]>('health_log', []);
  const [breathLog, setBreathLog] = usePersistentState<BreathSession[]>('breathing_log', []);
  // Exercises you made yourself (and ones brought in from a Hevy or Strong file). The lookup in data/exercises reads them from here.
  const [customList, setCustomList] = usePersistentState<Exercise[]>('custom_exercises', []);
  setCustomExercises(customList);
  setOneRepMaxFormula(prefs.liftFormula);
  // The strength logger: one screen for the whole app, started from the Run tab, the watch, or the Lift side.
  const [strength, setStrength] = useState<{ open: boolean; ids: string[]; title?: string; logs?: ExerciseLog[]; fromWatch?: boolean; resume?: boolean; program?: { id: string; index: number } }>(() =>
    // A workout that was in progress when the app closed (or crashed) comes straight back.
    loadDraft(localStorage) ? { open: true, ids: [], resume: true } : { open: false, ids: [] }
  );
  const [strengthStopToken, setStrengthStopToken] = useState(0);
  // The Lift side: a plain weightlifting app inside this one. It opens over everything, and "Import" briefly steps out to the main side.
  const [liftOpen, setLiftOpen] = useState<boolean>(() => readPrefs().startInLift);
  // Breathe is an app of its own inside the app (src/breathe): it opens over everything from the Health tab.
  const [breatheOpen, setBreatheOpen] = useState(false);
  // Fasting is an app of its own inside the app too (src/fasting).
  const [fastingOpen, setFastingOpen] = useState(false);
  // Eating is an app of its own inside the app too (src/eat).
  const [eatOpen, setEatOpen] = useState(false);
  // Eat settings live here too: the widget, the tile and the watch show today's calories against the same goal Eat uses.
  const [eatPrefsRaw, setEatPrefsRaw] = usePersistentState<Partial<EatPrefs>>('eat_prefs', {});
  // Sleep goal and the wind-down nudge: kept here so the nudge is scheduled even when the Sleep screen is closed.
  const [sleepPrefsRaw, setSleepPrefsRaw] = usePersistentState<Partial<SleepPrefs>>('sleep_prefs', {});
  const sleepPrefs = useMemo(() => normalizeSleepPrefs(sleepPrefsRaw), [sleepPrefsRaw]);
  const windAt = windDownAt(sleepPrefs.windDown.bed, sleepPrefs.windDown.lead);
  useEffect(() => {
    void syncWindDown(sleepPrefs.windDown.on && profile.onboarded, windAt.hour, windAt.minute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepPrefs.windDown.on, windAt.hour, windAt.minute, profile.onboarded]);
  const [eatStart, setEatStart] = useState<{ tab?: 'today' | 'plan' | 'cook' | 'insights' | 'you'; add?: 'search' | 'scan' | 'recipe' | 'import' | 'create' | 'photo'; nonce: number } | null>(null);
  const openEat = (start?: { tab?: 'today' | 'plan' | 'cook' | 'insights' | 'you'; add?: 'search' | 'scan' | 'recipe' | 'import' | 'create' | 'photo' }) => {
    setEatStart(start ? { ...start, nonce: Date.now() } : null);
    setEatOpen(true);
  };
  const [fastingLaunch, setFastingLaunch] = useState<{ action: string; nonce: number } | null>(null);
  const [fastPlan, setFastPlan] = usePersistentState<FastPlan>('fasting_plan', DEFAULT_PLAN);
  useEffect(() => {
    if (currentTab === 'fasting') {
      setFastingOpen(true);
      setCurrentTab('nutrition');
    }
  }, [currentTab, setCurrentTab]);
  // The map's "Meal plan and groceries" opens the plan page of the Eat app.
  useEffect(() => {
    if (mealPlanToken > 0) {
      openEat({ tab: 'plan' });
      setMealPlanToken(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealPlanToken]);
  useEffect(() => {
    if (eatToken > 0) {
      openEat();
      setEatToken(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eatToken]);
  const [breatheLaunch, setBreatheLaunch] = useState<{ action: string; nonce: number } | null>(null);
  const [breatheReminder, setBreatheReminder] = usePersistentState<BreatheReminder>('breathe_reminder', DEFAULT_REMINDER);
  // Anything that sends you to the old Breathe tab (the map of the app, a shortcut) opens the Breathe app instead.
  useEffect(() => {
    if (currentTab === 'breathe') {
      setBreatheOpen(true);
      setCurrentTab('nutrition');
    }
  }, [currentTab, setCurrentTab]);
  const [returnToLift, setReturnToLift] = useState(false);
  // A workout already under way (even minimized) is brought back, never replaced by starting another.
  const [strengthResumeToken, setStrengthResumeToken] = useState(0);
  // The program you are following (Lift side): which one, how far along, and the weights it works from.
  const [program, setProgram] = usePersistentState<ProgramState | null>('lift_program', null);
  const startStrength = (ids: string[], opts?: { title?: string; logs?: ExerciseLog[]; fromWatch?: boolean; program?: { id: string; index: number } }) => {
    if (strength.open) setStrengthResumeToken((n) => n + 1);
    else setStrength({ open: true, ids, ...opts });
  };
  // App is the one that provides the preferences, so it reads the language from its own state.
  const t = useTFor(prefs.language);
  const lang = useLangFor(prefs.language);
  // Tell the page, and so screen readers and the browser engine, which language it is in.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const [dashboardRaw, setDashboardLayout] = usePersistentState<DashboardLayout>('dashboard_layout', DEFAULT_LAYOUT);
  const dashboardLayout = useMemo(() => sanitizeLayout(dashboardRaw), [dashboardRaw]);
  const [activePlan, setActivePlan] = usePersistentState<ActivePlan | null>('active_plan', null);
  const [reminders, setReminders] = usePersistentState<ReminderSettings>('reminders', DEFAULT_REMINDERS);

  const [runOptions, setRunOptions] = usePersistentState<RunOptions>('run_options', DEFAULT_RUN_OPTIONS);
  const [launchRequest, setLaunchRequest] = useState<{ type: WorkoutType; nonce: number } | null>(null);

  // Steps, sleep from the watch (Health Connect) and the daily folder backup
  // Workouts other apps saved to Health Connect (Google Health / Fitbit and others) join the list, without being written back or sent to Strava.
  const automation = useAutomaticData(profile.onboarded, setSleepLogs, (sessions) => {
    const converted = sessions.map((s) => hcWorkoutToSession(s, profile)).filter((w): w is WorkoutSession => w !== null);
    if (converted.length > 0) setWorkouts((prev) => mergeImportedWorkouts(prev, converted).merged);
  }, prefs.stepSource, prefs.useHealthConnect, prefs.sleepSource, prefs.sleepSecondary);
  // Pull down at the top of any screen to bring in the latest steps, sleep and watch data (the same as Sync in Settings).
  const pullState = usePullToRefresh(scrollRef, () => automation.syncNow());
  // The Health Connect master switch also guards every write and delete (see healthWrite).
  // Receiving is the default; saving anything back to Health Connect needs its own switch (Settings > Health Connect).
  setHealthWriteEnabled(prefs.useHealthConnect && prefs.writeHealthConnect);
  setHealthShare(prefs.hcShare);

  // "Looks like you started a run": the phone's own activity recognition offers to record (needs the physical-activity permission the step counter asks for).
  const stepsReady = automation.steps !== null;
  useEffect(() => {
    if (!profile.onboarded) return;
    void syncAutoDetect(prefs.detectWorkouts, prefs.detectWalks);
  }, [profile.onboarded, prefs.detectWorkouts, prefs.detectWalks, stepsReady]);
  // Steps counted while driving come off the day by themselves (the phone notices when you are in a vehicle).
  useDriveSteps(profile.onboarded && prefs.autoDriveSteps, automation);

  // Zones and training load use your real resting heart rate when Health Connect or the watch has one.
  useEffect(() => {
    const fit = automation.vitals?.fitness ?? {};
    const latestFit = Object.values(fit).filter((d) => d.restingHr).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.restingHr;
    const ownDays = Object.entries(automation.own).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    const latestOwn = ownDays.find(([, d]) => d.restingHr)?.[1].restingHr;
    setZoneConfig(prefs.zoneMethod, pickRestingHr(profile.restingHr, latestFit, automation.vitals?.restingBpm || undefined, latestOwn), profile.sex);
  }, [prefs.zoneMethod, profile.restingHr, profile.sex, automation.vitals, automation.own]);
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

  // Heart rate: live from the linked watch (Wear OS Data Layer) first, then any Bluetooth LE sensor.
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

  const handleSaveRoutine = (name: string, exerciseIds: string[], folder?: string, targets?: Record<string, RoutineSet[]>) =>
    setRoutines((prev) => [...prev, { id: makeId('r'), name, exerciseIds, ...(folder ? { folder } : {}), ...(targets ? { targets } : {}) }]);
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
  // The long-press shortcuts on the app icon: "Start empty workout" and your first routines.
  const liftShortcutRef = useRef<(action: string) => void>(() => {});
  liftShortcutRef.current = (action: string) => {
    if (action === 'lift:empty') startStrength([]);
    else if (action.startsWith('lift:routine:')) {
      const r = routines.find((x) => x.id === action.slice('lift:routine:'.length));
      if (r) startStrength(r.exerciseIds, { title: r.name });
    }
  };
  useWidgetLaunchActions({
    setCurrentTab,
    setLaunchRequest,
    setFastingSessions,
    onLiftAction: (a) => liftShortcutRef.current(a),
    onBreathe: (a) => {
      setBreatheOpen(true);
      setBreatheLaunch({ action: a, nonce: Date.now() });
    },
    onFasting: (a) => {
      setFastingOpen(true);
      setFastingLaunch({ action: a, nonce: Date.now() });
    },
    onEat: (a) => openEat(a === 'eat:add' ? { tab: 'today', add: 'search' } : a === 'eat:scan' ? { tab: 'today', add: 'scan' } : undefined),
  });
  // Breathing sessions done on the watch while the app was closed are added to the history now, and again whenever the app comes back.
  useEffect(() => {
    if (!isAndroidApp()) return undefined;
    const take = async () => {
      try {
        const { items } = await BreatheWatch.takePending();
        if (items.length === 0) return;
        setBreathLog((prev) => {
          const have = new Set(prev.map((s) => s.id));
          const add = items
            .map(([at, patternId, seconds, from, to]) => ({ id: `br-w-${at}`, at, patternId, seconds, bpmStart: from > 0 ? from : undefined, bpmEnd: from > 0 && to > 0 ? to : undefined }) as BreathSession)
            .filter((s) => !have.has(s.id));
          return add.length ? [...add, ...prev].sort((a, b) => b.at - a.at).slice(0, 500) : prev;
        });
      } catch {
        // the watch bridge is not there (a browser)
      }
    };
    void take();
    const onShow = () => {
      if (document.visibilityState === 'visible') void take();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);
  // The fasting plan's reminders: planned for the next week, and again whenever the plan changes or a fast starts or ends.
  const fastRunning = fastingSessions.some((s) => !s.isCompleted);
  useEffect(() => {
    void syncFastPlanReminders(fastPlan, fastRunning);
  }, [fastPlan, fastRunning]);
  // The daily breathing reminder: planned for the next week, and again whenever a session is saved or the setting changes.
  const lastBreathAt = breathLog.length > 0 ? Math.max(...breathLog.map((s) => s.at)) : null;
  useEffect(() => {
    void syncBreatheReminder(breatheReminder, lastBreathAt);
  }, [breatheReminder.on, breatheReminder.time, breatheReminder.nudge, lastBreathAt]);
  const scheduleKey = JSON.stringify([prefs.liftRemind, prefs.liftRemindTime, routines.map((r) => [r.name, r.days])]);
  useEffect(() => {
    void syncLiftReminders(prefs.liftRemind, prefs.liftRemindTime, reminderPlan(routines));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleKey]);
  // Shoes and bikes: a notification when one reaches 85 % of its distance and again at the full distance (once each).
  const [gearNotified, setGearNotified] = usePersistentState<GearNotified>('gear_alerts', {});
  useEffect(() => {
    const r = gearAlerts(shoes, workouts, gearNotified);
    if (r.alerts.length === 0 && JSON.stringify(r.notified) === JSON.stringify(gearNotified)) return;
    setGearNotified(r.notified);
    for (const a of r.alerts) void notify(a.title, a.body, 'gear');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shoes, workouts]);
  // The evening streak nudge: replaced whenever the streak changes or today's activity is logged.
  const streakDays = useMemo(() => workoutDateKeys(workouts), [workouts]);
  const streakNow = currentStreak(streakDays, todayKey());
  const streakDoneToday = streakDays.has(todayKey());
  useEffect(() => {
    void syncStreakSaver(reminders.streakEnabled === true, reminders.streakTime ?? '19:30', streakNow, streakDoneToday);
  }, [reminders.streakEnabled, reminders.streakTime, streakNow, streakDoneToday]);
  // The kind daily note and the weekly review: scheduled for the next two weeks, and topped up each time the app opens.
  const coachLang = useLangFor(prefs.language);
  const coachKey = JSON.stringify([prefs.coachDaily, prefs.coachDailyTime, prefs.coachWeekly, prefs.coachWeeklyDay, prefs.coachWeeklyTime, coachLang]);
  useEffect(() => {
    void syncCoachNotes({ dailyOn: prefs.coachDaily, dailyTime: prefs.coachDailyTime, weeklyOn: prefs.coachWeekly, weeklyDay: prefs.coachWeeklyDay, weeklyTime: prefs.coachWeeklyTime, lang: coachLang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachKey]);
  // Tapping the weekly review notification opens the review.
  useEffect(() => {
    if (!isAndroidApp()) return;
    let handle: { remove: () => Promise<void> } | undefined;
    LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      const tag = (e.notification.extra as { tag?: string } | undefined)?.tag;
      if (tag === 'coach-weekly') setCurrentTab('progress');
      // The wind-down nudge opens a few minutes of slow breathing.
      else if (tag === 'winddown') {
        setBreatheOpen(true);
        setBreatheLaunch({ action: 'drift', nonce: Date.now() });
      }
    })
      .then((h) => {
        handle = h;
      })
      .catch(() => {});
    return () => {
      void handle?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The Lift widget: this week's workouts and today's scheduled routine.
  const widgetWeek = workoutsPerWeek(workouts, Date.now(), 1)[0]?.count ?? 0;
  const todayRoutine = routinesForDay(routines, dayIndex(new Date()))[0];
  useEffect(() => {
    if (!isAndroidApp()) return;
    LiftSession.widget({ week: widgetWeek, todayId: todayRoutine?.id ?? '', todayName: todayRoutine?.name ?? '' }).catch(() => {});
  }, [widgetWeek, todayRoutine?.id, todayRoutine?.name]);
  const shortcutKey = routines.slice(0, 3).map((r) => r.id + r.name).join('|');
  useEffect(() => {
    if (!isAndroidApp()) return;
    LiftSession.setShortcuts({ emptyLabel: 'Start empty workout', routines: routines.slice(0, 3).map((r) => ({ id: r.id, name: r.name })) }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcutKey]);
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
  // Meals dictated on the watch are logged here (see hooks/useWatchFoodLog).
  useWatchFoodLog({ enabled: profile.onboarded, onAddFood: handleAddFood, onAddWater: handleAddWater });
  const eatNow = useMemo(() => {
    const ep = normalizeEatPrefs(eatPrefsRaw);
    const day = todayKey();
    const training = isTrainingDay(workouts, day, day, plannedTrainingToday(activePlan));
    return eatSummary({
      food,
      today: day,
      goalKcal: goals.dailyCalories,
      proteinGoal: goals.dailyProteinG,
      split: ep.split,
      training,
      burnedKcal: workoutsOnDay(workouts, day).reduce((s, w) => s + w.caloriesBurned, 0),
      activity: ep.activity,
      lowKcal: lowDayKcal(fastPlan, day),
    });
  }, [food, workouts, goals.dailyCalories, goals.dailyProteinG, eatPrefsRaw, activePlan, fastPlan]);

  // Water-and-salts reminders for a long fast that is running (set in Fasting > Insights).
  const [fastPrefsVersion, setFastPrefsVersion] = useState(0);
  useEffect(() => {
    const bump = () => setFastPrefsVersion((v) => v + 1);
    window.addEventListener('kyfit-fasting-prefs', bump);
    return () => window.removeEventListener('kyfit-fasting-prefs', bump);
  }, []);
  const runningFast = fastingSessions.find((s) => !s.isCompleted);
  const runningStart = runningFast?.startTimestamp ?? 0;
  const runningGoal = runningFast?.targetDurationHours ?? 0;
  useEffect(() => {
    const on = readStored<{ electrolytes?: boolean }>('fasting_prefs', {}).electrolytes !== false;
    void syncFastElectrolytes(runningFast && on ? electrolyteNotices(runningStart, runningGoal, Date.now()) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningStart, runningGoal, fastPrefsVersion]);
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
    onUndoWater: (count) => {
      // The newest drinks logged today, newest first (what the watch's tile took back while the app was closed).
      const today = todayKey();
      for (const w of water.filter((x) => x.date === today).slice(-count)) handleDeleteWater(w.id);
    },
    sleepLogs,
    accent: theme.primary,
    sleepGoalMin: sleepPrefs.goalMin,
    eat: eatNow,
  });

  // Render the phone's active screen
  const renderScreen = () => {
    switch (currentTab) {
      case 'today':
        return (
          <TodayScreen
            fasts={fastingSessions}
            frozenDays={streakFreezes}
            onOpenSport={(type) => {
              setCurrentTab('exercise');
              setLaunchRequest({ type, nonce: Date.now() });
            }}
            onPlanMove={(m) => setActivePlan((prev) => (prev ? { ...prev, moves: [...(prev.moves ?? []).filter((x) => !(x.week === m.week && (x.from === m.from || x.to === m.to))), m] } : prev))}
            onFreezeDay={(k) => setStreakFreezes((prev) => addFreeze(prev, k))}
            enabledMetrics={enabledMetrics}
            onOpenTabEditor={() => setIsTabEditorOpen(true)}
            onNavigateToTab={setCurrentTab}
            onOpenMap={() => setMapOpen(true)}
            onOpenLift={() => setLiftOpen(true)}
            liveBpm={liveBpm}
            hrFromSensor={hrFromSensor}
            hrSource={hrSource}
            watchName={watch.nodeName || undefined}
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
            stepPeriods={<DriveSteps theme={theme} automation={automation} android={isAndroidApp()} />}
            metricInput={metricInput}
            food={food}
            water={water}
            onAddWater={handleAddWater}
            onDeleteWater={handleDeleteWater}
            layout={dashboardLayout}
            onLayoutChange={setDashboardLayout}
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
            backupNudge={
              !isAndroidApp() || !backup.status
                ? null
                : !backup.status.folder
                  ? { kind: 'none', onFix: () => { setCurrentTab('settings'); focusSetting('data', 'drive-backup'); } }
                  : Date.now() - backup.status.lastBackupAt > 7 * 24 * 3600 * 1000
                    ? { kind: 'stale', days: Math.floor((Date.now() - backup.status.lastBackupAt) / (24 * 3600 * 1000)), onFix: () => void backup.backupNow() }
                    : null
            }
          />
        );
      case 'nutrition':
      case 'fasting':
      case 'sleep':
      case 'healthlog':
      case 'breathe': {
        // One Health hub: food & water, fasting and sleep behind a single switcher.
        return (
          <div className="space-y-4 max-w-lg mx-auto">
            <div className="px-1 pt-1">
              <p className="gh-eyebrow">{t('hub.eyebrow')}</p>
              <h1 className="mt-1.5">
                {currentTab === 'sleep' ? t('hub.title.sleep') : currentTab === 'fasting' ? t('hub.title.fasting') : currentTab === 'healthlog' ? t('hub.title.healthlog') : currentTab === 'breathe' ? t('hub.title.breathe') : t('hub.title.food')}
              </h1>
            </div>
            <HealthHub
              theme={theme}
              current={currentTab as HealthSection}
              onChange={(id) => (id === 'breathe' ? setBreatheOpen(true) : id === 'fasting' ? setFastingOpen(true) : id === 'nutrition' ? openEat() : setCurrentTab(id))}
              food={food}
              goals={goals}
              fasts={fastingSessions}
              sleepLogs={sleepLogs}
              healthLog={healthLog}
              breathLog={breathLog}
            />
            {currentTab !== 'fasting' && (
              <FastQuick
                theme={theme}
                sessions={fastingSessions}
                onStart={(opts) => {
                  void ensureNotificationPermission();
                  setFastingSessions((prev) => startFast(prev, opts));
                }}
                onEnd={() => setFastingSessions((prev) => endFast(prev))}
              />
            )}
            {currentTab === 'healthlog' ? (
              <HealthLogScreen theme={theme} units={profile.units} goals={goals} entries={healthLog} onAdd={handleAddHealthLog} onDelete={handleDeleteHealthLog} sleepLogs={sleepLogs} />
            ) : currentTab === 'sleep' ? (
              <SleepScreen theme={theme} sleepLogs={sleepLogs} setSleepLogs={setSleepLogsSynced} hideHeader sleepPrefs={sleepPrefs} onSleepPrefs={setSleepPrefsRaw} />
            ) : (
              <EatLauncher
                key={eatOpen ? 'open' : 'closed'}
                food={food}
                water={water}
                goals={goals}
                units={profile.units}
                name={profile.name}
                appAccent={theme.primary}
                onOpen={() => openEat()}
                onAdd={() => openEat({ tab: 'today', add: 'search' })}
                onWater={(ml) => handleAddWater(todayKey(), ml)}
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
            onSetGoals={(patch) => setGoals((g) => ({ ...g, ...patch }))}
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
            steps={mergedSteps}
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
              <button onClick={() => { void CapApp.exitApp(); }} className="flex-1 rounded-2xl bg-[#FF5500] py-3 font-extrabold text-black">Close</button>
            </div>
          </div>
        </div>
      )}
    <div className="h-dvh text-white flex flex-col font-sans">
      <AppLockGate enabled={prefs.appLock} hideInRecents={prefs.hideInRecents} />
      {baseTheme.scene === 'galaxy' && <GalaxyBackground still={prefs.reduceMotion} />}
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
          focusSetting('data', 'drive-backup');
        }}
      />

      {/* Main View Area */}
      <main className="relative z-[1] flex-1 min-h-0 flex overflow-hidden">
        <PullIndicator pull={pullState.pull} busy={pullState.busy} accent={theme.primary} />
        <div
          ref={scrollRef}
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
          className="flex-1 flex flex-col items-center justify-start overflow-y-auto no-scrollbar touch-pan-y"
        >
          {/* Phone container - seamless full-width on mobile with max-w-md on desktop */}
          <div className="w-full max-w-md min-[760px]:max-w-[1040px] min-h-full flex flex-col relative sm:border-x sm:border-white/5">
            {/* Screen Body (re-keyed per tab so each screen eases in) */}
            <div
              key={currentTab}
              hidden={isExerciseTab}
              className={`flex-1 px-4 screen-top pb-nav ${slideDir ? `animate-slide-${slideDir}` : 'animate-rise'}`}
            >
              {renderScreen()}
            </div>

            {/* Stays mounted so a live workout (timer, GPS, watch sync) survives switching tabs. */}
            <div hidden={!isExerciseTab} className="flex-1 px-4 screen-top pb-nav">
              <FitnessScreen
                strengthOpen={strength.open}
                onStartStrength={startStrength}
                onCloseStrength={() => setStrength((s) => ({ ...s, open: false }))}
                onOpenLift={() => setLiftOpen(true)}
                onStrengthStop={() => setStrengthStopToken((n) => n + 1)}
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
                program={program}
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

      {((!profile.onboarded && !welcomeSeen) || welcomeAgain) && (
        <PrivacyWelcome
          onDone={() => {
            setWelcomeSeen(true);
            setWelcomeAgain(false);
          }}
        />
      )}

      {shouldShowTour(profile.onboarded, tourSeen, tourAsked, (!profile.onboarded && !welcomeSeen) || welcomeAgain) && (
        <Tour
          onClose={() => {
            setTourSeen(true);
            setTourAsked(false);
          }}
          onAllowNotifications={ensureNotificationPermission}
          onGo={(to: TourGo) => {
            setTourSeen(true);
            setTourAsked(false);
            if (to === 'home') setCurrentTab('today');
            else if (to === 'run') setCurrentTab('exercise');
            else if (to === 'lift') setLiftOpen(true);
            else if (to === 'eat') openEat();
            else if (to === 'fasting') setFastingOpen(true);
            else if (to === 'breathe') setBreatheOpen(true);
            else if (to === 'sleep') setCurrentTab('sleep');
            else if (to === 'progress') setCurrentTab('progress');
            else if (to === 'look') navigateTo({ tab: 'settings', settings: 'look' });
            else if (to === 'privacy') navigateTo({ tab: 'settings', settings: 'privacy' });
          }}
        />
      )}

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

      {fastingOpen && (
        <FastingApp
          sessions={fastingSessions}
          setSessions={setFastingSessions}
          sleepLogs={sleepLogs}
          workouts={workouts}
          body={body}
          plan={fastPlan}
          onPlan={setFastPlan}
          onAddWater={(ml) => handleAddWater(todayKey(), ml)}
          onRemoveWater={(ml, at) => {
            const day = toDateKey(at);
            const match = [...water].reverse().find((w) => w.date === day && w.ml === ml);
            if (match) handleDeleteWater(match.id);
          }}
          units={profile.units}
          appAccent={theme.primary}
          food={food}
          onOpenEat={() => {
            setFastingOpen(false);
            openEat();
          }}
          onLogMeal={() => {
            setFastingOpen(false);
            openEat();
          }}
          launch={fastingLaunch}
          onExit={() => setFastingOpen(false)}
        />
      )}
      {eatOpen && (
        <EatApp
          theme={theme}
          profile={profile}
          goals={goals}
          food={food}
          water={water}
          savedMeals={savedMeals}
          workouts={workouts}
          body={body}
          fast={(() => {
            const f = fastingSessions.find((x) => !x.isCompleted && !x.endTimestamp);
            return f ? { startedAt: f.startTimestamp, targetHours: f.targetDurationHours } : null;
          })()}
          prefsRaw={eatPrefsRaw}
          onPrefsRaw={setEatPrefsRaw}
          fastPlan={fastPlan}
          fastsUsed={fastingSessions.length > 0}
          plannedTraining={plannedTrainingToday(activePlan)}
          onAddBody={handleAddBody}
          onEndFast={() => setFastingSessions((prev) => endFast(prev))}
          onAddFood={handleAddFood}
          onDeleteFood={handleDeleteFood}
          onUpdateFood={handleUpdateFood}
          onAddWater={handleAddWater}
          onDeleteWater={handleDeleteWater}
          onSaveMeal={handleSaveMeal}
          onDeleteMeal={handleDeleteMeal}
          onSetGoals={(patch) => setGoals((g) => ({ ...g, ...patch }))}
          openFasting={() => setFastingOpen(true)}
          start={eatStart}
          onExit={() => setEatOpen(false)}
        />
      )}
      {breatheOpen && (
        <BreatheApp
          log={breathLog}
          onAdd={(s) => {
            setBreathLog((prev) => [s, ...prev].slice(0, 500));
            void writeBreathingToHc(s);
          }}
          onUpdate={(s) => setBreathLog((prev) => prev.map((x) => (x.id === s.id ? s : x)))}
          onDelete={(id) => setBreathLog((prev) => prev.filter((x) => x.id !== id))}
          liveBpm={liveBpm}
          fitness={automation.vitals?.fitness}
          reminder={breatheReminder}
          onReminder={setBreatheReminder}
          launch={breatheLaunch}
          onExit={() => setBreatheOpen(false)}
        />
      )}
      {liftOpen && (
        <LiftApp
          profile={profile}
          workouts={workouts}
          routines={routines}
          folders={routineFolders}
          onFoldersChange={setRoutineFolders}
          onRoutinesChange={setRoutines}
          custom={customList}
          onCustomChange={setCustomList}
          onStart={(ids, opts) => startStrength(ids, opts)}
          body={body}
          onAddBody={handleAddBody}
          onDeleteBody={handleDeleteBody}
          program={program}
          onProgramChange={setProgram}
          onUpdateWorkout={handleUpdateWorkout}
          onDeleteWorkout={handleDeleteWorkout}
          onSaveRoutine={handleSaveRoutine}
          onOpenImport={() => {
            setLiftOpen(false);
            setReturnToLift(true);
            setIsImportOpen(true);
          }}
          onExit={() => setLiftOpen(false)}
        />
      )}

      <LiftWorkout
        isOpen={strength.open}
        onClose={() => setStrength((s) => ({ ...s, open: false }))}
        profile={profile}
        workouts={workouts}
        initialExerciseIds={strength.ids}
        initialLogs={strength.logs}
        planDayTitle={strength.title}
        liveBpm={liveBpm}
        hrFromSensor={hrFromSensor}
        watchKcal={watch.kcal}
        watchLaunch={!strength.fromWatch}
        remoteStopToken={strengthStopToken}
        resume={strength.resume}
        resumeToken={strengthResumeToken}
        programRef={strength.program}
        onSave={(s) => {
          handleAddWorkout(s);
          // Finishing the program's next workout moves the program on and updates its weights.
          const def = s.program && program ? getProgram(program.programId) : undefined;
          if (def && s.program && s.program.id === program!.programId && s.program.index === program!.done) setProgram(completeSession(def, program!, s, profile.units));
        }}
        onSaveRoutine={handleSaveRoutine}
        custom={customList}
        onCustomChange={setCustomList}
      />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => {
          setIsImportOpen(false);
          if (returnToLift) {
            setReturnToLift(false);
            setLiftOpen(true);
          }
        }}
        theme={theme}
        profile={profile}
        workouts={workouts}
        sleepLogs={sleepLogs}
        onApply={(newWorkouts, nights, newExercises) => {
          // Exercises from a Hevy or Strong file that the library did not have become your own.
          if (newExercises.length > 0) setCustomList((prev) => [...newExercises.filter((e) => !prev.some((p) => p.id === e.id)), ...prev].slice(0, 300));
          // Imported history joins the log quietly: it is not pushed into Health Connect, and the night merge never replaces a night you already have.
          setWorkouts((prev) => mergeImportedWorkouts(prev, newWorkouts).merged);
          setSleepLogs((prev) => mergeImportedNights(prev, nights).merged);
        }}
      />
    </div>
    </PrefsContext.Provider>
  );
}



