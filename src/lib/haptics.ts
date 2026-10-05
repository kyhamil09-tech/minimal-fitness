import { readPrefs } from './prefs';

/**
 * Subtle touch feedback. Short, quiet pulses (a light tick for taps, a slightly firmer one for choices, a small rising triple for
 * something finished), never a buzz. All of it follows Settings > Run > "Light haptics on taps"; where the phone cannot vibrate
 * it does nothing.
 */
const vibrate = (pattern: number | number[]) => {
  try {
    if (!readPrefs().uiHaptics) return;
    navigator.vibrate?.(pattern);
  } catch {
    // vibration unsupported
  }
};

export const haptic = {
  /** A light tap on any button. */
  tick: () => vibrate(7),
  /** Picking one option out of several. */
  select: () => vibrate(12),
  /** A step done: a ring closing, a set logged, a goal reached. */
  success: () => vibrate([10, 45, 20]),
  /** A bigger moment: a personal record or a finished onboarding. */
  celebrate: () => vibrate([12, 40, 16, 40, 28]),
};

/**
 * One listener for the whole app: every button, switch and radio gives a tick when pressed. Elements that make their own
 * feedback can opt out with data-no-haptic. Returns a function that removes the listener.
 */
export const installTapHaptics = (): (() => void) => {
  const on = (e: Event) => {
    const t = (e.target as HTMLElement | null)?.closest?.('button, [role="button"], [role="switch"], [role="radio"], [role="tab"]') as HTMLElement | null;
    if (!t || t.closest('[data-no-haptic]') || (t as HTMLButtonElement).disabled) return;
    haptic.tick();
  };
  document.addEventListener('pointerdown', on, { passive: true });
  return () => document.removeEventListener('pointerdown', on);
};
