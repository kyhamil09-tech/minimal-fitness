/**
 * "Vibes": a one-tap starting look (accent palette plus background) and the goal people usually have with it. Used by onboarding
 * and by the Look settings, so the first thing someone does is pick how the app feels, before any personal numbers are asked for.
 */
export interface Vibe {
  id: string;
  name: string;
  tagline: string;
  paletteId: string;
  /** The backdrop for the light family and for the dark family. */
  light: string;
  dark: string;
  /** Which family it opens in. */
  mode: 'dark' | 'light';
  /** Swatches for the card: background, card, accent, second accent. */
  swatch: [string, string, string, string];
}

export const VIBES: Vibe[] = [
  { id: 'grounded', name: 'Grounded', tagline: 'Calm and outdoorsy. Sage, cream and terracotta.', paletteId: 'grounded', light: 'cream', dark: 'forest', mode: 'light', swatch: ['#F6F0E4', '#FBF8F1', '#6F8F68', '#D9784F'] },
  { id: 'high_energy', name: 'High energy', tagline: 'Sleek and fast. Slate with an electric lime hit.', paletteId: 'high_energy', light: 'alabaster', dark: 'slate', mode: 'dark', swatch: ['#11151C', '#1A202A', '#C8F135', '#FF4A1C'] },
  { id: 'mind_body', name: 'Mind & body', tagline: 'Soft and restful. Rose, lavender and gold.', paletteId: 'mind_body', light: 'blush', dark: 'plum', mode: 'light', swatch: ['#F4E3E0', '#FBF1EE', '#B9787C', '#B8A9D9'] },
  { id: 'night', name: 'Night run', tagline: 'Easy on the eyes after dark. Charcoal and ocean blue.', paletteId: 'ocean_calm', light: 'sky', dark: 'charcoal', mode: 'dark', swatch: ['#17181B', '#212226', '#7FA8C9', '#D9C49A'] },
];

export const findVibe = (id: string): Vibe | undefined => VIBES.find((v) => v.id === id);

/** The goals offered in onboarding, each with a short line and what it adjusts. */
export interface CoreGoal {
  id: 'strength' | 'run' | 'lose' | 'move' | 'sleep' | 'balance';
  label: string;
  line: string;
  /** The tab it should open on the first day. */
  start: 'exercise' | 'today' | 'sleep';
}

export const CORE_GOALS: CoreGoal[] = [
  { id: 'run', label: 'Run further', line: 'Build up distance and pace', start: 'exercise' },
  { id: 'strength', label: 'Get stronger', line: 'Lift, track and progress', start: 'exercise' },
  { id: 'lose', label: 'Lose weight', line: 'Move more and eat mindfully', start: 'today' },
  { id: 'move', label: 'Move every day', line: 'Steps, streaks and gentle habits', start: 'today' },
  { id: 'sleep', label: 'Sleep better', line: 'Rest, recovery and routine', start: 'sleep' },
  { id: 'balance', label: 'Feel balanced', line: 'Mind, body and recovery', start: 'today' },
];
