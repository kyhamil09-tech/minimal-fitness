import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NO_SAMPLES,
  StepSample,
  StepSamples,
  StepSource,
  StepWindow,
  StepsBySource,
  bucketsToSamples,
  migrateOldSteps,
  recordSource,
  resolveSteps,
  stepsInWindow,
  trimSamples,
  usesHealthConnect,
  usesPhone,
} from '../lib/steps';
import { todayKey } from '../lib/dates';
import { HealthConnect, HcFitnessDay, HcStatus, HcWorkout, Steps, StepsTotals, isAndroidApp } from '../lib/native';
import { applyVitalsToLogs, mergeImportedSleep, nightsNeedingVitals, sessionToLog } from '../lib/healthConnect';
import { resetHealthWriteCache } from '../lib/healthWrite';
import { isDismissedSleep, mergeDetectedSleep, readSleepSegments, segmentsToLogs, sleepDetectEnabled, startSleepDetect } from '../lib/sleepDetect';
import { usePersistentState, readStored, KEY_PREFIX } from './usePersistentState';
import { FIRST_DAYS, LATER_DAYS, PER_READ, SEEN_KEY } from '../lib/hcWorkouts';
import { readPrefs } from '../lib/prefs';
import { SleepLogEntry } from '../types/health';
import { syncOwnSensors } from '../lib/ownSensors';
import { mergeEstimatedSleep } from '../lib/sleepEstimate';
import type { OwnDay } from '../lib/fitnessMetrics';

const ASKED_KEY = 'kyfit_steps_asked';

/**
 * Health Connect calls take about two seconds each on a phone, so the full read (sleep, overnight readings, daily numbers)
 * runs at most this often. Tapping Sync, opening the app after a while, or granting access reads straight away.
 */
const HC_EVERY_MS = 10 * 60_000;

/** Vitals and daily totals read from Health Connect (what the watch and other apps recorded). */
export interface HcVitals {
  /** When this was last read. */
  at: number;
  /** 0 when unknown. */
  restingBpm: number;
  latestBpm: number;
  latestAt: number;
  avgBpm24h: number;
  daily: Record<string, { totalKcal: number; activeKcal: number; distanceKm: number; avgHr: number }>;
  weights: { id: string; time: number; kg: number; own: boolean }[];
  bodyFatPct: number;
  heightCm: number;
  /** Blood pressure and glucose other apps and devices saved (this app's own are left out). */
  bp: { id: string; time: number; systolic: number; diastolic: number }[];
  glucose: { id: string; time: number; mgdl: number }[];
  /** Heart-rate range, resting heart rate, floors, exercise minutes and HRV per day, up to 30 days. Older saves lack it. */
  fitness?: Record<string, HcFitnessDay>;
  /** VO2 max history (cardio fitness): [epoch ms, ml/kg/min]. Older saves lack it. */
  vo2?: [number, number][];
}

export interface AutomaticData {
  /** Steps per day from the chosen source (see Settings), with any day you corrected or deleted already applied. */
  autoSteps: Record<string, number>;
  /** Sets a day's steps by hand (0 deletes the day), or `null` to go back to the automatic count. */
  setDaySteps: (date: string, steps: number | null) => void;
  /** Days whose steps you set or deleted by hand. */
  stepOverrides: Record<string, number>;
  /** What each source counted for each day, before any correction. */
  stepsBySource: StepsBySource;
  /** Timed step counts (steps so far that day at a moment) the app has kept, for taking a period out. */
  stepSamples: StepSamples;
  /** Periods whose steps were taken out (a drive, say). */
  stepWindows: StepWindow[];
  /** Takes the steps counted between two times of a day out of every source. */
  addStepWindow: (date: string, fromMs: number, toMs: number) => void;
  removeStepWindow: (id: string) => void;
  steps: StepsTotals | null;
  hc: HcStatus | null;
  /** Heart rate, calories, distance and body measurements from Health Connect, or null before the first read. */
  vitals: HcVitals | null;
  hcError: string;
  hcLastSyncAt: number;
  hcNightsImported: number;
  /** Daily numbers the app's own watch and phone sensors measured. */
  own: Record<string, OwnDay>;
  /** What the watch has delivered on its own: when it last did, and how many heart-rate readings today (null before the first look). */
  watchData: { watchSyncAt: number; hrToday: number } | null;
  enableSteps: () => Promise<void>;
  /** Asks Health Connect for access: for the named features only, or everything when none are named. */
  connectHealthConnect: (groups?: string[]) => Promise<void>;
  syncNow: () => Promise<void>;
}

