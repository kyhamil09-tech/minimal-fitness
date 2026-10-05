import { Launch, isAndroidApp } from './native';

/**
 * Keeps --sys-gesture-bottom up to date: how tall Android's bottom gesture zone is. The tab bar pads itself by this so the white
 * gesture pill never sits over a tab button (on phones that use gesture navigation the pill swallows taps near the bottom edge).
 * Returns a function that stops the updates.
 */
export const watchSystemInsets = (): (() => void) => {
  if (!isAndroidApp()) return () => undefined;
  let last = -1;
  const apply = async () => {
    try {
      const { bottom } = await Launch.getSystemInsets();
      const px = Math.max(0, Math.min(64, Math.round(bottom)));
      if (px === last) return;
      last = px;
      document.documentElement.style.setProperty('--sys-gesture-bottom', `${px}px`);
    } catch {
      // older build without the method: the page keeps its default padding
    }
  };
  void apply();
  // Insets can arrive a moment after launch, and change on rotation or when the navigation mode is switched.
  const timers = [400, 1500].map((ms) => window.setTimeout(apply, ms));
  const onChange = () => void apply();
  window.addEventListener('resize', onChange);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    timers.forEach((t) => window.clearTimeout(t));
    window.removeEventListener('resize', onChange);
    document.removeEventListener('visibilitychange', onChange);
  };
};
