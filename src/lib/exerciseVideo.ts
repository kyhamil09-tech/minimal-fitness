import { OpenUrl, isAndroidApp } from './native';

const STORE = 'kyfit_exercise_video';

/** A YouTube search for how to do an exercise. The name is the only thing in the address, and it is only sent when the person taps the button. */
export const searchUrl = (name: string): string => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise form`.trim())}`;

/** An address a person saved: only https, no spaces, no sign-in details inside it. Returns the tidy address or null. */
export const cleanLink = (text: string): string | null => {
  const t = text.trim();
  if (!t || t.length > 300 || /\s/.test(t)) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
};

const read = (): Record<string, string> => {
  try {
    const j = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
};

export const savedLink = (exerciseId: string): string => read()[exerciseId] ?? '';

/** Saves (or, with an empty text, removes) the link for an exercise. Returns false when the text is not a usable link. */
export const saveLink = (exerciseId: string, text: string): boolean => {
  const all = read();
  if (!text.trim()) delete all[exerciseId];
  else {
    const link = cleanLink(text);
    if (!link) return false;
    all[exerciseId] = link;
  }
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    return false;
  }
  return true;
};

/** Opens a page over the app (an Android Custom Tab, so Back returns to the workout), or in a new tab on the web. */
export const openOverlay = async (url: string): Promise<void> => {
  if (isAndroidApp()) {
    try {
      await OpenUrl.open({ url });
      return;
    } catch {
      // fall through
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
};
