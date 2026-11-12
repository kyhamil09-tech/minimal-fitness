import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalorieSample,
  HeartRateSample,
  WatchHeartRate,
  WatchStatus,
  isFresh,
  isWatchSupported,
} from '../lib/watch';

export type WatchLinkState =
  | 'unsupported' // not the Android app (browser / iOS)
  | 'unavailable' // Play services Wearable API missing
  | 'no-watch' // no paired watch reachable
  | 'no-app' // watch reachable but Minimal Fitness isn't installed on it
  | 'waiting' // watch app installed, no heart-rate samples yet
  | 'live';

const EMPTY_STATUS: WatchStatus = { available: true, connected: false, nodeName: '', watchAppInstalled: false };

/**
 * Live heart rate streamed from a linked Wear OS watch through the Data Layer.
 * The watch app measures heart rate with Health Services and messages each reading to the phone.
 */
export function useWatchHeartRate() {
  const supported = isWatchSupported();
  const [status, setStatus] = useState<WatchStatus>(EMPTY_STATUS);
  const [sample, setSample] = useState<HeartRateSample | null>(null);
  const [kcal, setKcal] = useState<CalorieSample | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const sampleRef = useRef<HeartRateSample | null>(null);

  const refresh = useCallback(async () => {
    if (!supported) return;
    try {
      setStatus(await WatchHeartRate.getStatus());
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Could not reach the watch.');
    }
  }, [supported]);

  useEffect(() => {
    if (!supported) return;
    const handles: { remove: () => Promise<void> }[] = [];
    let cancelled = false;
    const keep = (p: Promise<{ remove: () => Promise<void> }>) =>
      p.then((h) => {
        if (cancelled) h.remove();
        else handles.push(h);
      });
    keep(
      WatchHeartRate.addListener('heartRate', (s) => {
        sampleRef.current = s;
        setSample(s);
      })
    );
    keep(WatchHeartRate.addListener('calories', setKcal));
    refresh();
    const statusTimer = setInterval(refresh, 5000);
    // Re-evaluates freshness once a second so a dropped watch clears the live number.
    const tickTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      handles.forEach((h) => h.remove());
      clearInterval(statusTimer);
      clearInterval(tickTimer);
    };
  }, [supported, refresh]);

  const live = isFresh(sample, now);

  let state: WatchLinkState;
  if (!supported) state = 'unsupported';
  else if (!status.available) state = 'unavailable';
  else if (live) state = 'live';
  else if (!status.connected) state = 'no-watch';
  else if (!status.watchAppInstalled) state = 'no-app';
  else state = 'waiting';

  const start = useCallback(async () => {
    if (!supported) return;
    try {
      await WatchHeartRate.start();
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Could not message the watch.');
    }
  }, [supported]);

  const stop = useCallback(async () => {
    if (!supported) return;
    try {
      await WatchHeartRate.stop();
    } catch {
      // ignore
    }
    sampleRef.current = null;
    setSample(null);
  }, [supported]);

  return {
    supported,
    state,
    bpm: live ? (sample as HeartRateSample).bpm : null,
    /** Latest calories the watch measured (cumulative for its current exercise), with arrival time. */
    kcal,
    nodeName: status.nodeName,
    error,
    refresh,
    start,
    stop,
  };
}

export type WatchHeartRateState = ReturnType<typeof useWatchHeartRate>;
