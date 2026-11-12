import { registerPlugin } from '@capacitor/core';
import { isAndroidApp } from './native';
import { WatchLook } from './appearance';
import { readableOn } from './colorMath';

/**
 * Sends the colors you chose (palette and background) to the watch so the watch app, tile and workout screens match the phone.
 * It goes over the Bluetooth link to your own watch; nothing uses the internet. A watch screen is always dark, so a pastel background
 * is sent as its dark tone. See LookPlugin.java.
 */
const Native = registerPlugin<{ send(o: Record<string, string>): Promise<void> }>('Look');

let lastSent = '';

export const sendWatchLook = async (look: WatchLook): Promise<void> => {
  if (!isAndroidApp()) return;
  const payload: Record<string, string> = { ...look, onAccent: readableOn(look.accent, '#14130F', '#F6F1E7') };
  const key = JSON.stringify(payload);
  // The watch only needs it when it changes; the phone re-sends when the app starts in case the watch was off.
  if (key === lastSent) return;
  lastSent = key;
  try {
    await Native.send(payload);
  } catch {
    lastSent = '';
  }
};
