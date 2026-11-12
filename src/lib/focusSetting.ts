/**
 * Takes the person to one exact setting: opens the Settings group that holds it, scrolls it to the middle of the screen and makes it
 * glow with a short hint, so they can see where they were sent. Settings may not be on screen yet when this is called, so it keeps
 * asking the group to open until the setting appears.
 */
const HIGHLIGHT_MS = 4200;

export const focusSetting = (group: string, setting: string): void => {
  if (typeof window === 'undefined') return;
  const started = Date.now();
  let opened = 0;
  const tick = () => {
    const el = document.querySelector<HTMLElement>(`[data-setting="${setting}"]`);
    if (el) {
      // The group may have just opened and still be growing, so wait a moment before scrolling.
      window.setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('setting-highlight');
        window.setTimeout(() => el.classList.remove('setting-highlight'), HIGHLIGHT_MS);
      }, 320);
      return;
    }
    if (Date.now() - started > 3000) return;
    // Every few ticks, ask the group to open (it ignores the request once open, and Settings may not exist yet).
    if (opened++ % 3 === 0) window.dispatchEvent(new CustomEvent('kyfit-open-settings-group', { detail: group }));
    window.setTimeout(tick, 100);
  };
  tick();
};
