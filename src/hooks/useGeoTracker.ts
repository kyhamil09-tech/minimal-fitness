import { useCallback, useEffect, useRef, useState } from 'react';
import { TrackBuilder, TrackPoint, LatLng, decimate } from '../lib/geo';
import {
  SampleCursor,
  SessionOptions,
  hasNativeTracker,
  readNativeSamples,
  requestLocationPermission,
  setNativePaused,
  startNativeSession,
  stopNativeSession,
} from '../lib/tracker';

export type GeoStatus = 'idle' | 'acquiring' | 'tracking' | 'denied' | 'unavailable';

export interface GeoResult {
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  route: LatLng[];
  track: TrackPoint[];
  /** Heart-rate readings the phone received natively during the session ([epoch ms, bpm]). */
  hr: [number, number][];
  /** True when the climb and descent came from the phone's barometer rather than GPS altitude. */
  barometer: boolean;
}

const POLL_MS = 1500;

/**
 * Records distance, climb and a timestamped route while a workout runs.
 * In the Android app this uses a foreground location service, so the route keeps recording with
 * the screen off; in a browser it falls back to the page's geolocation (screen must stay on).
 */
export function useGeoTracker() {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [distanceKm, setDistanceKm] = useState(0);
  const [elevationGainM, setElevationGainM] = useState(0);
  const [pointCount, setPointCount] = useState(0);
  /** Speed over the last few seconds (m/s), null until there are enough fixes. Updates with every fix. */
  const [speedMs, setSpeedMs] = useState<number | null>(null);

  const builder = useRef(new TrackBuilder({ smooth: true }));
  const cursor = useRef<SampleCursor>({ fix: 0, hr: 0 });
  const nativeHr = useRef<[number, number][]>([]);
  const barometer = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const polling = useRef(false);
  const watchId = useRef<number | null>(null);
  const native = hasNativeTracker();

  const publish = () => {
    const b = builder.current;
    setSpeedMs(b.recentSpeedMs());
    setDistanceKm(b.distanceKm);
    setElevationGainM(Math.round(b.elevationGainM));
    setPointCount(b.points.length);
    if (b.points.length > 0) setStatus('tracking');
  };

  const pollNative = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const r = await readNativeSamples(cursor.current);
      cursor.current = r.cursor;
      nativeHr.current.push(...r.hr);
      if (r.barometer) barometer.current = true;
      let accepted = false;
      for (const f of r.fixes) accepted = builder.current.add(f) || accepted;
      if (accepted || r.fixes.length > 0) publish();
    } catch {
      // The recorder is not running; the next poll will try again.
    } finally {
      polling.current = false;
    }
  }, []);

  const stopWatchers = () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
    if (watchId.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
  };

  /** What is needed to carry on after a crash: the track so far (thinned) and the heart-rate readings. */
  const getState = useCallback(() => {
    const b = builder.current;
    return {
      points: b.points.length > 1500 ? decimate(b.points, 1500) : b.points.slice(),
      distanceKm: b.distanceKm,
      elevationGainM: b.elevationGainM,
      elevationLossM: b.elevationLossM,
      hr: nativeHr.current.slice(-4000),
    };
  }, []);

  const start = useCallback(async (options: SessionOptions = {}, restored?: ReturnType<typeof getState>) => {
    stopWatchers();
    builder.current = new TrackBuilder({ smooth: true });
    cursor.current = { fix: 0, hr: 0 };
    nativeHr.current = [];
    barometer.current = false;
    setDistanceKm(0);
    setElevationGainM(0);
    setPointCount(0);
    if (restored) {
      builder.current.hydrate(restored);
      nativeHr.current = restored.hr.slice();
      setDistanceKm(restored.distanceKm);
      setElevationGainM(Math.round(restored.elevationGainM));
      setPointCount(restored.points.length);
    }

    if (native) {
      if (!(await requestLocationPermission())) {
        setStatus('denied');
        return;
      }
      setStatus('acquiring');
      try {
        await startNativeSession(true, options);
      } catch {
        setStatus('unavailable');
        return;
      }
      pollTimer.current = setInterval(pollNative, POLL_MS);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    setStatus('acquiring');
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const accepted = builder.current.add({
          ts: pos.timestamp,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          alt: pos.coords.altitude,
          acc: pos.coords.accuracy,
        });
        publish();
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );
  }, [native, pollNative]);

  const setPaused = useCallback(
    (paused: boolean) => {
      if (paused) builder.current.pause(Date.now());
      else builder.current.resume(Date.now());
      if (native) void setNativePaused(paused);
    },
    [native]
  );

  /** The track so far (live map). A new array each call, so call it only when pointCount changes. */
  const getPoints = useCallback((): TrackPoint[] => builder.current.points.slice(), []);

  /** The newest recorded position and the last few before it (for heading), without copying the whole track. */
  const getRecent = useCallback((n = 12): TrackPoint[] => builder.current.points.slice(-n), []);

  const stop = useCallback(async (): Promise<GeoResult> => {
    if (native) {
      await pollNative(); // pick up everything recorded while the app was in the background
      await stopNativeSession();
    }
    stopWatchers();
    setStatus('idle');
    return { ...builder.current.snapshot(), hr: nativeHr.current, barometer: barometer.current };
  }, [native, pollNative]);

  useEffect(() => stopWatchers, []);

  return { status, distanceKm, elevationGainM, pointCount, speedMs, start, stop, setPaused, getPoints, getRecent, getState };
}
