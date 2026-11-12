/**
 * The app tour: what each stop says and where "Show me" goes. Plain data, so the words are easy to change and a test can make sure every
 * stop has something to say and every door leads somewhere real.
 */

export type TourGo = 'home' | 'run' | 'lift' | 'eat' | 'fasting' | 'breathe' | 'sleep' | 'progress' | 'look' | 'privacy';

export interface TourStep {
  id: string;
  /** The color of the stop's badge. */
  color: string;
  /** A lucide icon name (see Tour.tsx). */
  icon: 'sparkles' | 'home' | 'run' | 'lift' | 'chart' | 'eat' | 'fasting' | 'breathe' | 'watch' | 'palette' | 'shield';
  title: string;
  lead: string;
  bullets: string[];
  /** A button that leaves the tour and opens that part of the app. */
  go?: { to: TourGo; label: string };
  /** The permission step has a button that asks for notifications. */
  asks?: 'notifications';
}

export const TOUR: TourStep[] = [
  {
    id: 'welcome',
    color: '#FF5500',
    icon: 'sparkles',
    title: 'Welcome',
    lead: 'Training, food, fasting, sleep and calm in one app. A quick tour, about a minute.',
    bullets: [
      'No account, no ads. Everything you log stays on this phone.',
      'It works offline. The few things that use the internet are optional and listed in Privacy.',
      'You can replay this tour any time from Settings, and find anything in the Map of the app.',
    ],
  },
  {
    id: 'home',
    color: '#FF8A3D',
    icon: 'home',
    title: 'Home: your day at a glance',
    lead: 'Today shows what is next, with rings for steps, water and workouts.',
    bullets: [
      'Tap a ring or tile for its history. Press and hold a tile to rearrange them.',
      'Streaks keep count of your active days, and you get a couple of freezes a month.',
      'A card suggests the next planned session, and moves a missed hard one to a rest day.',
    ],
    go: { to: 'home', label: 'Show me Home' },
  },
  {
    id: 'run',
    color: '#FF5500',
    icon: 'run',
    title: 'Run, walk, ride',
    lead: 'GPS tracking with a live map, built for real runs.',
    bullets: [
      'Auto-pause, spoken updates, intervals, and ghost racing against an earlier run.',
      'Treadmill distance from your steps, and runs from your watch without the phone.',
      'Start from a Quick Settings tile, the launcher shortcut or the lock-screen notification.',
    ],
    go: { to: 'run', label: 'Show me Run' },
  },
  {
    id: 'lift',
    color: '#FFB020',
    icon: 'lift',
    title: 'Lift: a lifting app inside',
    lead: 'A plain weightlifting logger with its own look.',
    bullets: ['Routines, programs, supersets, warm-up sets and a plate calculator.', 'Rest timer, one-rep-max estimates and personal records.', 'Plans from Month of Walks to Starter Strength, built in.'],
    go: { to: 'lift', label: 'Show me Lift' },
  },
  {
    id: 'progress',
    color: '#2DD4BF',
    icon: 'chart',
    title: 'Progress and plans',
    lead: 'See where you are heading, and follow a plan if you want one.',
    bullets: ['Trends, records, a heat map of your routes and a year in review.', 'A weekly review that tells you what went well and what to nudge.', '15 built-in plans, including a month of daily walks.'],
    go: { to: 'progress', label: 'Show me Progress' },
  },
  {
    id: 'eat',
    color: '#F2475F',
    icon: 'eat',
    title: 'Eat: food, your way',
    lead: 'An app of its own for meals, water and the week ahead.',
    bullets: [
      'A plate that fills as you eat. Scan, photograph, speak or search to log, or tap one of your usuals.',
      'Recipes, a meal plan, a shopping list, and ideas for finishing the day well.',
      'A calm view hides calorie numbers. Nothing here scolds.',
    ],
    go: { to: 'eat', label: 'Open Eat' },
  },
  {
    id: 'fasting',
    color: '#FF5A2A',
    icon: 'fasting',
    title: 'Fasting, done safely',
    lead: 'A clock face, eight protocols, and a short check before you start.',
    bullets: ['Stages in plain words, hedged honestly. Water, salts and hunger-wave tools.', 'A big "I feel unwell" button ends a fast without counting against you.', 'Long fasts ask for a second confirmation. Gentle mode hides the numbers.'],
    go: { to: 'fasting', label: 'Open Fasting' },
  },
  {
    id: 'calm',
    color: '#5EEAD4',
    icon: 'breathe',
    title: 'Breathe, sleep and health log',
    lead: 'Recovery has its own corner.',
    bullets: ['Breathe: 13 techniques, journeys, a meditation timer and a watch version.', 'Sleep: a calendar of your nights, from several trackers, with a smart alarm.', 'Health log: blood pressure, glucose, medicines and symptoms, with reminders.'],
    go: { to: 'breathe', label: 'Open Breathe' },
  },
  {
    id: 'watch',
    color: '#A78BFA',
    icon: 'watch',
    title: 'Watch, widgets and shortcuts',
    lead: 'Reach things without opening the app.',
    bullets: ['A Pixel Watch app with tiles, complications, runs and breathing.', 'Home-screen widgets for water, fasting and breathing.', 'Quick Settings tiles for Run, Fast and Breathe, and long-press shortcuts on the icon.'],
  },
  {
    id: 'look',
    color: '#F472B6',
    icon: 'palette',
    title: 'Make it yours',
    lead: 'Colors and backgrounds, with no fuss.',
    bullets: [
      'Settings > Look & feel: themes, dark, light or AMOLED black, text size and motion.',
      'Eat and Fasting each have their own look: Dark, AMOLED, Light or follow the phone, plus a color you pick.',
      'Units (metric or imperial) are set once and carried everywhere.',
    ],
    go: { to: 'look', label: 'Open Look & feel' },
  },
  {
    id: 'privacy',
    color: '#34D399',
    icon: 'shield',
    title: 'Private, and you are in charge',
    lead: 'Permissions are asked for when a feature needs them, never all at once.',
    bullets: [
      'Notifications: reminders and the fasting timer. Location: only while a GPS workout runs.',
      'Camera and microphone: only for scanning and voice logging. Health Connect: optional.',
      'Anything that signs in uses Google only, and says so. You can check every request in Privacy.',
    ],
    asks: 'notifications',
    go: { to: 'privacy', label: 'Open Privacy' },
  },
];

export const TOUR_DOORS: TourGo[] = ['home', 'run', 'lift', 'eat', 'fasting', 'breathe', 'sleep', 'progress', 'look', 'privacy'];

/** The tour shows once for someone who has finished setting up and has not seen it, or any time it is asked for. */
export const shouldShowTour = (onboarded: boolean, seen: boolean, asked: boolean, welcomeOpen: boolean): boolean => asked || (onboarded && !seen && !welcomeOpen);
