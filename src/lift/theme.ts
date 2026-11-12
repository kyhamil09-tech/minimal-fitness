import { useEffect, useState } from 'react';
import { usePrefs } from '../lib/prefs';

/** 'dark' or 'light' for the Lift side: the chosen one, or the phone's own setting when set to auto. */
export const useLiftScheme = (): 'dark' | 'light' => {
  const { prefs } = usePrefs();
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  const [phoneLight, setPhoneLight] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return undefined;
    const on = (e: MediaQueryListEvent) => setPhoneLight(e.matches);
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  }, [query]);
  return prefs.liftTheme === 'auto' ? (phoneLight ? 'light' : 'dark') : prefs.liftTheme;
};
