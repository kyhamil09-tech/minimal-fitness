import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

/**
 * Sends some text through Android's share sheet (so the person picks the app and the people), or the browser's, or copies it as a last
 * resort. Resolves with what happened so the screen can say so. Nothing is sent anywhere by the app itself.
 */
export const shareText = async (title: string, text: string): Promise<'shared' | 'copied' | 'failed'> => {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title, text, dialogTitle: title });
      return 'shared';
    }
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
    if (nav.share) {
      await nav.share({ title, text });
      return 'shared';
    }
  } catch (e) {
    // Closing the share sheet without choosing is not a failure worth reporting.
    if (e instanceof Error && /cancel|abort/i.test(e.message + e.name)) return 'shared';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
};
