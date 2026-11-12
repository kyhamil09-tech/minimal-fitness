import type { TabId } from '../types/health';

/**
 * The map of the whole app: every area and where it lives, written down once. The Map screen draws it, searches it and jumps to
 * it, and the screens take their section lists from here, so the map cannot drift away from what the app really has.
 */

/** The sections of the Run tab. */
export const RUN_SECTIONS = ['start', 'plans', 'activities', 'routes', 'gear'] as const;
export type RunSection = (typeof RUN_SECTIONS)[number];

/** The sections of the Progress tab, in the order they are shown. */
export const PROGRESS_SECTIONS = ['trends', 'calendar', 'vitals', 'insights', 'body', 'awards'] as const;
export type ProgressSection = (typeof PROGRESS_SECTIONS)[number];

/** The three parts of Progress, each with the sections inside it. */
export const PROGRESS_GROUPS: { id: 'overview' | 'body' | 'activity'; label: string; sections: ProgressSection[] }[] = [
  { id: 'overview', label: 'Overview', sections: ['trends', 'insights'] },
  { id: 'body', label: 'Body', sections: ['vitals', 'body'] },
  { id: 'activity', label: 'Activity', sections: ['calendar', 'awards'] },
];

/** Which part of Progress a section lives in. */
export const progressGroupOf = (s: ProgressSection) => PROGRESS_GROUPS.find((g) => g.sections.includes(s)) ?? PROGRESS_GROUPS[0];

/** The groups in Settings, in the order they are shown. */
export const SETTINGS_GROUPS = ['profile', 'devices', 'workouts', 'friends', 'look', 'data', 'privacy'] as const;
export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number];

export interface MapTarget {
  tab: TabId;
  run?: RunSection;
  progress?: ProgressSection;
  settings?: SettingsGroupId;
  /** Open the meal plan sheet in Food & water. */
  mealPlan?: boolean;
  /** Open the Eat app (on its Today page). */
  eat?: boolean;
  /** Play the app tour. */
  tour?: boolean;
}

export interface MapItem {
  id: string;
  label: string;
  /** One plain line on what it is for. */
  sub: string;
  target: MapTarget;
  /** Extra words people might look for. */
  keywords?: string;
}

export interface MapArea {
  id: 'move' | 'fuel' | 'body' | 'progress' | 'setup';
  title: string;
  blurb: string;
  items: MapItem[];
}

