import React, { useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { TabId } from '../types/health';
import { readPrefs } from '../lib/prefs';
import { isAndroidApp } from '../lib/native';
import { MapTarget, ProgressSection, RunSection } from '../lib/appMap';

/** The five tabs you can swipe between, in order. */
const MAIN_TABS: TabId[] = ['today', 'exercise', 'nutrition', 'progress', 'settings'];

/** The tab that holds a sub-screen: Fasting, Sleep and the Health log live under Health, and the Health id stands for Progress > Vitals. */
const mainTabOf = (tab: TabId): TabId =>
  tab === 'fasting' || tab === 'sleep' || tab === 'healthlog' ? 'nutrition' : tab === 'health' ? 'progress' : tab;

/**
 * Where you are in the app and how you move: the current tab, swiping between tabs, the back button, the map and the jumps it makes
 * into sections of other screens. Nothing here knows about workouts or food, so it can be read on its own.
 */
export function useAppNavigation(swipeEnabled: boolean) {
  const [currentTab, setCurrentTab] = useState<TabId>(() => readPrefs().defaultTab);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Which way the last swipe went, so the next screen slides in from that side (null for a tap on a tab).
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const swipeStart = useRef<{ x: number; y: number; at: number } | null>(null);

  // Swipe left or right anywhere on a screen to move to the next or previous main tab. Swipes that start on
  // something that scrolls sideways (chips, sliders, maps), during a live workout, or inside a dialog are ignored.
  const handleSwipeStart = (e: React.TouchEvent) => {
    const el = e.target as HTMLElement;
    const blocked =
      !swipeEnabled ||
      e.touches.length !== 1 ||
      !!el.closest('.overflow-x-auto, input, select, textarea, [data-no-swipe], [role="dialog"], .leaflet-container') ||
      !!document.querySelector('[aria-label="Workout in progress"]');
    const t = e.touches[0];
    swipeStart.current = blocked ? null : { x: t.clientX, y: t.clientY, at: Date.now() };
  };
  const handleSwipeEnd = (e: React.TouchEvent) => {
    const s = swipeStart.current;
    swipeStart.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - s.at > 700) return;
    const next = MAIN_TABS[MAIN_TABS.indexOf(mainTabOf(currentTab)) + (dx < 0 ? 1 : -1)];
    if (!next) return;
    setSlideDir(dx < 0 ? 'left' : 'right');
    setCurrentTab(next);
  };

  // Back button: a sub-screen or another tab goes back to Today, and Today asks before the app closes.
  const [confirmExit, setConfirmExit] = useState(false);
  const tabRef = useRef(currentTab);
  tabRef.current = currentTab;
  const exitOpenRef = useRef(false);
  exitOpenRef.current = confirmExit;
  useEffect(() => {
    if (!isAndroidApp()) return;
    const sub = CapApp.addListener('backButton', () => {
      if (exitOpenRef.current) {
        setConfirmExit(false);
        return;
      }
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
      if (tabRef.current !== 'today') {
        setSlideDir(null);
        setCurrentTab('today');
        return;
      }
      setConfirmExit(true);
    });
    return () => {
      void sub.then((s) => s.remove());
    };
  }, []);

  // Each tab opens at the top rather than inheriting the previous tab's scroll position.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [currentTab]);

  // Every tab change (and the first screen) lights the background glow for a few seconds.
  const [glowKey, setGlowKey] = useState(0);
  useEffect(() => {
    setGlowKey((k) => k + 1);
  }, [currentTab]);

  const [progressStart, setProgressStart] = useState<ProgressSection>('trends');
  // Something that points at a section (the map, "All insights") opens Progress there once; any later visit starts on Trends again.
  useEffect(() => {
    if (currentTab !== 'progress' && currentTab !== 'health') setProgressStart('trends');
  }, [currentTab]);

  // The map of the app, and the one way to jump to any place in it.
  const [mapOpen, setMapOpen] = useState(false);
  const [runOpen, setRunOpen] = useState<{ view: RunSection; nonce: number } | null>(null);
  const [mealPlanToken, setMealPlanToken] = useState(0);
  const navigateTo = (t: MapTarget) => {
    setMapOpen(false);
    setSlideDir(null);
    if (t.progress) setProgressStart(t.progress);
    setCurrentTab(t.tab);
    if (t.run) setRunOpen({ view: t.run, nonce: Date.now() });
    if (t.mealPlan) setMealPlanToken(Date.now());
    // Settings has to be on screen before one of its groups can be asked to open.
    if (t.settings) window.setTimeout(() => window.dispatchEvent(new CustomEvent('kyfit-open-settings-group', { detail: t.settings })), 250);
  };

  return {
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
  };
}
