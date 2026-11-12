import { useEffect, useRef } from 'react';
import { usePersistentState } from './usePersistentState';
import { AutomaticData } from './useAutomaticData';
import { readDrives, syncDriveDetect } from '../lib/autoDetect';
import { planDriveWindows } from '../lib/driveWindows';

const KEEP_MS = 30 * 86_400_000;

/**
 * Takes the steps counted while you were driving off the day, by itself. The phone notices when you get into a vehicle and out
 * again (Android's activity recognition, on the phone, no account) and keeps the drives; each new one becomes a removed period,
 * exactly like one you add by hand, with the same button to put the steps back. A drive you put back is not taken out again.
 */
export function useDriveSteps(enabled: boolean, automation: Pick<AutomaticData, 'addStepWindow' | 'stepWindows' | 'stepSamples' | 'steps'>) {
  const [handled, setHandled] = usePersistentState<number[]>('drives_handled', []);
  const latest = useRef({ handled, windows: automation.stepWindows, add: automation.addStepWindow });
  latest.current = { handled, windows: automation.stepWindows, add: automation.addStepWindow };

  // Tell the phone whether to keep watching for drives. Asked again once the step counter has been set up, which is when the
  // physical-activity permission exists (without it the phone cannot register and tries again at the next start).
  const stepsReady = automation.steps !== null;
  useEffect(() => {
    void syncDriveDetect(enabled);
  }, [enabled, stepsReady]);

  // Whenever new step samples arrive (the app's regular sync), look for drives not yet taken out.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void readDrives().then((res) => {
      if (cancelled || !res) return;
      const { handled: done, windows, add } = latest.current;
      const plan = planDriveWindows(res.drives, done, windows);
      const keys = res.drives.filter((d) => d[1] > d[0] && d[1] <= Date.now()).map((d) => d[0]).filter((k) => !done.includes(k));
      if (keys.length === 0) return;
      for (const w of plan) add(w.date, w.fromMs, w.toMs);
      const cutoff = Date.now() - KEEP_MS;
      setHandled([...done, ...keys].filter((k) => k >= cutoff));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, automation.stepSamples]);
}