export const APP_MAP: MapArea[] = [
  {
    id: 'move',
    title: 'Move',
    blurb: 'Workouts and training',
    items: [
      { id: 'start', label: 'Start a workout', sub: 'Run, walk, ride, hike, strength and more, with GPS and your watch', target: { tab: 'exercise', run: 'start' }, keywords: 'run walk cycle gym strength hiit treadmill record gps' },
      { id: 'plans', label: 'Plans and routines', sub: 'Training plans, saved strength routines and intervals', target: { tab: 'exercise', run: 'plans' }, keywords: 'plan program routine interval 5k 10k' },
      { id: 'activities', label: 'Past activities', sub: 'Every workout with its route map and breakdown', target: { tab: 'exercise', run: 'activities' }, keywords: 'history log workouts splits map' },
      { id: 'routes', label: 'Routes', sub: 'Saved routes you can follow, and routes you repeat', target: { tab: 'exercise', run: 'routes' }, keywords: 'gpx map course' },
      { id: 'gear', label: 'Shoes and bikes', sub: 'Mileage and when to replace them', target: { tab: 'exercise', run: 'gear' }, keywords: 'shoes trainers bike service mileage' },
      { id: 'calendar', label: 'Workout calendar', sub: 'A month of workouts and planned days', target: { tab: 'progress', progress: 'calendar' }, keywords: 'month planned missed schedule' },
    ],
  },
  {
    id: 'fuel',
    title: 'Fuel',
    blurb: 'Food, water and fasting',
    items: [
      { id: 'food', label: 'Eat', sub: 'Log meals and water, plan the week, cook, and see how you eat', target: { tab: 'nutrition', eat: true }, keywords: 'calories macros protein eat drink hydration barcode' },
      { id: 'mealplan', label: 'Meal plan and groceries', sub: 'Plan the week and get a shopping list', target: { tab: 'nutrition', mealPlan: true }, keywords: 'plan meals shopping list grocery' },
      { id: 'fasting', label: 'Fasting', sub: 'Timer, stages and history', target: { tab: 'fasting' }, keywords: 'intermittent 16:8 timer fast' },
    ],
  },
  {
    id: 'body',
    title: 'Body and recovery',
    blurb: 'Sleep, vitals and measurements',
    items: [
      { id: 'sleep', label: 'Sleep', sub: 'Nights, stages and a smart alarm', target: { tab: 'sleep' }, keywords: 'bed rest alarm hrv' },
      { id: 'breathe', label: 'Breathe', sub: 'Guided breathing to settle down, with a calm check from your heart rate', target: { tab: 'breathe' }, keywords: 'breathing calm stress relax meditate box 4-7-8 anxiety mindfulness' },
      { id: 'healthlog', label: 'Health log', sub: 'Blood pressure, glucose, medications and symptoms', target: { tab: 'healthlog' }, keywords: 'bp glucose medication symptom pills' },
      { id: 'body', label: 'Body and photos', sub: 'Weight, measurements and progress photos', target: { tab: 'progress', progress: 'body' }, keywords: 'weight bmi waist photo measurements' },
      { id: 'vitals', label: 'Vitals', sub: 'Live heart rate, resting heart rate, VO2 max and daily fitness numbers', target: { tab: 'progress', progress: 'vitals' }, keywords: 'heart rate hrv vo2 calories floors resting sensor' },
    ],
  },
  {
    id: 'progress',
    title: 'Progress',
    blurb: 'How it is going',
    items: [
      { id: 'trends', label: 'Trends and weekly coach', sub: 'Weekly review, charts and your nutrition against targets', target: { tab: 'progress', progress: 'trends' }, keywords: 'coach score week recap charts nutrition' },
      { id: 'insights', label: 'Insights', sub: 'Patterns the app finds in your own data', target: { tab: 'progress', progress: 'insights' }, keywords: 'patterns sleep training readiness' },
      { id: 'awards', label: 'Awards and records', sub: 'Streaks, badges and personal bests', target: { tab: 'progress', progress: 'awards' }, keywords: 'badges streak pr personal best records' },
      { id: 'friends', label: 'Friends and challenges', sub: 'Optional step and workout challenges you share with short codes, with no accounts', target: { tab: 'settings', settings: 'friends' }, keywords: 'challenge friends leaderboard compete social group share code' },
    ],
  },
  {
    id: 'setup',
    title: 'Set up',
    blurb: 'You, your devices and your data',
    items: [
      { id: 'profile', label: 'Profile and goals', sub: 'Your details, targets and reminders', target: { tab: 'settings', settings: 'profile' }, keywords: 'name age weight height units goals reminders notifications' },
      { id: 'devices', label: 'Watch, steps and data sources', sub: 'Watch link, step counting, sleep, Health Connect and Strava', target: { tab: 'settings', settings: 'devices' }, keywords: 'watch pixel bluetooth heart rate steps health connect strava sync' },
      { id: 'workouts', label: 'Workout options', sub: 'Auto-pause, spoken updates, haptics and safety sharing', target: { tab: 'settings', settings: 'workouts' }, keywords: 'voice auto-pause gps live share safety countdown' },
      { id: 'look', label: 'Look and feel', sub: 'Colors, dark or light, text size and motion', target: { tab: 'settings', settings: 'look' }, keywords: 'theme dark light color text size accessibility swipe' },
      { id: 'data', label: 'Backup and data', sub: 'Back up, restore, export, import and storage', target: { tab: 'settings', settings: 'data' }, keywords: 'backup restore export import csv gpx strava takeout storage erase' },
      { id: 'privacy', label: 'Privacy', sub: 'Proof that everything stays on this phone', target: { tab: 'settings', settings: 'privacy' }, keywords: 'private local network security lock' },
      { id: 'tour', label: 'App tour', sub: 'A short walk through everything, any time you want it again', target: { tab: 'settings', tour: true }, keywords: 'help guide tutorial walkthrough intro onboarding how to learn explain' },
    ],
  },
];

/** Every item, flat. */
export const allMapItems = (): MapItem[] => APP_MAP.flatMap((a) => a.items);

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9:]+/).filter(Boolean);

/**
 * Items that match what was typed: each typed word has to start a word in the label, the line under it, or its keywords. An
 * empty search matches nothing (the screen shows the whole map instead).
 */
export const searchMap = (query: string): MapItem[] => {
  const typed = words(query);
  if (typed.length === 0) return [];
  return allMapItems().filter((item) => {
    const hay = words(`${item.label} ${item.sub} ${item.keywords ?? ''}`);
    return typed.every((t) => hay.some((h) => h.startsWith(t)));
  });
};

/** The Progress section for a tab id that stands in for one (the Health tab is Vitals inside Progress). */
export const progressSectionFor = (tab: TabId, requested?: ProgressSection): ProgressSection => (tab === 'health' ? 'vitals' : requested ?? 'trends');