/**
 * Pulls steps and sleep in automatically:
 * - steps from the phone's step counter, a linked watch, and Health Connect (the highest wins);
 * - sleep sessions with measured stages from Health Connect, merged into the sleep log.
 * Everything is read on-device; nothing leaves the phone.
 */
export function useAutomaticData(
  active: boolean,
  setSleepLogs: Dispatch<SetStateAction<SleepLogEntry[]>>,
  /** Called with workouts other apps saved to Health Connect that have not been seen before (Google Health and others). */
  onHcWorkouts?: (sessions: HcWorkout[]) => void,
  /** Which source counts steps (Settings > Steps). The phone's counter and Health Connect are only read when chosen. */
  stepSource: StepSource = 'auto',
  /** The Health Connect master switch (Settings). Off: it is not read, and nothing asks for its permissions. */
  useHealthConnect = true,
  /** Which tracker's sleep to show when several saved the same night: 'auto' or a tracker's package name (Settings). */
  sleepSource = 'auto',
  /** Which tracker may fill in what the main one missed: 'auto' (any other), 'none', or a tracker's package name (Settings). */
  sleepSecondary = 'auto'
): AutomaticData {
  const sleepSourceRef = useRef({ main: sleepSource, second: sleepSecondary });
  sleepSourceRef.current = { main: sleepSource, second: sleepSecondary };
  const workoutsCb = useRef(onHcWorkouts);
  workoutsCb.current = onHcWorkouts;
  // Totals saved before sources were kept apart move across once, so past days keep their numbers.
  const [stepsBySource, setStepsBySource] = usePersistentState<StepsBySource>('steps_by_source', () =>
    migrateOldSteps(readStored<Record<string, number>>('auto_steps', {}), {}, todayKey())
  );
  const [stepOverrides, setStepOverrides] = usePersistentState<Record<string, number>>('steps_override', {});
  const [stepSamples, setStepSamples] = usePersistentState<StepSamples>('steps_samples', NO_SAMPLES);
  const [stepWindows, setStepWindows] = usePersistentState<StepWindow[]>('steps_windows', []);
  const autoSteps = useMemo(
    () => resolveSteps(stepsBySource, stepSource, stepOverrides, stepWindows),
    [stepsBySource, stepSource, stepOverrides, stepWindows]
  );
  const addStepWindow = useCallback(
    (date: string, fromMs: number, toMs: number) =>
      setStepWindows((prev) => [
        ...prev,
        {
          id: `sw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          date,
          fromMs: Math.min(fromMs, toMs),
          toMs: Math.max(fromMs, toMs),
          removed: stepsInWindow(stepSamples, date, fromMs, toMs),
        },
      ]),
    [setStepWindows, stepSamples]
  );
  const removeStepWindow = useCallback((id: string) => setStepWindows((prev) => prev.filter((w) => w.id !== id)), [setStepWindows]);
  // Samples that arrive after a period was added (the drive was still in progress) refine what it took out, for the last two days.
  useEffect(() => {
    const recent = Date.now() - 2 * 86_400_000;
    setStepWindows((prev) => {
      let changed = false;
      const next = prev.map((w) => {
        if (w.toMs < recent) return w;
        // Only ever grows: a counter does not go backwards, and an empty history must not undo what was taken out.
        const fresh = stepsInWindow(stepSamples, w.date, w.fromMs, w.toMs);
        const removed = { ...w.removed };
        for (const k of ['phone', 'watch', 'hc'] as const) {
          if (fresh[k] !== undefined) removed[k] = Math.max(removed[k] ?? 0, fresh[k] ?? 0);
        }
        if (JSON.stringify(removed) === JSON.stringify(w.removed)) return w;
        changed = true;
        return { ...w, removed };
      });
      return changed ? next : prev;
    });
  }, [stepSamples, setStepWindows]);
  const setDaySteps = useCallback(
    (date: string, n: number | null) =>
      setStepOverrides((prev) => {
        const next = { ...prev };
        if (n === null) delete next[date];
        else next[date] = Math.max(0, Math.round(n));
        return next;
      }),
    [setStepOverrides]
  );
  const [steps, setSteps] = useState<StepsTotals | null>(null);
  const [hc, setHc] = useState<HcStatus | null>(null);
  const [vitals, setVitals] = usePersistentState<HcVitals | null>('hc_vitals', null);
  const [hcError, setHcError] = useState('');
  const [hcLastSyncAt, setHcLastSyncAt] = useState(0);
  const [hcNightsImported, setHcNightsImported] = useState(0);
  const [own, setOwn] = usePersistentState<Record<string, OwnDay>>('own_daily', {});
  const [watchData, setWatchData] = useState<{ watchSyncAt: number; hrToday: number } | null>(null);
  const busy = useRef(false);
  const lastHc = useRef(0);

  const record = useCallback(
    (date: string, source: 'phone' | 'watch' | 'hc', value: number | undefined) =>
      setStepsBySource((prev) => recordSource(prev, date, source, value)),
    [setStepsBySource]
  );

  const sync = useCallback(
    async (askForSteps = false, forceHc = false) => {
      if (!isAndroidApp() || busy.current) return;
      busy.current = true;
      try {
        // The phone's own counter is only read when the phone is a chosen source; the watch's total is always stored.
        const phoneOn = usesPhone(stepSource);
        const totals = askForSteps && phoneOn ? await Steps.start() : await Steps.getToday({ sensor: phoneOn });
        setSteps(totals);
        if (phoneOn) record(totals.day, 'phone', totals.phone);
        record(totals.day, 'watch', totals.watch);
        // The timed samples kept on the phone (also while the app was closed) let a period such as a drive be taken out later.
        try {
          const h = await Steps.history();
          setStepSamples((prev) => trimSamples({ ...prev, phone: h.phone ?? prev.phone, watch: h.watch ?? prev.watch }, Date.now()));
        } catch {
          // older builds have no history: removing a period then is not available
        }

        // Sleep the phone itself detected (bedtime and wake time). Health Connect nights below replace these.
        if (sleepDetectEnabled()) {
          void startSleepDetect();
          const detected = segmentsToLogs(await readSleepSegments());
          if (detected.length > 0) setSleepLogs((prev) => mergeDetectedSleep(prev, detected));
        }

        // What the watch and phone measured by themselves: daily numbers and estimated nights (Health Connect below still wins).
        try {
          const ownRes = await syncOwnSensors();
          if (ownRes) {
            setOwn(ownRes.own);
            setWatchData({ watchSyncAt: ownRes.watchSyncAt, hrToday: ownRes.hrToday });
            if (ownRes.estimates.length > 0) setSleepLogs((prev) => mergeEstimatedSleep(prev, ownRes.estimates, isDismissedSleep));
          }
        } catch {
          // own sensors are optional: a problem here must not stop the Health Connect sync
        }

        // Health Connect switched off: nothing below is read, so nothing from it is touched or asked for.
        if (!useHealthConnect) {
          setHc(null);
          return;
        }
        const status = await HealthConnect.status();
        setHc(status);
        resetHealthWriteCache();
        // The full read is slow (every Health Connect call costs about two seconds), so it runs every ten minutes or on request.
        if (!forceHc && Date.now() - lastHc.current < HC_EVERY_MS) return;
        lastHc.current = Date.now();

        // Sleep first: it is one quick read and the thing you open the app for.
        if (status.available && status.sleepGranted) {
          try {
            const { sessions } = await HealthConnect.readSleep({ days: 30 });
            const logs = sessions.map(sessionToLog).filter((l): l is SleepLogEntry => l !== null);
            setHcNightsImported(logs.length);
            if (logs.length > 0) setSleepLogs((prev) => mergeImportedSleep(prev, logs, { preferred: sleepSourceRef.current.main, secondary: sleepSourceRef.current.second }));
            setHcLastSyncAt(Date.now());
            setHcError('');
          } catch (err: any) {
            setHcError(err?.message || 'Could not read sleep from Health Connect.');
          }
          // Then the overnight readings (heart rate, HRV, breathing, oxygen, skin temperature) for the few nights that lack them.
          try {
            const ask = nightsNeedingVitals(readStored<SleepLogEntry[]>('sleep_logs', []));
            if (ask.length > 0) {
              const { nights } = await HealthConnect.readSleepVitals({ nights: ask });
              // A night that came back empty is still marked as looked up, so it is not asked about every ten minutes.
              setSleepLogs((prev) => applyVitalsToLogs(prev, ask.map((a) => nights.find((n) => n.id === a.id) ?? { id: a.id })));
            }
          } catch {
            // overnight readings are optional
          }
        }
        if (status.available && status.stepsGranted && usesHealthConnect(stepSource)) {
          try {
            const { days } = await HealthConnect.readSteps({ days: 30 });
            days.forEach((d) => record(d.date, 'hc', d.steps));
            // Hour by hour, so a period can be taken out of Health Connect's count too.
            try {
              const { buckets } = await HealthConnect.readStepBuckets({ days: 7 });
              const hcSamples: StepSample[] = bucketsToSamples(buckets);
              setStepSamples((prev) => trimSamples({ ...prev, hc: hcSamples.length ? hcSamples : prev.hc }, Date.now()));
            } catch {
              // hourly steps are optional
            }
          } catch {
            // steps from Health Connect are optional
          }
        }
        if (status.available && status.canRead) {
          // Everything else Health Connect holds: each read is optional and fails on its own.
          const next: HcVitals = {
            at: Date.now(),
            restingBpm: 0,
            latestBpm: 0,
            latestAt: 0,
            avgBpm24h: 0,
            daily: {},
            weights: [],
            bodyFatPct: 0,
            heightCm: 0,
            bp: [],
            glucose: [],
            fitness: {},
            vo2: [],
          };
          let got = false;
          try {
            const hr = await HealthConnect.readHeartRate({ hours: 24 });
            next.restingBpm = hr.restingBpm || 0;
            if (hr.samples.length > 0) {
              const last = hr.samples[hr.samples.length - 1];
              next.latestAt = last[0];
              next.latestBpm = last[1];
              next.avgBpm24h = Math.round(hr.samples.reduce((s, x) => s + x[1], 0) / hr.samples.length);
            }
            got = true;
          } catch {
            // heart rate not shared
          }
          try {
            const { days } = await HealthConnect.readDaily({ days: 30 });
            for (const d of days) {
              next.daily[d.date] = {
                totalKcal: Math.round(d.totalKcal),
                activeKcal: Math.round(d.activeKcal),
                distanceKm: Math.round(d.distanceKm * 100) / 100,
                avgHr: d.avgHr,
              };
            }
            got = true;
          } catch {
            // daily totals not shared
          }
          try {
            const fit = await HealthConnect.readFitness({ days: 30 });
            for (const d of fit.days) next.fitness![d.date] = d;
            next.vo2 = fit.vo2;
            got = true;
          } catch {
            // fitness numbers not shared
          }
          try {
            const body = await HealthConnect.readBody({ days: 90 });
            next.weights = body.weights;
            next.bodyFatPct = body.bodyFat.length ? [...body.bodyFat].sort((a, b) => b.time - a.time)[0].pct : 0;
            next.heightCm = body.heightCm || 0;
            got = true;
          } catch {
            // body measurements not shared
          }
          try {
            const logs = await HealthConnect.readLogs({ days: 30 });
            next.bp = logs.bloodPressure.filter((x) => !x.own);
            next.glucose = logs.glucose.filter((x) => !x.own);
            got = true;
          } catch {
            // blood pressure and glucose not shared
          }
          if (got) setVitals(next);
        }
        // Workouts other apps saved (the Google Health / Fitbit app, for one): a few at a time, newest first, each seen once so a
        // workout you delete here does not come back. Every session costs two slow calls, so a sync takes at most four batches.
        if (status.available && status.canRead && workoutsCb.current && readPrefs().importHcWorkouts) {
          try {
            for (let batch = 0; batch < 4; batch++) {
              const seen = readStored<string[]>(SEEN_KEY, []);
              const { sessions, remaining } = await HealthConnect.readWorkouts({ days: seen.length ? LATER_DAYS : FIRST_DAYS, max: PER_READ, skip: seen });
              if (sessions.length === 0) break;
              workoutsCb.current(sessions);
              try {
                localStorage.setItem(KEY_PREFIX + SEEN_KEY, JSON.stringify([...seen, ...sessions.map((s) => s.id)].slice(-600)));
              } catch {
                // storage full: they may be offered again, and the merge skips duplicates
              }
              if (remaining <= 0) break;
            }
          } catch {
            // workouts not shared or the read failed: try again next time
          }
        }
      } catch {
        // plugin not ready yet; the next tick will try again
      } finally {
        busy.current = false;
      }
    },
    [record, setOwn, setSleepLogs, setVitals, setStepSamples, stepSource, useHealthConnect]
  );

  // Choosing a source that leaves out the phone cancels its background counting; choosing it again turns that back on.
  const phoneWasOn = useRef<boolean | null>(null);
  useEffect(() => {
    if (!active || !isAndroidApp()) return;
    const on = usesPhone(stepSource);
    if (!on) void Steps.stop().catch(() => {});
    else if (phoneWasOn.current === false) void Steps.start().catch(() => {});
    phoneWasOn.current = on;
  }, [active, stepSource]);

  // First launch after setup: ask once for step counting (Android shows its own permission dialog).
  useEffect(() => {
    if (!active || !isAndroidApp()) return;
    const asked = readStored<boolean>('steps_asked', false);
    sync(!asked, true);
    if (!asked) {
      try {
        localStorage.setItem('kyfit_steps_asked', 'true');
      } catch {
        // ignore
      }
    }
    const timer = setInterval(() => sync(false), 60_000);
    const onVisible = () => document.visibilityState === 'visible' && sync(false, Date.now() - lastHc.current > 2 * 60_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, sync]);

  const enableSteps = useCallback(() => sync(true), [sync]);

  const connectHealthConnect = useCallback(async (groups?: string[]) => {
    if (!useHealthConnect) return;
    setHcError('');
    try {
      // Only the reads are asked for unless the person has also turned on saving data to Health Connect.
      const status = await HealthConnect.requestAccess({ ...(groups && groups.length ? { groups } : {}), readOnly: !readPrefs().writeHealthConnect });
      setHc(status);
      resetHealthWriteCache();
      if (!(status.grantedCount ?? 0) && !status.sleepGranted && !status.stepsGranted) {
        setHcError('No access was granted. Tap Open to switch permissions on in Health Connect.');
      }
      await sync(false, true);
    } catch (err: any) {
      setHcError(err?.message || 'Could not open Health Connect.');
    }
  }, [sync, useHealthConnect]);

  return {
    autoSteps,
    setDaySteps,
    stepOverrides,
    stepsBySource,
    stepSamples,
    stepWindows,
    addStepWindow,
    removeStepWindow,
    steps,
    hc,
    vitals,
    hcError,
    hcLastSyncAt,
    hcNightsImported,
    own,
    watchData,
    enableSteps,
    connectHealthConnect,
    syncNow: () => sync(false, true),
  };
}