import { useCallback, useEffect, useRef, useState } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Weather, fetchWeather } from '../lib/weather';

const ON_KEY = 'kyfit_weather_on';
const LOC_KEY = 'kyfit_weather_loc';
const CACHE_KEY = 'kyfit_weather_cache';
const FRESH_MS = 30 * 60 * 1000;

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable
  }
};

/**
 * Current weather and the next few hours, once you turn it on. Uses your approximate location (asked for once)
 * and Open-Meteo. Refreshes at most every 30 minutes and keeps the last result for when you are offline.
 */
export function useWeather() {
  const [enabled, setEnabledState] = useState<boolean>(() => read(ON_KEY, false));
  const [weather, setWeather] = useState<Weather | null>(() => read<Weather | null>(CACHE_KEY, null));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async (force = false) => {
    if (busy.current) return;
    const cached = read<Weather | null>(CACHE_KEY, null);
    if (!force && cached && Date.now() - cached.at < FRESH_MS) {
      setWeather(cached);
      return;
    }
    busy.current = true;
    setLoading(true);
    setError('');
    try {
      let loc = read<{ lat: number; lng: number } | null>(LOC_KEY, null);
      try {
        const perm = await Geolocation.requestPermissions();
        if (perm.location === 'granted' || perm.coarseLocation === 'granted') {
          const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 });
          loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          write(LOC_KEY, loc);
        }
      } catch {
        // fall back to the last known place
      }
      if (!loc) throw new Error('Allow location access to see the weather where you are.');
      const w = await fetchWeather(loc.lat, loc.lng);
      write(CACHE_KEY, w);
      setWeather(w);
    } catch (e: any) {
      setError(e?.message || 'Could not load the weather.');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  const setEnabled = useCallback(
    (on: boolean) => {
      setEnabledState(on);
      write(ON_KEY, on);
      if (on) void refresh(true);
    },
    [refresh]
  );

  useEffect(() => {
    if (!enabled) return;
    void refresh(false);
    const id = setInterval(() => void refresh(false), FRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && void refresh(false);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  return { enabled, setEnabled, weather: enabled ? weather : null, error, loading, refresh: () => refresh(true) };
}

export type WeatherState = ReturnType<typeof useWeather>;
