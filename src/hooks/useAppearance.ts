import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePersistentState } from './usePersistentState';
import { Backdrop, DEFAULT_DARK, DEFAULT_LIGHT, findBackdrop, makeBackdrop } from '../data/backdrops';
import { Appearance, buildAppearance } from '../lib/appearance';
import { ColorPalette } from '../types/theme';

export type ThemeMode = 'dark' | 'light' | 'auto';

/**
 * Owns the look of the app: dark, light or follow the phone; which background is used in each family (soft off-black or AMOLED
 * in the dark one, pastels and creams in the light one); and any background the user made themselves. It turns those and the
 * accent palette into CSS variables on the page (see lib/appearance.ts) and returns the colours the screens draw with.
 */
export function useAppearance(palette: ColorPalette) {
  const [mode, setMode] = usePersistentState<ThemeMode>('theme_mode', 'dark');
  const [darkId, setDarkId] = usePersistentState<string>('backdrop_dark', DEFAULT_DARK);
  const [lightId, setLightId] = usePersistentState<string>('backdrop_light', DEFAULT_LIGHT);
  const [custom, setCustom] = usePersistentState<Record<string, Backdrop>>('custom_backdrops', {});
  const [systemLight, setSystemLight] = useState<boolean>(() => !!window.matchMedia?.('(prefers-color-scheme: light)')?.matches);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    const on = () => setSystemLight(!!media?.matches);
    media?.addEventListener?.('change', on);
    return () => media?.removeEventListener?.('change', on);
  }, []);

  const light = mode === 'light' || (mode === 'auto' && systemLight);
  const backdrop: Backdrop =
    findBackdrop(light ? lightId : darkId, custom) ?? (findBackdrop(light ? DEFAULT_LIGHT : DEFAULT_DARK) as Backdrop);
  // A custom background of the wrong family (made in the other one) is ignored rather than breaking the page.
  const safe = backdrop.family === (light ? 'light' : 'dark') ? backdrop : (findBackdrop(light ? DEFAULT_LIGHT : DEFAULT_DARK) as Backdrop);

  const appearance: Appearance = useMemo(() => buildAppearance(safe, palette), [safe, palette]);

  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(appearance.vars)) root.style.setProperty(k, v);
    root.dataset.theme = appearance.family;
    root.classList.toggle('dark', appearance.family === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', appearance.metaColor);
  }, [appearance]);

  const select = useCallback(
    (id: string) => {
      const b = findBackdrop(id, custom);
      if (!b) return;
      if (b.family === 'light') setLightId(id);
      else setDarkId(id);
      // Choosing a background from the other family switches to it, so the choice is visible straight away.
      setMode((m) => (m === 'auto' ? m : b.family));
    },
    [custom, setDarkId, setLightId, setMode]
  );

  const saveCustom = useCallback(
    (name: string, bg: string): string => {
      const id = `custom_bg_${Date.now()}`;
      const b = makeBackdrop(id, name.trim() || 'My background', bg);
      setCustom((prev) => ({ ...prev, [id]: b }));
      if (b.family === 'light') setLightId(id);
      else setDarkId(id);
      setMode((m) => (m === 'auto' ? m : b.family));
      return id;
    },
    [setCustom, setDarkId, setLightId, setMode]
  );

  const removeCustom = useCallback(
    (id: string) => {
      setCustom((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (darkId === id) setDarkId(DEFAULT_DARK);
      if (lightId === id) setLightId(DEFAULT_LIGHT);
    },
    [darkId, lightId, setCustom, setDarkId, setLightId]
  );

  return { mode, setMode, backdrop: safe, backdropId: safe.id, custom, select, saveCustom, removeCustom, appearance, theme: appearance.theme, light };
}

export type AppearanceApi = ReturnType<typeof useAppearance>;
