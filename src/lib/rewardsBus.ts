import { Encouragement } from './rewards';

/** A tiny channel so any screen can show an encouragement toast without passing props through the whole app. */
type Listener = (e: Encouragement) => void;
const listeners = new Set<Listener>();

export const onEncouragement = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const announce = (e: Encouragement | null) => {
  if (e) listeners.forEach((l) => l(e));
};

const SEEN_KEY = 'kyfit_awards_seen';

export const readSeenAwards = (): string[] | null => {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw === null) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export const writeSeenAwards = (ids: string[]) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    // storage full or blocked: the worst case is seeing a celebration twice
  }
};
